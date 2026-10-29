import { CODESYSTEM } from '../typen/kodierung.js';
import type { Diagnose } from '../typen/diagnose.js';
import type { Medikationsangabe } from '../typen/medikation.js';
import {
  TEXT_EXTENSION,
  dosierungAusFhir,
  dosierungNachFhir,
  gerenderterText,
  textErweiterungen,
  type Dosierung,
  type EmpKategorie,
} from '../fachlogik/dosierung.js';
import { diagnoseNachFhir, wertFehlt } from './abbildung.js';
import type { Ressource } from './typen.js';

/**
 * Medikation nach FHIR — die Abbildungen, die Medikationsplan, Arztbrief und Patient Summary
 * teilen.
 *
 * - **Planeintrag** nach `EMPMedicationRequest` und **Arzneimittel** nach `EMPMedication`
 *   (IG `de.gematik.epa.medication` 1.4.0-ballot.1, Profile in `de.gematik.epa` 1.4.0-ballot.1).
 *   Für `$add-emp-entry` gehen Eintrag, Arzneimittel und Behandlungsgrund getrennt an den Dienst,
 *   jeweils mit eigener Kennung; der Eintrag verweist auf beide (wie die Beispiele des IG). Der
 *   Dienst legt eigene Instanzen an und schreibt die Verweise um.
 * - **Dosierung** strukturiert nach `DosageDgMP` mit dem Text nach Algorithmus 2.0.0 in
 *   `renderedDosageInstruction` (`fachlogik/dosierung.ts`).
 * - **Behandlungsgrund**: die Diagnose als `EMPReasonCondition` über `reasonReference`
 *   (Parameter `reasonCondition`), der Text für Patient:innen in `reasonPatientInstruction`.
 *   `reasonCode` ist im Ballot gestrichen.
 * - **Medikationsaussage** nach `MedicationStatement` für Dokumente. EPS verlangt
 *   `effective[x]` (1..1); ist der Einnahmebeginn unbekannt, steht `data-absent-reason`.
 */

export const EMP_PROFIL = 'https://gematik.de/fhir/epa-medication/StructureDefinition/';
const PZN = 'http://fhir.de/CodeSystem/ifa/pzn';
const KVID = 'http://fhir.de/sid/gkv/kvid-10';

/** Arzneimittel, wie es Katalog, Rezept und Plan kennen. */
export interface Arzneimittel {
  bezeichnung: string;
  atc: string | null;
  atcVersion?: string | null;
  pzn?: string | null;
  /** Wirkstoff als Anzeige der ATC-Kodierung, wenn bekannt. */
  wirkstoff?: string | null;
}

function arzneimittelKodierung(m: Arzneimittel) {
  const coding = [
    ...(m.atc
      ? [
          {
            system: CODESYSTEM.atc,
            ...(m.atcVersion ? { version: m.atcVersion } : {}),
            code: m.atc,
            ...(m.wirkstoff ? { display: m.wirkstoff } : {}),
          },
        ]
      : []),
    ...(m.pzn ? [{ system: PZN, code: m.pzn }] : []),
  ];
  return { ...(coding.length > 0 ? { coding } : {}), text: m.bezeichnung };
}

/** Kennung für eine neue Instanz, wie die Beispiele des IG sie vergeben (UUID). */
export function neueKennung(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  return c?.randomUUID
    ? c.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx'.replace(/x/g, () =>
        Math.floor(Math.random() * 16).toString(16),
      );
}

/** Arzneimittel eines neuen Planeintrags nach `EMPMedication`, mit eigener Kennung. */
export function planmittelNachFhir(m: Arzneimittel, id: string = neueKennung()): Ressource {
  return {
    resourceType: 'Medication',
    id,
    meta: { profile: [`${EMP_PROFIL}emp-medication|1.4.0`] },
    extension: [{ url: `${EMP_PROFIL}context-extension`, valueCode: 'EMP' }],
    status: 'active',
    code: arzneimittelKodierung(m),
  };
}

export const EMP_EXTENSION = {
  kontext: `${EMP_PROFIL}context-extension`,
  grundFuerPatienten: `${EMP_PROFIL}reason-patient-instruction-extension`,
  kategorie: 'https://gematik.de/fhir/epa/StructureDefinition/emp-category-extension',
  reihenfolge: 'https://gematik.de/fhir/epa/StructureDefinition/emp-sort-priority-extension',
} as const;

