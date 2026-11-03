import {
  PRAXIS_STAMMDATEN,
  PROFIL,
  demoJetzt,
  praxisNachFhir,
  registryResponseLesen,
  WEG,
} from '@demo-pvs/kern';
import type { Ressource } from '@demo-pvs/kern';
import { aufrufNotieren } from './protokoll.js';
import { abrufen } from './transport.js';

/**
 * Zugang zur elektronischen Patientenakte (ePA) — Grundlage aller Dienste.
 *
 * Jeder Zugriff des Praxissystems auf ePA-Daten läuft über diese Stelle (ADR 0002): Kopfzeilen,
 * Aufrufprotokoll, Fehler und Wiederholschutz. Es gibt nur Wege, die in den Implementation Guides
 * belegt sind (ADR 0013); jeder Aufruf nennt seine Grundlage, das Aufrufprotokoll zeigt sie.
 *
 * Hier selbst: Befugnis (ADR 0017, `setEntitlementPs` beim Einlesen der eGK; ohne sie 403
 * `notEntitled`) und Information Service (`I_Information_Service` 1.5.1: Aktenstatus und
 * Widersprüche, vor jedem Zugriff und ohne Befugnis, ADR 0023). Die Dienste stehen je in einem
 * Modul unter `dienste/`: `dokumente` (MHD, XDS), `medikation` (Medication Service),
 * `erezept` (E-Rezept-Fachdienst, Demo-Ersatz), `listendienste` (✦ Diagnose-Service, ✦ Impfliste),
 * `vorschlaege` (✦ Patient Summary, ✦ Aktenlotse) und `kim` (KIM-Clientmodul, Demo-Ersatz). Die
 * Demo-Steuerung (`/verwaltung`) ist keine Schnittstelle der ePA; sie steht in `demo/steuerung.ts`.
 */

/** Die zugreifende Einrichtung — aus den Stammdaten der Praxis. */
export const EINRICHTUNG = {
  telematikId: PRAXIS_STAMMDATEN.telematikId,
  anzeige: PRAXIS_STAMMDATEN.name,
} as const;

/**
 * x-useragent: ClientId und Version. Die ClientId hat 20 Zeichen, wie es der Medication
 * Service verlangt (CapabilityStatement, IG 1.3.5); sie ist fiktiv.
 */
export const USER_AGENT = 'DEMOPVSFIKTIV0000001/0.4.0';

export const MHD = WEG.mhd;
export const MEDIKATION = WEG.medikation;
/** Common Query API (`de.gematik.epa` 1.4.0-ballot.1) — seit 1.4.0 auch für die Medikation. */
export const QUERY = WEG.query;
export const RENDER_EINSTELLUNG = WEG.renderEinstellung;
const BEFUGNIS = WEG.befugnis;
export const PATIENT_SUMMARY = WEG.patientSummary;
export const DIAGNOSEDIENST = WEG.diagnosedienst;
export const IMPFLISTE = WEG.impfliste;
export const AKTENLOTSE = WEG.aktenlotse;
export const EMP_IDENTIFIER = 'https://gematik.de/fhir/sid/emp-identifier';
const INFORMATION = WEG.information;
export const ERP = WEG.erp;

/**
 * Was die Dienste über das Angebot des Aktensystems gemerkt haben (etwa die Antwort von
 * `metadata`). Jeder Dienst meldet hier, wie er es vergisst; nach einer Umstellung der
 * Betriebslage und beim Zurücksetzen fragt er neu.
 */
const vergessen = new Set<() => void>();

export function angebotMerken(leeren: () => void): void {
  vergessen.add(leeren);
}

