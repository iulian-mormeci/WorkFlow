import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type MenuItem = {
  prodotto: string;
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

function sanitizeCsvField(v: string, sep: string): string {
  const s = String(v ?? "").trim();
  if (s.includes(sep) || s.includes('"') || s.includes("\n") || s.includes("\r")) {
    return `"${s.replaceAll('"', '""')}"`;
  }
  return s;
}

export async function POST(req: Request) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: "unavailable" }, { status: 503 });

  const {
    data: { user }
  } = await supabase.auth.getUser();
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
    ? body.settings.separator
    : ";";
  const useBom = body.settings?.encoding !== "utf8";

  const COLUMNS = [
    "PLU",
    "GRUPPO",
    "REPARTO",
    "PRODOTTO",
    "DESCRIZIONE LUNGA",
    "PREZZO 1",
    "PREZZO 2",
    "PREZZO 3",
    "PREZZO 4",
    "PREZZO 5",
    "ON TDE"
  ];

  const lines: string[] = [COLUMNS.join(sep)];

  let plu = pluStart;
  for (const item of body.items) {
    const descLunga = duplicateDesc && !item.descrizione_lunga.trim()
      ? item.prodotto
      : item.descrizione_lunga;

    const priceFields: string[] = [];
    for (let i = 0; i < 5; i++) {
      priceFields.push(item.prezzi[i] !== undefined ? String(item.prezzi[i]) : "");
    }

    const row = [
      String(plu++),
      sanitizeCsvField(item.gruppo, sep),
      sanitizeCsvField(item.reparto, sep),
      sanitizeCsvField(item.prodotto, sep),
      sanitizeCsvField(descLunga, sep),
      ...priceFields,
      "1"
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
