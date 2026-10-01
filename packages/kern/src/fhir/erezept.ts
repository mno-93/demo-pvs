import { CODESYSTEM } from '../typen/kodierung.js';
import { NORMGROESSE_STUECK, type Normgroesse, type Rezept } from '../typen/rezept.js';
import type { Ressource } from './typen.js';

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
const KVID = 'http://fhir.de/sid/gkv/kvid-10';
const TELEMATIK_ID = 'https://gematik.de/fhir/sid/telematik-id';

const VIERERSCHEMA = /^(\d+(?:,\d+)?)-(\d+(?:,\d+)?)-(\d+(?:,\d+)?)-(\d+(?:,\d+)?)$/;
const TAGESZEIT = ['MORN', 'NOON', 'EVE', 'NIGHT'] as const;

const zahl = (s: string) => Number(s.replace(',', '.'));

/**
 * Dosierung nach dem Muster `KBV_PR_ERP_Dosage_DailyFourScheme` (Viererschema) oder als
 * Freitext. Die erste Angabe trägt den Text, damit Leser ohne Strukturauswertung ihn finden.
 */
export function dosierungStrukturiert(text: string): Record<string, unknown>[] {
  const schema = VIERERSCHEMA.exec(text.trim());
  if (!schema) return [{ text }];
  const angaben = schema
    .slice(1)
    .map((menge, i) => ({ menge: zahl(menge), zeit: TAGESZEIT[i]! }))
    .filter((x) => x.menge > 0);
  if (angaben.length === 0) return [{ text }];
  return angaben.map((x, i) => ({
    ...(i === 0 ? { text } : {}),
    timing: { repeat: { when: [x.zeit] } },
    doseAndRate: [{ doseQuantity: { value: x.menge, unit: 'Stück' } }],
  }));
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

export interface Verordnungskontext {
  kvnr: string;
  vorname: string;
  nachname: string;
  geburtsdatum: string;
  kostentraeger: string;
  kostentraegerkennung: string;
  arzt: { name: string; lanr: string };
  praxis: { name: string; telematikId: string };
  rezeptId: string;
  authoredOn: string;
}

/** Baut den Verordnungsdatensatz, wie ihn das Primärsystem signiert und aktiviert. */
export function verordnungsdatensatzBauen(rezept: Rezept, k: Verordnungskontext): Ressource {
  const id = (teil: string) => `${teil}-${k.rezeptId.replace(/\./g, '')}`;
  const patient: Ressource = {
    resourceType: 'Patient',
    id: id('patient'),
    meta: { profile: [`${KBV_ERP}KBV_PR_FOR_Patient|1.2`] },
    identifier: [{ system: KVID, value: k.kvnr }],
    name: [{ use: 'official', family: k.nachname, given: [k.vorname] }],
    birthDate: k.geburtsdatum,
  };
  const arzt: Ressource = {
    resourceType: 'Practitioner',
    id: id('arzt'),
    meta: { profile: [`${KBV_ERP}KBV_PR_FOR_Practitioner|1.2`] },
    identifier: [
      { system: 'https://fhir.kbv.de/NamingSystem/KBV_NS_Base_ANR', value: k.arzt.lanr },
    ],
    name: [{ use: 'official', text: k.arzt.name }],
  };
  const praxis: Ressource = {
    resourceType: 'Organization',
    id: id('praxis'),
    meta: { profile: [`${KBV_ERP}KBV_PR_FOR_Organization|1.2`] },
    identifier: [{ system: TELEMATIK_ID, value: k.praxis.telematikId }],
    name: k.praxis.name,
  };
  const versicherung: Ressource = {
    resourceType: 'Coverage',
    id: id('coverage'),
    meta: { profile: [`${KBV_ERP}KBV_PR_FOR_Coverage|1.2`] },
    status: 'active',
    beneficiary: { reference: `Patient/${String(patient.id)}` },
    payor: [
      {
        identifier: { system: 'http://fhir.de/sid/arge-ik/iknr', value: k.kostentraegerkennung },
        display: k.kostentraeger,
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
        code: { coding: [{ code: 'Prescription' }] },
        entry: [{ reference: `MedicationRequest/${String(verordnung.id)}` }],
      },
      {
        code: { coding: [{ code: 'Coverage' }] },
        entry: [{ reference: `Coverage/${String(versicherung.id)}` }],
      },
    ],
  };
  return {
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
  } as Ressource;
}
