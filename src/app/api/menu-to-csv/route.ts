import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { logSecurityEvent } from "@/lib/security/security-log";
import Anthropic from "@anthropic-ai/sdk";
import type { DocumentBlockParam, TextBlockParam } from "@anthropic-ai/sdk/resources/messages/messages";
import { writeFile, unlink } from "fs/promises";
import { join } from "path";
import { randomBytes } from "crypto";

export const maxDuration = 120;

const MAX_PDF_BYTES = 10 * 1_048_576;
// Fast path (text extracted locally → Haiku): 45s is plenty
const AI_TIMEOUT_TEXT_MS = 45_000;
// Vision path (image-based PDF → Sonnet vision): needs more time
const AI_TIMEOUT_VISION_MS = 100_000;

const EXTRACTION_PROMPT = `Hai ricevuto il testo estratto da un menu di ristorante/pizzeria. Restituisci SOLO un array JSON valido (nessun testo aggiuntivo prima o dopo).

Ogni elemento rappresenta una voce ordinabile del menu:
- "prodotto": nome del piatto esattamente come nel menu (stringa)
- "descrizione_lunga": ingredienti/descrizione se presenti, altrimenti "" (stringa)
- "gruppo": sezione principale del menu (es. "Antipasti", "Pizze", "Carta Vini", "Bevande")
- "reparto": sotto-sezione se presente (es. "Vini Bianchi"); se non c'è uguale a "gruppo"
- "prezzi": array di numeri (es. [8.50]). Più elementi solo se il menu mostra più prezzi per la stessa voce (calice/bottiglia, piccola/media/grande). Max 5. Separatore decimale: "."

REGOLE:
1. Solo prodotti con prezzo — niente titoli, intestazioni o descrittori senza prezzo
2. La gerarchia sezione/sottosezione del testo definisce gruppo/reparto
3. Prezzi come numeri puri senza simboli (8.50 non "8,50 €")
4. Voci senza prezzo leggibile: omettile

Rispondi SOLO con l'array JSON grezzo, zero testo aggiuntivo.`;

/**
 * Extracts all text from a PDF buffer using pdfjs-dist (server-side, no worker).
 * Falls back gracefully if the PDF is image-only.
 */
async function extractPdfText(buffer: Buffer): Promise<string> {
  // Dynamic import of legacy build — works in Node.js without a DOM/worker
  const pdfjsLib = await import(
    "pdfjs-dist/legacy/build/pdf.mjs" as string
  ) as typeof import("pdfjs-dist");

  // Disable web worker — not available in Node.js
  pdfjsLib.GlobalWorkerOptions.workerSrc = "";

  const uint8 = new Uint8Array(buffer);
  const loadingTask = pdfjsLib.getDocument({
    data: uint8,
    useWorkerFetch: false,
    disableFontFace: true
  });
  const pdf = await loadingTask.promise;

  const pageParts: string[] = [];
  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const content = await page.getTextContent();
    const pageText = content.items
      .filter((item) => "str" in item)
      .map((item) => (item as { str: string }).str)
      .join(" ")
      .replace(/\s{2,}/g, " ")
      .trim();
    if (pageText) pageParts.push(pageText);
  }

  return pageParts.join("\n\n");
}

/**
 * Tries several strategies to extract a JSON array from raw AI text.
 * Handles: bare array, markdown code block, object wrapper {items:[...]}.
 */
function extractJsonArray(text: string): unknown[] {
  const stripped = text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/, "")
    .trim();

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
  descrizione_lunga: string;
  gruppo: string;
  reparto: string;
  prezzi: number[];
};

export type ExtractError = {
  raw: unknown;
  reason: string;
};

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

