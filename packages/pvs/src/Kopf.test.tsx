import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App.js';
import { startzustand } from './daten/startdaten.js';
import { epaFensterSchliessen } from './epa/fenster.js';
import { klientZuruecksetzen } from './epa/klient.js';
import { ausfuehren, lesen, speicherStarten } from './speicher/speicher.js';
import { vorgaenge } from './speicher/vorgaenge.js';
import { epaAttrappe } from './testhilfe/epa-attrappe.js';

/**
 * „Zurücksetzen“ im Kopf (ADR 0058): erst das Aktensystem, dann die Praxis. Scheitert das
 * Aktensystem, bleibt die Praxis, wie sie war, und der Kopf meldet den Fehler.
 */

function öffne() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <App />
    </MemoryRouter>,
  );
}

describe('Zurücksetzen', () => {
  beforeEach(() => {
    klientZuruecksetzen();
    epaFensterSchliessen();
    speicherStarten(startzustand());
    ausfuehren(vorgaenge.karteneintragAnlegen('p-hoffmann', 'A', 'Testeintrag'));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('setzt erst das Aktensystem, dann die Praxis zurück', async () => {
    const aufrufe = epaAttrappe((a) =>
      a.pfad === '/verwaltung/zuruecksetzen' ? { status: 200, inhalt: {} } : undefined,
    );
    öffne();
    fireEvent.click(screen.getByRole('button', { name: 'Zurücksetzen' }));
    await waitFor(() => expect(lesen().handlungen).toBe(0));
    expect(aufrufe.some((a) => a.pfad === '/verwaltung/zuruecksetzen')).toBe(true);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('lässt die Praxis stehen und meldet es, wenn das Aktensystem nicht zurücksetzt', async () => {
    epaAttrappe((a) =>
      a.pfad === '/verwaltung/zuruecksetzen'
        ? { status: 500, inhalt: { errorCode: 'internalError', errorDetail: 'kaputt' } }
        : undefined,
    );
    öffne();
    fireEvent.click(screen.getByRole('button', { name: 'Zurücksetzen' }));
    expect((await screen.findByRole('alert')).textContent).toContain('Zurücksetzen fehlgeschlagen');
    expect(lesen().handlungen).toBe(1);
  });
});
