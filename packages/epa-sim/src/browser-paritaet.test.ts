import type { FastifyInstance } from 'fastify';
import { afterAll, describe, expect, it } from 'vitest';
import { simulatorBauen } from './anwendung.ts';
import { simulatorImBrowser } from './browser.ts';

/**
 * Differenztest (ADR 0050): Dieselbe Folge von Anfragen geht einmal an den Fastify-Server
 * (`inject`) und einmal an den Browser-Adapter der gehosteten Demo. Status, Inhaltstyp, die
 * Kopfzeile X-Request-ID und der Körper müssen gleich sein — bis auf Kennungen und Zeitpunkte,
 * die jede Seite neu vergibt. So fällt auf, wenn der Adapter hinter dem Server zurückbleibt, etwa
 * bei einer Fastify-Methode, die er nicht kennt, beim Lesen von Körpern oder bei Fehlern.
 */

const PRAXIS = '1-DEMO-PRAXIS-STADTGARTEN';
const HOFFMANN = 'A123456780';
const MEDIKATION = '/epa/medication/api/v1/fhir';

const ORGANISATION = {
  resourceType: 'Organization',
  meta: { profile: ['https://gematik.de/fhir/ti/StructureDefinition/ti-organization'] },
  identifier: [{ system: 'https://gematik.de/fhir/sid/telematik-id', value: PRAXIS }],
  name: 'Hausarztpraxis am Stadtgarten',
};

const base64 = (x: unknown) => Buffer.from(JSON.stringify(x)).toString('base64');
const base64url = (x: unknown) => Buffer.from(JSON.stringify(x)).toString('base64url');

const KOPF = {
  'x-useragent': 'DEMOPVSFIKTIV0000001/0.4.0',
  'x-demo-sitzung': PRAXIS,
  'x-insurantid': HOFFMANN,
  'X-Requesting-Organization': base64(ORGANISATION),
};

interface Schritt {
  name: string;
  methode?: string;
  pfad: string | ((bisher: Ergebnis[]) => string);
  kopf?: Record<string, string>;
  koerper?: string;
}

interface Ergebnis {
  status: number;
  inhaltstyp: string;
  anfragekennung: string | null;
  koerper: unknown;
}

const JWT = [
  base64url({ alg: 'ES256' }),
  base64url({ auditEvidence: base64({ kvnr: HOFFMANN, kennung: 'paritaet-1' }) }),
  'c2lnbmF0dXI',
].join('.');

const SCHRITTE: Schritt[] = [
  { name: 'Aktenstatus', pfad: '/information/api/v1/ehr', kopf: KOPF },
  { name: 'Widersprüche', pfad: '/information/api/v1/ehr/consentdecisions', kopf: KOPF },
  { name: 'ohne Befugnis', pfad: `${MEDIKATION}/$medication-list`, kopf: KOPF },
  {
    name: 'Befugnis',
    methode: 'POST',
    pfad: '/epa/basic/api/v1/ps/entitlements',
    kopf: { ...KOPF, 'content-type': 'application/json' },
    koerper: JSON.stringify({ jwt: JWT }),
  },
  {
    name: 'Medikationsliste mit X-Request-ID',
    pfad: `${MEDIKATION}/$medication-list`,
    kopf: { ...KOPF, 'X-Request-ID': '11111111-2222-4333-8444-555555555555' },
  },
  { name: 'Render API lesen', pfad: '/epa/medication/render/v1/emp/settings', kopf: KOPF },
  {
    name: 'Render API als JSON setzen',
    methode: 'PUT',
    pfad: '/epa/medication/render/v1/emp/settings',
    kopf: { ...KOPF, 'content-type': 'application/json' },
    koerper: JSON.stringify({ subheadings: false }),
  },
  {
    name: 'Render API als XML setzen',
    methode: 'PUT',
    pfad: '/epa/medication/render/v1/emp/settings',
    kopf: { ...KOPF, 'content-type': 'application/xml', accept: 'application/xml' },
    koerper: '<settings><subheadings>true</subheadings></settings>',
  },
  {
    name: 'unlesbarer JSON-Körper',
    methode: 'POST',
    pfad: `${MEDIKATION}/$add-emp-entry`,
    kopf: { ...KOPF, 'content-type': 'application/fhir+json' },
    koerper: '{kein json',
  },
  {
    name: 'leerer JSON-Körper',
    methode: 'POST',
    pfad: `${MEDIKATION}/$add-emp-entry`,
    kopf: { ...KOPF, 'content-type': 'application/fhir+json' },
    koerper: '',
  },
  {
    name: 'nicht unterstützter Inhaltstyp',
    methode: 'POST',
    pfad: `${MEDIKATION}/$add-emp-entry`,
    kopf: { ...KOPF, 'content-type': 'text/csv' },
    koerper: 'a;b',
  },
  {
    name: 'Dokumentsuche',
    pfad: '/epa/mhd/api/v1/fhir/DocumentReference?status=current',
    kopf: KOPF,
  },
  {
    name: 'Dokument abrufen',
    pfad: (bisher) => {
      const suche = bisher[bisher.length - 1]!.koerper as {
        entry: { resource: { content: { attachment: { url: string } }[] } }[];
      };
      return suche.entry[0]!.resource.content[0]!.attachment.url;
    },
    kopf: KOPF,
  },
  { name: 'unbekannter Weg der ePA', pfad: '/epa/gibt-es-nicht', kopf: KOPF },
  { name: 'unbekannter Weg der Steuerung', methode: 'POST', pfad: '/verwaltung/gibt-es-nicht' },
  {
    name: 'Widerspruch setzen',
    methode: 'POST',
    pfad: '/verwaltung/akte',
    kopf: { 'content-type': 'application/json' },
    koerper: JSON.stringify({ kvnr: HOFFMANN, medication: 'deny' }),
  },
  { name: 'Plan bei Widerspruch', pfad: `${MEDIKATION}/$medication-plan`, kopf: KOPF },
];

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const ZEIT = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})?/g;
const KENNUNG = /\b[a-z]+(?:-[a-z]+)*-[0-9a-z]{6,10}-\d+\b/g;

