import type { Adressbucheintrag } from '../beispiele.js';
import { allergieNachFhir, diagnoseNachFhir, patientNachFhir } from '../fhir/abbildung.js';
import type { Ressource } from '../fhir/typen.js';
import { reaktionenAlsText, type Allergie } from '../typen/allergie.js';
import type { Diagnose } from '../typen/diagnose.js';
import type { Patient } from '../typen/person.js';
import type { XdsCode } from './xds.js';

/**
 * ✦ Der ambulante Arztbrief als FHIR-Dokument.
 *
 * Verbindliche Vorgaben für einen strukturierten ambulanten Brief gibt es nicht. Heute gilt die
 * Richtlinie elektronischer Brief der KBV (§ 383 SGB V): eine PDF/A-Datei mit allen Inhalten,
 * dazu ein CDA nach dem VHitG-Leitfaden „Arztbrief", dessen Körper leer sein darf. Die Demo
 * nimmt die Richtung vorweg, die der MIO Krankenhaus-Entlassbrief einschlägt:
 *
 * - **Aufbau nach dem MIO KH-Entlassbrief 1.0.0** (`kbv.mio.kh-entlassbrief`, Entwurf):
 *   Bundle vom Typ `document`, Composition mit Abschnitten, je Abschnitt Erzähltext; Diagnosen,
 *   Allergien und Medikation zusätzlich als Einträge. Der Entlassbrief wird nach europäischem
 *   Vorbild weiterentwickelt (HL7 Europe Hospital Discharge Report); der ambulante Brief soll
 *   ähnlich aufgebaut werden.
 * - **Einträge aus denselben Abbildungen wie die ePA-Listen:** Condition nach
 *   `ti-condition-diagnosis`, AllergyIntolerance nach `allergyIntolerance-eu-core`. Was im Brief
 *   steht, ist damit dasselbe, was in der Diagnosen- und Allergienliste stünde.
 * - **Ambulante Abweichungen ✦:** Begegnung `AMB` statt `IMP`; Dokumenttyp LOINC 11488-4
 *   „Consult note"; Abschnittscodes für ambulante Inhalte. ⚠ Die LOINC-Codes sind nicht gegen
 *   einen Terminologieserver geprüft.
 * - **Empfänger ✦:** Die Composition kennt keinen Empfänger. Die Demo trägt ihn als Extension im
 *   eigenen Namensraum, damit die Druckansicht ihn adressieren kann.
 *
 * Laborwerte stehen wie im Entlassbrief nur im Erzähltext: Strukturiert kommen sie aus dem
 * Laborbefund nach dgLP, nicht aus dem Brief.
 */

const LOINC = 'http://loinc.org';
const ATC = 'http://fhir.de/CodeSystem/bfarm/atc';
export const EMPFAENGER_EXTENSION =
  'https://example.org/demo-pvs/fhir/StructureDefinition/letter-recipient';

/** Abschnitte des ambulanten Briefs: Überschrift und LOINC-Code (⚠ ungeprüft). */
export const ARZTBRIEF_ABSCHNITT = {
  anlass: { titel: 'Fragestellung', loinc: '42349-1', anzeige: 'Reason for referral (narrative)' },
  diagnosen: { titel: 'Diagnosen', loinc: '29548-5', anzeige: 'Diagnosis Narrative' },
  allergien: {
    titel: 'Allergien und Unverträglichkeiten',
    loinc: '48765-2',
    anzeige: 'Allergies and adverse reactions Document',
  },
  befunde: {
    titel: 'Befunde',
    loinc: '30954-2',
    anzeige: 'Relevant diagnostic tests/laboratory data Narrative',
  },
  beurteilung: { titel: 'Beurteilung', loinc: '51848-0', anzeige: 'Evaluation note' },
  medikation: {
    titel: 'Medikation',
    loinc: '10160-0',
    anzeige: 'History of Medication use Narrative',
  },
  empfehlungen: { titel: 'Empfehlungen', loinc: '18776-5', anzeige: 'Plan of care note' },
} as const;

/**
 * XDS-Metadaten des Briefs. `classCode` und `typeCode` wie im IG des eArztbriefs
 * (`ig-eab.json`, ePA-XDS-Document, Commit c88635c). Der dortige formatCode
 * `urn:gematik:ig:Arztbrief:r3.1` gilt nur für den CDA-Brief und ist seit dem 01.04.2026
 * nur noch lesbar (`clientReadOnlyFromDate`). Für ein FHIR-Dokument gibt es keinen
 * registrierten formatCode — daher ✦ einer im Namensraum der Demo.
 */
export const ARZTBRIEF_XDS = {
  classCode: { code: 'BRI', system: '1.3.6.1.4.1.19376.3.276.1.5.8', anzeige: 'Brief' },
  typeCode: { code: 'BERI', system: '1.3.6.1.4.1.19376.3.276.1.5.9', anzeige: 'Arztberichte' },
  formatCode: {
    code: 'https://example.org/demo-pvs/fhir/arztbrief|0.1',
    system: 'https://example.org/demo-pvs/fhir/CodeSystem/format-code',
    anzeige: '✦ Arztbrief FHIR (Demo)',
  },
} as const satisfies Record<string, XdsCode>;

