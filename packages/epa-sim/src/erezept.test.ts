import type { FastifyInstance } from 'fastify';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { patientSummaryLesen, verordnungsdatensatzBauen, type Rezept } from '@demo-pvs/kern';
import { simulatorBauen } from './anwendung.ts';
import { befugnisErteilen } from './befugnis.ts';

/**
 * Aktenstatus und Widersprüche (Information Service) sowie der Demo-Ersatz des
 * E-Rezept-Fachdienstes mit der Zulieferung in den Medication Service.
 */

const PRAXIS = 'DEMO-PRAXIS-STADTGARTEN';
const HOFFMANN = 'A123456780';
const KRUEGER = 'K876543217';
const WEBER = 'W246813578';
const MEDIKATION = '/epa/medication/api/v1/fhir';

let app: FastifyInstance;

beforeEach(async () => {
  await app?.close();
  app = await simulatorBauen();
  befugnisErteilen(HOFFMANN, PRAXIS, new Date(), 'eGK');
  befugnisErteilen(KRUEGER, PRAXIS, new Date(), 'eGK');
  await app.inject({
    method: 'POST',
    url: '/verwaltung/betriebslage',
    payload: { erezeptVerzoegerungMs: 0 },
  });
});

afterAll(async () => {
  await app?.close();
});

function kopf(kvnr = HOFFMANN): Record<string, string> {
  return {
    'x-useragent': 'DEMOPVSFIKTIV0000001/0.4.0',
    'x-demo-sitzung': PRAXIS,
    'x-insurantid': kvnr,
  };
}

type R = Record<string, unknown> & { resourceType: string; id: string };

async function liste(kvnr = HOFFMANN): Promise<{ treffer: R[]; alle: R[] }> {
  const a = await app.inject({
    method: 'GET',
    url: `${MEDIKATION}/$medication-list`,
    headers: kopf(kvnr),
  });
  expect(a.statusCode).toBe(200);
  const eintraege = (a.json().entry as { resource: R; search?: { mode?: string } }[]) ?? [];
  return {
    treffer: eintraege.filter((e) => e.search?.mode !== 'include').map((e) => e.resource),
    alle: eintraege.map((e) => e.resource),
  };
}

async function plan(kvnr = HOFFMANN): Promise<R[]> {
  const a = await app.inject({
    method: 'GET',
    url: `${MEDIKATION}/$medication-plan`,
    headers: kopf(kvnr),
  });
  expect(a.statusCode).toBe(200);
  return (a.json().entry as { resource: R }[]).map((e) => e.resource);
}

function rezept(teil: Partial<Rezept> = {}): Rezept {
  return {
    id: 'r1',
    patientId: 'p-hoffmann',
    arzneimittel: {
      bezeichnung: 'Ramipril 5 mg Tabletten',
      pzn: '90900010',
      atc: 'C09AA05',
      atcVersion: '2026',
    },
    dosierung: '1-0-0-0',
    packungen: 1,
    normgroesse: 'N3',
    empId: 'emp-h-med-3',
    grund: null,
    status: 'vorbereitet',
    freigabe: 'freigegeben',
    hinweis: null,
    erstelltAm: '2026-09-29T09:00:00',
    vorbereitetVon: 'Dr. med. Anna Brandt',
    rezeptId: null,
    accessCode: null,
    signiertVon: null,
    gesendetAm: null,
    geloeschtAm: null,
    ...teil,
  };
}

/** Verordnen wie ein Primärsystem: Task/$create, Datensatz bilden, Task/$activate. */
async function verordnen(r: Rezept, kvnr = HOFFMANN): Promise<{ id: string; accessCode: string }> {
  const erstellt = await app.inject({
    method: 'POST',
    url: '/erp/Task/$create',
    headers: { 'x-demo-sitzung': PRAXIS, 'content-type': 'application/fhir+json' },
    payload: {
      resourceType: 'Parameters',
      parameter: [
        {
          name: 'workflowType',
          valueCoding: {
            system: 'https://gematik.de/fhir/erp/CodeSystem/GEM_ERP_CS_FlowType',
            code: '160',
          },
        },
      ],
    },
  });
  expect(erstellt.statusCode).toBe(201);
  const task = erstellt.json() as { id: string; identifier: { system: string; value: string }[] };
  const accessCode = task.identifier.find((i) => i.system.endsWith('AccessCode'))!.value;
  const datensatz = verordnungsdatensatzBauen(r, {
    kvnr,
    vorname: 'Renate',
    nachname: 'Hoffmann',
    geburtsdatum: '1958-03-14',
    kostentraeger: 'Beispielkasse Nordwest',
    kostentraegerkennung: '109999901',
    arzt: { name: 'Dr. med. Anna Brandt', lanr: '999999901' },
    praxis: { name: 'Hausarztpraxis am Stadtgarten', telematikId: PRAXIS },
    rezeptId: task.id,
    authoredOn: '2026-09-29',
  });
  const aktiviert = await app.inject({
    method: 'POST',
    url: `/erp/Task/${task.id}/$activate`,
    headers: {
      'x-demo-sitzung': PRAXIS,
      'x-accesscode': accessCode,
      'content-type': 'application/fhir+json',
    },
    payload: {
      resourceType: 'Parameters',
      parameter: [
        {
          name: 'ePrescription',
          resource: {
            resourceType: 'Binary',
            contentType: 'application/pkcs7-mime',
            data: Buffer.from(JSON.stringify(datensatz)).toString('base64'),
          },
        },
      ],
    },
  });
  expect(aktiviert.statusCode).toBe(200);
  expect(aktiviert.json().status).toBe('ready');
  return { id: task.id, accessCode };
}

