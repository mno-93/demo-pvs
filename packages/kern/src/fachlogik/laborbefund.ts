import { DEMO_FHIR_BASIS, vollUrl } from '../fhir/vollurl.js';
import { zeitzonenErgaenzen } from '../fhir/zeit.js';
import type { LokalesDokument } from '../typen/dokument.js';
import type { Herkunft } from '../typen/herkunft.js';
import { CODESYSTEM, SNOMED_VERSION } from '../typen/kodierung.js';
import type { Bewertung, Laborwert } from '../typen/labor.js';
import { base64AusBytes, pdfErzeugen } from './pdf.js';
import { xmlMaskieren } from './xml.js';

/**
 * Laborbefund nach dem digital gestützten Laborprozess (dgLP).
 *
 * Grundlage ist der Content-IG `de.gematik.epa.laboratory` 1.0.0-ballot.1 (Canonical
 * `https://gematik.de/fhir/epa-laboratory`), fachlich das Fachkonzept dgLP Stufe 1 für
 * ePA 3.2. Geprüft mit dem HL7 FHIR Validator gegen das Paket (`npm run fhir:validieren`).
 * Nachgebildet sind:
 *
 * - Bundle `bundle-dglp` mit Composition, DiagnosticReport, Patient, ServiceRequest (1..1),
 *   Observations (1..*), Specimen, zwei Organisationen (Labor, Einsender), Practitioner und
 *   PractitionerRole — jeder Verweis zeigt auf einen Eintrag des Bundles;
 * - Composition `composition-dglp`: Typ SNOMED CT 4241000179101 und LOINC 11502-2 mit
 *   Versionen, Titel „Laboratory Report", Extensions für Version, Empfänger:in (Einsender),
 *   Verweis auf DiagnosticReport und Auftrag, Freigabe über `attester` (legal, nur Verweis);
 *   ein Abschnitt je Laborbereich mit Code aus `lab-studyType-eu-lab`, Erzähltext und den
 *   Untersuchungsgruppen als Einträgen;
 * - DiagnosticReport `diagnostic-report-dglp`: LOINC 11502-2, Kennungen „Auftragsnummer des
 *   Labors" und „Laborgesamtbefund" (UUID), auftragnehmendes Labor, Ergebnisse mit
 *   Sortiernummer, `presentedForm` als PDF mit Daten;
 * - ServiceRequest `service-request-dglp`: „Auftragsnummer des Einsenders", SNOMED CT
 *   721965002, Einsender als Verweis;
 * - Specimen `specimen-dglp`: Probennummer, Status, Probenart SNOMED CT, Eingang im Labor;
 * - Observations: Hierarchie Untersuchungsgruppe (`observation-laboratory-study-group-dglp`,
 *   Code „Laboruntersuchungsgruppe", Bezeichnung als Test-Profil, ohne eigenen Zeitpunkt) →
 *   Einzeluntersuchung (`observation-laboratory-study-dglp`, LOINC samt Version, UCUM,
 *   Referenzbereich mit Typ).
 *
 * Codes und Versionen stammen aus den Profilen und Beispielen des Pakets und seiner
 * Abhängigkeiten (HL7 Europe Laboratory 2.0.0, TI Common 1.5.0). Optionale Angaben
 * (Akkreditierung, kritisches Ergebnis, alternative Ergebnisse, Laborbereich an der Gruppe)
 * fehlen.
 *
 * Was der HL7-Validator trotzdem meldet, steht mit Grund in ENTWICKLUNG, „FHIR-Validator“:
 * `dr-comp-identifier` ist mit keiner Instanz erfüllbar, der Abschnitt ist ohne
 * Terminologieserver nicht zuzuordnen.
 */

export const DGLP = 'https://gematik.de/fhir/epa-laboratory/StructureDefinition/';

