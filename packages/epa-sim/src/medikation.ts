import type { SimAnfrage, SimAntwort, SimAnwendung } from './schnittstelle.ts';
import {
  DOSIERUNGSTEXT_SPRACHE,
  DOSIERUNGSTEXT_VERSION,
  TEXT_EXTENSION,
  VIERERSCHEMA_IM_TEXT,
  automatischeKategorie,
  dosierungstext,
  gerenderterText,
  profilPruefen,
  vollUrl,
  type EmpKategorie,
  type Ressource,
} from '@demo-pvs/kern';
import { bestandFuer } from './bestand.ts';
import { uuidV7 } from './plattform.ts';
import { suchen } from './suche.ts';
import {
  aktuelleChronologie,
  chronologieAnlegen,
  istChronologie,
  lesenachweisPruefen,
  type Chronologieart,
} from './chronologie.ts';
import {
  MS_DETAILS,
  TI_DETAILS,
  ausgabe,
  imZeitraum,
  jetzt,
  neueId,
  operationOutcome,
  parameterAlle,
  parameterLesen,
  suchergebnis,
  type Detailcode,
} from './fhir-hilfen.ts';
import {
  aktivitaetAnlegen,
  archivSichern,
  archivierteKennungen,
  archivWiederherstellen,
  fassung,
  fassungenSichern,
  fassungZum,
  fassungen,
  fortschreiben,
  identitaetAbweisen,
  istGeloescht,
  loeschen,
  organisationAusKopf,
  patientFuer,
  subjektFuer,
  versionierterVerweis,
  type Handelnde,
} from './schreibwege.ts';

/**
 * Medication Service der ePA für alle — nach dem Implementation Guide
 * `de.gematik.epa.medication` 1.4.0-ballot.1 (Paket von gemspec, 16.10.2026) mit den Profilen
 * und generellen Prinzipien aus `de.gematik.epa` 1.4.0-ballot.1 (ADR 0047).
 *
 * Neu gegenüber 1.3.5, soweit nachgebildet: Prüfung der Dosierung — der Dienst erzeugt den Text
 * nach Algorithmus 2.0.0 neu und vergleicht (`SVC_DOSAGE_INVALID_RENDERED_INSTRUCTION`);
 * Behandlungsgrund als `EMPReasonCondition` (`reasonCondition`), `reasonCode` gestrichen;
 * Kategorie des eMP-Eintrags; Status des Arzneimittels folgt dem Eintrag; `MEDSVC_ALREADY_LINKED`
 * bei `$add-emp-entry`; `$update-emp-entry` mit `medication`; `$link-emp` übernimmt Dosierung und
 * Arzneimittel; Datumsbezug von `$medication-list`; Instanzhistorie mit dem Stand zum
 * Bezugszeitpunkt in `$medication-plan` (IG-MED04510JHX); Rücksetzlogik von `$unlink-emp` und
 * `$cancel-eml-entry` mit `systemNotice`; Common Query API statt eigener Query API; Render API
 * für die Zwischenüberschriften (SPEZIFIKATION 5.14). ⚠ Nicht nachgebildet: Render API für
 * PDF/A und XHTML, `_has` und die übrigen Typen der Common Query API.
 *
 * - eML: `$medication-list` — Medikationsinformationen (MedicationStatement) aus Verordnung,
 *   Abgabe und Nachtrag, mit Verordnung, Abgabe, Arzneimittel, Änderungseinträgen und der
 *   Person als Einschluss.
 * - eMP: `$medication-plan` — die Einträge (MedicationRequest mit `intent = plan`) eines
 *   Chronologieeintrags; `$medication-plan-log` — die Chronologie selbst.
 * - Schreiben: `$add-emp-entry`, `$update-emp-entry` (auch zum Beenden oder Berichtigen),
 *   `$add-eml-entry`, `$cancel-eml-entry`, `$link-emp`, `$unlink-emp`, `$batch-emp` mit
 *   `$emp-commit`. Jede Schreibung trägt den Lesenachweis `acknowledgedChronologyId` und
 *   den Header `X-Requesting-Organization`.
 *
 * Die Operationen des E-Rezept-Fachdienstes (`$provide-prescription-erp` und Verwandte) sind
 * dem Fachdienst vorbehalten; der Demo-Ersatz in `erezept.ts` wendet sie intern an, von
 * außen antworten sie mit 403. Nicht nachgebildet: Render API; Paginierung über
 * `_count`/`_offset` hinaus; Datenmigration.
 */

export const MEDIKATION_BASIS = '/epa/medication/api/v1/fhir';
/** Common Query API (`de.gematik.epa` 1.4.0-ballot.1, CapabilityStatement epa-common-query-api-server). */
export const QUERY_BASIS = '/epa/query/api/v1/fhir';
/** Render API des Medication Service: Einstellung der Zwischenüberschriften im eMP. */
export const RENDER_EINSTELLUNG = '/epa/medication/render/v1/emp/settings';

const MS = 'https://gematik.de/fhir/epa-medication/StructureDefinition/';
const V = '|1.4.0';
export const PROFIL = {
  medication: `${MS}epa-medication${V}`,
  empMedication: `${MS}emp-medication${V}`,
  empEintrag: `${MS}emp-medication-request${V}`,
  grund: `${MS}emp-reason-condition${V}`,
  verordnung: `${MS}epa-medication-request${V}`,
  abgabe: `${MS}epa-medication-dispense${V}`,
  aussage: `${MS}epa-medication-statement${V}`,
  chronologie: `${MS}emp-chronology-provenance${V}`,
} as const;
export const EXT = {
  kontext: `${MS}context-extension`,
  herkunftsmittel: `${MS}emp-origin-medication-extension`,
  aktivitaet: `${MS}emp-medicationrequest-activity-extension`,
  chronologie: `${MS}is-emp-chronology-extension`,
  istEmp: `${MS}is-emp-extension`,
  kategorie: 'https://gematik.de/fhir/epa/StructureDefinition/emp-category-extension',
} as const;
export const EMP_IDENTIFIER = 'https://gematik.de/fhir/sid/emp-identifier';
const ATC = 'http://fhir.de/CodeSystem/bfarm/atc';

const detail = (code: string, display: string): Detailcode => ({
  system: MS_DETAILS,
  code,
  display,
});

const HL7_OO = 'http://terminology.hl7.org/CodeSystem/operation-outcome';
const VERARBEITUNG = `${MS.replace('StructureDefinition/', 'CodeSystem/')}epa-medicationstatement-processing-event-code`;

/** Fehlercodes aus HL7 `operation-outcome`, wie sie der IG je Operation nennt. */
const MSG = {
  unbekannt: { system: HL7_OO, code: 'MSG_RESOURCE_ID_FAIL', display: 'Resource is not known' },
  geloescht: { system: HL7_OO, code: 'MSG_DELETED', display: 'Resource was deleted' },
  nichtErlaubt: {
    system: HL7_OO,
    code: 'MSG_OP_NOT_ALLOWED',
    display: 'Operation not allowed for resource',
  },
  versionskonflikt: {
    system: HL7_OO,
    code: 'MSG_VERSION_AWARE_CONFLICT',
    display: 'Update Conflict',
  },
  parameterUnbekannt: {
    system: HL7_OO,
    code: 'MSG_PARAM_UNKNOWN',
    display: 'Unknown search parameter',
  },
  syntax: { system: HL7_OO, code: 'MSG_BAD_SYNTAX', display: 'Invalid query parameter(s)' },
  keinTreffer: {
    system: HL7_OO,
    code: 'MSG_NO_MATCH',
    display: 'No Resource found matching the query',
  },
} satisfies Record<string, Detailcode>;

/** Antwort mit Detailcode; `code` ist der Issue-Typ nach FHIR. */
function melden(
  antwort: SimAntwort,
  status: number,
  code: string,
  text: string,
  details: Detailcode,
) {
  return antwort.code(status).send(operationOutcome('error', code, text, details));
}

/**
 * Parameter der lesenden Operationen (OperationDefinitions 1.4.0-ballot.1): Unbekanntes ergibt
 * 400 `MSG_PARAM_UNKNOWN`, ein Wert in falscher Form 400 `MSG_BAD_SYNTAX`.
 */
function operationsparameterAbweisen(
  anfrage: { query: unknown },
  erlaubt: Record<string, RegExp>,
  antwort: SimAntwort,
  /** Höchstzahl je Parameter nach der OperationDefinition (`max`); sonst 1. */
  hoechstens: Record<string, number> = {},
): boolean {
  for (const [name, werte] of Object.entries(anfrage.query as Record<string, unknown>)) {
    const muster = erlaubt[name];
    if (muster && ([] as unknown[]).concat(werte).length > (hoechstens[name] ?? 1)) {
      void melden(antwort, 400, 'invalid', `Zu viele Werte für ${name}`, MSG.syntax);
      return true;
    }
    if (!muster) {
      void melden(
        antwort,
        400,
        'not-supported',
        `Unbekannter Parameter: ${name}`,
        MSG.parameterUnbekannt,
      );
      return true;
    }
    if (!([] as unknown[]).concat(werte).every((w) => muster.test(String(w)))) {
      void melden(antwort, 400, 'invalid', `Ungültiger Wert für ${name}`, MSG.syntax);
      return true;
    }
  }
  return false;
}
const ZAHL = /^\d+$/;
/** Datum mit den Präfixen, die `imZeitraum` auswertet; `ap` ergibt 400 statt eines stillen Fehltreffers. */
const DATUMSWERT =
  /^(eq|ne|gt|lt|ge|le|sa|eb)?\d{4}(-\d{2}(-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})?)?)?)?$/;

/** Datumsbezug eines eML-Eintrags (1.4.0): `effectiveDateTime`, Beginn von `effectivePeriod`, sonst `meta.lastUpdated`. */
function bezugsdatum(r: Ressource): string {
  return String(
    r['effectiveDateTime'] ??
      (r['effectivePeriod'] as { start?: string } | undefined)?.start ??
      r.meta?.lastUpdated ??
      '',
  );
}

/** Absteigend nach Datumsbezug, dann nach `meta.lastUpdated` (IG-MED03188C0X). */
function nachBezugsdatum(a: Ressource, b: Ressource): number {
  return (
    bezugsdatum(b).localeCompare(bezugsdatum(a)) ||
    String(b.meta?.lastUpdated ?? '').localeCompare(String(a.meta?.lastUpdated ?? ''))
  );
}

/** Seite eines Suchergebnisses mit `self` und, wenn es weitergeht, `next` (FHIR Paging). */
function seitenverweise(
  anfrage: { url: string },
  ab: number,
  anzahl: number,
  gesamt: number,
): { relation: string; url: string }[] {
  const adresse = (offset: number) => {
    const [pfad, suche = ''] = anfrage.url.split('?');
    const p = new URLSearchParams(suche);
    p.set('_offset', String(offset));
    p.set('_count', String(anzahl));
    return `${String(pfad)}?${p.toString()}`;
  };
  return [
    { relation: 'self', url: adresse(ab) },
    ...(ab + anzahl < gesamt ? [{ relation: 'next', url: adresse(ab + anzahl) }] : []),
  ];
}

