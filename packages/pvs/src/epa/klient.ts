import type {
  Lesart,
  Lotsenantwort,
  Lotsenkontext,
  Lotsenvorschlaege,
  Quellentext,
  Ressource,
} from '@demo-pvs/kern';
import { aufrufNotieren } from './protokoll.js';
import { abrufen } from './transport.js';

/**
 * Zugang zur elektronischen Patientenakte (ePA).
 *
 * Jeder Zugriff des Praxissystems auf ePA-Daten läuft über diese Stelle (ADR 0002). Es gibt
 * nur Wege, die im Release ePA 3.1.3 und seinen Implementation Guides belegt sind (ADR 0013);
 * jeder Aufruf nennt seine Grundlage, das Aufrufprotokoll zeigt sie.
 *
 * - MHD Service (`de.gematik.epa.mhd` 1.1.3): ITI-67 suchen, auch im Volltext; ITI-68 abrufen.
 * - Medication Service (`de.gematik.epa.medication` 1.3.5): eML, eMP samt Chronologie,
 *   eMP-Einträge anlegen und ändern, eML-Einträge mit dem eMP verknüpfen. Schreibend immer mit
 *   Lesenachweis `acknowledgedChronologyId` und dem Header `X-Requesting-Organization`.
 * - Befugnis (ADR 0017): `setEntitlementPs` beim Einlesen der eGK; ohne sie 403 `notEntitled`.
 * - ✦ Diagnose-Service (ADR 0018): Vorschlag einer Weiterentwicklung, nur wenn das
 *   Aktensystem ihn anbietet (CapabilityStatement unter `metadata`).
 * - ✦ Patient Summary (ADR 0021): Sicht aus den Diensten der ePA, `Patient/$summary`.
 * - Information Service (`I_Information_Service` 1.5.1): Aktenstatus und Widersprüche, vor
 *   jedem Zugriff und ohne Befugnis (ADR 0023).
 * - E-Rezept-Fachdienst (gematik `api-erp`, ⚠ Demo-Ersatz): `Task/$create`, `$activate`,
 *   `$abort` (ADR 0024). Er ist kein Teil der ePA; die Verschreibung erreicht die ePA über ihn.
 */

/** Die zugreifende Einrichtung. */
export const EINRICHTUNG = {
  telematikId: 'DEMO-PRAXIS-STADTGARTEN',
  anzeige: 'Hausarztpraxis am Stadtgarten',
} as const;

/**
 * x-useragent: ClientId und Version. Die ClientId hat 20 Zeichen, wie es der Medication
 * Service verlangt (CapabilityStatement, IG 1.3.5); sie ist fiktiv.
 */
export const USER_AGENT = 'DEMOPVSFIKTIV0000001/0.4.0';

const TELEMATIK_ID = 'https://gematik.de/fhir/sid/telematik-id';
const MHD = '/epa/mhd/api/v1/fhir';
const MEDIKATION = '/epa/medication/api/v1/fhir';
const BEFUGNIS = '/epa/basic/api/v1/ps/entitlements';
const PATIENT_SUMMARY = '/epa/vorschlag/patient-summary/api/v1/fhir';
const DIAGNOSEDIENST = '/epa/vorschlag/diagnosis/api/v1/fhir';
const IMPFLISTE = '/epa/vorschlag/immunization/api/v1/fhir';
const AKTENLOTSE = '/epa/vorschlag/aktenlotse/api/v1';
const EMP_IDENTIFIER = 'https://gematik.de/fhir/sid/emp-identifier';
const INFORMATION = '/information/api/v1/ehr';
const ERP = '/erp';

export const GRUNDLAGE = {
  iti67: 'MHD ITI-67 · IG epa-mhd 1.1.3',
  iti68: 'MHD ITI-68 · IG epa-mhd 1.1.3',
  eml: '$medication-list · IG epa-medication 1.3.5',
  emp: '$medication-plan · IG epa-medication 1.3.5',
  empLog: '$medication-plan-log · IG epa-medication 1.3.5',
  iti67Seit: 'MHD ITI-67 mit _lastUpdated · IG epa-mhd 1.1.3',
  empSeit: 'Provenance?is-emp-chronology&recorded · IG epa-medication 1.3.5',
  empFrueher: '$medication-plan zu früherem Chronologieeintrag · IG epa-medication 1.3.5',
  emlSeit: '$medication-list mit date · IG epa-medication 1.3.5',
  empNeu: '$add-emp-entry · IG epa-medication 1.3.5',
  empAendern: '$update-emp-entry · IG epa-medication 1.3.5',
  verknuepfen: '$link-emp · IG epa-medication 1.3.5',
  befugnis: 'setEntitlementPs · OpenAPI I_Entitlement_Management 1.8.0',
  dienst: '✦ Vorschlag Diagnose-Service · nicht spezifiziert',
  impfliste: '✦ Vorschlag Impfliste · nicht spezifiziert, Einträge nach immunization-eu-core',
  summary: '✦ Vorschlag Patient Summary · $summary nach IPS, Inhalt nach EPS 1.0.0-ballot',
  lotse: '✦ Vorschlag Aktenlotse · nicht spezifiziert, kein FHIR, regelbasiert',
  aktenstatus: 'getRecordStatus · OpenAPI I_Information_Service 1.5.1',
  widersprueche: 'getConsentDecisionInformation · OpenAPI I_Information_Service 1.5.1',
  erpErstellen: 'Task/$create · gematik api-erp (Demo-Ersatz)',
  erpAktivieren: 'Task/$activate · gematik api-erp (Demo-Ersatz, ohne QES)',
  erpLoeschen: 'Task/$abort · gematik api-erp (Demo-Ersatz)',
  verwaltung: 'Demo-Steuerung · keine ePA-Schnittstelle',
} as const;

/**
 * Demo-Ersatz für die Sitzung am Aktensystem (ID-Token, VAU): die Telematik-ID in einer
 * eigenen Kopfzeile — keine ePA-Schnittstelle.
 */
export const SITZUNG_KOPFZEILE = 'x-demo-sitzung';

/** Die Organisation der Praxis nach `TIOrganization`, wie sie `X-Requesting-Organization` trägt. */
export const ORGANISATION: Ressource = {
  resourceType: 'Organization',
  meta: { profile: ['https://gematik.de/fhir/ti/StructureDefinition/ti-organization'] },
  identifier: [{ system: TELEMATIK_ID, value: EINRICHTUNG.telematikId }],
  name: EINRICHTUNG.anzeige,
};

