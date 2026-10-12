import type { FastifyInstance } from 'fastify';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import {
  ADRESSBUCH,
  ARZTBRIEF_XDS,
  ITI41_INHALTSTYP,
  KIM_DIENSTKENNUNG,
  KIM_PRAXIS,
  XDS_DOKUMENTENDIENST,
  kimNachrichtErzeugen,
  provideAndRegisterErzeugen,
  registryResponseLesen,
  type XdsEinreichung,
} from '@demo-pvs/kern';
import { simulatorBauen } from './anwendung.ts';
import { befugnisErteilen } from './befugnis.ts';
import { KIM_POSTAUSGANG, KIM_WEG } from './kim.ts';

/**
 * Einstellen über ITI-41 und Versand über den Demo-Ersatz des KIM-Clientmoduls — von außen, über
 * `inject`.
 */

const PRAXIS = 'DEMO-PRAXIS-STADTGARTEN';
const HOFFMANN = 'A123456780';
const ENTRY = '6a1f0c3e-1111-4222-8333-444455556666';

const BRIEF = {
  resourceType: 'Bundle',
  type: 'document',
  entry: [
    {
      fullUrl: 'urn:uuid:c',
      resource: {
        resourceType: 'Composition',
        title: 'Arztbrief',
        date: '2026-09-09T11:00:00',
        author: [{ display: 'Dr. med. Anna Brandt' }],
        section: [
          {
            title: 'Beurteilung',
            text: {
              div: '<div xmlns="http://www.w3.org/1999/xhtml"><p>Zungenbrennen seit Ostern abklären.</p></div>',
            },
          },
        ],
      },
    },
  ],
};

function einreichung(
  teil: Partial<XdsEinreichung['dokumente'][number]> = {},
  kvnr = HOFFMANN,
): string {
  return provideAndRegisterErzeugen(
    {
      kvnr,
      uniqueId: '2.25.10',
      quelle: '2.25.11',
      zeitpunkt: '2026-09-09T11:00:00Z',
      autor: {
        person: 'Dr. med. Anna Brandt',
        einrichtung: 'Hausarztpraxis am Stadtgarten',
        telematikId: PRAXIS,
      },
      dokumente: [
        {
          entryUuid: ENTRY,
          uniqueId: '2.25.12',
          titel: 'Arztbrief an Kardiologische Praxis am Wall',
          mimeType: 'application/fhir+json',
          erstellt: '2026-09-09T11:00:00Z',
          ...ARZTBRIEF_XDS,
          inhaltBase64: Buffer.from(JSON.stringify(BRIEF)).toString('base64'),
          ...teil,
        },
      ],
    },
    'nachricht-1',
  );
}

const kopf = {
  'x-useragent': 'DEMOPVSFIKTIV0000001/0.4.0',
  'x-demo-sitzung': PRAXIS,
  'x-insurantid': HOFFMANN,
  'content-type': ITI41_INHALTSTYP,
};

let app: FastifyInstance;

async function stufe(ausbaustand: string) {
  await app.inject({ method: 'POST', url: '/verwaltung/betriebslage', payload: { ausbaustand } });
}

beforeEach(async () => {
  await app?.close();
  app = await simulatorBauen();
  befugnisErteilen(HOFFMANN, PRAXIS, new Date(), 'eGK');
  await stufe('weiterentwicklung-3');
});

afterAll(async () => {
  await app?.close();
});

