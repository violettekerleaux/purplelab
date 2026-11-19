// GET /api/client/dispos (en-tête x-cle) : grille libre / pris pour un client.
// Clé inconnue = 404, sans dire pourquoi.
import { reponse } from "../../lib/agenda.mjs";
import { trouverClient, grilleDuClient, profilPublic } from "../../lib/client.mjs";

const prive = { "cache-control": "no-store", "x-robots-tag": "noindex, nofollow" };

export default async (req) => {
  const client = trouverClient(req.headers.get("x-cle"));
  if (!client) return reponse({ erreur: "Lien invalide ou expiré." }, 404, prive);
  try {
    const jours = await grilleDuClient(client);
    return reponse({ client: profilPublic(client), jours }, 200, prive);
  } catch (e) {
    console.error("client-dispos", e);
    return reponse({ erreur: "Impossible de lire l'agenda pour le moment." }, 503, prive);
  }
};

export const config = { path: "/api/client/dispos" };
