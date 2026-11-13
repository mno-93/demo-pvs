import { act, cleanup, render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { simulatorImBrowser } from '@demo-pvs/epa-sim/browser';
import type { Diagnosenweg } from '@demo-pvs/kern';
import { App } from '../App.js';
import { startzustand } from '../daten/startdaten.js';
import { betriebslageSetzen, fremdeEintraegeAnlegen } from '../demo/steuerung.js';
import { demoZuruecksetzen } from '../demo/zuruecksetzen.js';
import { egkEinlesen } from '../epa/befugnis.js';
import { epaFensterSchliessen } from '../epa/fenster.js';
import { klientZuruecksetzen } from '../epa/klient.js';
import { listenLaden } from '../epa/listen.js';
import { SIMULATORWEGE, transportSetzen } from '../epa/transport.js';
import { ausfuehren, lesen, speicherStarten } from '../speicher/speicher.js';
import { vorgaenge } from '../speicher/vorgaenge.js';

/**
 * ✦ Automatische Übertragung der Diagnosen (ADR 0062), gegen den echten Simulator: Was geschieht
 * ohne Handlung, sobald die Kartei offen ist — und was nicht.
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

afterEach(cleanup);

const HOFFMANN = 'p-hoffmann';
const eigene = () => lesen().diagnosen.filter((d) => d.patientId === HOFFMANN);
const vermerke = () => lesen().diagnosenautomatik.filter((v) => v.patientId === HOFFMANN);

/** Kartei von Frau Hoffmann in der Karteikarte öffnen — die Diagnosen sieht dabei niemand. */
async function oeffnen(weg: Diagnosenweg, umfang: 'dauer' | 'alle' = 'dauer') {
  await act(async () => {
    await demoZuruecksetzen();
    await betriebslageSetzen({ ausbaustand: 'weiterentwicklung-3' });
    ausfuehren(vorgaenge.diagnosenwegSetzen(weg, umfang));
    const ergebnis = await egkEinlesen(HOFFMANN);
    expect(ergebnis.ok).toBe(true);
  });
  render(
    <MemoryRouter initialEntries={[`/patient/${HOFFMANN}/karteikarte`]}>
      <App />
    </MemoryRouter>,
  );
}

/**
 * Wartet in kurzen Abschnitten, bis die Bedingung gilt. React führt Aktualisierungen erst am Ende
 * eines `act` aus — eine Schleife in einem einzigen `act` sähe die Wirkung nie.
 */
async function bis(bedingung: () => boolean, was: string): Promise<void> {
  for (let i = 0; i < 60; i += 1) {
    if (bedingung()) return;
    await act(() => new Promise((r) => setTimeout(r, 50)));
  }
  throw new Error(`Nicht erreicht: ${was}`);
}

const listeDerEpa = async () => {
  const kvnr = lesen().patienten.find((p) => p.id === HOFFMANN)!.versicherung.kvnr;
  return (await listenLaden(kvnr, HOFFMANN)).diagnosen;
};

describe('✦ Automatische Übertragung der Diagnosen', () => {
  it('geführt: ohne Handlung geht nichts in die ePA und nichts in die Praxis', async () => {
    await oeffnen('gefuehrt');
    const vorher = (await listeDerEpa()).length;
    await act(() => new Promise((r) => setTimeout(r, 300)));
    expect(vermerke()).toHaveLength(0);
    expect(eigene().every((d) => !d.epaId)).toBe(true);
    expect(await listeDerEpa()).toHaveLength(vorher);
  });

  it('nur in die ePA: überträgt die Dauerdiagnosen und führt Gleiches doppelt', async () => {
    await oeffnen('hochladen');
    await bis(() => eigene().filter((d) => d.epaId).length === 3, 'drei Dauerdiagnosen in der ePA');
    // Die Akutdiagnose bleibt in der Praxis; nichts kam aus der ePA.
    expect(eigene()).toHaveLength(4);
    expect(vermerke().map((v) => v.art)).toEqual(['in-die-epa', 'in-die-epa', 'in-die-epa']);
    expect(vermerke().every((v) => v.angezeigtAm === null)).toBe(true);
    // Diabetes steht jetzt zweimal in der Liste: E11.74 vom Klinikum, E11.90 von der Praxis.
    const diabetes = (await listeDerEpa()).filter((e) => e.eintrag.code.startsWith('E11'));
    expect(diabetes.map((e) => e.eintrag.code).sort()).toEqual(['E11.74', 'E11.90']);
    expect(diabetes.filter((e) => e.eigener)).toHaveLength(1);
  });

  it('beidseitig: verknüpft Gleiches, übernimmt Fremdes und fremde Einträge von selbst', async () => {
    await oeffnen('beidseitig');
    await bis(
      () => eigene().length > 4 && eigene().every((d) => d.epaId || d.art === 'akut'),
      'Bestand der Praxis mit der Liste abgeglichen',
    );
    // Ein Eintrag je Erkrankung: Die Praxis hat ihren Diabetes mit dem des Klinikums verknüpft.
    const diabetes = (await listeDerEpa()).filter((e) => e.eintrag.code.startsWith('E11'));
    expect(diabetes).toHaveLength(1);
    expect(eigene().find((d) => d.code === 'E11.90')?.epaId).toBe(diabetes[0]!.eintrag.id);
    // Was das Klinikum eingetragen hat, steht jetzt in der Praxis — ohne Handlung.
    expect(eigene().some((d) => d.code === 'I48.1')).toBe(true);
    const arten = new Set(vermerke().map((v) => v.art));
    expect(arten.has('verknuepfen')).toBe(true);
    expect(arten.has('in-die-praxis')).toBe(true);
    expect(arten.has('in-die-epa')).toBe(true);

    // Eine andere Einrichtung trägt ein: Auch das kommt von selbst an.
    const zahl = eigene().length;
    const handlungen = lesen().handlungen;
    await act(() =>
      fremdeEintraegeAnlegen(lesen().patienten.find((p) => p.id === HOFFMANN)!.versicherung.kvnr),
    );
    await bis(() => eigene().length === zahl + 1, 'fremder Eintrag in der Praxis');
    const neu = vermerke()[0]!;
    expect(neu).toMatchObject({ art: 'in-die-praxis', code: 'I50.12', angezeigtAm: null });
    expect(neu.einrichtung).toContain('Kardiologische Praxis');
    // Nichts davon zählt als Handlung der Praxis.
    expect(lesen().handlungen).toBe(handlungen);
  });
});