/** Versionen der Terminologien, wie sie der Content-IG in Mustern und Beispielen führt. */
export const LOINC_VERSION = '2.82';
/**
 * Version des gematik-Codesystems `laboratory-identificator`, wie sie die Beispiele des Pakets
 * führen (die Profile verlangen sie, 1..1). ⚠ Das Codesystem selbst liegt in keinem
 * veröffentlichten Paket; Version und Anzeigen sind nur über die Beispiele belegt.
 */
const LABOR_CS_VERSION = '1.1.0';
const LABOR_KENNUNG = 'https://gematik.de/fhir/terminology/CodeSystem/laboratory-identificator';
const V2_0203 = 'http://terminology.hl7.org/CodeSystem/v2-0203';
const TI = 'https://gematik.de/fhir/ti/StructureDefinition/';
const SORTIERUNG = `${TI}sorting-number-extension`;
const TESTPROFIL = `${TI}test-profile-laboratory-extension`;
const DATA_ABSENT_REASON = 'http://hl7.org/fhir/StructureDefinition/data-absent-reason';

const LABOR_KATEGORIE = {
  coding: [
    {
      system: 'http://terminology.hl7.org/CodeSystem/observation-category',
      code: 'laboratory',
      display: 'Laboratory',
    },
  ],
};

/**
 * Laborbereich der Beispielbefunde: Klinische Chemie, LOINC 18719-5 aus dem ValueSet
 * `lab-studyType-eu-lab` (HL7 Europe Laboratory 2.0.0, Anzeige von dort) — Code und Titel des
 * Composition-Abschnitts. Ein Befund mit weiteren Bereichen bekäme je Bereich einen Abschnitt.
 *
 * An den Untersuchungsgruppen wäre er als Kategorie möglich (0..1). Die Demo lässt ihn dort weg:
 * Das geschlossene Slicing ordnet die Kategorie über `memberOf` zu, und das kann der Validator
 * ohne Terminologieserver für LOINC nicht prüfen.
 */
const KLINISCHE_CHEMIE = {
  coding: [{ system: CODESYSTEM.loinc, code: '18719-5', display: 'Chemistry studies (set)' }],
  text: 'Klinische Chemie',
};

/**
 * Probenart in SNOMED CT — Codes aus dem ValueSet `lab-specimenType-eu-lab` (HL7 Europe
 * Laboratory 2.0.0). Unbekannte Probenarten stehen nur als Text.
 */
const PROBENART: Record<string, { code: string; display: string }> = {
  Serum: { code: '119364003', display: 'Serum specimen' },
};

/** Eigene Kennungssysteme der Demo — für Auftrags- und Probennummern, die ein System verlangen. */
const SID = `${DEMO_FHIR_BASIS}/sid/`;

export interface Messwert {
  loinc: string;
  bezeichnung: string;
  wert: number;
  /** Anzeigeeinheit, etwa „mg/dl". */
  einheit: string;
  /** UCUM-Code der Einheit. */
  ucum: string;
  referenzNiedrig: number | null;
  referenzHoch: number | null;
  referenzText: string;
}

export interface Untersuchungsgruppe {
  bezeichnung: string;
  werte: Messwert[];
}

export interface Befundangabe {
  /** Versionsunabhängige Kennung des Laborgesamtbefunds (UUID ohne Präfix). */
  uuid: string;
  /** Auftragsnummer des Labors. */
  auftragsnummer: string;
  /** Auftragsnummer des Einsenders — vergibt die beauftragende Einrichtung. */
  auftragsnummerEinsender: string;
  kvnr: string;
  patientName: { vorname: string; nachname: string };
  geburtsdatum: string;
  labor: string;
  freigebendePerson: string;
  /** Einsender: beauftragt den Befund und empfängt ihn. */
  auftraggeber: string;
  /** ISO-Zeitpunkt der Probenentnahme. */
  entnahme: string;
  /** ISO-Zeitpunkt des Probeneingangs im Labor. */
  eingang: string;
  /** ISO-Zeitpunkt der Freigabe. */
  freigabe: string;
  probenart: string;
  gruppen: Untersuchungsgruppe[];
  beurteilung: string | null;
}

