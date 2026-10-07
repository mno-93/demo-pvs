import type { FastifyInstance } from 'fastify';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { simulatorBauen } from './anwendung.ts';
import { befugnisErteilen } from './befugnis.ts';
import { patientSummaryLesen } from '@demo-pvs/kern';

/**
 * Der Simulator von außen, über `inject`: Kopfzeilen der generellen Prinzipien
 * (`de.gematik.epa` 1.3.2), MHD 1.1.3, Medication Service 1.3.5 und ✦ Diagnose-Service.
 */

const PRAXIS = 'DEMO-PRAXIS-STADTGARTEN';
const HOFFMANN = 'A123456780';
const MEDIKATION = '/epa/medication/api/v1/fhir';
const MHD = '/epa/mhd/api/v1/fhir';
const DIENST = '/epa/vorschlag/diagnosis/api/v1/fhir';

const ORGANISATION = {
  resourceType: 'Organization',
  meta: { profile: ['https://gematik.de/fhir/ti/StructureDefinition/ti-organization'] },
  identifier: [{ system: 'https://gematik.de/fhir/sid/telematik-id', value: PRAXIS }],
  name: 'Hausarztpraxis am Stadtgarten',
};

const base64 = (x: unknown) => Buffer.from(JSON.stringify(x)).toString('base64');

function kopf(zusatz: Record<string, string> = {}): Record<string, string> {
  return {
    'x-useragent': 'DEMOPVSFIKTIV0000001/0.4.0',
    'x-demo-sitzung': PRAXIS,
    'x-insurantid': HOFFMANN,
    'X-Requesting-Organization': base64(ORGANISATION),
    'content-type': 'application/fhir+json',
    ...zusatz,
  };
}

type Parameter = { name: string; resource?: { resourceType: string; id?: string } };

function parameter(p: Parameter[], name: string) {
  return p.find((x) => x.name === name)?.resource;
}

let app: FastifyInstance;

beforeEach(async () => {
  await app?.close();
  app = await simulatorBauen();
  befugnisErteilen(HOFFMANN, PRAXIS, new Date(), 'eGK');
  // Der Standard-Ausbaustand ist die aktuelle Spezifikation; diese Prüfungen betreffen die
  // ✦ Vorschläge und stellen den Ausbaustand deshalb ausdrücklich ein.
  await app.inject({
    method: 'POST',
    url: '/verwaltung/betriebslage',
    payload: { ausbaustand: 'weiterentwicklung-3' },
  });
});

afterAll(async () => {
  await app?.close();
});

async function planLesen(): Promise<string> {
  const plan = await app.inject({
    method: 'GET',
    url: `${MEDIKATION}/$medication-plan`,
    headers: kopf(),
  });
  expect(plan.statusCode).toBe(200);
  const chronologie = (
    plan.json().entry as {
      resource: { resourceType: string; id: string; extension?: { url: string }[] };
    }[]
  )
    .map((e) => e.resource)
    .find(
      (r) =>
        r.resourceType === 'Provenance' &&
        r.extension?.some((x) => x.url.endsWith('is-emp-chronology-extension')),
    );
  expect(chronologie).toBeDefined();
  return chronologie!.id;
}

function neuerEintrag(lesenachweis?: string) {
  return {
    resourceType: 'Parameters',
    parameter: [
      ...(lesenachweis ? [{ name: 'acknowledgedChronologyId', valueId: lesenachweis }] : []),
      {
        name: 'empEntry',
        resource: {
          resourceType: 'MedicationRequest',
          status: 'active',
          intent: 'plan',
          authoredOn: '2026-09-27',
          dosageInstruction: [{ text: '1-0-0' }],
        },
      },
      {
        name: 'medication',
        part: [
          {
            name: 'resource',
            resource: {
              resourceType: 'Medication',
              code: {
                coding: [
                  {
                    system: 'http://fhir.de/CodeSystem/bfarm/atc',
                    version: '2026',
                    code: 'C10AA05',
                  },
                ],
                text: 'Atorvastatin 20 mg',
              },
            },
          },
        ],
      },
    ],
  };
}

