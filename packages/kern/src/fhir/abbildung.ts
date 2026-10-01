import {
  ALLERGIESTATUS_CODE,
  ALLERGIETYP_CODE,
  GEWISSHEIT_CODE,
  KRITIKALITAET_CODE,
  REAKTIONSSCHWEREGRAD_CODE,
  WIRKSTOFFKATEGORIE_CODE,
  type Allergie,
} from '../typen/allergie.js';
import {
  DIAGNOSEART_BEZEICHNUNG,
  DIAGNOSEART_CODE,
  DIAGNOSESICHERHEIT_BEZEICHNUNG,
  DIAGNOSESICHERHEIT_CODE,
  KLINISCHER_STATUS_BEZEICHNUNG,
  KLINISCHER_STATUS_CODE,
  SEITENLOKALISATION_BEZEICHNUNG,
  ZUSATZKENNZEICHEN_BEZEICHNUNG,
  type Diagnose,
} from '../typen/diagnose.js';
import type { Herkunft } from '../typen/herkunft.js';
import { CODESYSTEM, ICD10GM_VERSION, SNOMED_VERSION, type Kodierung } from '../typen/kodierung.js';
import type { Impfung } from '../typen/impfung.js';
import type { Patient } from '../typen/person.js';
import type { Coding, Extension, Ressource } from './typen.js';

/**
 * Abbildung der Domänentypen nach FHIR.
 *
 * Profile folgen der Ableitungsarchitektur des Projekts (Basis-FHIR → EU Core → TI Common →
 * Content-IG). Für die Patient Summary liegen noch keine eigenen
 * Profile vor; verwendet wird deshalb die nächsthöhere Ebene, die es gibt:
 *
 * - Condition: TI Common `ti-condition-diagnosis` 1.5.0 (Paket `de.gematik.ti`
 *   1.5.0-ballot.1) — abgeleitet von `condition-eu-core`;
 * - AllergyIntolerance: `allergyIntolerance-eu-core` — TI Common bietet kein Allergieprofil;
 * - Patient: `ti-patient`, wie im Informationsmodell referenziert.
 *
 * ⚠ Die Ressourcen sind nach diesen Profilen gebaut, aber nicht gegen sie validiert.
 */
export const PROFIL = {
  patient: 'https://gematik.de/fhir/ti/StructureDefinition/ti-patient',
  diagnose: 'https://gematik.de/fhir/ti/StructureDefinition/ti-condition-diagnosis',
  allergie: 'http://hl7.eu/fhir/base/StructureDefinition/allergyIntolerance-eu-core',
  impfung: 'http://hl7.eu/fhir/base/StructureDefinition/immunization-eu-core',
} as const;

/**
 * ✦ Verweis von einer Ressource auf ihr Quelldokument — Vorschlag der Demo für die
 * Herkunftsangabe je Eintrag. Kein veröffentlichtes Profil; deshalb kein gematik-Namensraum.
 */
export const HERKUNFT_EXTENSION =
  'https://example.org/demo-pvs/fhir/StructureDefinition/source-document';

/** Extensions an der ICD-10-GM-Kodierung aus den deutschen Basisprofilen. */
export const ICD_EXTENSION = {
  diagnosesicherheit: 'http://fhir.de/StructureDefinition/icd-10-gm-diagnosesicherheit',
  seitenlokalisation: 'http://fhir.de/StructureDefinition/seitenlokalisation',
} as const;

const SYSTEM = {
  kvid10: 'http://fhir.de/sid/gkv/kvid-10',
  icdDiagnosesicherheit: 'https://fhir.kbv.de/CodeSystem/KBV_CS_SFHIR_ICD_DIAGNOSESICHERHEIT',
  icdSeitenlokalisation: 'https://fhir.kbv.de/CodeSystem/KBV_CS_SFHIR_ICD_SEITENLOKALISATION',
  conditionClinical: 'http://terminology.hl7.org/CodeSystem/condition-clinical',
  conditionVer: 'http://terminology.hl7.org/CodeSystem/condition-ver-status',
  conditionCategory: 'http://terminology.hl7.org/CodeSystem/condition-category',
  allergyClinical: 'http://terminology.hl7.org/CodeSystem/allergyintolerance-clinical',
  allergyVer: 'http://terminology.hl7.org/CodeSystem/allergyintolerance-verification',
  assertedDate: 'http://hl7.org/fhir/StructureDefinition/condition-assertedDate',
} as const;

/** SNOMED-CT-Kodierung mit Versionsangabe; andere Codesysteme unverändert. */
export function kodierungNachFhir(k: Kodierung): Coding {
  return k.system === CODESYSTEM.snomed
    ? { system: k.system, version: SNOMED_VERSION, code: k.code, display: k.anzeige }
    : { system: k.system, code: k.code, display: k.anzeige };
}

