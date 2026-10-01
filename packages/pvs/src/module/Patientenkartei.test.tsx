import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App.js';
import { startzustand } from '../daten/startdaten.js';
import { speicherStarten } from '../speicher/speicher.js';
import { epaFensterSchliessen } from '../epa/fenster.js';
import { klientZuruecksetzen } from '../epa/klient.js';
import { epaAttrappe } from '../testhilfe/epa-attrappe.js';

/**
 * Regressionsschutz für die Reiter der Patientenkartei.
 *
 * Eine frühere Fassung hängte die Bereiche über eine Sammelroute mit eigenen <Routes>
 * darunter ein. Relative Verweise lösten sich dann gegen den bereits verbrauchten Pfad
 * auf: Aus „diagnosen" wurde „karteikarte/diagnosen", und der Reiterwechsel lief ins
 * Leere. Der Fehler war in der Anwendung sofort sichtbar, im Quelltext aber nicht —
 * genau der Fall, für den ein Test da ist.
 */

function öffne(pfad: string) {
  speicherStarten(startzustand());
  return render(
    <MemoryRouter initialEntries={[pfad]}>
      <App />
    </MemoryRouter>,
  );
}

describe('Reiter der Patientenkartei', () => {
  beforeEach(() => {
    speicherStarten(startzustand());
    epaFensterSchliessen();
    klientZuruecksetzen();
    // Kein Aktensystem im Test: Jeder Zugriff wird beantwortet, als gäbe es den Weg nicht.
    epaAttrappe(() => undefined);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('verweist auf Geschwisterpfade, nicht auf Unterpfade des aktuellen Bereichs', () => {
    öffne('/patient/p-hoffmann/karteikarte');
    const reiter = screen.getByRole('navigation', { name: /Bereiche der Patientenkartei/i });

    for (const [beschriftung, ziel] of [
      ['Karteikarte', '/patient/p-hoffmann/karteikarte'],
      ['Diagnosen und Allergien', '/patient/p-hoffmann/diagnosen'],
      ['Medikation', '/patient/p-hoffmann/medikation'],
      ['Labor', '/patient/p-hoffmann/labor'],
      ['Dokumente', '/patient/p-hoffmann/dokumente'],
      ['Abrechnung', '/patient/p-hoffmann/abrechnung'],
      ['Stammdaten', '/patient/p-hoffmann/stammdaten'],
    ] as const) {
      expect(within(reiter).getByRole('link', { name: beschriftung })).toHaveProperty(
        'pathname',
        ziel,
      );
    }
  });

  it('behält die Geschwisterpfade auch aus einem anderen Bereich heraus bei', () => {
    öffne('/patient/p-hoffmann/abrechnung');
    const reiter = screen.getByRole('navigation', { name: /Bereiche der Patientenkartei/i });
    expect(within(reiter).getByRole('link', { name: 'Diagnosen und Allergien' })).toHaveProperty(
      'pathname',
      '/patient/p-hoffmann/diagnosen',
    );
  });

  it('stellt den gewählten Bereich dar', () => {
    öffne('/patient/p-hoffmann/diagnosen');
    expect(screen.getByRole('heading', { name: 'Diagnosen' })).toBeDefined();
    expect(
      screen.getByText('Essentielle Hypertonie, ohne Angabe einer hypertensiven Krise'),
    ).toBeDefined();
  });

  it('leitet von der Kartei ohne Bereich auf die Karteikarte weiter', () => {
    öffne('/patient/p-hoffmann');
    expect(screen.getByRole('heading', { name: 'Verlauf' })).toBeDefined();
  });

  it('zeigt den Patientenkopf mit den Angaben, die ständig sichtbar sein müssen', () => {
    öffne('/patient/p-hoffmann/karteikarte');
    expect(screen.getByText('Hoffmann, Renate')).toBeDefined();
    expect(screen.getByText(/A123456780/)).toBeDefined();
    expect(screen.getByText(/2 Allergien dokumentiert/)).toBeDefined();
  });
});

/**
 * Die ePA ist kein Reiter, sondern ein Fenster über der Kartei (ADR 0014). Eine frühere
 * Fassung ließ ein ePA-Feld offen, das sich nicht mehr schließen ließ.
 */
describe('ePA als Fenster', () => {
  beforeEach(() => {
    speicherStarten(startzustand());
    epaFensterSchliessen();
    klientZuruecksetzen();
    // Kein Aktensystem im Test: Jeder Zugriff wird beantwortet, als gäbe es den Weg nicht.
    epaAttrappe(() => undefined);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('führt die ePA nicht als Reiter der Kartei', () => {
    öffne('/patient/p-hoffmann/karteikarte');
    const reiter = screen.getByRole('navigation', { name: /Bereiche der Patientenkartei/i });
    expect(within(reiter).queryByRole('link', { name: /ePA/ })).toBeNull();
  });

  it('öffnet die ePA aus dem Patientenkopf als Dialog und schließt sie wieder', () => {
    öffne('/patient/p-hoffmann/karteikarte');
    fireEvent.click(screen.getByRole('button', { name: /ePA öffnen/ }));
    const dialog = screen.getByRole('dialog', { name: 'Elektronische Patientenakte' });
    expect(within(dialog).getByRole('button', { name: 'Dokumente' })).toBeDefined();
    fireEvent.click(within(dialog).getByRole('button', { name: 'ePA schließen' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('schließt die ePA mit der Escape-Taste', () => {
    öffne('/patient/p-hoffmann/karteikarte');
    fireEvent.click(screen.getByRole('button', { name: /ePA öffnen/ }));
    expect(screen.getByRole('dialog')).toBeDefined();
    act(() => {
      fireEvent.keyDown(window, { key: 'Escape' });
    });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('öffnet bei der früheren Adresse des Reiters die Karteikarte und das Fenster', () => {
    öffne('/patient/p-hoffmann/epa');
    expect(screen.getByRole('heading', { name: 'Verlauf' })).toBeDefined();
    expect(screen.getByRole('dialog', { name: 'Elektronische Patientenakte' })).toBeDefined();
  });
});

describe('Zurücksetzen', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('setzt Praxis und Aktensystem gemeinsam zurück', async () => {
    klientZuruecksetzen();
    const aufrufe = epaAttrappe((a) =>
      a.pfad === '/verwaltung/zuruecksetzen'
        ? { status: 200, inhalt: { zurueckgesetzt: true } }
        : undefined,
    );
    speicherStarten(startzustand());
    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Zurücksetzen' }));
    await vi.waitFor(() =>
      expect(
        aufrufe.some((a) => a.methode === 'POST' && a.pfad === '/verwaltung/zuruecksetzen'),
      ).toBe(true),
    );
  });
});
