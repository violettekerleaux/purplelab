// GET /api/creneaux : créneaux libres, groupés par jour (heure de Paris).
import { config as rdv, creneauxDisponibles, reponse } from "../../lib/agenda.mjs";

export default async () => {
  try {
    const jours = await creneauxDisponibles();
    return reponse(
      {
        fuseau: rdv.fuseau,
        dureeMinutes: rdv.dureeMinutes,
        titre: rdv.titre,
        description: rdv.description,
        lieu: rdv.lieu,
        jours,
      },
      200,
      { "cache-control": "no-store" }
    );
  } catch (e) {
    console.error("creneaux", e);
    return reponse({ erreur: "Impossible de lire l'agenda pour le moment." }, 503);
  }
};

export const config = { path: "/api/creneaux" };