describe('Kopfzeilen', () => {
  it('weist eine Anfrage ohne x-useragent ab', async () => {
    const a = await app.inject({
      method: 'GET',
      url: `${MHD}/DocumentReference`,
      headers: { ...kopf(), 'x-useragent': '' },
    });
    expect(a.statusCode).toBe(400);
    expect(a.json().errorCode).toBe('malformedRequest');
  });

  it('verlangt X-Requesting-Organization beim Schreiben und prüft die Telematik-ID', async () => {
    const stand = await planLesen();
    const ohne = await app.inject({
      method: 'POST',
      url: `${MEDIKATION}/$add-emp-entry`,
      headers: { ...kopf(), 'X-Requesting-Organization': '' },
      payload: neuerEintrag(stand),
    });
    expect(ohne.statusCode).toBe(422);

    const fremd = await app.inject({
      method: 'POST',
      url: `${MEDIKATION}/$add-emp-entry`,
      headers: kopf({
        'X-Requesting-Organization': base64({
          ...ORGANISATION,
          identifier: [{ system: 'https://gematik.de/fhir/sid/telematik-id', value: 'ANDERE' }],
        }),
      }),
      payload: neuerEintrag(stand),
    });
    expect(fremd.statusCode).toBe(403);
    expect(JSON.stringify(fremd.json())).toContain('SVC_IDENTITY_MISMATCH');
  });
});

