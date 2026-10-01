import {
  ALLERGIESTATUS_CODE,
  ALLERGIETYP_CODE,
  GEWISSHEIT_CODE,
  KRITIKALITAET_CODE,
  REAKTIONSSCHWEREGRAD_CODE,
  WIRKSTOFFKATEGORIE_CODE,
  type Allergie,
  type AllergieStatus,
  type AllergieTyp,
  type Gewissheit,
  type Kritikalitaet,
  type Reaktion,
  type Reaktionsschweregrad,
  type Wirkstoffkategorie,
} from '../typen/allergie.js';
import {
  DIAGNOSESICHERHEIT_CODE,
  KLINISCHER_STATUS_CODE,
  type Diagnose,
  type Diagnosesicherheit,
  type KlinischerStatus,
  type Seitenlokalisation,
  type Zusatzkennzeichen,
} from '../typen/diagnose.js';
import type { Herkunft } from '../typen/herkunft.js';
import type { Impfung } from '../typen/impfung.js';
import { CODESYSTEM, type Kodierung } from '../typen/kodierung.js';
import { HERKUNFT_EXTENSION, ICD_EXTENSION } from './abbildung.js';
import type { Ressource } from './typen.js';

/**
 * Rückabbildung von FHIR in die Domänentypen — Gegenstück zu `abbildung.ts`.
 *
 * Gebraucht für die Listen der ePA (✦ Diagnose-Service): Das Praxissystem zeigt deren
 * Einträge mit denselben Bausteinen wie die eigenen und kann sie übernehmen. Was eine
 * Ressource nicht trägt, bekommt den Wert, den auch die Erfassung vorbelegt.
 */

function umkehren<K extends string>(abbildung: Record<K, string>): Record<string, K> {
  return Object.fromEntries(Object.entries(abbildung).map(([k, v]) => [v, k])) as Record<string, K>;
}

const STATUS_AUS_CODE = umkehren<KlinischerStatus>(KLINISCHER_STATUS_CODE);
const SICHERHEIT_AUS_CODE = umkehren<Diagnosesicherheit>(DIAGNOSESICHERHEIT_CODE);
const ALLERGIESTATUS_AUS_CODE = umkehren<AllergieStatus>(ALLERGIESTATUS_CODE);
const GEWISSHEIT_AUS_CODE = umkehren<Gewissheit>(GEWISSHEIT_CODE);
const TYP_AUS_CODE = umkehren<AllergieTyp>(ALLERGIETYP_CODE);
const KRITIKALITAET_AUS_CODE = umkehren<Kritikalitaet>(KRITIKALITAET_CODE);
const KATEGORIE_AUS_CODE = umkehren<Wirkstoffkategorie>(WIRKSTOFFKATEGORIE_CODE);
const SCHWEREGRAD_AUS_CODE = umkehren<Reaktionsschweregrad>(REAKTIONSSCHWEREGRAD_CODE);

type Coding = {
  system?: string;
  code?: string;
  display?: string;
  extension?: { url: string; valueCoding?: { code?: string } }[];
};
type Konzept = { coding?: Coding[]; text?: string };

function statuscode(r: Ressource, feld: string): string {
  return ((r[feld] as Konzept | undefined)?.coding?.[0]?.code ?? '') as string;
}

function kodierung(c: Coding | undefined, text?: string): Kodierung | null {
  return c?.code
    ? { system: c.system ?? '', code: c.code, anzeige: c.display ?? text ?? c.code }
    : null;
}

function datum(wert: unknown): string | null {
  return typeof wert === 'string' && wert ? wert.slice(0, 10) : null;
}

