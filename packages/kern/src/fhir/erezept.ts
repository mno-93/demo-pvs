import { dosierungAusText, dosierungNachFhir } from '../fachlogik/dosierung.js';
import type { Praxisstammdaten } from '../beispiele.js';
import { CODESYSTEM } from '../typen/kodierung.js';
import type { Patient } from '../typen/person.js';
import { NORMGROESSE_STUECK, type Normgroesse, type Rezept } from '../typen/rezept.js';
import { patientNachFhir, personNachFhir, praxisNachFhir } from './abbildung.js';
import type { Ressource } from './typen.js';
import { zeitzonenErgaenzen } from './zeit.js';

/**
 * Verordnungsdatensatz für das E-Rezept — vereinfacht nach den KBV-Profilen `kbv.ita.erp`
 * 1.4 (Bundle, Composition, Prescription, Medication_PZN, Patient, Practitioner,
 * Organization, Coverage).
 *
 * Belegt übernommen: Rezept-ID als Bundle-Kennung, eMP-Identifier des Planeintrags unter
 * `MedicationRequest.basedOn.identifier`, strukturierte Dosierung nach dem Muster des
 * Medikationsplans (Viererschema als Tageszeiten). ⚠ Vereinfacht: Pflichtangaben zu
 * Zuzahlung, Unfall, BVG, Abgabehinweisen und Kostenträger sind nur angedeutet; die ATC-Angabe
 * am Arzneimittel ist ein Zusatz der Demo, damit Plan und Liste denselben Wirkstoff erkennen.
 */

export const KBV_ERP = 'https://fhir.kbv.de/StructureDefinition/';
export const REZEPT_ID_SYSTEM =
  'https://gematik.de/fhir/erp/NamingSystem/GEM_ERP_NS_PrescriptionId';
export const EMP_IDENTIFIER_SYSTEM = 'https://gematik.de/fhir/sid/emp-identifier';
const PZN = 'http://fhir.de/CodeSystem/ifa/pzn';
/** Abschnittsarten der Verordnung (KBV). ⚠ Codesystem nicht gegen das Paket geprüft. */
const SECTION_TYPE = 'https://fhir.kbv.de/CodeSystem/KBV_CS_ERP_Section_Type';

const VIERERSCHEMA = /^(\d+(?:,\d+)?)-(\d+(?:,\d+)?)-(\d+(?:,\d+)?)-(\d+(?:,\d+)?)$/;

const zahl = (s: string) => Number(s.replace(',', '.'));

/**
 * Dosierung nach dem Muster `KBV_PR_ERP_Dosage_DailyFourScheme` (Viererschema) oder als
 * Freitext. Die erste Angabe trägt den Text, damit Leser ohne Strukturauswertung ihn finden.
 */
export function dosierungStrukturiert(text: string): Record<string, unknown>[] {
  // Dieselbe Abbildung wie im Medikationsplan: DosageDgMP (Medication IG DE 2.0.0-ballot).
  return dosierungNachFhir(dosierungAusText(text));
}

/** Tagesmenge aus einem Viererschema, sonst `null`. */
export function tagesmenge(dosierung: string): number | null {
  const schema = VIERERSCHEMA.exec(dosierung.trim());
  if (!schema) return null;
  const summe = schema.slice(1).reduce((s, x) => s + zahl(x), 0);
  return summe > 0 ? summe : null;
}

/** Reichweite in Tagen — nur bei Viererschema; ⚠ Stückzahl je Normgröße angenähert. */
export function reichweiteTage(
  dosierung: string,
  packungen: number,
  normgroesse: Normgroesse,
): number | null {
  const menge = tagesmenge(dosierung);
  if (!menge || packungen <= 0) return null;
  return Math.floor((NORMGROESSE_STUECK[normgroesse] * packungen) / menge);
}

/**
 * Was der Verordnungsdatensatz außer dem Rezept braucht — die Person, die Ärztin, die Praxis.
 * Dieselben Angaben, aus denen auch ePA-Einträge und Arztbrief entstehen (DATENMODELL.md).
 */
export interface Verordnungskontext {
  patient: Patient;
  arzt: { name: string; lanr: string };
  praxis: Praxisstammdaten;
  rezeptId: string;
  authoredOn: string;
}

