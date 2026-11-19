// Envoi des e-mails (partagé par la page publique et les pages clients).
import nodemailer from "nodemailer";
import { env, modeTest } from "./agenda.mjs";

export const html = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

export const ligne = (k, v) => (v ? `<tr><td style="padding:4px 16px 4px 0;color:#6b6778;vertical-align:top">${k}</td><td style="padding:4px 0">${html(v)}</td></tr>` : "");

export const gabarit = (titre, intro, lignes, tag = "Rendez-vous confirmé") => `<!doctype html><html><body style="margin:0;background:#F2F2F2;font-family:Inter,Arial,sans-serif;color:#2F2B3A">
<div style="max-width:560px;margin:0 auto;padding:32px 24px">
<div style="background:#fff;border-radius:8px;padding:32px">
<div style="display:inline-block;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#7C4DE3;border:1px solid #CEB6FE;border-radius:99px;padding:4px 10px">${tag}</div>
<h1 style="font-size:22px;font-weight:500;margin:16px 0 8px">${titre}</h1>
<div style="font-size:14px;line-height:1.6;margin:0 0 20px">${intro}</div>
<table style="font-size:14px;border-collapse:collapse">${lignes}</table>
</div>
<p style="font-size:12px;color:#6b6778;margin:16px 4px">Purple Lab · purplelab.fr</p>
</div></body></html>`;

export async function transporteur() {
  if (modeTest() && !env("SMTP_HOST")) {
    // En test local : les mails sont écrits en fichiers .eml au lieu d'être envoyés.
    const fs = await import("node:fs/promises");
    const dossier = env("RDV_DOSSIER_MAILS") || "./mails-test";
    await fs.mkdir(dossier, { recursive: true });
    const t = nodemailer.createTransport({ streamTransport: true, buffer: true, newline: "unix" });
    let n = 0;
    return {
      envoyer: async (m) => {
        const info = await t.sendMail(m);
        await fs.writeFile(`${dossier}/${Date.now()}-${++n}.eml`, info.message);
      },
    };
  }
  if (!env("SMTP_HOST")) throw new Error("SMTP_HOST n'est pas renseigné");
  const port = Number(env("SMTP_PORT") || 465);
  const t = nodemailer.createTransport({
    host: env("SMTP_HOST"),
    port,
    secure: port === 465,
    auth: { user: env("SMTP_USER"), pass: env("SMTP_PASS") },
  });
  return { envoyer: (m) => t.sendMail(m) };
}
