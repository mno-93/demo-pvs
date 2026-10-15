import { CODESYSTEM } from '../typen/kodierung.js';
import type { Medikationsangabe } from '../typen/medikation.js';
import { wertFehlt } from './abbildung.js';
import type { Ressource } from './typen.js';

/**
 * Medikation nach FHIR — die Abbildungen, die Medikationsplan, Arztbrief und Patient Summary
 * teilen. Vorher baute die Oberfläche das Arzneimittel des Plans an zwei Stellen selbst.
 *
 * - **Planeintrag** nach `EMPMedicationRequest` und **Arzneimittel** nach `EMPMedication`
 *   (IG `de.gematik.epa.medication` 1.3.5). Für `$add-emp-entry` gehen beide getrennt an den
 *   Dienst; den Verweis `medicationReference` setzt der Dienst selbst — die Eingabe hat deshalb
 *   kein `medication[x]`, obwohl es in der R4-Basis Pflicht ist.
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

/** Arzneimittel eines neuen Planeintrags nach `EMPMedication`. */
export function planmittelNachFhir(m: Arzneimittel): Ressource {
  return {
    resourceType: 'Medication',
    meta: { profile: [`${EMP_PROFIL}emp-medication`] },
    extension: [{ url: `${EMP_PROFIL}context-extension`, valueCode: 'EMP' }],
    status: 'active',
    code: arzneimittelKodierung(m),
  };
}

/** Planeintrag nach `EMPMedicationRequest` — Eingabe für `$add-emp-entry` (siehe oben). */
export function planeintragNachFhir(e: {
  kvnr: string;
  datum: string;
  dosierung: string;
  grund: string | null;
}): Ressource {
  return {
    resourceType: 'MedicationRequest',
    meta: { profile: [`${EMP_PROFIL}emp-medication-request`] },
    extension: [{ url: `${EMP_PROFIL}context-extension`, valueCode: 'EMP' }],
    status: 'active',
    intent: 'plan',
    subject: { identifier: { system: KVID, value: e.kvnr } },
    authoredOn: e.datum,
    dosageInstruction: [{ text: e.dosierung }],
    ...(e.grund ? { reasonCode: [{ text: e.grund }] } : {}),
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
