import type { FastifyInstance } from 'fastify';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { dosierungAusText, planeintragFortschreiben, planeintragNachFhir } from '@demo-pvs/kern';
import { simulatorBauen } from './anwendung.ts';
import { befugnisErteilen } from './befugnis.ts';

/**
 * Schreibende Operationen des Medication Service nach den Aktivitätsdiagrammen des IG
 * `de.gematik.epa.medication` 1.4.0-ballot.1 (ADR 0054): automatische Verknüpfung, Prüfungen vor
 * jeder Änderung, Löschen fehlerhafter Einträge, Chronologie nur bei Änderung.
 */

const PRAXIS = '1-DEMO-PRAXIS-STADTGARTEN';
const HOFFMANN = 'A123456780';
const MS = '/epa/medication/api/v1/fhir';
const QUERY = '/epa/query/api/v1/fhir';
const EMP_ID = 'https://gematik.de/fhir/sid/emp-identifier';
const IST_EMP = 'https://gematik.de/fhir/epa-medication/StructureDefinition/is-emp-extension';
const ORGANISATION = {
  resourceType: 'Organization',
  meta: { profile: ['https://gematik.de/fhir/ti/StructureDefinition/ti-organization'] },
  identifier: [{ system: 'https://gematik.de/fhir/sid/telematik-id', value: PRAXIS }],
  name: 'Hausarztpraxis am Stadtgarten',
};
const kopf = () => ({
  'x-useragent': 'DEMOPVSFIKTIV0000001/0.4.0',
  'x-demo-sitzung': PRAXIS,
  'x-insurantid': HOFFMANN,
  'X-Requesting-Organization': Buffer.from(JSON.stringify(ORGANISATION)).toString('base64'),
  'content-type': 'application/fhir+json',
});

type R = Record<string, unknown> & {
  resourceType: string;
  id?: string;
  meta?: { versionId?: string };
};
type Antwort = {
  statusCode: number;
  json: () => {
    issue?: { details?: { coding?: { code?: string }[] } }[];
    parameter?: { name: string; resource?: R }[];
    entry?: { resource: R; response?: { status: string } }[];
  };
};

let app: FastifyInstance;
beforeEach(async () => {
  await app?.close();
  app = await simulatorBauen();
  befugnisErteilen(HOFFMANN, PRAXIS, new Date(), 'eGK');
});
afterAll(async () => {
  await app?.close();
});

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
const teil = (a: Antwort, name: string) =>
  a.json().parameter?.find((p) => p.name === name)?.resource;

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
      )!.id,
  );
}

const eintrag = (mittel: string, dosierung = '1-0-1-0', status = 'active') => ({
  ...planeintragNachFhir({
    kvnr: HOFFMANN,
    datum: '2026-09-09',
    dosierung: dosierungAusText(dosierung),
    grund: 'Blutzucker',
    mittel: { reference: mittel },
  }),
  status,
});
const verweis = (mittel: string) => ({
  name: 'medication',
  part: [{ name: 'reference', valueReference: { reference: mittel } }],
});

