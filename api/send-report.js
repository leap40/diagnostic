import { Resend } from "resend";
import puppeteer from "puppeteer-core";
import chromium from "@sparticuz/chromium";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { email, name, scores, global100, profileName } = req.body || {};

    if (!email || typeof email !== "string") {
      return res.status(400).json({ error: "Email manquant" });
    }

    // 1) Génère un HTML simple (à upgrader ensuite en rapport premium)
    const html = `
      <!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <style>
            body{ font-family: Arial, sans-serif; padding: 28px; }
            h1{ color:#110654; margin:0 0 10px; }
            .badge{ display:inline-block; padding:6px 10px; border-radius:999px; background:#7301e9; color:#fff; font-weight:700; }
            table{ width:100%; border-collapse:collapse; margin-top:14px; }
            td{ border-bottom:1px solid #eee; padding:10px 8px; }
          </style>
        </head>
        <body>
          <h1>Diagnostic Marketing</h1>
          <p>${name ? `Nom / Entreprise : <b>${escapeHtml(name)}</b><br/>` : ""}</p>
          <p>Score global : <b>${escapeHtml(String(global100 ?? ""))}/100</b></p>
          <p class="badge">Profil : ${escapeHtml(profileName || "")}</p>

          <h2>Scores par pilier</h2>
          <table>
            ${scores ? Object.entries(scores).map(([k,v]) =>
              `<tr><td>${escapeHtml(k)}</td><td><b>${escapeHtml(String(v))}/10</b></td></tr>`
            ).join("") : ""}
          </table>
        </body>
      </html>
    `;

    // 2) HTML -> PDF (Puppeteer sur Vercel)
    const browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
    });

    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });
    const pdfBuffer = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "12mm", right: "12mm", bottom: "12mm", left: "12mm" },
    });
    await browser.close();

    // 3) Envoi email via Resend
    const resend = new Resend(process.env.RESEND_API_KEY);

    await resend.emails.send({
      from: process.env.MAIL_FROM, // ex: "Propulse <noreply@tondomaine.com>"
      to: email,
      subject: "Votre Diagnostic Marketing – Rapport PDF",
      html: `
        <div style="font-family:Arial,sans-serif;line-height:1.4;">
          <p>Bonjour${name ? " " + escapeHtml(name) : ""},</p>
          <p>Votre rapport PDF est en pièce jointe.</p>
          <p><b>Profil :</b> ${escapeHtml(profileName || "")}</p>
          <p>À bientôt,</p>
          <p><b>Propulse</b></p>
        </div>
      `,
      attachments: [
        {
          filename: "rapport_diagnostic_marketing.pdf",
          content: pdfBuffer.toString("base64"),
        },
      ],
    });

    return res.status(200).json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: "Erreur serveur" });
  }
}

function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, (m) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  }[m]));
}