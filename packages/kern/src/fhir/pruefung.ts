/**
 * ✦ Strukturprüfung für die FHIR-Ausgaben der Demo — Pflichtangaben und Invarianten.
 *
 * Sie ersetzt keinen FHIR-Validator. Sie prüft genau die Regeln, die für die Ressourcen der Demo
 * gelten und die sich ohne Terminologieserver prüfen lassen, und sie läuft in jedem Testlauf mit:
 *
 * - **Pflichtelemente der Basis** (FHIR R4 4.0.1, Kardinalität ab 1), je Ressourcentyp;
 * - **Pflichtelemente der verwendeten Profile**, je `meta.profile`: TI Common
 *   `ti-condition-diagnosis` 1.5.0 (Paket `de.gematik.ti` 1.5.0-ballot.2, Snapshot geprüft am
 *   15.10.2026), EU Core 2.0.0 für Allergie, Impfung und Patient (hl7.eu/fhir/base/2.0.0);
 * - **Invarianten** der Basis: con-3, con-4, con-5 (Condition), ait-1, ait-2 (AllergyIntolerance),
 *   org-1 (Organization), cmp-1, cmp-2 (Composition), bdl-7, bdl-9, bdl-10, bdl-11 (Bundle),
 *   ele-1 (kein leeres Element), dazu eu-pat-1 (EU Core Patient);
 * - **Dokumentregeln** (FHIR R4, Documents): Was die Composition referenziert, liegt im Bundle;
 *   alles im Bundle ist von der Composition aus erreichbar.
 *
 * Pflicht heißt hier: Das Element muss vorhanden sein — mit Wert oder, wo der Wert unbekannt
 * ist, mit der Extension `data-absent-reason`. Must-Support-Elemente sind keine Pflicht; sie
 * werden befüllt, wenn das Praxissystem den Wert kennt (DATENMODELL.md).
 */

import type { Ressource } from './typen.js';

export interface Pruefbefund {
  schwere: 'fehler' | 'warnung';
  /** Kennung der Regel, etwa `con-5` oder `Pflicht ti-condition-diagnosis`. */
  regel: string;
  /** Wo, etwa `Condition/d1.clinicalStatus`. */
  pfad: string;
  text: string;
}

type Wert = unknown;
type Objekt = Record<string, Wert>;

/** Pflichtelemente der R4-Basis (min ≥ 1) für die Ressourcentypen, die die Demo erzeugt. */
export const PFLICHT_R4: Record<string, readonly string[]> = {
  AllergyIntolerance: ['patient'],
  Bundle: ['type'],
  Composition: ['status', 'type', 'date', 'author', 'title'],
  Condition: ['subject'],
  Coverage: ['status', 'beneficiary', 'payor'],
  Device: [],
  DeviceUseStatement: ['status', 'subject', 'device'],
  DiagnosticReport: ['status', 'code'],
  Encounter: ['status', 'class'],
  Immunization: ['status', 'vaccineCode', 'patient', 'occurrence[x]'],
  Medication: [],
  MedicationRequest: ['status', 'intent', 'medication[x]', 'subject'],
  MedicationStatement: ['status', 'medication[x]', 'subject'],
  Observation: ['status', 'code'],
  Organization: [],
  Patient: [],
  Practitioner: [],
  PractitionerRole: [],
  Procedure: ['status', 'subject'],
  Provenance: ['target', 'recorded', 'agent'],
  Specimen: [],
};

/** Pflichtelemente der Profile, die die Demo in `meta.profile` nennt (min ≥ 1 im Profil). */
export const PFLICHT_PROFIL: Record<string, readonly string[]> = {
  // `subject.identifier` ist seit 1.5.0 nur Must Support; die Demo setzt ihn trotzdem immer —
  // die KVNR ist die Kennung der Akte.
  'https://gematik.de/fhir/ti/StructureDefinition/ti-condition-diagnosis': ['code'],
  'http://hl7.eu/fhir/base/StructureDefinition/allergyIntolerance-eu-core': ['code', 'patient'],
  'http://hl7.eu/fhir/base/StructureDefinition/immunization-eu-core': [
    'status',
    'vaccineCode',
    'patient',
    'occurrence[x]',
  ],
  'http://hl7.eu/fhir/base/StructureDefinition/patient-eu-core': ['name', 'birthDate'],
  'https://gematik.de/fhir/ti/StructureDefinition/ti-patient': ['name', 'birthDate'],
};