describe('MHD', () => {
  it('liefert im Release 3.1.3 den Laborbefund als PDF und ruft ihn unverändert ab', async () => {
    await app.inject({
      method: 'POST',
      url: '/verwaltung/betriebslage',
      payload: { ausbaustand: 'release-3.1.3' },
    });
    const suche = await app.inject({
      method: 'GET',
      url: `${MHD}/DocumentReference?status=current`,
      headers: kopf(),
    });
    const verweise = (suche.json().entry as { resource: Record<string, unknown> }[]).map(
      (e) => e.resource,
    );
    const befund = verweise.find((r) => r['description'] === 'Laborgesamtbefund') as {
      content: { attachment: { contentType: string; url: string }; format: { code: string } }[];
    };
    expect(befund.content[0]!.attachment.contentType).toBe('application/pdf');
    expect(befund.content[0]!.format.code).toBe('urn:ihe-d:spec:PDF_A1:2005');

    const datei = await app.inject({
      method: 'GET',
      url: befund.content[0]!.attachment.url,
      headers: kopf(),
    });
    expect(datei.statusCode).toBe(200);
    expect(datei.headers['content-type']).toContain('application/pdf');
    expect(datei.body.startsWith('%PDF')).toBe(true);
  });

  it('führt Arzt- und Entlassbriefe im Release nur als PDF, ab der Weiterentwicklung neue Briefe zusätzlich strukturiert', async () => {
    const briefe = async () =>
      (
        (
          await app.inject({
            method: 'GET',
            url: `${MHD}/DocumentReference?status=current`,
            headers: kopf(),
          })
        ).json().entry as {
          resource: {
            description: string;
            date: string;
            content: { attachment: { contentType: string; url: string } }[];
          };
        }[]
      )
        .map((e) => e.resource)
        .filter((r) => /brief|befundbericht/i.test(r.description))
        .map((r) => ({
          titel: r.description,
          jahr: r.date.slice(0, 4),
          art: r.content[0]!.attachment.contentType,
          url: r.content[0]!.attachment.url,
        }));

    await app.inject({
      method: 'POST',
      url: '/verwaltung/betriebslage',
      payload: { ausbaustand: 'release-3.1.3' },
    });
    const imRelease = await briefe();
    expect(imRelease.length).toBe(3);
    expect(imRelease.every((b) => b.art === 'application/pdf')).toBe(true);

    // Weiterentwicklung 1 bringt Laborbefunde und Volltext, die Briefe bleiben PDF.
    await app.inject({
      method: 'POST',
      url: '/verwaltung/betriebslage',
      payload: { ausbaustand: 'weiterentwicklung' },
    });
    expect((await briefe()).every((b) => b.art === 'application/pdf')).toBe(true);

    await app.inject({
      method: 'POST',
      url: '/verwaltung/betriebslage',
      payload: { ausbaustand: 'weiterentwicklung-2' },
    });
    const weiter = await briefe();
    // Der Entlassbrief von 2026 strukturiert; der Brief von 2019 und der Befundbericht bleiben PDF.
    expect(weiter.filter((b) => b.art === 'application/fhir+json').map((b) => b.jahr)).toEqual([
      '2026',
    ]);
    expect(weiter.filter((b) => b.art === 'application/pdf')).toHaveLength(2);
    const strukturiert = weiter.find((b) => b.art === 'application/fhir+json')!;
    const bundle = (
      await app.inject({ method: 'GET', url: strukturiert.url, headers: kopf() })
    ).json() as { entry: { resource: Record<string, unknown> }[] };
    const komposition = bundle.entry[0]!.resource;
    // Nach dem Vorbild des HL7 Europe Hospital Discharge Report: LOINC 34105-7, Encounter 1..1.
    expect(JSON.stringify(komposition['type'])).toContain('34105-7');
    expect(komposition['encounter']).toBeDefined();
    const titel = (komposition['section'] as { title: string }[]).map((s) => s.title);
    expect(titel).toContain('Therapie und Verlauf');
    expect(titel).toContain('Entlassmedikation');
  });

  it('bietet die Volltextsuche erst ab Weiterentwicklung 1 an und lehnt _content vorher ab', async () => {
    const parameter = async () =>
      (
        (await app.inject({ method: 'GET', url: `${MHD}/metadata` })).json() as {
          rest: { resource: { searchParam: { name: string }[] }[] }[];
        }
      ).rest[0]!.resource[0]!.searchParam.map((p) => p.name);
    await app.inject({
      method: 'POST',
      url: '/verwaltung/betriebslage',
      payload: { ausbaustand: 'release-3.1.3' },
    });
    expect(await parameter()).not.toContain('_content');
    const abgelehnt = await app.inject({
      method: 'GET',
      url: `${MHD}/DocumentReference?_content=Vorhofflimmern`,
      headers: kopf(),
    });
    expect(abgelehnt.statusCode).toBe(400);
    await app.inject({
      method: 'POST',
      url: '/verwaltung/betriebslage',
      payload: { ausbaustand: 'weiterentwicklung' },
    });
    expect(await parameter()).toContain('_content');
  });

  it('findet Dokumente über die Volltextsuche', async () => {
    const a = await app.inject({
      method: 'GET',
      url: `${MHD}/DocumentReference?_content=Vorhofflimmern`,
      headers: kopf(),
    });
    expect(a.json().total).toBeGreaterThan(0);
    const b = await app.inject({
      method: 'GET',
      url: `${MHD}/DocumentReference?_content=Zzzyxx`,
      headers: kopf(),
    });
    expect(b.json().total).toBe(0);
  });

  it('trifft am Wortanfang, nicht mitten im Wort — und liest keinen Scan', async () => {
    const titel = async (begriff: string): Promise<string[]> => {
      const antwort = await app.inject({
        method: 'GET',
        url: `${MHD}/DocumentReference?_content=${encodeURIComponent(begriff)}`,
        headers: kopf(),
      });
      const eintraege = (antwort.json() as { entry?: { resource: unknown }[] }).entry ?? [];
      return eintraege.map((e) => JSON.stringify(e.resource));
    };
    // „niere“ findet „Niereninsuffizienz"; „lass“ nicht „Entlassbrief".
    expect((await titel('niere')).length).toBeGreaterThan(0);
    expect(await titel('lass')).toEqual([]);
    // Die handschriftliche Notiz auf dem Scan ist kein Text: „vertragen“ findet ihn nicht.
    expect((await titel('vertragen')).some((r) => r.includes('eingescannt'))).toBe(false);
  });
});

