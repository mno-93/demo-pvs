import type { FastifyInstance } from 'fastify';

/**
 * ✦ VORSCHLAG — Kontaktauskunft für Rückfragen von Versicherten. Keine ePA-Schnittstelle.
 *
 * Stellvertreter für den Verzeichnisdienst (VZD-FHIR-Directory), in dem das ePA-FdV
 * Einrichtungen bereits heute sucht, wenn Versicherte eine Befugnis erteilen (Konzept
 * ePA 3.1.3, „FHIR Verzeichnisdienst"). Welche Kontaktfelder der echte Eintrag trägt und ob er
 * die Erreichbarkeit über den TI-Messenger für Versicherte ausweist, ist ⚠ nicht belegt — die
 * Demo bildet deshalb nur Name, Telefon und eine Angabe zum TI-Messenger nach.
 *
 * Gesucht wird über die **Einrichtung aus den Metadaten** des Dokuments, so wie sie dasteht.
 * Steht dort eine Abkürzung oder „Praxis", findet die Auskunft nichts — das ist gewollt: Es ist
 * dieselbe Lücke, die unklare Metadaten in der Versorgung reißen (B22–B24).
 *
 * Alle Einträge sind erfunden; die Telefonnummern beginnen mit 0000.
 */

export const KONTAKT_BASIS = '/epa/vorschlag/kontakt/api/v1';

export interface Kontakteintrag {
  name: string;
  telefon: string;
  /** Die Einrichtung ist für Versicherte über den TI-Messenger erreichbar (✦, Annahme). */
  tiMessenger: boolean;
}

const VERZEICHNIS: Kontakteintrag[] = [
  { name: 'Hausarztpraxis am Stadtgarten', telefon: '0000 3030-0', tiMessenger: true },
  { name: 'Hausarztpraxis Nordstadt', telefon: '0000 2233-0', tiMessenger: true },
  { name: 'Klinikum Sonnenschein', telefon: '0000 1234-200', tiMessenger: false },
  { name: 'Kreisklinikum Weserbogen', telefon: '0000 9876-0', tiMessenger: false },
  { name: 'Kardiologische Praxis am Wall', telefon: '0000 5544-0', tiMessenger: true },
  {
    name: 'Kardiologische Praxis Dr. Brinkmann, Oldenburg',
    telefon: '0000 4711-0',
    tiMessenger: false,
  },
  {
    name: 'Augenärztliche Gemeinschaftspraxis am Markt',
    telefon: '0000 3344-0',
    tiMessenger: false,
  },
  {
    name: 'Diabetologische Schwerpunktpraxis Nordstadt',
    telefon: '0000 5566-0',
    tiMessenger: true,
  },
  { name: 'Laborgemeinschaft Nordwest', telefon: '0000 6060-0', tiMessenger: false },
  { name: 'MVZ Labor Oldenburg', telefon: '0000 8080-0', tiMessenger: false },
];

const normal = (t: string) => t.toLowerCase().replace(/\s+/g, ' ').trim();

/** Sucht genau die Einrichtung — keine unscharfe Suche, die „AGP" zu einer Augenpraxis macht. */
export function kontaktSuchen(name: string): Kontakteintrag | null {
  return VERZEICHNIS.find((e) => normal(e.name) === normal(name)) ?? null;
}

export function kontaktEinhaengen(app: FastifyInstance): void {
  app.get(`${KONTAKT_BASIS}/einrichtung`, async (anfrage, antwort) => {
    const { name } = anfrage.query as { name?: string };
    const eintrag = kontaktSuchen(String(name ?? ''));
    if (!eintrag) {
      return antwort.code(404).send({
        errorCode: 'notFound',
        errorDetail: 'Zu dieser Bezeichnung gibt es keinen Eintrag im Verzeichnis.',
      });
    }
    return eintrag;
  });
}
