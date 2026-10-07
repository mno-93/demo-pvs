import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App.js';
import { startzustand } from '../daten/startdaten.js';
import { speicherStarten } from '../speicher/speicher.js';
import { epaFensterOeffnen, epaFensterSchliessen } from '../epa/fenster.js';
import { klientZuruecksetzen } from '../epa/klient.js';
import { dauerhafteBefugnis, epaAttrappe, suchergebnis } from '../testhilfe/epa-attrappe.js';

/**
 * ✦ Dieselbe Akte, dieselbe Aussage: Der Hinweis des Lotsen zu unklar beschrifteten Dokumenten
 * steht in jeder Dokumentenliste, und die Listen ordnen gleich — das Neueste oben.
 */

const LOTSE = '/epa/vorschlag/aktenlotse/api/v1';

const dokument = (id: string, titel: string, datum: string) => ({
  resourceType: 'DocumentReference',
  id,
  status: 'current',
  description: titel,
  date: datum,
  author: [{ type: 'Organization', display: 'Praxis' }],
  content: [{ attachment: { contentType: 'application/pdf', url: `/x/${id}.pdf` } }],
});

function attrappe() {
  epaAttrappe((a) => {
    if (a.pfad === `${LOTSE}/metadata`) return { status: 200, inhalt: {} };
    if (a.pfad === `${LOTSE}/beschriftung`)
      return {
        status: 200,
        inhalt: [
          {
            quelleId: 'anlage',
            titel: 'Anlage 1',
            gruende: ['Der Titel „Anlage 1“ sagt nichts über den Inhalt'],
            lautInhalt: 'Fußuntersuchung bei Diabetes mellitus vom 20.01.2026',
            datumLautInhalt: '2026-01-20',
            beleg: null,
          },
        ],
      };
    if (a.pfad.startsWith('/epa/mhd/api/v1/fhir/DocumentReference'))
      return {
        status: 200,
        // Die ePA liefert ohne zugesicherte Reihenfolge.
        inhalt: suchergebnis([
          dokument('alt', 'Entlassbrief 2019', '2019-04-05T10:00:00'),
          dokument('anlage', 'Anlage 1', '2025-02-03T11:12:00'),
          dokument('neu', 'Laborgesamtbefund', '2026-08-12T11:00:00'),
        ]),
      };
    return undefined;
  });
}

function öffne(pfad: string) {
  return render(
    <MemoryRouter initialEntries={[pfad]}>
      <App />
    </MemoryRouter>,
  );
}

describe('Dokumentenlisten mit Hinweis des Aktenlotsen', () => {
  beforeEach(() => {
    klientZuruecksetzen();
    epaFensterSchliessen();
    speicherStarten({ ...startzustand(), epaBefugnisse: [dauerhafteBefugnis('p-hoffmann')] });
    attrappe();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    epaFensterSchliessen();
  });

  it('zeigt den Hinweis in den Dokumenten der Kartei', async () => {
    öffne('/patient/p-hoffmann/dokumente');
    const hinweis = await screen.findByText(
      '✦ laut Inhalt: Fußuntersuchung bei Diabetes mellitus vom 20.01.2026',
    );
    expect(hinweis.getAttribute('title')).toContain('sagt nichts über den Inhalt');
  });

  it('zeigt ihn im ePA-Fenster und ordnet das Neueste nach oben', async () => {
    epaFensterOeffnen('p-hoffmann', 'dokumente');
    öffne('/patient/p-hoffmann/karteikarte');
    const fenster = await screen.findByRole('dialog');
    await within(fenster).findByText(/laut Inhalt: Fußuntersuchung/);
    const titel = within(fenster)
      .getAllByRole('row')
      .slice(1)
      .map((z) => z.querySelector('b')?.textContent);
    expect(titel).toEqual(['Laborgesamtbefund', 'Anlage 1', 'Entlassbrief 2019']);
  });
});
