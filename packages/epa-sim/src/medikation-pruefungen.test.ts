import type { FastifyInstance } from 'fastify';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { dosierungAusText, planeintragNachFhir } from '@demo-pvs/kern';
import { simulatorBauen } from './anwendung.ts';
import { befugnisErteilen } from './befugnis.ts';

/**
 * Prüfungen des Medication Service, wie sie die Geschäftslogik des IG 1.4.0-ballot.1 je
 * Operation festlegt: Statuscode und Detailcode.
 */

const PRAXIS = '1-DEMO-PRAXIS-STADTGARTEN';
const HOFFMANN = 'A123456780';
const MS = '/epa/medication/api/v1/fhir';
const QUERY = '/epa/query/api/v1/fhir';
const ATC = 'http://fhir.de/CodeSystem/bfarm/atc';
const ORGANISATION = {
  resourceType: 'Organization',
  meta: { profile: ['https://gematik.de/fhir/ti/StructureDefinition/ti-organization'] },
  identifier: [{ system: 'https://gematik.de/fhir/sid/telematik-id', value: PRAXIS }],
  name: 'Hausarztpraxis am Stadtgarten',
};
const kopf = () => ({
  'x-useragent': 'DemoPVS0000000000000/0.4.0',
  'x-demo-sitzung': PRAXIS,
  'x-insurantid': HOFFMANN,
  'X-Requesting-Organization': Buffer.from(JSON.stringify(ORGANISATION)).toString('base64'),
  'content-type': 'application/fhir+json',
});

let app: FastifyInstance;
beforeEach(async () => {
  await app?.close();
  app = await simulatorBauen();
  befugnisErteilen(HOFFMANN, PRAXIS, new Date(), 'eGK');
});
afterAll(async () => {
  await app?.close();
});

type Antwort = {
  statusCode: number;
  json: () => {
    issue?: { details?: { coding?: { code?: string }[] } }[];
    parameter?: { name: string; resource?: Record<string, unknown> }[];
    entry?: { resource: Record<string, unknown> }[];
  };
};
const lesen = (url: string) =>
  app.inject({ method: 'GET', url, headers: kopf() }) as Promise<Antwort>;
const post = (url: string, parameter: unknown[]) =>
  app.inject({
    method: 'POST',
    url,
    headers: kopf(),
    payload: { resourceType: 'Parameters', parameter },
  }) as Promise<Antwort>;
const detail = (a: Antwort) => a.json().issue?.[0]?.details?.coding?.[0]?.code;

async function chronologie(): Promise<string> {
  const plan = await lesen(`${MS}/$medication-plan`);
  return String(
    plan
      .json()
      .entry!.map((e) => e.resource)
      .find(
        (r) =>
          r['resourceType'] === 'Provenance' &&
          JSON.stringify(r['extension'] ?? []).includes('is-emp-chronology'),
      )!['id'],
  );
}
const eintrag = () =>
  planeintragNachFhir({
    kvnr: HOFFMANN,
    datum: '2026-10-29',
    dosierung: dosierungAusText('1-0-0-0'),
    grund: null,
    mittel: { reference: 'Medication/neu-1' },
  });
const mittelParameter = (part: unknown) => ({ name: 'medication', part: [part] });

