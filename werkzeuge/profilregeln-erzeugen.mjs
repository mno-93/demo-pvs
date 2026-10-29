#!/usr/bin/env node
/**
 * Zieht die Regeln der Medikationsprofile aus den FHIR-Paketen in den Kern
 * (`packages/kern/src/fhir/profilregeln.json`), damit Simulator und Praxissystem eine Eingabe so
 * prüfen wie der Medication Service (`MEDSVC_NO_VALID_STRUCTURE`, ADR 0048).
 *
 * Je Profil aus dem Snapshot, ohne Slices:
 * - Invarianten mit Schwere `error` (FHIRPath, wörtlich), ohne `ele-1` und `ext-1`;
 * - Kardinalitäten, die von der Basis abweichen oder Pflicht sind;
 * - feste Werte und Muster (`fixed[x]`, `pattern[x]`);
 * - verpflichtende Wertelisten (`required`), soweit sie sich aus den Paketen vollständig
 *   auflösen lassen — aufgezählte Codes oder ganze Codesysteme mit Konzeptliste.
 *
 * Die Pakete liest das Skript aus dem Paketcache (`~/.fhir/packages`, oder FHIR_PAKETE). Es lädt
 * nichts herunter; fehlt ein Paket, bricht es ab. Ein Validator lädt dieselben Pakete
 * (werkzeuge/fhir-validator.json).
 *
 * Aufruf: node werkzeuge/profilregeln-erzeugen.mjs
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const CACHE = process.env.FHIR_PAKETE ?? join(homedir(), '.fhir', 'packages');

/** Pakete in der Reihenfolge, in der ein Verweis aufgelöst wird. */
const PAKETE = [
  'de.gematik.epa#1.4.0-ballot.1',
  'de.gematik.epa.medication#1.4.0-ballot.1',
  'de.fhir.medication#2.0.0-ballot',
  'de.gematik.ti#1.5.0-ballot.2',
  'de.basisprofil.r4#1.6.0',
  'kbv.all.st#1.48.0',
  'hl7.terminology.r4#7.4.0',
  'hl7.fhir.r4.core#4.0.1',
];

const PROFILE = [
  'https://gematik.de/fhir/epa-medication/StructureDefinition/emp-medication-request',
  'https://gematik.de/fhir/epa-medication/StructureDefinition/emp-medication',
  'https://gematik.de/fhir/epa-medication/StructureDefinition/epa-medication',
  'https://gematik.de/fhir/epa-medication/StructureDefinition/epa-medication-statement',
  'https://gematik.de/fhir/epa-medication/StructureDefinition/emp-reason-condition',
];

const AUSGELASSEN = new Set(['ele-1', 'ext-1']);

/* ---------- Pakete lesen ---------- */

const ressourcen = new Map(); // url -> { ressource, paket }
for (const paket of PAKETE) {
  const ordner = join(CACHE, paket, 'package');
  if (!existsSync(ordner)) {
    console.error(`Paket fehlt im Cache: ${paket} (${ordner})`);
    process.exit(1);
  }
  for (const datei of readdirSync(ordner)) {
    if (!datei.endsWith('.json') || datei.startsWith('.') || datei === 'package.json') continue;
    let r;
    try {
      r = JSON.parse(readFileSync(join(ordner, datei), 'utf8').replace(/^\uFEFF/, ''));
    } catch {
      continue;
    }
    if (!r?.url || !['StructureDefinition', 'ValueSet', 'CodeSystem'].includes(r.resourceType))
      continue;
    if (!ressourcen.has(r.url)) ressourcen.set(r.url, { ressource: r, paket });
  }
}
const finden = (url) => ressourcen.get(String(url).split('|')[0]);

/* ---------- Wertelisten auflösen ---------- */

function codesAusCodesystem(cs) {
  const aus = [];
  const sammeln = (konzepte) => {
    for (const k of konzepte ?? []) {
      aus.push(k.code);
      sammeln(k.concept);
    }
  };
  sammeln(cs.concept);
  return aus;
}

