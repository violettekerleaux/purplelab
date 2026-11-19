// Crée le lien privé d'un nouveau client.
// Usage : node outils/nouveau-client.mjs "Nom du client" ["adresse du site"]
// Affiche le lien à envoyer au client et ajoute le client dans clients.json
// (avec l'empreinte de la clé seulement : la clé n'est écrite nulle part ailleurs).
import { randomBytes, createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

const [nom, adresse = ""] = process.argv.slice(2);
if (!nom) {
  console.error('Usage : node outils/nouveau-client.mjs "Nom du client" ["adresse"]');
  process.exit(1);
}
const fichier = new URL("../clients.json", import.meta.url);
const donnees = JSON.parse(readFileSync(fichier, "utf8"));
const id = nom.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
if (donnees.clients.some((c) => c.id === id)) {
  console.error(`Un client « ${id} » existe déjà dans clients.json.`);
  process.exit(1);
}
const cle = randomBytes(18).toString("base64url");
donnees.clients.push({ id, cleSha256: createHash("sha256").update(cle).digest("hex"), nom, adresse });
writeFileSync(fichier, JSON.stringify(donnees, null, 2) + "\n");
const site = process.env.RDV_SITE || "https://rdv.purplelab.fr";
console.log(`Client ajouté : ${nom}`);
console.log(`Lien privé à envoyer : ${site}/c/${cle}`);
console.log("Gardez ce lien : il n'est enregistré nulle part ailleurs.");
