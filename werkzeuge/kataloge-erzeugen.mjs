#!/usr/bin/env node
/**
 * Übersetzt die Katalogauszüge aus daten/kataloge/ in typisierte TypeScript-Module
 * unter packages/kern/src/kataloge/.
 *
 * Warum dieser Umweg: Die JSON-Dateien sollen ohne Entwicklungsumgebung bearbeitbar
 * bleiben. Zugleich sollen die Kataloge im Quelltext typisiert vorliegen und in beiden
 * Laufzeiten (Browser über Vite, Node im Simulator) ohne Ladelogik verfügbar sein.
 * Siehe docs/entscheidungen/0005-kataloge-als-erzeugte-module.md
 *
 * Aufruf: node werkzeuge/kataloge-erzeugen.mjs
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, basename } from 'node:path';

const QUELLE = 'daten/kataloge';
const ZIEL = 'packages/kern/src/kataloge';

const NAMEN = {
  'icd10gm-auszug': { konstante: 'icd10gm', typ: 'IcdEintrag' },
  'ebm-auszug': { konstante: 'ebm', typ: 'EbmEintrag' },
  'arzneimittel-auszug': { konstante: 'arzneimittel', typ: 'ArzneimittelEintrag' },
  'loinc-auszug': { konstante: 'loinc', typ: 'LoincEintrag' },
  'allergie-substanzen': { konstante: 'substanzen', typ: 'SnomedWerteintrag' },
  'allergie-manifestationen': { konstante: 'manifestationen', typ: 'SnomedWerteintrag' },
  'kodierservice-diagnosen': { konstante: 'kodierservice', typ: 'KodierserviceEintrag' },
  'dokumenttypen-epa': { konstante: 'dokumenttypen', typ: 'DokumenttypEintrag' },
  'allergie-expositionswege': { konstante: 'expositionswege', typ: 'SnomedWerteintrag' },
  'schweregrade-diagnose': { konstante: 'schweregrade', typ: 'SnomedWerteintrag' },
  'allergie-amts-zuordnung': { konstante: 'amtsZuordnung', typ: 'AmtsZuordnungEintrag' },
  'impfstoffe-auszug': { konstante: 'impfstoffe', typ: 'ImpfstoffEintrag' },
};

let erzeugt = 0;
for (const datei of readdirSync(QUELLE).filter((d) => d.endsWith('.json'))) {
  const schluessel = basename(datei, '.json');
  const abbildung = NAMEN[schluessel];
  if (!abbildung) {
    console.warn(`übersprungen (keine Zuordnung): ${datei}`);
    continue;
  }
  const inhalt = JSON.parse(readFileSync(join(QUELLE, datei), 'utf8'));
  const kopf = Object.fromEntries(Object.entries(inhalt).filter(([k]) => k.startsWith('_')));

  const text = `// Erzeugt aus ${QUELLE}/${datei} — nicht von Hand ändern.
// Neu erzeugen mit: node werkzeuge/kataloge-erzeugen.mjs
import type { ${abbildung.typ}, Katalogkopf } from './typen.js';

export const ${abbildung.konstante}Kopf: Katalogkopf = ${JSON.stringify(kopf, null, 2)};

export const ${abbildung.konstante}: readonly ${abbildung.typ}[] = ${JSON.stringify(inhalt.eintraege, null, 2)};
`;
  writeFileSync(join(ZIEL, `${abbildung.konstante}.ts`), text, 'utf8');
  erzeugt++;
  console.info(`${abbildung.konstante}.ts — ${inhalt.eintraege.length} Einträge`);
}
console.info(`${erzeugt} Kataloge erzeugt.`);