describe('Medication Service — Lesenachweis', () => {
  it('schreibt nur mit dem aktuellen Chronologieeintrag und vergibt danach einen neuen', async () => {
    const ohne = await app.inject({
      method: 'POST',
      url: `${MEDIKATION}/$add-emp-entry`,
      headers: kopf(),
      payload: neuerEintrag(),
    });
    expect(ohne.statusCode).toBe(409);

    const stand = await planLesen();
    const mit = await app.inject({
      method: 'POST',
      url: `${MEDIKATION}/$add-emp-entry`,
      headers: kopf(),
      payload: neuerEintrag(stand),
    });
    expect(mit.statusCode).toBe(200);
    const neu = parameter(mit.json().parameter as Parameter[], 'relatedChronology');
    expect(neu?.id).toBeDefined();
    expect(neu?.id).not.toBe(stand);

    // Der alte Lesenachweis ist jetzt veraltet.
    const erneut = await app.inject({
      method: 'POST',
      url: `${MEDIKATION}/$add-emp-entry`,
      headers: kopf(),
      payload: neuerEintrag(stand),
    });
    expect(erneut.statusCode).toBe(409);
  });

  it('meldet 409, wenn eine andere Einrichtung zwischendurch geändert hat', async () => {
    const stand = await planLesen();
    await app.inject({
      method: 'POST',
      url: '/verwaltung/betriebslage',
      payload: { fremdeAenderungVorSchreibzugriff: true },
    });
    const a = await app.inject({
      method: 'POST',
      url: `${MEDIKATION}/$add-emp-entry`,
      headers: kopf(),
      payload: neuerEintrag(stand),
    });
    expect(a.statusCode).toBe(409);
    expect(JSON.stringify(a.json())).toContain('CHRONOLOGY_ID_MISMATCH');
  });

  it('bildet $emp-commit nur im Stapel ab', async () => {
    const a = await app.inject({
      method: 'POST',
      url: `${MEDIKATION}/$emp-commit`,
      headers: kopf(),
      payload: {},
    });
    expect(a.statusCode).toBe(405);
  });
});

describe('✦ Diagnose-Service', () => {
  it('gibt es im Release 3.1.3 nicht', async () => {
    await app.inject({
      method: 'POST',
      url: '/verwaltung/betriebslage',
      payload: { ausbaustand: 'release-3.1.3' },
    });
    const a = await app.inject({ method: 'GET', url: `${DIENST}/metadata` });
    expect(a.statusCode).toBe(404);
  });

  it('liefert die Liste mit Chronologieeintrag und verlangt ihn beim Anlegen', async () => {
    const liste = await app.inject({
      method: 'GET',
      url: `${DIENST}/$allergy-list`,
      headers: kopf(),
    });
    expect(liste.statusCode).toBe(200);
    const chronologie = (
      liste.json().entry as {
        resource: { resourceType: string; id: string; extension?: { url: string }[] };
      }[]
    )
      .map((e) => e.resource)
      .find((r) => r.extension?.some((x) => x.url.endsWith('is-allergy-list-chronology')));
    expect(chronologie).toBeDefined();

    const eintrag = {
      resourceType: 'AllergyIntolerance',
      clinicalStatus: {
        coding: [
          {
            system: 'http://terminology.hl7.org/CodeSystem/allergyintolerance-clinical',
            code: 'active',
          },
        ],
      },
      code: {
        coding: [
          {
            system: 'http://snomed.info/sct',
            version: 'http://snomed.info/sct/11000274103/version/20260515',
            code: '387207008',
            display: 'Ibuprofen',
          },
        ],
      },
      recordedDate: '2026-09-27',
    };
    const ohne = await app.inject({
      method: 'POST',
      url: `${DIENST}/$add-allergy-entry`,
      headers: kopf(),
      payload: {
        resourceType: 'Parameters',
        parameter: [{ name: 'allergyEntry', resource: eintrag }],
      },
    });
    expect(ohne.statusCode).toBe(409);

    const mit = await app.inject({
      method: 'POST',
      url: `${DIENST}/$add-allergy-entry`,
      headers: kopf(),
      payload: {
        resourceType: 'Parameters',
        parameter: [
          { name: 'acknowledgedChronologyId', valueId: chronologie!.id },
          { name: 'allergyEntry', resource: eintrag },
        ],
      },
    });
    expect(mit.statusCode).toBe(200);
    const p = mit.json().parameter as Parameter[];
    expect(parameter(p, 'entry')?.resourceType).toBe('AllergyIntolerance');
    expect(parameter(p, 'relatedActivity')?.resourceType).toBe('Provenance');
    expect(parameter(p, 'relatedChronology')?.id).not.toBe(chronologie!.id);
  });
});