const DAR = 'http://hl7.org/fhir/StructureDefinition/data-absent-reason';
const ICD10GM = 'http://fhir.de/CodeSystem/bfarm/icd-10-gm';
const ALPHA_ID = 'http://fhir.de/CodeSystem/bfarm/alpha-id';
const SNOMED = 'http://snomed.info/sct';

const istObjekt = (w: Wert): w is Objekt =>
  typeof w === 'object' && w !== null && !Array.isArray(w);
const liste = (w: Wert): Wert[] => (Array.isArray(w) ? w : w === undefined ? [] : [w]);

/** Ein Element ist vorhanden mit Wert — oder als Primitive mit Extension (`_name`). */
function vorhanden(o: Objekt, name: string): boolean {
  if (name.endsWith('[x]')) {
    const stamm = name.slice(0, -3);
    return Object.keys(o).some(
      (k) => (k.startsWith(stamm) || k.startsWith(`_${stamm}`)) && k.length > stamm.length,
    );
  }
  return o[name] !== undefined || o[`_${name}`] !== undefined;
}

/** Pfad mit Punkten; über Listen hinweg gilt er, wenn er in jedem Element vorhanden ist. */
function pfadVorhanden(o: Objekt, pfad: string): boolean {
  const [kopf, ...rest] = pfad.split('.');
  if (!kopf || !vorhanden(o, kopf)) return false;
  if (rest.length === 0) return true;
  const teile = liste(o[kopf]).filter(istObjekt);
  return teile.length > 0 && teile.every((t) => pfadVorhanden(t, rest.join('.')));
}

function codeVon(c: Wert): string | undefined {
  return liste(istObjekt(c) ? c['coding'] : undefined)
    .filter(istObjekt)
    .map((x) => x['code'])
    .find((x): x is string => typeof x === 'string');
}

const OHNE_ZONE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/;

/** Zeitpunkte mit Uhrzeit, aber ohne Zone — in FHIR-JSON stehen sie nur in dateTime und instant. */
function zeitOhneZone(w: Wert, pfad: string, aus: string[], ohneEintraege = false): void {
  if (typeof w === 'string') {
    if (OHNE_ZONE.test(w)) aus.push(pfad);
  } else if (Array.isArray(w)) w.forEach((x, i) => zeitOhneZone(x, `${pfad}[${i}]`, aus));
  else if (istObjekt(w)) {
    for (const [k, v] of Object.entries(w)) {
      if (k === 'div' || (ohneEintraege && k === 'entry')) continue;
      zeitOhneZone(v, `${pfad}.${k}`, aus);
    }
  }
}

/** ele-1: Kein Element ist leer — kein leerer Text, keine leere Liste, kein leeres Objekt. */
function leereElemente(w: Wert, pfad: string, aus: string[], ohneEintraege = false): void {
  if (typeof w === 'string' && w === '') aus.push(pfad);
  else if (Array.isArray(w)) {
    if (w.length === 0) aus.push(pfad);
    w.forEach((x, i) => leereElemente(x, `${pfad}[${i}]`, aus));
  } else if (istObjekt(w)) {
    if (Object.keys(w).length === 0) aus.push(pfad);
    for (const [k, v] of Object.entries(w)) {
      if (ohneEintraege && k === 'entry') continue;
      leereElemente(v, `${pfad}.${k}`, aus);
    }
  }
}

/** Profile, unter denen ICD-10-GM und SNOMED CT eine Version tragen müssen (min 1). */
const MIT_KODIERVERSION = ['https://gematik.de/fhir/ti/StructureDefinition/'];

