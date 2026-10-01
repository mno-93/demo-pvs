#!/usr/bin/env node
/**
 * Bildet die Zuordnung auslösender Substanzen (SNOMED CT) zu ATC-Codes für die AMTS-Prüfung.
 *
 * Warum es sie braucht: Allergien werden mit SNOMED CT aus KBV_VS_AllergyIntolerance_Substance_SNOMED_CT
 * dokumentiert, Arzneimittel im Praxissystem über ATC. Eine Prüfung „Allergie gegen einen
 * Bestandteil dieses Mittels?" braucht deshalb eine Brücke zwischen beiden Codesystemen.
 *
 * Gebildet wird sie auf zwei Wegen:
 * 1. automatisch über den Wirkstoffnamen — die deutsche Bezeichnung des SNOMED-Konzepts
 *    wird mit den Wirkstoffen des Arzneimittelauszugs verglichen, auch als Bestandteil einer
 *    Kombination („Amoxicillin/Clavulansäure");
 * 2. von Hand für Wirkstoffgruppen, die sich nicht über einen Namen finden lassen.
 *
 * ⚠ Die Zuordnung ist für die Demo gebaut und fachlich nicht geprüft. Eine abgestimmte
 * Zuordnung — etwa über die Substanzhierarchie von SNOMED CT oder eine AMTS-Datenbank —
 * liegt nicht vor.
 *
 * Aufruf: node werkzeuge/amts-zuordnung-bilden.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';

const substanzen = JSON.parse(readFileSync('daten/kataloge/allergie-substanzen.json', 'utf8'));
const arzneimittel = JSON.parse(readFileSync('daten/kataloge/arzneimittel-auszug.json', 'utf8'));

/** Wirkstoffgruppen: ATC-Präfixe, von Hand. */
const GRUPPEN = {
  764146007: {
    atc: ['J01C'],
    hinweis: 'ATC J01C umfasst alle Penicilline, auch in Kombination mit Beta-Lactamase-Hemmern.',
  },
  764147003: {
    atc: ['J01DB', 'J01DC', 'J01DD', 'J01DE', 'J01DI'],
    hinweis:
      'Cephalosporine verteilen sich in ATC auf fünf Gruppen; ein gemeinsamer Präfix existiert nicht.',
  },
  764148008: {
    atc: ['J01MA', 'J01MB'],
    hinweis: 'Chinolone: Fluorchinolone und andere Chinolone.',
  },
  426722004: { atc: ['V08A'], hinweis: 'Iodhaltige Röntgenkontrastmittel.' },
  1348311005: { atc: ['V08CA'], hinweis: 'Paramagnetische Kontrastmittel mit Gadolinium.' },
  372877000: { atc: ['B01AB'], hinweis: 'Heparingruppe.' },
  387458008: {
    atc: ['B01AC06', 'N02BA01'],
    hinweis:
      'Acetylsalicylsäure steht in ATC zweimal: als Thrombozytenaggregationshemmer und als Analgetikum.',
  },
};

function normalisiert(text) {
  return text.toLowerCase().replace(/\s+/g, ' ').trim();
}

const eintraege = [];
for (const s of substanzen.eintraege) {
  const namen = [s.bezeichnung, ...s.synonyme].map(normalisiert);
  const ueberName = arzneimittel.eintraege
    .filter((a) =>
      a.wirkstoff
        .split('/')
        .map(normalisiert)
        .some((teil) => namen.includes(teil)),
    )
    .map((a) => a.atc);
  const gruppe = GRUPPEN[s.snomed];
  const atc = [...new Set([...(gruppe?.atc ?? []), ...ueberName])].sort();
  if (atc.length === 0) continue;
  eintraege.push({
    snomed: s.snomed,
    bezeichnung: s.bezeichnung,
    atc,
    weg: gruppe ? (ueberName.length ? 'Gruppe und Wirkstoffname' : 'Gruppe') : 'Wirkstoffname',
    hinweis: gruppe?.hinweis ?? null,
  });
}

const inhalt = {
  _katalog: 'Zuordnung auslösender Substanzen zu ATC für die AMTS-Prüfung',
  _art: 'Demo-Zuordnung, fachlich nicht geprüft',
  _hinweis:
    'Erzeugt mit werkzeuge/amts-zuordnung-bilden.mjs aus allergie-substanzen.json und arzneimittel-auszug.json. ' +
    'Nur Arzneimittelsubstanzen, und nur solche, für die der Arzneimittelauszug ein Mittel führt oder eine Gruppe von Hand hinterlegt ist. ' +
    'Die Zuordnung wird nicht in FHIR-Ressourcen geschrieben — sie ist keine Übersetzung, sondern ein Prüfhilfsmittel.',
  eintraege,
};
writeFileSync(
  'daten/kataloge/allergie-amts-zuordnung.json',
  JSON.stringify(inhalt, null, 2) + '\n',
  'utf8',
);
console.info(
  `daten/kataloge/allergie-amts-zuordnung.json — ${eintraege.length} Substanzen zugeordnet`,
);