function herkunftExtension(herkunft: Herkunft): Extension[] {
  if (!herkunft.dokumentId) return [];
  return [
    {
      url: HERKUNFT_EXTENSION,
      valueReference: {
        reference: `DocumentReference/${herkunft.dokumentId}`,
        display: herkunft.quelle,
      },
    },
  ];
}

/** Verweis auf die Patientin oder den Patienten; mit KVNR, wenn sie bekannt ist. */
function patientVerweis(patientId: string, kvnr?: string) {
  return {
    reference: `Patient/${patientId}`,
    ...(kvnr ? { identifier: { system: SYSTEM.kvid10, value: kvnr } } : {}),
  };
}

export function patientNachFhir(patient: Patient): Ressource {
  return {
    resourceType: 'Patient',
    id: patient.id,
    meta: { profile: [PROFIL.patient] },
    identifier: [{ system: SYSTEM.kvid10, value: patient.versicherung.kvnr }],
    name: [{ use: 'official', family: patient.nachname, given: [patient.vorname] }],
    gender:
      patient.geschlecht === 'weiblich'
        ? 'female'
        : patient.geschlecht === 'maennlich'
          ? 'male'
          : patient.geschlecht === 'divers'
            ? 'other'
            : 'unknown',
    birthDate: patient.geburtsdatum,
    address: [
      {
        line: [`${patient.anschrift.strasse} ${patient.anschrift.hausnummer}`],
        postalCode: patient.anschrift.plz,
        city: patient.anschrift.ort,
        country: 'DE',
      },
    ],
  };
}

/**
 * Condition nach `ti-condition-diagnosis`. Die ICD-10-GM trägt Diagnosesicherheit und
 * Seitenlokalisation als Extension; SNOMED CT steht als zweite Kodierung daneben.
 */
export function diagnoseNachFhir(diagnose: Diagnose, kvnr?: string): Ressource {
  const icd: Coding = {
    system: CODESYSTEM.icd10gm,
    version: ICD10GM_VERSION,
    code: diagnose.code,
    display: diagnose.bezeichnung,
    extension: [
      {
        url: ICD_EXTENSION.diagnosesicherheit,
        valueCoding: {
          system: SYSTEM.icdDiagnosesicherheit,
          code: diagnose.zusatzkennzeichen,
          display: ZUSATZKENNZEICHEN_BEZEICHNUNG[diagnose.zusatzkennzeichen],
        },
      },
      ...(diagnose.seitenlokalisation
        ? [
            {
              url: ICD_EXTENSION.seitenlokalisation,
              valueCoding: {
                system: SYSTEM.icdSeitenlokalisation,
                code: diagnose.seitenlokalisation,
                display: SEITENLOKALISATION_BEZEICHNUNG[diagnose.seitenlokalisation],
              },
            },
          ]
        : []),
    ],
  };

  const ressource: Ressource = {
    resourceType: 'Condition',
    id: diagnose.id,
    meta: { profile: [PROFIL.diagnose] },
    clinicalStatus: {
      coding: [
        {
          system: SYSTEM.conditionClinical,
          code: KLINISCHER_STATUS_CODE[diagnose.klinischerStatus],
          display: KLINISCHER_STATUS_BEZEICHNUNG[diagnose.klinischerStatus],
        },
      ],
    },
    verificationStatus: {
      coding: [
        {
          system: SYSTEM.conditionVer,
          code: DIAGNOSESICHERHEIT_CODE[diagnose.diagnosesicherheit],
          display: DIAGNOSESICHERHEIT_BEZEICHNUNG[diagnose.diagnosesicherheit],
        },
      ],
    },
    category: [
      {
        coding: [
          {
            system: SYSTEM.conditionCategory,
            code: DIAGNOSEART_CODE[diagnose.art],
            display: DIAGNOSEART_BEZEICHNUNG[diagnose.art],
          },
        ],
      },
    ],
    // Mehrfachkodierung nach dem Informationsmodell: ICD-10-GM und, sofern vorhanden, SNOMED CT.
    code: {
      coding: [icd, ...(diagnose.snomed ? [kodierungNachFhir(diagnose.snomed)] : [])],
      text: diagnose.bezeichnung,
    },
    subject: patientVerweis(diagnose.patientId, kvnr),
    onsetDateTime: diagnose.beginn,
    recordedDate: diagnose.dokumentiertAm,
    recorder: { display: diagnose.herkunft.verantwortlich },
  };
  if (diagnose.ende) ressource['abatementDateTime'] = diagnose.ende;
  if (diagnose.feststellendePerson)
    ressource['asserter'] = { display: diagnose.feststellendePerson };
  if (diagnose.schweregrad)
    ressource['severity'] = { coding: [kodierungNachFhir(diagnose.schweregrad)] };
  if (diagnose.koerperstelle) ressource['bodySite'] = [{ text: diagnose.koerperstelle }];
  if (diagnose.notiz) ressource['note'] = [{ text: diagnose.notiz }];

  const extensionen: Extension[] = [
    ...(diagnose.festgestelltAm
      ? [{ url: SYSTEM.assertedDate, valueDateTime: diagnose.festgestelltAm }]
      : []),
    ...herkunftExtension(diagnose.herkunft),
  ];
  if (extensionen.length > 0) ressource.extension = extensionen;
  return ressource;
}

