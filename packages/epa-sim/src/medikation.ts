import type { SimAnfrage, SimAntwort } from './schnittstelle.ts';
import {
  CODESYSTEM,
  DOSIERUNGSTEXT_SPRACHE,
  DOSIERUNGSTEXT_VERSION,
  TEXT_EXTENSION,
  automatischeKategorie,
  dosierungstext,
  gerenderterText,
  type EmpKategorie,
  type Ressource,
  neueId,
  WEG,
} from '@demo-pvs/kern';
import { profilPruefen } from '@demo-pvs/kern/profilpruefung';
import { bestandFuer } from './bestand.ts';
import { istChronologie, type Chronologieart } from './chronologie.ts';
import {
  MS_DETAILS,
  TI_DETAILS,
  jetzt,
  operationOutcome,
  parameterLesen,
  type Detailcode,
} from './fhir-hilfen.ts';
import {
  fassungenSichern,
  fassungen,
  fortschreiben,
  loeschen,
  organisationAusKopf,
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

export const MEDIKATION_BASIS = WEG.medikation;
/** Common Query API (`de.gematik.epa` 1.4.0-ballot.1, CapabilityStatement epa-common-query-api-server). */
export const QUERY_BASIS = WEG.query;
/** Render API des Medication Service: Einstellung der Zwischenüberschriften im eMP. */
export const RENDER_EINSTELLUNG = WEG.renderEinstellung;

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
const ATC = CODESYSTEM.atc;

export const detail = (code: string, display: string): Detailcode => ({
  system: MS_DETAILS,
  code,
  display,
});

const HL7_OO = 'http://terminology.hl7.org/CodeSystem/operation-outcome';
export const VERARBEITUNG = `${MS.replace('StructureDefinition/', 'CodeSystem/')}epa-medicationstatement-processing-event-code`;

/** Fehlercodes aus HL7 `operation-outcome`, wie sie der IG je Operation nennt. */
export const MSG = {
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
export function melden(
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
export function operationsparameterAbweisen(
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
export const ZAHL = /^\d+$/;
/** Datum mit den Präfixen, die `imZeitraum` auswertet; `ap` ergibt 400 statt eines stillen Fehltreffers. */
export const DATUMSWERT =
  /^(eq|ne|gt|lt|ge|le|sa|eb)?\d{4}(-\d{2}(-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})?)?)?)?$/;

/** Datumsbezug eines eML-Eintrags (1.4.0): `effectiveDateTime`, Beginn von `effectivePeriod`, sonst `meta.lastUpdated`. */
export function bezugsdatum(r: Ressource): string {
  return String(
    r['effectiveDateTime'] ??
      (r['effectivePeriod'] as { start?: string } | undefined)?.start ??
      r.meta?.lastUpdated ??
      '',
  );
}

/** Absteigend nach Datumsbezug, dann nach `meta.lastUpdated` (IG-MED03188C0X). */
export function nachBezugsdatum(a: Ressource, b: Ressource): number {
  return (
    bezugsdatum(b).localeCompare(bezugsdatum(a)) ||
    String(b.meta?.lastUpdated ?? '').localeCompare(String(a.meta?.lastUpdated ?? ''))
  );
}

/** Seite eines Suchergebnisses mit `self` und, wenn es weitergeht, `next` (FHIR Paging). */
export function seitenverweise(
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

export function kontext(r: Ressource): string | undefined {
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

export function ablage(kvnr: string): Ressource[] {
  return bestandFuer(kvnr).medikation;
}

export function finden(kvnr: string, typ: string, id: string): Ressource | undefined {
  return ablage(kvnr).find((r) => r.resourceType === typ && r.id === id);
}

export function referenzId(verweis: unknown): string {
  return (
    String((verweis as { reference?: string } | undefined)?.reference ?? '').split('/')[1] ?? ''
  );
}

export function fehlt(
  antwort: SimAntwort,
  code: string,
  display: string,
  text: string,
  status = 404,
) {
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

export function ungueltig(antwort: SimAntwort, text: string) {
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
export function medicationPruefen(m: Ressource | undefined): string | null {
  if (!m || m.resourceType !== 'Medication') return 'Es fehlt eine Medication-Ressource.';
  const atc = (
    (m['code'] as { coding?: { system?: string; version?: string }[] } | undefined)?.coding ?? []
  ).filter((k) => k.system === ATC);
  if (atc.some((k) => !k.version)) {
    return 'Profilvalidierung fehlgeschlagen: code.coding:atc-de.version ist 1..1.';
  }
  return null;
}

export function empEintragPruefen(r: Ressource | undefined): string | null {
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
export function profilAbweisen(
  r: Ressource | undefined,
  profil: string,
  antwort: SimAntwort,
): boolean {
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
 * dort stehen. Nur de-DE mit Algorithmusversion 2.0.0 (general-principles). Die Invarianten von
 * `DosageDgMP` (Viererschema als Freitext, fehlende Metadaten des Texts) prüft vorher die
 * Profilprüfung (ADR 0056).
 */
export function dosierungAbweisen(r: Ressource, antwort: SimAntwort): boolean {
  const feld = r.resourceType === 'MedicationStatement' ? 'dosage' : 'dosageInstruction';
  const dosierungen = (r[feld] as Json[] | undefined) ?? [];
  if (dosierungen.length === 0) return false;
  const meta = ((r.extension ?? []) as { url: string; extension?: Json[] }[]).find(
    (e) => e.url === TEXT_EXTENSION.generiert,
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
    void ungueltig(
      antwort,
      `Profilvalidierung fehlgeschlagen: ${e instanceof Error ? e.message : String(e)}`,
    );
    return true;
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

export function gruendeAbweisen(koerper: unknown, antwort: SimAntwort): boolean {
  return ((koerper as { parameter?: { name: string; resource?: Ressource }[] }).parameter ?? [])
    .filter((p) => p.name === 'reasonCondition')
    .some((p) => profilAbweisen(p.resource, PROFIL.grund, antwort));
}

/** Kategorie nach „Kategorisierung und Sortierung" (IG 1.4.0-ballot.1). */
export function kategorieSetzen(
  eintrag: Ressource,
  eingang: Ressource,
  bisher: EmpKategorie | null,
) {
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
export function mittelstatus(m: Ressource | undefined, eintrag: Ressource) {
  if (m && kontext(m) === 'EMP')
    m['status'] = eintrag['status'] === 'active' ? 'active' : 'inactive';
}

/**
 * Behandlungsgründe aus `reasonCondition` als eigene Instanzen anlegen und die Verweise des
 * Eintrags auf sie umschreiben.
 */
export function gruendeAnlegen(
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

export function aktivitaetsverweise(r: Ressource): string[] {
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
  /** Beim Storno einer Abgabe bleibt die Verknüpfung aus der Verschreibung bestehen. */
  { verknuepfungBehalten = false }: { verknuepfungBehalten?: boolean } = {},
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
    verordnung: verknuepfungBehalten ? null : verknuepfungLoesen(kvnr, aussage, eintrag, zeit),
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
  if (verknuepfterEintrag(aussage) !== eintrag.id)
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
  const verweis = [{ identifier: { system: EMP_IDENTIFIER, value: empKennung(eintrag) } }];
  if (JSON.stringify(verordnung['basedOn'] ?? null) === JSON.stringify(verweis)) return null;
  verordnung['basedOn'] = verweis;
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
export function mittelLoeschenWennFrei(kvnr: string, mittelId: string): void {
  const mittel = finden(kvnr, 'Medication', mittelId);
  if (!mittel || mittelInGebrauch(kvnr, mittelId)) return;
  fassungenSichern(ablage(kvnr), [versionierterVerweis(mittel)]);
  loeschen(ablage(kvnr), mittel);
}

/**
 * Status der Arzneimittel eines eMP-Eintrags (IG 1.4.0-ballot.1, `$update-emp-entry`): aktiv nur
 * bei aktivem Eintrag — für `medicationReference` und `originMedication`, als neue Fassung.
 */
export function mittelstatusSetzen(kvnr: string, eintrag: Ressource, zeit: string): Ressource[] {
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
export function letzteAktivitaet(kvnr: string, typ: string, id: string): Ressource | undefined {
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
export function inhaltGleich(a: Ressource, b: Ressource): boolean {
  const ohne = (r: Ressource) => JSON.stringify(kanonisch({ ...r, meta: undefined }));
  return ohne(a) === ohne(b);
}

export function mitKontext(r: Ressource, wert: string): Ressource {
  return {
    ...r,
    extension: [
      ...((r.extension ?? []) as { url: string }[]).filter((e) => e.url !== EXT.kontext),
      { url: EXT.kontext, valueCode: wert },
    ],
  };
}

/** Wer schreibt: die Einrichtung aus den Kopfzeilen der Anfrage, sonst eine Abweisung. */
export function organisationAus(
  sitzungAus: (anfrage: { headers: Record<string, unknown> }) => string,
) {
  return (anfrage: SimAnfrage, antwort: SimAntwort): Handelnde | null =>
    organisationAusKopf(anfrage.headers as Record<string, unknown>, sitzungAus(anfrage), antwort);
}

export const statusUngueltig = (antwort: SimAntwort, text: string) =>
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

export const bestaetigt = (koerper: unknown) =>
  parameterLesen(koerper, 'acknowledgedChronologyId')?.valueId;

export type Anfrage = SimAnfrage;