export const GRUNDLAGE = {
  iti67: 'MHD ITI-67 · IG epa-mhd 1.1.3',
  iti68: 'MHD ITI-68 · IG epa-mhd 1.1.3',
  iti67Eps:
    'MHD ITI-67 type=60591-5 · Ballot epa-mhd 1.2.0, ePS nach gemIG_ePA_ePS 1.0.0-ballot.1 (Vorschau ePA 3.2)',
  iti68Eps: 'MHD ITI-68 · erzeugte ePS, Ballot epa-mhd 1.2.0 (Vorschau ePA 3.2)',
  iti41: 'XDS ITI-41 Provide & Register · WSDL XDSDocumentService, ePA 3.1.3',
  kim: 'KIM Client-Mail · gemSpec_CM_KOMLE 1.16.6 — Demo-Ersatz für SMTP ans Clientmodul',
  eml: '$medication-list · IG epa-medication 1.4.0-ballot.1',
  emp: '$medication-plan · IG epa-medication 1.4.0-ballot.1',
  empLog: '$medication-plan-log · IG epa-medication 1.4.0-ballot.1',
  iti67Seit: 'MHD ITI-67 mit _lastUpdated · IG epa-mhd 1.1.3',
  empSeit: 'Provenance?is-emp-chronology&recorded · Common Query API, IG epa 1.4.0-ballot.1',
  zwischenueberschriften:
    'Render API: Einstellung der Zwischenüberschriften (eMP) · IG epa-medication 1.4.0-ballot.1',
  empFrueher: '$medication-plan zu früherem Chronologieeintrag · IG epa-medication 1.4.0-ballot.1',
  emlSeit: '$medication-list mit date · IG epa-medication 1.4.0-ballot.1',
  empNeu: '$add-emp-entry · IG epa-medication 1.4.0-ballot.1',
  empAendern: '$update-emp-entry · IG epa-medication 1.4.0-ballot.1',
  verknuepfen: '$link-emp · IG epa-medication 1.4.0-ballot.1',
  befugnis: 'setEntitlementPs · OpenAPI I_Entitlement_Management 1.8.0',
  dienst: '✦ Vorschlag Diagnose-Service · nicht spezifiziert',
  impfliste: '✦ Vorschlag Impfliste · nicht spezifiziert, Einträge nach immunization-eu-core',
  summary: '✦ Vorschlag Patient Summary · $summary nach IPS, Inhalt nach EPS 1.0.0-ballot',
  lotse: '✦ Vorschlag Aktenlotse · nicht spezifiziert, kein FHIR, regelbasiert',
  kontakt:
    '✦ Vorschlag Kontaktauskunft · Stellvertreter für den Verzeichnisdienst, nicht spezifiziert',
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

/**
 * Die Organisation der Praxis nach `TIOrganization`, wie sie `X-Requesting-Organization` trägt —
 * dieselbe Abbildung der Stammdaten wie im Arztbrief und im E-Rezept.
 */
export const ORGANISATION: Ressource = praxisNachFhir(PRAXIS_STAMMDATEN, PROFIL.organisation);

export function base64(text: string): string {
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
  methode?: 'GET' | 'POST' | 'PUT';
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
  /** Ein Körper, der kein JSON ist — SOAP oder eine Mail —, mit seinem Inhaltstyp. */
  roh?: { inhaltstyp: string; text: string };
  /**
   * Fehlercodes, die nur „nichts da“ heißen, etwa 404 `MSG_NO_MATCH` (1.4.0). Das Protokoll führt
   * sie nicht als Fehler; der Aufrufer fängt sie ab.
   */
  leerBei?: readonly string[];
}

export interface Antwort<T> {
  inhalt: T;
  kopf: Headers;
}

export function anfragekennung(): string {
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

export function anfragen<T>(anfrage: Anfrage): Promise<Antwort<T>> {
  if ((anfrage.methode ?? 'GET') !== 'GET') return senden<T>(anfrage);
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
  roh,
  leerBei = [],
}: Anfrage): Promise<Antwort<T>> {
  if (roh) return rohSenden<T>({ methode, pfad, kvnr, grundlage, zusatz, roh });
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
    // Alle Befunde eines OperationOutcome, nicht nur den ersten — eine Profilprüfung meldet oft
    // mehrere (422 `MEDSVC_NO_VALID_STRUCTURE`).
    const befunde = ((inhalt?.issue ?? []) as { diagnostics?: string }[])
      .map((i) => i.diagnostics)
      .filter((d): d is string => !!d);
    const text: string =
      (befunde.length > 0 ? befunde.join(' · ') : undefined) ??
      inhalt?.errorDetail ??
      `Die ePA antwortete mit ${antwort.status}.`;
    const diagnose = code ? `${code}: ${text}` : text;
    if (code && leerBei.includes(code)) notieren(antwort.status, `kein Treffer (${code})`, null);
    else notieren(antwort.status, diagnose.slice(0, 90), diagnose);
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

/**
 * Senden mit einem Körper, der kein JSON ist, und einer Antwort als Text: SOAP am XDS Document
 * Service, die Client-Mail am KIM-Clientmodul. Dieselben Kopfzeilen und dasselbe Protokoll wie
 * jeder andere Weg; Fehler der Prüfkette kommen wie überall als JSON-Fehlercode.
 */
async function rohSenden<T>({
  methode = 'POST',
  pfad,
  kvnr,
  grundlage,
  zusatz = {},
  roh,
}: Anfrage & { roh: { inhaltstyp: string; text: string } }): Promise<Antwort<T>> {
  const beginn = performance.now();
  const fachlich = pfad.startsWith('/epa/');
  const kopfzeilen: Record<string, string> = {
    'content-type': roh.inhaltstyp,
    ...(fachlich
      ? {
          accept: 'application/soap+xml',
          'x-useragent': USER_AGENT,
          'X-Request-ID': anfragekennung(),
          [SITZUNG_KOPFZEILE]: EINRICHTUNG.telematikId,
          ...(kvnr ? { 'x-insurantid': kvnr } : {}),
        }
      : {}),
    ...zusatz,
  };
  const notieren = (status: number | null, ergebnis: string, fehler: string | null) =>
    aufrufNotieren({
      methode,
      pfad,
      status,
      dauerMs: Math.round(performance.now() - beginn),
      ergebnis,
      fehler,
      grundlage,
      kopfzeilen,
      koerper: roh.text,
    });
  let antwort: Response;
  try {
    antwort = await abrufen(pfad, {
      method: methode,
      headers: kopfzeilen,
      cache: 'no-store',
      body: roh.text,
    });
  } catch (fehler) {
    const text = fehler instanceof Error ? fehler.message : 'Unbekannter Fehler';
    notieren(null, 'keine Antwort', text);
    throw new EpaFehler(0, `Keine Antwort (${text}).`);
  }
  const text = await antwort.text();
  if (!antwort.ok) {
    let code: string | null = null;
    let diagnose = text.slice(0, 200) || `Antwort ${antwort.status}.`;
    try {
      const json = JSON.parse(text) as { errorCode?: string; errorDetail?: string };
      code = json.errorCode ?? null;
      diagnose = code ? `${code}: ${json.errorDetail ?? ''}` : diagnose;
    } catch {
      /* Text, etwa ein SMTP-Statuscode */
    }
    notieren(antwort.status, diagnose.slice(0, 90), diagnose);
    const f = new EpaFehler(antwort.status, diagnose, code);
    if (f.ohneBefugnis && kvnr) befugnisFehlt(kvnr);
    throw f;
  }
  const kurz = text.includes('RegistryResponse')
    ? registryResponseLesen(text).erfolg
      ? 'RegistryResponse Success'
      : `RegistryResponse Failure: ${registryResponseLesen(text).fehler[0]?.code ?? ''}`
    : text.slice(0, 90);
  notieren(antwort.status, kurz, kurz.includes('Failure') ? kurz : null);
  return { inhalt: text as T, kopf: antwort.headers };
}

export interface Bundle {
  resourceType: 'Bundle';
  meta?: { lastUpdated?: string };
  type?: string;
  total?: number;
  timestamp?: string;
  entry?: { resource: Ressource; search?: { mode?: string } }[];
}

export function treffer(bundle: Bundle): Ressource[] {
  return (bundle.entry ?? []).filter((e) => e.search?.mode !== 'include').map((e) => e.resource);
}

export function eingeschlossen(bundle: Bundle): Ressource[] {
  return (bundle.entry ?? []).filter((e) => e.search?.mode === 'include').map((e) => e.resource);
}

/**
 * Zeitpunkt des Aktensystems aus einer Antwort — das Lesezeichen für eine spätere Abfrage
 * „seit" (ADR 0030). Nie die Uhr der Praxis: Sie kann abweichen.
 */
export function serverzeit(b: Bundle): string {
  return b.meta?.lastUpdated ?? b.timestamp ?? '';
}

export function parameterRessource(
  p: { parameter?: { name: string; resource?: Ressource }[] },
  name: string,
) {
  return p.parameter?.find((x) => x.name === name)?.resource;
}

/* ---------- MHD Service ---------- */

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

/** Zählt Umstellungen der Demo-Steuerung — Ansichten fragen danach neu. */
let betriebsstand = 0;
const betriebshoerer = new Set<() => void>();

export function betriebsstandErhoehen(): void {
  vergessen.forEach((f) => f());
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
  vergessen.forEach((f) => f());
  laufend.clear();
}

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
    JSON.stringify({ kvnr, kennung, zeitpunkt: demoJetzt().toISOString(), demo: 'ohne VSDM' }),
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
    koerper: { jwt: `${kopf}.${nutzlast}.${base64url('1-DEMO-OHNE-SIGNATUR')}` },
    grundlage: GRUNDLAGE.befugnis,
    inhaltstyp: 'application/json',
  });
  return inhalt;
}

/* ---------- ✦ Diagnose-Service (Vorschlag) ---------- */
