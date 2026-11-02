import { useCallback, useRef, useSyncExternalStore } from 'react';
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

/** Was eine Auswahl zuletzt ergab und welche Felder des Zustands sie dafür gelesen hat. */
interface Merker<T> {
  zustand: Zustand;
  /** Gelesene Felder mit ihrem Wert; `null`, wenn die Auswahl den ganzen Zustand liefert. */
  felder: readonly (readonly [keyof Zustand, unknown])[] | null;
  abhaengigkeiten: readonly unknown[];
  wert: T;
}

/** Wertet eine Auswahl aus und merkt, welche Felder des Zustands sie liest. */
function auswerten<T>(
  z: Zustand,
  auswahl: (zustand: Zustand) => T,
  abhaengigkeiten: readonly unknown[],
): Merker<T> {
  const gelesen = new Set<keyof Zustand>();
  const beobachtet = new Proxy(z, {
    get(ziel, feld, empfaenger) {
      gelesen.add(feld as keyof Zustand);
      return Reflect.get(ziel, feld, empfaenger) as unknown;
    },
  });
  const wert = auswahl(beobachtet);
  if ((wert as unknown) === beobachtet)
    return { zustand: z, felder: null, abhaengigkeiten, wert: z as T };
  return { zustand: z, felder: [...gelesen].map((f) => [f, z[f]] as const), abhaengigkeiten, wert };
}

function unveraendert<T>(m: Merker<T>, z: Zustand, abhaengigkeiten: readonly unknown[]): boolean {
  return (
    m.abhaengigkeiten.length === abhaengigkeiten.length &&
    m.abhaengigkeiten.every((a, i) => Object.is(a, abhaengigkeiten[i])) &&
    (m.zustand === z || (m.felder !== null && m.felder.every(([f, w]) => z[f] === w)))
  );
}

/**
 * Ableitung aus dem Zustand, die zusätzlich von Werten der Komponente abhängen darf.
 *
 * Beispiel: die Diagnosen einer bestimmten Patientin. Die Abhängigkeiten sind anzugeben,
 * damit die Ableitung bei ihrer Änderung neu berechnet wird.
 *
 * Ausschnitt-Memo: Die Auswahl merkt sich, welche Felder des Zustands sie liest, und rechnet
 * erst neu, wenn sich eines davon ändert — sonst bleibt ihr Ergebnis dasselbe Objekt, und die
 * Komponente rendert nicht. Technische Vorgänge wie Lesezeichen oder Abgleich lösen so nichts aus,
 * wo diese Felder nicht gelesen werden. Ohne das Memo lieferte eine Auswahl, die eine neue Liste
 * erzeugt (`z.diagnosen.filter(...)`), bei jedem Aufruf ein neues Objekt; React hielte das für eine
 * Änderung und renderte endlos weiter.
 */
export function useAuswahl<T>(
  auswahl: (zustand: Zustand) => T,
  abhaengigkeiten: readonly unknown[],
): T {
  const merker = useRef<Merker<T> | null>(null);
  // Die Auswahlfunktion ist bei jedem Rendern neu; maßgeblich sind die Abhängigkeiten.
  const aktuell = useRef({ auswahl, abhaengigkeiten });
  aktuell.current = { auswahl, abhaengigkeiten };

  const holen = useCallback(() => {
    const jetzt = lesen();
    const m = merker.current;
    const a = aktuell.current;
    if (m && unveraendert(m, jetzt, a.abhaengigkeiten)) return m.wert;
    merker.current = auswerten(jetzt, a.auswahl, a.abhaengigkeiten);
    return merker.current.wert;
  }, []);

  return useSyncExternalStore(abonnieren, holen, holen);
}

/**
 * Liest einen Ausschnitt des Zustands; die Auswahlfunktion darf nur vom Zustand abhängen. Wer
 * über Eigenschaften der Komponente ableitet (etwa über eine Patientenkennung), nimmt
 * `useAuswahl`.
 */
export function useZustand<T>(auswahl: (zustand: Zustand) => T): T {
  return useAuswahl(auswahl, KEINE);
}

const KEINE: readonly unknown[] = [];
