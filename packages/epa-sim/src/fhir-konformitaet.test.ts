import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { fhirPruefen, type Pruefbefund, type Ressource } from '@demo-pvs/kern';
import { simulatorBauen } from './anwendung.ts';
import { befugnisErteilen } from './befugnis.ts';

/**
 * Was der Simulator ausliefert, verletzt keine Pflichtangabe und keine Invariante, die
 * `fhirPruefen` kennt — gemessen an den HTTP-Antworten, nicht am internen Bestand: Dort führt
 * er Zeitpunkte ohne Zone, die Antworten tragen sie (zeit.ts im Kern).
 */

const PRAXIS = 'DEMO-PRAXIS-STADTGARTEN';
const AKTEN = ['A123456780', 'M555123402'];
const WEGE = [
  '/epa/mhd/api/v1/fhir/DocumentReference?status=current',
  '/epa/medication/api/v1/fhir/$medication-plan',
  '/epa/medication/api/v1/fhir/$medication-list',
  '/epa/vorschlag/diagnosis/api/v1/fhir/$condition-list',
  '/epa/vorschlag/diagnosis/api/v1/fhir/$allergy-list',
  '/epa/vorschlag/immunization/api/v1/fhir/$immunization-list',
  '/epa/vorschlag/patient-summary/api/v1/fhir/Patient/$summary',
];

let app: FastifyInstance;
const kopf = (kvnr: string) => ({
  'x-useragent': 'DEMOPVSFIKTIV0000001/0.4.0',
  'x-demo-sitzung': PRAXIS,
  'x-insurantid': kvnr,
});

beforeAll(async () => {
  app = await simulatorBauen();
  await app.inject({
    method: 'POST',
    url: '/verwaltung/betriebslage',
    payload: { ausbaustand: 'weiterentwicklung-4' },
  });
  for (const kvnr of AKTEN) {
    befugnisErteilen(kvnr, PRAXIS, new Date(), 'eGK');
    // Mit den Einträgen einer anderen Einrichtung: Kontrollbefund, Planänderung, Listeneintrag.
    await app.inject({ method: 'POST', url: '/verwaltung/fremde-eintraege', payload: { kvnr } });
  }
});

afterAll(async () => {
  await app?.close();
});

async function antwort(kvnr: string, url: string): Promise<Ressource> {
  const a = await app.inject({ method: 'GET', url, headers: kopf(kvnr) });
  expect(a.statusCode, url).toBe(200);
  return a.json() as Ressource;
}

const nurFehler = (b: Pruefbefund[]) => b.filter((x) => x.schwere === 'fehler');

describe('FHIR-Antworten des Simulators', () => {
  for (const kvnr of AKTEN) {
    for (const url of WEGE) {
      it(`${kvnr} ${url.split('/').pop()}`, async () => {
        expect(nurFehler(fhirPruefen(await antwort(kvnr, url)))).toEqual([]);
      });
    }

    it(`${kvnr}: jedes strukturierte Dokument (ITI-68)`, async () => {
      const suche = await antwort(kvnr, WEGE[0]!);
      const verweise = ((suche['entry'] as { resource: Ressource }[] | undefined) ?? [])
        .map((e) => e.resource)
        .filter((r) =>
          ((r['content'] as { attachment: { contentType: string } }[]) ?? []).some((c) =>
            c.attachment.contentType.startsWith('application/fhir+json'),
          ),
        );
      expect(verweise.length).toBeGreaterThan(0);
      for (const r of verweise) {
        const pfad = (r['content'] as { attachment: { url: string } }[])[0]!.attachment.url;
        const a = await app.inject({ method: 'GET', url: pfad, headers: kopf(kvnr) });
        expect(
          nurFehler(fhirPruefen(JSON.parse(a.body) as Ressource)),
          String(r['description']),
        ).toEqual([]);
      }
    });
  }
});
