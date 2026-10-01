import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Rezept } from '@demo-pvs/kern';
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

function medikationsAttrappe() {
  return epaAttrappe((a) => {
    if (a.pfad === `${MS}/$medication-list`) return { status: 200, inhalt: suchergebnis([]) };
    if (a.pfad === `${MS}/$medication-plan`) return { status: 200, inhalt: PLAN };
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
