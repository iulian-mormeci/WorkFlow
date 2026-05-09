import { NextResponse } from "next/server";
import { Resend } from "resend";

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
  const title = String(form.get("title") ?? "WorkFlow Document");
  const note = String(form.get("note") ?? "").trim();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return new NextResponse("Missing file", { status: 400 });
  }
  if (!to || !to.includes("@")) {
    return new NextResponse("Missing or invalid recipient email", { status: 400 });
  }

  const bytes = Buffer.from(await file.arrayBuffer());

  const resend = new Resend(apiKey);
  await resend.emails.send({
    from,
    to,
    subject: `[WorkFlow] ${title}`,
    text: `WorkFlow document attached.\n\nTitle: ${title}\nFilename: ${file.name}\n${note ? `\nNote:\n${note}\n` : ""}`,
    attachments: [
      {
        filename: file.name,
        content: bytes.toString("base64")
      }
    ]
  });

  return NextResponse.json({ ok: true });
}

