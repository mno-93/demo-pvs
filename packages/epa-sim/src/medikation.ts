import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import {
  DOSIERUNGSTEXT_SPRACHE,
  DOSIERUNGSTEXT_VERSION,
  TEXT_EXTENSION,
  VIERERSCHEMA_IM_TEXT,
  automatischeKategorie,
  dosierungstext,
  gerenderterText,
  vollUrl,
  type EmpKategorie,
  type Ressource,
} from '@demo-pvs/kern';
import { bestandFuer } from './bestand.ts';
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
  parameterLesen,
  suchergebnis,
  type Detailcode,
} from './fhir-hilfen.ts';
import {
  aktivitaetAnlegen,
  archivSichern,
  archivWiederherstellen,
  fassung,
  fassungZum,
  fassungen,
  fortschreiben,
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
} satisfies Record<string, Detailcode>;

/** Antwort mit Detailcode; `code` ist der Issue-Typ nach FHIR. */
function melden(
  antwort: FastifyReply,
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
  antwort: FastifyReply,
): boolean {
  for (const [name, werte] of Object.entries(anfrage.query as Record<string, unknown>)) {
    const muster = erlaubt[name];
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
const DATUMSWERT =
  /^(eq|ne|gt|lt|ge|le|sa|eb|ap)?\d{4}(-\d{2}(-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})?)?)?)?$/;

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

