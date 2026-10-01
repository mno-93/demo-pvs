import type { FastifyInstance } from 'fastify';
import { demoJetzt } from '@demo-pvs/kern';
import { base64ZuText } from './plattform.ts';
import { bestandVorhanden } from './bestand.ts';

/**
 * Befugnismanagement nach dem Konzept 3.1.3 (`ePA-Basic`, `entitlement_management.adoc`)
 * und der OpenAPI `I_Entitlement_Management.yaml` 1.8.0.
 *
 * Belegt und nachgebildet:
 * - Wird die eGK in der Einrichtung gesteckt, erzeugt das Primärsystem eine Befugnis und
 *   registriert sie (`setEntitlementPs`). Nachweis der Anwesenheit ist der Prüfungsnachweis
 *   aus VSDM „ReadVSD", signiert mit der SMC-B.
 * - Dauer: **90 Tage** für Leistungserbringerinstitutionen, **3 Tage** für Apotheken, ÖGD
 *   sowie Arbeits- und Betriebsmedizin. Das Ende rechnet die OpenAPI als
 *   `validTo = currentDate + default validity − 1`, Tagesende in deutscher Zeit.
 * - Eine bestehende Befugnis mit späterem Ende bleibt erhalten; sonst ersetzt die neue sie.
 * - Ein Prüfungsnachweis ist nur einmal verwendbar (403 `tokenReuse`).
 * - Ohne gültige Befugnis antwortet jeder Fachdienst mit **403 `notEntitled`**
 *   (OpenAPI Medication Service: „Operations mandating a valid entitlement …").
 *
 * Nicht nachgebildet: VSDM und Konnektor, die Signaturprüfung im HSM, `hcv`, PoPP
 * (`setEntitlementPsV2`, künftig der einzige Weg), Befugnisse durch die versicherte Person,
 * Vertretungen, Blockliste, Mengenbegrenzung je Stunde und Monat.
 */

export const BEFUGNIS_WEG = '/epa/basic/api/v1/ps/entitlements';

export interface Befugnis {
  telematikId: string;
  anzeige: string;
  /** Ende der Befugnis (ISO-Zeitpunkt mit Zeitzone). */
  gueltigBis: string;
  erteiltAm: string;
  weg: 'eGK' | 'Startbestand';
}

/**
 * Bekannte Einrichtungen der Demo mit ihrer Befugnisdauer. Im Wirkbetrieb stehen Name und
 * Rolle im ID-Token der Sitzung; die Demo hat keine Anmeldung und schlägt hier nach.
 */
export const EINRICHTUNGEN: Record<string, { anzeige: string; rolle: string; tage: number }> = {
  'DEMO-PRAXIS-STADTGARTEN': {
    anzeige: 'Hausarztpraxis am Stadtgarten',
    rolle: 'Arztpraxis',
    tage: 90,
  },
  'DEMO-KLINIKUM-SONNENSCHEIN': {
    anzeige: 'Klinikum Sonnenschein',
    rolle: 'Krankenhaus',
    tage: 90,
  },
  'DEMO-APOTHEKE-STADTGARTEN': { anzeige: 'Stadtgarten-Apotheke', rolle: 'Apotheke', tage: 3 },
};

const befugnisse = new Map<string, Map<string, Befugnis>>();
const verbrauchteNachweise = new Set<string>();

