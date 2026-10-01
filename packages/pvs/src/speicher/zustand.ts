import type {
  Allergie,
  Behandlungsfall,
  Diagnose,
  Karteikarteneintrag,
  Medikationsspiegel,
  LokalesDokument,
  Leistungsziffer,
  Nutzer,
  Patient,
  Rezept,
  Impfung,
  Fassungsstand,
  Termin,
  Sortierung,
} from '@demo-pvs/kern';

/**
 * Der gesamte Zustand des Praxissystems in einem Objekt.
 *
 * Er wird nie unmittelbar verändert, sondern nur über die benannten Vorgänge in
 * `vorgaenge.ts`. Das hält alle Handlungen der Anwendung an einer Stelle auf — Grundlage
 * für den Aufwandszähler ab Meilenstein 4 (siehe ADR 0003).
 */
export interface Zustand {
  /** Angemeldete Person; in der Demo über eine Umschaltung gewechselt. */
  nutzer: Nutzer;
  /** Auswahl der Personen, zwischen denen umgeschaltet werden kann. */
  nutzerliste: readonly Nutzer[];
  /** Datum, das die Anwendung als „heute" behandelt — hält die Demo reproduzierbar. */
  heute: string;

  patienten: readonly Patient[];
  faelle: readonly Behandlungsfall[];
  karteikarte: readonly Karteikarteneintrag[];
  diagnosen: readonly Diagnose[];
  allergien: readonly Allergie[];
  /**
   * Dokumente im Praxissystem — eingescannte Unterlagen, vom Labor übermittelte Befunde und
   * aus der ePA übernommene Dokumente. Was in der ePA liegt, ist damit nicht automatisch hier
   * vorhanden.
   *
   * Laborwerte stehen bewusst nicht als eigener Bestand im Zustand: Sie werden nicht erfasst,
   * sondern aus den Laborbefunden dieser Ablage gelesen (laborwerteAusDokumenten).
   */
  dokumente: readonly LokalesDokument[];
  /**
   * Zuletzt aus der ePA abgeglichener Medikationsplan je Patient:in. Der Spiegel macht
   * sichtbar, dass die Medikation lokal und in der ePA geführt wird — und wann beide
   * zuletzt übereinstimmten.
   */
  medikationsspiegel: readonly Medikationsspiegel[];
  /**
   * Was das Praxissystem über seine Befugnis je Akte weiß — aus der Antwort der ePA beim
   * Einlesen der eGK. Maßgeblich ist allein die ePA; antwortet sie mit `notEntitled`, wird
   * der Eintrag hier entfernt (ADR 0017).
   */
  epaBefugnisse: readonly EpaBefugnis[];
  leistungen: readonly Leistungsziffer[];
  termine: readonly Termin[];
  /**
   * E-Rezepte der Praxis: vorbereitet, gesendet, gelöscht. Ob eines in der Medikationsliste
   * steht oder eingelöst ist, erfährt die Praxis nur aus der ePA.
   */
  rezepte: readonly Rezept[];
  /** Impfungen der Praxis — in der ✦ Impfliste der ePA geführt, wenn `epaId` gesetzt ist. */
  impfungen: readonly Impfung[];
  /**
   * Was die Praxis beim letzten Aufruf einer ePA-Sicht gesehen hat — je Person und Sicht
   * (Patient Summary, Diagnosenliste, Allergienliste, Impfliste). Grundlage für „neu seit dem
   * letzten Aufruf" (ADR 0027).
   */
  epaGesehen: readonly EpaGesehen[];
  /**
   * Lesezeichen für die spezifizierte Abfrage „seit" — je Person und Bestand der Zeitpunkt des
   * Aktensystems beim letzten Aufruf, beim Medikationsplan dazu der Chronologieeintrag
   * (ADR 0030).
   */
  epaLesezeichen: readonly EpaLesezeichen[];
  /** Wie die Praxis die Listen für Diagnosen und Allergien ordnet — je Person (ADR 0029). */
  listenordnung: readonly Listenordnung[];

  /** Zahl der zustandsverändernden Handlungen seit dem letzten Zurücksetzen. */
  handlungen: number;
  /** Kurzprotokoll der Handlungen, jüngste zuerst. */
  protokoll: readonly Protokolleintrag[];
  /** Vergrößerte Darstellung für die Vorführung. */
  vorfuehrmodus: boolean;
}

export type EpaSicht = 'summary' | 'Condition' | 'AllergyIntolerance' | 'Immunization';

export interface EpaLesezeichen {
  patientId: string;
  bestand: 'dokumente' | 'medikation';
  /** Zeitpunkt des Aktensystems aus der letzten Antwort. */
  zeitpunkt: string;
  /** Chronologieeintrag des Medikationsplans beim letzten Aufruf. */
  chronologie: string | null;
}

export interface Listenordnung {
  patientId: string;
  liste: 'Condition' | 'AllergyIntolerance';
  sortierung: Sortierung;
  /** Eigene Reihenfolge als Kennungen der Einträge (Praxis oder ePA). */
  reihenfolge: readonly string[];
}

export interface EpaGesehen extends Fassungsstand {
  patientId: string;
  sicht: EpaSicht;
}

export interface EpaBefugnis {
  patientId: string;
  /** Ende der Befugnis laut ePA (ISO mit Zeitzone). */
  gueltigBis: string;
  /** Zeitpunkt des Einlesens, das sie begründet hat. */
  erteiltAm: string;
}

export interface Protokolleintrag {
  zeitpunkt: number;
  vorgang: string;
  beschreibung: string;
}
