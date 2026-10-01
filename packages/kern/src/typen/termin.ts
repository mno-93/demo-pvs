export type Terminart = 'sprechstunde' | 'vorsorge' | 'impfung' | 'blutentnahme' | 'hausbesuch';

export const TERMINART_BEZEICHNUNG: Record<Terminart, string> = {
  sprechstunde: 'Sprechstunde',
  vorsorge: 'Vorsorge',
  impfung: 'Impfung',
  blutentnahme: 'Blutentnahme',
  hausbesuch: 'Hausbesuch',
};

export type Terminstatus = 'geplant' | 'wartend' | 'inBehandlung' | 'erledigt' | 'abgesagt';

export const TERMINSTATUS_BEZEICHNUNG: Record<Terminstatus, string> = {
  geplant: 'geplant',
  wartend: 'im Wartezimmer',
  inBehandlung: 'in Behandlung',
  erledigt: 'erledigt',
  abgesagt: 'abgesagt',
};

export interface Termin {
  id: string;
  patientId: string;
  /** ISO-Datum. */
  datum: string;
  /** Uhrzeit im Format HH:MM. */
  uhrzeit: string;
  dauerMinuten: number;
  art: Terminart;
  status: Terminstatus;
  anlass: string;
}