export function bewertungFuer(
  w: Pick<Messwert, 'wert' | 'referenzNiedrig' | 'referenzHoch'>,
): Bewertung {
  if (w.referenzHoch !== null && w.wert > w.referenzHoch) return 'hoch';
  if (w.referenzNiedrig !== null && w.wert < w.referenzNiedrig) return 'niedrig';
  return 'normal';
}

const INTERPRETATION: Record<Bewertung, { code: string; display: string }> = {
  hoch: { code: 'H', display: 'High' },
  niedrig: { code: 'L', display: 'Low' },
  normal: { code: 'N', display: 'Normal' },
};

type Ressource = Record<string, unknown> & { resourceType: string; id: string };

const mitKomma = (n: number) => String(n).replace('.', ',');

/**
 * Grenze eines Referenzbereichs. Bei einseitigen Bereichen („> 90", „< 5,7 %") steht die fehlende
 * Grenze mit Einheit und `data-absent-reason` „not-applicable" statt Wert: Die Invariante
 * `obs-range-2` des Pakets vergleicht die Einheiten beider Grenzen ohne Prüfung, ob es beide gibt,
 * und schlüge sonst fehl — obwohl dasselbe Profil einseitige Bereiche an anderer Stelle erlaubt
 * (`obs-range-1`). ▸ Profilfehler; die Abbildung macht die fehlende Grenze ausdrücklich.
 */
function grenze(wert: number | null, w: Pick<Messwert, 'einheit' | 'ucum'>) {
  return {
    ...(wert !== null
      ? { value: wert }
      : { _value: { extension: [{ url: DATA_ABSENT_REASON, valueCode: 'not-applicable' }] } }),
    unit: w.einheit,
    system: 'http://unitsofmeasure.org',
    code: w.ucum,
  };
}

/** Erzähltext des Abschnitts: je Untersuchungsgruppe die Werte mit Referenzbereich. */
function abschnittstext(gruppen: readonly Untersuchungsgruppe[]): { status: string; div: string } {
  const zeile = (w: Messwert) => {
    const bewertung = bewertungFuer(w);
    const marke = bewertung === 'normal' ? '' : ` (${bewertung})`;
    return `<li>${xmlMaskieren(`${w.bezeichnung}: ${mitKomma(w.wert)} ${w.einheit}${marke} · Referenz ${w.referenzText}`)}</li>`;
  };
  return {
    status: 'generated',
    div: `<div xmlns="http://www.w3.org/1999/xhtml">${gruppen
      .map(
        (g) =>
          `<p><b>${xmlMaskieren(g.bezeichnung)}</b></p><ul>${g.werte.map(zeile).join('')}</ul>`,
      )
      .join('')}</div>`,
  };
}