/** Prüft eine einzelne Ressource (ohne die Dokumentregeln eines Bundles). */
export function ressourcePruefen(r: Ressource): Pruefbefund[] {
  const befunde: Pruefbefund[] = [];
  const o = r as unknown as Objekt;
  const name = `${r.resourceType}${r.id ? `/${String(r.id)}` : ''}`;
  const fehler = (regel: string, pfad: string, text: string) =>
    befunde.push({ schwere: 'fehler', regel, pfad: `${name}${pfad ? `.${pfad}` : ''}`, text });
  const warnung = (regel: string, pfad: string, text: string) =>
    befunde.push({ schwere: 'warnung', regel, pfad: `${name}${pfad ? `.${pfad}` : ''}`, text });

  for (const p of PFLICHT_R4[r.resourceType] ?? []) {
    if (!pfadVorhanden(o, p)) fehler('Pflicht R4', p, `${p} ist in FHIR R4 Pflicht (min 1).`);
  }
  for (const profil of liste(r.meta?.profile)) {
    const url = String(profil).split('|')[0] ?? '';
    for (const p of PFLICHT_PROFIL[url] ?? []) {
      if (!pfadVorhanden(o, p))
        fehler(`Pflicht ${url.split('/').pop()}`, p, `${p} ist im Profil Pflicht (min 1).`);
    }
  }

  // dateTime und instant: Mit Uhrzeit ist die Zeitzone Pflicht (FHIR R4, Datentypen).
  const zeitpunkte: string[] = [];
  zeitOhneZone(o, '', zeitpunkte, r.resourceType === 'Bundle');
  for (const p of zeitpunkte)
    fehler('Zeitzone', p.replace(/^\./, ''), 'Zeitpunkt mit Uhrzeit braucht eine Zeitzone.');

  const istBundle = r.resourceType === 'Bundle';
  const leer: string[] = [];
  leereElemente(o, '', leer, istBundle);
  for (const p of leer)
    fehler('ele-1', p.replace(/^\./, ''), 'Leeres Element ist in FHIR unzulässig.');

  // Kodierungen: System und Code gehören zusammen. Die Version von ICD-10-GM, Alpha-ID und
  // SNOMED CT ist in den TI-Profilen Pflicht (ti-condition-diagnosis 1.5.0: version 1..1 in allen
  // drei Slices), in der Basis nicht.
  const versionPflicht = liste(r.meta?.profile).some((p) =>
    MIT_KODIERVERSION.some((m) => String(p).startsWith(m)),
  );
  const kodierungen = (w: Wert, pfad: string) => {
    if (Array.isArray(w)) w.forEach((x, i) => kodierungen(x, `${pfad}[${i}]`));
    else if (istObjekt(w)) {
      if (Array.isArray(w['coding'])) {
        (w['coding'] as Wert[]).filter(istObjekt).forEach((c, i) => {
          const ort = `${pfad}.coding[${i}]`.replace(/^\./, '');
          if ((c['code'] && !c['system']) || (c['system'] && !c['code']))
            warnung('Kodierung', ort, 'System und Code gehören zusammen.');
          if ([ICD10GM, ALPHA_ID, SNOMED].includes(String(c['system'])) && !c['version'])
            (versionPflicht ? fehler : warnung)(
              'Kodierung',
              ort,
              `${String(c['system'])} ohne Version${versionPflicht ? ' — im Profil Pflicht' : ''}.`,
            );
        });
      }
      for (const [k, v] of Object.entries(w)) {
        if (k === 'text' || (istBundle && k === 'entry')) continue;
        kodierungen(v, `${pfad}.${k}`);
      }
    }
  };
  kodierungen(o, '');

  const verifikation = codeVon(o['verificationStatus']);
  const klinisch = codeVon(o['clinicalStatus']);
  if (r.resourceType === 'Condition') {
    const kategorien = liste(o['category']).map(codeVon);
    if (
      verifikation !== 'entered-in-error' &&
      kategorien.includes('problem-list-item') &&
      !klinisch
    )
      warnung(
        'con-3',
        'clinicalStatus',
        'Bei einer Problemliste gehört der klinische Status dazu.',
      );
    // con-4: `abatement.empty() or clinicalStatus…(resolved | remission | inactive).exists()` —
    // ohne klinischen Status (entered-in-error, con-5) also auch kein Ende.
    const abklingen = ['DateTime', 'Age', 'Period', 'Range', 'String'].some(
      (t) => o[`abatement${t}`] !== undefined,
    );
    if (abklingen && !['inactive', 'resolved', 'remission'].includes(klinisch ?? ''))
      fehler(
        'con-4',
        'abatement[x]',
        'Ein Ende nur mit Status inaktiv, behoben oder Remission — ohne Status kein Ende.',
      );
    if (verifikation === 'entered-in-error' && o['clinicalStatus'] !== undefined)
      fehler(
        'con-5',
        'clinicalStatus',
        'Bei „entered-in-error" darf kein klinischer Status stehen.',
      );
  }
  if (r.resourceType === 'AllergyIntolerance') {
    if (verifikation !== 'entered-in-error' && !klinisch)
      fehler(
        'ait-1',
        'clinicalStatus',
        'Der klinische Status ist Pflicht, außer bei „entered-in-error".',
      );
    if (verifikation === 'entered-in-error' && o['clinicalStatus'] !== undefined)
      fehler(
        'ait-2',
        'clinicalStatus',
        'Bei „entered-in-error" darf kein klinischer Status stehen.',
      );
    liste(o['reaction'])
      .filter(istObjekt)
      .forEach((re, i) => {
        if (liste(re['manifestation']).length === 0)
          fehler(
            'Pflicht R4',
            `reaction[${i}].manifestation`,
            'Jede Reaktion braucht eine Manifestation.',
          );
      });
  }
  if (r.resourceType === 'Immunization') {
    liste(o['protocolApplied'])
      .filter(istObjekt)
      .forEach((p, i) => {
        if (!vorhanden(p, 'doseNumber[x]'))
          fehler(
            'Pflicht R4',
            `protocolApplied[${i}].doseNumber[x]`,
            'Dosisnummer ist Pflicht (1..1).',
          );
      });
  }
  if (r.resourceType === 'Organization' && !o['name'] && !o['identifier'])
    fehler('org-1', '', 'Eine Organisation braucht Name oder Kennung.');
  if (r.resourceType === 'Patient') {
    liste(o['name'])
      .filter(istObjekt)
      .forEach((n, i) => {
        const da =
          n['family'] ||
          n['given'] ||
          n['text'] ||
          liste(n['extension']).some((e) => istObjekt(e) && e['url'] === DAR);
        if (!da) fehler('eu-pat-1', `name[${i}]`, 'Name braucht Familienname, Vorname oder Text.');
      });
  }
  if (r.resourceType === 'Composition') {
    const abschnitte = (w: Wert, pfad: string) =>
      liste(w)
        .filter(istObjekt)
        .forEach((s, i) => {
          const ort = `${pfad}[${i}]`;
          if (!s['text'] && liste(s['entry']).length === 0 && liste(s['section']).length === 0)
            fehler('cmp-1', ort, 'Ein Abschnitt braucht Text, Einträge oder Unterabschnitte.');
          if (s['emptyReason'] && liste(s['entry']).length > 0)
            fehler('cmp-2', ort, 'Ein Leergrund ist nur ohne Einträge zulässig.');
          abschnitte(s['section'], `${ort}.section`);
        });
    abschnitte(o['section'], 'section');
  }
  return befunde;
}