/** Kennung, unter der der Planeintrag auf seinen Behandlungsgrund verweist. */
export const grundId = (diagnose: Pick<Diagnose, 'id'>) => `grund-${diagnose.id}`;

/** Planeintrag nach `EMPMedicationRequest` 1.4.0 — Eingabe für `$add-emp-entry` (siehe oben). */
export function planeintragNachFhir(e: {
  kvnr: string;
  datum: string;
  dosierung: Dosierung;
  /** Behandlungsgrund in Worten der Patient:innen (`reasonPatientInstruction`). */
  grund: string | null;
  /** Diagnose der Praxis als Behandlungsgrund (`reasonReference`). */
  grundDiagnose?: Pick<Diagnose, 'id' | 'code' | 'bezeichnung'> | null;
  /**
   * Kategorie, falls die Dosierung nicht automatisch kategorisierbar ist; sonst bestimmt sie der
   * Dienst und übergeht die Angabe.
   */
  kategorie?: EmpKategorie | null;
  /**
   * Verweis auf das Arzneimittel — das neue aus dem Parameter `medication` oder ein vorhandenes.
   * `medication[x]` ist im Profil 1..1; die Beispiele des IG setzen es in der Eingabe.
   */
  mittel?: { reference: string } | null;
}): Ressource {
  const dosageInstruction = dosierungNachFhir(e.dosierung);
  return {
    resourceType: 'MedicationRequest',
    id: neueKennung(),
    meta: { profile: [`${EMP_PROFIL}emp-medication-request|1.4.0`] },
    extension: [
      { url: EMP_EXTENSION.kontext, valueCode: 'EMP' },
      ...textErweiterungen('MedicationRequest', dosageInstruction),
      ...(e.grund ? [{ url: EMP_EXTENSION.grundFuerPatienten, valueString: e.grund }] : []),
      ...(e.kategorie ? [{ url: EMP_EXTENSION.kategorie, valueCode: e.kategorie }] : []),
    ],
    status: 'active',
    intent: 'plan',
    ...(e.mittel ? { medicationReference: { reference: e.mittel.reference } } : {}),
    subject: { identifier: { system: KVID, value: e.kvnr } },
    authoredOn: e.datum,
    ...(e.grundDiagnose
      ? {
          reasonReference: [
            {
              reference: `Condition/${grundId(e.grundDiagnose)}`,
              display: e.grundDiagnose.bezeichnung,
            },
          ],
        }
      : {}),
    dosageInstruction,
  };
}

/**
 * Behandlungsgrund nach `EMPReasonCondition` 1.4.0 — Parameter `reasonCondition`. Aus der
 * Diagnose der Praxis: ICD-10-GM mit Diagnosesicherheit, klinischer und Verifikationsstatus
 * wie in `ti-condition-diagnosis`; die Kategorie der Diagnosenliste gehört nicht dazu.
 */
export function planGrundNachFhir(diagnose: Diagnose, kvnr: string): Ressource {
  const d = diagnoseNachFhir(diagnose, kvnr);
  const behalten = ['clinicalStatus', 'verificationStatus', 'code', 'subject'];
  return {
    resourceType: 'Condition',
    id: grundId(diagnose),
    meta: { profile: [`${EMP_PROFIL}emp-reason-condition|1.4.0`] },
    ...Object.fromEntries(behalten.filter((k) => k in d).map((k) => [k, d[k]])),
  };
}

/**
 * Medikationsaussage für ein Dokument: was eingenommen wird, laut Quelle. `subject` und
 * `informationSource` sind Verweise innerhalb des Dokuments.
 */
export function medikationsaussageNachFhir(
  m: Medikationsangabe,
  k: {
    subject: { reference: string };
    informationSource?: { reference: string; display?: string };
    datum: string;
    /** Einnahmebeginn, wenn bekannt. */
    seit?: string | null;
  },
): Ressource {
  return {
    resourceType: 'MedicationStatement',
    status: 'active',
    medicationCodeableConcept: arzneimittelKodierung(m),
    subject: k.subject,
    ...(k.seit
      ? { effectivePeriod: { start: k.seit } }
      : { _effectiveDateTime: wertFehlt('unknown') }),
    dateAsserted: k.datum,
    ...(k.informationSource ? { informationSource: k.informationSource } : {}),
    ...(m.grund ? { reasonCode: [{ text: m.grund }] } : {}),
    dosage: [{ text: m.dosierung }],
  };
}

const ICD = 'http://fhir.de/CodeSystem/bfarm/icd-10-gm';

