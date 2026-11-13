import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
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
import { pfadKurz } from '../epa/protokoll.js';
import { alleFinden, normalisiert, vorhandeneNamen, zielBeschreibung } from './finden.js';
import { ruheAbwarten, schrittAusfuehren, startzustandHerstellen } from './ausfuehren.js';
import type { Schritt } from './szenario.js';
import { SZENARIEN } from './szenarien/index.js';

/**
 * Jeder Klickpfad läuft hier vollständig gegen den echten Simulator — derselbe Weg wie in der
 * gehosteten Demo (ADR 0025). Bricht eine Änderung einen Pfad (Knopf umbenannt, Schritt
 * entfallen, Name mehrdeutig), schlägt der Test fehl, statt dass der Klickpfad still veraltet.
 *
 * Dazu ein **Abbild** je Klickpfad (`abbilder/<kennung>.json`): je Schritt das Element, was es
 * zeigt, und die ePA-Aufrufe. Läuft der Pfad noch, sieht aber anders aus oder ruft andere Wege —
 * eine Vorbelegung fällt weg, Speichern schreibt woandershin —, weicht das Abbild ab. Dann die
 * Texte des Klickpfads prüfen und das Abbild bewusst neu schreiben: `npm run klickpfade:abbilden`
 * (ADR 0061, „Mitziehen“).
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

/** Uhrzeiten, erzeugte Kennungen und Antwortzeiten wechseln von Lauf zu Lauf — im Abbild vereinheitlicht. */
function stabil(text: string): string {
  return (
    text
      // Zeitpunkte in FHIR-Ressourcen (die Demo-Uhr läuft ab dem Start weiter), dann Uhrzeiten
      .replace(
        /\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})?/g,
        '<zeitpunkt>',
      )
      .replace(/\b\d{1,2}:\d{2}(:\d{2})?\b/g, '<zeit>')
      .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, '<uuid>')
      .replace(/\b[a-z]+-[a-z0-9]{6,}-\d+\b/g, '<id>')
      // Antwortzeiten im Aufrufprotokoll
      .replace(/\b\d+ ms\b/g, '<ms>')
  );
}

/** Text eines Elements mit Leerraum zwischen den Bausteinen (jsdom kennt kein `innerText`). */
function textVon(e: Element): string {
  const teile: string[] = [];
  const gang = document.createTreeWalker(e, NodeFilter.SHOW_TEXT);
  for (let n = gang.nextNode(); n; n = gang.nextNode()) teile.push(n.textContent ?? '');
  return stabil(normalisiert(teile.join(' ')));
}

/**
 * Was die Person am Ziel eines Schritts sieht — vor der Handlung, wie im Rundgang. Bei Feldern
 * und Kästchen die Beschriftung (dort steht etwa die Vorbelegung), bei Prüfpunkten der Inhalt.
 */
function anzeige(schritt: Schritt) {
  const e = alleFinden(schritt.ziel)[0];
  if (!e) return null;
  const feld = e as HTMLInputElement;
  const beschriftung = [...(feld.labels ?? [])].map(textVon).join(' ');
  return {
    ziel: zielBeschreibung(schritt.ziel),
    ...(beschriftung ? { beschriftung } : {}),
    ...(feld.type === 'checkbox' ? { angehakt: feld.checked } : {}),
    ...(!schritt.handlung && !beschriftung ? { inhalt: textVon(e).slice(0, 1500) } : {}),
  };
}

