#!/usr/bin/env node
/**
 * Übernimmt die veröffentlichten Allergie-Wertelisten vom Zentralen Terminologieserver (BfArM)
 * nach daten/kataloge/.
 *
 * - KBV_VS_AllergyIntolerance_Substance_SNOMED_CT    — auslösende Substanzen
 * - KBV_VS_AllergyIntolerance_Manifestation_SNOMED_CT — Manifestationen einer Reaktion
 *
 * Gelesen wird die Code-Tabelle, die der Terminologieserver zu jeder Werteliste ausliefert
 * (`rendering_data/ValueSet-<id>.json`). ⚠ Das ist die Datenquelle der Webseite, keine
 * zugesicherte Schnittstelle; ändert sie sich, bricht das Skript mit einer Meldung ab.
 *
 * Bezeichnung ist die deutsche Anzeige der Werteliste. Synonyme sind Ergänzungen der Demo für
 * die Suche; sie bleiben bei einer erneuten Übernahme erhalten, frühere Bezeichnungen kommen
 * hinzu. Version und Stand stehen unten und werden bei einer neuen Fassung von Hand angepasst.
 *
 * Aufruf: node werkzeuge/wertelisten-vom-zts.mjs, danach node werkzeuge/kataloge-erzeugen.mjs
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const ZTS = 'https://terminologien.bfarm.de';
const SNOMED_VERSION = 'http://snomed.info/sct/11000274103/version/20260515';

const WERTELISTEN = [
  {
    name: 'KBV_VS_AllergyIntolerance_Substance_SNOMED_CT',
    titel: 'Allergien Überempfindlichkeitsreaktionen Auslösende Substanz',
    id: '4fd7723b-601b-5717-ae79-e5d180367e16',
    version: '1.0.0',
    stand: '2026-07-21',
    ziel: 'daten/kataloge/allergie-substanzen.json',
  },
  {
    name: 'KBV_VS_AllergyIntolerance_Manifestation_SNOMED_CT',
    titel: 'Allergien Überempfindlichkeitsreaktionen Manifestation',
    id: '4c8eb7ff-4da6-5b04-8536-388bc1ba35a0',
    version: '1.0.0',
    stand: '2026-07-21',
    ziel: 'daten/kataloge/allergie-manifestationen.json',
  },
];

for (const w of WERTELISTEN) {
  const antwort = await fetch(`${ZTS}/rendering_data/ValueSet-${w.id}.json?search=`);
  if (!antwort.ok) {
    console.error(`${w.name}: Terminologieserver antwortet ${antwort.status}`);
    process.exit(1);
  }
  const { rows } = await antwort.json();
  if (!Array.isArray(rows) || rows.some((r) => !r.Code || !r.Display)) {
    console.error(`${w.name}: unerwartetes Format der Code-Tabelle`);
    process.exit(1);
  }
  const bisher = new Map(
    existsSync(w.ziel)
      ? JSON.parse(readFileSync(w.ziel, 'utf8')).eintraege.map((e) => [e.snomed, e])
      : [],
  );
  const eintraege = rows.map((r) => {
    const alt = bisher.get(r.Code);
    const synonyme = [...(alt?.synonyme ?? [])];
    if (alt && alt.bezeichnung !== r.Display && !synonyme.includes(alt.bezeichnung)) {
      synonyme.push(alt.bezeichnung);
    }
    return {
      snomed: r.Code,
      anzeigeEn: alt?.anzeigeEn ?? '',
      bezeichnung: r.Display,
      synonyme: synonyme.filter((s) => s !== r.Display),
      system: r.System,
      bindung: 'extensible',
    };
  });
  const inhalt = {
    _katalog: w.name,
    _art: 'veröffentlichte Werteliste, Zentraler Terminologieserver (BfArM)',
    _hinweis:
      'Übernommen mit werkzeuge/wertelisten-vom-zts.mjs, nicht von Hand ändern. Bindung extensible: Codes außerhalb der Liste sind zulässig. Synonyme und englische Anzeige sind Ergänzungen der Demo für die Suche.',
    _stand: {
      titel: w.titel,
      quelle: `${ZTS}/ValueSet-${w.id}.html`,
      kanonisch: `https://fhir.kbv.de/ValueSet/${w.name}`,
      version: w.version,
      stand: w.stand,
      snomedVersion: SNOMED_VERSION,
    },
    eintraege,
  };
  writeFileSync(w.ziel, JSON.stringify(inhalt, null, 2) + '\n', 'utf8');
  const entfallen = [...bisher.keys()].filter((k) => !rows.some((r) => r.Code === k));
  console.info(
    `${w.ziel} — ${eintraege.length} Einträge` +
      (entfallen.length ? `; entfallen: ${entfallen.join(', ')}` : ''),
  );
}
