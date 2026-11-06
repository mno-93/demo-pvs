import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { simulatorImBrowser } from '@demo-pvs/epa-sim/browser';
import { App } from '../App.js';
import { startzustand } from '../daten/startdaten.js';
import { speicherStarten } from '../speicher/speicher.js';
import { epaFensterSchliessen } from '../epa/fenster.js';
import { klientZuruecksetzen } from '../epa/klient.js';
import { SIMULATORWEGE, transportSetzen } from '../epa/transport.js';
import { schrittAusfuehren, wertSetzen } from './ausfuehren.js';
import { finden } from './finden.js';
import KlickpfadEbene from './Ebene.js';
import { SZENARIEN } from './szenarien/index.js';

/** Die Ebene eines Klickpfads über der echten Demo: Sperre im geführten Modus, Protokoll als Aufgabe. */

const S = SZENARIEN['diagnose-in-ps']!;

beforeAll(() => {
  const sim = simulatorImBrowser();
  transportSetzen((pfad, init) =>
    SIMULATORWEGE.test(pfad)
      ? sim.abrufen(new Request(new URL(pfad, 'http://localhost'), init))
      : Promise.reject(new Error(`Kein Simulatorweg: ${pfad}`)),
  );
});

beforeEach(() => {
  speicherStarten(startzustand());
  klientZuruecksetzen();
  epaFensterSchliessen();
});

afterEach(() => {
  vi.restoreAllMocks();
});

function oeffne(modus: 'gefuehrt' | 'aufgabe') {
  render(
    <MemoryRouter initialEntries={['/']}>
      <App />
      <KlickpfadEbene id={S.id} modus={modus} />
    </MemoryRouter>,
  );
  return screen.getByRole('complementary', { name: 'Klickpfad' });
}

describe('Klickpfad-Ebene', () => {
  it('sperrt geführt alles außer dem nächsten Element und schaltet bei erfüllter Eingabe weiter', async () => {
    const leiste = oeffne('gefuehrt');
    await waitFor(() =>
      expect(within(leiste).getByText('„Migräne“ suchen').getAttribute('aria-current')).toBe(
        'step',
      ),
    );
    await screen.findByRole('combobox', { name: 'Diagnose suchen — Kodierservice' });
    // Ein Klick daneben wird abgefangen: Die Ansicht bleibt, der Hinweis erscheint.
    fireEvent.click(screen.getByRole('button', { name: 'Allergie' }));
    expect(screen.getByRole('combobox', { name: 'Diagnose suchen — Kodierservice' })).toBeDefined();
    expect(within(leiste).getByText(/hier geht es weiter/)).toBeDefined();

    act(() => wertSetzen(finden(S.schritte[0]!.ziel)!, 'Migräne'));
    await waitFor(() =>
      expect(within(leiste).getByText('Treffer übernehmen').getAttribute('aria-current')).toBe(
        'step',
      ),
    );
  });

  it('zählt als Aufgabe Fehlklicks und Hilfe und gibt das Protokoll nur lokal heraus', async () => {
    const leiste = oeffne('aufgabe');
    await waitFor(() =>
      expect(within(leiste).getByRole('button', { name: 'Hilfe: nächster Schritt' })).toBeDefined(),
    );
    // Keine Schrittliste — die Testperson sieht nur die Aufgabe.
    expect(within(leiste).queryByText('„Migräne“ suchen')).toBeNull();
    expect(within(leiste).getByText(S.aufgabe)).toBeDefined();

    await screen.findByRole('combobox', { name: 'Diagnose suchen — Kodierservice' });
    fireEvent.click(screen.getByRole('button', { name: 'Diagnose' }));
    fireEvent.click(within(leiste).getByRole('button', { name: 'Hilfe: nächster Schritt' }));
    // Ohne Pausen: Auch schnelle Klicks hinter erfüllten Schritten werden erkannt (Vorgriff).
    for (const schritt of S.schritte) await act(() => schrittAusfuehren(schritt));
    await waitFor(() => expect(within(leiste).getByText('Geschafft.')).toBeDefined());
    expect(within(leiste).getByText(/1 Fehlklick · 1 Hilfe/)).toBeDefined();

    // jsdom kennt keine Objekt-URLs; das Protokoll wird hier abgefangen statt gespeichert.
    let inhalt: Blob | null = null;
    Object.assign(URL, {
      createObjectURL: (b: Blob) => {
        inhalt = b;
        return 'blob:klickpfad';
      },
      revokeObjectURL: () => undefined,
    });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    fireEvent.click(within(leiste).getByRole('button', { name: 'Protokoll herunterladen' }));
    const protokoll = JSON.parse(await inhalt!.text());
    expect(protokoll).toMatchObject({
      klickpfad: 'diagnose-in-ps',
      modus: 'aufgabe',
      fertig: true,
      erreicht: S.schritte.length,
      fehlklicks: 1,
      hilfen: 1,
    });
    expect(protokoll.ereignisse).toContainEqual(
      expect.objectContaining({ art: 'fehlklick', element: 'button: Diagnose' }),
    );
    expect(Object.keys(protokoll)).not.toContain('person');
  }, 20000);
});