export interface Briefmittel {
  bezeichnung: string;
  dosierung: string;
  grund: string | null;
  atc: string | null;
}

export interface Arztbriefangabe {
  /** UUID des Dokuments — `Bundle.identifier`. */
  dokumentId: string;
  /** ISO-Zeitpunkt der Unterschrift. */
  zeitpunkt: string;
  patient: Patient;
  verfasser: { name: string; lanr: string | null };
  einrichtung: {
    name: string;
    telematikId: string;
    anschrift: string[];
    telefon: string;
  };
  empfaenger: Adressbucheintrag | null;
  anlass: string;
  diagnosen: readonly Diagnose[];
  allergien: readonly Allergie[];
  befunde: readonly string[];
  beurteilung: string;
  medikation: readonly Briefmittel[];
  empfehlungen: string;
}

/** Diagnose als Zeile — ICD-10-GM mit Zusatzkennzeichen, wie im Brief üblich. */
export function diagnosezeile(d: Diagnose): string {
  const seite = d.seitenlokalisation ? ` ${d.seitenlokalisation}` : '';
  return `${d.code} ${d.zusatzkennzeichen}${seite} ${d.bezeichnung}`;
}

export function allergiezeile(a: Allergie): string {
  const reaktion = reaktionenAlsText(a.reaktionen);
  return `${a.substanz} (${a.typ}, ${a.gewissheit})${reaktion ? ` — ${reaktion}` : ''}`;
}

export function mittelzeile(m: Briefmittel): string {
  return `${m.bezeichnung} — ${m.dosierung}${m.grund ? ` — Grund: ${m.grund}` : ''}`;
}

/** Absätze aus Freitext: Leerzeilen trennen, einfache Umbrüche bleiben im Absatz. */
export function absaetzeAus(text: string): string[] {
  return text
    .split(/\n\s*\n/)
    .map((t) => t.replace(/\s*\n\s*/g, ' ').trim())
    .filter(Boolean);
}