/** Verknüpfung eines eML-Eintrags mit seinem eMP-Eintrag: `basedOn` mit `isEMP` (1.4.0). */
export function empVerweis(id: string) {
  return {
    extension: [{ url: EXT.istEmp, valueBoolean: true }],
    reference: `MedicationRequest/${id}`,
  };
}

function kontext(r: Ressource): string | undefined {
  return ((r.extension ?? []) as { url: string; valueCode?: string }[]).find(
    (e) => e.url === EXT.kontext,
  )?.valueCode;
}

export function istEmpEintrag(r: Ressource): boolean {
  return r.resourceType === 'MedicationRequest' && r['intent'] === 'plan';
}

/** Einträge mit Status aktiv oder pausiert bilden den gültigen Plan. */
export const IM_PLAN = new Set(['active', 'on-hold']);

export const EMP: Chronologieart = {
  profil: PROFIL.chronologie,
  kennzeichen: EXT.chronologie,
  gueltig: (r) => istEmpEintrag(r) && IM_PLAN.has(String(r['status'])),
  konflikt: detail(
    'MEDSVC_EMP_CHRONOLOGY_ID_MISMATCH',
    'Mismatch between acknowledged and current eMP chronology ID',
  ),
};

function ablage(kvnr: string): Ressource[] {
  return bestandFuer(kvnr).medikation;
}

function finden(kvnr: string, typ: string, id: string): Ressource | undefined {
  return ablage(kvnr).find((r) => r.resourceType === typ && r.id === id);
}

function referenzId(verweis: unknown): string {
  return (
    String((verweis as { reference?: string } | undefined)?.reference ?? '').split('/')[1] ?? ''
  );
}

function fehlt(antwort: SimAntwort, code: string, display: string, text: string, status = 404) {
  return antwort
    .code(status)
    .send(
      operationOutcome(
        'error',
        status === 404 ? 'not-found' : 'processing',
        text,
        detail(code, display),
      ),
    );
}

function ungueltig(antwort: SimAntwort, text: string) {
  return antwort
    .code(422)
    .send(
      operationOutcome(
        'error',
        'invalid',
        text,
        detail('MEDSVC_NO_VALID_STRUCTURE', 'Invalid Data Structure in Medication Service'),
      ),
    );
}

/**
 * Validierung, soweit sie die Demo nachbildet: Die ATC-de-Kodierung eines Arzneimittels
 * verlangt eine Versionsangabe (`EPAMedication`, `code.coding:atc-de.version` 1..1).
 */
function medicationPruefen(m: Ressource | undefined): string | null {
  if (!m || m.resourceType !== 'Medication') return 'Es fehlt eine Medication-Ressource.';
  const atc = (
    (m['code'] as { coding?: { system?: string; version?: string }[] } | undefined)?.coding ?? []
  ).filter((k) => k.system === ATC);
  if (atc.some((k) => !k.version)) {
    return 'Profilvalidierung fehlgeschlagen: code.coding:atc-de.version ist 1..1.';
  }
  return null;
}

function empEintragPruefen(r: Ressource | undefined): string | null {
  if (!r || r.resourceType !== 'MedicationRequest')
    return 'Es fehlt ein eMP-Eintrag (MedicationRequest).';
  if (r['intent'] !== 'plan') return 'Profilvalidierung fehlgeschlagen: intent muss „plan" sein.';
  if (!r['authoredOn']) return 'Profilvalidierung fehlgeschlagen: authoredOn ist 1..1.';
  if (r['reasonCode'] !== undefined)
    return 'Profilvalidierung fehlgeschlagen: reasonCode ist 0..0 — Diagnose über reasonReference.';
  const status = String(r['status'] ?? 'active');
  if (!['active', 'on-hold', 'completed', 'stopped', 'entered-in-error'].includes(status)) {
    return `Der Status „${status}" ist für einen eMP-Eintrag nicht zulässig.`;
  }
  return null;
}

type Json = Record<string, unknown>;

/**
 * Profilprüfung der Eingaben (IG 1.4.0-ballot.1: „Validate Input-Parameters … according to …
 * profile"): die Regeln der Profile, ausgewertet im Kern (`profilPruefen`). Jeder Befund wird ein
 * Eintrag im OperationOutcome mit dem Element als `expression`.
 */
function profilAbweisen(r: Ressource | undefined, profil: string, antwort: SimAntwort): boolean {
  if (!r) return false;
  const befunde = profilPruefen(r, profil);
  if (befunde.length === 0) return false;
  const details = detail(
    'MEDSVC_NO_VALID_STRUCTURE',
    'Invalid Data Structure in Medication Service',
  );
  void antwort.code(422).send({
    ...operationOutcome('error', 'invalid', '', details),
    issue: befunde.map((b) => ({
      severity: 'error',
      code: 'invariant',
      details: { coding: [details] },
      diagnostics: `${b.regel}: ${b.text}`,
      ...(b.pfad ? { expression: [b.pfad] } : {}),
    })),
  });
  return true;
}

/**
 * Prüfung der Dosierung nach `gemIG_TI_Common#Validierung` (IG 1.4.0-ballot.1, Geschäftslogik
 * von `$add-emp-entry`, `$update-emp-entry` und `$add-eml-entry`): Der Dienst erzeugt den Text
 * selbst neu und vergleicht ihn mit `renderedDosageInstruction`; bei Freitext muss derselbe Text
 * dort stehen. Nur de-DE mit Algorithmusversion 2.0.0 (general-principles).
 */
function dosierungAbweisen(r: Ressource, antwort: SimAntwort): boolean {
  const feld = r.resourceType === 'MedicationStatement' ? 'dosage' : 'dosageInstruction';
  const dosierungen = (r[feld] as Json[] | undefined) ?? [];
  if (dosierungen.length === 0) return false;
  const freitext = dosierungen.every((d) => d['text'] && !d['timing'] && !d['doseAndRate']);
  const struktur = (text: string) => {
    void ungueltig(antwort, `Profilvalidierung fehlgeschlagen: ${text}`);
    return true;
  };
  if (freitext && dosierungen.some((d) => VIERERSCHEMA_IM_TEXT.test(String(d['text']))))
    return struktur('Viererschema als Freitext (DosageFourSlotPatternInText).');
  const meta = ((r.extension ?? []) as { url: string; extension?: Json[] }[]).find(
    (e) => e.url === TEXT_EXTENSION.generiert,
  );
  if (!freitext && !meta)
    return struktur(
      'GeneratedDosageInstructionsMeta fehlt (DosageStructuredRequiresGeneratedText).',
    );
  if (meta) {
    const teil = (url: string) => meta.extension?.find((x) => x['url'] === url);
    if (
      teil('algorithmVersion')?.['valueString'] !== DOSIERUNGSTEXT_VERSION ||
      teil('language')?.['valueCode'] !== DOSIERUNGSTEXT_SPRACHE
    ) {
      void antwort.code(400).send(
        operationOutcome(
          'error',
          'invalid',
          `Unterstützt wird nur ${DOSIERUNGSTEXT_SPRACHE} mit Algorithmusversion ${DOSIERUNGSTEXT_VERSION}.`,
          {
            system: TI_DETAILS,
            code: 'SVC_DOSAGE_INVALID_INSTRUCTION_META',
            display: 'The generated dosage instruction meta information is invalid',
          },
        ),
      );
      return true;
    }
  }
  let erwartet: string;
  try {
    erwartet = dosierungstext(r);
  } catch (e) {
    return struktur(e instanceof Error ? e.message : String(e));
  }
  if (gerenderterText(r) === erwartet) return false;
  const ergebnis = operationOutcome(
    'error',
    'invalid',
    'Der aufbereitete Dosierungstext weicht vom erzeugten ab.',
    {
      system: TI_DETAILS,
      code: 'SVC_DOSAGE_INVALID_RENDERED_INSTRUCTION',
      display: 'The provided rendered dosage instruction is invalid',
    },
  );
  ergebnis.issue[0] = {
    ...ergebnis.issue[0]!,
    extension: [
      {
        url: 'https://gematik.de/fhir/ti/StructureDefinition/expected-dosage-text',
        valueString: erwartet,
      },
    ],
  } as (typeof ergebnis.issue)[0];
  void antwort.code(400).send(ergebnis);
  return true;
}

function gruendeAbweisen(koerper: unknown, antwort: SimAntwort): boolean {
  return ((koerper as { parameter?: { name: string; resource?: Ressource }[] }).parameter ?? [])
    .filter((p) => p.name === 'reasonCondition')
    .some((p) => profilAbweisen(p.resource, PROFIL.grund, antwort));
}

/** Kategorie nach „Kategorisierung und Sortierung" (IG 1.4.0-ballot.1). */
function kategorieSetzen(eintrag: Ressource, eingang: Ressource, bisher: EmpKategorie | null) {
  const angabe = ((eingang.extension ?? []) as { url: string; valueCode?: string }[]).find(
    (e) => e.url === EXT.kategorie,
  )?.valueCode as EmpKategorie | undefined;
  const kategorie =
    automatischeKategorie(eintrag['dosageInstruction']) ?? angabe ?? bisher ?? 'unassigned';
  eintrag.extension = [
    ...((eintrag.extension ?? []) as { url: string }[]).filter((e) => e.url !== EXT.kategorie),
    { url: EXT.kategorie, valueCode: kategorie },
  ];
}

function kategorieVon(r: Ressource): EmpKategorie | null {
  return (
    (((r.extension ?? []) as { url: string; valueCode?: string }[]).find(
      (e) => e.url === EXT.kategorie,
    )?.valueCode as EmpKategorie | undefined) ?? null
  );
}

/** Der Status des Arzneimittels folgt dem eMP-Eintrag: aktiv nur bei aktivem Eintrag. */
function mittelstatus(m: Ressource | undefined, eintrag: Ressource) {
  if (m && kontext(m) === 'EMP')
    m['status'] = eintrag['status'] === 'active' ? 'active' : 'inactive';
}

/**
 * Behandlungsgründe aus `reasonCondition` als eigene Instanzen anlegen und die Verweise des
 * Eintrags auf sie umschreiben.
 */
function gruendeAnlegen(
  kvnr: string,
  koerper: unknown,
  eintrag: Ressource,
  zeit: string,
): Ressource[] {
  const eingaenge = (
    (koerper as { parameter?: { name: string; resource?: Ressource }[] }).parameter ?? []
  ).filter((p) => p.name === 'reasonCondition' && p.resource?.resourceType === 'Condition');
  const angelegt: Ressource[] = [];
  const umschreiben = new Map<string, string>();
  for (const p of eingaenge) {
    const g: Ressource = {
      ...p.resource!,
      id: neueId('grund'),
      meta: { versionId: '1', lastUpdated: zeit, profile: [PROFIL.grund] },
      subject: subjektFuer(kvnr),
    };
    umschreiben.set(`Condition/${String(p.resource!.id)}`, `Condition/${String(g.id)}`);
    angelegt.push(g);
  }
  if (Array.isArray(eintrag['reasonReference']))
    eintrag['reasonReference'] = (eintrag['reasonReference'] as { reference?: string }[]).map(
      (v) =>
        v.reference && umschreiben.has(v.reference)
          ? { ...v, reference: umschreiben.get(v.reference) }
          : v,
    );
  ablage(kvnr).push(...angelegt);
  return angelegt;
}