describe('✦ Patient Summary', () => {
  const PS = '/epa/vorschlag/patient-summary/api/v1/fhir';

  async function summary() {
    const a = await app.inject({ method: 'GET', url: `${PS}/Patient/$summary`, headers: kopf() });
    expect(a.statusCode).toBe(200);
    return patientSummaryLesen(a.json())!;
  }

  it('gibt es im Release 3.1.3 nicht', async () => {
    await app.inject({
      method: 'POST',
      url: '/verwaltung/betriebslage',
      payload: { ausbaustand: 'release-3.1.3' },
    });
    expect((await app.inject({ method: 'GET', url: `${PS}/metadata` })).statusCode).toBe(404);
  });

  it('bildet ein EPS-Dokument aus den Listen, dem Plan und den Laborbefunden', async () => {
    const a = await app.inject({ method: 'GET', url: `${PS}/Patient/$summary`, headers: kopf() });
    const b = a.json();
    expect(b.type).toBe('document');
    expect(b.entry[0].resource.resourceType).toBe('Composition');
    const ps = patientSummaryLesen(b)!;
    const abschnitt = (s: string) => ps.abschnitte.find((x) => x.schluessel === s)!;
    expect(abschnitt('allergien').quelle).toBe('allergy-list');
    expect(abschnitt('allergien').eintraege).toHaveLength(2);
    // Nur markierte Diagnosen; Harnwegsinfektion und Obstipation bleiben in der Liste.
    expect(abschnitt('diagnosen').eintraege).toHaveLength(2);
    expect(abschnitt('diagnosen').weitere).toBe(2);
    expect(abschnitt('allergien').weitere).toBe(0);
    expect(abschnitt('erklaerungen').leer).toBe('unavailable');
    expect(abschnitt('medikation').quelle).toBe('medication-plan');
    expect(abschnitt('medikation').eintraege).toHaveLength(4);
    // Je Untersuchung der jüngste Wert: eGFR 38 vom August, nicht 46 vom März.
    const egfr = abschnitt('laborwerte').eintraege.find((o) =>
      JSON.stringify(o['code']).includes('62238-1'),
    )!;
    expect((egfr['valueQuantity'] as { value: number }).value).toBe(38);
    // ✦ Stufe 2: Impfungen aus der Impfliste, die jüngste zuerst.
    expect(abschnitt('impfungen').quelle).toBe('immunization-list');
    expect(abschnitt('impfungen').eintraege).toHaveLength(5);
    expect(String(abschnitt('impfungen').eintraege[0]!['occurrenceDateTime'])).toBe('2025-10-21');
    // Automatisch aus dem strukturierten Entlassbrief, mit Verweis auf das Quelldokument.
    const prozedur = abschnitt('prozeduren');
    expect(prozedur.quelle).toBe('structured-documents');
    expect(JSON.stringify(prozedur.eintraege[0]!['code'])).toContain('8-640');
    expect(JSON.stringify(prozedur.eintraege[0]!.extension)).toContain('Entlassbrief');
    const implantat = abschnitt('implantate');
    expect(implantat.quelle).toBe('structured-documents');
    expect(implantat.eintraege[0]!.resourceType).toBe('DeviceUseStatement');
    const geraet = ps.ressourcen.find(
      (r) =>
        `Device/${String(r.id)}` ===
        (implantat.eintraege[0]!['device'] as { reference: string }).reference,
    );
    expect(JSON.stringify(geraet?.['type'])).toContain('14106009');
  });

  it('bietet Listen, Impfliste und Patient Summary erst ab Stufe 3, den Aktenlotsen ab Stufe 4', async () => {
    const vorhanden = async (pfad: string) =>
      (await app.inject({ method: 'GET', url: `${pfad}/metadata` })).statusCode === 200;
    const dienste = [
      '/epa/vorschlag/diagnosis/api/v1/fhir',
      '/epa/vorschlag/immunization/api/v1/fhir',
      '/epa/vorschlag/patient-summary/api/v1/fhir',
      '/epa/vorschlag/aktenlotse/api/v1',
    ];
    const erwartet: Record<string, boolean[]> = {
      weiterentwicklung: [false, false, false, false],
      'weiterentwicklung-2': [false, false, false, false],
      'weiterentwicklung-3': [true, true, true, false],
      'weiterentwicklung-4': [true, true, true, true],
    };
    for (const [ausbaustand, soll] of Object.entries(erwartet)) {
      await app.inject({
        method: 'POST',
        url: '/verwaltung/betriebslage',
        payload: { ausbaustand },
      });
      const ist = await Promise.all(dienste.map(vorhanden));
      expect([ausbaustand, ...ist]).toEqual([ausbaustand, ...soll]);
    }
  });

  it('zeigt ohne geführte Listen nur, was automatisch entsteht', async () => {
    await app.inject({
      method: 'POST',
      url: '/verwaltung/betriebslage',
      payload: { patientSummaryQuellen: 'automatisch' },
    });
    const ps = await summary();
    const abschnitt = (s: string) => ps.abschnitte.find((x) => x.schluessel === s)!;
    // Allergien und Diagnosen aus dem strukturierten Entlassbrief — ungeprüft und ohne Auswahl:
    // alle sieben aktiven Diagnosen des Briefs, auch die Harnwegsinfektion, die bei Abfassung
    // noch behandelt wurde und heute behoben ist. Die behobene Obstipation fällt weg.
    expect(abschnitt('allergien').quelle).toBe('structured-documents');
    expect(abschnitt('allergien').eintraege).toHaveLength(2);
    expect(abschnitt('diagnosen').quelle).toBe('structured-documents');
    const codes = abschnitt('diagnosen').eintraege.map((r) => JSON.stringify(r['code']));
    expect(codes).toHaveLength(7);
    expect(codes.some((c) => c.includes('N39.0'))).toBe(true);
    expect(codes.some((c) => c.includes('K59.09'))).toBe(false);
    expect(JSON.stringify(abschnitt('diagnosen').eintraege[0]!.extension)).toContain(
      'Entlassbrief',
    );
    expect(abschnitt('diagnosen').weitere).toBe(0);
    // Keine Impfung in einem strukturierten Dokument: der Abschnitt bleibt leer.
    expect(abschnitt('impfungen').leer).toBe('unavailable');
    expect(abschnitt('erklaerungen').leer).toBe('unavailable');
    // Die Medikationsliste enthält auch Metformin, das nicht im Plan steht.
    expect(abschnitt('medikation').quelle).toBe('medication-list');
    expect(abschnitt('medikation').eintraege).toHaveLength(5);
    // Prozeduren und Implantate entstehen ohnehin automatisch aus strukturierten Dokumenten.
    expect(abschnitt('prozeduren').quelle).toBe('structured-documents');
    expect(abschnitt('implantate').quelle).toBe('structured-documents');
  });

  it('zeigt eine neue Allergie erst, wenn sie markiert ist — sie folgt der Liste ohne eigenen Schreibweg', async () => {
    const liste = await app.inject({
      method: 'GET',
      url: `${DIENST}/$allergy-list`,
      headers: kopf(),
    });
    const chronologie = (
      liste.json().entry as { resource: { id: string; extension?: { url: string }[] } }[]
    )
      .map((e) => e.resource)
      .find((r) => r.extension?.some((x) => x.url.endsWith('is-allergy-list-chronology')))!;
    await app.inject({
      method: 'POST',
      url: `${DIENST}/$add-allergy-entry`,
      headers: kopf(),
      payload: {
        resourceType: 'Parameters',
        parameter: [
          { name: 'acknowledgedChronologyId', valueId: chronologie.id },
          {
            name: 'allergyEntry',
            resource: {
              resourceType: 'AllergyIntolerance',
              clinicalStatus: {
                coding: [
                  {
                    system: 'http://terminology.hl7.org/CodeSystem/allergyintolerance-clinical',
                    code: 'active',
                  },
                ],
              },
              code: {
                coding: [
                  {
                    system: 'http://snomed.info/sct',
                    version: 'http://snomed.info/sct/11000274103/version/20260515',
                    code: '387207008',
                  },
                ],
                text: 'Ibuprofen',
              },
            },
          },
        ],
      },
    });
    const allergien = async () =>
      (await summary()).abschnitte.find((x) => x.schluessel === 'allergien')!;
    // Unmarkiert: in der Liste, nicht in der Patient Summary.
    expect((await allergien()).eintraege).toHaveLength(2);
    expect((await allergien()).weitere).toBe(1);

    const nachher = await app.inject({
      method: 'GET',
      url: `${DIENST}/$allergy-list`,
      headers: kopf(),
    });
    const eintraege = (
      nachher.json().entry as {
        resource: {
          resourceType: string;
          id: string;
          code?: { text?: string };
          extension?: { url: string }[];
        };
      }[]
    ).map((e) => e.resource);
    const ibuprofen = eintraege.find((r) => r.code?.text === 'Ibuprofen')!;
    const stand = eintraege.find((r) =>
      r.extension?.some((x) => x.url.endsWith('is-allergy-list-chronology')),
    )!;
    const markiert = await app.inject({
      method: 'POST',
      url: `${DIENST}/$flag-allergy-entry`,
      headers: kopf(),
      payload: {
        resourceType: 'Parameters',
        parameter: [
          { name: 'acknowledgedChronologyId', valueId: stand.id },
          { name: 'entry', valueReference: { reference: `AllergyIntolerance/${ibuprofen.id}` } },
          { name: 'psRelevant', valueBoolean: true },
        ],
      },
    });
    expect(markiert.statusCode).toBe(200);
    expect((await allergien()).eintraege).toHaveLength(3);
    expect((await allergien()).weitere).toBe(0);

    // Wieder aufgehoben, mit veraltetem Lesenachweis: 409 — wie jede Schreibung.
    const veraltet = await app.inject({
      method: 'POST',
      url: `${DIENST}/$flag-allergy-entry`,
      headers: kopf(),
      payload: {
        resourceType: 'Parameters',
        parameter: [
          { name: 'acknowledgedChronologyId', valueId: stand.id },
          { name: 'entry', valueReference: { reference: `AllergyIntolerance/${ibuprofen.id}` } },
          { name: 'psRelevant', valueBoolean: false },
        ],
      },
    });
    expect(veraltet.statusCode).toBe(409);
  });
});

