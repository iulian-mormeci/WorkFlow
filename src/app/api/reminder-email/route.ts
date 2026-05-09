import { NextResponse } from "next/server";
import { Resend } from "resend";

export async function POST(req: Request) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.WORKFLOW_SUPPORT_EMAIL_FROM ?? process.env.WORKFLOW_REMINDER_EMAIL_FROM;

  if (!apiKey || !from) {
    return NextResponse.json(
      { ok: false, error: "Missing RESEND_API_KEY or WORKFLOW_REMINDER_EMAIL_FROM" },
      { status: 500 }
    );
  }

  const body = (await req.json()) as {
    to?: string;
    subject?: string;
    text?: string;
  };
  const to = String(body.to ?? "").trim();
  const subject = String(body.subject ?? "WorkFlow reminder").trim();
  const text = String(body.text ?? "").trim();
  if (!to || !to.includes("@")) {
    return NextResponse.json({ ok: false, error: "Invalid recipient" }, { status: 400 });
  }

  const resend = new Resend(apiKey);
  await resend.emails.send({
    from,
    to,
    subject,
    text: text || "(no body)"
  });

  return NextResponse.json({ ok: true });
}
