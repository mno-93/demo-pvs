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
import type { Modus } from './szenario.js';

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
  window.history.replaceState(null, '', '/');
});

function oeffne(modus: Modus) {
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

  it('hängt beim Beenden ganz aus: Klicks frei, kein Rand, Adresse ohne Klickpfad', async () => {
    const leiste = oeffne('gefuehrt');
    await waitFor(() =>
      expect(within(leiste).getByText('„Migräne“ suchen').getAttribute('aria-current')).toBe(
        'step',
      ),
    );
    // Solange der Klickpfad offen ist, steht er in der Adresse — auch nach der Navigation zum Start.
    await waitFor(() => expect(window.location.search).toBe('?klickpfad=diagnose-in-ps'));
    expect(document.body.classList.contains('mit-klickpfad')).toBe(true);

    fireEvent.click(within(leiste).getByRole('button', { name: 'beenden' }));
    expect(screen.queryByRole('complementary', { name: 'Klickpfad' })).toBeNull();
    expect(document.body.classList.contains('mit-klickpfad')).toBe(false);
    expect(window.location.search).toBe('');
    // Die Sperre des geführten Modus ist weg: Der Klick daneben wirkt wieder.
    fireEvent.click(screen.getByRole('button', { name: 'Allergie' }));
    await waitFor(() =>
      expect(
        screen.queryByRole('combobox', { name: 'Diagnose suchen — Kodierservice' }),
      ).toBeNull(),
    );
  });

  it('beginnt die Aufgabe beim Wechsel neu und behält den Stand beim Wechsel zurück', async () => {
    const leiste = oeffne('gefuehrt');
    await waitFor(() =>
      expect(within(leiste).getByText('„Migräne“ suchen').getAttribute('aria-current')).toBe(
        'step',
      ),
    );
    act(() => wertSetzen(finden(S.schritte[0]!.ziel)!, 'Migräne'));
    await waitFor(() =>
      expect(within(leiste).getByText('Treffer übernehmen').getAttribute('aria-current')).toBe(
        'step',
      ),
    );

    fireEvent.click(within(leiste).getByRole('radio', { name: 'Aufgabe' }));
    await waitFor(() => expect(window.location.search).toContain('modus=aufgabe'));
    // Neu begonnen: Das Suchfeld ist wieder leer, die Messung läuft von vorn.
    await waitFor(() =>
      expect(
        within(leiste).getByRole('button', { name: 'Hilfe: nächster Schritt' }),
      ).toHaveProperty('disabled', false),
    );
    expect(
      (
        screen.getByRole('combobox', {
          name: 'Diagnose suchen — Kodierservice',
        }) as HTMLInputElement
      ).value,
    ).toBe('');
    expect(within(leiste).queryByRole('button', { name: '← Schritt zurück' })).toBeNull();

    act(() => wertSetzen(finden(S.schritte[0]!.ziel)!, 'Migräne'));
    await waitFor(() => expect(finden(S.schritte[1]!.ziel)).not.toBeNull());
    fireEvent.click(within(leiste).getByRole('radio', { name: 'frei mit Wegweiser' }));
    // Zurück aus der Aufgabe bleibt der Stand: Schritt 2 ist dran.
    await waitFor(() =>
      expect(within(leiste).getByText('Treffer übernehmen').getAttribute('aria-current')).toBe(
        'step',
      ),
    );
    expect(window.location.search).toContain('modus=frei');
  }, 20000);

  it('lässt frei einen erfüllten Prüfpunkt stehen, bis es dahinter weitergeht', async () => {
    const leiste = oeffne('frei');
    await waitFor(() =>
      expect(within(leiste).getByText('„Migräne“ suchen').getAttribute('aria-current')).toBe(
        'step',
      ),
    );
    for (const schritt of S.schritte.slice(0, 3)) await act(() => schrittAusfuehren(schritt));
    await waitFor(() =>
      expect(within(leiste).getByText('Schon angehakt').getAttribute('aria-current')).toBe('step'),
    );
    // Zeit zum Lesen: Der Prüfpunkt rückt nicht von selbst weiter.
    await act(() => new Promise((r) => setTimeout(r, 600)));
    expect(within(leiste).getByText('Schon angehakt').getAttribute('aria-current')).toBe('step');
    // Wer schon speichert, ist darüber hinaus.
    await act(() => schrittAusfuehren(S.schritte[4]!));
    await waitFor(() =>
      expect(within(leiste).getByText('Patient Summary öffnen').getAttribute('aria-current')).toBe(
        'step',
      ),
    );
  }, 20000);

  it('führt den Rundgang mit Erzählungen, Kapiteln und Verweisen, ohne Aufgabe', async () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
        <KlickpfadEbene id="demo-ueberblick" modus="aufgabe" />
      </MemoryRouter>,
    );
    const leiste = screen.getByRole('complementary', { name: 'Klickpfad' });
    // Den Modus „Aufgabe“ bietet der Rundgang nicht an; er beginnt geführt.
    expect(within(leiste).queryByRole('radio', { name: 'Aufgabe' })).toBeNull();
    expect(within(leiste).getByRole('radio', { name: 'geführt' })).toHaveProperty('checked', true);
    // Eine Erzählung: Überschrift, Absätze, Verweise ins Repository und „weiter →“.
    await within(leiste).findByRole('heading', {
      name: 'Ein fiktives Praxissystem mit ePA-Simulator',
    });
    expect(within(leiste).getByRole('link', { name: 'README ↗' }).getAttribute('href')).toBe(
      'https://github.com/mno-93/demo-pvs/blob/main/README.md',
    );
    // Kapitel: aufgeklappt nur das aktuelle.
    expect(within(leiste).getByText('Steuerung und Aufrufe')).toBeDefined();
    expect(within(leiste).queryByText('Konfiguration öffnen')).toBeNull();
    const weiter = await within(leiste).findByRole('button', { name: 'weiter →' });
    await waitFor(() => expect(weiter).toHaveProperty('disabled', false));
    fireEvent.click(weiter);
    // Der nächste Schritt ist dran: in der Liste markiert und als Überschrift der Erzählung.
    await within(leiste).findByRole('heading', { name: 'Drei Zeichen, die überall gelten' });
    expect(
      within(leiste)
        .getAllByText('Drei Zeichen, die überall gelten')
        .find((e) => e.tagName === 'LI')
        ?.getAttribute('aria-current'),
    ).toBe('step');
  }, 20000);
});