describe('✦ Aktenlotse — Rechte und Grenze', () => {
  const LOTSE = '/epa/vorschlag/aktenlotse/api/v1';

  beforeEach(async () => {
    await app.inject({
      method: 'POST',
      url: '/verwaltung/betriebslage',
      payload: { ausbaustand: 'weiterentwicklung-4' },
    });
  });

  const fragen = (frage: string, zusatz: Record<string, string> = {}) =>
    app.inject({
      method: 'POST',
      url: `${LOTSE}/frage`,
      headers: kopf({ 'content-type': 'application/json', ...zusatz }),
      payload: { frage, lesart: 'alltag' },
    });

  it('lehnt eine Bewertungsfrage ab — für Versicherte wie für die Praxis', async () => {
    const versicherte = (
      await fragen('Werde ich wieder gesund?', { 'x-demo-versicherte': HOFFMANN })
    ).json();
    expect(versicherte.grenze).toBe('bewertung');
    expect(versicherte.absaetze).toEqual([]);
    expect(versicherte.hinweis).toContain('Ärztin oder Ihrem Arzt');

    const praxis = (await fragen('Werde ich wieder gesund?')).json();
    expect(praxis.grenze).toBe('bewertung');
    expect(praxis.hinweis).toContain('bewertet nicht');
  });

  it('antwortet ohne Befugnis gar nicht — auch nicht mit einer Ablehnung', async () => {
    await app.inject({
      method: 'POST',
      url: '/verwaltung/befugnisse/entziehen',
      payload: { telematikId: PRAXIS },
    });
    const antwort = await fragen('Werde ich wieder gesund?');
    expect(antwort.statusCode).toBe(403);
    expect(antwort.json().errorCode).toBe('notEntitled');
    // Der Versichertenzugang hängt nicht an der Befugnis der Praxis.
    expect(
      (await fragen('Was vertrage ich nicht?', { 'x-demo-versicherte': HOFFMANN })).statusCode,
    ).toBe(200);
  });

  it('liest den Medikationsplan nach Widerspruch nicht — und sagt das', async () => {
    const vorher = (await fragen('Welche Medikamente nehme ich und wofür?')).json();
    expect(JSON.stringify(vorher.absaetze)).toContain('Medikationsplan');

    await app.inject({
      method: 'POST',
      url: '/verwaltung/akte',
      payload: { kvnr: HOFFMANN, medication: 'deny' },
    });
    const nachher = (await fragen('Welche Medikamente nehme ich und wofür?')).json();
    expect(JSON.stringify(nachher.absaetze)).not.toContain('Medikationsplan');
    expect(nachher.umfang.uebergangen).toContainEqual({
      titel: 'Medikationsplan (eMP)',
      grund: 'nach Widerspruch gegen den Medikationsprozess nicht einbezogen',
    });

    // Ohne lesbaren Plan keine Abweichung „fehlt im Plan".
    const kontext = (
      await app.inject({ method: 'GET', url: `${LOTSE}/kontext?anlass=`, headers: kopf() })
    ).json();
    expect(kontext.abweichungen).toEqual([]);
  });
});

