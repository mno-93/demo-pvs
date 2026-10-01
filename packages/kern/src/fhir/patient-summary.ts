import type { Ressource } from './typen.js';

/**
 * Patient Summary als Sicht — gemeinsame Festlegungen für Simulator und Praxissystem.
 *
 * Struktur nach der European Patient Summary (HL7 Europe, `hl7.fhir.eu.eps` 1.0.0-ballot):
 * Bundle vom Typ `document` mit einer Composition (LOINC 60591-5) und Sections, die entweder
 * Einträge oder einen `emptyReason` tragen (Invariante `ips-comp-1`).
 *
 * ✦ Vorschlag der Demo: Jede Section nennt in einer Extension ihre **Quelle** — den Dienst
 * der ePA, in dem ihr Inhalt gepflegt wird. Die Patient Summary selbst wird nie bearbeitet;
 * wer einen Abschnitt ändern will, geht in die Quelle. So bleibt sie eine Sicht und wird
 * doch dort pflegbar, wo es einen Dienst gibt.
 */

export const EPS = {
  bundle: 'http://hl7.eu/fhir/eps/StructureDefinition/bundle-eu-eps',
  composition: 'http://hl7.eu/fhir/eps/StructureDefinition/composition-eu-eps',
  patient: 'http://hl7.eu/fhir/eps/StructureDefinition/patient-eu-eps',
} as const;

export const LISTE_LEER = 'http://terminology.hl7.org/CodeSystem/list-empty-reason';

const VORSCHLAG = 'https://example.org/demo-pvs/fhir/';
/** ✦ Extension an der Section: aus welcher Quelle sie gebildet ist. */
export const PS_QUELLE_EXTENSION = `${VORSCHLAG}StructureDefinition/ps-section-source`;
export const PS_QUELLE_SYSTEM = `${VORSCHLAG}CodeSystem/ps-section-source`;

/**
 * ✦ Relevanzmarkierung am Eintrag einer zentralen Liste: Gehört er in die Patient Summary?
 * Die Liste bleibt vollständig; die Markierung wählt aus, was die Übersicht zeigt.
 */
export const PS_RELEVANT_EXTENSION = `${VORSCHLAG}StructureDefinition/ps-relevant`;
/** ✦ Extension an der Section: wie viele gültige Einträge der Quelle nicht markiert sind. */
export const PS_WEITERE_EXTENSION = `${VORSCHLAG}StructureDefinition/ps-section-further-entries`;

export function istPsRelevant(r: Ressource): boolean {
  return (r.extension ?? []).some(
    (e) => e.url === PS_RELEVANT_EXTENSION && e.valueBoolean === true,
  );
}

/** Kopie mit gesetzter oder entfernter Markierung. */
export function psRelevanzSetzen(r: Ressource, wert: boolean): Ressource {
  const extension = [
    ...(r.extension ?? []).filter((e) => e.url !== PS_RELEVANT_EXTENSION),
    ...(wert ? [{ url: PS_RELEVANT_EXTENSION, valueBoolean: true }] : []),
  ];
  const kopie: Ressource = { ...r, extension };
  if (extension.length === 0) delete kopie.extension;
  return kopie;
}

/**
 * Quellen einer Section.
 * - `allergy-list`, `condition-list`: ✦ Listen des Diagnose-Service — ärztlich geführt
 * - `medication-plan`: eMP — ärztlich geführt
 * - `medication-list`: eML — automatisch aus Verordnung und Abgabe
 * - `lab-documents`: strukturierte Laborbefunde — automatisch aus Dokumenten
 * - `none`: kein Dienst, aus dem der Abschnitt gebildet werden könnte
 */
export type PsQuelle =
  | 'allergy-list'
  | 'condition-list'
  | 'medication-plan'
  | 'medication-list'
  | 'lab-documents'
  | 'immunization-list'
  | 'none';

export const PS_QUELLE_BEZEICHNUNG: Record<PsQuelle, string> = {
  'allergy-list': 'Allergienliste',
  'condition-list': 'Diagnosenliste',
  'medication-plan': 'Medikationsplan',
  'medication-list': 'Medikationsliste',
  'lab-documents': 'Laborbefunde',
  'immunization-list': 'Impfliste',
  none: 'keine Quelle',
};

/** Ärztlich geführte Quellen — im Unterschied zu automatisch abgeleiteten. */
export const PS_QUELLE_GEFUEHRT: ReadonlySet<PsQuelle> = new Set([
  'allergy-list',
  'condition-list',
  'medication-plan',
  'immunization-list',
]);

export type PsAbschnittSchluessel =
  | 'allergien'
  | 'diagnosen'
  | 'medikation'
  | 'impfungen'
  | 'laborwerte'
  | 'prozeduren'
  | 'implantate'
  | 'erklaerungen';

export interface PsAbschnittDefinition {
  schluessel: PsAbschnittSchluessel;
  titel: string;
  /** Section-Code (LOINC) nach IPS/EPS. */
  loinc: string;
  loincAnzeige: string;
  /** Pflicht-Section der EPS (1..1). */
  pflicht: boolean;
}