export function laborbefundBauen(a: Befundangabe): Record<string, unknown> {
  const k = a.uuid.slice(0, 8);
  const pid = `pat-${a.kvnr}`;
  const lid = `org-${k}`;
  const eid = `org-einsender-${k}`;
  const aid = `sr-${k}`;
  const spid = `sp-${k}`;
  const drid = `dr-${k}`;
  const cid = `comp-${k}`;
  const arzt = `prac-${k}`;
  const rolle = `role-${k}`;
  const subjekt = {
    reference: `Patient/${pid}`,
    identifier: { system: 'http://fhir.de/sid/gkv/kvid-10', value: a.kvnr },
  };
  const loinc = (code: string, display: string) => ({
    system: CODESYSTEM.loinc,
    version: LOINC_VERSION,
    code,
    display,
  });
  const labor = { reference: `Organization/${lid}` };

  const patient: Ressource = {
    resourceType: 'Patient',
    id: pid,
    identifier: [{ system: 'http://fhir.de/sid/gkv/kvid-10', value: a.kvnr }],
    name: [{ family: a.patientName.nachname, given: [a.patientName.vorname] }],
    birthDate: a.geburtsdatum,
  };
  const laborOrganisation: Ressource = { resourceType: 'Organization', id: lid, name: a.labor };
  const einsender: Ressource = { resourceType: 'Organization', id: eid, name: a.auftraggeber };
  const freigebende: Ressource = {
    resourceType: 'Practitioner',
    id: arzt,
    name: [{ text: a.freigebendePerson }],
  };
  const freigaberolle: Ressource = {
    resourceType: 'PractitionerRole',
    id: rolle,
    practitioner: { reference: `Practitioner/${arzt}`, display: a.freigebendePerson },
    organization: { reference: `Organization/${lid}`, display: a.labor },
  };
  const auftrag: Ressource = {
    resourceType: 'ServiceRequest',
    id: aid,
    meta: { profile: [`${DGLP}service-request-dglp`] },
    // Geschlossenes Slicing: nur die Kennungen des Einsenders, keine Auftragsnummer des Labors.
    identifier: [
      {
        type: {
          coding: [
            {
              system: LABOR_KENNUNG,
              version: LABOR_CS_VERSION,
              code: 'AE',
              display: 'Auftragsnummer des Einsenders',
            },
          ],
        },
        system: `${SID}auftragsnummer-einsender`,
        value: a.auftragsnummerEinsender,
      },
    ],
    status: 'completed',
    intent: 'order',
    code: {
      coding: [
        {
          system: CODESYSTEM.snomed,
          version: SNOMED_VERSION,
          code: '721965002',
          display: 'Laboratory order',
        },
      ],
    },
    subject: subjekt,
    requester: { reference: `Organization/${eid}` },
  };
  const probenart = PROBENART[a.probenart];
  const probe: Ressource = {
    resourceType: 'Specimen',
    id: spid,
    meta: { profile: [`${DGLP}specimen-dglp`] },
    identifier: [
      {
        type: {
          coding: [{ system: V2_0203, version: '5.0.0', code: 'SID', display: 'Specimen ID' }],
        },
        system: `${SID}probennummer`,
        value: `${a.auftragsnummer}-1`,
      },
    ],
    status: 'available',
    type: {
      ...(probenart
        ? { coding: [{ system: CODESYSTEM.snomed, version: SNOMED_VERSION, ...probenart }] }
        : {}),
      text: a.probenart,
    },
    subject: subjekt,
    receivedTime: a.eingang,
    collection: { collectedDateTime: a.entnahme },
  };

  const einzel: Ressource[] = [];
  const gruppen: Ressource[] = a.gruppen.map((g, gi) => {
    const mitglieder = g.werte.map((w, wi) => {
      const bewertung = bewertungFuer(w);
      const obs: Ressource = {
        resourceType: 'Observation',
        id: `obs-${k}-${gi}-${wi}`,
        meta: { profile: [`${DGLP}observation-laboratory-study-dglp`] },
        status: 'final',
        category: [LABOR_KATEGORIE],
        code: { coding: [loinc(w.loinc, w.bezeichnung)], text: w.bezeichnung },
        subject: subjekt,
        effectiveDateTime: a.entnahme,
        issued: a.freigabe,
        performer: [labor],
        valueQuantity: {
          value: w.wert,
          unit: w.einheit,
          system: 'http://unitsofmeasure.org',
          code: w.ucum,
        },
        interpretation: [
          {
            coding: [
              {
                system: 'http://terminology.hl7.org/CodeSystem/v3-ObservationInterpretation',
                ...INTERPRETATION[bewertung],
              },
            ],
          },
        ],
        referenceRange: [
          {
            low: grenze(w.referenzNiedrig, w),
            high: grenze(w.referenzHoch, w),
            type: {
              coding: [
                {
                  system: 'http://terminology.hl7.org/CodeSystem/referencerange-meaning',
                  code: 'normal',
                  display: 'Normal Range',
                },
              ],
            },
            text: w.referenzText,
          },
        ],
        specimen: { reference: `Specimen/${spid}` },
      };
      einzel.push(obs);
      return {
        extension: [{ url: SORTIERUNG, valuePositiveInt: wi + 1 }],
        reference: `Observation/${obs.id}`,
      };
    });
    return {
      resourceType: 'Observation',
      id: `grp-${k}-${gi}`,
      meta: { profile: [`${DGLP}observation-laboratory-study-group-dglp`] },
      // Die Bezeichnung der Gruppe ist ihr Test-Profil, als Freitext; `code.text` ist verboten.
      extension: [{ url: TESTPROFIL, valueCodeableConcept: { text: g.bezeichnung } }],
      status: 'final',
      category: [LABOR_KATEGORIE],
      code: {
        coding: [
          {
            system: 'https://gematik.de/fhir/terminology/CodeSystem/laboratory-study-group',
            code: 'laboruntersuchungsgruppe',
            display: 'Laboruntersuchungsgruppe',
          },
        ],
      },
      subject: subjekt,
      // Die Gruppe trägt keinen eigenen Zeitpunkt (data-absent-reason not-permitted).
      _effectiveDateTime: {
        extension: [{ url: DATA_ABSENT_REASON, valueCode: 'not-permitted' }],
      },
      performer: [labor],
      hasMember: mitglieder,
    };
  });

  const bericht: Ressource = {
    resourceType: 'DiagnosticReport',
    id: drid,
    meta: { profile: [`${DGLP}diagnostic-report-dglp`] },
    extension: [
      {
        url: 'http://hl7.org/fhir/5.0/StructureDefinition/extension-DiagnosticReport.composition',
        valueReference: { reference: `Composition/${cid}` },
      },
    ],
    identifier: [
      {
        type: {
          coding: [
            {
              system: LABOR_KENNUNG,
              version: LABOR_CS_VERSION,
              code: 'AL',
              display: 'Auftragsnummer des Labors',
            },
          ],
        },
        system: `${SID}auftragsnummer-labor`,
        value: a.auftragsnummer,
      },
      {
        type: {
          coding: [
            { system: V2_0203, version: '5.0.0', code: 'RI', display: 'Resource Identifier' },
          ],
        },
        system: 'urn:ietf:rfc:3986',
        value: `urn:uuid:${a.uuid}`,
      },
    ],
    basedOn: [{ reference: `ServiceRequest/${aid}` }],
    status: 'final',
    code: { coding: [loinc('11502-2', 'Laboratory report')] },
    subject: subjekt,
    issued: a.freigabe,
    // „Auftragnehmendes Labor"
    performer: [labor],
    specimen: [{ reference: `Specimen/${spid}` }],
    result: gruppen.map((g, i) => ({
      extension: [{ url: SORTIERUNG, valuePositiveInt: i + 1 }],
      reference: `Observation/${g.id}`,
    })),
    ...(a.beurteilung ? { conclusion: a.beurteilung } : {}),
    // Der vollständige Befund als PDF (presentedForm 1..*, mit Daten).
    presentedForm: [
      {
        contentType: 'application/pdf',
        data: base64AusBytes(
          pdfErzeugen(`Laborbefund ${a.labor}`, [
            `Auftrag ${a.auftragsnummer}`,
            ...a.gruppen.flatMap((g) =>
              g.werte.map((w) => `${w.bezeichnung}: ${mitKomma(w.wert)} ${w.einheit}`),
            ),
          ]),
        ),
        title: 'Laborgesamtbefund',
        creation: a.freigabe,
      },
    ],
  };

  const komposition: Ressource = {
    resourceType: 'Composition',
    id: cid,
    meta: { profile: [`${DGLP}composition-dglp`] },
    extension: [
      {
        url: 'http://hl7.org/fhir/5.0/StructureDefinition/extension-Composition.version',
        valueString: '1',
      },
      {
        url: 'http://hl7.eu/fhir/StructureDefinition/composition-basedOn-order-or-requisition',
        valueReference: { reference: `ServiceRequest/${aid}` },
      },
      {
        url: 'http://hl7.eu/fhir/extensions/StructureDefinition/composition-diagnosticReportReference',
        valueReference: { reference: `DiagnosticReport/${drid}` },
      },
      {
        url: 'http://hl7.eu/fhir/StructureDefinition/information-recipient',
        valueReference: { reference: `Organization/${eid}` },
      },
    ],
    // Dieselbe UUID wie die Kennung „Laborgesamtbefund" des DiagnosticReport — gleich im Sinn von
    // dr-comp-identifier ist sie trotzdem nicht: Hier ist `type` verboten, dort Pflicht.
    identifier: { system: 'urn:ietf:rfc:3986', value: `urn:uuid:${a.uuid}` },
    status: 'final',
    type: {
      coding: [
        {
          system: CODESYSTEM.snomed,
          version: SNOMED_VERSION,
          code: '4241000179101',
          display: 'Laboratory report',
        },
        loinc('11502-2', 'Laboratory report'),
      ],
    },
    subject: subjekt,
    date: a.freigabe,
    author: [labor],
    title: 'Laboratory Report',
    // Freigabe nur als Verweis (`party.display` ist verboten); der Name steht am Practitioner.
    attester: [
      { mode: 'legal', time: a.freigabe, party: { reference: `PractitionerRole/${rolle}` } },
    ],
    section: [
      {
        title: KLINISCHE_CHEMIE.text,
        code: { coding: KLINISCHE_CHEMIE.coding },
        text: abschnittstext(a.gruppen),
        entry: gruppen.map((g) => ({ reference: `Observation/${g.id}` })),
      },
    ],
  };

  const alle = [
    komposition,
    bericht,
    patient,
    auftrag,
    laborOrganisation,
    einsender,
    freigebende,
    freigaberolle,
    probe,
    ...gruppen,
    ...einzel,
  ];
  // Intern ohne Zeitzone, im Befund mit (zeit.ts).
  return zeitzonenErgaenzen({
    resourceType: 'Bundle',
    id: `bundle-${a.uuid.slice(0, 8)}`,
    meta: { profile: [`${DGLP}bundle-dglp`] },
    identifier: { system: 'urn:ietf:rfc:3986', value: `urn:uuid:${a.uuid}` },
    type: 'document',
    timestamp: a.freigabe,
    entry: alle.map((r) => ({ fullUrl: vollUrl(r), resource: r })),
  });
}

