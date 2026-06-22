import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { logSecurityEvent } from "@/lib/security/security-log";
import Anthropic from "@anthropic-ai/sdk";
import type {
  TextBlockParam,
  DocumentBlockParam,
  CacheControlEphemeral
} from "@anthropic-ai/sdk/resources/messages/messages";
import { writeFile, unlink } from "fs/promises";
import { join } from "path";
import { randomBytes } from "crypto";

export const maxDuration = 120;

const MAX_PDF_BYTES = 10 * 1_048_576;
const AI_TIMEOUT_TEXT_MS = 45_000;
const AI_TIMEOUT_VISION_MS = 100_000;
// A PDF is considered "textual" if pdfjs extracts at least this many chars
const TEXT_PATH_MIN_CHARS = 150;

// ─── Cached system prompt ─────────────────────────────────────────────────────
// Marked ephemeral so Anthropic caches it for 5 min — subsequent calls within
// the window pay only cache_read price (~10× cheaper than full input tokens).
const CACHE_CONTROL: CacheControlEphemeral = { type: "ephemeral" };

const SYSTEM_BLOCK: TextBlockParam = {
  type: "text",
  text: `Sei un estrattore di menu per registratori di cassa italiani.
Riceverai il testo oppure il PDF di un menu ristorante.
Devi estrarre TUTTE le voci e restituire SOLO un array JSON valido, senza testo aggiuntivo, senza backtick markdown, senza spiegazioni prima o dopo.

Struttura JSON per ogni voce:
{
  "prodotto": "nome breve esatto come scritto nel menu",
  "descrizione_lunga": "descrizione ingredienti se presente nel menu, altrimenti stringa vuota",
  "gruppo": "titolo della sezione principale (es. Antipasti, Carta Vini, Pizze, Secondi)",
  "reparto": "titolo della sotto-sezione se presente (es. Vini Rossi, Pizze Bianche), altrimenti uguale a gruppo",
  "prezzi": [12.50]
}

Regole da seguire sempre:
- GRUPPO e REPARTO sono stringhe testuali, non numeri
- Riconosci la gerarchia dal layout: titoli grandi/in maiuscolo = gruppo, sottotitoli = reparto
- Se non esistono sotto-sezioni, reparto deve essere identico a gruppo
- prezzi: array di numeri con punto come separatore decimale (mai virgola), normalmente un solo elemento; aggiungi elementi solo se il menu mostra esplicitamente più varianti di prezzo per la stessa voce (es. calice 4.50 / bottiglia 18.00)
- Non includere mai titoli di sezione, intestazioni, note, avvisi o testo descrittivo come voci prodotto
- Non inventare voci non presenti nel menu
- Restituisci ESCLUSIVAMENTE l'array JSON, nient'altro`,
  cache_control: CACHE_CONTROL
};

// ─── PDF text extraction ──────────────────────────────────────────────────────

async function extractPdfText(buffer: Buffer): Promise<string> {
  const pdfjsLib = await import(
    "pdfjs-dist/legacy/build/pdf.mjs" as string
  ) as typeof import("pdfjs-dist");
  pdfjsLib.GlobalWorkerOptions.workerSrc = "";

  const uint8 = new Uint8Array(buffer);
  const pdf = await pdfjsLib.getDocument({ data: uint8, useWorkerFetch: false, disableFontFace: true }).promise;

  const parts: string[] = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    const text = content.items
      .filter((item) => "str" in item)
      .map((item) => (item as { str: string }).str)
      .join(" ")
      .replace(/\s{2,}/g, " ")
      .trim();
    if (text) parts.push(text);
  }
  return parts.join("\n\n");
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function dynamicMaxTokens(textLen: number, isImagePdf: boolean): number {
  if (isImagePdf) return 4000;
  if (textLen < 1000) return 1500;
  if (textLen < 3000) return 3000;
  return 4000;
}

