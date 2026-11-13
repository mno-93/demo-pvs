import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, useNavigate } from 'react-router-dom';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { simulatorImBrowser } from '@demo-pvs/epa-sim/browser';
import { App } from '../App.js';
import { startzustand } from '../daten/startdaten.js';
import { speicherStarten } from '../speicher/speicher.js';
import { epaFensterSchliessen } from './fenster.js';
import { klientZuruecksetzen } from './klient.js';
import { SIMULATORWEGE, transportSetzen } from './transport.js';
import { startzustandHerstellen } from '../klickpfade/ausfuehren.js';
import { szenario } from '../klickpfade/szenario.js';

/**
 * ✦ Änderungsverlauf und frühere Stände der Patient Summary — gegen den Simulator: Der Verlauf
 * nennt je Änderung Zeitpunkt, Einrichtung und Einträge; „Stand ansehen“ zeigt die Patient Summary,
 * wie sie damals galt, ohne das Lesezeichen „seit dem letzten Aufruf“ zu verschieben.
 */

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

let navigieren: (pfad: string) => void = () => undefined;
function Beobachter() {
  navigieren = useNavigate();
  return null;
}

const START = szenario({
  id: 'ps-verlauf',
  titel: 'Verlauf',
  frage: '—',
  aufgabe: '—',
  start: {
    ausbaustand: 'weiterentwicklung-3',
    patientId: 'p-hoffmann',
    egkEinlesen: true,
    pfad: '/patient/p-hoffmann/karteikarte',
  },
  schritte: [],
});

describe('✦ Verlauf der Patient Summary', () => {
  it('zeigt die Änderungen und einen früheren Stand, dann wieder den aktuellen', async () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <Beobachter />
        <App />
      </MemoryRouter>,
    );
    await act(() => startzustandHerstellen(START, (p) => navigieren(p)));
    const kopf = screen.getByRole('group', { name: 'Patientenkopf' });
    fireEvent.click(within(kopf).getByRole('button', { name: 'Patient Summary' }));
    const fenster = await screen.findByRole('dialog', { name: 'Elektronische Patientenakte' });
    fireEvent.click(await within(fenster).findByRole('button', { name: 'Verlauf' }));

    const verlauf = await within(fenster).findByRole('region', {
      name: 'Änderungsverlauf der Patient Summary',
    });
    await within(verlauf).findByText('aktueller Stand');
    // Die Allergien kamen mit der Entlassung aus dem Klinikum.
    expect(within(verlauf).getByText('Penicillin')).toBeDefined();
    expect(within(verlauf).getAllByText('Klinikum Sonnenschein').length).toBeGreaterThan(0);

    // Stand vor den Listen: nur Impfungen, Laborwerte vom März und der Entlassbrief.
    fireEvent.click(
      within(verlauf).getByRole('button', { name: 'Stand vom 17.07.2026, 14:00 Uhr ansehen' }),
    );
    await within(fenster).findByText('Stand vom 17.07.2026, 14:00 Uhr');
    // Der Verlauf bleibt offen — so lässt sich Stand um Stand durchgehen.
    const offen = await within(fenster).findByRole('region', {
      name: 'Änderungsverlauf der Patient Summary',
    });
    await within(offen).findByText('angezeigt');
    const allergien = await within(fenster).findByRole('region', {
      name: 'Allergien und Unverträglichkeiten',
    });
    expect(within(allergien).getByText('Information nicht verfügbar')).toBeDefined();
    // Ein früherer Stand führt nicht in die Quellen.
    expect(within(fenster).queryByRole('button', { name: 'Zur Allergienübersicht ↗' })).toBeNull();

    fireEvent.click(within(fenster).getByRole('button', { name: 'zum aktuellen Stand' }));
    await waitFor(() =>
      expect(within(fenster).queryByText('Stand vom 17.07.2026, 14:00 Uhr')).toBeNull(),
    );
    const heute = await within(fenster).findByRole('region', {
      name: 'Allergien und Unverträglichkeiten',
    });
    await within(heute).findByText('Penicillin');
  }, 30000);
});