/** Zeitpunkt mit Zeitzonenangabe, ohne Millisekunden (RFC 3339, wie `ValidToResponseType`). */
export function mitZone(d: Date): string {
  const z = (n: number) => String(n).padStart(2, '0');
  const versatz = -d.getTimezoneOffset();
  const vorzeichen = versatz >= 0 ? '+' : '-';
  const stunden = z(Math.floor(Math.abs(versatz) / 60));
  const minuten = z(Math.abs(versatz) % 60);
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}T${z(d.getHours())}:${z(d.getMinutes())}:${z(d.getSeconds())}${vorzeichen}${stunden}:${minuten}`;
}

const BERLIN = 'Europe/Berlin';

/**
 * Ende einer Befugnis nach OpenAPI `I_Entitlement_Management` 1.8.0: Kalendertag des Erteilens
 * plus Dauer minus eins, 23:59:59 in deutscher Zeit — etwa „2025-01-03T23:59:59+01:00" für
 * eine Apotheke, die am 01.01.2025 befugt wird.
 */
export function befugnisende(ab: Date, tage: number): string {
  const teile = new Intl.DateTimeFormat('en-CA', {
    timeZone: BERLIN,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(ab);
  const wert = (typ: string) => Number(teile.find((t) => t.type === typ)?.value);
  const tag = new Date(Date.UTC(wert('year'), wert('month') - 1, wert('day') + tage - 1, 12));
  const datum = tag.toISOString().slice(0, 10);
  // Versatz der deutschen Zeit an diesem Tag: MEZ +01:00 oder MESZ +02:00.
  const versatz =
    new Intl.DateTimeFormat('en-US', { timeZone: BERLIN, timeZoneName: 'shortOffset' })
      .formatToParts(tag)
      .find((t) => t.type === 'timeZoneName')?.value ?? 'GMT+1';
  const stunden = Number(versatz.replace('GMT', '') || '0');
  const zeichen = stunden >= 0 ? '+' : '-';
  return `${datum}T23:59:59${zeichen}${String(Math.abs(stunden)).padStart(2, '0')}:00`;
}

function aktenbefugnisse(kvnr: string): Map<string, Befugnis> {
  let m = befugnisse.get(kvnr);
  if (!m) {
    m = new Map();
    befugnisse.set(kvnr, m);
  }
  return m;
}

/** Erteilt eine Befugnis ab einem Zeitpunkt; eine vorhandene mit späterem Ende bleibt. */
export function befugnisErteilen(
  kvnr: string,
  telematikId: string,
  ab: Date,
  weg: Befugnis['weg'],
): Befugnis {
  const einrichtung = EINRICHTUNGEN[telematikId];
  const neu: Befugnis = {
    telematikId,
    anzeige: einrichtung?.anzeige ?? telematikId,
    gueltigBis: befugnisende(ab, einrichtung?.tage ?? 90),
    erteiltAm: mitZone(ab),
    weg,
  };
  const liste = aktenbefugnisse(kvnr);
  const alt = liste.get(telematikId);
  if (alt && new Date(alt.gueltigBis) >= new Date(neu.gueltigBis)) return alt;
  liste.set(telematikId, neu);
  return neu;
}

export function gueltigeBefugnis(kvnr: string, telematikId: string): Befugnis | null {
  const b = befugnisse.get(kvnr)?.get(telematikId);
  if (!b) return null;
  // Abgelaufene Befugnisse löscht das Entitlement Management regelmäßig (Konzept 3.1.3).
  if (new Date(b.gueltigBis) < demoJetzt()) {
    befugnisse.get(kvnr)?.delete(telematikId);
    return null;
  }
  return b;
}

export function alleBefugnisse(): { kvnr: string; befugnisse: Befugnis[] }[] {
  return [...befugnisse].map(([kvnr, m]) => ({ kvnr, befugnisse: [...m.values()] }));
}

/** Demo-Steuerung: entzieht einer Einrichtung alle Befugnisse — wie nach Ablauf der 90 Tage. */
export function befugnisseEntziehen(telematikId: string): number {
  let zahl = 0;
  for (const m of befugnisse.values()) if (m.delete(telematikId)) zahl++;
  return zahl;
}

export function befugnisseLeeren(): void {
  befugnisse.clear();
  verbrauchteNachweise.clear();
}

function fehler(errorCode: string, errorDetail: string) {
  return { errorCode, errorDetail };
}

function base64urlJson(teil: string): Record<string, unknown> | null {
  try {
    return JSON.parse(base64ZuText(teil));
  } catch {
    return null;
  }
}

/**
 * `setEntitlementPs`: Befugnis mit Prüfungsnachweis.
 *
 * Das JWT des Primärsystems trägt im Payload `auditEvidence` — die Prüfziffer des
 * VSDM-Prüfungsnachweises, base64-kodiert. In der Demo ist sie ein kleines JSON mit der
 * Versichertennummer und einer Kennung, weil es kein VSDM gibt; die HSM-Prüfung, die im
 * Wirkbetrieb die Versichertennummer aus dem Nachweis gegen `x-insurantid` hält, ist damit
 * nachgestellt. ⚠ Signatur und `hcv` werden nicht geprüft.
 */
export function befugnisEinhaengen(
  app: FastifyInstance,
  kvnrAus: (anfrage: { headers: Record<string, unknown> }) => string,
  sitzungAus: (anfrage: { headers: Record<string, unknown> }) => string,
) {
  app.post(BEFUGNIS_WEG, async (anfrage, antwort) => {
    const kvnr = kvnrAus(anfrage);
    const telematikId = sitzungAus(anfrage);
    const jwt = (anfrage.body as { jwt?: unknown } | undefined)?.jwt;
    if (typeof jwt !== 'string' || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(jwt)) {
      return antwort
        .code(400)
        .send(fehler('malformedRequest', 'Das Feld jwt fehlt oder ist kein JWT.'));
    }
    if (!bestandVorhanden(kvnr)) {
      return antwort.code(404).send(fehler('noHealthRecord', `Für ${kvnr} besteht keine Akte.`));
    }
    const nutzlast = base64urlJson(jwt.split('.')[1] ?? '');
    const nachweisRoh =
      typeof nutzlast?.['auditEvidence'] === 'string' ? nutzlast['auditEvidence'] : '';
    let nachweis: { kvnr?: string; kennung?: string } | null = null;
    try {
      nachweis = JSON.parse(base64ZuText(nachweisRoh));
    } catch {
      nachweis = null;
    }
    if (!nachweis?.kennung || !nachweis.kvnr) {
      return antwort
        .code(403)
        .send(fehler('invalidToken', 'Der Prüfungsnachweis ist nicht lesbar.'));
    }
    if (nachweis.kvnr !== kvnr) {
      // Im Wirkbetrieb prüft das HSM (Regel rr3) die KVNR aus dem Nachweis gegen x-insurantid.
      return antwort
        .code(403)
        .send(
          fehler(
            'invalidToken',
            'Der Prüfungsnachweis gehört zu einer anderen Akte als x-insurantid.',
          ),
        );
    }
    if (verbrauchteNachweise.has(nachweis.kennung)) {
      return antwort
        .code(403)
        .send(fehler('tokenReuse', 'Der Prüfungsnachweis wurde bereits verwendet.'));
    }
    verbrauchteNachweise.add(nachweis.kennung);
    const befugnis = befugnisErteilen(kvnr, telematikId, demoJetzt(), 'eGK');
    return antwort.code(201).send({ validTo: befugnis.gueltigBis });
  });
}