/* ---------- Lesen ---------- */

export interface Befundkopf {
  uuid: string;
  auftragsnummer: string;
  labor: string;
  freigebendePerson: string;
  freigabe: string;
  entnahme: string;
  probenart: string;
  beurteilung: string | null;
}

function eintraege(bundle: unknown): Ressource[] {
  const e = (bundle as { entry?: { resource?: Ressource }[] })?.entry ?? [];
  return e.map((x) => x.resource).filter((r): r is Ressource => !!r);
}

/** Ist das Bundle ein Laborbefund nach dgLP? Geprüft wird der Typ der Composition. */
export function istLaborbefund(bundle: unknown): boolean {
  const komposition = eintraege(bundle).find((r) => r.resourceType === 'Composition');
  const kodierungen =
    (komposition?.['type'] as { coding?: { code?: string }[] } | undefined)?.coding ?? [];
  return kodierungen.some((k) => k.code === '4241000179101' || k.code === '11502-2');
}

type Verweis = { reference?: string; display?: string } | undefined;

/** Der Eintrag des Bundles, auf den ein relativer Verweis wie `Organization/x` zeigt. */
function aufloesen(r: readonly Ressource[], verweis: Verweis): Ressource | undefined {
  return r.find((x) => `${x.resourceType}/${x.id}` === verweis?.reference);
}