/** Angaben eines eMP-Eintrags, wie Plan, Abgleich und Arztbrief sie lesen. */
export interface Plangelesen {
  dosierung: string;
  dosis: Dosierung | null;
  grund: string | null;
  grundDiagnose: { code: string; bezeichnung: string } | null;
  kategorie: EmpKategorie | null;
}

function erweiterung(r: Ressource, url: string) {
  return ((r.extension ?? []) as { url: string; valueString?: string; valueCode?: string }[]).find(
    (e) => e.url === url,
  );
}

/**
 * Dosierungstext eines Eintrags: der erzeugte Text, sonst die Freitexte. Gilt für
 * MedicationRequest (`dosageInstruction`) und MedicationStatement (`dosage`).
 */
export function dosierungsanzeige(r: Ressource): string {
  const gerendert = gerenderterText(r);
  if (gerendert) return gerendert;
  const d = (r['dosageInstruction'] ?? r['dosage']) as { text?: string }[] | undefined;
  const texte = (d ?? []).map((x) => x.text).filter(Boolean);
  return texte.length > 0 ? texte.join(' ') : '—';
}

/** Behandlungsgrund für Patient:innen, sonst die Diagnose; `reasonCode` nur aus Altbestand. */
export function grundanzeige(r: Ressource): string | null {
  return (
    erweiterung(r, EMP_EXTENSION.grundFuerPatienten)?.valueString ??
    (r['reasonReference'] as { display?: string }[] | undefined)?.[0]?.display ??
    (r['reasonCode'] as { text?: string }[] | undefined)?.[0]?.text ??
    null
  );
}

/** Liest einen eMP-Eintrag; `ressourcen` enthält die mitgelieferten Behandlungsgründe. */
export function planeintragLesen(e: Ressource, ressourcen: readonly Ressource[] = []): Plangelesen {
  const verweis = (
    e['reasonReference'] as { reference?: string; display?: string }[] | undefined
  )?.[0];
  const bedingung = ressourcen.find(
    (r) => r.resourceType === 'Condition' && `Condition/${String(r.id)}` === verweis?.reference,
  );
  const icd = (
    bedingung?.['code'] as
      { coding?: { system?: string; code?: string; display?: string }[] } | undefined
  )?.coding?.find((k) => k.system === ICD);
  return {
    dosierung: dosierungsanzeige(e),
    dosis: dosierungAusFhir(e['dosageInstruction']),
    grund:
      erweiterung(e, EMP_EXTENSION.grundFuerPatienten)?.valueString ??
      (e['reasonCode'] as { text?: string }[] | undefined)?.[0]?.text ??
      null,
    grundDiagnose: icd?.code
      ? { code: icd.code, bezeichnung: icd.display ?? verweis?.display ?? icd.code }
      : null,
    kategorie:
      (erweiterung(e, EMP_EXTENSION.kategorie)?.valueCode as EmpKategorie | undefined) ?? null,
  };
}

/**
 * Schreibt Dosierung und Grund eines bestehenden eMP-Eintrags fort — Eingabe für
 * `$update-emp-entry`. Entfernt, was der Ballot nicht mehr kennt (`reasonCode`).
 */
export function planeintragFortschreiben(
  e: Ressource,
  angabe: {
    dosierung: Dosierung;
    grund: string | null;
    grundDiagnose?: Pick<Diagnose, 'id' | 'code' | 'bezeichnung'> | null;
  },
): Ressource {
  const dosageInstruction = dosierungNachFhir(angabe.dosierung);
  const ersetzt = new Set<string>([
    EMP_EXTENSION.grundFuerPatienten,
    TEXT_EXTENSION.gerendert('MedicationRequest'),
    TEXT_EXTENSION.generiert,
  ]);
  const neu: Ressource = {
    ...e,
    extension: [
      ...((e.extension ?? []) as { url: string }[]).filter((x) => !ersetzt.has(x.url)),
      ...textErweiterungen('MedicationRequest', dosageInstruction),
      ...(angabe.grund
        ? [{ url: EMP_EXTENSION.grundFuerPatienten, valueString: angabe.grund }]
        : []),
    ],
    dosageInstruction,
  };
  delete neu['reasonCode'];
  delete neu['reasonReference'];
  if (angabe.grundDiagnose)
    neu['reasonReference'] = [
      {
        reference: `Condition/${grundId(angabe.grundDiagnose)}`,
        display: angabe.grundDiagnose.bezeichnung,
      },
    ];
  return neu;
}