/**
 * AllergyIntolerance nach `allergyIntolerance-eu-core`. Kodiert wird die Substanz mit
 * SNOMED CT; eine ATC-Zuordnung für die AMTS-Prüfung gehört nicht hierher — sie ist keine
 * Übersetzung des Konzepts.
 */
export function allergieNachFhir(allergie: Allergie, kvnr?: string): Ressource {
  const ressource: Ressource = {
    resourceType: 'AllergyIntolerance',
    id: allergie.id,
    meta: { profile: [PROFIL.allergie] },
    clinicalStatus: {
      coding: [
        { system: SYSTEM.allergyClinical, code: ALLERGIESTATUS_CODE[allergie.klinischerStatus] },
      ],
    },
    verificationStatus: {
      coding: [{ system: SYSTEM.allergyVer, code: GEWISSHEIT_CODE[allergie.gewissheit] }],
    },
    type: ALLERGIETYP_CODE[allergie.typ],
    category: allergie.kategorien.map((k) => WIRKSTOFFKATEGORIE_CODE[k]),
    criticality: KRITIKALITAET_CODE[allergie.kritikalitaet],
    code: {
      ...(allergie.snomed ? { coding: [kodierungNachFhir(allergie.snomed)] } : {}),
      text: allergie.substanz,
    },
    patient: patientVerweis(allergie.patientId, kvnr),
    recordedDate: allergie.dokumentiertAm,
    recorder: { display: allergie.herkunft.verantwortlich },
  };
  if (allergie.beginn) {
    if (allergie.ende) ressource['onsetPeriod'] = { start: allergie.beginn, end: allergie.ende };
    else ressource['onsetDateTime'] = allergie.beginn;
  }
  if (allergie.feststellendePerson)
    ressource['asserter'] = { display: allergie.feststellendePerson };
  if (allergie.notiz) ressource['note'] = [{ text: allergie.notiz }];
  if (allergie.reaktionen.length > 0) {
    ressource['reaction'] = allergie.reaktionen.map((r) => ({
      // Manifestationen ohne Code sind zulässig (Code 0..*, Bezeichnung 0..1) und stehen nur als Text.
      manifestation: r.manifestationen.map((m) =>
        m.code ? { coding: [kodierungNachFhir(m)], text: m.anzeige } : { text: m.anzeige },
      ),
      ...(r.schweregrad ? { severity: REAKTIONSSCHWEREGRAD_CODE[r.schweregrad] } : {}),
      ...(r.datum ? { onset: r.datum } : {}),
      ...(r.expositionsweg
        ? { exposureRoute: { coding: [kodierungNachFhir(r.expositionsweg)] } }
        : {}),
    }));
  }
  const ext = herkunftExtension(allergie.herkunft);
  if (ext.length > 0) ressource.extension = ext;
  return ressource;
}

/**
 * Impfung nach `immunization-eu-core`: Impfstoff mit ATC (versioniert) und PZN, Datum,
 * Zielkrankheiten und Dosis in `protocolApplied`, Charge, impfende Person. Die Herkunft steht
 * wie bei Diagnosen am Eintrag.
 */
export function impfungNachFhir(impfung: Impfung, kvnr?: string): Ressource {
  return {
    resourceType: 'Immunization',
    id: impfung.id,
    meta: { profile: [PROFIL.impfung] },
    ...(herkunftExtension(impfung.herkunft).length
      ? { extension: herkunftExtension(impfung.herkunft) }
      : {}),
    status: impfung.status === 'fehlerhaft' ? 'entered-in-error' : 'completed',
    vaccineCode: {
      coding: [
        {
          system: CODESYSTEM.atc,
          version: impfung.impfstoff.atcVersion,
          code: impfung.impfstoff.atc,
          display: impfung.impfstoff.bezeichnung,
        },
        ...(impfung.impfstoff.pzn
          ? [{ system: 'http://fhir.de/CodeSystem/ifa/pzn', code: impfung.impfstoff.pzn }]
          : []),
      ],
      text: impfung.impfstoff.bezeichnung,
    },
    patient: patientVerweis(impfung.patientId, kvnr),
    occurrenceDateTime: impfung.datum,
    recorded: impfung.herkunft.zeitpunkt.slice(0, 10),
    ...(impfung.charge ? { lotNumber: impfung.charge } : {}),
    performer: [{ actor: { display: impfung.geimpftVon } }],
    protocolApplied: [
      {
        targetDisease: impfung.zielkrankheiten.map((k) => ({ coding: [kodierungNachFhir(k)] })),
        ...(impfung.dosis ? { doseNumberPositiveInt: impfung.dosis } : {}),
      },
    ],
    ...(impfung.notiz ? { note: [{ text: impfung.notiz }] } : {}),
  };
}
