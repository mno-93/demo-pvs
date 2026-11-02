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
  if (import.meta.env.VITE_SIMULATOR !== 'browser') {
    lokalZuruecksetzen();
    return;
  }
  const simulator = import('@demo-pvs/epa-sim/browser').then((m) => m.simulatorImBrowser());
  transportSetzen((pfad, init) =>
    SIMULATORWEGE.test(pfad)
      ? simulator.then((s) => s.abrufen(new Request(new URL(pfad, window.location.origin), init)))
      : fetch(pfad, init),
  );
}

/**
 * Lokal läuft der Simulator als eigener Dienst weiter, wenn die Seite neu lädt; das Praxissystem
 * beginnt dagegen beim Startbestand. Damit beide zusammenpassen, setzt der Start auch den
 * Simulator zurück — wie gehostet, wo beide neu beginnen. Anfragen an ihn warten, bis das
 * geschehen ist; gelingt es nicht, melden sie ihren eigenen Fehler.
 */
function lokalZuruecksetzen(): void {
  const bereit = fetch('/verwaltung/zuruecksetzen', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{}',
  }).then(
    (a) => {
      if (!a.ok) console.warn(`Simulator nicht zurückgesetzt: ${a.status}`);
    },
    () => console.warn('Simulator nicht erreichbar; nicht zurückgesetzt.'),
  );
  transportSetzen((pfad, init) =>
    SIMULATORWEGE.test(pfad) ? bereit.then(() => fetch(pfad, init)) : fetch(pfad, init),
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