/** Erlaubte Codes als `system|code`, oder `null`, wenn die Werteliste nicht vollständig auflösbar ist. */
function wertelisteAufloesen(url, tiefe = 0) {
  if (tiefe > 4) return null;
  const vs = finden(url)?.ressource;
  if (!vs || vs.resourceType !== 'ValueSet') return null;
  if (vs.compose?.exclude?.length) return null;
  const codes = new Set();
  for (const inc of vs.compose?.include ?? []) {
    if (inc.filter?.length) return null;
    if (inc.valueSet?.length) {
      for (const teil of inc.valueSet) {
        const t = wertelisteAufloesen(teil, tiefe + 1);
        if (!t) return null;
        t.forEach((c) => codes.add(c));
      }
    }
    if (!inc.system) continue;
    if (inc.concept?.length) {
      inc.concept.forEach((k) => codes.add(`${inc.system}|${k.code}`));
    } else {
      const cs = finden(inc.system)?.ressource;
      if (!cs || cs.resourceType !== 'CodeSystem' || cs.content !== 'complete') return null;
      codesAusCodesystem(cs).forEach((c) => codes.add(`${inc.system}|${c}`));
    }
  }
  return codes.size > 0 ? [...codes].sort() : null;
}

/* ---------- Regeln je Profil ---------- */

const zuFhirpath = (pfad) => pfad.replace(/\[x\]/g, '');

function basisElement(sd, pfad) {
  const basis = finden(sd.baseDefinition)?.ressource;
  if (!basis) return null;
  return basis.snapshot.element.find((e) => e.path === pfad && !e.id.includes(':')) ?? null;
}

const profile = {};
for (const url of PROFILE) {
  const eintrag = finden(url);
  if (!eintrag) {
    console.error(`Profil nicht gefunden: ${url}`);
    process.exit(1);
  }
  const sd = eintrag.ressource;
  const invarianten = [];
  const kardinalitaeten = [];
  const muster = [];
  const wertelisten = [];
  const gesehen = new Set();
  for (const e of sd.snapshot.element) {
    if (e.id.includes(':')) continue; // Slices: nicht ohne Unterscheidung auswertbar
    // Unter einer Extension liegt jede beliebige Extension — keine Regel des Profils.
    if (/\.extension\./.test(e.path) || /\.modifierExtension\./.test(e.path)) continue;
    const pfad = zuFhirpath(e.path);
    for (const k of e.constraint ?? []) {
      if (k.severity !== 'error' || AUSGELASSEN.has(k.key) || !k.expression) continue;
      const schluessel = `${pfad}|${k.key}`;
      if (gesehen.has(schluessel)) continue;
      gesehen.add(schluessel);
      invarianten.push({ pfad, key: k.key, text: k.human, ausdruck: k.expression });
    }
    if (e.path.includes('.')) {
      const basis = basisElement(sd, e.path);
      const min = e.min ?? 0;
      const max = e.max ?? '*';
      if (min > 0 || max !== (basis?.max ?? '*') || min !== (basis?.min ?? 0))
        kardinalitaeten.push({ pfad, min, max });
    }
    for (const [schl, wert] of Object.entries(e)) {
      if (/^(fixed|pattern)[A-Z]/.test(schl))
        muster.push({ pfad, art: schl.startsWith('fixed') ? 'fixed' : 'pattern', wert });
    }
    const b = e.binding;
    const typen = (e.type ?? []).map((t) => t.code);
    if (
      b?.strength === 'required' &&
      b.valueSet &&
      typen.some((t) => ['code', 'Coding', 'CodeableConcept'].includes(t))
    ) {
      const codes = wertelisteAufloesen(b.valueSet);
      if (codes) wertelisten.push({ pfad, valueSet: b.valueSet, codes });
    }
  }
  profile[url] = {
    version: sd.version,
    typ: sd.type,
    paket: eintrag.paket,
    invarianten,
    kardinalitaeten,
    muster,
    wertelisten,
  };
  console.log(
    `${url.split('/').pop()} ${sd.version}: ${invarianten.length} Invarianten, ${kardinalitaeten.length} Kardinalitäten, ${muster.length} Muster, ${wertelisten.length} Wertelisten`,
  );
}

writeFileSync(
  'packages/kern/src/fhir/profilregeln.json',
  `${JSON.stringify(
    {
      $kommentar:
        'Erzeugt mit werkzeuge/profilregeln-erzeugen.mjs aus den FHIR-Paketen — nicht von Hand ändern.',
      pakete: PAKETE,
      profile,
    },
    null,
    1,
  )}\n`,
);