describe('$add-emp-entry nach IG-MED-BL-ADD-EMP-ENTRY-V2', () => {
  it('verknüpft den eML-Eintrag des Arzneimittels selbst, ohne dessen Dosierung zu übernehmen', async () => {
    const a = await post(`${MS}/$add-emp-entry`, [
      { name: 'acknowledgedChronologyId', valueId: await chronologie() },
      { name: 'empEntry', resource: eintrag('Medication/med-h-med-2', '1-0-0-0') },
      verweis('Medication/med-h-med-2'),
    ]);
    expect(a.statusCode).toBe(200);
    const neu = teil(a, 'empEntry')!;
    // Kennung und MedicationPlanIdentifier: derselbe UUID-Wert.
    expect(neu.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect((neu['identifier'] as { value: string }[])[0]!.value).toBe(neu.id);
    expect(JSON.stringify(neu['extension'])).toContain('MedicationStatement/eml-h-med-2');
    expect(JSON.stringify(neu['dosageInstruction'])).not.toContain('EVE');

    const aussage = (await lesen(`${QUERY}/MedicationStatement/eml-h-med-2`)).json() as R;
    expect(aussage['basedOn']).toEqual([
      {
        extension: [{ url: IST_EMP, valueBoolean: true }],
        reference: `MedicationRequest/${neu.id}`,
      },
    ]);
    const verordnung = (await lesen(`${QUERY}/MedicationRequest/vo-h-med-2`)).json() as R;
    expect(verordnung['basedOn']).toEqual([{ identifier: { system: EMP_ID, value: neu.id } }]);
    // Ein anschließendes $link-emp mit demselben Eintrag ändert nichts.
    const danach = await post(`${MS}/MedicationStatement/eml-h-med-2/$link-emp`, [
      { name: 'acknowledgedChronologyId', valueId: await chronologie() },
      { name: 'medicationPlanIdentifier', valueIdentifier: { system: EMP_ID, value: neu.id } },
    ]);
    expect(danach.statusCode).toBe(200);
    expect(teil(danach, 'empEntry')!.meta?.versionId).toBe(neu.meta?.versionId);
  });

  it('prüft Person, Struktur und Status vor dem Lesenachweis', async () => {
    const fremd = await post(`${MS}/$add-emp-entry`, [
      { name: 'acknowledgedChronologyId', valueId: 'veraltet' },
      {
        name: 'empEntry',
        resource: {
          ...eintrag('Medication/med-h-med-2'),
          subject: {
            identifier: { system: 'http://fhir.de/sid/gkv/kvid-10', value: 'K876543217' },
          },
        },
      },
      verweis('Medication/med-h-med-2'),
    ]);
    expect([fremd.statusCode, detail(fremd)]).toEqual([403, 'SVC_IDENTITY_MISMATCH']);
    const struktur = await post(`${MS}/$add-emp-entry`, [
      { name: 'acknowledgedChronologyId', valueId: 'veraltet' },
      { name: 'empEntry', resource: eintrag('Medication/med-h-med-2') },
    ]);
    expect([struktur.statusCode, detail(struktur)]).toEqual([422, 'MEDSVC_NO_VALID_STRUCTURE']);
    const veraltet = await post(`${MS}/$add-emp-entry`, [
      { name: 'acknowledgedChronologyId', valueId: 'veraltet' },
      { name: 'empEntry', resource: eintrag('Medication/med-h-med-2') },
      verweis('Medication/med-h-med-2'),
    ]);
    expect([veraltet.statusCode, detail(veraltet)]).toEqual([
      409,
      'MEDSVC_EMP_CHRONOLOGY_ID_MISMATCH',
    ]);
  });

  it('legt keinen neuen Chronologieeintrag an, wenn sich die Menge gültiger Einträge nicht ändert', async () => {
    const vorher = await chronologie();
    const a = await post(`${MS}/$add-emp-entry`, [
      { name: 'acknowledgedChronologyId', valueId: vorher },
      { name: 'empEntry', resource: eintrag('Medication/med-h-med-2', '1-0-1-0', 'completed') },
      verweis('Medication/med-h-med-2'),
    ]);
    expect(a.statusCode).toBe(200);
    expect(teil(a, 'relatedChronology')!.id).toBe(vorher);
  });
});

describe('$update-emp-entry nach IG-MED-BL-UPDATE-EMP-ENTRY-V3', () => {
  const aktuell = async (id: string) =>
    (await lesen(`${QUERY}/MedicationRequest/${id}`)).json() as R;
  const aendern = async (resource: R, zusatz: unknown[] = []) =>
    post(`${MS}/$update-emp-entry`, [
      { name: 'acknowledgedChronologyId', valueId: await chronologie() },
      {
        name: 'medicationPlanIdentifier',
        valueIdentifier: { system: EMP_ID, value: String(resource.id) },
      },
      { name: 'empEntry', resource },
      ...zusatz,
    ]);

  it('ändert bei einer Ablehnung nichts (alle Prüfungen vor der ersten Änderung)', async () => {
    const vorher = await aktuell('emp-h-med-3');
    const geaendert = planeintragFortschreiben(vorher, {
      dosierung: dosierungAusText('0-0-1-0'),
      grund: null,
    });
    const a = await aendern(geaendert, [
      {
        name: 'medication',
        resource: {
          resourceType: 'Medication',
          status: 'entered-in-error',
          extension: [
            {
              url: 'https://gematik.de/fhir/epa-medication/StructureDefinition/context-extension',
              valueCode: 'EMP',
            },
          ],
          code: {
            coding: [
              { system: 'http://fhir.de/CodeSystem/bfarm/atc', version: '2026', code: 'C09AA05' },
            ],
            text: 'Ramipril 10 mg',
          },
        },
      },
    ]);
    expect([a.statusCode, detail(a)]).toEqual([400, 'MEDSVC_STATUS_INVALID']);
    expect(await aktuell('emp-h-med-3')).toEqual(vorher);
  });

  it('erzeugt ohne Änderung keine neue Fassung und keinen neuen Chronologieeintrag', async () => {
    const vorher = await aktuell('emp-h-med-3');
    const stand = await chronologie();
    const a = await aendern(vorher);
    expect(a.statusCode).toBe(200);
    expect(teil(a, 'empEntry')!.meta?.versionId).toBe(vorher.meta?.versionId);
    expect(teil(a, 'relatedChronology')!.id).toBe(stand);
  });

  it('löscht einen fehlerhaften Eintrag und löst den verknüpften eML-Eintrag', async () => {
    const vorher = await aktuell('emp-h-med-3');
    const a = await aendern({ ...vorher, status: 'entered-in-error' });
    expect(a.statusCode).toBe(200);
    expect(teil(a, 'empEntry')).toBeUndefined();
    expect(teil(a, 'relatedActivity')).toBeDefined();
    expect((await lesen(`${QUERY}/MedicationRequest/emp-h-med-3`)).statusCode).toBe(410);
    const aussage = (await lesen(`${QUERY}/MedicationStatement/eml-h-med-3`)).json() as R;
    expect(aussage['basedOn']).toBeUndefined();
    // Danach ist der Eintrag unbekannt.
    const nochmal = await aendern({ ...vorher, status: 'active' });
    expect([nochmal.statusCode, detail(nochmal)]).toEqual([404, 'MSG_RESOURCE_ID_FAIL']);
  });
});

describe('$link-emp und $batch-emp', () => {
  it('gibt die geänderte Verordnung zurück und verknüpft nur einmal', async () => {
    const neu = await post(`${MS}/$add-emp-entry`, [
      { name: 'acknowledgedChronologyId', valueId: await chronologie() },
      {
        name: 'empEntry',
        resource: eintrag('Medication/neu-1'),
      },
      {
        name: 'medication',
        part: [
          {
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
              code: {
                coding: [
                  {
                    system: 'http://fhir.de/CodeSystem/bfarm/atc',
                    version: '2026',
                    code: 'A10BA02',
                  },
                ],
                text: 'Metformin 500 mg',
              },
            },
          },
        ],
      },
    ]);
    const id = String(teil(neu, 'empEntry')!.id);
    const verknuepft = await post(`${MS}/MedicationStatement/eml-h-med-2/$link-emp`, [
      { name: 'acknowledgedChronologyId', valueId: await chronologie() },
      { name: 'medicationPlanIdentifier', valueIdentifier: { system: EMP_ID, value: id } },
    ]);
    expect(verknuepft.statusCode).toBe(200);
    expect(teil(verknuepft, 'prescription')!['basedOn']).toEqual([
      { identifier: { system: EMP_ID, value: id } },
    ]);
    const anderer = await post(`${MS}/MedicationStatement/eml-h-med-2/$link-emp`, [
      { name: 'acknowledgedChronologyId', valueId: await chronologie() },
      {
        name: 'medicationPlanIdentifier',
        valueIdentifier: { system: EMP_ID, value: 'emp-h-med-1' },
      },
    ]);
    expect([anderer.statusCode, detail(anderer)]).toEqual([400, 'MEDSVC_ALREADY_LINKED']);
  });

  it('führt im Stapel erst Anlagen, dann Änderungen aus, gleich in welcher Reihenfolge', async () => {
    const vorher = (await lesen(`${QUERY}/MedicationRequest/emp-h-med-4`)).json() as R;
    const bundle = {
      resourceType: 'Bundle',
      type: 'transaction',
      entry: [
        {
          request: { method: 'POST', url: '$emp-commit' },
          resource: {
            resourceType: 'Parameters',
            parameter: [{ name: 'acknowledgedChronologyId', valueId: await chronologie() }],
          },
        },
        {
          request: { method: 'POST', url: '$update-emp-entry' },
          resource: {
            resourceType: 'Parameters',
            parameter: [
              {
                name: 'medicationPlanIdentifier',
                valueIdentifier: { system: EMP_ID, value: 'emp-h-med-4' },
              },
              { name: 'empEntry', resource: { ...vorher, status: 'on-hold' } },
            ],
          },
        },
        {
          request: { method: 'POST', url: '$add-emp-entry' },
          resource: {
            resourceType: 'Parameters',
            parameter: [
              { name: 'empEntry', resource: eintrag('Medication/med-h-med-2') },
              verweis('Medication/med-h-med-2'),
            ],
          },
        },
      ],
    };
    const a = (await app.inject({
      method: 'POST',
      url: `${MS}/$batch-emp`,
      headers: kopf(),
      payload: { resourceType: 'Parameters', parameter: [{ name: 'resource', resource: bundle }] },
    })) as Antwort;
    expect(a.statusCode).toBe(200);
    const teile = a.json().entry!;
    expect(teile).toHaveLength(3);
    expect(teile[0]!.resource['resourceType']).toBe('Provenance');
    expect(((await lesen(`${QUERY}/MedicationRequest/emp-h-med-4`)).json() as R)['status']).toBe(
      'on-hold',
    );
  });
});