/** Die ePA-Aufrufe eines Schritts nach ihrem Beginn, ohne Sonden und Demo-Steuerung (wie im Rundgang). */
function aufrufeSeit(beginn: number): string[] {
  const zeilen = aufrufe
    .filter((a) => a.zeitpunkt - a.dauerMs >= beginn)
    .filter((a) => !/^\/(verwaltung|information)\//.test(a.pfad) && !a.pfad.endsWith('/metadata'))
    .map((a) => stabil(`${a.status ?? '—'} ${a.methode} ${pfadKurz(a.pfad)}`));
  return [...new Set(zeilen)].sort();
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
      // Wartet selbst, bis die Ansicht geladen hat (wie im Rundgang).
      await act(() => startzustandHerstellen(s, (p) => navigieren(p)));
      const abbild: unknown[] = [];
      for (const [i, schritt] of s.schritte.entries()) {
        // Eine Erzählung zeigt nichts auf der Seite; im Abbild steht nur ihr Satz.
        if (!schritt.ziel) {
          abbild.push({ schritt: i + 1, kurz: schritt.kurz, erzaehlung: true });
          continue;
        }
        const ziel = schritt.ziel;
        const beginn = Date.now();
        let gesehen: ReturnType<typeof anzeige> = null;
        // Jedes Ziel muss eindeutig sein, wenn es an der Reihe ist — sonst führt der Rundgang falsch.
        await act(async () => {
          try {
            if (!schritt.handlung) await schrittAusfuehren(schritt);
            gesehen = anzeige(schritt);
            if (schritt.handlung) await schrittAusfuehren(schritt);
          } catch (f) {
            const anzahl = alleFinden(ziel).length;
            throw new Error(
              `Schritt ${i + 1} („${schritt.kurz}“): ${zielBeschreibung(ziel)} ${anzahl}-mal gefunden. ${(f as Error).message}\nVorhanden mit Rolle ${ziel.rolle}: ${JSON.stringify(vorhandeneNamen(ziel.rolle))}`,
            );
          }
        });
        // Bis keine neuen Aufrufe mehr kommen — dann gehören alle zum Schritt.
        await act(() => ruheAbwarten());
        // `gesehen` setzt die Schrittausführung oben; TypeScript verfolgt das nicht in die Funktion hinein.
        const sicht = gesehen as ReturnType<typeof anzeige>;
        abbild.push({ schritt: i + 1, kurz: schritt.kurz, ...sicht, epa: aufrufeSeit(beginn) });
      }
      await expect(
        `${JSON.stringify({ klickpfad: s.id, titel: s.titel, schritte: abbild }, null, 2)}\n`,
      ).toMatchFileSnapshot(`./abbilder/${s.id}.json`);
      // Kein Aufruf an die ePA ist dabei gescheitert. Lesende 404 sind gewollt: Sonden nach
      // Diensten, die es im Ausbaustand nicht gibt, und Personen ohne Akte (Prüfliste P14).
      const gescheitert = aufrufe
        .filter(
          (a) =>
            a.status === null || (a.status >= 400 && !(a.status === 404 && a.methode === 'GET')),
        )
        .map((a) => `${a.methode} ${a.pfad} ${a.status}`);
      expect(gescheitert).toEqual([]);
    }, 30000);
  }

  /*
   * Jeder Verweis „Mehr dazu“ zeigt auf eine Datei im Repository und, mit Anker, auf eine
   * Überschrift darin — nach der Regel, mit der GitHub Anker bildet: klein, ohne Satzzeichen,
   * Leerzeichen als Bindestrich.
   */
  it('verweist nur auf vorhandene Dateien und Überschriften', () => {
    // Vitest läuft im Wurzelordner des Repositorys (`npm run test`, `npm run pruefen`).
    const wurzel = process.cwd();
    const anker = (ueberschrift: string) =>
      ueberschrift
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s-]/gu, '')
        .replace(/ /g, '-');
    const fehlend: string[] = [];
    for (const s of Object.values(SZENARIEN))
      for (const v of s.schritte.flatMap((x) => x.mehr ?? [])) {
        const [datei, ziel] = v.pfad.split('#');
        const pfad = resolve(wurzel, datei!);
        if (!existsSync(pfad)) {
          fehlend.push(`${s.id}: ${v.pfad} (Datei)`);
          continue;
        }
        if (!ziel || statSync(pfad).isDirectory()) continue;
        const vorhanden = readFileSync(pfad, 'utf-8')
          .split('\n')
          .filter((z) => /^#{1,6} /.test(z))
          .map((z) => anker(z.replace(/^#+ /, '').trim()));
        if (!vorhanden.includes(ziel)) fehlend.push(`${s.id}: ${v.pfad} (Anker)`);
      }
    expect(fehlend).toEqual([]);
  });
});
