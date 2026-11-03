import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  STUECK,
  dosierungNachFhir,
  textErweiterungen,
  type Dosierung,
  type Rezept,
} from '@demo-pvs/kern';
import { App } from '../App.js';
import { nutzerliste, startzustand } from '../daten/startdaten.js';
import { lesen, speicherStarten } from '../speicher/speicher.js';
import { epaFensterSchliessen } from '../epa/fenster.js';
import { klientZuruecksetzen } from '../epa/klient.js';
import { dauerhafteBefugnis, epaAttrappe, suchergebnis } from '../testhilfe/epa-attrappe.js';

/**
 * Zustand der Akte im Patientenkopf (ADR 0023), E-Rezept aus dem Plan und Signaturstapel
 * (ADR 0024), Kennzeichen der Karteikarte.
 */

const MS = '/epa/medication/api/v1/fhir';
const EMP = 'https://gematik.de/fhir/epa-medication/StructureDefinition/';

function öffne(pfad: string) {
  return render(
    <MemoryRouter initialEntries={[pfad]}>
      <App />
    </MemoryRouter>,
  );
}

/** Plan mit einem Eintrag: Ramipril, eMP-Identifier `emp-1`. */
const PLAN = {
  resourceType: 'Bundle',
  type: 'collection',
  entry: [
    {
      resource: {
        resourceType: 'Provenance',
        id: 'chron-1',
        extension: [{ url: `${EMP}is-emp-chronology-extension`, valueBoolean: true }],
        recorded: '2026-07-18T16:05:00',
        target: [{ reference: 'MedicationRequest/emp-1/_history/1' }],
      },
    },
    {
      resource: {
        resourceType: 'MedicationRequest',
        id: 'emp-1',
        meta: { versionId: '1' },
        identifier: [{ system: 'https://gematik.de/fhir/sid/emp-identifier', value: 'emp-1' }],
        status: 'active',
        intent: 'plan',
        medicationReference: { reference: 'Medication/m1' },
        dosageInstruction: [{ text: '1-0-0-0' }],
        reasonCode: [{ text: 'Arterielle Hypertonie' }],
      },
    },
    {
      resource: {
        resourceType: 'Medication',
        id: 'm1',
        code: {
          coding: [{ system: 'http://fhir.de/CodeSystem/bfarm/atc', code: 'C09AA05' }],
          text: 'Ramipril 5 mg Tabletten',
        },
      },
    },
  ],
};

type Aufruf = Parameters<Parameters<typeof epaAttrappe>[0]>[0];

function medikationsAttrappe(
  plan: unknown = PLAN,
  zusatz: (a: Aufruf) => ReturnType<Parameters<typeof epaAttrappe>[0]> = () => undefined,
) {
  return epaAttrappe((a) => {
    const eigene = zusatz(a);
    if (eigene) return eigene;
    if (a.pfad === `${MS}/$medication-list`) return { status: 200, inhalt: suchergebnis([]) };
    if (a.pfad === `${MS}/$medication-plan`) return { status: 200, inhalt: plan };
    if (a.pfad === '/erp/Task/$create') {
      return {
        status: 201,
        inhalt: {
          resourceType: 'Task',
          id: '160.000.000.000.001.53',
          status: 'draft',
          identifier: [
            {
              system: 'https://gematik.de/fhir/erp/NamingSystem/GEM_ERP_NS_PrescriptionId',
              value: '160.000.000.000.001.53',
            },
            {
              system: 'https://gematik.de/fhir/erp/NamingSystem/GEM_ERP_NS_AccessCode',
              value: 'abc',
            },
          ],
        },
      };
    }
    if (a.pfad.endsWith('/$activate')) {
      return {
        status: 200,
        inhalt: { resourceType: 'Task', id: '160.000.000.000.001.53', status: 'ready' },
      };
    }
    return undefined;
  });
}