const textErweiterung = (url: string) =>
  url === TEXT_EXTENSION.gerendert('MedicationRequest') || url === TEXT_EXTENSION.generiert;

function aktivitaetsverweise(r: Ressource): string[] {
  return (
    (r.extension ?? []) as {
      url: string;
      extension?: { url: string; valueReference?: unknown }[];
    }[]
  )
    .filter((x) => x.url === EXT.aktivitaet)
    .map((x) => referenzId(x.extension?.find((y) => y.url === 'reference')?.valueReference));
}

/** Ergebnis des Lösens: ob sich der eMP-Eintrag änderte und welche Verordnung ihren Verweis verlor. */
export interface Loesung {
  eintragGeaendert: boolean;
  verordnung: Ressource | null;
}

/**
 * Löst einen eML-Eintrag von seinem eMP-Eintrag (IG 1.4.0-ballot.1, IG-MED-BL-UNLINK-EMP-ENTRY-V3;
 * `$cancel-eml-entry` und die E-Rezept-Operationen verfahren ebenso). Die Instanzhistorie des
 * eMP-Eintrags wird zurückverfolgt, solange Arzneimittel und Dosierung denen des eML-Eintrags
 * gleichen und dieser noch im Aktivitätsnachweis steht. Erst wenn die erste abweichende Fassung
 * („stop version") beides nicht mehr erfüllt, werden Dosierung, Arzneimittel und Dosierungstext auf
 * sie zurückgesetzt und die Kategorie neu bestimmt. Eine zwischenzeitliche manuelle Änderung und
 * ein schon verknüpft angelegter Eintrag setzen nichts zurück. Die Verordnung verliert ihren
 * logischen Verweis auf den eMP-Eintrag.
 */
export function empZuruecksetzen(
  kvnr: string,
  eintrag: Ressource,
  aussage: Ressource,
  zeit: string = jetzt(),
): Loesung {
  const gleich = (f: Ressource) =>
    referenzId(f['medicationReference']) === referenzId(aussage['medicationReference']) &&
    JSON.stringify(f['dosageInstruction'] ?? []) === JSON.stringify(aussage['dosage'] ?? []);
  const verknuepft = (f: Ressource) => aktivitaetsverweise(f).includes(String(aussage.id));
  const frueher = fassungen(ablage(kvnr), 'MedicationRequest', String(eintrag.id))
    .filter((f) => Number(f.meta?.versionId ?? '1') < Number(eintrag.meta?.versionId ?? '1'))
    .reverse();
  const stopp = [eintrag, ...frueher].find((f) => !(gleich(f) && verknuepft(f)));
  let geaendert = false;
  if (stopp && !gleich(stopp) && !verknuepft(stopp)) {
    if (stopp['dosageInstruction'] !== undefined)
      eintrag['dosageInstruction'] = structuredClone(stopp['dosageInstruction']);
    else delete eintrag['dosageInstruction'];
    eintrag['medicationReference'] = structuredClone(stopp['medicationReference']);
    eintrag.extension = [
      ...((eintrag.extension ?? []) as { url: string }[]).filter((x) => !textErweiterung(x.url)),
      ...((stopp.extension ?? []) as { url: string }[]).filter((x) => textErweiterung(x.url)),
    ];
    kategorieSetzen(eintrag, { resourceType: 'MedicationRequest' }, kategorieVon(eintrag));
    geaendert = true;
  }
  const bisher = eintrag.extension ?? [];
  const uebrig = bisher.filter(
    (x) =>
      !(
        x.url === EXT.aktivitaet &&
        referenzId(x.extension?.find((y) => y.url === 'reference')?.valueReference) === aussage.id
      ),
  );
  eintrag.extension = uebrig;
  if (uebrig.length !== bisher.length) geaendert = true;
  return {
    eintragGeaendert: geaendert,
    verordnung: verknuepfungLoesen(kvnr, aussage, eintrag, zeit),
  };
}

/**
 * Löst nur die Verknüpfung: `basedOn` des eML-Eintrags und den logischen Verweis der Verordnung.
 * Liefert die Verordnung, wenn sie sich änderte (neue Fassung).
 */
export function verknuepfungLoesen(
  kvnr: string,
  aussage: Ressource,
  eintrag: Ressource,
  zeit: string,
): Ressource | null {
  const basis = ((aussage['basedOn'] as { reference?: string }[] | undefined) ?? []).filter(
    (v) => v.reference !== `MedicationRequest/${String(eintrag.id)}`,
  );
  if (basis.length > 0) aussage['basedOn'] = basis;
  else delete aussage['basedOn'];
  const verordnung = verordnungZu(kvnr, aussage);
  if (!verordnung) return null;
  const verweise =
    (verordnung['basedOn'] as { identifier?: { value?: string } }[] | undefined) ?? [];
  const rest = verweise.filter((v) => v.identifier?.value !== empKennung(eintrag));
  if (rest.length === verweise.length) return null;
  if (rest.length > 0) verordnung['basedOn'] = rest;
  else delete verordnung['basedOn'];
  fortschreiben(verordnung, zeit);
  return verordnung;
}

/** Der eMP-Eintrag, mit dem ein eML-Eintrag verknüpft ist (`basedOn` mit `isEMP`), sonst null. */
export function verknuepfterEintrag(aussage: Ressource): string | null {
  const verweis = (
    (aussage['basedOn'] as
      | { reference?: string; extension?: { url: string; valueBoolean?: boolean }[] }[]
      | undefined) ?? []
  ).find((v) => v.extension?.some((e) => e.url === EXT.istEmp && e.valueBoolean === true));
  return verweis ? referenzId(verweis) || null : null;
}

/** Die Verordnung, aus der ein eML-Eintrag stammt (`derivedFrom` auf eine EPAMedicationRequest). */
export function verordnungZu(kvnr: string, aussage: Ressource): Ressource | undefined {
  for (const q of (aussage['derivedFrom'] as { reference?: string }[] | undefined) ?? []) {
    const [typ, id] = String(q.reference ?? '').split('/');
    if (typ === 'MedicationRequest') return finden(kvnr, typ, String(id));
  }
  return undefined;
}

/** Die Kennung des eMP-Eintrags (MedicationPlanIdentifier). */
export function empKennung(eintrag: Ressource): string {
  return (
    (eintrag['identifier'] as { system?: string; value?: string }[] | undefined)?.find(
      (i) => i.system === EMP_IDENTIFIER,
    )?.value ?? String(eintrag.id)
  );
}

/** Kombipackung: Ihr Arzneimittel übernimmt ein eMP-Eintrag beim Verknüpfen nicht (V2). */
function kombipackung(m: Ressource | undefined): boolean {
  return ((m?.['form'] as { coding?: { code?: string }[] } | undefined)?.coding ?? []).some(
    (k) => k.code === 'KPG',
  );
}

/** Zeitpunkte, zu denen der eMP-Eintrag eML-Einträge aufgenommen hat (`activity.addedOn`). */
function aufgenommenAm(eintrag: Ressource): string[] {
  return ((eintrag.extension ?? []) as { url: string; extension?: Json[] }[])
    .filter((x) => x.url === EXT.aktivitaet)
    .map((x) => String(x.extension?.find((y) => y['url'] === 'addedOn')?.['valueDateTime'] ?? ''));
}

/**
 * Verknüpft einen eML-Eintrag mit einem eMP-Eintrag (IG-MED-BL-LINK-EMP-ENTRY-V2; ebenso das
 * automatische Verknüpfen in `$add-emp-entry` und bei der Abgabe): `basedOn` mit `isEMP`,
 * Aktivitätsnachweis am Eintrag mit `addedOn`, logischer Verweis der Verordnung auf den
 * MedicationPlanIdentifier. Mit `uebernehmen` übernimmt der Eintrag Dosierung samt Text und —
 * außer bei einer Kombipackung — das Arzneimittel, wenn er nicht schon einen späteren eML-Eintrag
 * aufgenommen hat. Liefert die Verordnung, wenn sie sich änderte. Fassungen schreibt der Aufrufer
 * fort.
 */
export function verknuepfen(
  kvnr: string,
  aussage: Ressource,
  eintrag: Ressource,
  zeit: string,
  uebernehmen: boolean,
): Ressource | null {
  aussage['basedOn'] = [
    ...((aussage['basedOn'] as unknown[] | undefined) ?? []),
    empVerweis(String(eintrag.id)),
  ];
  if (uebernehmen) {
    const spaeter = aufgenommenAm(eintrag).some((t) => t > String(aussage.meta?.lastUpdated ?? ''));
    const dosierung = aussage['dosage'] as Json[] | undefined;
    if (!spaeter && dosierung && dosierung.length > 0) {
      eintrag['dosageInstruction'] = structuredClone(dosierung);
      const gerendert = TEXT_EXTENSION.gerendert('MedicationRequest');
      const text = gerenderterText(aussage);
      const meta = ((aussage.extension ?? []) as { url: string }[]).find(
        (x) => x.url === TEXT_EXTENSION.generiert,
      );
      eintrag.extension = [
        ...((eintrag.extension ?? []) as { url: string }[]).filter(
          (x) => x.url !== gerendert && x.url !== TEXT_EXTENSION.generiert,
        ),
        ...(text ? [{ url: gerendert, valueMarkdown: text }] : []),
        ...(meta ? [meta] : []),
      ];
      kategorieSetzen(eintrag, { resourceType: 'MedicationRequest' }, kategorieVon(eintrag));
    }
    if (
      !spaeter &&
      !kombipackung(finden(kvnr, 'Medication', referenzId(aussage['medicationReference'])))
    )
      eintrag['medicationReference'] = structuredClone(aussage['medicationReference']);
  }
  eintrag.extension = [
    ...((eintrag.extension ?? []) as { url: string }[]),
    {
      url: EXT.aktivitaet,
      extension: [
        {
          url: 'reference',
          valueReference: { reference: `MedicationStatement/${String(aussage.id)}` },
        },
        { url: 'addedOn', valueDateTime: zeit },
      ],
    },
  ];
  const verordnung = verordnungZu(kvnr, aussage);
  if (!verordnung) return null;
  verordnung['basedOn'] = [{ identifier: { system: EMP_IDENTIFIER, value: empKennung(eintrag) } }];
  fortschreiben(verordnung, zeit);
  return verordnung;
}

/** Wird ein Arzneimittel noch gebraucht — von eMP-Eintrag, Verordnung, Abgabe oder eML-Eintrag? */
function mittelInGebrauch(kvnr: string, mittelId: string): boolean {
  return ablage(kvnr).some(
    (r) =>
      ['MedicationRequest', 'MedicationStatement', 'MedicationDispense'].includes(r.resourceType) &&
      (referenzId(r['medicationReference']) === mittelId ||
        ((r.extension ?? []) as { url: string; valueReference?: unknown }[]).some(
          (e) => e.url === EXT.herkunftsmittel && referenzId(e.valueReference) === mittelId,
        )),
  );
}

