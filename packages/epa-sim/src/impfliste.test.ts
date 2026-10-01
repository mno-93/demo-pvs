import type { FastifyInstance } from 'fastify';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { simulatorBauen } from './anwendung.ts';
import { befugnisErteilen } from './befugnis.ts';

/** ✦ Impfliste (ADR 0026): Mechanik wie Diagnose-Service, Einträge nach immunization-eu-core. */

const PRAXIS = 'DEMO-PRAXIS-STADTGARTEN';
const HOFFMANN = 'A123456780';
const B = '/epa/vorschlag/immunization/api/v1/fhir';
const ORG = Buffer.from(
  JSON.stringify({
    resourceType: 'Organization',
    meta: { profile: ['https://gematik.de/fhir/ti/StructureDefinition/ti-organization'] },
    identifier: [{ system: 'https://gematik.de/fhir/sid/telematik-id', value: PRAXIS }],
    name: 'Hausarztpraxis am Stadtgarten',
  }),
).toString('base64');

function kopf(): Record<string, string> {
  return {
    'x-useragent': 'DEMOPVSFIKTIV0000001/0.4.0',
    'x-demo-sitzung': PRAXIS,
    'x-insurantid': HOFFMANN,
    'X-Requesting-Organization': ORG,
    'content-type': 'application/fhir+json',
  };
}

let app: FastifyInstance;
beforeEach(async () => {
  await app?.close();
  app = await simulatorBauen();
  befugnisErteilen(HOFFMANN, PRAXIS, new Date(), 'eGK');
});
afterAll(async () => {
  await app?.close();
});

async function liste() {
  const a = await app.inject({ method: 'GET', url: `${B}/$immunization-list`, headers: kopf() });
  expect(a.statusCode).toBe(200);
  const eintraege = a.json().entry as {
    resource: Record<string, unknown>;
    search: { mode: string };
  }[];
  const chronologie = eintraege.find(
    (e) =>
      e.resource['resourceType'] === 'Provenance' &&
      JSON.stringify(e.resource['extension'] ?? '').includes('is-immunization-list-chronology'),
  );
  return {
    impfungen: eintraege.filter((e) => e.search.mode === 'match').map((e) => e.resource),
    lesenachweis: String(chronologie?.resource['id']),
  };
}

function impfung(datum: string) {
  return {
    resourceType: 'Immunization',
    status: 'completed',
    vaccineCode: {
      coding: [{ system: 'http://fhir.de/CodeSystem/bfarm/atc', version: '2026', code: 'J07BB02' }],
      text: 'Influenza-Impfstoff',
    },
    occurrenceDateTime: datum,
    protocolApplied: [
      {
        targetDisease: [
          {
            coding: [
              {
                system: 'http://snomed.info/sct',
                version: 'http://snomed.info/sct/11000274103/version/20260515',
                code: '6142004',
              },
            ],
          },
        ],
      },
    ],
  };
}

describe('✦ Impfliste', () => {
  it('liefert die Impfungen des Startbestands mit Chronologieeintrag', async () => {
    const { impfungen, lesenachweis } = await liste();
    expect(impfungen).toHaveLength(5);
    expect(lesenachweis).toMatch(/^chron-/);
  });

  it('legt mit Lesenachweis an und lehnt einen veralteten ab', async () => {
    const { lesenachweis } = await liste();
    const anlegen = (nachweis: string) =>
      app.inject({
        method: 'POST',
        url: `${B}/$add-immunization-entry`,
        headers: kopf(),
        payload: {
          resourceType: 'Parameters',
          parameter: [
            { name: 'acknowledgedChronologyId', valueId: nachweis },
            { name: 'immunizationEntry', resource: impfung('2026-09-09') },
          ],
        },
      });
    const erst = await anlegen(lesenachweis);
    expect(erst.statusCode).toBe(200);
    expect((await liste()).impfungen).toHaveLength(6);
    const veraltet = await anlegen(lesenachweis);
    expect(veraltet.statusCode).toBe(409);
  });

  it('verlangt Datum und versionierte SNOMED-CT-Kodierung', async () => {
    const { lesenachweis } = await liste();
    const ohneDatum = { ...impfung('2026-09-09') } as Record<string, unknown>;
    delete ohneDatum['occurrenceDateTime'];
    const a = await app.inject({
      method: 'POST',
      url: `${B}/$add-immunization-entry`,
      headers: kopf(),
      payload: {
        resourceType: 'Parameters',
        parameter: [
          { name: 'acknowledgedChronologyId', valueId: lesenachweis },
          { name: 'immunizationEntry', resource: ohneDatum },
        ],
      },
    });
    expect(a.statusCode).toBe(422);
  });

  it('lässt über die Demo-Steuerung eine andere Einrichtung eintragen', async () => {
    const a = await app.inject({
      method: 'POST',
      url: '/verwaltung/fremde-eintraege',
      payload: { kvnr: HOFFMANN },
    });
    expect(a.json().angelegt).toHaveLength(2);
    expect((await liste()).impfungen).toHaveLength(6);
  });
});