function base64(text: string): string {
  return btoa(unescape(encodeURIComponent(text)));
}

export class EpaFehler extends Error {
  constructor(
    public readonly status: number,
    public readonly diagnose: string,
    /** Fehlercode, etwa `notEntitled` oder `MEDSVC_EMP_CHRONOLOGY_ID_MISMATCH`. */
    public readonly code: string | null = null,
  ) {
    super(diagnose);
    this.name = 'EpaFehler';
  }

  get ohneBefugnis(): boolean {
    return this.status === 403 && this.code === 'notEntitled';
  }

  /** Eine andere Einrichtung hat inzwischen geändert — neu lesen und wiederholen. */
  get veraltet(): boolean {
    return this.status === 409 && /CHRONOLOGY_ID_MISMATCH/.test(this.code ?? '');
  }
}

let befugnisFehlt: (kvnr: string) => void = () => {};

/** Meldet eine fehlende Befugnis an die Anwendung, damit sie ihren eigenen Stand berichtigt. */
export function beiFehlenderBefugnis(rueckruf: (kvnr: string) => void): void {
  befugnisFehlt = rueckruf;
}

interface Anfrage {
  methode?: 'GET' | 'POST';
  pfad: string;
  kvnr?: string;
  koerper?: unknown;
  grundlage: string;
  /** Die Basisdienste sprechen JSON, die Fachdienste FHIR. */
  inhaltstyp?: 'application/json' | 'application/fhir+json';
  /** Ein Dokument abrufen statt JSON zu lesen. */
  datei?: boolean;
  /**
   * Weitere Kopfzeilen, etwa `X-AccessCode` beim E-Rezept-Fachdienst oder der ✦
   * Versichertenzugang `x-demo-versicherte`.
   */
  zusatz?: Record<string, string>;
}

interface Antwort<T> {
  inhalt: T;
  kopf: Headers;
}

