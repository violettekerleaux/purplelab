// Plusieurs agendas : les créneaux occupés de chaque lien iCal s'additionnent.
import http from "node:http";
import assert from "node:assert/strict";
const ics = (uid, debut, fin) => `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:${uid}\r\nDTSTAMP:20261101T000000Z\r\nDTSTART:${debut}\r\nDTEND:${fin}\r\nSUMMARY:Secret ${uid}\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n`;
const srv = http.createServer((req, res) => {
  if (req.url === "/a.ics") return res.end(ics("a", "20261204T080000Z", "20261204T090000Z"));
  if (req.url === "/b.ics") return res.end(ics("b", "20261204T140000Z", "20261204T150000Z"));
  res.writeHead(404); res.end();
}).listen(0);
const port = srv.address().port;
process.env.AGENDA_ICS_URL = `http://localhost:${port}/a.ics, http://localhost:${port}/b.ics`;
const { plagesOccupees } = await import("../lib/agenda.mjs");
const occ = await plagesOccupees(new Date("2026-12-01"), new Date("2026-12-10"));
assert.equal(occ.length, 2);
console.log("  ✓ deux agendas fusionnés (2 plages occupées)");
process.env.AGENDA_ICS_URL = `http://localhost:${port}/a.ics,http://localhost:${port}/absent.ics`;
await assert.rejects(plagesOccupees(new Date("2026-12-01"), new Date("2026-12-10")));
console.log("  ✓ un agenda illisible → erreur (on n'affiche jamais un créneau libre par erreur)");
srv.close();
console.log("\n2 tests réussis");
