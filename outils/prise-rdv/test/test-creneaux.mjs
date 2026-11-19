// Test du calcul des créneaux avec un faux agenda (aucun accès réseau).
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { lireIcs, calculerCreneaux, fabriquerIcs } from "../lib/agenda.mjs";
import ICAL from "ical.js";

const maintenant = new Date("2026-11-07T22:00:00Z"); // samedi soir
const texte = readFileSync(new URL("./agenda-test.ics", import.meta.url), "utf8");
const occupe = lireIcs(texte, new Date("2026-11-06"), new Date("2026-12-10"), "violette@purplelab.fr");
const jours = calculerCreneaux({ occupe, maintenant });
const h = (j) => (jours[j] || []).map((c) => c.heure);
const montre = (j) => console.log(j, h(j).join(" ") || "(aucun)");
["2026-11-09","2026-11-10","2026-11-11","2026-11-12","2026-11-13","2026-11-16","2026-11-17","2026-11-18","2026-11-24"].forEach(montre);

let ok = 0; const t = (nom, f) => { f(); ok++; console.log("  ✓", nom); };
t("week-end exclu", () => { assert.equal(jours["2026-11-08"], undefined); assert.equal(jours["2026-11-14"], undefined); });
t("lundi 9 : réunion 10h-11h + marge 15 min bloque 9h30, 10h, 10h30, 11h", () => assert.deepEqual(h("2026-11-09").slice(0, 3), ["11:30", "12:00", "14:00"]));
t("mardi 10 : évènement annulé ignoré, point 14h30-15h30 récurrent bloque 14h-15h30", () => { assert.ok(h("2026-11-10").includes("09:30")); assert.ok(!h("2026-11-10").includes("14:30")); assert.ok(!h("2026-11-10").includes("15:30")); assert.ok(h("2026-11-10").includes("16:00")); });
t("mercredi 11 novembre férié", () => assert.equal(jours["2026-11-11"], undefined));
t("jeudi 12 : « disponible » ne bloque pas", () => assert.equal(h("2026-11-12").length, 14));
t("vendredi 13 : journée entière bloquée", () => assert.equal(jours["2026-11-13"], undefined));
t("lundi 16 : invitation refusée ignorée", () => assert.ok(h("2026-11-16").includes("15:00")));
t("mardi 17 : occurrence supprimée (EXDATE) libère 14h30", () => assert.ok(h("2026-11-17").includes("14:30")));
t("mercredi 18 : bloqué en UTC 8h-17h = 9h-18h Paris", () => assert.equal(jours["2026-11-18"], undefined));
t("mardi 24 : occurrence déplacée à 9h, 14h30 libéré", () => { assert.ok(!h("2026-11-24").includes("09:30")); assert.ok(h("2026-11-24").includes("10:30")); assert.ok(h("2026-11-24").includes("14:30")); });
t("délai minimum 24 h", () => { const j2 = calculerCreneaux({ occupe: [], maintenant: new Date("2026-11-09T09:00:00Z") }); assert.ok(!(j2["2026-11-09"])); assert.equal(j2["2026-11-10"][0].heure, "10:00"); });
t("réservation en attente bloque son créneau", () => {
  const j3 = calculerCreneaux({ occupe, maintenant, reservations: [{ debut: "2026-11-12T08:30:00Z", fin: "2026-11-12T09:00:00Z" }] });
  assert.ok(!j3["2026-11-12"].some((c) => c.heure === "09:30"));
});
t("heure d'été : fin mars 2027 reste à 9h30 heure de Paris", () => {
  const j4 = calculerCreneaux({ occupe: [], maintenant: new Date("2027-03-25T08:00:00Z") });
  assert.equal(j4["2027-03-30"][0].debut, "2027-03-30T07:30:00.000Z");
});
t("ICS d'invitation valide et relisible", () => {
  const ics = fabriquerIcs({ uid: "x@purplelab.fr", debut: new Date("2026-11-12T08:30:00Z"), fin: new Date("2026-11-12T09:00:00Z"), titre: "Premier échange · Jeanne Dupont (Société, SA)", description: "Ligne 1\nLigne 2 ; avec des caractères spéciaux, accentués éèà et une très longue phrase pour vérifier le pliage des lignes à 75 octets", lieu: "Visio", organisateur: { nom: "Purple Lab", email: "rdv@purplelab.fr" }, invites: [{ nom: "Jeanne", email: "j@ex.fr" }] });
  assert.ok(ics.split("\r\n").every((l) => Buffer.byteLength(l) <= 75));
  const ev = new ICAL.Event(new ICAL.Component(ICAL.parse(ics)).getFirstSubcomponent("vevent"));
  assert.equal(ev.startDate.toJSDate().toISOString(), "2026-11-12T08:30:00.000Z");
  assert.ok(ev.description.includes("Ligne 2 ; avec"));
  assert.equal(ev.summary, "Premier échange · Jeanne Dupont (Société, SA)");
});
console.log(`\n${ok} tests réussis`);
