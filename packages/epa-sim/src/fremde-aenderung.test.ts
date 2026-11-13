import type { FastifyInstance } from 'fastify';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { simulatorBauen } from './anwendung.ts';
import { befugnisErteilen } from './befugnis.ts';

/** ✦ Eine andere Einrichtung beendet eine Dauerdiagnose der Diagnosenliste (ADR 0063). */

const PRAXIS = '1-DEMO-PRAXIS-STADTGARTEN';
const HOFFMANN = 'A123456780';
const DIENST = '/epa/vorschlag/diagnosis/api/v1/fhir';

let app: FastifyInstance;
beforeEach(async () => {
  await app?.close();
  app = await simulatorBauen();
  befugnisErteilen(HOFFMANN, PRAXIS, new Date(), 'eGK');
});
afterAll(async () => {
  await app?.close();
});

const aendern = () =>
  app.inject({ method: 'POST', url: '/verwaltung/fremde-aenderung', payload: { kvnr: HOFFMANN } });

describe('Fremde Änderung an einer Dauerdiagnose', () => {
  it('gibt es nur, wo es die Diagnosenliste gibt', async () => {
    expect((await aendern()).statusCode).toBe(409);
  });

  it('beendet einen Eintrag mit neuer Fassung', async () => {
    await app.inject({
      method: 'POST',
      url: '/verwaltung/betriebslage',
      payload: { ausbaustand: 'weiterentwicklung-3' },
    });
    const antwort = await aendern();
    expect(antwort.statusCode).toBe(200);
    const id = (antwort.json() as { geaendert: string }).geaendert.split('/')[1];
    const liste = await app.inject({
      method: 'GET',
      url: `${DIENST}/$condition-list`,
      headers: {
        'x-useragent': 'DEMOPVSFIKTIV0000001/0.4.0',
        'x-demo-sitzung': PRAXIS,
        'x-insurantid': HOFFMANN,
      },
    });
    const eintrag = (liste.json() as { entry: { resource: Record<string, unknown> }[] }).entry.find(
      (e) => e.resource['id'] === id,
    )!.resource;
    expect(JSON.stringify(eintrag['clinicalStatus'])).toContain('resolved');
    expect(eintrag['abatementDateTime']).toBeTruthy();
    expect((eintrag['meta'] as { versionId: string }).versionId).toBe('2');
  });
});