function extractJsonArray(text: string): unknown[] {
  const stripped = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
  if (stripped.startsWith("[")) {
    const parsed: unknown = JSON.parse(stripped);
    if (Array.isArray(parsed)) return parsed;
  }
  const arrMatch = text.match(/\[[\s\S]*\]/);
  if (arrMatch) {
    const parsed: unknown = JSON.parse(arrMatch[0]);
    if (Array.isArray(parsed)) return parsed;
  }
  const objMatch = text.match(/\{[\s\S]*\}/);
  if (objMatch) {
    const obj = JSON.parse(objMatch[0]) as Record<string, unknown>;
    for (const key of ["items", "voci", "menu", "prodotti", "data", "results"]) {
      if (Array.isArray(obj[key])) return obj[key] as unknown[];
    }
    const arrayVal = Object.values(obj).find(Array.isArray);
    if (arrayVal) return arrayVal as unknown[];
  }
  throw new Error("no extractable JSON array");
}

type AiRawItem = {
  prodotto: unknown;
  descrizione_lunga: unknown;
  gruppo: unknown;
  reparto: unknown;
  prezzi: unknown;
};

export type ExtractedItem = {
  prodotto: string;
  description: string;
  descrizione_lunga: string;
  gruppo: string;
  reparto: string;
  prezzi: number[];
};

export type ExtractError = { raw: unknown; reason: string };

const FILLER_WORDS = /\b(di|del|della|dei|degli|delle|al|alla|allo|agli|alle|con|e|in|a|da|su|lo|la|le|il|i|un|una|all'|dall'|nell'|sull')\b/gi;

function smartAbbreviate(name: string, maxLen = 20): string {
  if (name.length <= maxLen) return name;
  const shorter = name.replace(FILLER_WORDS, "").replace(/\s+/g, " ").trim();
  if (shorter.length <= maxLen) return shorter;
  const cut = shorter.slice(0, maxLen);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > 3 ? cut.slice(0, lastSpace) : cut).trim();
}

function sanitizeField(v: string): string {
  const trimmed = v.trim();
  if (/^[=+\-@\t\r]/.test(trimmed)) return `'${trimmed}`;
  return trimmed;
}

