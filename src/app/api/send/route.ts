// Server-side send endpoint. Receives an ALREADY-ENCRYPTED PDF (base64) plus
// the composed email, and relays via Resend. The unencrypted IRP5 never
// reaches this route.
import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";

export const runtime = "nodejs";

interface SendBody {
  to: string;
  subject: string;
  html: string;
  text: string;
  filename: string;
  attachmentBase64: string;
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.MAIL_FROM;
  if (!apiKey || !from) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Server not configured: set RESEND_API_KEY and MAIL_FROM in the environment.",
      },
      { status: 500 },
    );
  }

  let body: SendBody;
  try {
    body = (await req.json()) as SendBody;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  const { to, subject, html, text, filename, attachmentBase64 } = body;
  if (!to || !subject || !attachmentBase64) {
    return NextResponse.json(
      { ok: false, error: "Missing required fields (to, subject, attachment)." },
      { status: 400 },
    );
  }

  const resend = new Resend(apiKey);
  try {
    const { data, error } = await resend.emails.send({
      from,
      to,
      subject,
      html,
      text,
      attachments: [{ filename, content: attachmentBase64 }],
    });
    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 502 });
    }
    return NextResponse.json({ ok: true, id: data?.id });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown send error.";
    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  }
}
