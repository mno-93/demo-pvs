import type { FastifyInstance } from 'fastify';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { fhirPruefen, patientSummaryLesen, type Ressource } from '@demo-pvs/kern';
import { simulatorBauen } from './anwendung.ts';
import { befugnisErteilen } from './befugnis.ts';
import { EPA_EPS, EPS_FORMAT, MHD_VORSCHAU } from './epa-eps.ts';
import { uuidV7 } from './plattform.ts';

/**
 * Vorschau ePA 3.2 (ADR 0042): die leere ePA European Patient Summary des Aktensystems über MHD,
 * nach den Ballots `gemIG_ePA_ePS` 1.0.0-ballot.1 und `de.gematik.epa.mhd` 1.2.0-ballot.1.
 */

const PRAXIS = '1-DEMO-PRAXIS-STADTGARTEN';
const HOFFMANN = 'A123456780';
const MHD = '/epa/mhd/api/v1/fhir';
const EPS_SUCHE = `${MHD}/DocumentReference?${new URLSearchParams({
  'patient.identifier': `http://fhir.de/sid/gkv/kvid-10|${HOFFMANN}`,
  type: 'http://loinc.org|60591-5',
  status: 'current',
}).toString()}`;

const kopf = {
  'x-useragent': 'DEMOPVSFIKTIV0000001/0.4.0',
  'x-demo-sitzung': PRAXIS,
  'x-insurantid': HOFFMANN,
};

let app: FastifyInstance;

async function stufe(ausbaustand: string) {
  await app.inject({ method: 'POST', url: '/verwaltung/betriebslage', payload: { ausbaustand } });
}

async function suchen(url = EPS_SUCHE) {
  const a = await app.inject({ method: 'GET', url, headers: kopf });
  expect(a.statusCode).toBe(200);
  return a.json() as {
    meta: { profile: string[] };
    total: number;
    entry?: { resource: Ressource }[];
  };
}

beforeEach(async () => {
  await app?.close();
  app = await simulatorBauen();
  befugnisErteilen(HOFFMANN, PRAXIS, new Date(), 'eGK');
  await stufe('weiterentwicklung');
});

afterAll(async () => {
  await app?.close();
});

const UUID7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('UUID Version 7', () => {
  it('trägt den Zeitstempel, die Version 7 und die Variante nach RFC 9562', () => {
    const ms = Date.UTC(2026, 9, 16, 12, 0, 0);
    const u = uuidV7(ms);
    expect(u).toMatch(UUID7);
    expect(parseInt(u.replace(/-/g, '').slice(0, 12), 16)).toBe(ms);
    expect(uuidV7(ms)).not.toBe(u);
  });
});

describe('ePS des Aktensystems über MHD (Vorschau ePA 3.2)', () => {
  it('gibt es im Release 3.1.3 nicht — die Suche findet nichts', async () => {
    await stufe('release-3.1.3');
    expect((await suchen()).total).toBe(0);
  });

  it('erzeugt bei der Suche die DocumentReference nach IG-MHD27048WTV', async () => {
    const b = await suchen();
    expect(b.meta.profile).toEqual([MHD_VORSCHAU.suchergebnis]);
    expect(b.total).toBe(1);
    const r = b.entry![0]!.resource as Record<string, unknown> & Ressource;
    expect(r.meta?.profile).toEqual([MHD_VORSCHAU.dokument]);
    expect(r['status']).toBe('current');
    expect(JSON.stringify(r['type'])).toContain('"60591-5"');
    expect(JSON.stringify(r['category'])).toContain('"BRI"');
    expect(JSON.stringify(r['securityLabel'])).toContain('"emergency"');
    expect(r['author']).toEqual([{ display: 'ePA-Aktensystem' }]);
    const inhalt = (r['content'] as { attachment: Record<string, string>; format: unknown }[])[0]!;
    expect(inhalt.format).toEqual(EPS_FORMAT);
    expect(inhalt.attachment['title']).toBe('Patient Summary');
    expect(inhalt.attachment['language']).toBe('de-DE');
    const kennungen = r['identifier'] as { system: string; value: string }[];
    expect(kennungen[0]!.value.replace('urn:uuid:', '')).toMatch(UUID7);
    expect(kennungen[1]!.value).toMatch(UUID7);
    // Die Vorschrift lässt masterIdentifier offen; die Demo belegt ihn wie beim dgLP-Befund.
    expect((r['masterIdentifier'] as { value: string }).value).toBe(kennungen[1]!.value);
    expect(nurFehler(fhirPruefen(b as unknown as Ressource))).toEqual([]);
  });

  it('vergibt bei jeder Suche neue Kennungen und kennt keine frühere Fassung', async () => {
    const a = (await suchen()).entry![0]!.resource.id;
    const b = (await suchen()).entry![0]!.resource.id;
    expect(a).not.toBe(b);
    const frueher = await suchen(EPS_SUCHE.replace('status=current', 'status=superseded'));
    expect(frueher.total).toBe(0);
  });

  it('erscheint in keiner anderen Suche', async () => {
    await suchen();
    const alle = await suchen(`${MHD}/DocumentReference?status=current`);
    const formate = (alle.entry ?? []).map((e) =>
      JSON.stringify((e.resource['content'] as unknown[] | undefined) ?? []),
    );
    expect(formate.some((f) => f.includes(EPS_FORMAT.code))).toBe(false);
  });

  it('liefert über die Abrufadresse die leere ePS: fünf Pflicht-Sections, Autor das Aktensystem', async () => {
    const r = (await suchen()).entry![0]!.resource;
    const url = (r['content'] as { attachment: { url: string } }[])[0]!.attachment.url;
    const a = await app.inject({ method: 'GET', url, headers: kopf });
    expect(a.statusCode).toBe(200);
    expect(a.headers['content-type']).toContain('application/fhir+json');
    const bundle = JSON.parse(a.body) as Ressource & {
      entry: { fullUrl: string; resource: Ressource }[];
    };
    expect(bundle.meta?.profile).toEqual([EPA_EPS.bundle]);
    expect(bundle['type']).toBe('document');
    const komposition = bundle.entry[0]!.resource as Record<string, unknown> & Ressource;
    expect(komposition.meta?.profile).toEqual([EPA_EPS.composition]);
    expect(komposition['status']).toBe('preliminary');
    expect(komposition['author']).toEqual([
      { reference: bundle.entry[2]!.fullUrl, display: 'ePA-Aktensystem' },
    ]);
    const sections = komposition['section'] as {
      code: { coding: { code: string }[] };
      emptyReason: { coding: { code: string }[] };
      text: { div: string };
    }[];
    expect(sections.map((s) => s.code.coding[0]!.code)).toEqual([
      '10160-0',
      '48765-2',
      '11450-4',
      '47519-4',
      '46264-8',
    ]);
    for (const s of sections) {
      expect(s.emptyReason.coding[0]!.code).toBe('unavailable');
      expect(s.text.div).toContain('Erforderliche Informationen können nicht ermittelt werden.');
    }
    expect(nurFehler(fhirPruefen(bundle))).toEqual([]);
    // Das Praxissystem liest nur, was das Dokument führt: fünf Blöcke, alle ohne Inhalt.
    const gelesen = patientSummaryLesen(bundle, { nurVorhandene: true })!;
    expect(gelesen.abschnitte.map((x) => x.schluessel)).toEqual([
      'allergien',
      'diagnosen',
      'medikation',
      'prozeduren',
      'implantate',
    ]);
    expect(gelesen.abschnitte.every((x) => x.eintraege.length === 0)).toBe(true);
  });

  it('lehnt einen Abruf in einem Format ab, das es nicht gibt', async () => {
    const r = (await suchen()).entry![0]!.resource;
    const url = (r['content'] as { attachment: { url: string } }[])[0]!.attachment.url;
    const a = await app.inject({
      method: 'GET',
      url,
      headers: { ...kopf, accept: 'application/fhir+xml' },
    });
    expect(a.statusCode).toBe(406);
  });
});

function nurFehler<T extends { schwere: string }>(b: T[]): T[] {
  return b.filter((x) => x.schwere === 'fehler');
}
