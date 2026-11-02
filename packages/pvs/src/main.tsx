import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App.js';
import { speicherStarten } from './speicher/speicher.js';
import { startzustand } from './daten/startdaten.js';
import { SIMULATORWEGE, transportSetzen } from './epa/transport.js';
import './stil/global.css';

speicherStarten(startzustand());

/**
 * Gehostete Demo (ADR 0025): Ohne Server beantwortet der Simulator im Browser die Wege der ePA,
 * des Fachdienstes und der Demo-Steuerung. Lokal läuft er als eigener Dienst. Die Oberfläche
 * wartet nicht auf das Paket des Simulators; erst Anfragen an ihn warten, bis es geladen ist
 * (ADR 0056).
 */
function transportEinrichten(): void {
  if (import.meta.env.VITE_SIMULATOR !== 'browser') return;
  const simulator = import('@demo-pvs/epa-sim/browser').then((m) => m.simulatorImBrowser());
  transportSetzen((pfad, init) =>
    SIMULATORWEGE.test(pfad)
      ? simulator.then((s) => s.abrufen(new Request(new URL(pfad, window.location.origin), init)))
      : fetch(pfad, init),
  );
}

const wurzel = document.getElementById('wurzel');
if (!wurzel) throw new Error('Wurzelelement nicht gefunden.');

transportEinrichten();
createRoot(wurzel).render(
  <StrictMode>
    <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, '')}>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