/** Name der freigebenden Person: Freigabe → PractitionerRole (oder Practitioner) → Name. */
function freigebendeLesen(r: readonly Ressource[], komposition: Ressource | undefined): string {
  const partei = (komposition?.['attester'] as { party?: Verweis }[] | undefined)?.[0]?.party;
  const rolle = aufloesen(r, partei);
  const person =
    rolle?.resourceType === 'Practitioner'
      ? rolle
      : aufloesen(r, rolle?.['practitioner'] as Verweis);
  const name = (person?.['name'] as { text?: string }[] | undefined)?.[0]?.text;
  return name ?? (rolle?.['practitioner'] as Verweis)?.display ?? '';
}

export function befundkopfLesen(bundle: unknown): Befundkopf | null {
  if (!istLaborbefund(bundle)) return null;
  const r = eintraege(bundle);
  const bericht = r.find((x) => x.resourceType === 'DiagnosticReport');
  const komposition = r.find((x) => x.resourceType === 'Composition');
  // Das Labor ist Verfasser des Befunds; im Bundle steht auch der Einsender als Organisation.
  const labor =
    aufloesen(r, (komposition?.['author'] as Verweis[] | undefined)?.[0]) ??
    r.find((x) => x.resourceType === 'Organization');
  const probe = r.find((x) => x.resourceType === 'Specimen');
  const kennungen =
    (bericht?.['identifier'] as { value?: string; type?: { coding?: { code?: string }[] } }[]) ??
    [];
  const uuid =
    kennungen.find((k) => k.type?.coding?.[0]?.code === 'RI')?.value?.replace('urn:uuid:', '') ??
    '';
  const auftragsnummer = kennungen.find((k) => k.type?.coding?.[0]?.code === 'AL')?.value ?? '';
  return {
    uuid,
    auftragsnummer,
    labor: String(labor?.['name'] ?? ''),
    freigebendePerson: freigebendeLesen(r, komposition),
    freigabe: String(bericht?.['issued'] ?? ''),
    entnahme: String(
      (probe?.['collection'] as { collectedDateTime?: string } | undefined)?.collectedDateTime ??
        '',
    ),
    probenart: String((probe?.['type'] as { text?: string } | undefined)?.text ?? ''),
    beurteilung: (bericht?.['conclusion'] as string | undefined) ?? null,
  };
}