/** Löscht ein Arzneimittel, das niemand mehr braucht; seine letzte Fassung bleibt in der Historie. */
function mittelLoeschenWennFrei(kvnr: string, mittelId: string): void {
  const mittel = finden(kvnr, 'Medication', mittelId);
  if (!mittel || mittelInGebrauch(kvnr, mittelId)) return;
  fassungenSichern(ablage(kvnr), [versionierterVerweis(mittel)]);
  loeschen(ablage(kvnr), mittel);
}

/**
 * Status der Arzneimittel eines eMP-Eintrags (IG 1.4.0-ballot.1, `$update-emp-entry`): aktiv nur
 * bei aktivem Eintrag — für `medicationReference` und `originMedication`, als neue Fassung.
 */
function mittelstatusSetzen(kvnr: string, eintrag: Ressource, zeit: string): Ressource[] {
  const ids = new Set([
    referenzId(eintrag['medicationReference']),
    ...((eintrag.extension ?? []) as { url: string; valueReference?: unknown }[])
      .filter((e) => e.url === EXT.herkunftsmittel)
      .map((e) => referenzId(e.valueReference)),
  ]);
  const soll = eintrag['status'] === 'active' ? 'active' : 'inactive';
  const geaendert: Ressource[] = [];
  for (const id of ids) {
    const m = id ? finden(kvnr, 'Medication', id) : undefined;
    if (m && m['status'] !== soll && m['status'] !== 'entered-in-error') {
      m['status'] = soll;
      fortschreiben(m, zeit);
      geaendert.push(m);
    }
  }
  return geaendert;
}

/** Der jüngste Änderungseintrag (keine Chronologie) zu einer Instanz. */
function letzteAktivitaet(kvnr: string, typ: string, id: string): Ressource | undefined {
  return ablage(kvnr)
    .filter(
      (r) =>
        r.resourceType === 'Provenance' &&
        !istChronologie(r, EMP) &&
        ((r['target'] as { reference?: string }[] | undefined) ?? []).some((t) =>
          String(t.reference ?? '').startsWith(`${typ}/${id}/`),
        ),
    )
    .pop();
}

/** Wert mit sortierten Schlüsseln und ohne leere Angaben — für Vergleiche des Inhalts. */
function kanonisch(v: unknown, schluessel = ''): unknown {
  if (Array.isArray(v)) {
    const werte = v.map((x) => kanonisch(x));
    // Die Reihenfolge von Extensions trägt keine Bedeutung.
    return /extension$/i.test(schluessel)
      ? werte.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))
      : werte;
  }
  if (v && typeof v === 'object')
    return Object.fromEntries(
      Object.keys(v)
        .filter((k) => (v as Json)[k] !== undefined)
        .sort()
        .map((k) => [k, kanonisch((v as Json)[k], k)]),
    );
  return v;
}

/** Gleicher Inhalt ohne `meta` — zum Erkennen, ob eine Schreibung etwas ändert. */
function inhaltGleich(a: Ressource, b: Ressource): boolean {
  const ohne = (r: Ressource) => JSON.stringify(kanonisch({ ...r, meta: undefined }));
  return ohne(a) === ohne(b);
}

function mitKontext(r: Ressource, wert: string): Ressource {
  return {
    ...r,
    extension: [
      ...((r.extension ?? []) as { url: string }[]).filter((e) => e.url !== EXT.kontext),
      { url: EXT.kontext, valueCode: wert },
    ],
  };
}

type Anfrage = SimAnfrage;