/** Verweise in einer Ressource, als Zeichenketten. */
function verweise(w: Wert, aus: string[] = []): string[] {
  if (Array.isArray(w)) w.forEach((x) => verweise(x, aus));
  else if (istObjekt(w)) {
    if (typeof w['reference'] === 'string') aus.push(w['reference']);
    for (const [k, v] of Object.entries(w)) if (k !== 'text') verweise(v, aus);
  }
  return aus;
}

/** Löst einen Verweis innerhalb eines Bundles auf — über fullUrl, auch relativ zu deren Basis. */
function aufloesen(
  verweis: string,
  vonUrl: string | undefined,
  eintraege: { fullUrl?: string; resource?: Ressource }[],
): number {
  const absolut =
    vonUrl && /^https?:\/\//.test(vonUrl) && /^[A-Z][A-Za-z]+\/[^/]+$/.test(verweis)
      ? vonUrl.replace(/[A-Z][A-Za-z]+\/[^/]+$/, verweis)
      : verweis;
  return eintraege.findIndex(
    (e) =>
      e.fullUrl === absolut ||
      e.fullUrl === verweis ||
      (e.resource && `${e.resource.resourceType}/${String(e.resource.id)}` === verweis),
  );
}

/**
 * Prüft ein Bundle samt aller Einträge. Für Dokumente zusätzlich: bdl-9, bdl-10, bdl-11 und die
 * Regeln, was ein Dokument enthalten muss und darf.
 */
