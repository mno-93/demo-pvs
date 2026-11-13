import type { Ausbaustand, Diagnosenumfang, Diagnosenweg } from '@demo-pvs/kern';

/**
 * Klickpfad: ein gezielter Ablauf durch die Demo zu einer Fragestellung (ADR 0061). Eine Datei je
 * Szenario dient dreifach — als Rundgang in der Demo, als Vorlage einer exportierten
 * Klickstrecke und als Test gegen den Simulator.
 */

/**
 * Ein Bedienelement, gefunden wie in den Oberflächentests: über seine Rolle und seinen
 * zugänglichen Namen, wahlweise innerhalb eines anderen Elements. Kein CSS-Selektor — ein Pfad
 * soll eine Umgestaltung überstehen, solange die Beschriftung bleibt.
 */
export interface Ziel {
  /** ARIA-Rolle, explizit oder implizit: `button`, `link`, `combobox`, `checkbox`, `option`, `region`, `dialog` … */
  rolle: string;
  /** Zugänglicher Name, Leerraum zusammengefasst. Text: genau dieser Name; RegExp: passender Name. */
  name: string | RegExp;
  /** Nur innerhalb dieses Elements suchen — für Namen, die es mehrfach gibt. */
  in?: Ziel;
}

export type Handlung =
  | { art: 'klicken' }
  /** Text in ein Eingabefeld; der Rundgang bietet „für mich eintragen“ an. */
  | { art: 'eingeben'; wert: string }
  /** Wert einer Auswahlliste (`value` der Option) mit der Beschriftung, die die Person sieht. */
  | { art: 'waehlen'; wert: string; anzeige: string };

/** Woran ein Prüfschritt erkennt, dass er erfüllt ist. */
export interface Pruefung {
  /** Das Ziel enthält diesen Text. */
  text?: string;
  /** Kästchen gesetzt oder nicht. */
  angehakt?: boolean;
}

export interface Schritt {
  ziel: Ziel;
  /** Ohne Handlung ist der Schritt ein Prüfpunkt: Das Ziel muss erscheinen und `pruefen` erfüllen. */
  handlung?: Handlung;
  pruefen?: Pruefung;
  /** Ein Satz am Element. */
  kurz: string;
  /** Erläuterung in der Seitenleiste: warum dieser Schritt, was dahinter passiert. ✦ wie in der Demo. */
  lang?: string;
}

export interface Startzustand {
  ausbaustand: Ausbaustand;
  patientId: string;
  /** Vor dem ersten Schritt die eGK einlesen (Befugnis für die ePA). */
  egkEinlesen: boolean;
  /** Ansicht, in der der Pfad beginnt, etwa `/patient/p-hoffmann/diagnosen`. */
  pfad: string;
  /** ✦ Weg der Diagnosen in die ePA, wenn nicht geführt (ADR 0062). */
  diagnosenweg?: Diagnosenweg;
  diagnosenumfang?: Diagnosenumfang;
}

export interface Szenario {
  id: string;
  titel: string;
  /** Die Fragestellung, die der Pfad beantwortet. */
  frage: string;
  /** Aufgabentext für den Nutzertest — beschreibt das Ziel, nicht den Weg. */
  aufgabe: string;
  start: Startzustand;
  schritte: Schritt[];
}

export function szenario(s: Szenario): Szenario {
  return s;
}

export type Modus = 'gefuehrt' | 'frei' | 'aufgabe';

export const MODUS_BEZEICHNUNG: Record<Modus, string> = {
  gefuehrt: 'geführt',
  frei: 'frei mit Wegweiser',
  aufgabe: 'Aufgabe',
};
