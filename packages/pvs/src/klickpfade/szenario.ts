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
  | {
      art: 'eingeben';
      /** Was „für mich eintragen“ einträgt; ohne `frei` auch, was die Person tippen soll. */
      wert: string;
      /** Freitext wie eine Beurteilung: Jeder Text erfüllt den Schritt, `wert` ist ein Vorschlag. */
      frei?: boolean;
    }
  /** Wert einer Auswahlliste (`value` der Option) mit der Beschriftung, die die Person sieht. */
  | { art: 'waehlen'; wert: string; anzeige: string };

/** Woran ein Prüfschritt erkennt, dass er erfüllt ist. */
export interface Pruefung {
  /** Das Ziel enthält diesen Text. */
  text?: string;
  /** Kästchen gesetzt oder nicht. */
  angehakt?: boolean;
}

/** Ein Verweis in die Dokumentation, relativ zum Repository: `docs/SPEZIFIKATION.md#44-klickpfade`. */
export interface Verweis {
  text: string;
  pfad: string;
}

export interface Schritt {
  /**
   * Ohne Ziel ist der Schritt eine **Erzählung**: Text in der Seitenleiste, nichts auf der Seite —
   * für Einordnung, Prinzip und Ausblick in einem Rundgang. Weiter geht es mit „weiter“.
   */
  ziel?: Ziel;
  /** Ohne Handlung ist der Schritt ein Prüfpunkt: Das Ziel muss erscheinen und `pruefen` erfüllen. */
  handlung?: Handlung;
  pruefen?: Pruefung;
  /** Ein Satz am Element. */
  kurz: string;
  /**
   * Erläuterung in der Seitenleiste: warum dieser Schritt, was dahinter passiert. ✦ wie in der Demo.
   * Eine Leerzeile trennt Absätze.
   */
  lang?: string;
  /** Kapitel, unter dem der Schritt in der Seitenleiste steht; gilt bis zum nächsten. */
  kapitel?: string;
  /** Wo es in README, Spezifikation oder Entscheidungen weitergeht. */
  mehr?: Verweis[];
}

export interface Startzustand {
  ausbaustand: Ausbaustand;
  patientId: string;
  /** Vor dem ersten Schritt die eGK einlesen (Befugnis für die ePA). */
  egkEinlesen: boolean;
  /** Ansicht, in der der Pfad beginnt, etwa `/patient/p-hoffmann/diagnosen`. */
  pfad: string;
  /** ✦ Weg der Diagnosen in die ePA, wenn nicht geführt (ADR 0063). */
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
  /** Angebotene Modi, der erste ist der Standard. Ohne Angabe alle; ein Rundgang ist keine Aufgabe. */
  modi?: Modus[];
}

/** Erzählung ohne Element auf der Seite? */
export function erzaehlung(s: Schritt): s is Schritt & { ziel: undefined } {
  return !s.ziel;
}

/** Die Modi eines Klickpfads — und der, in dem er beginnt, wenn die Adresse einen anderen nennt. */
export function modiVon(s: Szenario): Modus[] {
  return s.modi ?? ['gefuehrt', 'frei', 'aufgabe'];
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
