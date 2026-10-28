import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Rezept } from '@demo-pvs/kern';
import { App } from '../App.js';
import { startzustand } from '../daten/startdaten.js';
import { lesen, speicherStarten } from '../speicher/speicher.js';
import { epaFensterSchliessen } from '../epa/fenster.js';
import { klientZuruecksetzen } from '../epa/klient.js';
import { epaAttrappe } from '../testhilfe/epa-attrappe.js';

/**
 * Medikationsplan der Praxis ohne Akte (ADR 0045): Frau Weber hat keine ePA. Der Plan entsteht
 * im Praxissystem — beim Verordnen, aus vorhandenen Rezepten und als neuer Planeintrag.
 */

function öffne(pfad: string) {
  return render(
    <MemoryRouter initialEntries={[pfad]}>
      <App />
    </MemoryRouter>,
  );
}

function planKarte(): HTMLElement {
  return screen.getByText('Medikationsplan der Praxis').closest('section')!;
}

/** Kein Aktensystem für Frau Weber; der Fachdienst-Ersatz nimmt Rezepte an. */
function ohneAkte() {
  return epaAttrappe((a) => {
    if (a.pfad === '/information/api/v1/ehr')
      return { status: 404, inhalt: { errorCode: 'noHealthRecord', errorDetail: 'keine Akte' } };
    if (a.pfad === '/erp/Task/$create') {
      return {
        status: 201,
        inhalt: {
          resourceType: 'Task',
          id: '160.000.000.000.003.10',
          status: 'draft',
          identifier: [
            {
              system: 'https://gematik.de/fhir/erp/NamingSystem/GEM_ERP_NS_PrescriptionId',
              value: '160.000.000.000.003.10',
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
        inhalt: { resourceType: 'Task', id: '160.000.000.000.003.10', status: 'ready' },
      };
    }
    return undefined;
  });
}

const RAMIPRIL: Rezept = {
  id: 'r-weber-1',
  patientId: 'p-weber',
  arzneimittel: {
    bezeichnung: 'Ramipril 5 mg Tabletten',
    pzn: '90900021',
    atc: 'C09AA05',
    atcVersion: '2026',
  },
  dosierung: '1-0-0-0',
  packungen: 1,
  normgroesse: 'N3',
  empId: null,
  grund: 'Arterielle Hypertonie',
  status: 'gesendet',
  freigabe: 'freigegeben',
  hinweis: null,
  erstelltAm: '2026-09-09T09:05:00',
  vorbereitetVon: 'Dr. med. Anna Brandt',
  rezeptId: '160.000.000.000.003.01',
  accessCode: 'x',
  signiertVon: 'Dr. med. Anna Brandt',
  gesendetAm: '2026-09-09T09:06:00',
  geloeschtAm: null,
};

describe('Medikationsplan der Praxis ohne Akte', () => {
  beforeEach(() => {
    klientZuruecksetzen();
    epaFensterSchliessen();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('nimmt ein neues E-Rezept beim Verordnen in den Plan auf', async () => {
    ohneAkte();
    speicherStarten(startzustand());
    öffne('/patient/p-weber/medikation');
    expect(await screen.findByText('Medikationsplan der Praxis')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'neues E-Rezept' }));
    fireEvent.change(screen.getByRole('combobox', { name: 'Neues E-Rezept' }), {
      target: { value: 'Ramipril 5' },
    });
    fireEvent.click(screen.getByRole('option', { name: /Ramipril 5 mg Tabletten/ }));
    const auchInPlan = screen.getByRole('checkbox', {
      name: 'Auch in den Medikationsplan aufnehmen',
    }) as HTMLInputElement;
    expect(auchInPlan.checked).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Signieren und senden' }));
    expect(await screen.findByText('E-Rezept signiert und gesendet.')).toBeDefined();

    const { rezepte, praxisplan } = lesen();
    expect(rezepte).toHaveLength(1);
    expect(rezepte[0]!.status).toBe('gesendet');
    expect(praxisplan).toHaveLength(1);
    expect(praxisplan[0]).toMatchObject({
      patientId: 'p-weber',
      atc: 'C09AA05',
      status: 'aktiv',
      rezeptIds: [rezepte[0]!.id],
    });
    const plan = planKarte();
    expect(within(plan).getByText('Ramipril 5 mg Tabletten')).toBeDefined();
    expect(within(plan).getByText(/verordnet/)).toBeDefined();
    expect(screen.getAllByText('keine ePA').length).toBeGreaterThan(0);
  });

  it('übernimmt ein vorhandenes Rezept in den Plan', async () => {
    ohneAkte();
    speicherStarten({ ...startzustand(), rezepte: [RAMIPRIL] });
    öffne('/patient/p-weber/medikation');
    const knopf = await screen.findByRole('button', { name: 'in den Plan' });
    fireEvent.click(knopf);
    await waitFor(() => expect(lesen().praxisplan).toHaveLength(1));
    expect(lesen().praxisplan[0]).toMatchObject({
      bezeichnung: 'Ramipril 5 mg Tabletten',
      dosierung: '1-0-0-0',
      grund: 'Arterielle Hypertonie',
      rezeptIds: ['r-weber-1'],
    });
    expect(screen.queryByRole('button', { name: 'in den Plan' })).toBeNull();
  });

  it('verordnet aus dem Plan und ordnet das Rezept dem Eintrag zu', async () => {
    ohneAkte();
    speicherStarten({ ...startzustand(), rezepte: [RAMIPRIL] });
    öffne('/patient/p-weber/medikation');
    fireEvent.click(await screen.findByRole('button', { name: 'in den Plan' }));
    const plan = planKarte();
    fireEvent.click(within(plan).getByRole('button', { name: 'Rezept' }));
    fireEvent.click(screen.getByRole('button', { name: 'Signieren und senden' }));
    expect(await screen.findByText('E-Rezept signiert und gesendet.')).toBeDefined();
    const { praxisplan, rezepte } = lesen();
    expect(praxisplan).toHaveLength(1);
    expect(praxisplan[0]!.rezeptIds).toEqual(['r-weber-1', rezepte[1]!.id]);
  });

  it('setzt ab — das Mittel kann danach wieder aufgenommen werden', async () => {
    ohneAkte();
    speicherStarten({ ...startzustand(), rezepte: [RAMIPRIL] });
    öffne('/patient/p-weber/medikation');
    fireEvent.click(await screen.findByRole('button', { name: 'in den Plan' }));
    fireEvent.click(screen.getByRole('button', { name: 'absetzen' }));
    expect(lesen().praxisplan[0]!.status).toBe('abgesetzt');
    expect(screen.getByRole('button', { name: 'in den Plan' })).toBeDefined();
  });

  it('zeigt Plan und Rezepte in der Karteikarte als Bestand der Praxis, ohne Bezug zur ePA', async () => {
    ohneAkte();
    speicherStarten({ ...startzustand(), rezepte: [RAMIPRIL] });
    öffne('/patient/p-weber/medikation');
    fireEvent.click(await screen.findByRole('button', { name: 'in den Plan' }));
    fireEvent.click(screen.getAllByRole('link', { name: 'Karteikarte' })[0]!);
    expect(await screen.findByText('Medikationsplan der Praxis · aktiv')).toBeDefined();
    expect(screen.queryByText(/Medikationsplan in der ePA/)).toBeNull();
    await waitFor(() => expect(screen.queryAllByLabelText('in der ePA')).toHaveLength(0));
  });
});