describe('Medication Service 1.4.0 — Prüfungen je Operation', () => {
  it('$add-emp-entry: unbekanntes Arzneimittel 404, schon im Plan 409, fehlerhaft 400', async () => {
    const unbekannt = await post(`${MS}/$add-emp-entry`, [
      { name: 'acknowledgedChronologyId', valueId: await chronologie() },
      { name: 'empEntry', resource: eintrag() },
      mittelParameter({
        name: 'reference',
        valueReference: { reference: 'Medication/gibt-es-nicht' },
      }),
    ]);
    expect([unbekannt.statusCode, detail(unbekannt)]).toEqual([404, 'MSG_RESOURCE_ID_FAIL']);

    // Das Arzneimittel des Startbestands ist schon Ursprung eines eMP-Eintrags.
    const doppelt = await post(`${MS}/$add-emp-entry`, [
      { name: 'acknowledgedChronologyId', valueId: await chronologie() },
      { name: 'empEntry', resource: eintrag() },
      mittelParameter({
        name: 'reference',
        valueReference: { reference: 'Medication/empmed-h-med-1' },
      }),
    ]);
    expect([doppelt.statusCode, detail(doppelt)]).toEqual([409, 'MEDSVC_EMP_ENTRY_ALREADY_EXISTS']);

    const fehlerhaft = await post(`${MS}/$add-emp-entry`, [
      { name: 'acknowledgedChronologyId', valueId: await chronologie() },
      { name: 'empEntry', resource: { ...eintrag(), status: 'entered-in-error' } },
      mittelParameter({
        name: 'resource',
        resource: {
          resourceType: 'Medication',
          id: 'neu-1',
          extension: [
            {
              url: 'https://gematik.de/fhir/epa-medication/StructureDefinition/context-extension',
              valueCode: 'EMP',
            },
          ],
          code: { coding: [{ system: ATC, version: '2026', code: 'C10AA05' }] },
        },
      }),
    ]);
    expect([fehlerhaft.statusCode, detail(fehlerhaft)]).toEqual([400, 'MEDSVC_STATUS_INVALID']);
  });

  it('$update-emp-entry: veraltete Fassung 409, unbekannte Kennung 404', async () => {
    const plan = await lesen(`${MS}/$medication-plan`);
    const vorhanden = plan
      .json()
      .entry!.map((e) => e.resource)
      .find((r) => r['id'] === 'emp-h-med-1')!;
    const alt = await post(`${MS}/$update-emp-entry`, [
      { name: 'acknowledgedChronologyId', valueId: await chronologie() },
      { name: 'medicationPlanIdentifier', valueIdentifier: { value: 'emp-h-med-1' } },
      {
        name: 'empEntry',
        resource: { ...vorhanden, meta: { ...(vorhanden['meta'] as object), versionId: '0' } },
      },
    ]);
    expect([alt.statusCode, detail(alt)]).toEqual([409, 'MSG_VERSION_AWARE_CONFLICT']);
    const fremd = await post(`${MS}/$update-emp-entry`, [
      { name: 'acknowledgedChronologyId', valueId: await chronologie() },
      { name: 'medicationPlanIdentifier', valueIdentifier: { value: 'gibt-es-nicht' } },
      { name: 'empEntry', resource: vorhanden },
    ]);
    expect([fremd.statusCode, detail(fremd)]).toEqual([404, 'MSG_RESOURCE_ID_FAIL']);
  });

  it('$link-emp und $unlink-emp: unbekannter eMP-Eintrag 400, nicht verknüpft 405, schon verknüpft 400', async () => {
    const link = await post(`${MS}/MedicationStatement/eml-h-med-2/$link-emp`, [
      { name: 'acknowledgedChronologyId', valueId: await chronologie() },
      { name: 'medicationPlanIdentifier', valueIdentifier: { value: 'gibt-es-nicht' } },
    ]);
    expect([link.statusCode, detail(link)]).toEqual([400, 'LINKING_NOT_SUCCESSFUL']);
    const unlink = await post(`${MS}/MedicationStatement/eml-h-med-2/$unlink-emp`, [
      { name: 'acknowledgedChronologyId', valueId: await chronologie() },
      { name: 'medicationPlanIdentifier', valueIdentifier: { value: 'emp-h-med-1' } },
    ]);
    expect([unlink.statusCode, detail(unlink)]).toEqual([405, 'MSG_OP_NOT_ALLOWED']);
    const schon = await post(`${MS}/MedicationStatement/eml-h-med-1/$link-emp`, [
      { name: 'acknowledgedChronologyId', valueId: await chronologie() },
      { name: 'medicationPlanIdentifier', valueIdentifier: { value: 'emp-h-med-3' } },
    ]);
    expect([schon.statusCode, detail(schon)]).toEqual([400, 'MEDSVC_ALREADY_LINKED']);
    const fehlt = await post(`${MS}/MedicationStatement/gibt-es-nicht/$link-emp`, [
      { name: 'acknowledgedChronologyId', valueId: await chronologie() },
      { name: 'medicationPlanIdentifier', valueIdentifier: { value: 'emp-h-med-1' } },
    ]);
    expect([fehlt.statusCode, detail(fehlt)]).toEqual([404, 'MSG_RESOURCE_ID_FAIL']);
  });

  it('$cancel-eml-entry: Verordnung 405; ein stornierter Nachtrag ist gelöscht (410)', async () => {
    const verordnung = await post(`${MS}/MedicationStatement/eml-h-med-1/$cancel-eml-entry`, []);
    expect([verordnung.statusCode, detail(verordnung)]).toEqual([405, 'MSG_OP_NOT_ALLOWED']);

    const nachtrag = await post(`${MS}/MedicationStatement/$add-eml-entry`, [
      {
        name: 'medicationStatement',
        resource: {
          resourceType: 'MedicationStatement',
          status: 'unknown',
          medicationReference: { reference: 'Medication/nachtrag-1' },
          subject: { identifier: { system: 'http://fhir.de/sid/gkv/kvid-10', value: HOFFMANN } },
          dosage: [{ text: 'nach Bedarf' }],
          extension: [
            {
              url: 'http://hl7.org/fhir/5.0/StructureDefinition/extension-MedicationStatement.renderedDosageInstruction',
              valueMarkdown: 'nach Bedarf',
            },
          ],
        },
      },
      {
        name: 'medication',
        resource: {
          resourceType: 'Medication',
          id: 'nachtrag-1',
          status: 'active',
          code: { coding: [{ system: ATC, version: '2026', code: 'N02BE01' }] },
        },
      },
    ]);
    expect(nachtrag.statusCode).toBe(200);
    const id = String(
      nachtrag.json().parameter!.find((p) => p.name === 'medicationStatement')!.resource!['id'],
    );
    expect((await post(`${MS}/MedicationStatement/${id}/$cancel-eml-entry`, [])).statusCode).toBe(
      200,
    );
    const danach = await post(`${MS}/MedicationStatement/${id}/$link-emp`, [
      { name: 'acknowledgedChronologyId', valueId: await chronologie() },
      { name: 'medicationPlanIdentifier', valueIdentifier: { value: 'emp-h-med-1' } },
    ]);
    expect([danach.statusCode, detail(danach)]).toEqual([410, 'MSG_DELETED']);
  });

  it('$add-eml-entry: Nachtrag nur mit Status unknown und aktivem Arzneimittel', async () => {
    const a = await post(`${MS}/MedicationStatement/$add-eml-entry`, [
      {
        name: 'medicationStatement',
        resource: {
          resourceType: 'MedicationStatement',
          // Vom Profil zugelassen, aber nicht `unknown`: Die Statusprüfung folgt auf die Profilprüfung.
          // (`intended` weist schon das Profil ab, Invariante epa-med-statement-status.)
          status: 'entered-in-error',
          medicationReference: { reference: 'Medication/nachtrag-1' },
          subject: { identifier: { system: 'http://fhir.de/sid/gkv/kvid-10', value: HOFFMANN } },
        },
      },
      {
        name: 'medication',
        resource: {
          resourceType: 'Medication',
          id: 'nachtrag-1',
          status: 'active',
          code: { coding: [{ system: ATC, version: '2026', code: 'N02BE01' }] },
        },
      },
    ]);
    expect([a.statusCode, detail(a)]).toEqual([400, 'MEDSVC_STATUS_INVALID']);
  });

  it('weist eine Eingabe gegen die Profilregeln mit allen Befunden ab', async () => {
    const a = await post(`${MS}/MedicationStatement/$add-eml-entry`, [
      {
        name: 'medicationStatement',
        resource: { resourceType: 'MedicationStatement', status: 'active' },
      },
      {
        name: 'medication',
        resource: {
          resourceType: 'Medication',
          status: 'active',
          code: { coding: [{ system: ATC, version: '2026', code: 'N02BE01' }] },
        },
      },
    ]);
    expect([a.statusCode, detail(a)]).toEqual([422, 'MEDSVC_NO_VALID_STRUCTURE']);
    const texte = JSON.stringify(a.json().issue);
    expect(texte).toContain('MedicationStatement.medication');
    expect(texte).toContain('MedicationStatement.subject');
    expect(texte).toContain('epa-medication-statement-status-vs');
  });

  it('lesende Operationen weisen unbekannte Parameter und falsche Werte ab', async () => {
    const unbekannt = await lesen(`${MS}/$medication-list?foo=1`);
    expect([unbekannt.statusCode, detail(unbekannt)]).toEqual([400, 'MSG_PARAM_UNKNOWN']);
    const syntax = await lesen(`${MS}/$medication-list?date=gestern`);
    expect([syntax.statusCode, detail(syntax)]).toEqual([400, 'MSG_BAD_SYNTAX']);
  });
});