export function bundlePruefen(bundle: Ressource): Pruefbefund[] {
  const befunde = ressourcePruefen(bundle);
  const o = bundle as unknown as Objekt;
  const eintraege = liste(o['entry']).filter(istObjekt) as {
    fullUrl?: string;
    resource?: Ressource;
  }[];
  const fehler = (regel: string, pfad: string, text: string) =>
    befunde.push({ schwere: 'fehler', regel, pfad: `Bundle${pfad ? `.${pfad}` : ''}`, text });

  const urls = eintraege.map((e) => e.fullUrl).filter(Boolean);
  if (new Set(urls).size !== urls.length)
    fehler('bdl-7', 'entry', 'Jede fullUrl darf nur einmal vorkommen.');
  eintraege.forEach((e) => {
    if (e.resource) befunde.push(...ressourcePruefen(e.resource));
  });

  if (o['type'] !== 'document') return befunde;
  const kennung = o['identifier'] as Objekt | undefined;
  if (!kennung?.['system'] || !kennung['value'])
    fehler('bdl-9', 'identifier', 'Ein Dokument braucht eine Kennung mit System und Wert.');
  if (!o['timestamp']) fehler('bdl-10', 'timestamp', 'Ein Dokument braucht einen Zeitstempel.');
  const erste = eintraege[0]?.resource;
  if (erste?.resourceType !== 'Composition') {
    fehler('bdl-11', 'entry[0]', 'Ein Dokument beginnt mit der Composition.');
    return befunde;
  }

  // Was die Composition referenziert, muss im Bundle liegen (Documents, „SHALL be included").
  const erreicht = new Set<number>([0]);
  const offen = [0];
  while (offen.length > 0) {
    const i = offen.pop()!;
    const e = eintraege[i]!;
    for (const v of verweise(e.resource)) {
      const ziel = aufloesen(v, e.fullUrl, eintraege);
      if (ziel < 0) {
        if (i === 0)
          fehler('Dokument', `entry[0]`, `Verweis ${v} der Composition liegt nicht im Bundle.`);
        continue;
      }
      if (!erreicht.has(ziel)) {
        erreicht.add(ziel);
        offen.push(ziel);
      }
    }
  }
  eintraege.forEach((e, i) => {
    const typ = e.resource?.resourceType;
    if (!erreicht.has(i) && typ !== 'Provenance' && typ !== 'Binary')
      fehler(
        'Dokument',
        `entry[${i}]`,
        `${typ ?? 'Eintrag'} ist von der Composition aus nicht erreichbar.`,
      );
  });
  return befunde;
}

/** Bündel oder Einzelressource — was vorliegt. */
/** Wer jede geprüfte Ressource samt Befund mitlesen will — etwa die Ausgabe für den HL7-Validator. */
export type PruefBeobachter = (ressource: Ressource, befunde: readonly Pruefbefund[]) => void;

let beobachter: PruefBeobachter | null = null;

/**
 * Meldet jede Ressource, die `fhirPruefen` prüft, an `fn` — `null` beendet das. Für Werkzeuge,
 * nicht für die Fachlogik: `npm run fhir:validieren` legt so die Ausgaben der Tests als Dateien ab.
 */
export function pruefungBeobachten(fn: PruefBeobachter | null): void {
  beobachter = fn;
}

export function fhirPruefen(r: Ressource): Pruefbefund[] {
  const befunde = r.resourceType === 'Bundle' ? bundlePruefen(r) : ressourcePruefen(r);
  beobachter?.(r, befunde);
  return befunde;
}
