// Serveur de test local : sert la page, le faux agenda et les deux fonctions.
// Lancer : RDV_MODE_TEST=1 node test/serveur-local.mjs   puis ouvrir http://localhost:8888
import http from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const racine = fileURLToPath(new URL("..", import.meta.url));
const port = Number(process.env.PORT || 8888);
process.env.RDV_MODE_TEST ??= "1";
process.env.AGENDA_ICS_URL ??= `http://localhost:${port}/test/agenda.ics`;
process.env.AGENDA_EMAIL ??= "violette@purplelab.fr";
process.env.RDV_DOSSIER_MAILS ??= join(racine, "test", "mails-test");

const creneaux = (await import("../netlify/functions/creneaux.mjs")).default;
const reserver = (await import("../netlify/functions/reserver.mjs")).default;
const clientDispos = (await import("../netlify/functions/client-dispos.mjs")).default;
const clientReserver = (await import("../netlify/functions/client-reserver.mjs")).default;
const routes = { "/api/creneaux": creneaux, "/api/reserver": reserver, "/api/client/dispos": clientDispos, "/api/client/reserver": clientReserver };
const types = { ".html": "text/html; charset=utf-8", ".svg": "image/svg+xml", ".woff": "font/woff", ".ics": "text/calendar; charset=utf-8" };

http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${port}`);
  try {
    if (url.pathname.startsWith("/api/")) {
      const corps = req.method === "POST" ? await new Promise((r) => { let b = ""; req.on("data", (c) => (b += c)); req.on("end", () => r(b)); }) : undefined;
      const requete = new Request(url, { method: req.method, headers: req.headers, body: corps });
      const f = routes[url.pathname];
      if (!f) { res.writeHead(404); return res.end(); }
      const r = await f(requete);
      res.writeHead(r.status, Object.fromEntries(r.headers));
      return res.end(await r.text());
    }
    const fichier = url.pathname === "/test/agenda.ics"
      ? join(racine, "test", "agenda-test.ics")
      : (url.pathname.startsWith("/c/") || url.pathname.startsWith("/rdvclient"))
      ? join(racine, "public", "client.html")
      : join(racine, "public", normalize(url.pathname === "/" ? "/index.html" : url.pathname).replace(/^(\.\.[/\\])+/, ""));
    const contenu = await readFile(fichier);
    res.writeHead(200, { "content-type": types[extname(fichier)] || "application/octet-stream" });
    res.end(contenu);
  } catch (e) {
    res.writeHead(404); res.end("introuvable");
  }
}).listen(port, () => console.log(`Prise de rendez-vous : http://localhost:${port}\nPage client de démonstration : http://localhost:${port}/c/demo-enquete-sur-site-2026`));
