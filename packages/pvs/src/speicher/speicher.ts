import { useCallback, useMemo, useRef, useSyncExternalStore } from 'react';
import type { Protokolleintrag, Zustand } from './zustand.js';

/**
 * Kleiner Zustandsspeicher ohne Bibliothek (ADR 0003).
 *
 * Änderungen laufen ausschließlich über `ausfuehren`. Jede Ausführung erhöht den
 * Handlungszähler und schreibt einen Protokolleintrag — genau das, was der
 * Aufwandsnachweis des Projekts braucht.
 */

export interface Vorgang {
  /** Technischer Name, erscheint im Protokoll. */
  name: string;
  /** Was in der Oberfläche geschehen ist, in einem Satz. */
  beschreibung: string;
  anwenden: (zustand: Zustand) => Zustand;
  /** Vorgänge ohne fachliche Wirkung zählen nicht als Handlung (etwa Ansichtsschalter). */
  zaehltNicht?: boolean;
}

let zustand: Zustand;
let ausgangszustand: Zustand;
const hoerer = new Set<() => void>();

export function speicherStarten(anfang: Zustand): void {
  ausgangszustand = anfang;
  zustand = anfang;
  hoerer.forEach((h) => h());
}

export function lesen(): Zustand {
  if (!zustand) throw new Error('Der Speicher wurde noch nicht gestartet.');
  return zustand;
}

export function ausfuehren(vorgang: Vorgang): void {
  const vorher = lesen();
  const nachher = vorgang.anwenden(vorher);
  if (nachher === vorher) return;

  if (vorgang.zaehltNicht) {
    zustand = nachher;
  } else {
    const eintrag: Protokolleintrag = {
      zeitpunkt: Date.now(),
      vorgang: vorgang.name,
      beschreibung: vorgang.beschreibung,
    };
    zustand = {
      ...nachher,
      handlungen: nachher.handlungen + 1,
      protokoll: [eintrag, ...nachher.protokoll].slice(0, 100),
    };
  }
  hoerer.forEach((h) => h());
}

export function zuruecksetzen(): void {
  zustand = { ...ausgangszustand };
  hoerer.forEach((h) => h());
}

function abonnieren(hoerender: () => void): () => void {
  hoerer.add(hoerender);
  return () => {
    hoerer.delete(hoerender);
  };
}

/**
 * Liest einen Ausschnitt des Zustands.
 *
 * Das Ergebnis wird gegen die Identität des Zustands zwischengespeichert. Ohne diesen
 * Zwischenspeicher liefert eine Auswahlfunktion, die eine neue Liste erzeugt
 * (`z.diagnosen.filter(...)`), bei jedem Aufruf ein neues Objekt; React hält das für eine
 * Änderung und rendert endlos weiter. Der Fehler tritt erst zur Laufzeit auf und ist an
 * der Aufrufstelle nicht zu sehen — deshalb ist er hier abgefangen und nicht als Regel
 * in die Dokumentation geschrieben.
 *
 * Die Auswahlfunktion darf nur vom Zustand abhängen. Wer über Eigenschaften der
 * Komponente ableitet (etwa über eine Patientenkennung), nimmt `useAuswahl`.
 */
export function useZustand<T>(auswahl: (zustand: Zustand) => T): T {
  const zwischenspeicher = useRef<{ zustand: Zustand; wert: T } | null>(null);

  const holen = useCallback(() => {
    const jetzt = lesen();
    const gemerkt = zwischenspeicher.current;
    if (gemerkt && gemerkt.zustand === jetzt) return gemerkt.wert;
    const wert = auswahl(jetzt);
    zwischenspeicher.current = { zustand: jetzt, wert };
    return wert;
    // Die Auswahlfunktion ist bei jedem Rendern eine neue Instanz. Sie bewusst nicht in
    // die Abhängigkeiten aufzunehmen ist der Kern des Zwischenspeichers: Nur eine
    // Zustandsänderung darf zu einem neuen Wert führen.
  }, []);

  return useSyncExternalStore(abonnieren, holen, holen);
}

/**
 * Ableitung aus dem Zustand, die zusätzlich von Werten der Komponente abhängt.
 *
 * Beispiel: die Diagnosen einer bestimmten Patientin. Die Abhängigkeiten sind anzugeben,
 * damit die Ableitung bei ihrer Änderung neu berechnet wird.
 */
export function useAuswahl<T>(
  auswahl: (zustand: Zustand) => T,
  abhaengigkeiten: readonly unknown[],
): T {
  const zustand = useZustand((z) => z);
  // Die Auswahlfunktion steht bewusst nicht in den Abhängigkeiten: Sie ist bei jedem
  // Rendern neu, und die angegebenen Abhängigkeiten sagen, wann neu zu rechnen ist.
  return useMemo(() => auswahl(zustand), [zustand, ...abhaengigkeiten]);
}