describe('ITI-41 am XDS Document Service', () => {
  it('stellt den strukturierten Brief ein; der MHD Service findet ihn unter der vergebenen entryUUID', async () => {
    const antwort = await app.inject({
      method: 'POST',
      url: XDS_DOKUMENTENDIENST,
      headers: kopf,
      payload: einreichung(),
    });
    expect(antwort.statusCode).toBe(200);
    expect(antwort.headers['content-type']).toContain('application/soap+xml');
    expect(registryResponseLesen(antwort.body).erfolg).toBe(true);

    const gefunden = await app.inject({
      method: 'GET',
      url: `/epa/mhd/api/v1/fhir/DocumentReference/${ENTRY}`,
      headers: { ...kopf, 'content-type': 'application/fhir+json' },
    });
    expect(gefunden.statusCode).toBe(200);
    const ref = gefunden.json();
    expect(ref.description).toBe('Arztbrief an Kardiologische Praxis am Wall');
    expect(ref.author[1].display).toBe('Hausarztpraxis am Stadtgarten');
    expect(ref.masterIdentifier.value).toBe('urn:oid:2.25.12');

    // Die Volltextsuche findet den Inhalt, nicht nur den Titel.
    const suche = await app.inject({
      method: 'GET',
      url: '/epa/mhd/api/v1/fhir/DocumentReference?_content=Zungenbrennen',
      headers: kopf,
    });
    expect(suche.json().total).toBe(1);
  });

  it('lehnt eine fremde Patientenkennung ab', async () => {
    const antwort = await app.inject({
      method: 'POST',
      url: XDS_DOKUMENTENDIENST,
      headers: kopf,
      payload: einreichung({}, 'K876543217'),
    });
    const r = registryResponseLesen(antwort.body);
    expect(r.erfolg).toBe(false);
    expect(r.fehler[0]!.code).toBe('XDSPatientIdDoesNotMatch');
  });

  it('nimmt den CDA-eArztbrief nicht mehr an — seit 01.04.2026 nur lesbar', async () => {
    const antwort = await app.inject({
      method: 'POST',
      url: XDS_DOKUMENTENDIENST,
      headers: kopf,
      payload: einreichung({
        mimeType: 'application/xml',
        formatCode: {
          code: 'urn:gematik:ig:Arztbrief:r3.1',
          system: '1.3.6.1.4.1.19376.3.276.1.5.6',
          anzeige: 'Arztbrief',
        },
      }),
    });
    expect(registryResponseLesen(antwort.body).fehler[0]!.text).toMatch(
      /seit 01\.04\.2026 nur noch lesbar \(ig-eab\.json/,
    );
  });

  it('kennt den ✦ formatCode erst ab „Weiterentwicklung 2"', async () => {
    await stufe('release-3.1.3');
    const antwort = await app.inject({
      method: 'POST',
      url: XDS_DOKUMENTENDIENST,
      headers: kopf,
      payload: einreichung(),
    });
    expect(registryResponseLesen(antwort.body).fehler[0]!.code).toBe('XDSRegistryMetadataError');
  });

  it('weist dieselbe uniqueId ein zweites Mal ab', async () => {
    await app.inject({
      method: 'POST',
      url: XDS_DOKUMENTENDIENST,
      headers: kopf,
      payload: einreichung(),
    });
    const zweite = await app.inject({
      method: 'POST',
      url: XDS_DOKUMENTENDIENST,
      headers: kopf,
      payload: einreichung(),
    });
    expect(registryResponseLesen(zweite.body).fehler[0]!.text).toMatch(/bereits vergeben/);
  });

  it('verlangt eine Befugnis wie jeder ePA-Weg', async () => {
    const antwort = await app.inject({
      method: 'POST',
      url: XDS_DOKUMENTENDIENST,
      headers: { ...kopf, 'x-demo-sitzung': 'DEMO-ANDERE-PRAXIS' },
      payload: einreichung(),
    });
    expect(antwort.statusCode).toBe(403);
  });
});

describe('Demo-Ersatz des KIM-Clientmoduls', () => {
  const mail = (an: string, von = KIM_PRAXIS) =>
    kimNachrichtErzeugen({
      von,
      an: [an],
      betreff: 'Arztbrief',
      datum: '2026-09-09T11:00:00Z',
      nachrichtId: 'm1@demo',
      dienstkennung: KIM_DIENSTKENNUNG.arztbrief,
      sendersystem: 'Demo-PVS;V0.4.0',
      text: 'Anbei.',
      anhaenge: [{ dateiname: 'arztbrief.pdf', mimeType: 'application/pdf', base64: 'JVBERi0=' }],
    });

  it('nimmt eine Client-Mail an eine Adresse aus dem Verzeichnis an und legt sie in den Postausgang', async () => {
    const an = ADRESSBUCH.find((e) => e.kim)!.kim!;
    const antwort = await app.inject({
      method: 'POST',
      url: KIM_WEG,
      headers: { 'content-type': 'message/rfc822' },
      payload: mail(an),
    });
    expect(antwort.statusCode).toBe(200);
    expect(antwort.body).toMatch(/^250 /);
    const ausgang = (await app.inject({ method: 'GET', url: KIM_POSTAUSGANG })).json();
    expect(ausgang[0].dienstkennung).toBe('Arztbrief;VHitG-Versand;V1.2');
    expect(ausgang[0].an).toEqual([an]);
  });

  it('weist eine unbekannte Empfangsadresse mit 550 ab', async () => {
    const antwort = await app.inject({
      method: 'POST',
      url: KIM_WEG,
      headers: { 'content-type': 'message/rfc822' },
      payload: mail('niemand@demo-anbieter.kim.telematik'),
    });
    expect(antwort.body).toMatch(/^550 /);
  });

  it('weist einen fremden Absender ab', async () => {
    const antwort = await app.inject({
      method: 'POST',
      url: KIM_WEG,
      headers: { 'content-type': 'message/rfc822' },
      payload: mail(ADRESSBUCH[0]!.kim!, 'jemand@demo-anbieter.kim.telematik'),
    });
    expect(antwort.body).toMatch(/^553 /);
  });
});