/** Baut den Verordnungsdatensatz, wie ihn das Primärsystem signiert und aktiviert. */
export function verordnungsdatensatzBauen(rezept: Rezept, k: Verordnungskontext): Ressource {
  const id = (teil: string) => `${teil}-${k.rezeptId.replace(/\./g, '')}`;
  const patient: Ressource = {
    ...patientNachFhir(k.patient, `${KBV_ERP}KBV_PR_FOR_Patient|1.2`),
    id: id('patient'),
  };
  const arzt: Ressource = {
    ...personNachFhir(k.arzt.name, k.arzt.lanr, `${KBV_ERP}KBV_PR_FOR_Practitioner|1.2`),
    id: id('arzt'),
  };
  const praxis: Ressource = {
    ...praxisNachFhir(k.praxis, `${KBV_ERP}KBV_PR_FOR_Organization|1.2`),
    id: id('praxis'),
  };
  const versicherung: Ressource = {
    resourceType: 'Coverage',
    id: id('coverage'),
    meta: { profile: [`${KBV_ERP}KBV_PR_FOR_Coverage|1.2`] },
    status: 'active',
    beneficiary: { reference: `Patient/${String(patient.id)}` },
    payor: [
      {
        identifier: {
          system: 'http://fhir.de/sid/arge-ik/iknr',
          value: k.patient.versicherung.kostentraegerkennung,
        },
        display: k.patient.versicherung.kostentraeger,
      },
    ],
  };
  const mittel: Ressource = {
    resourceType: 'Medication',
    id: id('mittel'),
    meta: { profile: [`${KBV_ERP}KBV_PR_ERP_Medication_PZN|1.4`] },
    code: {
      coding: [
        { system: PZN, code: rezept.arzneimittel.pzn },
        {
          system: CODESYSTEM.atc,
          version: rezept.arzneimittel.atcVersion,
          code: rezept.arzneimittel.atc,
        },
      ],
      text: rezept.arzneimittel.bezeichnung,
    },
    amount: {
      numerator: {
        extension: [
          {
            url: 'https://fhir.kbv.de/StructureDefinition/KBV_EX_ERP_Medication_PackagingSize',
            valueString: `${NORMGROESSE_STUECK[rezept.normgroesse]} St.`,
          },
        ],
        unit: 'St',
      },
      denominator: { value: 1 },
    },
    extension: [
      {
        url: 'http://fhir.de/StructureDefinition/normgroesse',
        valueCode: rezept.normgroesse,
      },
    ],
  };
  const verordnung: Ressource = {
    resourceType: 'MedicationRequest',
    id: id('verordnung'),
    meta: { profile: [`${KBV_ERP}KBV_PR_ERP_Prescription|1.4`] },
    status: 'active',
    intent: 'order',
    medicationReference: { reference: `Medication/${String(mittel.id)}` },
    subject: { reference: `Patient/${String(patient.id)}` },
    authoredOn: k.authoredOn,
    requester: { reference: `Practitioner/${String(arzt.id)}` },
    insurance: [{ reference: `Coverage/${String(versicherung.id)}` }],
    dosageInstruction: dosierungStrukturiert(rezept.dosierung),
    dispenseRequest: {
      quantity: { value: rezept.packungen, system: 'http://unitsofmeasure.org', code: '{Package}' },
    },
    substitution: { allowedBoolean: true },
    ...(rezept.empId
      ? { basedOn: [{ identifier: { system: EMP_IDENTIFIER_SYSTEM, value: rezept.empId } }] }
      : {}),
  };
  const komposition: Ressource = {
    resourceType: 'Composition',
    id: id('composition'),
    meta: { profile: [`${KBV_ERP}KBV_PR_ERP_Composition|1.4`] },
    status: 'final',
    type: {
      coding: [
        { system: 'https://fhir.kbv.de/CodeSystem/KBV_CS_SFHIR_KBV_FORMULAR_ART', code: 'e16A' },
      ],
    },
    subject: { reference: `Patient/${String(patient.id)}` },
    date: k.authoredOn,
    author: [{ reference: `Practitioner/${String(arzt.id)}` }],
    custodian: { reference: `Organization/${String(praxis.id)}` },
    title: 'elektronische Arzneimittelverordnung',
    section: [
      {
        code: { coding: [{ system: SECTION_TYPE, code: 'Prescription' }] },
        entry: [{ reference: `MedicationRequest/${String(verordnung.id)}` }],
      },
      {
        code: { coding: [{ system: SECTION_TYPE, code: 'Coverage' }] },
        entry: [{ reference: `Coverage/${String(versicherung.id)}` }],
      },
    ],
  };
  // Intern ohne Zeitzone, im Datensatz mit (zeit.ts).
  return zeitzonenErgaenzen({
    resourceType: 'Bundle',
    id: id('bundle'),
    meta: { profile: [`${KBV_ERP}KBV_PR_ERP_Bundle|1.4`] },
    identifier: { system: REZEPT_ID_SYSTEM, value: k.rezeptId },
    type: 'document',
    timestamp: `${k.authoredOn}T00:00:00`,
    entry: [komposition, verordnung, mittel, patient, arzt, praxis, versicherung].map((r) => ({
      fullUrl: `https://e-rezept.demo/${r.resourceType}/${String(r.id)}`,
      resource: r,
    })),
  } as Ressource);
}
