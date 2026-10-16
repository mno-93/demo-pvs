import { CODESYSTEM, LISTE_LEER, zeitzonenErgaenzen, type Ressource } from '@demo-pvs/kern';
import { bestandFuer } from './bestand.ts';
import { jetzt } from './fhir-hilfen.ts';
import { uuidV7 } from './plattform.ts';
import { patientFuer } from './schreibwege.ts';

/**
 * ePA European Patient Summary des Aktensystems — Vorschau auf ePA 3.2 (ADR 0042).
 *
 * Grundlage sind zwei öffentliche Ballots, nicht normativ:
 * - `gemIG_ePA_ePS` 1.0.0-ballot.1 (`de.gematik.epa.eps`): In der ersten Stufe erzeugt das
 *   Aktensystem eine **leere** ePS (IG-ePS33932XCS) — fünf Pflicht-Sections mit
 *   `emptyReason = unavailable` und dem Text „Erforderliche Informationen können nicht ermittelt
 *   werden.“, Autor allein das Gerät „ePA-Aktensystem“, Composition `status = preliminary`. Aufbau
 *   wie das Beispiel `ExampleEmptyEPAEPSBundle` des IG.
 * - `gemIG_ePA_MHD` 1.2.0-ballot.1 (`de.gematik.epa.mhd`): Eine Suche nach
 *   `type=http://loinc.org|60591-5` mit `status=current` erzeugt die ePS samt DocumentReference
 *   (IG-MHD27048WTV). Sie ist nicht versioniert und für Clients schreibgeschützt.
 *
 * Inhaltlich ist sie das Gegenstück zur ✦ Patient Summary der Demo (`patient-summary.ts`): Der
 * Rahmen ist derselbe, die Befüllung fehlt — die „regelbasierte Befüllung“ kündigt der IG für
 * ein späteres Release an.
 */

const EPS = 'https://gematik.de/fhir/epa-eps/StructureDefinition';
export const EPA_EPS = {
  bundle: `${EPS}/epa-eps-bundle`,
  composition: `${EPS}/epa-eps-composition`,
  patient: `${EPS}/epa-eps-patient`,
  device: `${EPS}/epa-eps-device`,
} as const;

/**
 * Profil der erzeugten DocumentReference, mit Version — die 3.1.3-Wege bleiben bei 1.1.3. Das
 * Suchergebnis bleibt ohne Version: Sein Profil trägt in 1.1.3 und in 1.2.0-ballot.1 dieselbe
 * Version 1.1.2, obwohl der Inhalt verschieden ist.
 */
export const MHD_VORSCHAU = {
  dokument: 'https://gematik.de/fhir/epa-mhd/StructureDefinition/epa-mhd-document-reference|1.2.0',
  suchergebnis:
    'https://gematik.de/fhir/epa-mhd/StructureDefinition/epa-document-search-result-bundle',
} as const;

export const EPS_TYP = '60591-5';
export const EPS_FORMAT = {
  system: 'urn:oid:1.3.6.1.4.1.19376.3.276.1.5.6',
  code: 'urn:gematik:ig:patient-summary:v1.0',
  display: 'Patient Summary (gematik) v1.0',
} as const;

/** Kennung eines Dokuments nach RFC 9562, wie im Beispiel des IG. */
const RFC9562 = 'urn:ietf:rfc:9562';
const UNIQUE_ID = 'https://gematik.de/fhir/sid/epa-document-unique-id';
const KENNUNGSART = 'https://profiles.ihe.net/ITI/MHD/CodeSystem/IHE.MHD.MHDIdentifierType';
const KVNR = 'http://fhir.de/sid/gkv/kvid-10';

const LEER = 'Erforderliche Informationen können nicht ermittelt werden.';

/** Die fünf Pflicht-Sections in der Reihenfolge und mit den Bezeichnungen des IG-Beispiels. */
const PFLICHT: { titel: string; loinc: string; anzeige: string }[] = [
  { titel: 'Medikationsliste', loinc: '10160-0', anzeige: 'Medikationsanamnese - Freitext' },
  {
    titel: 'Allergien und Intoleranzen',
    loinc: '48765-2',
    anzeige: 'Allergien und unerwünschte Wirkungen - Dokument',
  },
  {
    titel: 'Gesundheitsprobleme und Risiken',
    loinc: '11450-4',
    anzeige: 'Problemliste - Berichtet',
  },
  {
    titel: 'Eingriffe und Therapien',
    loinc: '47519-4',
    anzeige: 'Anamnese der Maßnahmen - Dokument',
  },
  {
    titel: 'Implantate, medizinische Geräte und Heilbehelfe',
    loinc: '46264-8',
    anzeige: 'Anamnese zum Einsatz von Medizinprodukten',
  },
];

const erzaehlung = (text: string) => ({
  status: 'generated',
  div: `<div xmlns="http://www.w3.org/1999/xhtml"><p>${text}</p></div>`,
});

/**
 * Die leere ePS nach `gemIG_ePA_ePS` 1.0.0-ballot.1 — bei jeder Suche neu. Sie geht über ITI-68
 * unverändert hinaus und trägt die Zeitzone deshalb schon selbst (zeit.ts im Kern).
 */