export async function POST(req: Request) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: "unavailable" }, { status: 503 });

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "Funzionalità AI non configurata" }, { status: 503 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Richiesta non valida" }, { status: 400 });
  }

  const file = form.get("pdf");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "File PDF mancante" }, { status: 400 });
  }
  if (file.type !== "application/pdf") {
    return NextResponse.json({ error: "Il file deve essere un PDF (application/pdf)" }, { status: 400 });
  }
  if (file.size > MAX_PDF_BYTES) {
    return NextResponse.json({ error: "File troppo grande (max 10 MB)" }, { status: 400 });
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const tmpPath = join("/tmp", `menu-${randomBytes(16).toString("hex")}.pdf`);

  try {
    await writeFile(tmpPath, bytes);

    const anthropic = new Anthropic({ apiKey });

    // Step 1: try to extract text from PDF locally (fast path)
    let menuText = "";
    try {
      menuText = await extractPdfText(bytes);
    } catch (e) {
      logSecurityEvent({ event: "menu_to_csv_pdf_extract_warn", userId: user.id, message: String(e) });
    }

    const isImagePdf = menuText.trim().length < 50;

    // Step 2: call AI — fast path (text → Haiku) or vision path (image PDF → Sonnet)
    const controller = new AbortController();
    const timeoutMs = isImagePdf ? AI_TIMEOUT_VISION_MS : AI_TIMEOUT_TEXT_MS;
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    let aiText: string;
    try {
      let response;

      if (isImagePdf) {
        // Vision path: PDF is image-only (e.g. scanned without OCR layer)
        // Send the PDF as a document block directly to Sonnet
        const docBlock: DocumentBlockParam = {
          type: "document",
          source: { type: "base64", media_type: "application/pdf", data: bytes.toString("base64") }
        };
        const textBlock: TextBlockParam = { type: "text", text: EXTRACTION_PROMPT };
        response = await anthropic.messages.create(
          {
            model: "claude-sonnet-4-6",
            max_tokens: 8096,
            messages: [{ role: "user", content: [docBlock, textBlock] }]
          },
          { signal: controller.signal as AbortSignal }
        );
      } else {
        // Fast path: send extracted text to Haiku (5-15s)
        response = await anthropic.messages.create(
          {
            model: "claude-haiku-4-5-20251001",
            max_tokens: 8096,
            messages: [{
              role: "user",
              content: `${EXTRACTION_PROMPT}\n\n---TESTO DEL MENU---\n${menuText}`
            }]
          },
          { signal: controller.signal as AbortSignal }
        );
      }

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
        logSecurityEvent({ event: "menu_to_csv_timeout", userId: user.id, visionPath: isImagePdf });
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

    // Step 3: parse JSON from AI response
    let rawItems: unknown[];
    try {
      rawItems = extractJsonArray(aiText);
    } catch {
      logSecurityEvent({ event: "menu_to_csv_parse_error", userId: user.id, preview: aiText.slice(0, 300) });
      return NextResponse.json(
        { error: "L'AI non ha restituito dati strutturati validi. Riprova." },
        { status: 502 }
      );
    }

    // Step 4: validate and sanitize each item
    const items: ExtractedItem[] = [];
    const errors: ExtractError[] = [];

    for (const raw of rawItems) {
      if (!raw || typeof raw !== "object") {
        errors.push({ raw, reason: "Elemento non un oggetto" });
        continue;
      }

      const r = raw as AiRawItem;
      const prodotto = sanitizeField(String(r.prodotto ?? ""));
      if (!prodotto) {
        errors.push({ raw, reason: "Campo prodotto vuoto" });
        continue;
      }

      const prezziRaw = Array.isArray(r.prezzi) ? r.prezzi : [r.prezzi];
      const prezzi: number[] = [];
      let badPrice = false;

      for (const p of prezziRaw.slice(0, 5)) {
        const n = parsePrice(p);
        if (n === null) { badPrice = true; break; }
        prezzi.push(n);
      }

      if (badPrice || prezzi.length === 0) {
        errors.push({ raw, reason: "Prezzo non valido o mancante" });
        continue;
      }

      items.push({
        prodotto,
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