/** Kennungen und Zeitpunkte vergibt jede Seite selbst; alles andere muss gleich sein. */
function ohneVergebenes(wert: unknown): unknown {
  if (typeof wert === 'string')
    return wert.replace(UUID, '<uuid>').replace(ZEIT, '<zeit>').replace(KENNUNG, '<kennung>');
  if (Array.isArray(wert)) return wert.map(ohneVergebenes);
  if (wert && typeof wert === 'object')
    return Object.fromEntries(Object.entries(wert).map(([k, v]) => [k, ohneVergebenes(v)]));
  return wert;
}

function lesen(text: string, inhaltstyp: string): unknown {
  if (/json/.test(inhaltstyp) && text) return JSON.parse(text);
  if (/pdf/.test(inhaltstyp)) return `${text.length} Byte`;
  return text;
}

async function mitServer(app: FastifyInstance): Promise<Ergebnis[]> {
  const ergebnisse: Ergebnis[] = [];
  for (const s of SCHRITTE) {
    const r = await app.inject({
      method: (s.methode ?? 'GET') as 'GET',
      url: typeof s.pfad === 'string' ? s.pfad : s.pfad(ergebnisse),
      headers: s.kopf ?? {},
      ...(s.koerper !== undefined ? { payload: s.koerper } : {}),
    });
    const inhaltstyp = String(r.headers['content-type'] ?? '').replace(/\s/g, '');
    ergebnisse.push({
      status: r.statusCode,
      inhaltstyp,
      anfragekennung: (r.headers['x-request-id'] as string | undefined) ?? null,
      koerper: lesen(r.body, inhaltstyp),
    });
  }
  return ergebnisse;
}

async function imBrowser(): Promise<Ergebnis[]> {
  const sim = simulatorImBrowser();
  const ergebnisse: Ergebnis[] = [];
  for (const s of SCHRITTE) {
    const pfad = typeof s.pfad === 'string' ? s.pfad : s.pfad(ergebnisse);
    const r = await sim.abrufen(
      new Request(`http://simulator.local${pfad}`, {
        method: s.methode ?? 'GET',
        headers: s.kopf ?? {},
        ...(s.koerper !== undefined ? { body: s.koerper } : {}),
      }),
    );
    const inhaltstyp = (r.headers.get('content-type') ?? '').replace(/\s/g, '');
    ergebnisse.push({
      status: r.status,
      inhaltstyp,
      anfragekennung: r.headers.get('x-request-id'),
      koerper: lesen(await r.text(), inhaltstyp),
    });
  }
  return ergebnisse;
}

let server: FastifyInstance | undefined;
afterAll(async () => {
  await server?.close();
});

describe('Simulator im Browser gleich dem Server', () => {
  it('antwortet auf dieselbe Folge von Anfragen gleich', async () => {
    server = await simulatorBauen();
    const vomServer = await mitServer(server);
    await server.close();
    server = undefined;
    const vomBrowser = await imBrowser();

    SCHRITTE.forEach((s, i) => {
      const a = vomServer[i]!;
      const b = vomBrowser[i]!;
      expect({ schritt: s.name, status: b.status }).toEqual({ schritt: s.name, status: a.status });
      expect({ schritt: s.name, inhaltstyp: b.inhaltstyp }).toEqual({
        schritt: s.name,
        inhaltstyp: a.inhaltstyp,
      });
      expect({ schritt: s.name, kennung: b.anfragekennung }).toEqual({
        schritt: s.name,
        kennung: a.anfragekennung,
      });
      expect({ schritt: s.name, koerper: ohneVergebenes(b.koerper) }).toEqual({
        schritt: s.name,
        koerper: ohneVergebenes(a.koerper),
      });
    });

    // Die Folge deckt die Fälle ab, an denen der Adapter früher abwich.
    const status = Object.fromEntries(SCHRITTE.map((s, i) => [s.name, vomServer[i]!.status]));
    expect(status).toMatchObject({
      'Render API lesen': 200,
      'Render API als XML setzen': 200,
      'unlesbarer JSON-Körper': 400,
      'nicht unterstützter Inhaltstyp': 415,
      'Plan bei Widerspruch': 423,
    });
  });
});
