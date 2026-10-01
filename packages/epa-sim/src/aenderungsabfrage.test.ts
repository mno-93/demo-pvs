import type { FastifyInstance } from 'fastify';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { simulatorBauen } from './anwendung.ts';
import { befugnisErteilen } from './befugnis.ts';

/**
 * Abfrage „seit dem letzten Aufruf" nach den veröffentlichten IGs (ADR 0030): `_lastUpdated` an
 * der Dokumentsuche (MHD 1.1.3), Chronologieeinträge nach `recorded` und `agent-identifier`,
 * `$medication-list` mit `date` und `$medication-plan` zu einem früheren Chronologieeintrag
 * (Medication 1.3.5).
 */

const PRAXIS = 'DEMO-PRAXIS-STADTGARTEN';
const KARDIOLOGIE = 'DEMO-KARDIOLOGIE-AM-WALL';
const HOFFMANN = 'A123456780';
const MHD = '/epa/mhd/api/v1/fhir';
const MS = '/epa/medication/api/v1/fhir';
const TELEMATIK = 'https://gematik.de/fhir/sid/telematik-id';

function kopf(): Record<string, string> {
  return {
    'x-useragent': 'DEMOPVSFIKTIV0000001/0.4.0',
    'x-demo-sitzung': PRAXIS,
    'x-insurantid': HOFFMANN,
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

async function lesen(url: string) {
  const a = await app.inject({ method: 'GET', url, headers: kopf() });
  expect(a.statusCode).toBe(200);
  return a.json() as {
    meta?: { lastUpdated?: string };
    entry?: { resource: Record<string, unknown>; search?: { mode: string } }[];
  };
}
const treffer = (b: Awaited<ReturnType<typeof lesen>>) =>
  (b.entry ?? []).filter((e) => e.search?.mode !== 'include').map((e) => e.resource);

async function fremdEintragen() {
  const a = await app.inject({
    method: 'POST',
    url: '/verwaltung/fremde-eintraege',
    payload: { kvnr: HOFFMANN },
  });
  expect(a.statusCode).toBe(200);
}

describe('Abfrage „seit dem letzten Aufruf"', () => {
  it('liefert mit jeder Suche den Zeitpunkt des Aktensystems als Lesezeichen', async () => {
    const b = await lesen(`${MHD}/DocumentReference?status=current`);
    expect(b.meta?.lastUpdated).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('findet über _lastUpdated nur Dokumente, die seit dem Lesezeichen eingestellt wurden', async () => {
    const lesezeichen = (await lesen(`${MHD}/DocumentReference?status=current`)).meta!.lastUpdated!;
    expect(
      treffer(await lesen(`${MHD}/DocumentReference?_lastUpdated=gt${lesezeichen}`)),
    ).toHaveLength(0);
    await fremdEintragen();
    const neu = treffer(await lesen(`${MHD}/DocumentReference?_lastUpdated=gt${lesezeichen}`));
    expect(neu.map((d) => d['description'])).toEqual(['Befundbericht Kardiologie, Kontrolle']);
    // Dasselbe Dokument über seine Kennung wiederfinden.
    const kennung = (neu[0]!['masterIdentifier'] as { value: string }).value;
    const wieder = treffer(
      await lesen(
        `${MHD}/DocumentReference?identifier=urn:ietf:rfc:3986|${encodeURIComponent(kennung)}`,
      ),
    );
    expect(wieder).toHaveLength(1);
  });

  it('findet Änderungen am Medikationsplan über Chronologieeinträge und vergleicht mit dem früheren Stand', async () => {
    const plan = await lesen(`${MS}/$medication-plan`);
    const lesezeichen = plan.meta!.lastUpdated!;
    const alteChronologie = (plan.entry ?? []).find(
      (e) =>
        e.resource['resourceType'] === 'Provenance' &&
        JSON.stringify(e.resource['extension'] ?? '').includes('is-emp-chronology'),
    )!.resource['id'];
    await fremdEintragen();

    const seit = treffer(
      await lesen(`${MS}/Provenance?is-emp-chronology=true&recorded=gt${lesezeichen}`),
    );
    expect(seit).toHaveLength(1);
    const fremd = treffer(
      await lesen(
        `${MS}/Provenance?is-emp-chronology=true&recorded=gt${lesezeichen}&agent-identifier=${encodeURIComponent(`${TELEMATIK}|${KARDIOLOGIE}`)}`,
      ),
    );
    expect(fremd).toHaveLength(1);
    const eigene = treffer(
      await lesen(
        `${MS}/Provenance?is-emp-chronology=true&recorded=gt${lesezeichen}&agent-identifier=${PRAXIS}`,
      ),
    );
    expect(eigene).toHaveLength(0);

    const planeintraege = (b: Awaited<ReturnType<typeof lesen>>) =>
      new Map(
        (b.entry ?? [])
          .map((e) => e.resource)
          .filter((r) => r['resourceType'] === 'MedicationRequest' && r['intent'] === 'plan')
          .map((r) => [String(r['id']), (r['meta'] as { versionId: string }).versionId]),
      );
    const vorher = planeintraege(
      await lesen(`${MS}/$medication-plan?provenance=${String(alteChronologie)}`),
    );
    const jetzt = planeintraege(await lesen(`${MS}/$medication-plan`));
    const neu = [...jetzt.keys()].filter((k) => !vorher.has(k));
    const geaendert = [...jetzt.keys()].filter(
      (k) => vorher.has(k) && vorher.get(k) !== jetzt.get(k),
    );
    expect(neu).toHaveLength(1);
    expect(geaendert).toHaveLength(1);
  });

  it('liefert über $medication-list mit date nur neue Einträge der Medikationsliste', async () => {
    const lesezeichen = (await lesen(`${MS}/$medication-list`)).meta!.lastUpdated!;
    expect(treffer(await lesen(`${MS}/$medication-list?date=gt${lesezeichen}`))).toHaveLength(0);
    await fremdEintragen();
    expect(treffer(await lesen(`${MS}/$medication-list?date=gt${lesezeichen}`))).toHaveLength(1);
  });

  it('kennt _lastUpdated an der Query API', async () => {
    const lesezeichen = (await lesen(`${MS}/MedicationRequest`)).meta!.lastUpdated!;
    await fremdEintragen();
    const geaendert = treffer(await lesen(`${MS}/MedicationRequest?_lastUpdated=gt${lesezeichen}`));
    // Verordnung der Kardiologie, neuer Planeintrag, geänderter Planeintrag.
    expect(geaendert.length).toBe(3);
  });
});