describe('Zustand der Akte im Patientenkopf', () => {
  beforeEach(() => {
    klientZuruecksetzen();
    epaFensterSchliessen();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('zeigt „keine ePA" und sperrt das Öffnen, wenn das Aktensystem keine Akte kennt', async () => {
    epaAttrappe((a) =>
      a.pfad === '/information/api/v1/ehr'
        ? { status: 404, inhalt: { errorCode: 'noHealthRecord', errorDetail: 'keine Akte' } }
        : undefined,
    );
    speicherStarten(startzustand());
    öffne('/patient/p-weber/karteikarte');
    expect(await screen.findByText('keine ePA')).toBeDefined();
    expect((screen.getByRole('button', { name: /ePA öffnen/ }) as HTMLButtonElement).disabled).toBe(
      true,
    );
  });

  it('zeigt den Widerspruch gegen den Medikationsprozess', async () => {
    epaAttrappe((a) =>
      a.pfad === '/information/api/v1/ehr/consentdecisions'
        ? {
            status: 200,
            inhalt: {
              data: [
                { functionId: 'medication', decision: 'deny' },
                { functionId: 'erp-submission', decision: 'permit' },
              ],
            },
          }
        : undefined,
    );
    speicherStarten(startzustand());
    öffne('/patient/p-krueger/karteikarte');
    expect(await screen.findByText('Widerspruch Medikationsprozess')).toBeDefined();
  });
});

describe('E-Rezept', () => {
  beforeEach(() => {
    klientZuruecksetzen();
    epaFensterSchliessen();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  /** `$update-emp-entry` nimmt den Eintrag an und gibt ihn in neuer Fassung zurück. */
  const aktualisierung = (a: Aufruf) =>
    a.pfad === `${MS}/$update-emp-entry`
      ? {
          status: 200,
          inhalt: {
            resourceType: 'Parameters',
            parameter: [
              {
                name: 'empEntry',
                resource: {
                  ...(
                    a.koerper as { parameter: { name: string; resource?: object }[] }
                  ).parameter.find((p) => p.name === 'empEntry')!.resource,
                  meta: { versionId: '2' },
                },
              },
            ],
          },
        }
      : undefined;
  const planeintragIn = (a: { koerper: unknown }) =>
    (
      a.koerper as { parameter: { name: string; resource?: Record<string, unknown> }[] }
    ).parameter.find((p) => p.name === 'empEntry')!.resource!;

  it('ändert die Dosierung eines Planeintrags über $update-emp-entry', async () => {
    const aufrufe = medikationsAttrappe(PLAN, aktualisierung);
    speicherStarten({ ...startzustand(), epaBefugnisse: [dauerhafteBefugnis('p-hoffmann')] });
    öffne('/patient/p-hoffmann/medikation');
    const zeile = (await screen.findByText('Ramipril 5 mg Tabletten', { selector: 'b' })).closest(
      'tr',
    )!;
    fireEvent.click(within(zeile).getByRole('button', { name: 'Dosierung ändern' }));
    const gruppe = screen.getByRole('group', { name: /Dosierung ändern/ });
    fireEvent.change(within(gruppe).getByLabelText('abends'), { target: { value: '1' } });
    fireEvent.click(within(gruppe).getByRole('button', { name: 'Dosierung übernehmen' }));
    expect(await screen.findByText(/im Medikationsplan der ePA geändert/)).toBeDefined();
    const eintrag = planeintragIn(aufrufe.find((a) => a.pfad.endsWith('$update-emp-entry'))!);
    expect(JSON.stringify(eintrag['extension'])).toContain('täglich: 1-0-1-0 Stück');
    // Die Fassung des gelesenen Eintrags geht mit — sonst 409 MSG_VERSION_AWARE_CONFLICT.
    expect(eintrag['meta']).toEqual({ versionId: '1' });
  });

  it('passt beim Verordnen aus dem Plan mit neuer Dosierung den Planeintrag an', async () => {
    const aufrufe = medikationsAttrappe(PLAN, aktualisierung);
    speicherStarten({ ...startzustand(), epaBefugnisse: [dauerhafteBefugnis('p-hoffmann')] });
    öffne('/patient/p-hoffmann/medikation');
    const zeile = (await screen.findByText('Ramipril 5 mg Tabletten', { selector: 'b' })).closest(
      'tr',
    )!;
    fireEvent.click(within(zeile).getByRole('button', { name: 'Rezept' }));
    expect(screen.queryByText('Dosierung im Plan anpassen')).toBeNull();
    fireEvent.change(screen.getByLabelText('abends'), { target: { value: '1' } });
    expect(screen.getByText('Dosierung im Plan anpassen')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Signieren und senden' }));
    expect(await screen.findByText('E-Rezept signiert und gesendet.')).toBeDefined();
    const pfade = aufrufe.map((a) => a.pfad);
    const update = pfade.findIndex((p) => p.endsWith('$update-emp-entry'));
    expect(update).toBeGreaterThanOrEqual(0);
    expect(update).toBeLessThan(pfade.indexOf('/erp/Task/$create'));
    expect(JSON.stringify(planeintragIn(aufrufe[update]!)['extension'])).toContain(
      'täglich: 1-0-1-0 Stück',
    );
  });

  it('verordnet aus dem Plan und gibt den eMP-Identifier mit', async () => {
    const aufrufe = medikationsAttrappe();
    speicherStarten({ ...startzustand(), epaBefugnisse: [dauerhafteBefugnis('p-hoffmann')] });
    öffne('/patient/p-hoffmann/medikation');
    fireEvent.click(await screen.findByRole('button', { name: 'Rezept' }));
    expect(screen.getByText(/Reichweite 100 Tage/)).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Signieren und senden' }));
    expect(await screen.findByText('E-Rezept signiert und gesendet.')).toBeDefined();

    const aktivierung = aufrufe.find((a) => a.pfad.endsWith('/$activate'))!;
    expect(aktivierung.kopf['X-AccessCode']).toBe('abc');
    const binary = (aktivierung.koerper as { parameter: { resource: { data: string } }[] })
      .parameter[0]!.resource;
    const bundle = JSON.parse(decodeURIComponent(escape(atob(binary.data)))) as {
      entry: { resource: { resourceType: string; basedOn?: unknown } }[];
    };
    const verordnung = bundle.entry.find((e) => e.resource.resourceType === 'MedicationRequest')!;
    expect(verordnung.resource.basedOn).toEqual([
      { identifier: { system: 'https://gematik.de/fhir/sid/emp-identifier', value: 'emp-1' } },
    ]);
    const rezept = lesen().rezepte[0]!;
    expect(rezept.status).toBe('gesendet');
    expect(rezept.rezeptId).toBe('160.000.000.000.001.53');
    expect(rezept.empId).toBe('emp-1');
  });

  it('löscht den Entwurf im Fachdienst, wenn die Aktivierung scheitert, und lässt das Rezept vorbereitet', async () => {
    const aufrufe = epaAttrappe((a) => {
      if (a.pfad === `${MS}/$medication-list`) return { status: 200, inhalt: suchergebnis([]) };
      if (a.pfad === `${MS}/$medication-plan`) return { status: 200, inhalt: PLAN };
      if (a.pfad === '/erp/Task/$create')
        return {
          status: 201,
          inhalt: {
            resourceType: 'Task',
            id: '160.000.000.000.001.53',
            status: 'draft',
            identifier: [
              {
                system: 'https://gematik.de/fhir/erp/NamingSystem/GEM_ERP_NS_PrescriptionId',
                value: '160.000.000.000.001.53',
              },
              {
                system: 'https://gematik.de/fhir/erp/NamingSystem/GEM_ERP_NS_AccessCode',
                value: 'abc',
              },
            ],
          },
        };
      if (a.pfad.endsWith('/$activate'))
        return {
          status: 400,
          inhalt: {
            resourceType: 'OperationOutcome',
            issue: [{ severity: 'error', code: 'invalid', diagnostics: 'Signatur ungültig' }],
          },
        };
      if (a.pfad.endsWith('/$abort')) return { status: 204 };
      return undefined;
    });
    speicherStarten({ ...startzustand(), epaBefugnisse: [dauerhafteBefugnis('p-hoffmann')] });
    öffne('/patient/p-hoffmann/medikation');
    fireEvent.click(await screen.findByRole('button', { name: 'Rezept' }));
    fireEvent.click(screen.getByRole('button', { name: 'Signieren und senden' }));
    expect(await screen.findByText(/Signatur ungültig/)).toBeDefined();
    const abbruch = aufrufe.find((a) => a.pfad.endsWith('/$abort'));
    expect(abbruch?.pfad).toBe('/erp/Task/160.000.000.000.001.53/$abort');
    expect(abbruch?.kopf['X-AccessCode']).toBe('abc');
    expect(lesen().rezepte[0]!.status).toBe('vorbereitet');
  });

  it('übernimmt die strukturierte Dosierung des Planeintrags samt Reichweite (ADR 0052)', async () => {
    const woechentlich: Dosierung = {
      schema: { art: 'wochentage', gaben: [{ tag: 'mon', menge: 1 }] },
      einheit: STUECK,
    };
    const dosage = dosierungNachFhir(woechentlich);
    const plan = structuredClone(PLAN);
    const eintrag = plan.entry[1]!.resource as Record<string, unknown>;
    eintrag['dosageInstruction'] = dosage;
    eintrag['extension'] = textErweiterungen('MedicationRequest', dosage);
    const aufrufe = medikationsAttrappe(plan);
    speicherStarten({ ...startzustand(), epaBefugnisse: [dauerhafteBefugnis('p-hoffmann')] });
    öffne('/patient/p-hoffmann/medikation');
    fireEvent.click(await screen.findByRole('button', { name: 'Rezept' }));
    expect(screen.getAllByText(/montags — je 1 Stück/).length).toBeGreaterThan(1);
    expect(screen.getByText(/Reichweite 700 Tage/)).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Signieren und senden' }));
    expect(await screen.findByText('E-Rezept signiert und gesendet.')).toBeDefined();
    const aktivierung = aufrufe.find((a) => a.pfad.endsWith('/$activate'))!;
    const binary = (aktivierung.koerper as { parameter: { resource: { data: string } }[] })
      .parameter[0]!.resource;
    const bundle = JSON.parse(decodeURIComponent(escape(atob(binary.data)))) as {
      entry: { resource: { resourceType: string; dosageInstruction?: unknown } }[];
    };
    expect(
      bundle.entry.find((e) => e.resource.resourceType === 'MedicationRequest')!.resource
        .dosageInstruction,
    ).toEqual(dosage);
    const rezept = lesen().rezepte[0]!;
    expect(rezept.dosierung).toBe('montags — je 1 Stück');
    expect(rezept.dosis).toMatchObject(woechentlich);
  });

  it('lässt die MFA vorbereiten, ohne den Fachdienst anzusprechen; der Stapel zählt mit', async () => {
    const aufrufe = medikationsAttrappe();
    speicherStarten({
      ...startzustand(),
      nutzer: nutzerliste[1]!,
      epaBefugnisse: [dauerhafteBefugnis('p-hoffmann')],
    });
    öffne('/patient/p-hoffmann/medikation');
    fireEvent.click(await screen.findByRole('button', { name: 'Rezept' }));
    expect(screen.queryByRole('button', { name: 'Signieren und senden' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Zur Signatur vorbereiten' }));
    await waitFor(() => expect(lesen().rezepte).toHaveLength(1));
    expect(lesen().rezepte[0]!.status).toBe('vorbereitet');
    expect(aufrufe.some((a) => a.pfad.startsWith('/erp/'))).toBe(false);
    const navi = screen.getByRole('navigation', { name: 'Hauptbereiche' });
    expect(within(navi).getByLabelText('1 zur Signatur')).toBeDefined();
  });
});

describe('Karteikarte', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('kennzeichnet, was in die ePA gelangt ist, und filtert danach', async () => {
    epaAttrappe(() => undefined);
    const rezept: Rezept = {
      id: 'r1',
      patientId: 'p-krueger',
      arzneimittel: {
        bezeichnung: 'Salbutamol 100 µg Dosieraerosol',
        pzn: '90900040',
        atc: 'R03AC02',
        atcVersion: '2026',
      },
      dosierung: 'bei Bedarf',
      packungen: 1,
      normgroesse: 'N1',
      empId: null,
      grund: 'Asthma',
      status: 'gesendet',
      freigabe: 'freigegeben',
      hinweis: null,
      erstelltAm: '2026-09-09T09:05:00',
      vorbereitetVon: 'Dr. med. Anna Brandt',
      rezeptId: '160.000.000.000.002.50',
      accessCode: 'x',
      signiertVon: 'Dr. med. Anna Brandt',
      gesendetAm: '2026-09-09T09:06:00',
      geloeschtAm: null,
    };
    speicherStarten({ ...startzustand(), rezepte: [rezept] });
    öffne('/patient/p-krueger/karteikarte');
    expect(await screen.findByText(/Salbutamol 100 µg Dosieraerosol/)).toBeDefined();
    expect(screen.getAllByLabelText('in der ePA').length).toBeGreaterThan(0);
    fireEvent.change(screen.getByLabelText('ePA'), { target: { value: 'aus-epa' } });
    expect(screen.queryByText(/Salbutamol 100 µg Dosieraerosol/)).toBeNull();
  });
});

describe('Medikationsliste und Plan', () => {
  beforeEach(() => {
    klientZuruecksetzen();
    epaFensterSchliessen();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const mittel = (id: string, text: string) => ({
    resourceType: 'Medication',
    id,
    code: {
      coding: [{ system: 'http://fhir.de/CodeSystem/bfarm/atc', code: 'C09AA05' }],
      text,
    },
  });
  const aussage = (id: string, mittelId: string, start: string, verknuepft: boolean) => ({
    resourceType: 'MedicationStatement',
    id,
    status: 'active',
    medicationReference: { reference: `Medication/${mittelId}` },
    effectivePeriod: { start },
    ...(verknuepft
      ? {
          basedOn: [
            {
              reference: 'MedicationRequest/emp-1',
              extension: [{ url: `${EMP}is-emp-extension`, valueBoolean: true }],
            },
          ],
        }
      : {}),
  });

  it('zeigt je Eintrag Verordnung und Abgabe, Substitution als „(S)“ und Nachträge', async () => {
    const verordnung = {
      resourceType: 'MedicationRequest',
      id: 'mr-1',
      authoredOn: '2026-08-01',
      requester: { display: 'Dr. med. Anna Brandt, Hausarztpraxis am Stadtgarten' },
    };
    const abgabe = {
      resourceType: 'MedicationDispense',
      id: 'md-1',
      whenHandedOver: '2026-08-03',
      performer: [{ actor: { display: 'Apotheke am Markt' } }],
      substitution: { wasSubstituted: true },
    };
    const eingeloest = {
      ...aussage('ms-1', 'm1', '2026-08-03', false),
      derivedFrom: [
        { reference: 'MedicationRequest/mr-1' },
        { reference: 'MedicationDispense/md-1' },
      ],
    };
    const offen = {
      ...aussage('ms-2', 'm10', '2026-09-01', false),
      derivedFrom: [{ reference: 'MedicationRequest/mr-2' }],
    };
    const nachtrag = {
      ...aussage('ms-3', 'm20', '2026-07-01', false),
      extension: [{ url: `${EMP}context-extension`, valueCode: 'MANUAL' }],
    };
    epaAttrappe((a) => {
      if (a.pfad === `${MS}/$medication-list`)
        return {
          status: 200,
          inhalt: suchergebnis(
            [eingeloest, offen, nachtrag] as never,
            [
              mittel('m1', 'Ramipril 5 mg Tabletten'),
              mittel('m10', 'Ramipril 10 mg Tabletten'),
              mittel('m20', 'Ibuprofen 400 mg Tabletten'),
              verordnung,
              { ...verordnung, id: 'mr-2', authoredOn: '2026-09-01' },
              abgabe,
            ] as never,
          ),
        };
      if (a.pfad === `${MS}/$medication-plan`) return { status: 200, inhalt: PLAN };
      return undefined;
    });
    speicherStarten({ ...startzustand(), epaBefugnisse: [dauerhafteBefugnis('p-hoffmann')] });
    öffne('/patient/p-hoffmann/medikation');

    const zeile = async (text: string) =>
      (await screen.findAllByText(text))
        .map((e) => e.closest('tr'))
        .find((tr) => tr?.closest('table')?.querySelector('th')?.textContent === 'Verordnung')!;
    const fuenf = await zeile('Ramipril 5 mg Tabletten');
    expect(within(fuenf).getByText('01.08.2026')).toBeDefined();
    expect(within(fuenf).getByText('03.08.2026', { exact: false })).toBeDefined();
    expect(within(fuenf).getByTitle('Substitution').textContent).toBe('(S)');
    expect(within(fuenf).getByText('Apotheke am Markt')).toBeDefined();
    expect(
      within(await zeile('Ramipril 10 mg Tabletten')).getByText('nicht eingelöst'),
    ).toBeDefined();
    expect(within(await zeile('Ibuprofen 400 mg Tabletten')).getByText('Nachtrag')).toBeDefined();
  });

  it('nennt nur Verknüpfte „im Plan“; derselbe Wirkstoff ist ein Hinweis mit „verknüpfen“', async () => {
    const aufrufe = epaAttrappe((a) => {
      if (a.pfad === `${MS}/$medication-list`)
        return {
          status: 200,
          inhalt: suchergebnis(
            [
              aussage('ms-1', 'm1', '2026-08-01', true),
              aussage('ms-2', 'm10', '2026-09-01', false),
            ] as never,
            [
              mittel('m1', 'Ramipril 5 mg Tabletten'),
              mittel('m10', 'Ramipril 10 mg Tabletten'),
            ] as never,
          ),
        };
      if (a.pfad === `${MS}/$medication-plan`) return { status: 200, inhalt: PLAN };
      if (a.pfad === `${MS}/MedicationStatement/ms-2/$link-emp`)
        return {
          status: 200,
          inhalt: {
            resourceType: 'Parameters',
            parameter: [
              { name: 'empEntry', resource: PLAN.entry[1]!.resource },
              {
                name: 'relatedChronology',
                resource: { resourceType: 'Provenance', id: 'chron-2' },
              },
            ],
          },
        };
      return undefined;
    });
    speicherStarten({ ...startzustand(), epaBefugnisse: [dauerhafteBefugnis('p-hoffmann')] });
    öffne('/patient/p-hoffmann/medikation');

    const zehn = (await screen.findByText('Ramipril 10 mg Tabletten')).closest('tr')!;
    expect(within(zehn).getByText('nicht im Plan')).toBeDefined();
    expect(within(zehn).getByText('Wirkstoff im Plan: Ramipril 5 mg Tabletten')).toBeDefined();
    const fuenf = screen
      .getAllByText('Ramipril 5 mg Tabletten')
      .map((e) => e.closest('tr'))
      .find((tr) => tr && within(tr).queryByText('im Plan'))!;
    expect(within(fuenf).getByText('im Plan')).toBeDefined();
    expect(within(fuenf).queryByRole('button', { name: /verknüpfen/ })).toBeNull();

    fireEvent.click(
      within(zehn).getByRole('button', { name: 'verknüpfen mit Ramipril 5 mg Tabletten' }),
    );
    expect(await screen.findByText('Mit dem Planeintrag verknüpft.')).toBeDefined();
    const verknuepfung = aufrufe.find((a) => a.pfad.endsWith('/ms-2/$link-emp'))!;
    expect(verknuepfung.koerper).toMatchObject({
      parameter: expect.arrayContaining([
        {
          name: 'medicationPlanIdentifier',
          valueIdentifier: { system: 'https://gematik.de/fhir/sid/emp-identifier', value: 'emp-1' },
        },
      ]),
    });
  });
});
