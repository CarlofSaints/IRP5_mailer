# IRP5 Mailer

A bespoke mail-merge tool for distributing **IRP5 / IT3(a)** tax certificates to staff
— safely. It matches each confidential PDF to the correct person, lets you verify
every match by eye, **password-protects each PDF with the recipient's ID number**,
and emails it out.

Built for iRam HR.

## How it works

1. **Load IRP5 PDFs** (one window) and the **staff Excel sheet** (the other).
2. The app reads each PDF's form data and pulls out **ID number, name and surname**.
   SARS IRP5s are XFA (LiveCycle) forms, so the values come straight from the form's
   structured data — no fragile text-scraping.
3. It looks each **ID number** up in the Excel sheet to find the person's **email**.
4. The **matcher grid** shows, side by side, the Excel value and the PDF value for
   name / surname / ID, with a ✓ or ⚠ so you can confirm the right document is going
   to the right person. Status is **Matched** or **Not found**.
5. You can **edit any email address** inline and **include/exclude** rows.
6. Compose the email once, with `{Name}` `{Surname}` `{ID}` placeholders.
7. Hit **Send**. For each recipient the app **encrypts the PDF in your browser** with
   their ID number as the open password, then sends only the *encrypted* file.

### Privacy by design

Parsing and encryption happen **entirely in the browser**. The unencrypted IRP5s
never leave the machine. The send API only ever receives the already password-locked
PDF, which it relays via Resend.

> **Note on the password:** a SA ID number is 13 digits — fine as a "prove you're the
> right recipient" gate (the goal here), but not high-entropy security. The recipient
> opens the PDF by typing their ID number.

## Setup

```bash
npm install
cp .env.example .env.local   # then fill in the values
npm run dev
```

Environment variables (see `.env.example`):

| Variable         | What it is                                              |
| ---------------- | ------------------------------------------------------ |
| `RESEND_API_KEY` | Resend API key                                         |
| `MAIL_FROM`      | Verified sender, e.g. `"iRam HR <hr@yourdomain.co.za>"` |

You need a [Resend](https://resend.com) account with a **verified sending domain**.

## The Excel sheet

The app auto-detects columns from the header row. It looks for headers containing:

- **ID:** `ID No.`, `ID Number`, `Identity`, …
- **Email:** `Email`, `E-mail`, …
- **Surname:** `Surname`, `Last Name`, …
- **Name:** `First Two Names`, `First Name`, `Full Names`, `Name`, …

Matching is done on the **ID number** (all non-digits stripped, so spaces/formatting
don't matter). If a column can't be found, the loader warns you.

## Deploy

Deploys to Vercel as a standard Next.js app. Set `RESEND_API_KEY` and `MAIL_FROM`
in the Vercel project's environment variables.

## Tech

Next.js 16 (App Router) · TypeScript · Tailwind · `@cantoo/pdf-lib` (PDF read +
encrypt) · SheetJS (Excel) · Resend (email).