export function medikationEinhaengen(
  app: SimAnwendung,
  kvnrAus: (anfrage: { headers: Record<string, unknown> }) => string,
  sitzungAus: (anfrage: { headers: Record<string, unknown> }) => string,
) {
  const b = MEDIKATION_BASIS;

  const organisation = (anfrage: Anfrage, antwort: SimAntwort): Handelnde | null =>
    organisationAusKopf(anfrage.headers as Record<string, unknown>, sitzungAus(anfrage), antwort);

  /* ---------- Lesen ---------- */

  /** Einschlüsse zu einer Medikationsinformation: Arzneimittel, Verordnung, Abgabe, Änderungen. */
  function einschluesse(kvnr: string, aussagen: Ressource[]): Ressource[] {
    const alle = ablage(kvnr);
    const ids = new Set<string>();
    const dazu: Ressource[] = [];
    const nimm = (r: Ressource | undefined) => {
      if (r && !ids.has(`${r.resourceType}/${String(r.id)}`)) {
        ids.add(`${r.resourceType}/${String(r.id)}`);
        dazu.push(r);
      }
    };
    for (const a of aussagen) {
      nimm(finden(kvnr, 'Medication', referenzId(a['medicationReference'])));
      for (const q of (a['derivedFrom'] as { reference?: string }[] | undefined) ?? []) {
        const [typ, id] = String(q.reference ?? '').split('/');
        const quelle = finden(kvnr, String(typ), String(id));
        nimm(quelle);
        // Das abgegebene Arzneimittel kann vom verordneten abweichen (Austausch).
        if (quelle) nimm(finden(kvnr, 'Medication', referenzId(quelle['medicationReference'])));
      }
      // Änderungseinträge, die auf genau diese Fassung zeigen (IG-MED98416U4Q).
      for (const p of alle.filter(
        (r) =>
          r.resourceType === 'Provenance' &&
          !istChronologie(r, EMP) &&
          (r['target'] as { reference: string }[]).some(
            (t) => t.reference === versionierterVerweis(a),
          ),
      )) {
        nimm(p);
        nimm(finden(kvnr, 'Organization', referenzId((p['agent'] as { who: unknown }[])[0]?.who)));
      }
    }
    return dazu;
  }

  /**
   * eML — `$medication-list`: nicht stornierte Medikationsinformationen, optional nach Datum;
   * absteigend nach Datumsbezug (IG-MED03188C0X), die Person als erstes Element der ersten Seite
   * (IG-MED25360QCP); ohne Treffer 404 `MSG_NO_MATCH` (IG-MED16217P4A).
   */
  app.get(`${b}/$medication-list`, async (anfrage, antwort) => {
    if (
      operationsparameterAbweisen(
        anfrage,
        { date: DATUMSWERT, _count: ZAHL, _offset: ZAHL },
        antwort,
        { date: 2 },
      )
    )
      return antwort;
    const kvnr = kvnrAus(anfrage);
    const q = anfrage.query as Record<string, string | string[] | undefined>;
    // `date` (0..2, Ober- und Untergrenze) — auch für „neu seit dem letzten Aufruf".
    // ⚠ „neu seit" trifft damit nur neue Einnahmezeiträume, keine späteren Nachträge zu alten.
    const aussagen = ablage(kvnr)
      .filter(
        (r) =>
          r.resourceType === 'MedicationStatement' &&
          r['status'] !== 'entered-in-error' &&
          imZeitraum(bezugsdatum(r), q['date']),
      )
      .sort(nachBezugsdatum);
    if (aussagen.length === 0)
      return melden(
        antwort,
        404,
        'not-found',
        'Keine Medikationsinformation zur Anfrage.',
        MSG.keinTreffer,
      );
    const q2 = anfrage.query as Record<string, string | undefined>;
    const ab = Number(q2['_offset'] ?? 0);
    const anzahl = Number(q2['_count'] ?? aussagen.length);
    const seite = aussagen.slice(ab, ab + anzahl);
    const ergebnis = suchergebnis(seite, einschluesse(kvnr, seite));
    return {
      ...ergebnis,
      total: aussagen.length,
      link: seitenverweise(anfrage, ab, Math.max(anzahl, 1), aussagen.length),
      // Die Person steht als erstes Element der ersten Seite.
      entry: [
        ...(ab === 0
          ? [
              {
                fullUrl: vollUrl(patientFuer(kvnr)),
                resource: patientFuer(kvnr),
                search: { mode: 'include' },
              },
            ]
          : []),
        ...ergebnis.entry,
      ],
    };
  });

  /**
   * eMP — `$medication-plan`: Bundle vom Typ collection mit dem Chronologieeintrag, den
   * eMP-Einträgen in der dort referenzierten Fassung, ihren Arzneimitteln und den
   * verknüpften eML-Einträgen. Mit `provenance` ein früherer Stand.
   */
  app.get(`${b}/$medication-plan`, async (anfrage, antwort) => {
    if (operationsparameterAbweisen(anfrage, { provenance: /^[A-Za-z0-9\-.]{1,64}$/ }, antwort))
      return antwort;
    const kvnr = kvnrAus(anfrage);
    const gewuenscht = (anfrage.query as Record<string, string | undefined>)['provenance'];
    const chronologie = gewuenscht
      ? ablage(kvnr).find((r) => istChronologie(r, EMP) && r.id === gewuenscht)
      : aktuelleChronologie(ablage(kvnr), EMP);
    // Unbekannter Stand: 404 MSG_RESOURCE_ID_FAIL (IG-MED14428K6S); noch kein eMP: 404
    // MEDSVC_EMP_NO_EXIST (IG-MED35894UP4).
    if (gewuenscht && !chronologie)
      return melden(antwort, 404, 'not-found', `Kein eMP-Stand ${gewuenscht}.`, MSG.unbekannt);
    if (!chronologie)
      return fehlt(
        antwort,
        'MEDSVC_EMP_NO_EXIST',
        'eMP does not exist',
        'Es gibt noch keinen eMP.',
      );
    // 1.4.0 (IG-MED04510JHX): alle Instanzen in der Fassung zum Bezugszeitpunkt — `recorded`
    // des Chronologieeintrags, sonst der Zeitpunkt der Anfrage.
    const bezug = gewuenscht ? String(chronologie?.['recorded'] ?? jetzt()) : jetzt();
    const zumBezug = (typ: string, id: string) =>
      fassungZum(ablage(kvnr), typ, id, bezug) ?? finden(kvnr, typ, id);
    // Einträge nach authoredOn aufsteigend, dann nach Kennung (IG-MED07144WB0).
    const eintraege = ((chronologie['target'] as { reference?: string }[] | undefined) ?? [])
      .filter((t) => !!t.reference)
      .map((t) => {
        const [typ, id, , v] = String(t.reference).split('/');
        return (
          (v ? fassung(ablage(kvnr), String(typ), String(id), v) : undefined) ??
          finden(kvnr, String(typ), String(id))
        );
      })
      .filter((r): r is Ressource => !!r)
      .sort(
        (x, y) =>
          String(x['authoredOn'] ?? '').localeCompare(String(y['authoredOn'] ?? '')) ||
          String(x.id).localeCompare(String(y.id)),
      );
    const dazu: Ressource[] = [];
    const nimm = (r: Ressource | undefined) => {
      if (r && !dazu.some((x) => x.resourceType === r.resourceType && x.id === r.id)) dazu.push(r);
    };
    for (const e of eintraege) {
      nimm(zumBezug('Medication', referenzId(e['medicationReference'])));
      for (const v of (e['reasonReference'] as { reference?: string }[] | undefined) ?? [])
        nimm(zumBezug('Condition', referenzId(v)));
      // Über `activity` die jüngste Medikationsinformation (nach Datumsbezug) mit Verordnung,
      // Abgabe und deren Arzneimitteln (IG-MED77392SBV, IG-MED49768SWR).
      const juengste = aktivitaetsverweise(e)
        .map((id) => zumBezug('MedicationStatement', id))
        .filter((r): r is Ressource => !!r)
        .sort(nachBezugsdatum)[0];
      if (juengste) {
        nimm(juengste);
        for (const q of (juengste['derivedFrom'] as { reference?: string }[] | undefined) ?? []) {
          const [typ, id] = String(q.reference ?? '').split('/');
          const quelle = zumBezug(String(typ), String(id));
          nimm(quelle);
          if (quelle) nimm(zumBezug('Medication', referenzId(quelle['medicationReference'])));
        }
      }
      // Änderungseinträge des eMP-Eintrags mit den verantwortlichen Organisationen.
      for (const p of ablage(kvnr).filter(
        (r) =>
          r.resourceType === 'Provenance' &&
          !istChronologie(r, EMP) &&
          String(r['recorded'] ?? '') <= bezug &&
          (r['target'] as { reference: string }[]).some((t) =>
            t.reference.startsWith(`MedicationRequest/${String(e.id)}/`),
          ),
      )) {
        nimm(p);
        nimm(finden(kvnr, 'Organization', referenzId((p['agent'] as { who: unknown }[])[0]?.who)));
      }
    }
    return {
      resourceType: 'Bundle',
      meta: { lastUpdated: jetzt() },
      type: 'collection',
      timestamp: jetzt(),
      entry: [patientFuer(kvnr), chronologie, ...eintraege, ...dazu].map((r) => ({
        fullUrl: vollUrl(r),
        resource: r,
      })),
    };
  });

  /** `$medication-plan-log` — die Chronologie, neueste zuerst. */
  app.get(`${b}/$medication-plan-log`, async (anfrage, antwort) => {
    if (operationsparameterAbweisen(anfrage, { _count: ZAHL, _offset: ZAHL }, antwort))
      return antwort;
    const kvnr = kvnrAus(anfrage);
    const q = anfrage.query as Record<string, string | undefined>;
    const anzahl = Number(q['_count'] ?? 50);
    const ab = Number(q['_offset'] ?? 0);
    // Neueste zuerst; bei gleichem Zeitpunkt die zuletzt angelegte.
    const sortiert = ablage(kvnr)
      .filter((r) => istChronologie(r, EMP))
      .reverse();
    const treffer = sortiert.slice(ab, ab + anzahl);
    return { ...suchergebnis(treffer), total: sortiert.length };
  });

  /**
   * Render API: Einstellung der Zwischenüberschriften im eMP (IG 1.4.0-ballot.1, „Render API:
   * Einstellung der Zwischenüberschriften (eMP)"): je Aktenkonto, PUT setzt, GET liefert den
   * anwendbaren Wert; JSON und XML mit dem Feld `subheadings`, Standard `true`. Kein FHIR.
   */
  const einstellung = (wert: boolean, anfrage: Anfrage, antwort: SimAntwort) =>
    String(anfrage.headers['accept'] ?? '').includes('xml')
      ? antwort
          .type('application/xml')
          .send(`<settings><subheadings>${String(wert)}</subheadings></settings>`)
      : antwort.type('application/json').send({ subheadings: wert });
  app.get(RENDER_EINSTELLUNG, async (anfrage, antwort) =>
    einstellung(bestandFuer(kvnrAus(anfrage)).empZwischenueberschriften ?? true, anfrage, antwort),
  );
  app.put(RENDER_EINSTELLUNG, async (anfrage, antwort) => {
    const koerper = anfrage.body;
    const wert =
      typeof koerper === 'string'
        ? /<subheadings>\s*(true|false)\s*<\/subheadings>/.exec(koerper)?.[1]
        : (koerper as { subheadings?: unknown } | undefined)?.subheadings;
    const gueltig = wert === true || wert === false || wert === 'true' || wert === 'false';
    if (!gueltig)
      return antwort
        .code(400)
        .send(operationOutcome('error', 'invalid', 'Erwartet wird subheadings (boolean).'));
    const b = bestandFuer(kvnrAus(anfrage));
    b.empZwischenueberschriften = wert === true || wert === 'true';
    return einstellung(b.empZwischenueberschriften, anfrage, antwort);
  });

  /**
   * Common Query API `/epa/query/api/v1/fhir` (`de.gematik.epa` 1.4.0-ballot.1): Suche, Lesen und
   * Versionshistorie je Ressourcentyp. Der Medication Service hat seit 1.4.0 keine eigene Query
   * API mehr. Neben `_id`, `_lastUpdated`, `status` und `identifier` die Parameter, mit denen ein
   * Primärsystem Änderungen seit einem Zeitpunkt abfragt: an Provenance `recorded`, `when`,
   * `agent-identifier`, `target`, `is-emp-chronology`. ⚠ Die Demo bedient nur die Typen des
   * Medication Service samt `Condition` (Behandlungsgründe); `_has`, `Patient`, `Practitioner`,
   * `PractitionerRole` und `AuditEvent` sind nicht nachgebildet.
   */
  const q = QUERY_BASIS;
  /** Fassungen einer Instanz, neueste zuerst — aus dem Archiv, dazu die aktuelle. */
  const verlauf = (kvnr: string, typ: string, id: string): Ressource[] => {
    const aktuell = finden(kvnr, typ, id);
    const alle = fassungen(ablage(kvnr), typ, id);
    return (
      aktuell && !alle.some((f) => f.meta?.versionId === aktuell.meta?.versionId)
        ? [...alle, aktuell]
        : alle
    )
      .slice()
      .reverse();
  };
  const verlaufsbundle = (eintraege: Ressource[]) => ({
    resourceType: 'Bundle',
    meta: { lastUpdated: jetzt() },
    type: 'history',
    total: eintraege.length,
    entry: eintraege.map((f) => ({
      fullUrl: vollUrl(f),
      resource: f,
      request: {
        method: f.meta?.versionId === '1' ? 'POST' : 'PUT',
        url: `${f.resourceType}/${String(f.id)}`,
      },
      response: { status: f.meta?.versionId === '1' ? '201 Created' : '200 OK' },
    })),
  });
  const nachAktualitaet = (a: Ressource, b: Ressource) =>
    String(b.meta?.lastUpdated ?? '').localeCompare(String(a.meta?.lastUpdated ?? ''));
  for (const typ of [
    'Medication',
    'MedicationRequest',
    'MedicationDispense',
    'MedicationStatement',
    'Condition',
    'Organization',
    'Provenance',
  ]) {
    // Provenance kennt laut CapabilityStatement nur Suche und Lesen, keine Historie.
    const mitHistorie = typ !== 'Provenance';
    if (mitHistorie) {
      /** history-type: alle Fassungen aller Instanzen des Typs, neueste zuerst. */
      app.get(`${q}/${typ}/_history`, async (anfrage) => {
        const kvnr = kvnrAus(anfrage);
        const kennungen = new Set([
          ...ablage(kvnr)
            .filter((r) => r.resourceType === typ)
            .map((r) => String(r.id)),
          ...archivierteKennungen(ablage(kvnr), typ),
        ]);
        return verlaufsbundle(
          [...kennungen].flatMap((id) => verlauf(kvnr, typ, id)).sort(nachAktualitaet),
        );
      });
    }
    app.get(`${q}/${typ}`, async (anfrage, antwort) => {
      const kvnr = kvnrAus(anfrage);
      const p = anfrage.query as Record<string, string | string[] | undefined>;
      const ergebnis = suchen(typ, p, ablage(kvnr));
      if (!Array.isArray(ergebnis))
        return melden(
          antwort,
          400,
          ergebnis.art === 'unbekannt' ? 'not-supported' : 'invalid',
          ergebnis.text,
          ergebnis.art === 'unbekannt' ? MSG.parameterUnbekannt : MSG.syntax,
        );
      // Standardsortierung: zuletzt geändert zuerst (IG-MED37997J2U und Verwandte).
      ergebnis.sort(nachAktualitaet);
      const ab = Number(([] as string[]).concat(p['_offset'] ?? [])[0] ?? 0);
      const anzahl = Number(([] as string[]).concat(p['_count'] ?? [])[0] ?? ergebnis.length);
      return { ...suchergebnis(ergebnis.slice(ab, ab + anzahl)), total: ergebnis.length };
    });
    const unbekannt = (antwort: SimAntwort) =>
      antwort.code(404).send(operationOutcome('error', 'not-found', `${typ} nicht gefunden.`));
    // Gelöschte Instanzen: 410 (FHIR read); ihre Fassungen bleiben über die Historie abrufbar.
    const fehltOderGeloescht = (kvnr: string, id: string, antwort: SimAntwort) =>
      istGeloescht(ablage(kvnr), typ, id)
        ? melden(antwort, 410, 'deleted', `${typ}/${id} wurde gelöscht.`, MSG.geloescht)
        : unbekannt(antwort);
    app.get(`${q}/${typ}/:id`, async (anfrage, antwort) => {
      const kvnr = kvnrAus(anfrage);
      const id = (anfrage.params as { id: string }).id;
      return finden(kvnr, typ, id) ?? fehltOderGeloescht(kvnr, id, antwort);
    });
    if (!mitHistorie) continue;
    /** Versionshistorie einer Instanz, neueste zuerst — aus dem Fassungsarchiv, auch gelöscht. */
    app.get(`${q}/${typ}/:id/_history`, async (anfrage, antwort) => {
      const kvnr = kvnrAus(anfrage);
      const id = (anfrage.params as { id: string }).id;
      const liste = verlauf(kvnr, typ, id);
      return liste.length > 0 ? verlaufsbundle(liste) : unbekannt(antwort);
    });
    app.get(`${q}/${typ}/:id/_history/:vid`, async (anfrage, antwort) => {
      const kvnr = kvnrAus(anfrage);
      const { id, vid } = anfrage.params as { id: string; vid: string };
      const f = verlauf(kvnr, typ, id).find((x) => x.meta?.versionId === vid);
      return f ?? unbekannt(antwort);
    });
  }

  /* ---------- Schreiben: eMP ---------- */

  interface Ergebnis {
    /** Fehlt nach dem Löschen eines fehlerhaften Eintrags (IG-MED-BL-UPDATE-EMP-ENTRY-V3). */
    eintrag?: Ressource;
    medication?: Ressource;
    gruende: Ressource[];
    aktivitaet: Ressource;
    /** Ohne Änderung entsteht keine Fassung und kein Chronologieeintrag. */
    geaendert: boolean;
  }

  const statusUngueltig = (antwort: SimAntwort, text: string) =>
    antwort
      .code(400)
      .send(
        operationOutcome(
          'error',
          'processing',
          text,
          detail('MEDSVC_STATUS_INVALID', 'Invalid Status in Parameters'),
        ),
      );

  /**
   * Prüfungen vor der Transaktion, ohne etwas zu ändern (Diagramme IG-MED-BL-ADD-EMP-ENTRY-V2 und
   * IG-MED-BL-UPDATE-EMP-ENTRY-V3): Person (403), Struktur der Eingabe (422), Status (400),
   * Dosierungstext (400). Danach prüft der Aufrufer den Lesenachweis (409).
   */
  function eingangPruefen(
    kvnr: string,
    koerper: unknown,
    art: 'add' | 'update',
    antwort: SimAntwort,
  ): boolean {
    const eingang = parameterLesen(koerper, 'empEntry')?.resource;
    if (identitaetAbweisen(kvnr, eingang, antwort)) return false;
    const fehler = empEintragPruefen(eingang);
    if (fehler) {
      void ungueltig(antwort, fehler);
      return false;
    }
    if (art === 'add') {
      const teile = parameterLesen(koerper, 'medication')?.part ?? [];
      const resource = teile.find((p) => p.name === 'resource')?.resource;
      const reference = teile.find((p) => p.name === 'reference')?.valueReference?.reference;
      if (!resource === !reference) {
        void ungueltig(
          antwort,
          'Der Parameter „medication“ braucht genau eines: resource oder reference.',
        );
        return false;
      }
      const mittelfehler = resource ? medicationPruefen(resource) : null;
      if (mittelfehler) {
        void ungueltig(antwort, mittelfehler);
        return false;
      }
      if (reference && /\/_history\//.test(reference)) {
        // ⚠ Eigenregel der Demo: Der Verweis zielt auf die Instanz, nicht auf eine Fassung.
        void ungueltig(antwort, 'Der Verweis auf das Arzneimittel darf keine Fassung nennen.');
        return false;
      }
      if (
        profilAbweisen(eingang, PROFIL.empEintrag, antwort) ||
        (resource && profilAbweisen(resource, PROFIL.empMedication, antwort)) ||
        gruendeAbweisen(koerper, antwort)
      )
        return false;
      if (eingang!['status'] === 'entered-in-error') {
        void statusUngueltig(antwort, 'Ein neuer eMP-Eintrag kann nicht fehlerhaft sein.');
        return false;
      }
    } else {
      if (!parameterLesen(koerper, 'medicationPlanIdentifier')?.valueIdentifier?.value) {
        void ungueltig(antwort, 'Der Parameter „medicationPlanIdentifier“ fehlt.');
        return false;
      }
      // `medication` darf ein EMPMedication oder ein EPAMedication sein.
      const mittel = parameterLesen(koerper, 'medication')?.resource;
      const mittelfehler = mittel ? medicationPruefen(mittel) : null;
      if (mittelfehler) {
        void ungueltig(antwort, mittelfehler);
        return false;
      }
      const mittelprofil = ((mittel?.meta?.profile ?? []) as string[]).some((p) =>
        p.startsWith(PROFIL.medication.split('|')[0]!),
      )
        ? PROFIL.medication
        : PROFIL.empMedication;
      if (
        profilAbweisen(eingang, PROFIL.empEintrag, antwort) ||
        (mittel && profilAbweisen(mittel, mittelprofil, antwort)) ||
        gruendeAbweisen(koerper, antwort)
      )
        return false;
    }
    return !dosierungAbweisen(eingang!, antwort);
  }

  /** Kern von `$add-emp-entry` nach dem Lesenachweis — auch für den Stapel. */
  function empEintragAnlegen(
    kvnr: string,
    koerper: unknown,
    wer: Handelnde,
    antwort: SimAntwort,
  ): Ergebnis | null {
    const eingang = parameterLesen(koerper, 'empEntry')!.resource!;
    const mittelteil = parameterLesen(koerper, 'medication')?.part ?? [];
    const neuesMittel = mittelteil.find((p) => p.name === 'resource')?.resource;
    const verweis = mittelteil.find((p) => p.name === 'reference')?.valueReference?.reference;

    // Erst alle Prüfungen am Arzneimittel, dann die erste Änderung.
    let medication: Ressource | undefined;
    if (neuesMittel) {
      if (neuesMittel['status'] === 'entered-in-error') {
        void statusUngueltig(antwort, 'Das Arzneimittel ist als fehlerhaft gekennzeichnet.');
        return null;
      }
    } else {
      const mittelId = String(verweis).split('/')[1] ?? '';
      medication = finden(kvnr, 'Medication', mittelId);
      if (!medication) {
        void (istGeloescht(ablage(kvnr), 'Medication', mittelId)
          ? melden(antwort, 410, 'processing', `Gelöscht: ${String(verweis)}`, MSG.geloescht)
          : melden(antwort, 404, 'not-found', `Nicht gefunden: ${String(verweis)}`, MSG.unbekannt));
        return null;
      }
      if (medication['status'] === 'entered-in-error') {
        void statusUngueltig(antwort, 'Das Arzneimittel ist als fehlerhaft gekennzeichnet.');
        return null;
      }
      // Ein eMP-Eintrag verweist schon auf dieses Arzneimittel (medicationReference oder
      // originMedication) — 409.
      const schonImPlan = ablage(kvnr).some(
        (r) =>
          istEmpEintrag(r) &&
          kontext(r) === 'EMP' &&
          (referenzId(r['medicationReference']) === mittelId ||
            ((r.extension ?? []) as { url: string; valueReference?: unknown }[]).some(
              (e) => e.url === EXT.herkunftsmittel && referenzId(e.valueReference) === mittelId,
            )),
      );
      if (schonImPlan) {
        void melden(
          antwort,
          409,
          'conflict',
          'Ein eMP-Eintrag verweist bereits auf dieses Arzneimittel.',
          detail('MEDSVC_EMP_ENTRY_ALREADY_EXISTS', 'eMP entry already exists'),
        );
        return null;
      }
      if (
        ablage(kvnr).some(
          (r) =>
            r.resourceType === 'MedicationStatement' &&
            referenzId(r['medicationReference']) === mittelId &&
            verknuepfterEintrag(r) !== null,
        )
      ) {
        void antwort
          .code(400)
          .send(
            operationOutcome(
              'error',
              'business-rule',
              'Der eML-Eintrag zu diesem Arzneimittel ist bereits mit einem eMP-Eintrag verknüpft.',
              detail('MEDSVC_ALREADY_LINKED', 'Already linked to another instance'),
            ),
          );
        return null;
      }
    }

    const zeit = jetzt();
    if (neuesMittel) {
      medication = mitKontext(
        {
          ...neuesMittel,
          id: neueId('med'),
          meta: { versionId: '1', lastUpdated: zeit, profile: [PROFIL.empMedication] },
          status: 'active',
        },
        'EMP',
      );
      ablage(kvnr).push(medication);
    }
    // Kennung und MedicationPlanIdentifier: derselbe UUID-Wert (IG-MED17706LL3).
    const id = uuidV7();
    const eintrag: Ressource = mitKontext(
      {
        ...eingang,
        id,
        meta: { versionId: '1', lastUpdated: zeit, profile: [PROFIL.empEintrag] },
        identifier: [{ system: EMP_IDENTIFIER, value: id }],
        status: eingang['status'] ?? 'active',
        medicationReference: { reference: `Medication/${String(medication!.id)}` },
        subject: subjektFuer(kvnr),
        extension: [
          ...((eingang.extension ?? []) as { url: string }[]).filter(
            (e) => e.url !== EXT.herkunftsmittel && e.url !== EXT.aktivitaet,
          ),
          {
            url: EXT.herkunftsmittel,
            valueReference: { reference: `Medication/${String(medication!.id)}` },
          },
        ],
      },
      'EMP',
    );
    const gruende = gruendeAnlegen(kvnr, koerper, eintrag, zeit);
    kategorieSetzen(eintrag, eingang, null);
    if (neuesMittel) mittelstatus(medication, eintrag);
    else mittelstatusSetzen(kvnr, eintrag, zeit);
    ablage(kvnr).push(eintrag);
    // Verweist der Eintrag auf das Arzneimittel eines eML-Eintrags, verknüpft der Dienst beide
    // selbst („link eMP element“) — ohne dessen Dosierung zu übernehmen.
    const zuVerknuepfen = neuesMittel
      ? []
      : ablage(kvnr).filter(
          (r) =>
            r.resourceType === 'MedicationStatement' &&
            r['status'] !== 'entered-in-error' &&
            kontext(r) !== 'EMP' &&
            referenzId(r['medicationReference']) === medication!.id &&
            verknuepfterEintrag(r) === null,
        );
    const verordnungen: Ressource[] = [];
    for (const a of zuVerknuepfen) {
      const v = verknuepfen(kvnr, a, eintrag, zeit, false);
      if (v) verordnungen.push(v);
      fortschreiben(a, zeit);
    }
    const aktivitaet = aktivitaetAnlegen(
      ablage(kvnr),
      [
        versionierterVerweis(eintrag),
        ...zuVerknuepfen.map(versionierterVerweis),
        ...verordnungen.map(versionierterVerweis),
      ],
      wer,
      'CREATE',
      zeit,
    );
    return { eintrag, medication, gruende, aktivitaet, geaendert: true };
  }

  /** Kern von `$update-emp-entry` nach dem Lesenachweis — auch für den Stapel. */
  function empEintragAendern(
    kvnr: string,
    koerper: unknown,
    wer: Handelnde,
    antwort: SimAntwort,
  ): Ergebnis | null {
    const kennung = parameterLesen(koerper, 'medicationPlanIdentifier')?.valueIdentifier?.value;
    const eingang = parameterLesen(koerper, 'empEntry')!.resource!;
    const vorhanden = ablage(kvnr).find(
      (r) =>
        istEmpEintrag(r) &&
        (r['identifier'] as { value?: string }[] | undefined)?.some((i) => i.value === kennung),
    );
    // Geschäftslogik IG 1.4.0-ballot.1: unbekannt 404, Fassung nicht aktuell 409, Kontext nicht
    // EMP 405, fehlerhaftes Arzneimittel 400 — alles vor der ersten Änderung.
    if (!vorhanden) {
      void melden(antwort, 404, 'not-found', `Kein eMP-Eintrag ${kennung ?? ''}.`, MSG.unbekannt);
      return null;
    }
    const fassungEingang = eingang.meta?.versionId;
    if (fassungEingang !== vorhanden.meta?.versionId) {
      void melden(
        antwort,
        409,
        'conflict',
        `Update Conflict (server current version = ${String(vorhanden.meta?.versionId)}, client version referenced = ${String(fassungEingang)})`,
        MSG.versionskonflikt,
      );
      return null;
    }
    if (kontext(vorhanden) !== 'EMP') {
      void melden(antwort, 405, 'forbidden', 'Kein eMP-Eintrag (Kontext).', MSG.nichtErlaubt);
      return null;
    }
    const neuesMittel = parameterLesen(koerper, 'medication')?.resource;
    if (neuesMittel?.['status'] === 'entered-in-error') {
      void statusUngueltig(antwort, 'Das Arzneimittel ist als fehlerhaft gekennzeichnet.');
      return null;
    }

    const zeit = jetzt();
    // Der neue Stand: alles aus der Eingabe — außer dem, was der Dienst führt.
    const geschuetzt = new Set<string>([
      EXT.kontext,
      EXT.herkunftsmittel,
      EXT.aktivitaet,
      EXT.kategorie,
    ]);
    const neu: Ressource = {
      ...eingang,
      id: vorhanden.id,
      meta: vorhanden.meta,
      identifier: vorhanden['identifier'],
      subject: vorhanden['subject'],
      medicationReference: vorhanden['medicationReference'],
      extension: [
        ...((vorhanden.extension ?? []) as { url: string }[]).filter((e) => geschuetzt.has(e.url)),
        ...((eingang.extension ?? []) as { url: string }[]).filter((e) => !geschuetzt.has(e.url)),
      ],
    };
    delete neu['reasonCode'];
    delete neu['reasonReference'];
    if (vorhanden['reasonReference'] !== undefined)
      neu['reasonReference'] = vorhanden['reasonReference'];
    // Behandlungsgründe: Neue Gründe ersetzen die alten; ohne Gründe und ohne Verweis entfallen sie.
    const neueGruende = parameterAlle(koerper, 'reasonCondition').length > 0;
    const alteGruende = (
      (vorhanden['reasonReference'] as { reference?: string }[] | undefined) ?? []
    ).map((v) => finden(kvnr, 'Condition', referenzId(v)));
    const gruendeEntfallen =
      neueGruende ||
      (eingang['reasonReference'] === undefined && vorhanden['reasonReference'] !== undefined);
    if (gruendeEntfallen) delete neu['reasonReference'];
    if (neueGruende) neu['reasonReference'] = eingang['reasonReference'];
    // Kategorie: neu nur bei strukturierter Dosierung, sonst unverändert.
    const auto = automatischeKategorie(neu['dosageInstruction']);
    if (auto)
      neu.extension = [
        ...((neu.extension ?? []) as { url: string }[]).filter((e) => e.url !== EXT.kategorie),
        { url: EXT.kategorie, valueCode: auto },
      ];

    // Keine Änderung: keine neue Fassung, der letzte Änderungseintrag gilt weiter.
    if (!neuesMittel && !neueGruende && !gruendeEntfallen && inhaltGleich(neu, vorhanden)) {
      const aktivitaet = letzteAktivitaet(kvnr, 'MedicationRequest', String(vorhanden.id));
      if (aktivitaet) return { eintrag: vorhanden, gruende: [], aktivitaet, geaendert: false };
    }

    // Fehlerhaft: verknüpfte eML-Einträge lösen (je eigener Änderungseintrag), den Eintrag löschen.
    if (neu['status'] === 'entered-in-error') {
      for (const a of ablage(kvnr).filter(
        (r) => r.resourceType === 'MedicationStatement' && verknuepfterEintrag(r) === vorhanden.id,
      )) {
        const verordnung = verknuepfungLoesen(kvnr, a, vorhanden, zeit);
        fortschreiben(a, zeit);
        aktivitaetAnlegen(
          ablage(kvnr),
          [versionierterVerweis(a), ...(verordnung ? [versionierterVerweis(verordnung)] : [])],
          wer,
          'UPDATE',
          zeit,
        );
      }
      const aktivitaet = aktivitaetAnlegen(
        ablage(kvnr),
        [versionierterVerweis(vorhanden)],
        wer,
        'DELETE',
        zeit,
      );
      loeschen(ablage(kvnr), vorhanden);
      const mittelId = referenzId(vorhanden['medicationReference']);
      const mittel = finden(kvnr, 'Medication', mittelId);
      if (mittel && kontext(mittel) === 'EMP') mittelLoeschenWennFrei(kvnr, mittelId);
      return { gruende: [], aktivitaet, geaendert: true };
    }

    for (const feld of Object.keys(vorhanden)) if (!(feld in neu)) delete vorhanden[feld];
    Object.assign(vorhanden, neu);
    // 1.4.0: Das Arzneimittel lässt sich über den Parameter `medication` austauschen; das alte
    // wird gelöscht, wenn es niemand mehr braucht.
    let ausgetauscht: Ressource | undefined;
    if (neuesMittel) {
      const altesMittel = referenzId(vorhanden['medicationReference']);
      const istEpa = ((neuesMittel.meta?.profile ?? []) as string[]).some((p) =>
        p.startsWith(PROFIL.medication.split('|')[0]!),
      );
      ausgetauscht = mitKontext(
        {
          ...neuesMittel,
          id: neueId('med'),
          meta: {
            versionId: '1',
            lastUpdated: zeit,
            profile: [istEpa ? PROFIL.medication : PROFIL.empMedication],
          },
        },
        'EMP',
      );
      ablage(kvnr).push(ausgetauscht);
      vorhanden['medicationReference'] = { reference: `Medication/${String(ausgetauscht.id)}` };
      mittelLoeschenWennFrei(kvnr, altesMittel);
    }
    if (gruendeEntfallen) for (const g of alteGruende) if (g) loeschen(ablage(kvnr), g);
    const gruende = neueGruende ? gruendeAnlegen(kvnr, koerper, vorhanden, zeit) : [];
    fortschreiben(vorhanden, zeit);
    mittelstatusSetzen(kvnr, vorhanden, zeit);
    const aktivitaet = aktivitaetAnlegen(
      ablage(kvnr),
      [versionierterVerweis(vorhanden)],
      wer,
      'UPDATE',
      zeit,
    );
    const medication = finden(kvnr, 'Medication', referenzId(vorhanden['medicationReference']));
    return { eintrag: vorhanden, medication, gruende, aktivitaet, geaendert: true };
  }

  const bestaetigt = (koerper: unknown) =>
    parameterLesen(koerper, 'acknowledgedChronologyId')?.valueId;

  /** Ausgabe nach `EPAOpEMPEntryOutputParameters`; die Chronologie nur, wenn es eine gibt. */
  const empAusgabe = (e: Ergebnis, chronologie: Ressource | null) =>
    ausgabe([
      ['empEntry', e.eintrag],
      ['medication', e.medication],
      ...e.gruende.map((g) => ['reasonCondition', g] as [string, Ressource]),
      ['relatedActivity', e.aktivitaet],
      ['relatedChronology', chronologie ?? undefined],
    ]);

  for (const [art, weg, kern] of [
    ['add', `${b}/$add-emp-entry`, empEintragAnlegen],
    ['update', `${b}/$update-emp-entry`, empEintragAendern],
  ] as const) {
    app.post(weg, async (anfrage, antwort) => {
      const kvnr = kvnrAus(anfrage);
      const wer = organisation(anfrage, antwort);
      if (!wer || !eingangPruefen(kvnr, anfrage.body, art, antwort)) return antwort;
      if (!lesenachweisPruefen(ablage(kvnr), EMP, bestaetigt(anfrage.body), antwort))
        return antwort;
      const e = kern(kvnr, anfrage.body, wer, antwort);
      if (!e) return antwort;
      // Ein Chronologieeintrag nur, wenn sich die Menge der gültigen Einträge ändert.
      const chronologie = e.geaendert
        ? chronologieAnlegen(ablage(kvnr), EMP, wer)
        : aktuelleChronologie(ablage(kvnr), EMP);
      return empAusgabe(e, chronologie);
    });
  }

  /** `$emp-commit` gibt es nur im Stapel. */
  app.post(`${b}/$emp-commit`, async (_anfrage, antwort) =>
    antwort
      .code(405)
      .send(
        operationOutcome(
          'error',
          'forbidden',
          '$emp-commit ist nur innerhalb von $batch-emp zulässig.',
          detail(
            'MEDSVC_OPERATION_OUTSIDE_BATCH',
            'The operation can only be executed within a batch context',
          ),
        ),
      ),
  );

  /**
   * `$batch-emp` — mehrere Änderungen in einem Aufruf, abgeschlossen mit genau einem
   * `$emp-commit` (Profil EPABatchEmpRequestBundle). Der Dienst führt alle Anlagen, dann alle
   * Änderungen, dann den Abschluss aus — gleich in welcher Reihenfolge das Bundle sie nennt
   * (IG-MED35195DPV). Atomar: Scheitert ein Eintrag, bleibt der Plan unverändert.
   */
  app.post(`${b}/$batch-emp`, async (anfrage, antwort) => {
    const kvnr = kvnrAus(anfrage);
    const wer = organisation(anfrage, antwort);
    if (!wer) return antwort;
    const bundle = (parameterLesen(anfrage.body, 'resource')?.resource ?? anfrage.body) as {
      type?: string;
      entry?: { request?: { method?: string; url?: string }; resource?: unknown }[];
    };
    const eintraege = bundle.entry ?? [];
    const art = (e: (typeof eintraege)[number]) => {
      const url = String(e.request?.url ?? '');
      return url.includes('$add-emp-entry')
        ? 'add'
        : url.includes('$update-emp-entry')
          ? 'update'
          : url.includes('$emp-commit')
            ? 'commit'
            : null;
    };
    const abschluss = eintraege.filter((e) => art(e) === 'commit');
    if (
      bundle.type !== 'transaction' ||
      abschluss.length !== 1 ||
      eintraege.some((e) => !art(e) || (e.request?.method ?? 'POST') !== 'POST')
    ) {
      return ungueltig(
        antwort,
        'Erwartet wird ein Bundle vom Typ transaction mit POST-Einträgen für $add-emp-entry und $update-emp-entry und genau einem $emp-commit.',
      );
    }
    for (const e of eintraege) {
      const a = art(e);
      if (a !== 'commit' && !eingangPruefen(kvnr, e.resource, a!, antwort)) return antwort;
    }
    if (!lesenachweisPruefen(ablage(kvnr), EMP, bestaetigt(abschluss[0]!.resource), antwort))
      return antwort;
    const sicherung = JSON.parse(JSON.stringify(ablage(kvnr))) as Ressource[];
    const archiv = archivSichern(ablage(kvnr));
    const antworten = new Map<number, unknown>();
    const reihenfolge = [
      ...eintraege.map((e, i) => [e, i] as const).filter(([e]) => art(e) === 'add'),
      ...eintraege.map((e, i) => [e, i] as const).filter(([e]) => art(e) === 'update'),
    ];
    for (const [e, i] of reihenfolge) {
      const erg =
        art(e) === 'add'
          ? empEintragAnlegen(kvnr, e.resource, wer, antwort)
          : empEintragAendern(kvnr, e.resource, wer, antwort);
      if (!erg) {
        ablage(kvnr).splice(0, ablage(kvnr).length, ...sicherung);
        archivWiederherstellen(ablage(kvnr), archiv);
        return antwort;
      }
      antworten.set(i, {
        response: { status: '200 OK' },
        resource: empAusgabe(erg, null),
      });
    }
    const chronologie = chronologieAnlegen(ablage(kvnr), EMP, wer);
    return {
      resourceType: 'Bundle',
      type: 'transaction-response',
      entry: eintraege.map((e, i) =>
        art(e) === 'commit'
          ? { response: { status: '200 OK' }, resource: chronologie }
          : antworten.get(i),
      ),
    };
  });

  /* ---------- Schreiben: eML ---------- */

  /** `$add-eml-entry` — Nachtrag einer Medikation in die eML (Kontext MANUAL). */
  app.post(`${b}/MedicationStatement/$add-eml-entry`, async (anfrage, antwort) => {
    const kvnr = kvnrAus(anfrage);
    const wer = organisation(anfrage, antwort);
    if (!wer) return antwort;
    const aussage = parameterLesen(anfrage.body, 'medicationStatement')?.resource;
    const mittel = parameterLesen(anfrage.body, 'medication')?.resource;
    if (identitaetAbweisen(kvnr, aussage, antwort)) return antwort;
    const f = medicationPruefen(mittel);
    if (f) return ungueltig(antwort, f);
    if (!aussage || aussage.resourceType !== 'MedicationStatement') {
      return ungueltig(antwort, 'Es fehlt eine MedicationStatement-Ressource.');
    }
    if (
      profilAbweisen(aussage, PROFIL.aussage, antwort) ||
      profilAbweisen(mittel, PROFIL.medication, antwort)
    )
      return antwort;
    // Geschäftslogik IG 1.4.0-ballot.1: Arzneimittel `active`, Nachtrag `unknown`.
    if (mittel!['status'] !== 'active')
      return statusUngueltig(antwort, 'Das Arzneimittel eines Nachtrags muss aktiv sein.');
    if (aussage['status'] !== 'unknown')
      return statusUngueltig(antwort, 'Ein Nachtrag trägt den Status „unknown“.');
    if (dosierungAbweisen(aussage, antwort)) return antwort;
    const zeit = jetzt();
    const medication: Ressource = {
      ...mittel!,
      id: neueId('med'),
      meta: { versionId: '1', lastUpdated: zeit, profile: [PROFIL.medication] },
    };
    const neu = mitKontext(
      {
        ...aussage,
        id: neueId('ms'),
        meta: { versionId: '1', lastUpdated: zeit, profile: [PROFIL.aussage] },
        status: aussage['status'] ?? 'unknown',
        medicationReference: { reference: `Medication/${String(medication.id)}` },
        subject: subjektFuer(kvnr),
        dateAsserted: zeit,
      },
      'MANUAL',
    );
    ablage(kvnr).push(medication, neu);
    // Ziel des Änderungseintrags ist nur der Nachtrag (IG-MED-BL-ADD-EML-ENTRY-V3).
    const aktivitaet = aktivitaetAnlegen(
      ablage(kvnr),
      [versionierterVerweis(neu)],
      wer,
      'CREATE',
      zeit,
    );
    return ausgabe([
      ['medicationStatement', neu],
      ['medication', medication],
      ['relatedActivity', aktivitaet],
    ]);
  });

  /** `$cancel-eml-entry` — nur für Nachträge; Einträge aus Verordnung oder Abgabe nicht. */
  app.post(`${b}/MedicationStatement/:id/$cancel-eml-entry`, async (anfrage, antwort) => {
    const kvnr = kvnrAus(anfrage);
    const wer = organisation(anfrage, antwort);
    if (!wer) return antwort;
    const aussage = finden(kvnr, 'MedicationStatement', (anfrage.params as { id: string }).id);
    if (!aussage)
      return melden(
        antwort,
        404,
        'not-found',
        'Kein eML-Eintrag mit dieser Kennung.',
        MSG.unbekannt,
      );
    if (kontext(aussage) !== 'MANUAL')
      return melden(
        antwort,
        405,
        'forbidden',
        'Nur Nachträge lassen sich stornieren, keine Einträge aus Verordnung oder Abgabe.',
        MSG.nichtErlaubt,
      );
    const zeit = jetzt();
    // 1.4.0 (IG-MED-BL-CANCEL-EML-ENTRY-V4): Ein verknüpfter eMP-Eintrag wird wie bei
    // `$unlink-emp` gelöst und gegebenenfalls zurückgesetzt — mit eigenem Änderungseintrag; dann
    // entsteht ein neuer Stand des eMP (`systemNotice` `empChanged`).
    const planId = verknuepfterEintrag(aussage);
    const eintrag = planId ? finden(kvnr, 'MedicationRequest', planId) : undefined;
    let empGeaendert = false;
    if (eintrag) {
      empGeaendert = empZuruecksetzen(kvnr, eintrag, aussage, zeit).eintragGeaendert;
      fortschreiben(aussage, zeit);
      if (empGeaendert) {
        fortschreiben(eintrag, zeit);
        aktivitaetAnlegen(ablage(kvnr), [versionierterVerweis(eintrag)], wer, 'UPDATE', zeit);
      }
    }
    // Der Nachtrag wird gelöscht (bleibt über die Historie abrufbar), sein Arzneimittel ebenso,
    // sofern kein eMP-Eintrag mehr darauf verweist.
    const aktivitaet = aktivitaetAnlegen(
      ablage(kvnr),
      [versionierterVerweis(aussage)],
      wer,
      'DELETE',
      zeit,
    );
    loeschen(ablage(kvnr), aussage);
    const mittelId = referenzId(aussage['medicationReference']);
    const mittel = finden(kvnr, 'Medication', mittelId);
    const nochImPlan = ablage(kvnr).some(
      (r) =>
        istEmpEintrag(r) &&
        (referenzId(r['medicationReference']) === mittelId ||
          ((r.extension ?? []) as { url: string; valueReference?: unknown }[]).some(
            (e) => e.url === EXT.herkunftsmittel && referenzId(e.valueReference) === mittelId,
          )),
    );
    if (mittel && !nochImPlan) loeschen(ablage(kvnr), mittel);
    if (empGeaendert) chronologieAnlegen(ablage(kvnr), EMP, wer, zeit);
    const ergebnis = ausgabe([['relatedActivity', aktivitaet]]);
    return empGeaendert
      ? {
          ...ergebnis,
          parameter: [...ergebnis.parameter, { name: 'systemNotice', valueCode: 'empChanged' }],
        }
      : ergebnis;
  });

  /**
   * `$link-emp` / `$unlink-emp` — eML-Eintrag mit einem eMP-Eintrag verknüpfen oder lösen
   * (Diagramme IG-MED-BL-LINK-EMP-ENTRY-V2 und IG-MED-BL-UNLINK-EMP-ENTRY-V3).
   */
  for (const art of ['link', 'unlink'] as const) {
    app.post(`${b}/MedicationStatement/:id/$${art}-emp`, async (anfrage, antwort) => {
      const kvnr = kvnrAus(anfrage);
      const wer = organisation(anfrage, antwort);
      if (!wer) return antwort;
      const kennung = parameterLesen(anfrage.body, 'medicationPlanIdentifier')?.valueIdentifier
        ?.value;
      if (!kennung) return ungueltig(antwort, 'Der Parameter „medicationPlanIdentifier“ fehlt.');
      if (!lesenachweisPruefen(ablage(kvnr), EMP, bestaetigt(anfrage.body), antwort))
        return antwort;
      const msId = (anfrage.params as { id: string }).id;
      const aussage = finden(kvnr, 'MedicationStatement', msId);
      // eML-Eintrag gelöscht 410, unbekannt 404; eMP-Eintrag über die Kennung mit Kontext EMP,
      // sonst 400 (UN)LINKING_NOT_SUCCESSFUL.
      if (!aussage)
        return istGeloescht(ablage(kvnr), 'MedicationStatement', msId)
          ? melden(antwort, 410, 'processing', 'Der eML-Eintrag wurde gelöscht.', MSG.geloescht)
          : melden(
              antwort,
              404,
              'not-found',
              'Kein eML-Eintrag mit dieser Kennung.',
              MSG.unbekannt,
            );
      if (art === 'link' && aussage['status'] === 'entered-in-error')
        return statusUngueltig(antwort, 'Der eML-Eintrag ist als fehlerhaft gekennzeichnet.');
      const eintrag = ablage(kvnr).find(
        (r) =>
          istEmpEintrag(r) &&
          kontext(r) === 'EMP' &&
          ((r['identifier'] as { value?: string }[] | undefined) ?? []).some(
            (i) => i.value === kennung,
          ),
      );
      if (!eintrag)
        return melden(
          antwort,
          400,
          'processing',
          `Kein eMP-Eintrag ${kennung}.`,
          art === 'link'
            ? {
                system: VERARBEITUNG,
                code: 'LINKING_NOT_SUCCESSFUL',
                display: 'MedicationStatement could not be linked to an eMP-Entry successfully',
              }
            : {
                system: VERARBEITUNG,
                code: 'UNLINKING_NOT_SUCCESSFUL',
                display: 'MedicationStatement could not be unlinked from an eMP-Entry successfully',
              },
        );
      if (art === 'link' && eintrag['status'] === 'entered-in-error')
        return statusUngueltig(antwort, 'Der eMP-Eintrag ist als fehlerhaft gekennzeichnet.');
      const bisher = verknuepfterEintrag(aussage);
      const zeit = jetzt();
      let verordnung: Ressource | null = null;
      if (art === 'link') {
        if (bisher && bisher !== eintrag.id)
          return melden(
            antwort,
            400,
            'business-rule',
            'Der eML-Eintrag ist bereits mit einem anderen eMP-Eintrag verknüpft.',
            detail('MEDSVC_ALREADY_LINKED', 'Already linked to another instance'),
          );
        // Schon mit diesem Eintrag verknüpft: keine Änderung, der letzte Änderungseintrag gilt.
        if (bisher === eintrag.id) {
          const aktivitaet =
            letzteAktivitaet(kvnr, 'MedicationStatement', msId) ??
            letzteAktivitaet(kvnr, 'MedicationRequest', String(eintrag.id));
          return ausgabe([
            ['medicationStatement', aussage],
            ['empEntry', eintrag],
            ['relatedActivity', aktivitaet],
            ['relatedChronology', aktuelleChronologie(ablage(kvnr), EMP) ?? undefined],
          ]);
        }
        verordnung = verknuepfen(kvnr, aussage, eintrag, zeit, true);
        fortschreiben(eintrag, zeit);
      } else {
        if (bisher !== eintrag.id)
          return melden(
            antwort,
            405,
            'forbidden',
            'Der eML-Eintrag ist nicht mit diesem eMP-Eintrag verknüpft.',
            MSG.nichtErlaubt,
          );
        const loesung = empZuruecksetzen(kvnr, eintrag, aussage, zeit);
        verordnung = loesung.verordnung;
        if (loesung.eintragGeaendert) fortschreiben(eintrag, zeit);
      }
      fortschreiben(aussage, zeit);
      const eintragGeaendert = art === 'link' || String(eintrag.meta?.lastUpdated) === zeit;
      const aktivitaet = aktivitaetAnlegen(
        ablage(kvnr),
        [
          versionierterVerweis(aussage),
          ...(eintragGeaendert ? [versionierterVerweis(eintrag)] : []),
          ...(verordnung ? [versionierterVerweis(verordnung)] : []),
        ],
        wer,
        'UPDATE',
        zeit,
      );
      const chronologie = chronologieAnlegen(ablage(kvnr), EMP, wer, zeit);
      return ausgabe([
        ['medicationStatement', aussage],
        ['empEntry', eintrag],
        ['prescription', verordnung ?? undefined],
        ['relatedActivity', aktivitaet],
        ['relatedChronology', chronologie],
      ]);
    });
  }

  /**
   * Operationen des E-Rezept-Fachdienstes — nicht für Primärsysteme. Der Demo-Ersatz des
   * Fachdienstes (`erezept.ts`) wendet sie intern an.
   */
  for (const op of [
    'provide-prescription-erp',
    'cancel-prescription-erp',
    'provide-dispensation-erp',
    'cancel-dispensation-erp',
  ]) {
    app.post(`${b}/$${op}`, async (_a, antwort) =>
      antwort
        .code(403)
        .send(
          operationOutcome('error', 'forbidden', `$${op} ist dem E-Rezept-Fachdienst vorbehalten.`),
        ),
    );
  }
}