describe('✦ Unklare Beschriftung und Kontaktauskunft', () => {
  const LOTSE = '/epa/vorschlag/aktenlotse/api/v1';
  const KONTAKT = '/epa/vorschlag/kontakt/api/v1';

  beforeEach(async () => {
    await app.inject({
      method: 'POST',
      url: '/verwaltung/betriebslage',
      payload: { ausbaustand: 'weiterentwicklung-4' },
    });
  });

  it('nennt die drei unklar beschrifteten Unterlagen mit ihrem Inhalt', async () => {
    const antwort = await app.inject({
      method: 'GET',
      url: `${LOTSE}/beschriftung`,
      headers: kopf(),
    });
    const liste = antwort.json() as { titel: string; lautInhalt: string; gruende: string[] }[];
    expect(liste.map((b) => [b.titel, b.lautInhalt])).toEqual([
      ['Scan_20230914_0007', 'Sonographie des Abdomens vom 14.09.2023'],
      ['Befund', 'Diabetisches Netzhaut-Screening vom 05.11.2024'],
      ['Anlage 1', 'Fußuntersuchung bei Diabetes mellitus vom 20.01.2026'],
    ]);
    expect(liste[1]!.gruende).toContain('Die Einrichtung steht nur als Abkürzung da („AGP“)');
  });

  it('ändert an den Antworten des Pitches nichts außer dem Umfang', async () => {
    const fragen = async (frage: string) =>
      (
        await app.inject({
          method: 'POST',
          url: `${LOTSE}/frage`,
          headers: kopf({ 'content-type': 'application/json' }),
          payload: { frage, lesart: 'alltag' },
        })
      ).json();
    const nieren = await fragen('Wie haben sich die Nierenwerte entwickelt?');
    expect(nieren.absaetze[0].quellen).toHaveLength(2);
    expect(JSON.stringify(nieren.absaetze)).not.toContain('10,4');
    const allergien = await fragen('Was vertrage ich nicht?');
    expect(allergien.absaetze[0].text).toContain('zwei Unverträglichkeiten');
    expect(allergien.umfang).toMatchObject({ gelesen: 9, gesamt: 10 });
  });

  it('gibt Kontakte ohne Aktenbezug heraus und findet Abkürzungen nicht', async () => {
    const gefunden = await app.inject({
      method: 'GET',
      url: `${KONTAKT}/einrichtung?name=${encodeURIComponent('Kardiologische Praxis am Wall')}`,
    });
    expect(gefunden.statusCode).toBe(200);
    expect(gefunden.json()).toEqual({
      name: 'Kardiologische Praxis am Wall',
      telefon: '0000 5544-0',
      tiMessenger: true,
    });
    const abkuerzung = await app.inject({
      method: 'GET',
      url: `${KONTAKT}/einrichtung?name=${encodeURIComponent('AGP am Markt')}`,
    });
    expect(abkuerzung.statusCode).toBe(404);
  });
});