function eintragZu(treffer: R[], alle: R[], text: string): R | undefined {
  return treffer.find((s) => {
    const m = alle.find(
      (x) =>
        x.resourceType === 'Medication' &&
        `Medication/${x.id}` === (s['medicationReference'] as { reference: string }).reference,
    );
    return (
      String((m?.['code'] as { text?: string } | undefined)?.text ?? '').includes(text) &&
      s['status'] !== 'unknown'
    );
  });
}

describe('Information Service', () => {
  it('meldet Akte, keine Akte und eine gesperrte Akte', async () => {
    const da = await app.inject({ method: 'GET', url: '/information/api/v1/ehr', headers: kopf() });
    expect(da.statusCode).toBe(204);
    const keine = await app.inject({
      method: 'GET',
      url: '/information/api/v1/ehr',
      headers: kopf(WEBER),
    });
    expect(keine.statusCode).toBe(404);
    expect(keine.json().errorCode).toBe('noHealthRecord');

    await app.inject({
      method: 'POST',
      url: '/verwaltung/akte',
      payload: { kvnr: HOFFMANN, status: 'SUSPENDED' },
    });
    const gesperrt = await app.inject({
      method: 'GET',
      url: '/information/api/v1/ehr',
      headers: kopf(),
    });
    expect(gesperrt.statusCode).toBe(409);
    expect(gesperrt.json().errorCode).toBe('statusMismatch');
    // Auch die Fachdienste antworten dann mit 409.
    const fach = await app.inject({
      method: 'GET',
      url: `${MEDIKATION}/$medication-list`,
      headers: kopf(),
    });
    expect(fach.statusCode).toBe(409);
  });

  it('spiegelt den Widerspruch gegen den Medikationsprozess; der Medication Service antwortet 423', async () => {
    const w = await app.inject({
      method: 'GET',
      url: '/information/api/v1/ehr/consentdecisions',
      headers: kopf(KRUEGER),
    });
    expect(w.json().data).toEqual([
      { functionId: 'medication', decision: 'deny' },
      { functionId: 'erp-submission', decision: 'permit' },
    ]);
    const ms = await app.inject({
      method: 'GET',
      url: `${MEDIKATION}/$medication-list`,
      headers: kopf(KRUEGER),
    });
    expect(ms.statusCode).toBe(423);
    expect(ms.json().errorCode).toBe('locked');
    const ps = await app.inject({
      method: 'GET',
      url: '/epa/vorschlag/patient-summary/api/v1/fhir/Patient/$summary',
      headers: kopf(KRUEGER),
    });
    const medikation = patientSummaryLesen(ps.json())!.abschnitte.find(
      (a) => a.schluessel === 'medikation',
    )!;
    expect(medikation.leer).toBe('withheld');
  });
});