/**
 * Liest die Einzelwerte aus einem Laborbefund.
 *
 * Laborwerte werden im Praxissystem nicht erfasst, sondern ausschließlich aus Befunden
 * gelesen — das ist die Festlegung vom 10.09.2026. Diese Funktion ist der einzige Weg,
 * auf dem ein Laborwert entsteht.
 */
export function laborwerteAusBefund(
  bundle: unknown,
  patientId: string,
  herkunft: Herkunft,
): Laborwert[] {
  const kopf = befundkopfLesen(bundle);
  if (!kopf) return [];
  return eintraege(bundle)
    .filter((r) => r.resourceType === 'Observation' && r['valueQuantity'])
    .map((o) => {
      const code =
        (o['code'] as { coding?: { code?: string; display?: string }[]; text?: string }) ?? {};
      const menge = o['valueQuantity'] as { value: number; unit: string };
      const bereich = (o['referenceRange'] as { text?: string }[] | undefined)?.[0];
      const deutung = (o['interpretation'] as { coding?: { code?: string }[] }[] | undefined)?.[0]
        ?.coding?.[0]?.code;
      const bewertung: Bewertung =
        deutung === 'H' ? 'hoch' : deutung === 'L' ? 'niedrig' : 'normal';
      return {
        id: `${patientId}-${String(o.id)}`,
        patientId,
        loinc: code.coding?.[0]?.code ?? '',
        bezeichnung: code.text ?? code.coding?.[0]?.display ?? '',
        wert: String(menge.value).replace('.', ','),
        einheit: menge.unit,
        referenz: bereich?.text ?? '',
        bewertung,
        erhobenAm: String(o['effectiveDateTime'] ?? '').slice(0, 10),
        herkunft,
      };
    });
}

/* ---------- Laborbefunde der Dokumentenablage ---------- */

export interface GelesenerBefund {
  kopf: Befundkopf;
  werte: Laborwert[];
  /** Untersuchungsgruppen mit ihren Einzelwerten, in der Reihenfolge des Befunds. */
  gruppen: { bezeichnung: string; werte: Laborwert[] }[];
}

