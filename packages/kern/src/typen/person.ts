/**
 * Der Typ heißt technisch `Patient`, weil die FHIR-Ressource so heißt und jede
 * Umbenennung eine Übersetzungsschicht erzeugen würde. In der Oberfläche wird
 * durchgehend „Patient:in" geschrieben.
 */

export type Geschlecht = 'weiblich' | 'maennlich' | 'divers' | 'unbestimmt';

export const GESCHLECHT_BEZEICHNUNG: Record<Geschlecht, string> = {
  weiblich: 'weiblich',
  maennlich: 'männlich',
  divers: 'divers',
  unbestimmt: 'unbestimmt',
};

export type Versichertenart = 'Mitglied' | 'Familienversichert' | 'Rentner:in' | 'Selbstzahlend';

export interface Anschrift {
  strasse: string;
  hausnummer: string;
  plz: string;
  ort: string;
}

export interface Versichertendaten {
  /** Krankenversichertennummer, ein Buchstabe und neun Ziffern. */
  kvnr: string;
  kostentraeger: string;
  /** Institutionskennzeichen des Kostenträgers, in der Demo fiktiv. */
  kostentraegerkennung: string;
  versichertenart: Versichertenart;
  zuzahlungsbefreit: boolean;
  /** Datum, bis zu dem die Kartendaten als gültig gelten (ISO). */
  gueltigBis: string;
  /** Zeitpunkt des letzten simulierten Karteneinlesens (ISO), sonst null. */
  zuletztEingelesen: string | null;
}

export interface Patient {
  id: string;
  nachname: string;
  vorname: string;
  /** ISO-Datum. */
  geburtsdatum: string;
  geschlecht: Geschlecht;
  anschrift: Anschrift;
  telefon: string;
  versicherung: Versichertendaten;
  /** ISO-Zeitpunkt der Anlage in dieser Praxis. */
  angelegtAm: string;
  /** Freitexthinweis auf der Patientenkarte, etwa „Dolmetschbedarf". */
  hinweis: string | null;
}
