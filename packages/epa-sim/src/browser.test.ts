import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { befugnisErteilen } from './befugnis.ts';
import { simulatorImBrowser } from './browser.ts';
import { base64ZuText, sha256Hex, utf8AlsBytezeichen } from './plattform.ts';

/**
 * Der Browser-Adapter der gehosteten Demo (ADR 0025): dieselben Wege, dieselben Antworten wie
 * der Server — beantwortet über `Request` und `Response`.
 */

const KOPF = {
  'x-useragent': 'DEMOPVSFIKTIV0000001/0.4.0',
  'x-demo-sitzung': 'DEMO-PRAXIS-STADTGARTEN',
  'x-insurantid': 'A123456780',
};

describe('Plattformhilfen', () => {
  it('rechnet SHA-256 wie node:crypto', () => {
    for (const t of ['', 'abc', 'entry:kh-e-2026-07-17', 'ü'.repeat(100)]) {
      expect(sha256Hex(t)).toBe(createHash('sha256').update(t).digest('hex'));
    }
  });

  it('liest Base64 und Base64url als UTF-8 und bildet Bytezeichen wie Buffer', () => {
    const text = '{"ä":"Ü"}';
    expect(base64ZuText(Buffer.from(text).toString('base64'))).toBe(text);
    expect(base64ZuText(Buffer.from(text).toString('base64url'))).toBe(text);
    expect(utf8AlsBytezeichen('Brief – ä')).toBe(
      Buffer.from('Brief – ä', 'utf8').toString('latin1'),
    );
  });
});

describe('Simulator im Browser', () => {
  it('beantwortet Information Service, Befugnis und Medication Service wie der Server', async () => {
    const sim = simulatorImBrowser();
    const status = await sim.abrufen(
      new Request('http://x/information/api/v1/ehr', { headers: KOPF }),
    );
    expect(status.status).toBe(204);

    const ohne = await sim.abrufen(
      new Request('http://x/epa/medication/api/v1/fhir/$medication-list', { headers: KOPF }),
    );
    expect(ohne.status).toBe(403);
    expect(((await ohne.json()) as { errorCode: string }).errorCode).toBe('notEntitled');
    expect(ohne.headers.get('cache-control')).toBe('no-store');
  });

  it('liefert Dokumente als Binärinhalt und legt E-Rezepte an', async () => {
    const sim = simulatorImBrowser();
    const erstellt = await sim.abrufen(
      new Request('http://x/erp/Task/$create', {
        method: 'POST',
        headers: {
          'x-demo-sitzung': 'DEMO-PRAXIS-STADTGARTEN',
          'content-type': 'application/fhir+json',
        },
        body: JSON.stringify({
          resourceType: 'Parameters',
          parameter: [{ name: 'workflowType', valueCoding: { code: '160' } }],
        }),
      }),
    );
    expect(erstellt.status).toBe(201);
    expect(((await erstellt.json()) as { status: string }).status).toBe('draft');

    const unbekannt = await sim.abrufen(new Request('http://x/verwaltung/gibt-es-nicht'));
    expect(unbekannt.status).toBe(404);

    befugnisErteilen('A123456780', 'DEMO-PRAXIS-STADTGARTEN', new Date(), 'eGK');
    const suche = await sim.abrufen(
      new Request('http://x/epa/mhd/api/v1/fhir/DocumentReference?status=current', {
        headers: KOPF,
      }),
    );
    const treffer = (await suche.json()) as {
      entry: {
        resource: {
          description: string;
          content: { attachment: { url: string; contentType: string } }[];
        };
      }[];
    };
    const pdf = treffer.entry.find((e) => e.resource.description === 'Befundbericht Kardiologie')!
      .resource.content[0]!.attachment;
    expect(pdf.contentType).toBe('application/pdf');
    const datei = await sim.abrufen(
      new Request(`http://x${pdf.url}`, { headers: { ...KOPF, accept: '*/*' } }),
    );
    expect(datei.status).toBe(200);
    const bytes = new Uint8Array(await datei.arrayBuffer());
    // Der Arztbrief kommt byteweise unverändert als PDF mit Textebene.
    const text = new TextDecoder('latin1').decode(bytes);
    expect(text.startsWith('%PDF')).toBe(true);
    expect(text).toContain('Echokardiographie');
  });
});
