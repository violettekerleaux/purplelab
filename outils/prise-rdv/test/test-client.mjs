// Tests des pages privées clients (aucun accès réseau).
process.env.RDV_MODE_TEST = "1";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { lireIcs } from "../lib/agenda.mjs";
import { trouverClient, grilleClient, enBlocs, empreinte, profilPublic } from "../lib/client.mjs";

const maintenant = new Date("2026-11-19T14:00:00Z"); // jeudi après-midi
const texte = readFileSync(new URL("./agenda-test.ics", import.meta.url), "utf8");
const occupe = lireIcs(texte, new Date("2026-11-18"), new Date("2027-01-31"), "violette@purplelab.fr");
const client = trouverClient("demo-enquete-sur-site-2026");
const jours = grilleClient({ client, occupe, maintenant });
const libres = (j) => jours[j].filter((c) => c.libre).map((c) => c.heure);

let ok = 0; const t = (nom, f) => { f(); ok++; console.log("  ✓", nom); };
t("clé connue → client démo (en mode test)", () => assert.equal(client.nom, "Société Exemple"));
t("clé inconnue, vide ou mal formée → refus", () => {
  assert.equal(trouverClient("mauvaise-cle-de-test-123456"), null);
  assert.equal(trouverClient(""), null);
  assert.equal(trouverClient(undefined), null);
  assert.equal(trouverClient("../../etc/passwd"), null);
});
t("client de démonstration refusé hors mode test", () => {
  const liste = [{ id: "d", testSeulement: true, cleSha256: empreinte("cle-de-demo-assez-longue") }];
  process.env.RDV_MODE_TEST = "0";
  assert.equal(trouverClient("cle-de-demo-assez-longue", liste), null);
  process.env.RDV_MODE_TEST = "1";
  assert.ok(trouverClient("cle-de-demo-assez-longue", liste));
});
t("client désactivé → refus", () => {
  assert.equal(trouverClient("cle-de-client-desactive", [{ id: "x", actif: false, cleSha256: empreinte("cle-de-client-desactive") }]), null);
});
t("la grille ne contient que libre/pris, jamais de titre d'évènement", () => {
  const brut = JSON.stringify({ client: profilPublic(client), jours });
  for (const mot of ["Formation EDF", "Séminaire", "Entretiens TF1", "médecin", "cleSha256", client.cleSha256]) assert.ok(!brut.includes(mot), mot);
  for (const c of Object.values(jours).flat()) assert.deepEqual(Object.keys(c).sort(), ["debut", "fin", "heure", "libre", "tampon"]);
});
t("délai de 48 h : rien de libre avant samedi 21 après-midi", () => {
  assert.deepEqual(libres("2026-11-19"), []);
  assert.deepEqual(libres("2026-11-20"), []);
});
t("week-end absent de la grille", () => assert.equal(jours["2026-11-21"], undefined));
t("mercredi 25 : formation 9h-12h + 30 min de marge → libre à partir de 13h", () => assert.deepEqual(libres("2026-11-25"), ["13:00", "14:00", "15:00", "16:00", "17:00", "18:00", "19:00"]));
t("jeudi 26 : séminaire 9h-18h + marge → seul 19h-20h reste libre", () => assert.deepEqual(libres("2026-11-26"), ["19:00"]));
t("lundi 30 : 14h-17h pris (13h et 17h aussi, à cause de la marge)", () => assert.deepEqual(libres("2026-11-30"), ["09:00", "10:00", "11:00", "12:00", "18:00", "19:00"]));
t("jour férié affiché mais pris (25 décembre)", () => assert.ok(jours["2026-12-25"].every((c) => !c.libre)));
t("créneaux d'une heure, 9h à 20h", () => assert.deepEqual(jours["2026-12-04"].map((c) => c.heure), ["09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00", "18:00", "19:00"]));
t("une réservation 10h-12h (heure de Paris) bloque 9h à 12h avec la marge", () => {
  const j = grilleClient({ client, occupe, maintenant, reservations: [{ debut: "2026-12-04T09:00:00Z", fin: "2026-12-04T11:00:00Z" }] });
  assert.deepEqual(j["2026-12-04"].filter((c) => c.libre).map((c) => c.heure), ["13:00", "14:00", "15:00", "16:00", "17:00", "18:00", "19:00"]);
});
t("créneaux consécutifs regroupés en rendez-vous", () => {
  const b = enBlocs(["2026-12-04T10:00:00.000Z", "2026-12-04T08:00:00.000Z", "2026-12-04T09:00:00.000Z", "2026-12-04T13:00:00.000Z", "2026-12-04T09:00:00.000Z"], 60);
  assert.deepEqual(b, [
    { debut: "2026-12-04T08:00:00.000Z", fin: "2026-12-04T11:00:00.000Z" },
    { debut: "2026-12-04T13:00:00.000Z", fin: "2026-12-04T14:00:00.000Z" },
  ]);
});
t("zone tampon : 1 h avant et après chaque rendez-vous, non réservable", () => {
  const j = grilleClient({ client: { ...client, margeMinutes: 0 }, occupe: [{ debut: new Date("2026-12-04T12:30:00Z"), fin: new Date("2026-12-04T13:30:00Z") }], maintenant })["2026-12-04"];
  const d = (h) => j.find((x) => x.heure === h);
  // rendez-vous 13h30-14h30 (Paris) : 13h et 14h pris, 12h et 15h en zone tampon
  assert.deepEqual(["11:00", "12:00", "13:00", "14:00", "15:00", "16:00"].map((h) => [h, d(h).libre, d(h).tampon]), [
    ["11:00", true, false], ["12:00", false, true], ["13:00", false, false], ["14:00", false, false], ["15:00", false, true], ["16:00", true, false],
  ]);
});
console.log(`\n${ok} tests réussis`);