export interface Laborbefund extends GelesenerBefund {
  dokument: LokalesDokument;
}

/**
 * Liest einen Laborbefund vollständig: Kopf, Werte, Gruppen. Die Herkunft der Werte ist der
 * Befund selbst — Labor, freigebende Person, Freigabezeitpunkt und, sofern bekannt, das
 * Dokument, in dem er liegt.
 */
export function laborbefundLesen(
  bundle: unknown,
  patientId: string,
  ablage: { bestand: Herkunft['bestand']; dokumentId: string | null },
): GelesenerBefund | null {
  const kopf = befundkopfLesen(bundle);
  if (!kopf) return null;
  const herkunft: Herkunft = {
    bestand: ablage.bestand,
    quelle: kopf.labor,
    zeitpunkt: kopf.freigabe,
    verantwortlich: kopf.freigebendePerson,
    dokumentId: ablage.dokumentId,
  };
  const werte = laborwerteAusBefund(bundle, patientId, herkunft);
  return { kopf, werte, gruppen: gruppenLesen(bundle, werte) };
}

/**
 * Alle Laborbefunde einer Dokumentenablage, jüngster zuerst.
 *
 * Ein Laborwert gehört damit immer zu einem Befund und trägt dessen Herkunft. Eine Liste
 * loser Einzelwerte ohne Befund gibt es im Praxissystem nicht.
 */
export function laborbefundeAusDokumenten(dokumente: readonly LokalesDokument[]): Laborbefund[] {
  const befunde: Laborbefund[] = [];
  for (const dokument of dokumente) {
    const gelesen = laborbefundLesen(dokument.inhalt, dokument.patientId, {
      bestand: 'lokal',
      dokumentId: dokument.id,
    });
    if (gelesen) befunde.push({ ...gelesen, dokument });
  }
  return befunde.sort((a, b) => b.kopf.freigabe.localeCompare(a.kopf.freigabe));
}

/** Alle Laborwerte einer Dokumentenablage — abgeleitet, nie erfasst. */
export function laborwerteAusDokumenten(dokumente: readonly LokalesDokument[]): Laborwert[] {
  return laborbefundeAusDokumenten(dokumente).flatMap((b) => b.werte);
}

function gruppenLesen(bundle: unknown, werte: Laborwert[]): Laborbefund['gruppen'] {
  const r = eintraege(bundle);
  const bericht = r.find((x) => x.resourceType === 'DiagnosticReport');
  const verweise = ((bericht?.['result'] as { reference?: string }[] | undefined) ?? []).map((v) =>
    String(v.reference ?? '').replace('Observation/', ''),
  );
  return verweise
    .map((id) => r.find((x) => x.resourceType === 'Observation' && x.id === id))
    .filter((g): g is Ressource => !!g)
    .map((g) => {
      const mitglieder = ((g['hasMember'] as { reference?: string }[] | undefined) ?? []).map((m) =>
        String(m.reference ?? '').replace('Observation/', ''),
      );
      return {
        bezeichnung: gruppenbezeichnung(g),
        werte: werte.filter((w) => mitglieder.some((m) => w.id.endsWith(`-${m}`))),
      };
    });
}

/**
 * Überschrift einer Untersuchungsgruppe: das Test-Profil, sonst der Laborbereich, als Text
 * (dgLP: „Laborbereich" oder „Laborbereich mit Test-Profil").
 */
function gruppenbezeichnung(g: Ressource): string {
  type Konzept = { text?: string; coding?: { display?: string }[] };
  const profil = (
    (g['extension'] ?? []) as { url?: string; valueCodeableConcept?: Konzept }[]
  ).find((e) => e.url === TESTPROFIL)?.valueCodeableConcept;
  const bereich = ((g['category'] as Konzept[] | undefined) ?? []).find((c) => c.text)?.text;
  return profil?.text ?? profil?.coding?.[0]?.display ?? bereich ?? 'Untersuchungen';
}
