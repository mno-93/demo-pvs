import type { LokalesDokument } from '../typen/dokument.js';
import type { Herkunft } from '../typen/herkunft.js';
import type { Bewertung, Laborwert } from '../typen/labor.js';
import { base64AusBytes, pdfErzeugen } from './pdf.js';

/**
 * Laborbefund nach dem digital gestützten Laborprozess (dgLP).
 *
 * Grundlage ist der Content-IG `de.gematik.epa.laboratory` 1.0.0-ballot.1 (Canonical
 * `https://gematik.de/fhir/epa-laboratory`), fachlich das Fachkonzept dgLP Stufe 1 für
 * ePA 3.2. Nachgebildet sind:
 *
 * - Bundle `bundle-dglp` mit Composition, DiagnosticReport, Patient, ServiceRequest (1..1),
 *   Observations (1..*), Specimen, Organization, Practitioner und PractitionerRole;
 * - Composition `composition-dglp`: Typ SNOMED CT 4241000179101 und LOINC 11502-2 mit
 *   Versionen, Titel „Laboratory Report", Extensions für Version, Empfänger:in, Verweis auf
 *   DiagnosticReport und Auftrag, Freigabe über `attester` (legal);
 * - DiagnosticReport `diagnostic-report-dglp`: LOINC 11502-2, Kennungen „Auftragsnummer des
 *   Labors" und „Laborgesamtbefund" (UUID), Ergebnisse mit Sortiernummer, `presentedForm` als
 *   PDF mit Daten;
 * - Observations `observation-laboratory-study-group-dglp` (Untersuchungsgruppe) und
 *   `observation-laboratory-study-dglp` (Einzeluntersuchung) mit LOINC samt Version, UCUM,
 *   Referenzbereich mit Typ.
 *
 * ⚠ Nicht gegen die Profile validiert. Optionale Extensions (Akkreditierung, kritisches
 * Ergebnis, Testprofil, alternative Ergebnisse) fehlen.
 */

export const DGLP = 'https://gematik.de/fhir/epa-laboratory/StructureDefinition/';

/** Versionen der Terminologien, wie sie der Content-IG in Mustern und Beispielen führt. */
export const LOINC_VERSION = '2.82';
const SNOMED_DE_20260515 = 'http://snomed.info/sct/11000274103/version/20260515';
const SORTIERUNG = 'https://gematik.de/fhir/ti/StructureDefinition/sorting-number-extension';

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
  auftragsnummer: string;
  kvnr: string;
  patientName: { vorname: string; nachname: string };
  geburtsdatum: string;
  labor: string;
  freigebendePerson: string;
  auftraggeber: string;
  /** ISO-Zeitpunkt der Probenentnahme. */
  entnahme: string;
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

