import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type MenuItem = {
  description: string;
  descrizione_lunga: string;
  gruppo: string;
  reparto: string;
  prezzi: number[];
};

type GenerateBody = {
  items: MenuItem[];
  settings?: {
    pluStart?: number;
    duplicateDesc?: boolean;
    separator?: string;
    encoding?: "utf8bom" | "utf8";
  };
};

// Exact column order required by the cash register
const COLUMNS = [
  "#PLU",
  "GROUP",
  "DEPT",
  "DESCRIPTION",
  "LONG_DESCRIPTION",
  "KP_PLU_NOTES",
  "PRICE_1",
  "PRICE_2",
  "PRICE_3",
  "PRICE_4",
  "PRICE_5",
  "PRICE_6",
  "BARCODE",
  "PREFERED",
  "ON_TDE"
];

function csvField(v: string, sep: string): string {
  const s = String(v ?? "").trim();
  if (s.includes(sep) || s.includes('"') || s.includes("\n") || s.includes("\r")) {
    return `"${s.replaceAll('"', '""')}"`;
  }
  return s;
}

export async function POST(req: Request) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: "unavailable" }, { status: 503 });

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: GenerateBody;
  try {
    body = (await req.json()) as GenerateBody;
  } catch {
    return NextResponse.json({ error: "Corpo richiesta non valido" }, { status: 400 });
  }

  if (!Array.isArray(body.items)) {
    return NextResponse.json({ error: "items mancanti" }, { status: 400 });
  }

  const pluStart = typeof body.settings?.pluStart === "number" ? body.settings.pluStart : 1;
  const duplicateDesc = body.settings?.duplicateDesc === true;
  const sep = typeof body.settings?.separator === "string" && body.settings.separator.length > 0
    ? body.settings.separator : ";";
  const useBom = body.settings?.encoding !== "utf8";

  const lines: string[] = [COLUMNS.join(sep)];

  let plu = pluStart;
  for (const item of body.items) {
    const longDesc = duplicateDesc && !item.descrizione_lunga.trim()
      ? item.description
      : item.descrizione_lunga;

    // PRICE_1 through PRICE_6 (6 slots) — cash register expects cents (integer)
    const prices: string[] = [];
    for (let i = 0; i < 6; i++) {
      prices.push(item.prezzi[i] !== undefined ? String(Math.round(item.prezzi[i] * 100)) : "");
    }

    const row = [
      String(plu++),           // #PLU
      csvField(item.gruppo, sep),       // GROUP
      csvField(item.reparto, sep),      // DEPT
      csvField(item.description, sep),  // DESCRIPTION (≤20 chars)
      csvField(longDesc, sep),          // LONG_DESCRIPTION
      "",                               // KP_PLU_NOTES (always empty)
      ...prices,                        // PRICE_1 … PRICE_6
      "",                               // BARCODE (always empty)
      "",                               // PREFERED (always empty)
      "1"                               // ON_TDE (always 1)
    ].join(sep);

    lines.push(row);
  }

  const csvString = lines.join("\r\n") + "\r\n";
  const csvBytes = Buffer.from(csvString, "utf8");
  const outputBytes = useBom
    ? Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), csvBytes])
    : csvBytes;

  return new NextResponse(outputBytes, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="menu-rt.csv"'
    }
  });
}