function parsePrice(raw: unknown): number | null {
  if (typeof raw === "number") return isFinite(raw) ? raw : null;
  if (typeof raw === "string") {
    const n = parseFloat(raw.replace(",", "."));
    return isFinite(n) ? n : null;
  }
  return null;
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: "unavailable" }, { status: 503 });

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "Funzionalità AI non configurata" }, { status: 503 });

  let form: FormData;
  try { form = await req.formData(); }
  catch { return NextResponse.json({ error: "Richiesta non valida" }, { status: 400 }); }

  const file = form.get("pdf");
  if (!(file instanceof File)) return NextResponse.json({ error: "File PDF mancante" }, { status: 400 });
  if (file.type !== "application/pdf") return NextResponse.json({ error: "Il file deve essere un PDF" }, { status: 400 });
  if (file.size > MAX_PDF_BYTES) return NextResponse.json({ error: "File troppo grande (max 10 MB)" }, { status: 400 });

  const bytes = Buffer.from(await file.arrayBuffer());
  const tmpPath = join("/tmp", `menu-${randomBytes(16).toString("hex")}.pdf`);

  try {
    await writeFile(tmpPath, bytes);

    // ── Step 1: try text extraction (fast & cheap) ─────────────────────────
    let menuText = "";
    try { menuText = await extractPdfText(bytes); }
    catch (e) { logSecurityEvent({ event: "menu_to_csv_pdf_extract_warn", userId: user.id, message: String(e) }); }

    const isImagePdf = menuText.trim().length < TEXT_PATH_MIN_CHARS;

    logSecurityEvent({ event: "menu_to_csv_path", userId: user.id, path: isImagePdf ? "pdf" : "text", textLen: menuText.length });

    // ── Step 2: build AI message content ──────────────────────────────────
    const maxTokens = dynamicMaxTokens(menuText.length, isImagePdf);

    let messageContent: (TextBlockParam | DocumentBlockParam)[];
    if (isImagePdf) {
      const docBlock: DocumentBlockParam = {
        type: "document",
        source: { type: "base64", media_type: "application/pdf", data: bytes.toString("base64") }
      };
      const promptBlock: TextBlockParam = { type: "text", text: "Estrai tutte le voci del menu." };
      messageContent = [docBlock, promptBlock];
    } else {
      messageContent = [{
        type: "text",
        text: `Testo del menu estratto dal PDF:\n\n${menuText}\n\nEstrai tutte le voci.`
      }];
    }

    // ── Step 3: call Anthropic with cached system prompt ──────────────────
    const anthropic = new Anthropic({ apiKey });
    const timeoutMs = isImagePdf ? AI_TIMEOUT_VISION_MS : AI_TIMEOUT_TEXT_MS;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    let aiText: string;
    try {
      const response = await anthropic.messages.create(
        {
          model: "claude-sonnet-4-6",
          max_tokens: maxTokens,
          system: [SYSTEM_BLOCK],
          messages: [{ role: "user", content: messageContent }]
        },
        { signal: controller.signal as AbortSignal }
      );

      // ── Optimization 4: log token usage ───────────────────────────────
      const u = response.usage;
      console.log(
        `[menu-to-csv] path=${isImagePdf ? "pdf" : "text"} | input_tokens=${u.input_tokens} | output_tokens=${u.output_tokens} | cache_creation=${u.cache_creation_input_tokens ?? 0} | cache_read=${u.cache_read_input_tokens ?? 0} | max_tokens_used=${maxTokens}`
      );

      if (response.stop_reason === "max_tokens") {
        return NextResponse.json(
          { error: "Il menu è troppo lungo. Prova a dividere il PDF in sezioni più piccole." },
          { status: 422 }
        );
      }

      aiText = response.content
        .filter((b) => b.type === "text")
        .map((b) => (b as { type: "text"; text: string }).text)
        .join("");
    } catch (e: unknown) {
      if (e instanceof Error && (e.name === "AbortError" || e.message.includes("abort"))) {
        logSecurityEvent({ event: "menu_to_csv_timeout", userId: user.id, path: isImagePdf ? "pdf" : "text" });
        const hint = isImagePdf
          ? "Il PDF è composto da immagini e richiede più tempo. Riprova o usa un PDF con testo selezionabile."
          : "Timeout AI. Riprova.";
        return NextResponse.json({ error: hint }, { status: 504 });
      }
      logSecurityEvent({ event: "menu_to_csv_ai_error", userId: user.id, message: String(e) });
      return NextResponse.json({ error: "Errore durante l'elaborazione AI" }, { status: 502 });
    } finally {
      clearTimeout(timeoutId);
    }

    // ── Step 4: parse JSON ────────────────────────────────────────────────
    let rawItems: unknown[];
    try {
      rawItems = extractJsonArray(aiText);
    } catch {
      logSecurityEvent({ event: "menu_to_csv_parse_error", userId: user.id, preview: aiText.slice(0, 300) });
      return NextResponse.json({ error: "L'AI non ha restituito dati strutturati validi. Riprova." }, { status: 502 });
    }

    // ── Step 5: validate & sanitize ───────────────────────────────────────
    const items: ExtractedItem[] = [];
    const errors: ExtractError[] = [];

    for (const raw of rawItems) {
      if (!raw || typeof raw !== "object") { errors.push({ raw, reason: "Elemento non un oggetto" }); continue; }
      const r = raw as AiRawItem;
      const prodotto = sanitizeField(String(r.prodotto ?? ""));
      if (!prodotto) { errors.push({ raw, reason: "Campo prodotto vuoto" }); continue; }

      const prezziRaw = Array.isArray(r.prezzi) ? r.prezzi : [r.prezzi];
      const prezzi: number[] = [];
      let badPrice = false;
      for (const p of prezziRaw.slice(0, 6)) {
        const n = parsePrice(p);
        if (n === null) { badPrice = true; break; }
        prezzi.push(n);
      }
      if (badPrice || prezzi.length === 0) { errors.push({ raw, reason: "Prezzo non valido o mancante" }); continue; }

      items.push({
        prodotto,
        description: smartAbbreviate(prodotto),
        descrizione_lunga: sanitizeField(String(r.descrizione_lunga ?? "")),
        gruppo: sanitizeField(String(r.gruppo ?? prodotto)),
        reparto: sanitizeField(String(r.reparto ?? r.gruppo ?? prodotto)),
        prezzi
      });
    }

    return NextResponse.json({ items, errors });
  } finally {
    await unlink(tmpPath).catch(() => {});
  }
}