describe('E-Rezept', () => {
  it('stellt ein Rezept aus dem Plan in die Liste und verknüpft es über den eMP-Identifier', async () => {
    const vorher = (await plan()).find((r) => r.id === 'emp-h-med-3')!;
    await verordnen(rezept());
    const { treffer, alle } = await liste();
    const neu = eintragZu(treffer, alle, 'Ramipril');
    expect(neu).toBeDefined();
    expect(neu!['status']).toBe('intended');
    expect(neu!['basedOn']).toEqual([{ reference: 'MedicationRequest/emp-h-med-3' }]);
    const nachher = (await plan()).find((r) => r.id === 'emp-h-med-3')!;
    expect(
      Number(nachher.meta && (nachher.meta as { versionId: string }).versionId),
    ).toBeGreaterThan(Number((vorher.meta as { versionId: string }).versionId));
  });

  it('zeigt nach dem Austausch das abgegebene Arzneimittel und die geänderte Dosierung im Plan', async () => {
    const { id } = await verordnen(rezept());
    const abgabe = await app.inject({
      method: 'POST',
      url: `/verwaltung/erezepte/${id}/abgabe`,
      payload: { art: 'austausch' },
    });
    expect(abgabe.statusCode).toBe(200);
    const alle = await plan();
    const eintrag = alle.find((r) => r.id === 'emp-h-med-3')!;
    const mittel = alle.find(
      (r) =>
        r.resourceType === 'Medication' &&
        `Medication/${r.id}` ===
          (eintrag['medicationReference'] as { reference: string }).reference,
    )!;
    expect((mittel['code'] as { text: string }).text).toContain('2,5 mg');
    expect((eintrag['dosageInstruction'] as { text: string }[])[0]!.text).toBe('2-0-0-0');
  });

  it('aktualisiert den Plan nicht, wenn zu einem Rezept mehrere Arzneimittel abgegeben werden', async () => {
    const vorher = (await plan()).find((r) => r.id === 'emp-h-med-3')!['medicationReference'];
    const { id } = await verordnen(rezept());
    await app.inject({
      method: 'POST',
      url: `/verwaltung/erezepte/${id}/abgabe`,
      payload: { art: 'mehrfach' },
    });
    const eintrag = (await plan()).find((r) => r.id === 'emp-h-med-3')!;
    expect(eintrag['medicationReference']).toEqual(vorher);
    const { treffer } = await liste();
    const mitAbgaben = treffer.find(
      (s) =>
        ((s['derivedFrom'] as { reference: string }[]) ?? []).filter((d) =>
          d.reference.startsWith('MedicationDispense/'),
        ).length === 2,
    );
    expect(mitAbgaben).toBeDefined();
  });

  it('nimmt ein gelöschtes Rezept aus der Liste und verweigert das Löschen nach der Abgabe', async () => {
    const eins = await verordnen(rezept());
    const loeschen = await app.inject({
      method: 'POST',
      url: `/erp/Task/${eins.id}/$abort`,
      headers: { 'x-demo-sitzung': PRAXIS, 'x-accesscode': eins.accessCode },
    });
    expect(loeschen.statusCode).toBe(204);
    const { treffer, alle } = await liste();
    expect(eintragZu(treffer, alle, 'Ramipril')).toBeUndefined();

    const zwei = await verordnen(rezept());
    await app.inject({
      method: 'POST',
      url: `/verwaltung/erezepte/${zwei.id}/abgabe`,
      payload: {},
    });
    const zuSpaet = await app.inject({
      method: 'POST',
      url: `/erp/Task/${zwei.id}/$abort`,
      headers: { 'x-demo-sitzung': PRAXIS, 'x-accesscode': zwei.accessCode },
    });
    expect(zuSpaet.statusCode).toBe(403);
  });

  it('überträgt asynchron und gar nicht nach Widerspruch gegen das Einstellen', async () => {
    await app.inject({
      method: 'POST',
      url: '/verwaltung/betriebslage',
      payload: { erezeptVerzoegerungMs: 60 },
    });
    await verordnen(rezept());
    const sofort = await liste();
    expect(eintragZu(sofort.treffer, sofort.alle, 'Ramipril')).toBeUndefined();
    await new Promise((f) => setTimeout(f, 120));
    const spaeter = await liste();
    expect(eintragZu(spaeter.treffer, spaeter.alle, 'Ramipril')).toBeDefined();

    await app.inject({
      method: 'POST',
      url: '/verwaltung/betriebslage',
      payload: { erezeptVerzoegerungMs: 0 },
    });
    await app.inject({
      method: 'POST',
      url: '/verwaltung/akte',
      payload: { kvnr: HOFFMANN, 'erp-submission': 'deny' },
    });
    await verordnen(rezept());
    const stand = (await app.inject({ method: 'GET', url: '/verwaltung/erezepte' })).json() as {
      epa: string;
    }[];
    expect(stand[stand.length - 1]!.epa).toBe('Widerspruch');
  });

  it('lässt die Operationen des Fachdienstes am Medication Service nicht von Primärsystemen aufrufen', async () => {
    const a = await app.inject({
      method: 'POST',
      url: `${MEDIKATION}/$provide-prescription-erp`,
      headers: {
        ...kopf(),
        'X-Requesting-Organization': Buffer.from(
          JSON.stringify({
            resourceType: 'Organization',
            meta: { profile: ['https://gematik.de/fhir/ti/StructureDefinition/ti-organization'] },
            identifier: [{ system: 'https://gematik.de/fhir/sid/telematik-id', value: PRAXIS }],
          }),
        ).toString('base64'),
        'content-type': 'application/fhir+json',
      },
      payload: { resourceType: 'Parameters' },
    });
    expect(a.statusCode).toBe(403);
  });
});