function maskieren(t: string): string {
  return t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function erzaehlung(absaetze: readonly string[]) {
  return {
    status: 'generated',
    div: `<div xmlns="http://www.w3.org/1999/xhtml">${absaetze.map((p) => `<p>${maskieren(p)}</p>`).join('')}</div>`,
  };
}

/** Das FHIR-Dokument. `uuid` vergibt die Kennungen der Einträge; im Test fest, sonst zufällig. */
export function arztbriefBauen(
  a: Arztbriefangabe,
  uuid: () => string = () => crypto.randomUUID(),
): Record<string, unknown> {
  const kvnr = a.patient.versicherung.kvnr;
  const url = new Map<string, string>();
  const verweis = (schluessel: string) => {
    if (!url.has(schluessel)) url.set(schluessel, `urn:uuid:${uuid()}`);
    return url.get(schluessel)!;
  };
  const pat = { reference: verweis('patient') };
  const aerztin = { reference: verweis('verfasser'), display: a.verfasser.name };
  const praxis = { reference: verweis('praxis'), display: a.einrichtung.name };
  const begegnung = { reference: verweis('begegnung') };

  const diagnosen = a.diagnosen.map((d) => ({
    ...diagnoseNachFhir(d, kvnr),
    id: undefined,
    subject: { ...pat, identifier: { system: 'http://fhir.de/sid/gkv/kvid-10', value: kvnr } },
    encounter: begegnung,
    _url: verweis(`diagnose:${d.id}`),
  }));
  const allergien = a.allergien.map((x) => ({
    ...allergieNachFhir(x, kvnr),
    id: undefined,
    patient: { ...pat, identifier: { system: 'http://fhir.de/sid/gkv/kvid-10', value: kvnr } },
    encounter: begegnung,
    _url: verweis(`allergie:${x.id}`),
  }));
  const medikation = a.medikation.map((m, i) => ({
    resourceType: 'MedicationStatement',
    status: 'active',
    medicationCodeableConcept: {
      ...(m.atc ? { coding: [{ system: ATC, code: m.atc }] } : {}),
      text: m.bezeichnung,
    },
    subject: pat,
    dateAsserted: a.zeitpunkt.slice(0, 10),
    informationSource: aerztin,
    ...(m.grund ? { reasonCode: [{ text: m.grund }] } : {}),
    dosage: [{ text: m.dosierung }],
    _url: verweis(`mittel:${i}`),
  }));

  const S = ARZTBRIEF_ABSCHNITT;
  const abschnitt = (
    s: (typeof S)[keyof typeof S],
    absaetze: readonly string[],
    eintraege: { _url: string }[] = [],
    leer?: string,
  ) => ({
    title: s.titel,
    code: { coding: [{ system: LOINC, code: s.loinc, display: s.anzeige }] },
    text: erzaehlung(absaetze.length > 0 ? absaetze : leer ? [leer] : []),
    ...(eintraege.length > 0 ? { entry: eintraege.map((e) => ({ reference: e._url })) } : {}),
    ...(absaetze.length === 0 && leer
      ? {
          emptyReason: {
            coding: [
              {
                system: 'http://terminology.hl7.org/CodeSystem/list-empty-reason',
                code: 'unavailable',
              },
            ],
          },
        }
      : {}),
  });
  const abschnitte = [
    absaetzeAus(a.anlass).length > 0 && abschnitt(S.anlass, absaetzeAus(a.anlass)),
    a.diagnosen.length > 0 && abschnitt(S.diagnosen, a.diagnosen.map(diagnosezeile), diagnosen),
    // Allergien stehen immer im Brief — ein fehlender Abschnitt hieße nicht „keine".
    abschnitt(
      S.allergien,
      a.allergien.map(allergiezeile),
      allergien,
      'Keine Allergien oder Unverträglichkeiten dokumentiert.',
    ),
    a.befunde.length > 0 && abschnitt(S.befunde, a.befunde),
    absaetzeAus(a.beurteilung).length > 0 && abschnitt(S.beurteilung, absaetzeAus(a.beurteilung)),
    a.medikation.length > 0 && abschnitt(S.medikation, a.medikation.map(mittelzeile), medikation),
    absaetzeAus(a.empfehlungen).length > 0 &&
      abschnitt(S.empfehlungen, absaetzeAus(a.empfehlungen)),
  ].filter(Boolean);

  const empfaenger = a.empfaenger;
  const komposition = {
    resourceType: 'Composition',
    ...(empfaenger
      ? {
          extension: [
            {
              url: EMPFAENGER_EXTENSION,
              valueReference: { reference: verweis('empfaenger'), display: empfaenger.einrichtung },
            },
          ],
        }
      : {}),
    status: 'final',
    type: { coding: [{ system: LOINC, code: '11488-4', display: 'Consult note' }] },
    subject: pat,
    encounter: begegnung,
    date: a.zeitpunkt,
    author: [aerztin, praxis],
    title: 'Arztbrief',
    // ⚠ Die qualifizierte elektronische Signatur mit dem eHBA bildet die Demo nicht nach.
    attester: [{ mode: 'legal', time: a.zeitpunkt, party: aerztin }],
    custodian: praxis,
    section: abschnitte,
    _url: verweis('komposition'),
  };

  const patient = { ...patientNachFhir(a.patient), id: undefined, _url: pat.reference };
  const verfasser = {
    resourceType: 'Practitioner',
    ...(a.verfasser.lanr
      ? {
          identifier: [
            { system: 'https://fhir.kbv.de/NamingSystem/KBV_NS_Base_ANR', value: a.verfasser.lanr },
          ],
        }
      : {}),
    name: [{ text: a.verfasser.name }],
    _url: aerztin.reference,
  };
  const organisation = {
    resourceType: 'Organization',
    identifier: [
      { system: 'https://gematik.de/fhir/sid/telematik-id', value: a.einrichtung.telematikId },
    ],
    name: a.einrichtung.name,
    telecom: [{ system: 'phone', value: a.einrichtung.telefon }],
    address: [
      { text: a.einrichtung.anschrift.join(', '), line: a.einrichtung.anschrift.slice(0, 1) },
    ],
    _url: praxis.reference,
  };
  const begegnungRessource = {
    resourceType: 'Encounter',
    status: 'finished',
    class: {
      system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode',
      code: 'AMB',
      display: 'ambulatory',
    },
    subject: pat,
    period: { start: a.zeitpunkt.slice(0, 10), end: a.zeitpunkt.slice(0, 10) },
    serviceProvider: praxis,
    _url: begegnung.reference,
  };
  const empfaengerRessource = empfaenger && {
    resourceType: 'Organization',
    name: empfaenger.einrichtung,
    ...(empfaenger.person ? { contact: [{ name: { text: empfaenger.person } }] } : {}),
    address: [{ line: empfaenger.anschrift }],
    ...(empfaenger.kim ? { telecom: [{ system: 'email', value: empfaenger.kim }] } : {}),
    _url: verweis('empfaenger'),
  };

  const alle: { _url: string }[] = [
    komposition,
    patient,
    verfasser,
    organisation,
    begegnungRessource,
    ...(empfaengerRessource ? [empfaengerRessource] : []),
    ...diagnosen,
    ...allergien,
    ...medikation,
  ];
  return {
    resourceType: 'Bundle',
    identifier: { system: 'urn:ietf:rfc:3986', value: `urn:uuid:${a.dokumentId}` },
    type: 'document',
    timestamp: a.zeitpunkt,
    entry: alle.map(({ _url, ...rest }) => {
      const resource = Object.fromEntries(
        Object.entries(rest).filter(([, v]) => v !== undefined),
      ) as Ressource;
      return { fullUrl: _url, resource };
    }),
  };
}