/** Reihenfolge der Anzeige; Pflicht nach `composition-eu-eps`. */
export const PS_ABSCHNITTE: readonly PsAbschnittDefinition[] = [
  {
    schluessel: 'allergien',
    titel: 'Allergien und Unverträglichkeiten',
    loinc: '48765-2',
    loincAnzeige: 'Allergies and adverse reactions Document',
    pflicht: true,
  },
  {
    schluessel: 'diagnosen',
    titel: 'Diagnosen',
    loinc: '11450-4',
    loincAnzeige: 'Problem list - Reported',
    pflicht: true,
  },
  {
    schluessel: 'medikation',
    titel: 'Medikation',
    loinc: '10160-0',
    loincAnzeige: 'History of Medication use Narrative',
    pflicht: true,
  },
  {
    schluessel: 'laborwerte',
    titel: 'Laborwerte',
    loinc: '30954-2',
    loincAnzeige: 'Relevant diagnostic tests/laboratory data Narrative',
    pflicht: false,
  },
  {
    schluessel: 'impfungen',
    titel: 'Impfungen',
    loinc: '11369-6',
    loincAnzeige: 'History of Immunization Narrative',
    pflicht: false,
  },
  {
    schluessel: 'prozeduren',
    titel: 'Prozeduren',
    loinc: '47519-4',
    loincAnzeige: 'History of Procedures Document',
    pflicht: true,
  },
  {
    schluessel: 'implantate',
    titel: 'Implantate und Medizinprodukte',
    loinc: '46264-8',
    loincAnzeige: 'History of medical device use',
    pflicht: true,
  },
  {
    schluessel: 'erklaerungen',
    titel: 'Persönliche Erklärungen',
    loinc: '42348-3',
    loincAnzeige: 'Advance directives',
    pflicht: false,
  },
];

/**
 * Leerangabe einer Section: keine Daten gegen ausdrücklich nichts bekannt; `withheld` —
 * zurückgehalten, etwa nach Widerspruch der versicherten Person.
 */
export type PsLeer = 'unavailable' | 'nilknown' | 'notasked' | 'withheld' | null;

export interface PsAbschnitt extends PsAbschnittDefinition {
  quelle: PsQuelle;
  leer: PsLeer;
  eintraege: Ressource[];
  /** Gültige Einträge der Quelle, die nicht als relevant markiert sind. */
  weitere: number;
}

export interface PatientSummaryInhalt {
  erstellt: string;
  autor: string;
  abschnitte: PsAbschnitt[];
  /** Alle Ressourcen des Bundles — für Verweise, Provenance, Medication. */
  ressourcen: Ressource[];
}

function verweisAuf(ressourcen: readonly Ressource[], verweis: string): Ressource | undefined {
  const [typ, id] = verweis.split('/');
  return ressourcen.find((r) => r.resourceType === typ && r.id === id);
}

/** Liest eine Patient Summary (Bundle nach EPS) in Abschnitte nach `PS_ABSCHNITTE`. */
export function patientSummaryLesen(bundle: unknown): PatientSummaryInhalt | null {
  const b = bundle as { resourceType?: string; entry?: { resource: Ressource }[] } | null;
  if (b?.resourceType !== 'Bundle') return null;
  const ressourcen = (b.entry ?? []).map((e) => e.resource);
  const komposition = ressourcen.find((r) => r.resourceType === 'Composition');
  if (!komposition) return null;
  type Section = {
    code?: { coding?: { code?: string }[] };
    entry?: { reference?: string }[];
    emptyReason?: { coding?: { code?: string }[] };
    extension?: { url: string; valueCoding?: { code?: string }; valueInteger?: number }[];
  };
  const sections = (komposition['section'] as Section[] | undefined) ?? [];
  const autor =
    (komposition['author'] as { display?: string }[] | undefined)?.[0]?.display ?? 'unbekannt';
  return {
    erstellt: String(komposition['date'] ?? ''),
    autor,
    ressourcen,
    abschnitte: PS_ABSCHNITTE.map((d) => {
      const s = sections.find((x) => x.code?.coding?.some((c) => c.code === d.loinc));
      const quelle = (s?.extension?.find((e) => e.url === PS_QUELLE_EXTENSION)?.valueCoding?.code ??
        'none') as PsQuelle;
      const eintraege = (s?.entry ?? [])
        .map((e) => verweisAuf(ressourcen, e.reference ?? ''))
        .filter((r): r is Ressource => !!r);
      const grund = s?.emptyReason?.coding?.[0]?.code;
      const leer: PsLeer =
        eintraege.length > 0
          ? null
          : grund === 'nilknown' || grund === 'notasked' || grund === 'withheld'
            ? grund
            : 'unavailable';
      const weitere = s?.extension?.find((e) => e.url === PS_WEITERE_EXTENSION)?.valueInteger ?? 0;
      return { ...d, quelle, leer, eintraege, weitere };
    }),
  };
}