export function diagnoseAusFhir(r: Ressource, patientId: string, herkunft: Herkunft): Diagnose {
  const konzept = (r['code'] as Konzept | undefined) ?? {};
  const kodierungen = konzept.coding ?? [];
  const icd = kodierungen.find((k) => k.system === CODESYSTEM.icd10gm);
  const sct = kodierungen.find((k) => k.system === CODESYSTEM.snomed);
  const ext = (url: string) => icd?.extension?.find((e) => e.url === url)?.valueCoding?.code;
  const kategorie = JSON.stringify(r['category'] ?? '');
  const festgestellt = (r.extension ?? []).find((e) => e.url.endsWith('condition-assertedDate')) as
    { valueDateTime?: string } | undefined;
  return {
    id: String(r.id),
    patientId,
    fallId: null,
    code: icd?.code ?? '',
    bezeichnung: konzept.text ?? icd?.display ?? sct?.display ?? '(ohne Bezeichnung)',
    snomed: kodierung(sct),
    alphaId: kodierungen.find((k) => k.system === CODESYSTEM.alphaId)?.code ?? null,
    zusatzkennzeichen:
      (ext(ICD_EXTENSION.diagnosesicherheit) as Zusatzkennzeichen | undefined) ?? 'G',
    seitenlokalisation:
      (ext(ICD_EXTENSION.seitenlokalisation) as Seitenlokalisation | undefined) ?? null,
    diagnosesicherheit: SICHERHEIT_AUS_CODE[statuscode(r, 'verificationStatus')] ?? 'gesichert',
    art: kategorie.includes('problem-list-item') ? 'dauer' : 'akut',
    klinischerStatus: STATUS_AUS_CODE[statuscode(r, 'clinicalStatus')] ?? 'aktiv',
    schweregrad: kodierung((r['severity'] as Konzept | undefined)?.coding?.[0]),
    koerperstelle: (r['bodySite'] as Konzept[] | undefined)?.[0]?.text ?? null,
    beginn: datum(r['onsetDateTime']) ?? datum(r['recordedDate']) ?? '',
    ende: datum(r['abatementDateTime']),
    festgestelltAm: datum(festgestellt?.valueDateTime),
    dokumentiertAm: datum(r['recordedDate']) ?? '',
    feststellendePerson: (r['asserter'] as { display?: string } | undefined)?.display ?? null,
    notiz: (r['note'] as { text?: string }[] | undefined)?.[0]?.text ?? null,
    herkunft,
    epaId: String(r.id),
    epaFassung: r.meta?.versionId ?? '1',
  };
}

export function allergieAusFhirRessource(
  r: Ressource,
  patientId: string,
  herkunft: Herkunft,
): Allergie {
  const konzept = (r['code'] as Konzept | undefined) ?? {};
  const sct = konzept.coding?.find((k) => k.system === CODESYSTEM.snomed);
  const periode = r['onsetPeriod'] as { start?: string; end?: string } | undefined;
  const reaktionen: Reaktion[] = (
    (r['reaction'] as Record<string, unknown>[] | undefined) ?? []
  ).map((re) => ({
    manifestationen: ((re['manifestation'] as Konzept[] | undefined) ?? []).map(
      (m) => kodierung(m.coding?.[0], m.text) ?? { system: '', code: '', anzeige: m.text ?? '' },
    ),
    schweregrad: SCHWEREGRAD_AUS_CODE[String(re['severity'] ?? '')] ?? null,
    datum: datum(re['onset']),
    expositionsweg: kodierung((re['exposureRoute'] as Konzept | undefined)?.coding?.[0]),
  }));
  return {
    id: String(r.id),
    patientId,
    substanz: konzept.text ?? sct?.display ?? '(ohne Bezeichnung)',
    snomed: kodierung(sct),
    typ: TYP_AUS_CODE[String(r['type'] ?? '')] ?? 'Allergie',
    kategorien: ((r['category'] as string[] | undefined) ?? [])
      .map((k) => KATEGORIE_AUS_CODE[k])
      .filter((k): k is Wirkstoffkategorie => !!k),
    gewissheit: GEWISSHEIT_AUS_CODE[statuscode(r, 'verificationStatus')] ?? 'unbestätigt',
    kritikalitaet:
      KRITIKALITAET_AUS_CODE[String(r['criticality'] ?? '')] ?? 'Risiko nicht einschätzbar',
    reaktionen,
    klinischerStatus: ALLERGIESTATUS_AUS_CODE[statuscode(r, 'clinicalStatus')] ?? 'aktiv',
    beginn: datum(r['onsetDateTime']) ?? datum(periode?.start),
    ende: datum(periode?.end),
    dokumentiertAm: datum(r['recordedDate']) ?? '',
    feststellendePerson: (r['asserter'] as { display?: string } | undefined)?.display ?? null,
    notiz: (r['note'] as { text?: string }[] | undefined)?.[0]?.text ?? null,
    herkunft,
    epaId: String(r.id),
    epaFassung: r.meta?.versionId ?? '1',
  };
}

/** Ist ein Eintrag in der ePA berichtigt (entered-in-error)? */
export function istBerichtigt(r: Ressource): boolean {
  return statuscode(r, 'verificationStatus') === 'entered-in-error';
}

/** „Keine bekannte Allergie" — SNOMED CT 716186003, wie im Konzept Medication Service 3.1.0. */
export const KEINE_BEKANNTE_ALLERGIE = '716186003';

export function istKeineBekannteAllergie(a: Pick<Allergie, 'snomed'>): boolean {
  return a.snomed?.code === KEINE_BEKANNTE_ALLERGIE;
}