describe('Common Query API — Suchparameter nach dem CapabilityStatement', () => {
  const ids = (a: Antwort) => (a.json().entry ?? []).map((e) => String(e.resource['id']));

  it('kennt die Parameter je Typ und weist andere ab', async () => {
    const plan = await lesen(`${QUERY}/MedicationRequest?intent=plan&context=EMP`);
    expect(ids(plan)).toContain('emp-h-med-1');
    const falsch = await lesen(`${QUERY}/Organization?intent=plan`);
    expect([falsch.statusCode, detail(falsch)]).toEqual([400, 'MSG_PARAM_UNKNOWN']);
    const syntax = await lesen(`${QUERY}/MedicationRequest?authoredon=morgen`);
    expect([syntax.statusCode, detail(syntax)]).toEqual([400, 'MSG_BAD_SYNTAX']);
  });

  it('verknüpft Werte mit ODER, Parameter mit UND und sucht über _has rückwärts', async () => {
    const zwei = await lesen(`${QUERY}/MedicationRequest?_id=emp-h-med-1,emp-h-med-3`);
    expect(ids(zwei).sort()).toEqual(['emp-h-med-1', 'emp-h-med-3']);
    const und = await lesen(`${QUERY}/MedicationRequest?_id=emp-h-med-1,emp-h-med-3&intent=order`);
    expect(ids(und)).toEqual([]);
    // eML-Einträge, die mit emp-h-med-1 verknüpft sind …
    const verknuepft = await lesen(
      `${QUERY}/MedicationStatement?based-on-emp=MedicationRequest/emp-h-med-1`,
    );
    expect(ids(verknuepft)).toEqual(['eml-h-med-1']);
    // … und rückwärts: eMP-Einträge, auf die ein eML-Eintrag verweist.
    const rueckwaerts = await lesen(
      `${QUERY}/MedicationRequest?_has:MedicationStatement:based-on-emp:_id=eml-h-med-1`,
    );
    expect(ids(rueckwaerts)).toEqual(['emp-h-med-1']);
  });

  it('blättert mit _count und _offset', async () => {
    const alle = await lesen(`${QUERY}/MedicationRequest?intent=plan`);
    const zwei = await lesen(`${QUERY}/MedicationRequest?intent=plan&_count=2&_offset=1`);
    expect(ids(zwei)).toEqual(ids(alle).slice(1, 3));
  });
});

describe('Selbstprüfung gegen die Profilregeln', () => {
  it('der Startbestand des Medication Service erfüllt die Profile, die er nennt', async () => {
    const { alleBestaende } = await import('./bestand.ts');
    const { profilPruefen, geprueftesProfil } = await import('@demo-pvs/kern');
    const befunde = alleBestaende().flatMap((b) =>
      b.medikation
        .filter((r) => geprueftesProfil(String(r.meta?.profile?.[0] ?? '')))
        .flatMap((r) =>
          profilPruefen(r, String(r.meta!.profile![0])).map(
            (f) => `${r.resourceType}/${String(r.id)} ${f.regel} ${f.pfad}`,
          ),
        ),
    );
    expect(befunde).toEqual([]);
  });
});
