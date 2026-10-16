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
  DIAGNOSEART_CODE,
  DIAGNOSESICHERHEIT_CODE,
  KLINISCHER_STATUS_CODE,
  SEITENLOKALISATION_BEZEICHNUNG,
  ZUSATZKENNZEICHEN_BEZEICHNUNG,
  istGegenwaertig,
  type Diagnose,
} from '../typen/diagnose.js';
import type { Herkunft } from '../typen/herkunft.js';
import { CODESYSTEM, ICD10GM_VERSION, SNOMED_VERSION, type Kodierung } from '../typen/kodierung.js';
import type { Impfung } from '../typen/impfung.js';
import type { Patient } from '../typen/person.js';
import type { Praxisstammdaten } from '../beispiele.js';
import type { Coding, Extension, Ressource } from './typen.js';

/**
 * Abbildung der Domänentypen nach FHIR.
 *
 * Profile folgen der Ableitungsarchitektur des Projekts (Basis-FHIR → EU Core → TI Common →
 * Content-IG). Für die Patient Summary liegen noch keine eigenen
 * Profile vor; verwendet wird deshalb die nächsthöhere Ebene, die es gibt:
 *
 * - Condition: TI Common `ti-condition-diagnosis` 1.5.0 (Paket `de.gematik.ti`
 *   1.5.0-ballot.2) — abgeleitet von `condition-eu-core`;
 * - AllergyIntolerance: `allergyIntolerance-eu-core` — TI Common bietet kein Allergieprofil;
 * - Patient: `ti-patient`, wie im Informationsmodell referenziert.
 *
 * Pflichtangaben der Profile sind Pflichtparameter der Funktionen: Ohne KVNR entsteht keine
 * Condition, AllergyIntolerance oder Immunization (`patient` 1..1; `subject.identifier` ist in
 * `ti-condition-diagnosis` Must Support und in der `EMPReasonCondition` des Ballots 1.4.0 1..1).
 * Geprüft werden die Ausgaben mit `fhirPruefen` (pruefung.ts) in jedem Testlauf; das ersetzt
 * keine Validierung gegen die Profile (DATENMODELL.md).
 */
export const PROFIL = {
  patient: 'https://gematik.de/fhir/ti/StructureDefinition/ti-patient',
  diagnose: 'https://gematik.de/fhir/ti/StructureDefinition/ti-condition-diagnosis',
  allergie: 'http://hl7.eu/fhir/base/StructureDefinition/allergyIntolerance-eu-core',
  impfung: 'http://hl7.eu/fhir/base/StructureDefinition/immunization-eu-core',
  organisation: 'https://gematik.de/fhir/ti/StructureDefinition/ti-organization',
} as const;

/** Extension für eine Pflichtangabe, deren Wert unbekannt ist (FHIR R4, `data-absent-reason`). */
export const DATA_ABSENT_REASON = 'http://hl7.org/fhir/StructureDefinition/data-absent-reason';

/** Ein Pflichtelement ohne Wert: nur die Extension mit dem Grund, etwa `unknown`. */
export function wertFehlt(grund: 'unknown' | 'asked-unknown' | 'not-applicable' = 'unknown') {
  return { extension: [{ url: DATA_ABSENT_REASON, valueCode: grund }] };
}

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

/**
 * Ende einer Allergie: „The date or estimated date that the allergy or intolerance resolved"
 * (HL7 FHIR Extensions Pack). AllergyIntolerance hat in R4 kein `abatement[x]`; `onsetPeriod.end`
 * wäre das Ende des Zeitraums, in dem sie begann — nicht ihr Ende.
 */
export const ALLERGIE_ENDE_EXTENSION =
  'http://hl7.org/fhir/StructureDefinition/allergyintolerance-abatement';

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

/**
 * Anzeigen der HL7-Codesysteme, wie die Terminologie sie führt (FHIR R4). Deutsche Bezeichnungen
 * gehören in die Oberfläche: Der HL7-Validator prüft `display` gegen die Terminologie, und der
 * ePA-Ballot 1.4.0 lässt den Dienst ihn beim Speichern ohnehin aus der Terminologie setzen.
 */
const ANZEIGE = {
  klinisch: {
    active: 'Active',
    recurrence: 'Recurrence',
    relapse: 'Relapse',
    inactive: 'Inactive',
    remission: 'Remission',
    resolved: 'Resolved',
  },
  verifikation: {
    unconfirmed: 'Unconfirmed',
    provisional: 'Provisional',
    differential: 'Differential',
    confirmed: 'Confirmed',
    refuted: 'Refuted',
    'entered-in-error': 'Entered in Error',
  },
  kategorie: {
    'problem-list-item': 'Problem List Item',
    'encounter-diagnosis': 'Encounter Diagnosis',
  },
} as const satisfies Record<string, Record<string, string>>;

function anzeige(art: keyof typeof ANZEIGE, code: string): string {
  return (ANZEIGE[art] as Record<string, string>)[code] ?? code;
}

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