/**
 * Herkunft eines ePA-Eintrags: wer angelegt und wer zuletzt geändert hat (aus der Provenance),
 * wer ihn erstellt hat (recorder) und aus welchem Dokument er stammt, falls er einem folgt.
 * Das ist die Herkunftszeile je Eintrag, etwa: „28.04.20XX – aus
 * Krankenhausentlassbrief Klinikum Sonnenschein erstellt durch Dr. med. Lea Wagner".
 */
export interface Chronik {
  angelegtVon: string;
  angelegtAm: string;
  angelegtVonTelematikId: string | null;
  zuletztVon: string;
  zuletztAm: string;
  /** Telematik-ID der Einrichtung, die zuletzt geändert hat — trennt eigene von fremden Änderungen. */
  zuletztVonTelematikId: string | null;
  aenderungen: number;
  erstelltDurch: string | null;
  quelldokument: { id: string; anzeige: string } | null;
}

export function chronikLesen(r: Ressource, provenance: readonly Ressource[]): Chronik {
  const praefix = `${r.resourceType}/${String(r.id)}/`;
  // Chronologieeinträge verweisen auf den ganzen Stand einer Liste; Änderungen zeigen nur die
  // Änderungseinträge (EPAActivityProvenance).
  const istChronologie = (p: Ressource) =>
    (p.extension ?? []).some((e) => /chronology/.test(e.url) && e.valueBoolean === true);
  const eigene = provenance
    .filter(
      (p) =>
        !istChronologie(p) &&
        (p['target'] as { reference?: string }[] | undefined)?.some((t) =>
          String(t.reference ?? '').startsWith(praefix),
        ),
    )
    .sort((a, b) => String(a['recorded']).localeCompare(String(b['recorded'])));
  const wer = (p: Ressource | undefined) =>
    (
      p?.['agent'] as { who?: { display?: string; identifier?: { value?: string } } }[] | undefined
    )?.[0]?.who;
  const erste =
    eigene.find((p) => JSON.stringify(p['activity'] ?? '').includes('CREATE')) ?? eigene[0];
  const letzte = eigene[eigene.length - 1];
  const verweis = (r.extension ?? []).find((e) => e.url === HERKUNFT_EXTENSION)?.valueReference;
  const dokumentId = verweis?.reference?.replace('DocumentReference/', '');
  return {
    angelegtVon: wer(erste)?.display ?? 'unbekannt',
    angelegtAm: String(erste?.['recorded'] ?? ''),
    angelegtVonTelematikId: wer(erste)?.identifier?.value ?? null,
    zuletztVon: wer(letzte)?.display ?? 'unbekannt',
    zuletztAm: String(letzte?.['recorded'] ?? ''),
    zuletztVonTelematikId: wer(letzte)?.identifier?.value ?? null,
    aenderungen: Math.max(0, eigene.length - 1),
    erstelltDurch: (r['recorder'] as { display?: string } | undefined)?.display ?? null,
    quelldokument: dokumentId
      ? { id: dokumentId, anzeige: verweis?.display ?? 'Quelldokument' }
      : null,
  };
}

/** Impfung aus einer Ressource nach `immunization-eu-core`. */
export function impfungAusFhir(r: Ressource, patientId: string, herkunft: Herkunft): Impfung {
  const impfstoff = (r['vaccineCode'] as Konzept | undefined) ?? {};
  const atc = impfstoff.coding?.find((k) => k.system === CODESYSTEM.atc);
  const pzn = impfstoff.coding?.find((k) => k.system === 'http://fhir.de/CodeSystem/ifa/pzn');
  const protokoll = (
    r['protocolApplied'] as
      { targetDisease?: Konzept[]; doseNumberPositiveInt?: number }[] | undefined
  )?.[0];
  return {
    id: String(r.id),
    patientId,
    impfstoff: {
      bezeichnung: impfstoff.text ?? atc?.display ?? '(ohne Bezeichnung)',
      atc: atc?.code ?? '',
      atcVersion: (atc as { version?: string } | undefined)?.version ?? '',
      pzn: pzn?.code ?? null,
    },
    zielkrankheiten: (protokoll?.targetDisease ?? [])
      .map((t) => kodierung(t.coding?.[0]))
      .filter((k): k is Kodierung => k !== null),
    datum: String(r['occurrenceDateTime'] ?? '').slice(0, 10),
    dosis: protokoll?.doseNumberPositiveInt ?? null,
    charge: (r['lotNumber'] as string | undefined) ?? null,
    geimpftVon:
      (r['performer'] as { actor?: { display?: string } }[] | undefined)?.[0]?.actor?.display ??
      herkunft.verantwortlich,
    status: r['status'] === 'entered-in-error' ? 'fehlerhaft' : 'erfolgt',
    herkunft,
    epaId: null,
    notiz: (r['note'] as { text?: string }[] | undefined)?.[0]?.text ?? null,
  };
}