function anfragekennung(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

/**
 * Laufende Leseanfragen, nach Pfad und Akte. Eine zweite gleiche Anfrage bekommt die Antwort
 * der ersten — sonst stünde im Entwicklungsmodus (doppelte Effekte) jeder Abruf zweimal im
 * Protokoll.
 */
const laufend = new Map<string, Promise<Antwort<unknown>>>();

function anfragen<T>(anfrage: Anfrage): Promise<Antwort<T>> {
  if ((anfrage.methode ?? 'GET') === 'POST') return senden<T>(anfrage);
  const schluessel = `${anfrage.pfad} ${anfrage.kvnr ?? ''}`;
  const vorhanden = laufend.get(schluessel);
  if (vorhanden) return vorhanden as Promise<Antwort<T>>;
  const neu = senden<T>(anfrage).finally(() => laufend.delete(schluessel));
  laufend.set(schluessel, neu);
  return neu;
}

/** Fachdienste nach FHIR, die die Organisation im Header erwarten. */
const mitOrganisation = (pfad: string) =>
  pfad.startsWith(MEDIKATION) || pfad.startsWith(DIAGNOSEDIENST) || pfad.startsWith(IMPFLISTE);

async function senden<T>({
  methode = 'GET',
  pfad,
  kvnr,
  koerper,
  grundlage,
  inhaltstyp = 'application/fhir+json',
  datei = false,
  zusatz = {},
}: Anfrage): Promise<Antwort<T>> {
  const beginn = performance.now();
  const fachlich = pfad.startsWith('/epa/') || pfad.startsWith(`${INFORMATION}`);
  const fachdienst = pfad.startsWith(`${ERP}/`);
  const kopfzeilen: Record<string, string> = fachlich
    ? {
        accept: datei ? '*/*' : inhaltstyp,
        'x-useragent': USER_AGENT,
        'X-Request-ID': anfragekennung(),
        [SITZUNG_KOPFZEILE]: EINRICHTUNG.telematikId,
        ...(kvnr ? { 'x-insurantid': kvnr } : {}),
        ...(mitOrganisation(pfad)
          ? { 'X-Requesting-Organization': base64(JSON.stringify(ORGANISATION)) }
          : {}),
        ...(koerper !== undefined ? { 'content-type': inhaltstyp } : {}),
        ...zusatz,
      }
    : fachdienst
      ? {
          accept: 'application/fhir+json',
          'X-Request-ID': anfragekennung(),
          [SITZUNG_KOPFZEILE]: EINRICHTUNG.telematikId,
          ...(koerper !== undefined ? { 'content-type': 'application/fhir+json' } : {}),
          ...zusatz,
        }
      : { 'content-type': 'application/json' };

  const notieren = (status: number | null, ergebnis: string, fehler: string | null) =>
    aufrufNotieren({
      methode,
      pfad,
      status,
      dauerMs: Math.round(performance.now() - beginn),
      ergebnis,
      fehler,
      grundlage,
      kopfzeilen: fachlich || fachdienst ? kopfzeilen : {},
      koerper: koerper ?? null,
    });

  let antwort: Response;
  try {
    antwort = await abrufen(pfad, {
      method: methode,
      headers: kopfzeilen,
      // Die ePA ist eine Fernsicht: nie aus dem Zwischenspeicher des Browsers antworten.
      cache: 'no-store',
      ...(koerper !== undefined ? { body: JSON.stringify(koerper) } : {}),
    });
  } catch (fehler) {
    const text = fehler instanceof Error ? fehler.message : 'Unbekannter Fehler';
    notieren(null, 'keine Antwort', text);
    throw new EpaFehler(0, `Die ePA ist nicht erreichbar (${text}).`);
  }

  if (datei && antwort.ok) {
    const typ = (antwort.headers.get('content-type') ?? '').split(';')[0] ?? '';
    if (typ.includes('json')) {
      const inhalt = (await antwort.json()) as T;
      notieren(antwort.status, typ, null);
      return { inhalt, kopf: antwort.headers };
    }
    const daten = await antwort.blob();
    notieren(antwort.status, `${typ}, ${daten.size} Bytes`, null);
    return { inhalt: { datei: daten, mimeType: typ } as T, kopf: antwort.headers };
  }

  const inhalt = await antwort.json().catch(() => null);
  if (!antwort.ok) {
    const detail = inhalt?.issue?.[0]?.details?.coding?.[0]?.code as string | undefined;
    const code: string | null =
      typeof inhalt?.errorCode === 'string' ? inhalt.errorCode : (detail ?? null);
    const text: string =
      inhalt?.issue?.[0]?.diagnostics ??
      inhalt?.errorDetail ??
      `Die ePA antwortete mit ${antwort.status}.`;
    const diagnose = code ? `${code}: ${text}` : text;
    notieren(antwort.status, diagnose.slice(0, 90), diagnose);
    const fehler = new EpaFehler(antwort.status, diagnose, code);
    if (fehler.ohneBefugnis && kvnr) befugnisFehlt(kvnr);
    throw fehler;
  }

  const ergebnis =
    typeof inhalt?.total === 'number'
      ? `${inhalt.total} Treffer`
      : inhalt?.resourceType
        ? String(inhalt.resourceType)
        : typeof inhalt?.validTo === 'string'
          ? `Befugnis bis ${inhalt.validTo}`
          : 'ok';
  notieren(antwort.status, ergebnis, null);
  return { inhalt: inhalt as T, kopf: antwort.headers };
}

interface Bundle {
  resourceType: 'Bundle';
  meta?: { lastUpdated?: string };
  type?: string;
  total?: number;
  timestamp?: string;
  entry?: { resource: Ressource; search?: { mode?: string } }[];
}

function treffer(bundle: Bundle): Ressource[] {
  return (bundle.entry ?? []).filter((e) => e.search?.mode !== 'include').map((e) => e.resource);
}

function eingeschlossen(bundle: Bundle): Ressource[] {
  return (bundle.entry ?? []).filter((e) => e.search?.mode === 'include').map((e) => e.resource);
}

function parameterRessource(
  p: { parameter?: { name: string; resource?: Ressource }[] },
  name: string,
) {
  return p.parameter?.find((x) => x.name === name)?.resource;
}

/* ---------- MHD Service ---------- */

export async function dokumenteSuchen(
  kvnr: string,
  volltext?: string,
  /**
   * Gesetzt, wenn nicht die Praxis sucht, sondern die versicherte Person in ihrer eigenen
   * Anwendung. Derselbe Weg, dieselbe Antwort — nur ein anderer Zugang (✦ Demo-Ersatz).
   */
  alsVersicherte?: string,
): Promise<Ressource[]> {
  const suche = new URLSearchParams({ status: 'current' });
  if (volltext?.trim()) suche.set('_content', volltext.trim());
  const { inhalt } = await anfragen<Bundle>({
    pfad: `${MHD}/DocumentReference?${suche.toString()}`,
    kvnr,
    grundlage: GRUNDLAGE.iti67,
    ...(alsVersicherte ? { zusatz: { 'x-demo-versicherte': alsVersicherte } } : {}),
  });
  return treffer(inhalt);
}

/** Ob der Dokumentendienst die Volltextsuche (`_content`) anbietet — laut CapabilityStatement. */
let volltextAngeboten: boolean | null = null;

export async function volltextsucheVerfuegbar(): Promise<boolean> {
  if (volltextAngeboten !== null) return volltextAngeboten;
  const { inhalt } = await anfragen<{
    rest?: { resource?: { type?: string; searchParam?: { name?: string }[] }[] }[];
  }>({
    pfad: `${MHD}/metadata`,
    grundlage: GRUNDLAGE.iti67,
  });
  volltextAngeboten = (inhalt.rest ?? [])
    .flatMap((r) => r.resource ?? [])
    .filter((r) => r.type === 'DocumentReference')
    .some((r) => (r.searchParam ?? []).some((p) => p.name === '_content'));
  return volltextAngeboten;
}

/**
 * Zeitpunkt des Aktensystems aus einer Antwort — das Lesezeichen für eine spätere Abfrage
 * „seit" (ADR 0030). Nie die Uhr der Praxis: Sie kann abweichen.
 */
function serverzeit(b: Bundle): string {
  return b.meta?.lastUpdated ?? b.timestamp ?? '';
}

/** Dokumentliste mit dem Zeitpunkt des Aktensystems. */
export async function dokumenteMitStand(
  kvnr: string,
): Promise<{ verweise: Ressource[]; stand: string }> {
  const { inhalt } = await anfragen<Bundle>({
    pfad: `${MHD}/DocumentReference?status=current`,
    kvnr,
    grundlage: GRUNDLAGE.iti67,
  });
  return { verweise: treffer(inhalt), stand: serverzeit(inhalt) };
}

/** Dokumente, die seit dem Lesezeichen eingestellt oder geändert wurden (`_lastUpdated`). */
export async function dokumenteSeit(kvnr: string, seit: string): Promise<Ressource[]> {
  const { inhalt } = await anfragen<Bundle>({
    pfad: `${MHD}/DocumentReference?status=current&_lastUpdated=gt${encodeURIComponent(seit)}`,
    kvnr,
    grundlage: GRUNDLAGE.iti67Seit,
  });
  return treffer(inhalt);
}

/** Ein unstrukturiertes Dokument (PDF, XML) als Datei. */
export interface EpaDatei {
  datei: Blob;
  mimeType: string;
}

export function istDatei(inhalt: unknown): inhalt is EpaDatei {
  return typeof inhalt === 'object' && inhalt !== null && 'datei' in inhalt;
}

/** ITI-68 über die URL aus `DocumentReference.content.attachment.url`. */
export async function dokumentAbrufen(
  kvnr: string,
  verweis: Ressource,
  alsVersicherte?: string,
): Promise<unknown> {
  const url = (verweis['content'] as { attachment?: { url?: string } }[] | undefined)?.[0]
    ?.attachment?.url;
  if (!url) throw new EpaFehler(0, 'Der Dokumentverweis nennt keine Abrufadresse.');
  const { inhalt } = await anfragen<unknown>({
    pfad: url,
    kvnr,
    grundlage: GRUNDLAGE.iti68,
    datei: true,
    ...(alsVersicherte ? { zusatz: { 'x-demo-versicherte': alsVersicherte } } : {}),
  });
  return inhalt;
}

/* ---------- Medication Service ---------- */

export interface Medikationsliste {
  /** Medikationsinformationen (MedicationStatement) — die Einträge der eML. */
  eintraege: Ressource[];
  /** Arzneimittel, Verordnungen, Abgaben, Änderungseinträge, Organisationen. */
  einschluesse: Ressource[];
}

export async function medikationslisteLesen(kvnr: string): Promise<Medikationsliste> {
  const { inhalt } = await anfragen<Bundle>({
    pfad: `${MEDIKATION}/$medication-list`,
    kvnr,
    grundlage: GRUNDLAGE.eml,
  });
  return { eintraege: treffer(inhalt), einschluesse: eingeschlossen(inhalt) };
}

export interface Medikationsplan {
  /** Kennung des Chronologieeintrags — der Lesenachweis für jede Änderung. */
  lesenachweis: string | null;
  stand: string;
  /** Zeitpunkt des Aktensystems beim Abruf — Lesezeichen für die Abfrage „seit". */
  abgerufen: string;
  eintraege: Ressource[];
  ressourcen: Ressource[];
}

/** Der Medikationsplan — aktuell oder, mit `chronologie`, der Stand zu diesem Eintrag. */
export async function medikationsplanLesen(
  kvnr: string,
  frueherenStand?: string,
): Promise<Medikationsplan> {
  const { inhalt } = await anfragen<Bundle>({
    pfad: frueherenStand
      ? `${MEDIKATION}/$medication-plan?provenance=${encodeURIComponent(frueherenStand)}`
      : `${MEDIKATION}/$medication-plan`,
    kvnr,
    grundlage: frueherenStand ? GRUNDLAGE.empFrueher : GRUNDLAGE.emp,
  });
  const alle = (inhalt.entry ?? []).map((e) => e.resource);
  const chronologie = alle.find(
    (r) =>
      r.resourceType === 'Provenance' &&
      (r.extension ?? []).some((e) => e.url.endsWith('is-emp-chronology-extension')),
  );
  return {
    lesenachweis: chronologie ? String(chronologie.id) : null,
    stand: String(chronologie?.['recorded'] ?? ''),
    abgerufen: serverzeit(inhalt),
    eintraege: alle.filter((r) => r.resourceType === 'MedicationRequest' && r['intent'] === 'plan'),
    ressourcen: alle,
  };
}

/**
 * Chronologieeinträge des Medikationsplans seit dem Lesezeichen, je mit der Einrichtung, die
 * geändert hat (`agent.who.identifier`).
 */
export async function planaenderungenSeit(
  kvnr: string,
  seit: string,
): Promise<{ id: string; telematikId: string | null; einrichtung: string }[]> {
  const { inhalt } = await anfragen<Bundle>({
    pfad: `${MEDIKATION}/Provenance?is-emp-chronology=true&recorded=gt${encodeURIComponent(seit)}`,
    kvnr,
    grundlage: GRUNDLAGE.empSeit,
  });
  return treffer(inhalt).map((p) => {
    const wer = (
      p['agent'] as { who?: { identifier?: { value?: string }; display?: string } }[] | undefined
    )?.[0]?.who;
    return {
      id: String(p.id),
      telematikId: wer?.identifier?.value ?? null,
      einrichtung: wer?.display ?? '—',
    };
  });
}

/** Einträge der Medikationsliste seit dem Lesezeichen (`date`). */
export async function medikationslisteSeit(kvnr: string, seit: string): Promise<string[]> {
  const { inhalt } = await anfragen<Bundle>({
    pfad: `${MEDIKATION}/$medication-list?date=gt${encodeURIComponent(seit)}`,
    kvnr,
    grundlage: GRUNDLAGE.emlSeit,
  });
  return treffer(inhalt).map((r) => String(r.id));
}

/** Nur der neueste Chronologieeintrag — für die Frage „hat sich etwas geändert?". */
export async function medikationsplanStand(
  kvnr: string,
): Promise<{ lesenachweis: string | null; stand: string }> {
  const { inhalt } = await anfragen<Bundle>({
    pfad: `${MEDIKATION}/$medication-plan-log?_count=1`,
    kvnr,
    grundlage: GRUNDLAGE.empLog,
  });
  const neueste = treffer(inhalt)[0];
  return {
    lesenachweis: neueste ? String(neueste.id) : null,
    stand: String(neueste?.['recorded'] ?? ''),
  };
}

interface EmpErgebnis {
  eintrag: Ressource;
  lesenachweis: string;
}

function empErgebnis(p: { parameter?: { name: string; resource?: Ressource }[] }): EmpErgebnis {
  const eintrag = parameterRessource(p, 'empEntry');
  const chronologie = parameterRessource(p, 'relatedChronology');
  if (!eintrag || !chronologie) throw new EpaFehler(0, 'Die Antwort ist unvollständig.');
  return { eintrag, lesenachweis: String(chronologie.id) };
}

/**
 * `$add-emp-entry` — neues Arzneimittel (EMPMedication) oder Verweis auf eines aus Verordnung
 * oder Abgabe, dazu der Eintrag (EMPMedicationRequest).
 */
export async function empEintragAnlegen(
  kvnr: string,
  lesenachweis: string | null,
  mittel: { resource: Ressource } | { reference: string },
  eintrag: Ressource,
): Promise<EmpErgebnis> {
  const { inhalt } = await anfragen<{ parameter?: { name: string; resource?: Ressource }[] }>({
    methode: 'POST',
    pfad: `${MEDIKATION}/$add-emp-entry`,
    kvnr,
    koerper: {
      resourceType: 'Parameters',
      parameter: [
        ...(lesenachweis ? [{ name: 'acknowledgedChronologyId', valueId: lesenachweis }] : []),
        {
          name: 'medication',
          part: [
            'resource' in mittel
              ? { name: 'resource', resource: mittel.resource }
              : { name: 'reference', valueReference: { reference: mittel.reference } },
          ],
        },
        { name: 'empEntry', resource: eintrag },
      ],
    },
    grundlage: GRUNDLAGE.empNeu,
  });
  return empErgebnis(inhalt);
}

/** `$update-emp-entry` — Dosierung, Grund, Status; beenden, absetzen, fehlerhaft. */
export async function empEintragAendern(
  kvnr: string,
  lesenachweis: string | null,
  eintrag: Ressource,
): Promise<EmpErgebnis> {
  const { inhalt } = await anfragen<{ parameter?: { name: string; resource?: Ressource }[] }>({
    methode: 'POST',
    pfad: `${MEDIKATION}/$update-emp-entry`,
    kvnr,
    koerper: {
      resourceType: 'Parameters',
      parameter: [
        ...(lesenachweis ? [{ name: 'acknowledgedChronologyId', valueId: lesenachweis }] : []),
        {
          name: 'medicationPlanIdentifier',
          valueIdentifier: { system: EMP_IDENTIFIER, value: String(eintrag.id) },
        },
        { name: 'empEntry', resource: eintrag },
      ],
    },
    grundlage: GRUNDLAGE.empAendern,
  });
  return empErgebnis(inhalt);
}

/** `$link-emp` — eML-Eintrag mit einem eMP-Eintrag verknüpfen. */
export async function empVerknuepfen(
  kvnr: string,
  lesenachweis: string | null,
  emlEintragId: string,
  empEintragId: string,
): Promise<EmpErgebnis> {
  const { inhalt } = await anfragen<{ parameter?: { name: string; resource?: Ressource }[] }>({
    methode: 'POST',
    pfad: `${MEDIKATION}/MedicationStatement/${emlEintragId}/$link-emp`,
    kvnr,
    koerper: {
      resourceType: 'Parameters',
      parameter: [
        ...(lesenachweis ? [{ name: 'acknowledgedChronologyId', valueId: lesenachweis }] : []),
        {
          name: 'medicationPlanIdentifier',
          valueIdentifier: { system: EMP_IDENTIFIER, value: empEintragId },
        },
      ],
    },
    grundlage: GRUNDLAGE.verknuepfen,
  });
  return empErgebnis(inhalt);
}

/* ---------- Information Service ---------- */

/**
 * Zustand der Akte, wie ihn das Aktensystem vor jedem Zugriff meldet: vorhanden und nutzbar,
 * nicht vorhanden, vorübergehend gesperrt. Dazu die Widersprüche gegen Versorgungsprozesse.
 */
export interface Aktenstatus {
  akte: 'aktiv' | 'keine' | 'gesperrt';
  /** Widerspruch gegen den Medikationsprozess — Liste und Plan sind dann gesperrt. */
  medikationGesperrt: boolean;
  /** Widerspruch gegen das Einstellen durch den E-Rezept-Fachdienst. */
  erezeptGesperrt: boolean;
}

export async function aktenstatusLesen(kvnr: string): Promise<Aktenstatus> {
  try {
    await anfragen({
      pfad: INFORMATION,
      kvnr,
      grundlage: GRUNDLAGE.aktenstatus,
      inhaltstyp: 'application/json',
    });
  } catch (f) {
    if (f instanceof EpaFehler && f.status === 404 && f.code === 'noHealthRecord') {
      return { akte: 'keine', medikationGesperrt: false, erezeptGesperrt: false };
    }
    if (f instanceof EpaFehler && f.status === 409 && f.code === 'statusMismatch') {
      return { akte: 'gesperrt', medikationGesperrt: false, erezeptGesperrt: false };
    }
    throw f;
  }
  const { inhalt } = await anfragen<{ data?: { functionId: string; decision: string }[] }>({
    pfad: `${INFORMATION}/consentdecisions`,
    kvnr,
    grundlage: GRUNDLAGE.widersprueche,
    inhaltstyp: 'application/json',
  });
  const abgelehnt = (id: string) =>
    (inhalt.data ?? []).some((d) => d.functionId === id && d.decision === 'deny');
  return {
    akte: 'aktiv',
    medikationGesperrt: abgelehnt('medication'),
    erezeptGesperrt: abgelehnt('erp-submission'),
  };
}

/* ---------- E-Rezept-Fachdienst (⚠ Demo-Ersatz) ---------- */

export interface ErpAufgabe {
  rezeptId: string;
  accessCode: string;
  status: string;
}

function aufgabeLesen(task: {
  id?: string;
  status?: string;
  identifier?: { system?: string; value?: string }[];
}): ErpAufgabe {
  return {
    rezeptId: String(task.id),
    accessCode:
      task.identifier?.find((i) => i.system?.endsWith('GEM_ERP_NS_AccessCode'))?.value ?? '',
    status: String(task.status ?? ''),
  };
}

/** `Task/$create` — Rezept-ID und AccessCode für ein neues E-Rezept (Flowtype 160, Muster 16). */
export async function erezeptErstellen(flowtype = '160'): Promise<ErpAufgabe> {
  const { inhalt } = await anfragen<Parameters<typeof aufgabeLesen>[0]>({
    methode: 'POST',
    pfad: `${ERP}/Task/$create`,
    koerper: {
      resourceType: 'Parameters',
      parameter: [
        {
          name: 'workflowType',
          valueCoding: {
            system: 'https://gematik.de/fhir/erp/CodeSystem/GEM_ERP_CS_FlowType',
            code: flowtype,
          },
        },
      ],
    },
    grundlage: GRUNDLAGE.erpErstellen,
  });
  return aufgabeLesen(inhalt);
}

/**
 * `Task/{id}/$activate` mit dem Verordnungsdatensatz. ⚠ Im Wirkbetrieb qualifiziert signiert
 * (PKCS#7 über den Konnektor mit dem eHBA); die Demo überträgt ihn unsigniert.
 */
export async function erezeptAktivieren(
  aufgabe: ErpAufgabe,
  datensatz: Ressource,
): Promise<ErpAufgabe> {
  const { inhalt } = await anfragen<Parameters<typeof aufgabeLesen>[0]>({
    methode: 'POST',
    pfad: `${ERP}/Task/${aufgabe.rezeptId}/$activate`,
    koerper: {
      resourceType: 'Parameters',
      parameter: [
        {
          name: 'ePrescription',
          resource: {
            resourceType: 'Binary',
            contentType: 'application/pkcs7-mime',
            data: base64(JSON.stringify(datensatz)),
          },
        },
      ],
    },
    zusatz: { 'X-AccessCode': aufgabe.accessCode },
    grundlage: GRUNDLAGE.erpAktivieren,
  });
  return { ...aufgabe, status: aufgabeLesen(inhalt).status };
}

/** `Task/{id}/$abort` — ein noch nicht eingelöstes Rezept löschen. */
export async function erezeptLoeschen(rezeptId: string, accessCode: string): Promise<void> {
  await anfragen({
    methode: 'POST',
    pfad: `${ERP}/Task/${rezeptId}/$abort`,
    koerper: {},
    zusatz: { 'X-AccessCode': accessCode },
    grundlage: GRUNDLAGE.erpLoeschen,
  });
}

/* ---------- Demo-Steuerung ---------- */

/** Gemerkte Antwort, ob das Aktensystem den Diagnose-Service anbietet. */
let dienstAngeboten: boolean | null = null;
/** Gemerkte Antwort, ob das Aktensystem die Patient Summary anbietet. */
let summaryAngeboten: boolean | null = null;

/** Zählt Umstellungen der Demo-Steuerung — Ansichten fragen danach neu. */
let betriebsstand = 0;
const betriebshoerer = new Set<() => void>();

function betriebsstandErhoehen(): void {
  volltextAngeboten = null;
  impflisteAngeboten = null;
  dienstAngeboten = null;
  summaryAngeboten = null;
  lotseAngeboten = null;
  betriebsstand += 1;
  betriebshoerer.forEach((h) => h());
}

export function betriebsstandAbonnieren(hoerer: () => void): () => void {
  betriebshoerer.add(hoerer);
  return () => {
    betriebshoerer.delete(hoerer);
  };
}

export function betriebsstandLesen(): number {
  return betriebsstand;
}

/** Vergisst Gemerktes über das Aktensystem — beim Zurücksetzen der Anwendung. */
export function klientZuruecksetzen(): void {
  impflisteAngeboten = null;
  dienstAngeboten = null;
  summaryAngeboten = null;
  lotseAngeboten = null;
  laufend.clear();
}

/** Welche ePA der Simulator darstellt: das Release oder die Weiterentwicklung. */
export type Ausbaustand =
  | 'release-3.1.3'
  | 'weiterentwicklung'
  | 'weiterentwicklung-2'
  | 'weiterentwicklung-3'
  | 'weiterentwicklung-4';

export interface Betriebslage {
  verzoegerungMs: number;
  ausbaustand: Ausbaustand;
  fremdeAenderungVorSchreibzugriff: boolean;
  /** ✦ Woraus die Patient Summary gebildet wird — ärztlich geführte Listen oder nur Automatik. */
  patientSummaryQuellen: 'listen' | 'automatisch';
  /** Dauer, bis der E-Rezept-Fachdienst Verschreibung oder Abgabe in die ePA übertragen hat. */
  erezeptVerzoegerungMs: number;
}

export async function betriebslageLesen(): Promise<Betriebslage> {
  return (
    await anfragen<Betriebslage>({
      pfad: '/verwaltung/betriebslage',
      grundlage: GRUNDLAGE.verwaltung,
    })
  ).inhalt;
}

export async function betriebslageSetzen(teil: Partial<Betriebslage>): Promise<Betriebslage> {
  const { inhalt } = await anfragen<Betriebslage>({
    methode: 'POST',
    pfad: '/verwaltung/betriebslage',
    koerper: teil,
    grundlage: GRUNDLAGE.verwaltung,
  });
  if (teil.ausbaustand !== undefined || teil.patientSummaryQuellen !== undefined) {
    betriebsstandErhoehen();
  }
  return inhalt;
}

/** Ein E-Rezept, wie es die Demo-Steuerung aus Sicht der Apotheke zeigt. */
export interface ApothekenRezept {
  id: string;
  kvnr: string | null;
  status: string;
  arzneimittel: string;
  authoredOn: string;
  epa: string;
  abgabe: string;
  empId: string | null;
}

export async function apothekenRezepteLesen(): Promise<ApothekenRezept[]> {
  return (
    await anfragen<ApothekenRezept[]>({
      pfad: '/verwaltung/erezepte',
      grundlage: GRUNDLAGE.verwaltung,
    })
  ).inhalt;
}

export type Abgabeart = 'wie-verordnet' | 'austausch' | 'mehrfach';

/** Die Apotheke gibt ab — die Abgabe erreicht die ePA über den E-Rezept-Fachdienst. */
export async function apothekeGibtAb(id: string, art: Abgabeart): Promise<void> {
  await anfragen({
    methode: 'POST',
    pfad: `/verwaltung/erezepte/${id}/abgabe`,
    koerper: { art },
    grundlage: GRUNDLAGE.verwaltung,
  });
}

export async function apothekeStorniertAbgabe(id: string): Promise<void> {
  await anfragen({
    methode: 'POST',
    pfad: `/verwaltung/erezepte/${id}/abgabe-storno`,
    koerper: {},
    grundlage: GRUNDLAGE.verwaltung,
  });
}

export interface Aktenlage {
  kvnr: string;
  status: 'ACTIVATED' | 'SUSPENDED';
  widersprueche: { medication: 'permit' | 'deny'; 'erp-submission': 'permit' | 'deny' };
}

export async function aktenLesen(): Promise<Aktenlage[]> {
  return (
    await anfragen<Aktenlage[]>({ pfad: '/verwaltung/bestand', grundlage: GRUNDLAGE.verwaltung })
  ).inhalt;
}

/** Zustand oder Widerspruch einer Akte umstellen — wie es die versicherte Person täte. */
export async function akteSetzen(
  kvnr: string,
  teil: { status?: 'ACTIVATED' | 'SUSPENDED'; medication?: 'permit' | 'deny' },
): Promise<void> {
  await anfragen({
    methode: 'POST',
    pfad: '/verwaltung/akte',
    koerper: { kvnr, ...teil },
    grundlage: GRUNDLAGE.verwaltung,
  });
  betriebsstandErhoehen();
}

/** Eine andere Einrichtung trägt jetzt in die Listen ein — für „neu seit dem letzten Aufruf". */
export async function fremdeEintraegeAnlegen(kvnr: string): Promise<void> {
  await anfragen({
    methode: 'POST',
    pfad: '/verwaltung/fremde-eintraege',
    koerper: { kvnr },
    grundlage: GRUNDLAGE.verwaltung,
  });
  betriebsstandErhoehen();
}

export async function aktensystemZuruecksetzen(): Promise<void> {
  await anfragen({
    methode: 'POST',
    pfad: '/verwaltung/zuruecksetzen',
    koerper: {},
    grundlage: GRUNDLAGE.verwaltung,
  });
  betriebsstandErhoehen();
}

export interface Aktenbefugnis {
  kvnr: string;
  befugnisse: {
    telematikId: string;
    anzeige: string;
    gueltigBis: string;
    erteiltAm: string;
    weg: string;
  }[];
}

export async function befugnisseLesen(): Promise<Aktenbefugnis[]> {
  return (
    await anfragen<Aktenbefugnis[]>({
      pfad: '/verwaltung/befugnisse',
      grundlage: GRUNDLAGE.verwaltung,
    })
  ).inhalt;
}

/** Wie nach Ablauf der 90 Tage: Die Praxis verliert alle Befugnisse. */
export async function befugnisseEntziehen(): Promise<number> {
  const { inhalt } = await anfragen<{ entzogen: number }>({
    methode: 'POST',
    pfad: '/verwaltung/befugnisse/entziehen',
    koerper: { telematikId: EINRICHTUNG.telematikId },
    grundlage: GRUNDLAGE.verwaltung,
  });
  // Wie jede Umstellung der Demo-Steuerung: Offene Ansichten fragen neu, bekommen 403
  // `notEntitled` und berichtigen darüber den Stand des Praxissystems (ADR 0017). Ohne das
  // stünde im Kopf noch „ePA-Befugnis bis …" neben Daten, die es nicht mehr geben dürfte.
  betriebsstandErhoehen();
  return inhalt.entzogen;
}

/* ---------- Befugnis ---------- */

function base64url(text: string): string {
  return base64(text).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Prüfungsnachweis der Demo — im Wirkbetrieb aus VSDM beim Stecken der eGK. */
export function pruefungsnachweisBilden(kvnr: string): string {
  const kennung =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : String(Date.now());
  return btoa(
    JSON.stringify({ kvnr, kennung, zeitpunkt: new Date().toISOString(), demo: 'ohne VSDM' }),
  );
}

/**
 * `setEntitlementPs` nach dem Stecken der eGK. Das JWT trüge im Wirkbetrieb die Signatur der
 * SMC-B (C.HCI.AUT); ⚠ in der Demo ist es nicht signiert.
 */
export async function befugnisRegistrieren(
  kvnr: string,
  pruefungsnachweis: string,
): Promise<{ validTo: string }> {
  const kopf = base64url(JSON.stringify({ typ: 'JWT', alg: 'ES256', x5c: ['DEMO-C.HCI.AUT'] }));
  const nutzlast = base64url(JSON.stringify({ auditEvidence: pruefungsnachweis }));
  const { inhalt } = await anfragen<{ validTo: string }>({
    methode: 'POST',
    pfad: BEFUGNIS,
    kvnr,
    koerper: { jwt: `${kopf}.${nutzlast}.${base64url('DEMO-OHNE-SIGNATUR')}` },
    grundlage: GRUNDLAGE.befugnis,
    inhaltstyp: 'application/json',
  });
  return inhalt;
}

/* ---------- ✦ Diagnose-Service (Vorschlag) ---------- */

export type Listenart = 'Condition' | 'AllergyIntolerance';
/** Alle zentral geführten Listen: dazu ✦ die Impfliste (Stufe 2). */
export type Dienstliste = Listenart | 'Immunization';

const LISTE: Record<
  Dienstliste,
  {
    basis: string;
    grundlage: string;
    lesen: string;
    anlegen: string;
    aendern: string;
    markieren: string;
    parameter: string;
  }
> = {
  Immunization: {
    basis: IMPFLISTE,
    grundlage: GRUNDLAGE.impfliste,
    lesen: '$immunization-list',
    anlegen: '$add-immunization-entry',
    aendern: '$update-immunization-entry',
    markieren: '',
    parameter: 'immunizationEntry',
  },
  Condition: {
    basis: DIAGNOSEDIENST,
    grundlage: GRUNDLAGE.dienst,
    lesen: '$condition-list',
    anlegen: '$add-condition-entry',
    aendern: '$update-condition-entry',
    markieren: '$flag-condition-entry',
    parameter: 'conditionEntry',
  },
  AllergyIntolerance: {
    basis: DIAGNOSEDIENST,
    grundlage: GRUNDLAGE.dienst,
    lesen: '$allergy-list',
    anlegen: '$add-allergy-entry',
    aendern: '$update-allergy-entry',
    markieren: '$flag-allergy-entry',
    parameter: 'allergyEntry',
  },
};

/** Bietet das Aktensystem den Diagnose-Service an? Antwort aus seinem CapabilityStatement. */
export async function diagnosedienstVerfuegbar(): Promise<boolean> {
  if (dienstAngeboten !== null) return dienstAngeboten;
  try {
    await anfragen({ pfad: `${DIAGNOSEDIENST}/metadata`, grundlage: GRUNDLAGE.dienst });
    dienstAngeboten = true;
  } catch (f) {
    if (!(f instanceof EpaFehler && f.status === 404)) throw f;
    dienstAngeboten = false;
  }
  return dienstAngeboten;
}

/** Gemerkte Antwort, ob das Aktensystem die Impfliste anbietet (✦ Stufe 2). */
let impflisteAngeboten: boolean | null = null;

export async function impflisteVerfuegbar(): Promise<boolean> {
  if (impflisteAngeboten !== null) return impflisteAngeboten;
  try {
    await anfragen({ pfad: `${IMPFLISTE}/metadata`, grundlage: GRUNDLAGE.impfliste });
    impflisteAngeboten = true;
  } catch (f) {
    if (!(f instanceof EpaFehler && f.status === 404)) throw f;
    impflisteAngeboten = false;
  }
  return impflisteAngeboten;
}

export interface EpaListe {
  eintraege: Ressource[];
  provenance: Ressource[];
  /** Kennung des aktuellen Chronologieeintrags — der Lesenachweis für Änderungen. */
  lesenachweis: string | null;
}

export async function listeLesen(kvnr: string, art: Dienstliste): Promise<EpaListe> {
  const { inhalt } = await anfragen<Bundle>({
    pfad: `${LISTE[art].basis}/${LISTE[art].lesen}`,
    kvnr,
    grundlage: LISTE[art].grundlage,
  });
  const dazu = eingeschlossen(inhalt).filter((r) => r.resourceType === 'Provenance');
  const chronologie = dazu.find((r) =>
    (r.extension ?? []).some((e) => /list-chronology$/.test(e.url) && e.valueBoolean === true),
  );
  return {
    eintraege: treffer(inhalt),
    provenance: dazu.filter((r) => r !== chronologie),
    lesenachweis: chronologie ? String(chronologie.id) : null,
  };
}

async function listenoperation(
  kvnr: string,
  art: Dienstliste,
  op: 'anlegen' | 'aendern',
  lesenachweis: string | null,
  ressource: Ressource,
): Promise<{ eintrag: Ressource; lesenachweis: string }> {
  const { inhalt } = await anfragen<{ parameter?: { name: string; resource?: Ressource }[] }>({
    methode: 'POST',
    pfad: `${LISTE[art].basis}/${LISTE[art][op]}`,
    kvnr,
    koerper: {
      resourceType: 'Parameters',
      parameter: [
        ...(lesenachweis ? [{ name: 'acknowledgedChronologyId', valueId: lesenachweis }] : []),
        { name: LISTE[art].parameter, resource: ressource },
      ],
    },
    grundlage: LISTE[art].grundlage,
  });
  const eintrag = parameterRessource(inhalt, 'entry');
  const chronologie = parameterRessource(inhalt, 'relatedChronology');
  if (!eintrag || !chronologie) throw new EpaFehler(0, 'Die Antwort ist unvollständig.');
  return { eintrag, lesenachweis: String(chronologie.id) };
}

export function listeneintragAnlegen(
  kvnr: string,
  art: Dienstliste,
  lesenachweis: string | null,
  ressource: Ressource,
) {
  return listenoperation(kvnr, art, 'anlegen', lesenachweis, ressource);
}

export function listeneintragAendern(
  kvnr: string,
  art: Dienstliste,
  lesenachweis: string | null,
  ressource: Ressource,
) {
  return listenoperation(kvnr, art, 'aendern', lesenachweis, ressource);
}

/* ---------- ✦ Patient Summary ---------- */

/** Bietet das Aktensystem die Patient Summary an? Antwort aus seinem CapabilityStatement. */
export async function patientSummaryVerfuegbar(): Promise<boolean> {
  if (summaryAngeboten !== null) return summaryAngeboten;
  try {
    await anfragen({ pfad: `${PATIENT_SUMMARY}/metadata`, grundlage: GRUNDLAGE.summary });
    summaryAngeboten = true;
  } catch (f) {
    if (!(f instanceof EpaFehler && f.status === 404)) throw f;
    summaryAngeboten = false;
  }
  return summaryAngeboten;
}

/** Die Patient Summary — bei jeder Abfrage aus den Diensten der ePA gebildet. */
export async function patientSummaryAbrufen(kvnr: string): Promise<unknown> {
  const { inhalt } = await anfragen<unknown>({
    pfad: `${PATIENT_SUMMARY}/Patient/$summary`,
    kvnr,
    grundlage: GRUNDLAGE.summary,
  });
  return inhalt;
}

/* ---------- ✦ Aktenlotse (Vorschlag, ab Ausbaustand „Weiterentwicklung 4") ---------- */

/**
 * Der Lotse läuft über dieselbe Prüfkette wie jeder andere ePA-Weg: dieselbe Sitzung,
 * dieselbe Befugnis, dieselbe Akte. Er bekommt dadurch keine eigenen Rechte — er sieht
 * genau so viel wie das aufrufende System.
 */
export async function lotseFragen(
  kvnr: string,
  frage: string,
  lesart: Lesart = 'fach',
  /** Gesetzt, wenn nicht die Praxis fragt, sondern die versicherte Person oder ihre Vertretung. */
  alsVersicherte?: string,
): Promise<Lotsenantwort> {
  const { inhalt } = await anfragen<Lotsenantwort>({
    methode: 'POST',
    pfad: `${AKTENLOTSE}/frage`,
    kvnr,
    koerper: { frage, lesart },
    inhaltstyp: 'application/json',
    grundlage: alsVersicherte ? `${GRUNDLAGE.lotse} · Versichertenzugang` : GRUNDLAGE.lotse,
    ...(alsVersicherte ? { zusatz: { 'x-demo-versicherte': alsVersicherte } } : {}),
  });
  return inhalt;
}

/** Kontext zum Anlass des Kontakts, mit Hinweis auf auseinandergehende Angaben. */
export async function lotseKontext(kvnr: string, anlass: string): Promise<Lotsenkontext> {
  const { inhalt } = await anfragen<Lotsenkontext>({
    pfad: `${AKTENLOTSE}/kontext?anlass=${encodeURIComponent(anlass)}`,
    kvnr,
    inhaltstyp: 'application/json',
    grundlage: GRUNDLAGE.lotse,
  });
  return inhalt;
}

/** Was eine strukturierte Liste aus dem unstrukturierten Bestand aufnehmen könnte. */
export async function lotseVorschlaege(kvnr: string): Promise<Lotsenvorschlaege> {
  const { inhalt } = await anfragen<Lotsenvorschlaege>({
    pfad: `${AKTENLOTSE}/vorschlaege`,
    kvnr,
    inhaltstyp: 'application/json',
    grundlage: GRUNDLAGE.lotse,
  });
  return inhalt;
}

/** Eine Unterlage öffnen und nachlesen — der Weg, auf den die Quellenangabe einer Antwort zeigt. */
export async function lotseQuelle(
  kvnr: string,
  quelleId: string,
  alsVersicherte?: string,
): Promise<Quellentext> {
  const { inhalt } = await anfragen<Quellentext>({
    pfad: `${AKTENLOTSE}/quelle/${encodeURIComponent(quelleId)}`,
    kvnr,
    inhaltstyp: 'application/json',
    grundlage: GRUNDLAGE.lotse,
    ...(alsVersicherte ? { zusatz: { 'x-demo-versicherte': alsVersicherte } } : {}),
  });
  return inhalt;
}

/** Ob der Ausbaustand den Lotsen anbietet. */
let lotseAngeboten: boolean | null = null;

export async function lotseVorhanden(): Promise<boolean> {
  if (lotseAngeboten !== null) return lotseAngeboten;
  try {
    await anfragen({
      pfad: `${AKTENLOTSE}/metadata`,
      inhaltstyp: 'application/json',
      grundlage: GRUNDLAGE.lotse,
    });
    lotseAngeboten = true;
  } catch (f) {
    if (!(f instanceof EpaFehler && f.status === 404)) throw f;
    lotseAngeboten = false;
  }
  return lotseAngeboten;
}

/** ✦ Markiert einen Listeneintrag als relevant für die Patient Summary oder hebt das auf. */
export async function listeneintragMarkieren(
  kvnr: string,
  art: Listenart,
  lesenachweis: string | null,
  id: string,
  psRelevant: boolean,
): Promise<{ eintrag: Ressource; lesenachweis: string }> {
  const { inhalt } = await anfragen<{ parameter?: { name: string; resource?: Ressource }[] }>({
    methode: 'POST',
    pfad: `${DIAGNOSEDIENST}/${LISTE[art].markieren}`,
    kvnr,
    koerper: {
      resourceType: 'Parameters',
      parameter: [
        ...(lesenachweis ? [{ name: 'acknowledgedChronologyId', valueId: lesenachweis }] : []),
        { name: 'entry', valueReference: { reference: `${art}/${id}` } },
        { name: 'psRelevant', valueBoolean: psRelevant },
      ],
    },
    grundlage: GRUNDLAGE.dienst,
  });
  const eintrag = parameterRessource(inhalt, 'entry');
  const chronologie = parameterRessource(inhalt, 'relatedChronology');
  if (!eintrag || !chronologie) throw new EpaFehler(0, 'Die Antwort ist unvollständig.');
  return { eintrag, lesenachweis: String(chronologie.id) };
}
