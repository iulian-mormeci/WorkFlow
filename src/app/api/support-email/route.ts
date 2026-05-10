import { NextResponse } from "next/server";
import { Resend } from "resend";

/**
 * Accepts `multipart/form-data` from the client (PDF + metadata) and sends via Resend.
 * Requires `RESEND_API_KEY` and a verified `WORKFLOW_SUPPORT_EMAIL_FROM` domain in production.
 */
export async function POST(req: Request) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.WORKFLOW_SUPPORT_EMAIL_FROM;
  const defaultTo = process.env.WORKFLOW_SUPPORT_EMAIL_TO;

  if (!apiKey || !from) {
    return new NextResponse(
      "Missing RESEND_API_KEY or WORKFLOW_SUPPORT_EMAIL_FROM",
      { status: 500 }
    );
  }

  const form = await req.formData();
  const to = String(form.get("to") ?? defaultTo ?? "").trim();
  const title = String(form.get("title") ?? "WorkFlow Document").trim();
  const subjectRaw = String(form.get("subject") ?? "").trim();
  const message = String(form.get("message") ?? "").trim();
  const note = String(form.get("note") ?? "").trim(); // backwards compat
  const file = form.get("file");
  if (!(file instanceof File)) {
    return new NextResponse("Missing file", { status: 400 });
  }
  if (!to || !to.includes("@")) {
    return new NextResponse("Missing or invalid recipient email", { status: 400 });
  }

  const bytes = Buffer.from(await file.arrayBuffer());

  const subject = subjectRaw || `[WorkFlow] Documento - ${title || "Documento"}`;
  const body =
    [
      "WorkFlow — Documento allegato",
      "",
      `Titolo: ${title || "—"}`,
      `File: ${file.name}`,
      message ? "" : null,
      message ? "Messaggio:" : null,
      message ? message : null,
      !message && note ? "" : null,
      !message && note ? "Nota:" : null,
      !message && note ? note : null
    ]
      .filter((x) => x != null)
      .join("\n") + "\n";

  const resend = new Resend(apiKey);
  await resend.emails.send({
    from,
    to,
    subject,
    text: body,
    attachments: [
      {
        filename: file.name,
        content: bytes.toString("base64")
      }
    ]
  });

  return NextResponse.json({ ok: true });
}