export function laborbefundBauen(a: Befundangabe): Record<string, unknown> {
  const pid = `pat-${a.kvnr}`;
  const lid = `org-${a.uuid.slice(0, 8)}`;
  const aid = `sr-${a.uuid.slice(0, 8)}`;
  const spid = `sp-${a.uuid.slice(0, 8)}`;
  const drid = `dr-${a.uuid.slice(0, 8)}`;
  const cid = `comp-${a.uuid.slice(0, 8)}`;
  const arzt = `prac-${a.uuid.slice(0, 8)}`;
  const rolle = `role-${a.uuid.slice(0, 8)}`;
  const subjekt = {
    reference: `Patient/${pid}`,
    identifier: { system: 'http://fhir.de/sid/gkv/kvid-10', value: a.kvnr },
  };
  const loinc = (code: string, display: string) => ({
    system: 'http://loinc.org',
    version: LOINC_VERSION,
    code,
    display,
  });

  const patient: Ressource = {
    resourceType: 'Patient',
    id: pid,
    identifier: [{ system: 'http://fhir.de/sid/gkv/kvid-10', value: a.kvnr }],
    name: [{ family: a.patientName.nachname, given: [a.patientName.vorname] }],
    birthDate: a.geburtsdatum,
  };
  const labor: Ressource = { resourceType: 'Organization', id: lid, name: a.labor };
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
    status: 'completed',
    intent: 'order',
    subject: subjekt,
    requester: { display: a.auftraggeber },
    identifier: [{ value: a.auftragsnummer }],
  };
  const probe: Ressource = {
    resourceType: 'Specimen',
    id: spid,
    meta: { profile: [`${DGLP}specimen-dglp`] },
    type: { text: a.probenart },
    subject: subjekt,
    collection: { collectedDateTime: a.entnahme },
  };

  const einzel: Ressource[] = [];
  const gruppen: Ressource[] = a.gruppen.map((g, gi) => {
    const mitglieder = g.werte.map((w, wi) => {
      const bewertung = bewertungFuer(w);
      const obs: Ressource = {
        resourceType: 'Observation',
        id: `obs-${a.uuid.slice(0, 8)}-${gi}-${wi}`,
        meta: { profile: [`${DGLP}observation-laboratory-study-dglp`] },
        status: 'final',
        category: [
          {
            coding: [
              {
                system: 'http://terminology.hl7.org/CodeSystem/observation-category',
                code: 'laboratory',
              },
            ],
          },
        ],
        code: { coding: [loinc(w.loinc, w.bezeichnung)], text: w.bezeichnung },
        subject: subjekt,
        effectiveDateTime: a.entnahme,
        issued: a.freigabe,
        performer: [{ reference: `Organization/${lid}` }],
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
            ...(w.referenzNiedrig !== null
              ? {
                  low: {
                    value: w.referenzNiedrig,
                    unit: w.einheit,
                    system: 'http://unitsofmeasure.org',
                    code: w.ucum,
                  },
                }
              : {}),
            ...(w.referenzHoch !== null
              ? {
                  high: {
                    value: w.referenzHoch,
                    unit: w.einheit,
                    system: 'http://unitsofmeasure.org',
                    code: w.ucum,
                  },
                }
              : {}),
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
      id: `grp-${a.uuid.slice(0, 8)}-${gi}`,
      meta: { profile: [`${DGLP}observation-laboratory-study-group-dglp`] },
      status: 'final',
      category: [
        {
          coding: [
            {
              system: 'http://terminology.hl7.org/CodeSystem/observation-category',
              code: 'laboratory',
            },
          ],
        },
      ],
      code: {
        coding: [
          {
            system: 'https://gematik.de/fhir/terminology/CodeSystem/laboratory-study-group',
            code: 'laboruntersuchungsgruppe',
            display: 'Laboruntersuchungsgruppe',
          },
        ],
        text: g.bezeichnung,
      },
      subject: subjekt,
      // Die Gruppe trägt keinen eigenen Zeitpunkt (data-absent-reason not-permitted).
      _effectiveDateTime: {
        extension: [
          {
            url: 'http://hl7.org/fhir/StructureDefinition/data-absent-reason',
            valueCode: 'not-permitted',
          },
        ],
      },
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
              system: 'https://gematik.de/fhir/terminology/CodeSystem/laboratory-identificator',
              code: 'AL',
              display: 'Auftragsnummer des Labors',
            },
          ],
        },
        value: a.auftragsnummer,
      },
      {
        type: {
          coding: [
            {
              system: 'http://terminology.hl7.org/CodeSystem/v2-0203',
              version: '5.0.0',
              code: 'RI',
              display: 'Resource Identifier',
            },
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
    performer: [{ reference: `PractitionerRole/${rolle}` }],
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
              g.werte.map(
                (w) => `${w.bezeichnung}: ${String(w.wert).replace('.', ',')} ${w.einheit}`,
              ),
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
        valueReference: { display: a.auftraggeber },
      },
    ],
    identifier: { system: 'urn:ietf:rfc:3986', value: `urn:uuid:${a.uuid}` },
    status: 'final',
    type: {
      coding: [
        {
          system: 'http://snomed.info/sct',
          version: SNOMED_DE_20260515,
          code: '4241000179101',
          display: 'Laboratory report',
        },
        loinc('11502-2', 'Laboratory report'),
      ],
    },
    subject: subjekt,
    date: a.freigabe,
    author: [{ reference: `Organization/${lid}` }],
    title: 'Laboratory Report',
    attester: [
      {
        mode: 'legal',
        time: a.freigabe,
        party: { reference: `PractitionerRole/${rolle}`, display: a.freigebendePerson },
      },
    ],
    section: gruppen.map((g) => ({
      title: String((g['code'] as { text: string }).text),
      entry: [{ reference: `Observation/${g.id}` }],
    })),
  };

  const alle = [
    komposition,
    bericht,
    patient,
    auftrag,
    labor,
    freigebende,
    freigaberolle,
    probe,
    ...gruppen,
    ...einzel,
  ];
  return {
    resourceType: 'Bundle',
    id: `bundle-${a.uuid.slice(0, 8)}`,
    meta: { profile: [`${DGLP}bundle-dglp`] },
    identifier: { system: 'urn:ietf:rfc:3986', value: `urn:uuid:${a.uuid}` },
    type: 'document',
    timestamp: a.freigabe,
    entry: alle.map((r) => ({ fullUrl: `urn:uuid:${r.id}`, resource: r })),
  };
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

export function befundkopfLesen(bundle: unknown): Befundkopf | null {
  if (!istLaborbefund(bundle)) return null;
  const r = eintraege(bundle);
  const bericht = r.find((x) => x.resourceType === 'DiagnosticReport');
  const komposition = r.find((x) => x.resourceType === 'Composition');
  const labor = r.find((x) => x.resourceType === 'Organization');
  const probe = r.find((x) => x.resourceType === 'Specimen');
  const kennungen =
    (bericht?.['identifier'] as { value?: string; type?: { coding?: { code?: string }[] } }[]) ??
    [];
  const uuid =
    kennungen.find((k) => k.type?.coding?.[0]?.code === 'RI')?.value?.replace('urn:uuid:', '') ??
    '';
  const auftragsnummer = kennungen.find((k) => k.type?.coding?.[0]?.code === 'AL')?.value ?? '';
  const attester = (
    komposition?.['attester'] as { party?: { display?: string } }[] | undefined
  )?.[0];
  return {
    uuid,
    auftragsnummer,
    labor: String(labor?.['name'] ?? ''),
    freigebendePerson: attester?.party?.display ?? '',
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
        bezeichnung: String((g['code'] as { text?: string } | undefined)?.text ?? 'Untersuchungen'),
        werte: werte.filter((w) => mitglieder.some((m) => w.id.endsWith(`-${m}`))),
      };
    });
}
