import { act, render } from '@testing-library/react';
import { MemoryRouter, useNavigate } from 'react-router-dom';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { simulatorImBrowser } from '@demo-pvs/epa-sim/browser';
import { App } from '../App.js';
import { startzustand } from '../daten/startdaten.js';
import { speicherStarten } from '../speicher/speicher.js';
import { epaFensterSchliessen } from '../epa/fenster.js';
import { klientZuruecksetzen } from '../epa/klient.js';
import { SIMULATORWEGE, transportSetzen } from '../epa/transport.js';
import { useAufrufe, type Aufruf } from '../epa/protokoll.js';
import { alleFinden, vorhandeneNamen, zielBeschreibung } from './finden.js';
import { schrittAusfuehren, startzustandHerstellen } from './ausfuehren.js';
import { SZENARIEN } from './szenarien/index.js';

/**
 * Jeder Klickpfad läuft hier vollständig gegen den echten Simulator — derselbe Weg wie in der
 * gehosteten Demo (ADR 0025). Bricht eine Änderung einen Pfad (Knopf umbenannt, Schritt
 * entfallen, Name mehrdeutig), schlägt der Test fehl, statt dass der Klickpfad still veraltet.
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
let aufrufe: Aufruf[] = [];
function Beobachter() {
  navigieren = useNavigate();
  aufrufe = useAufrufe();
  return null;
}

describe('Klickpfade', () => {
  for (const s of Object.values(SZENARIEN)) {
    it(`${s.id}: ${s.titel}`, async () => {
      render(
        <MemoryRouter initialEntries={['/']}>
          <Beobachter />
          <App />
        </MemoryRouter>,
      );
      await act(() => startzustandHerstellen(s, (p) => navigieren(p)));
      for (const [i, schritt] of s.schritte.entries()) {
        // Jedes Ziel muss eindeutig sein, wenn es an der Reihe ist — sonst führt der Rundgang falsch.
        await act(async () => {
          try {
            await schrittAusfuehren(schritt);
          } catch (f) {
            const anzahl = alleFinden(schritt.ziel).length;
            throw new Error(
              `Schritt ${i + 1} („${schritt.kurz}“): ${zielBeschreibung(schritt.ziel)} ${anzahl}-mal gefunden. ${(f as Error).message}\nVorhanden mit Rolle ${schritt.ziel.rolle}: ${JSON.stringify(vorhandeneNamen(schritt.ziel.rolle))}`,
            );
          }
        });
      }
      // Kein Aufruf an die ePA ist dabei gescheitert. Lesende 404 sind gewollt: Sonden nach
      // Diensten, die es im Ausbaustand nicht gibt, und Personen ohne Akte (Prüfliste P14).
      const gescheitert = aufrufe
        .filter(
          (a) =>
            a.status === null || (a.status >= 400 && !(a.status === 404 && a.methode === 'GET')),
        )
        .map((a) => `${a.methode} ${a.pfad} ${a.status}`);
      expect(gescheitert).toEqual([]);
    }, 20000);
  }
});