export function epaEpsBilden(kvnr: string): Ressource {
  const zeit = jetzt();
  const d = bestandFuer(kvnr).demographie;
  const patientUuid = uuidV7();
  const geraetUuid = uuidV7();
  const kompositionUuid = uuidV7();
  const patient: Ressource = {
    ...patientFuer(kvnr),
    id: patientUuid,
    meta: { profile: [EPA_EPS.patient] },
  };
  const geraet: Ressource = {
    resourceType: 'Device',
    id: 'epa-ehr',
    meta: { profile: [EPA_EPS.device] },
    deviceName: [{ name: 'ePA-Aktensystem', type: 'user-friendly-name' }],
  };
  const komposition: Ressource = {
    resourceType: 'Composition',
    id: kompositionUuid,
    meta: { profile: [EPA_EPS.composition] },
    language: 'de-DE',
    identifier: { system: RFC9562, value: uuidV7() },
    status: 'preliminary',
    type: { coding: [{ system: CODESYSTEM.loinc, code: EPS_TYP, display: 'Patient Summary' }] },
    subject: {
      reference: `urn:uuid:${patientUuid}`,
      identifier: { system: KVNR, value: kvnr },
      ...(d ? { display: `${d.vorname} ${d.nachname}` } : {}),
    },
    date: zeit,
    author: [{ reference: `urn:uuid:${geraetUuid}`, display: 'ePA-Aktensystem' }],
    title: 'ePA European Patient Summary',
    section: PFLICHT.map((s) => ({
      title: s.titel,
      code: { coding: [{ system: CODESYSTEM.loinc, code: s.loinc, display: s.anzeige }] },
      text: erzaehlung(LEER),
      emptyReason: { coding: [{ system: LISTE_LEER, code: 'unavailable' }] },
    })),
  };
  return zeitzonenErgaenzen({
    resourceType: 'Bundle',
    meta: { profile: [EPA_EPS.bundle] },
    identifier: { system: RFC9562, value: uuidV7() },
    type: 'document',
    timestamp: zeit,
    entry: [
      { fullUrl: `urn:uuid:${kompositionUuid}`, resource: komposition },
      { fullUrl: `urn:uuid:${patientUuid}`, resource: patient },
      { fullUrl: `urn:uuid:${geraetUuid}`, resource: geraet },
    ],
  });
}

/**
 * DocumentReference der erzeugten ePS nach IG-MHD27048WTV. Zwei Pflichtfelder des Profils lässt
 * die Vorschrift offen: `masterIdentifier` und `documentStorageLocation`. ⚠ Die Demo belegt sie
 * wie beim dgLP-Befund bzw. beim eMP-Dokument (`masterIdentifier` = uniqueId, Speicherort `epa`) —
 * Klärungsbedarf an der Spezifikation.
 */
export function epsVerweis(
  kvnr: string,
  entryUuid: string,
  uniqueId: string,
  zeit: string,
  abrufUrl: string,
): Ressource {
  const kennungsart = (code: string) => ({ coding: [{ system: KENNUNGSART, code }] });
  return {
    resourceType: 'DocumentReference',
    id: entryUuid,
    meta: { profile: [MHD_VORSCHAU.dokument] },
    extension: [
      {
        url: 'https://gematik.de/fhir/ti/StructureDefinition/ti-document-storage-location-extension',
        valueCoding: {
          system: 'https://gematik.de/fhir/ti/CodeSystem/ti-document-storage-location-cs',
          code: 'epa',
        },
      },
    ],
    masterIdentifier: { type: kennungsart('uniqueId'), system: UNIQUE_ID, value: uniqueId },
    identifier: [
      {
        use: 'official',
        type: kennungsart('entryUUID'),
        system: 'urn:ietf:rfc:3986',
        value: `urn:uuid:${entryUuid}`,
      },
      { type: kennungsart('uniqueId'), system: UNIQUE_ID, value: uniqueId },
    ],
    status: 'current',
    type: {
      coding: [{ system: CODESYSTEM.loinc, code: EPS_TYP, display: 'Patient summary Document' }],
    },
    category: [
      {
        coding: [
          { system: 'urn:oid:1.3.6.1.4.1.19376.3.276.1.5.8', code: 'BRI', display: 'Brief' },
        ],
      },
    ],
    subject: { type: 'Patient', identifier: { system: KVNR, value: kvnr } },
    date: zeit,
    author: [{ display: 'ePA-Aktensystem' }],
    securityLabel: [
      {
        coding: [
          {
            system: 'https://gematik.de/fhir/terminology/CodeSystem/epa-data-category-other-cs',
            code: 'emergency',
            display: 'Notfalldaten',
          },
        ],
      },
    ],
    content: [
      {
        attachment: {
          contentType: 'application/fhir+json',
          language: 'de-DE',
          url: abrufUrl,
          title: 'Patient Summary',
          creation: zeit,
        },
        format: { ...EPS_FORMAT },
      },
    ],
  };
}

/**
 * Abruf einer erzeugten ePS über ihre URL (ITI-68). ⚠ Wie lange die URL gilt, regelt der Ballot
 * nicht; die Demo hält je Akte die zuletzt erzeugten zehn vor.
 */
const ABLAGE_JE_AKTE = 10;
const ablage = new Map<string, Map<string, Ressource>>();

export function epsAblegen(kvnr: string, entryUuid: string, bundle: Ressource): void {
  const akte = ablage.get(kvnr) ?? new Map<string, Ressource>();
  akte.set(entryUuid, bundle);
  while (akte.size > ABLAGE_JE_AKTE) akte.delete(akte.keys().next().value!);
  ablage.set(kvnr, akte);
}

export function epsAbrufen(kvnr: string, entryUuid: string): Ressource | undefined {
  return ablage.get(kvnr)?.get(entryUuid);
}

/** Für Tests: alle erzeugten ePS vergessen. */
export function epsAblageLeeren(): void {
  ablage.clear();
}