/**
 * Verweis auf die Patientin oder den Patienten — mit KVNR. In der ePA ist sie die Kennung der
 * Akte; `ti-condition-diagnosis` führt sie als `subject.identifier` (Must Support).
 */
function patientVerweis(patientId: string, kvnr: string) {
  return {
    reference: `Patient/${patientId}`,
    identifier: { system: SYSTEM.kvid10, value: kvnr },
  };
}

/** Die Person als Patient — für jedes Ziel dieselben Angaben; das Profil gibt der Aufrufer an. */
export function patientNachFhir(patient: Patient, profil: string = PROFIL.patient): Ressource {
  return {
    resourceType: 'Patient',
    id: patient.id,
    meta: { profile: [profil] },
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
export function diagnoseNachFhir(diagnose: Diagnose, kvnr: string): Ressource {
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

  // Alpha-ID-SE als weitere Kodierung, wenn erfasst (Must Support in ti-condition-diagnosis).
  const alphaId: Coding[] = diagnose.alphaId
    ? [{ system: CODESYSTEM.alphaId, version: ICD10GM_VERSION, code: diagnose.alphaId }]
    : [];
  // Kein klinischer Status bei einer irrtümlichen Eingabe (con-5) und bei einer ausgeschlossenen
  // Diagnose: Zusatzkennzeichen „A“ verlangt einen leeren Status (icd-4 der Deutschen Basisprofile,
  // dort Warnung; in der `EMPReasonCondition` des ePA-Ballots 1.4.0 Fehler).
  const ohneStatus =
    diagnose.diagnosesicherheit === 'irrtümlich' || diagnose.zusatzkennzeichen === 'A';
  const ressource: Ressource = {
    resourceType: 'Condition',
    id: diagnose.id,
    meta: { profile: [PROFIL.diagnose] },
    ...(ohneStatus
      ? {}
      : {
          clinicalStatus: {
            coding: [
              {
                system: SYSTEM.conditionClinical,
                code: KLINISCHER_STATUS_CODE[diagnose.klinischerStatus],
                display: anzeige('klinisch', KLINISCHER_STATUS_CODE[diagnose.klinischerStatus]),
              },
            ],
          },
        }),
    verificationStatus: {
      coding: [
        {
          system: SYSTEM.conditionVer,
          code: DIAGNOSESICHERHEIT_CODE[diagnose.diagnosesicherheit],
          display: anzeige('verifikation', DIAGNOSESICHERHEIT_CODE[diagnose.diagnosesicherheit]),
        },
      ],
    },
    category: [
      {
        coding: [
          {
            system: SYSTEM.conditionCategory,
            code: DIAGNOSEART_CODE[diagnose.art],
            display: anzeige('kategorie', DIAGNOSEART_CODE[diagnose.art]),
          },
        ],
      },
    ],
    // Mehrfachkodierung nach dem Informationsmodell: ICD-10-GM und, sofern vorhanden, SNOMED CT.
    code: {
      coding: [icd, ...alphaId, ...(diagnose.snomed ? [kodierungNachFhir(diagnose.snomed)] : [])],
      text: diagnose.bezeichnung,
    },
    subject: patientVerweis(diagnose.patientId, kvnr),
    onsetDateTime: diagnose.beginn,
    recordedDate: diagnose.dokumentiertAm,
    recorder: { display: diagnose.herkunft.verantwortlich },
  };
  // con-4: Ein Ende nur mit Status inaktiv, behoben oder Remission — ohne Status also keins.
  if (diagnose.ende && !ohneStatus && !istGegenwaertig(diagnose.klinischerStatus))
    ressource['abatementDateTime'] = diagnose.ende;
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
export function allergieNachFhir(allergie: Allergie, kvnr: string): Ressource {
  // ait-2: Eine irrtümliche Eingabe trägt keinen klinischen Status.
  const irrtum = allergie.gewissheit === 'irrtümlich';
  const ressource: Ressource = {
    resourceType: 'AllergyIntolerance',
    id: allergie.id,
    meta: { profile: [PROFIL.allergie] },
    ...(irrtum
      ? {}
      : {
          clinicalStatus: {
            coding: [
              {
                system: SYSTEM.allergyClinical,
                code: ALLERGIESTATUS_CODE[allergie.klinischerStatus],
              },
            ],
          },
        }),
    verificationStatus: {
      coding: [{ system: SYSTEM.allergyVer, code: GEWISSHEIT_CODE[allergie.gewissheit] }],
    },
    type: ALLERGIETYP_CODE[allergie.typ],
    ...(allergie.kategorien.length > 0
      ? { category: allergie.kategorien.map((k) => WIRKSTOFFKATEGORIE_CODE[k]) }
      : {}),
    criticality: KRITIKALITAET_CODE[allergie.kritikalitaet],
    code: {
      ...(allergie.snomed ? { coding: [kodierungNachFhir(allergie.snomed)] } : {}),
      text: allergie.substanz,
    },
    patient: patientVerweis(allergie.patientId, kvnr),
    recordedDate: allergie.dokumentiertAm,
    recorder: { display: allergie.herkunft.verantwortlich },
  };
  if (allergie.beginn) ressource['onsetDateTime'] = allergie.beginn;
  if (allergie.feststellendePerson)
    ressource['asserter'] = { display: allergie.feststellendePerson };
  if (allergie.notiz) ressource['note'] = [{ text: allergie.notiz }];
  // `reaction.manifestation` ist 1..*: Eine Reaktion ohne Manifestation entsteht nicht.
  const reaktionen = allergie.reaktionen.filter((r) => r.manifestationen.length > 0);
  if (reaktionen.length > 0) {
    ressource['reaction'] = reaktionen.map((r) => ({
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
  // Ein Ende hat nur eine Allergie, die nicht mehr aktiv ist.
  const ende = allergie.ende && allergie.klinischerStatus !== 'aktiv' ? allergie.ende : null;
  const ext: Extension[] = [
    ...(ende ? [{ url: ALLERGIE_ENDE_EXTENSION, valueDateTime: ende }] : []),
    ...herkunftExtension(allergie.herkunft),
  ];
  if (ext.length > 0) ressource.extension = ext;
  return ressource;
}

/**
 * Impfung nach `immunization-eu-core`: Impfstoff mit ATC (versioniert) und PZN, Datum,
 * Zielkrankheiten und Dosis in `protocolApplied`, Charge, impfende Person. Die Herkunft steht
 * wie bei Diagnosen am Eintrag.
 */
export function impfungNachFhir(impfung: Impfung, kvnr: string): Ressource {
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
    // `protocolApplied.doseNumber[x]` ist 1..1: Ist die Dosis unbekannt, steht der Grund da.
    protocolApplied: [
      {
        ...(impfung.zielkrankheiten.length > 0
          ? {
              targetDisease: impfung.zielkrankheiten.map((k) => ({
                coding: [kodierungNachFhir(k)],
              })),
            }
          : {}),
        ...(impfung.dosis
          ? { doseNumberPositiveInt: impfung.dosis }
          : { _doseNumberPositiveInt: wertFehlt('unknown') }),
      },
    ],
    ...(impfung.notiz ? { note: [{ text: impfung.notiz }] } : {}),
  };
}

/**
 * „Keine bekannte Allergie" als ausdrückliche Angabe — SNOMED CT 716186003, nach
 * `allergyIntolerance-eu-core`. Eine später eingetragene Allergie widerlegt sie.
 */
export function keineBekannteAllergieNachFhir(
  kvnr: string,
  person: string,
  datum: string,
): Ressource {
  return {
    resourceType: 'AllergyIntolerance',
    meta: { profile: [PROFIL.allergie] },
    clinicalStatus: { coding: [{ system: SYSTEM.allergyClinical, code: 'active' }] },
    verificationStatus: { coding: [{ system: SYSTEM.allergyVer, code: 'confirmed' }] },
    code: {
      coding: [
        {
          system: CODESYSTEM.snomed,
          version: SNOMED_VERSION,
          code: '716186003',
          display: 'No known allergy',
        },
      ],
      text: 'Keine bekannte Allergie',
    },
    patient: { identifier: { system: SYSTEM.kvid10, value: kvnr } },
    recordedDate: datum,
    recorder: { display: person },
    asserter: { display: person },
  };
}

/**
 * Die Praxis als Organization — aus den Stammdaten, für jeden Zweck dieselbe: Kopfzeile der ePA
 * (`TIOrganization`), Absender im Arztbrief, Organisation im E-Rezept. Das Profil gibt der
 * Aufrufer an; die Angaben bleiben gleich.
 */
export function praxisNachFhir(p: Praxisstammdaten, profil?: string): Ressource {
  return {
    resourceType: 'Organization',
    ...(profil ? { meta: { profile: [profil] } } : {}),
    identifier: [
      { system: 'https://gematik.de/fhir/sid/telematik-id', value: p.telematikId },
      { system: 'https://fhir.kbv.de/NamingSystem/KBV_NS_Base_BSNR', value: p.bsnr },
    ],
    name: p.name,
    telecom: [
      { system: 'phone', value: p.telefon },
      { system: 'email', value: p.kim },
    ],
    address: [
      {
        type: 'both',
        line: [`${p.anschrift.strasse} ${p.anschrift.hausnummer}`],
        city: p.anschrift.ort,
        postalCode: p.anschrift.plz,
        country: 'DE',
      },
    ],
  };
}

/** Eine Ärztin oder ein Arzt als Practitioner — mit lebenslanger Arztnummer, wenn vorhanden. */
export function personNachFhir(name: string, lanr: string | null, profil?: string): Ressource {
  return {
    resourceType: 'Practitioner',
    ...(profil ? { meta: { profile: [profil] } } : {}),
    ...(lanr
      ? {
          identifier: [{ system: 'https://fhir.kbv.de/NamingSystem/KBV_NS_Base_ANR', value: lanr }],
        }
      : {}),
    name: [{ use: 'official', text: name }],
  };
}
