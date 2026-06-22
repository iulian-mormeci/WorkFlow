import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { logSecurityEvent } from "@/lib/security/security-log";
import Anthropic from "@anthropic-ai/sdk";
import type { DocumentBlockParam, TextBlockParam } from "@anthropic-ai/sdk/resources/messages/messages";
import { writeFile, unlink } from "fs/promises";
import { join } from "path";
import { randomBytes } from "crypto";

const MAX_PDF_BYTES = 10 * 1_048_576;
const AI_TIMEOUT_MS = 60_000;

const EXTRACTION_PROMPT = `Analizza questo menu PDF e restituisci SOLO un array JSON valido (nessun testo aggiuntivo prima o dopo il JSON).

Ogni elemento dell'array rappresenta una voce ordinabile del menu e deve avere esattamente questi campi:
- "prodotto": nome del piatto/voce esattamente come scritto nel menu (stringa)
- "descrizione_lunga": descrizione con ingredienti se presente nel menu, altrimenti stringa vuota ""
- "gruppo": titolo della sezione principale riconosciuta nel menu (es. "Pizze", "Antipasti", "Carta Vini", "Bevande") — ricavato dalla struttura visiva del PDF
- "reparto": titolo della sotto-sezione se presente (es. "Vini Bianchi", "Vini Rossi", "Bollicine"); se non ci sono sottosezioni usa lo stesso valore di "gruppo"
- "prezzi": array di numeri con il/i prezzo/i. Un solo elemento se il menu ha un prezzo unico per la voce; più elementi se il menu mostra esplicitamente più prezzi per la stessa voce (es. calice/bottiglia, piccola/media/grande), massimo 5. Usa "." come separatore decimale.

REGOLE FONDAMENTALI:
1. NON includere titoli di sezione, intestazioni, sottotitoli o descrittori generici come voci — solo prodotti con prezzo
2. Riconosci la gerarchia visiva: i titoli di sezione nel PDF definiscono "gruppo", i sottotitoli definiscono "reparto"
3. Se il menu ha una sola sezione senza sottosezioni, "gruppo" e "reparto" sono identici
4. I prezzi devono essere numeri puri (es. 8.50, non "8,50 €" o "8.50€")
5. Se una voce non ha prezzo leggibile, omettila dall'array

Restituisci SOLO l'array JSON, senza markdown, senza commenti, senza testo introduttivo.`;

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
  // Prevent CSV injection: prefix dangerous leading characters
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

  const {
    data: { user }
  } = await supabase.auth.getUser();
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

    const base64 = bytes.toString("base64");
    const anthropic = new Anthropic({ apiKey });

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);

    let aiText: string;
    try {
      const docBlock: DocumentBlockParam = {
        type: "document",
        source: { type: "base64", media_type: "application/pdf", data: base64 }
      };
      const textBlock: TextBlockParam = { type: "text", text: EXTRACTION_PROMPT };

      const response = await anthropic.messages.create(
        {
          model: "claude-sonnet-4-6",
          max_tokens: 8096,
          messages: [{ role: "user", content: [docBlock, textBlock] }]
        },
        { signal: controller.signal as AbortSignal }
      );
      const block = response.content[0];
      aiText = block.type === "text" ? block.text : "";
    } catch (e: unknown) {
      if (e instanceof Error && (e.name === "AbortError" || e.message.includes("abort"))) {
        logSecurityEvent({ event: "menu_to_csv_timeout", userId: user.id });
        return NextResponse.json({ error: "Timeout: elaborazione AI troppo lunga (>60s)" }, { status: 504 });
      }
      logSecurityEvent({ event: "menu_to_csv_ai_error", userId: user.id, message: String(e) });
      return NextResponse.json({ error: "Errore durante l'elaborazione AI" }, { status: 502 });
    } finally {
      clearTimeout(timeoutId);
    }

    // Extract JSON array from AI response
    let rawItems: unknown[];
    try {
      const jsonMatch = aiText.match(/\[[\s\S]*\]/);
      if (!jsonMatch) throw new Error("no JSON array");
      const parsed: unknown = JSON.parse(jsonMatch[0]);
      if (!Array.isArray(parsed)) throw new Error("not array");
      rawItems = parsed;
    } catch {
      logSecurityEvent({ event: "menu_to_csv_parse_error", userId: user.id });
      return NextResponse.json({ error: "L'AI non ha restituito dati strutturati validi. Riprova." }, { status: 502 });
    }

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
        if (n === null) {
          badPrice = true;
          break;
        }
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