function fehlt(antwort: FastifyReply, code: string, display: string, text: string, status = 404) {
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

function ungueltig(antwort: FastifyReply, text: string) {
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
 * Prüfung der Dosierung nach `gemIG_TI_Common#Validierung` (IG 1.4.0-ballot.1, Geschäftslogik
 * von `$add-emp-entry`, `$update-emp-entry` und `$add-eml-entry`): Der Dienst erzeugt den Text
 * selbst neu und vergleicht ihn mit `renderedDosageInstruction`; bei Freitext muss derselbe Text
 * dort stehen. Nur de-DE mit Algorithmusversion 2.0.0 (general-principles).
 */
function dosierungAbweisen(r: Ressource, antwort: FastifyReply): boolean {
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

/**
 * Löst einen eML-Eintrag von seinem eMP-Eintrag (IG 1.4.0-ballot.1, Geschäftslogik von
 * `$unlink-emp`; `$cancel-eml-entry` verfährt ebenso). Die Instanzhistorie des eMP-Eintrags wird
 * zurückverfolgt, solange Arzneimittel und Dosierung denen des eML-Eintrags gleichen und dieser
 * noch im Aktivitätsnachweis steht. Erst wenn die erste abweichende Fassung („stop version")
 * beides nicht mehr erfüllt, werden Dosierung, Arzneimittel und Dosierungstext auf sie
 * zurückgesetzt und die Kategorie neu bestimmt. Eine zwischenzeitliche manuelle Änderung und ein
 * schon verknüpft angelegter Eintrag setzen nichts zurück. Liefert, ob der eMP-Eintrag geändert
 * wurde.
 */
function empZuruecksetzen(kvnr: string, eintrag: Ressource, aussage: Ressource): boolean {
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
  const basis = ((aussage['basedOn'] as { reference?: string }[] | undefined) ?? []).filter(
    (v) => v.reference !== `MedicationRequest/${String(eintrag.id)}`,
  );
  if (basis.length > 0) aussage['basedOn'] = basis;
  else delete aussage['basedOn'];
  // Die Verordnung verliert ihren logischen Verweis auf den eMP-Eintrag.
  for (const q of (aussage['derivedFrom'] as { reference?: string }[] | undefined) ?? []) {
    const [typ, id] = String(q.reference ?? '').split('/');
    const verordnung = typ === 'MedicationRequest' ? finden(kvnr, typ, String(id)) : undefined;
    const bisher =
      (verordnung?.['basedOn'] as { identifier?: { value?: string } }[] | undefined) ?? [];
    const rest = bisher.filter((v) => v.identifier?.value !== String(eintrag.id));
    if (verordnung && rest.length !== bisher.length) {
      if (rest.length > 0) verordnung['basedOn'] = rest;
      else delete verordnung['basedOn'];
      fortschreiben(verordnung);
    }
  }
  return geaendert;
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

type Anfrage = FastifyRequest;

export function medikationEinhaengen(
  app: FastifyInstance,
  kvnrAus: (anfrage: { headers: Record<string, unknown> }) => string,
  sitzungAus: (anfrage: { headers: Record<string, unknown> }) => string,
) {
  const b = MEDIKATION_BASIS;

  const organisation = (anfrage: Anfrage, antwort: FastifyReply): Handelnde | null =>
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
      for (const p of alle.filter(
        (r) =>
          r.resourceType === 'Provenance' &&
          !istChronologie(r, EMP) &&
          (r['target'] as { reference: string }[]).some((t) =>
            t.reference.startsWith(`MedicationStatement/${String(a.id)}/`),
          ),
      )) {
        nimm(p);
        nimm(finden(kvnr, 'Organization', referenzId((p['agent'] as { who: unknown }[])[0]?.who)));
      }
    }
    return dazu;
  }

  /** eML — `$medication-list`: nicht stornierte Medikationsinformationen, optional nach Datum. */
  app.get(`${b}/$medication-list`, async (anfrage, antwort) => {
    if (
      operationsparameterAbweisen(
        anfrage,
        { date: DATUMSWERT, _count: ZAHL, _offset: ZAHL },
        antwort,
      )
    )
      return antwort;
    const kvnr = kvnrAus(anfrage);
    const q = anfrage.query as Record<string, string | string[] | undefined>;
    // `date` (0..2, Ober- und Untergrenze) — auch für „neu seit dem letzten Aufruf".
    // ⚠ „neu seit" trifft damit nur neue Einnahmezeiträume, keine späteren Nachträge zu alten.
    const aussagen = ablage(kvnr).filter(
      (r) =>
        r.resourceType === 'MedicationStatement' &&
        r['status'] !== 'entered-in-error' &&
        // 1.4.0: effectiveDateTime, sonst Beginn von effectivePeriod, sonst meta.lastUpdated.
        imZeitraum(
          String(
            r['effectiveDateTime'] ??
              (r['effectivePeriod'] as { start?: string } | undefined)?.start ??
              r.meta?.lastUpdated ??
              '',
          ),
          q['date'],
        ),
    );
    const q2 = anfrage.query as Record<string, string | undefined>;
    const ab = Number(q2['_offset'] ?? 0);
    const seite = aussagen.slice(ab, ab + Number(q2['_count'] ?? aussagen.length));
    return {
      ...suchergebnis(seite, [patientFuer(kvnr), ...einschluesse(kvnr, seite)]),
      total: aussagen.length,
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
    if (gewuenscht && !chronologie) {
      return fehlt(
        antwort,
        'MEDSVC_EMP_NO_EXIST',
        'eMP does not exist',
        `Kein eMP-Stand ${gewuenscht}.`,
      );
    }
    // 1.4.0 (IG-MED04510JHX): alle Instanzen in der Fassung zum Bezugszeitpunkt — `recorded`
    // des Chronologieeintrags, sonst der Zeitpunkt der Anfrage.
    const bezug = gewuenscht ? String(chronologie?.['recorded'] ?? jetzt()) : jetzt();
    const zumBezug = (typ: string, id: string) =>
      fassungZum(ablage(kvnr), typ, id, bezug) ?? finden(kvnr, typ, id);
    const eintraege = ((chronologie?.['target'] as { reference: string }[] | undefined) ?? [])
      .map((t) => {
        const [typ, id, , v] = t.reference.split('/');
        return (
          (v ? fassung(ablage(kvnr), String(typ), String(id), v) : undefined) ??
          finden(kvnr, String(typ), String(id))
        );
      })
      .filter((r): r is Ressource => !!r);
    const dazu: Ressource[] = [];
    const nimm = (r: Ressource | undefined) => {
      if (r && !dazu.some((x) => x.resourceType === r.resourceType && x.id === r.id)) dazu.push(r);
    };
    for (const e of eintraege) {
      nimm(zumBezug('Medication', referenzId(e['medicationReference'])));
      for (const v of (e['reasonReference'] as { reference?: string }[] | undefined) ?? [])
        nimm(zumBezug('Condition', referenzId(v)));
      for (const a of (
        (e.extension ?? []) as {
          url: string;
          extension?: { url: string; valueReference?: unknown }[];
        }[]
      ).filter((x) => x.url === EXT.aktivitaet)) {
        nimm(
          zumBezug(
            'MedicationStatement',
            referenzId(a.extension?.find((y) => y.url === 'reference')?.valueReference),
          ),
        );
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
      entry: [patientFuer(kvnr), ...(chronologie ? [chronologie] : []), ...eintraege, ...dazu].map(
        (r) => ({
          fullUrl: vollUrl(r),
          resource: r,
        }),
      ),
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
  const einstellung = (wert: boolean, anfrage: Anfrage, antwort: FastifyReply) =>
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
  for (const typ of [
    'Medication',
    'MedicationRequest',
    'MedicationDispense',
    'MedicationStatement',
    'Condition',
    'Organization',
    'Provenance',
  ]) {
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
      const ab = Number(([] as string[]).concat(p['_offset'] ?? [])[0] ?? 0);
      const anzahl = Number(([] as string[]).concat(p['_count'] ?? [])[0] ?? ergebnis.length);
      return { ...suchergebnis(ergebnis.slice(ab, ab + anzahl)), total: ergebnis.length };
    });
    const unbekannt = (antwort: FastifyReply) =>
      antwort.code(404).send(operationOutcome('error', 'not-found', `${typ} nicht gefunden.`));
    app.get(`${q}/${typ}/:id`, async (anfrage, antwort) => {
      const r = finden(kvnrAus(anfrage), typ, (anfrage.params as { id: string }).id);
      return r ?? unbekannt(antwort);
    });
    /** Versionshistorie einer Instanz, neueste zuerst — aus dem Fassungsarchiv. */
    app.get(`${q}/${typ}/:id/_history`, async (anfrage, antwort) => {
      const kvnr = kvnrAus(anfrage);
      const id = (anfrage.params as { id: string }).id;
      const r = finden(kvnr, typ, id);
      if (!r) return unbekannt(antwort);
      const alle = fassungen(ablage(kvnr), typ, id);
      const liste = (
        alle.some((f) => f.meta?.versionId === r.meta?.versionId) ? alle : [...alle, r]
      )
        .slice()
        .reverse();
      return {
        resourceType: 'Bundle',
        meta: { lastUpdated: jetzt() },
        type: 'history',
        total: liste.length,
        entry: liste.map((f) => ({
          fullUrl: vollUrl(f),
          resource: f,
          request: { method: f.meta?.versionId === '1' ? 'POST' : 'PUT', url: `${typ}/${id}` },
          response: { status: f.meta?.versionId === '1' ? '201 Created' : '200 OK' },
        })),
      };
    });
    app.get(`${q}/${typ}/:id/_history/:vid`, async (anfrage, antwort) => {
      const kvnr = kvnrAus(anfrage);
      const { id, vid } = anfrage.params as { id: string; vid: string };
      const aktuell = finden(kvnr, typ, id);
      const f =
        fassung(ablage(kvnr), typ, id, vid) ??
        (aktuell?.meta?.versionId === vid ? aktuell : undefined);
      return f ?? unbekannt(antwort);
    });
  }

  /* ---------- Schreiben: eMP ---------- */

  interface Ergebnis {
    eintrag: Ressource;
    medication?: Ressource;
    gruende: Ressource[];
    aktivitaet: Ressource;
  }

  const statusUngueltig = (antwort: FastifyReply, text: string) =>
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

  /** Kern von `$add-emp-entry`, ohne Chronologie — auch für den Stapel. */
  function empEintragAnlegen(
    kvnr: string,
    koerper: unknown,
    wer: Handelnde,
    antwort: FastifyReply,
  ): Ergebnis | null {
    const eingang = parameterLesen(koerper, 'empEntry')?.resource;
    const fehler = empEintragPruefen(eingang);
    if (fehler) {
      void ungueltig(antwort, fehler);
      return null;
    }
    if (eingang!['status'] === 'entered-in-error') {
      void statusUngueltig(antwort, 'Ein neuer eMP-Eintrag kann nicht fehlerhaft sein.');
      return null;
    }
    if (dosierungAbweisen(eingang!, antwort)) return null;
    const mittelteil = parameterLesen(koerper, 'medication')?.part ?? [];
    const neuesMittel = mittelteil.find((p) => p.name === 'resource')?.resource;
    const verweis = mittelteil.find((p) => p.name === 'reference')?.valueReference?.reference;
    let medication: Ressource | undefined;
    const zeit = jetzt();
    if (neuesMittel) {
      const f = medicationPruefen(neuesMittel);
      if (f) {
        void ungueltig(antwort, f);
        return null;
      }
      if (neuesMittel['status'] === 'entered-in-error') {
        void statusUngueltig(antwort, 'Das Arzneimittel ist als fehlerhaft gekennzeichnet.');
        return null;
      }
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
    } else if (verweis) {
      if (/\/_history\//.test(verweis)) {
        void ungueltig(
          antwort,
          'Der Verweis auf das Arzneimittel darf keine Versionsangabe tragen.',
        );
        return null;
      }
      const mittelId = verweis.split('/')[1] ?? '';
      medication = finden(kvnr, 'Medication', mittelId);
      if (!medication) {
        void (istGeloescht(ablage(kvnr), 'Medication', mittelId)
          ? melden(antwort, 410, 'processing', `Gelöscht: ${verweis}`, MSG.geloescht)
          : melden(antwort, 404, 'not-found', `Nicht gefunden: ${verweis}`, MSG.unbekannt));
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
      // Gehört das Arzneimittel zu einem eML-Eintrag, der schon verknüpft ist — ablehnen.
      const verknuepft = ablage(kvnr).find(
        (r) =>
          r.resourceType === 'MedicationStatement' &&
          referenzId(r['medicationReference']) === medication!.id &&
          ((r['basedOn'] as { extension?: { url: string }[] }[] | undefined) ?? []).some((v) =>
            v.extension?.some((e) => e.url === EXT.istEmp),
          ),
      );
      if (verknuepft) {
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
    } else {
      void ungueltig(antwort, 'Der Parameter „medication" fehlt (resource oder reference).');
      return null;
    }
    const id = neueId('emp');
    const eintrag: Ressource = mitKontext(
      {
        ...eingang!,
        id,
        meta: { versionId: '1', lastUpdated: zeit, profile: [PROFIL.empEintrag] },
        // Der Dienst setzt den MedicationPlanIdentifier gleich der Ressourcenkennung.
        identifier: [{ system: EMP_IDENTIFIER, value: id }],
        status: eingang!['status'] ?? 'active',
        medicationReference: { reference: `Medication/${String(medication.id)}` },
        subject: subjektFuer(kvnr),
        extension: [
          ...((eingang!.extension ?? []) as { url: string }[]).filter(
            (e) => e.url !== EXT.herkunftsmittel,
          ),
          {
            url: EXT.herkunftsmittel,
            valueReference: { reference: `Medication/${String(medication.id)}` },
          },
        ],
      },
      'EMP',
    );
    const gruende = gruendeAnlegen(kvnr, koerper, eintrag, zeit);
    kategorieSetzen(eintrag, eingang!, null);
    mittelstatus(medication, eintrag);
    ablage(kvnr).push(eintrag);
    const aktivitaet = aktivitaetAnlegen(
      ablage(kvnr),
      [
        versionierterVerweis(eintrag),
        ...(neuesMittel ? [versionierterVerweis(medication)] : []),
        ...gruende.map(versionierterVerweis),
      ],
      wer,
      'CREATE',
      zeit,
    );
    return { eintrag, medication, gruende, aktivitaet };
  }

  /** Kern von `$update-emp-entry`. */
  function empEintragAendern(
    kvnr: string,
    koerper: unknown,
    wer: Handelnde,
    antwort: FastifyReply,
  ): Ergebnis | null {
    const kennung = parameterLesen(koerper, 'medicationPlanIdentifier')?.valueIdentifier?.value;
    const eingang = parameterLesen(koerper, 'empEntry')?.resource;
    const vorhanden = ablage(kvnr).find(
      (r) =>
        istEmpEintrag(r) &&
        (r['identifier'] as { value?: string }[] | undefined)?.some((i) => i.value === kennung),
    );
    const fehler = empEintragPruefen(eingang);
    if (fehler) {
      void ungueltig(antwort, fehler);
      return null;
    }
    // Geschäftslogik IG 1.4.0-ballot.1: unbekannt 404, Fassung nicht aktuell 409, Kontext nicht
    // EMP 405, fehlerhafter Eintrag und fehlerhaftes Arzneimittel 400.
    if (!vorhanden) {
      void melden(antwort, 404, 'not-found', `Kein eMP-Eintrag ${kennung ?? ''}.`, MSG.unbekannt);
      return null;
    }
    const fassungEingang = eingang!.meta?.versionId;
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
    if (dosierungAbweisen(eingang!, antwort)) return null;
    if (vorhanden['status'] === 'entered-in-error') {
      void statusUngueltig(antwort, 'Ein fehlerhafter Eintrag wird nicht mehr geändert.');
      return null;
    }
    if (parameterLesen(koerper, 'medication')?.resource?.['status'] === 'entered-in-error') {
      void statusUngueltig(antwort, 'Das Arzneimittel ist als fehlerhaft gekennzeichnet.');
      return null;
    }
    // Arzneimittel, Kennung, Herkunft und Verknüpfungen führt der Dienst; der Rest kommt vom Primärsystem.
    const kategorieBisher = kategorieVon(vorhanden);
    for (const feld of [
      'status',
      'statusReason',
      'dosageInstruction',
      'reasonReference',
      'requester',
      'note',
      'authoredOn',
    ]) {
      if (feld in eingang!) vorhanden[feld] = eingang![feld];
      else if (feld !== 'authoredOn') delete vorhanden[feld];
    }
    delete vorhanden['reasonCode'];
    const behalten = new Set<string>([
      EXT.kontext,
      EXT.herkunftsmittel,
      EXT.aktivitaet,
      EXT.kategorie,
    ]);
    vorhanden.extension = [
      ...((vorhanden.extension ?? []) as { url: string }[]).filter((e) => behalten.has(e.url)),
      ...((eingang!.extension ?? []) as { url: string }[]).filter((e) => !behalten.has(e.url)),
    ];
    const zeit = jetzt();
    // 1.4.0: Das Arzneimittel lässt sich über den Parameter `medication` austauschen.
    const neuesMittel = parameterLesen(koerper, 'medication')?.resource;
    let ausgetauscht: Ressource | undefined;
    if (neuesMittel) {
      const f = medicationPruefen(neuesMittel);
      if (f) {
        void ungueltig(antwort, f);
        return null;
      }
      ausgetauscht = mitKontext(
        {
          ...neuesMittel,
          id: neueId('med'),
          meta: { versionId: '1', lastUpdated: zeit, profile: [PROFIL.empMedication] },
        },
        'EMP',
      );
      ablage(kvnr).push(ausgetauscht);
      vorhanden['medicationReference'] = { reference: `Medication/${String(ausgetauscht.id)}` };
    }
    const gruende = gruendeAnlegen(kvnr, koerper, vorhanden, zeit);
    kategorieSetzen(vorhanden, eingang!, kategorieBisher);
    fortschreiben(vorhanden, zeit);
    const medication = finden(kvnr, 'Medication', referenzId(vorhanden['medicationReference']));
    mittelstatus(medication, vorhanden);
    const aktivitaet = aktivitaetAnlegen(
      ablage(kvnr),
      [
        versionierterVerweis(vorhanden),
        ...(ausgetauscht ? [versionierterVerweis(ausgetauscht)] : []),
        ...gruende.map(versionierterVerweis),
      ],
      wer,
      'UPDATE',
      zeit,
    );
    return { eintrag: vorhanden, medication, gruende, aktivitaet };
  }

  const bestaetigt = (koerper: unknown) =>
    parameterLesen(koerper, 'acknowledgedChronologyId')?.valueId;

  app.post(`${b}/$add-emp-entry`, async (anfrage, antwort) => {
    const kvnr = kvnrAus(anfrage);
    const wer = organisation(anfrage, antwort);
    if (!wer || !lesenachweisPruefen(ablage(kvnr), EMP, bestaetigt(anfrage.body), antwort))
      return antwort;
    const e = empEintragAnlegen(kvnr, anfrage.body, wer, antwort);
    if (!e) return antwort;
    const chronologie = chronologieAnlegen(ablage(kvnr), EMP, wer);
    return ausgabe([
      ['empEntry', e.eintrag],
      ['medication', e.medication],
      ...e.gruende.map((g) => ['reasonCondition', g] as [string, Ressource]),
      ['relatedActivity', e.aktivitaet],
      ['relatedChronology', chronologie],
    ]);
  });

  app.post(`${b}/$update-emp-entry`, async (anfrage, antwort) => {
    const kvnr = kvnrAus(anfrage);
    const wer = organisation(anfrage, antwort);
    if (!wer || !lesenachweisPruefen(ablage(kvnr), EMP, bestaetigt(anfrage.body), antwort))
      return antwort;
    const e = empEintragAendern(kvnr, anfrage.body, wer, antwort);
    if (!e) return antwort;
    const chronologie = chronologieAnlegen(ablage(kvnr), EMP, wer);
    return ausgabe([
      ['empEntry', e.eintrag],
      ['medication', e.medication],
      ...e.gruende.map((g) => ['reasonCondition', g] as [string, Ressource]),
      ['relatedActivity', e.aktivitaet],
      ['relatedChronology', chronologie],
    ]);
  });

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
   * `$batch-emp` — mehrere Änderungen in einem Aufruf, abgeschlossen mit `$emp-commit`, der
   * genau eine neue Fassung erzeugt. Die Demo verarbeitet atomar: Scheitert ein Eintrag,
   * bleibt der Plan unverändert.
   */
  app.post(`${b}/$batch-emp`, async (anfrage, antwort) => {
    const kvnr = kvnrAus(anfrage);
    const wer = organisation(anfrage, antwort);
    if (!wer) return antwort;
    const bundle = (parameterLesen(anfrage.body, 'resource')?.resource ?? anfrage.body) as {
      type?: string;
      entry?: { request?: { url?: string }; resource?: unknown }[];
    };
    const eintraege = bundle.entry ?? [];
    const letzter = eintraege[eintraege.length - 1];
    if (
      bundle.type !== 'transaction' ||
      !String(letzter?.request?.url ?? '').includes('$emp-commit')
    ) {
      return ungueltig(
        antwort,
        'Erwartet wird ein Bundle vom Typ transaction, das mit $emp-commit endet.',
      );
    }
    if (!lesenachweisPruefen(ablage(kvnr), EMP, bestaetigt(letzter?.resource), antwort))
      return antwort;
    const sicherung = JSON.parse(JSON.stringify(ablage(kvnr))) as Ressource[];
    const archiv = archivSichern(ablage(kvnr));
    const antworten: unknown[] = [];
    for (const e of eintraege.slice(0, -1)) {
      const url = String(e.request?.url ?? '');
      const erg = url.includes('$add-emp-entry')
        ? empEintragAnlegen(kvnr, e.resource, wer, antwort)
        : url.includes('$update-emp-entry')
          ? empEintragAendern(kvnr, e.resource, wer, antwort)
          : null;
      if (!erg) {
        ablage(kvnr).splice(0, ablage(kvnr).length, ...sicherung);
        archivWiederherstellen(ablage(kvnr), archiv);
        return antwort.sent ? antwort : ungueltig(antwort, `Im Stapel nicht zulässig: ${url}`);
      }
      antworten.push({
        response: { status: '200 OK' },
        resource: ausgabe([
          ['empEntry', erg.eintrag],
          ['medication', erg.medication],
          ...erg.gruende.map((g) => ['reasonCondition', g] as [string, Ressource]),
          ['relatedActivity', erg.aktivitaet],
        ]),
      });
    }
    const chronologie = chronologieAnlegen(ablage(kvnr), EMP, wer);
    antworten.push({ response: { status: '200 OK' }, resource: chronologie });
    return { resourceType: 'Bundle', type: 'transaction-response', entry: antworten };
  });

  /* ---------- Schreiben: eML ---------- */

  /** `$add-eml-entry` — Nachtrag einer Medikation in die eML (Kontext MANUAL). */
  app.post(`${b}/MedicationStatement/$add-eml-entry`, async (anfrage, antwort) => {
    const kvnr = kvnrAus(anfrage);
    const wer = organisation(anfrage, antwort);
    if (!wer) return antwort;
    const aussage = parameterLesen(anfrage.body, 'medicationStatement')?.resource;
    const mittel = parameterLesen(anfrage.body, 'medication')?.resource;
    const f = medicationPruefen(mittel);
    if (f) return ungueltig(antwort, f);
    if (!aussage || aussage.resourceType !== 'MedicationStatement') {
      return ungueltig(antwort, 'Es fehlt eine MedicationStatement-Ressource.');
    }
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
    const aktivitaet = aktivitaetAnlegen(
      ablage(kvnr),
      [versionierterVerweis(neu), versionierterVerweis(medication)],
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
    // 1.4.0: Ein verknüpfter eMP-Eintrag wird wie bei `$unlink-emp` gelöst und gegebenenfalls
    // zurückgesetzt; dann entsteht ein neuer Stand des eMP (`systemNotice` `empChanged`).
    const planId = referenzId(
      (
        (aussage['basedOn'] as
          { reference?: string; extension?: { url: string }[] }[] | undefined) ?? []
      ).find((v) => v.extension?.some((e) => e.url === EXT.istEmp)),
    );
    const eintrag = planId ? finden(kvnr, 'MedicationRequest', planId) : undefined;
    const empGeaendert = eintrag ? empZuruecksetzen(kvnr, eintrag, aussage) : false;
    // Der Nachtrag wird gelöscht (bleibt über die Historie abrufbar), sein Arzneimittel ebenso,
    // sofern kein eMP-Eintrag mehr darauf verweist.
    if (empGeaendert || eintrag) fortschreiben(aussage, zeit);
    if (eintrag && empGeaendert) fortschreiben(eintrag, zeit);
    const aktivitaet = aktivitaetAnlegen(
      ablage(kvnr),
      [
        versionierterVerweis(aussage),
        ...(eintrag && empGeaendert ? [versionierterVerweis(eintrag)] : []),
      ],
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

  /** `$link-emp` / `$unlink-emp` — eML-Eintrag mit einem eMP-Eintrag verknüpfen oder lösen. */
  for (const art of ['link', 'unlink'] as const) {
    app.post(`${b}/MedicationStatement/:id/$${art}-emp`, async (anfrage, antwort) => {
      const kvnr = kvnrAus(anfrage);
      const wer = organisation(anfrage, antwort);
      if (!wer || !lesenachweisPruefen(ablage(kvnr), EMP, bestaetigt(anfrage.body), antwort))
        return antwort;
      const msId = (anfrage.params as { id: string }).id;
      const aussage = finden(kvnr, 'MedicationStatement', msId);
      const kennung = parameterLesen(anfrage.body, 'medicationPlanIdentifier')?.valueIdentifier
        ?.value;
      // Geschäftslogik IG 1.4.0-ballot.1: eML-Eintrag gelöscht 410, unbekannt 404; eMP-Eintrag
      // über die Kennung mit Kontext EMP, sonst 400 (UN)LINKING_NOT_SUCCESSFUL.
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
          `Kein eMP-Eintrag ${kennung ?? ''}.`,
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
      const basis =
        (aussage['basedOn'] as
          | { reference?: string; extension?: { url: string; valueBoolean?: boolean }[] }[]
          | undefined) ?? [];
      const zeit = jetzt();
      if (art === 'unlink') {
        const verknuepft = basis.some(
          (v) =>
            v.reference === `MedicationRequest/${String(eintrag.id)}` &&
            v.extension?.some((e) => e.url === EXT.istEmp && e.valueBoolean === true),
        );
        if (!verknuepft)
          return melden(
            antwort,
            405,
            'forbidden',
            'Der eML-Eintrag ist nicht mit diesem eMP-Eintrag verknüpft.',
            MSG.nichtErlaubt,
          );
      }
      if (art === 'link') {
        if (basis.some((v) => v.extension?.some((e) => e.url === EXT.istEmp))) {
          return melden(
            antwort,
            400,
            'business-rule',
            'Der eML-Eintrag ist bereits verknüpft.',
            detail('MEDSVC_ALREADY_LINKED', 'Already linked to another instance'),
          );
        }
        aussage['basedOn'] = [...basis, empVerweis(String(eintrag.id))];
        // 1.4.0: Dosierung samt Text übernehmen, wenn der eMP-Eintrag nicht neuer ist als der
        // eML-Eintrag; danach die Kategorie neu bestimmen.
        const neuer = ((eintrag.extension ?? []) as { url: string; extension?: Json[] }[])
          .filter((x) => x.url === EXT.aktivitaet)
          .some(
            (x) =>
              String(x.extension?.find((y) => y['url'] === 'addedOn')?.['valueDateTime'] ?? '') >
              String(aussage.meta?.lastUpdated ?? ''),
          );
        const dosierung = aussage['dosage'] as Json[] | undefined;
        if (!neuer && dosierung && dosierung.length > 0) {
          eintrag['dosageInstruction'] = dosierung;
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
        eintrag['medicationReference'] = aussage['medicationReference'];
      } else {
        if (eintrag['status'] === 'entered-in-error')
          return statusUngueltig(antwort, 'Ein fehlerhafter eMP-Eintrag wird nicht gelöst.');
        empZuruecksetzen(kvnr, eintrag, aussage);
      }
      fortschreiben(aussage, zeit);
      fortschreiben(eintrag, zeit);
      const aktivitaet = aktivitaetAnlegen(
        ablage(kvnr),
        [versionierterVerweis(aussage), versionierterVerweis(eintrag)],
        wer,
        'UPDATE',
        zeit,
      );
      const chronologie = chronologieAnlegen(ablage(kvnr), EMP, wer, zeit);
      return ausgabe([
        ['medicationStatement', aussage],
        ['empEntry', eintrag],
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
