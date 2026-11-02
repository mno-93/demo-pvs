import type { SimAnwendung } from './schnittstelle.ts';
import { lesewegeEinhaengen } from './medikation-lesen.ts';
import { querywegeEinhaengen } from './medikation-query.ts';
import { empwegeEinhaengen } from './medikation-emp.ts';
import { emlwegeEinhaengen } from './medikation-eml.ts';

/**
 * Wege des Medication Service (`de.gematik.epa.medication` 1.4.0-ballot.1, ADR 0047): Lesen,
 * Common Query API, Schreiben im eMP und in der eML. Die Fachlogik, die alle Wege teilen —
 * Profile, Prüfungen, Verknüpfen und Zurücksetzen —, steht in `medikation.ts`.
 */
export function medikationEinhaengen(
  app: SimAnwendung,
  kvnrAus: (anfrage: { headers: Record<string, unknown> }) => string,
  sitzungAus: (anfrage: { headers: Record<string, unknown> }) => string,
) {
  lesewegeEinhaengen(app, kvnrAus);
  querywegeEinhaengen(app, kvnrAus);
  empwegeEinhaengen(app, kvnrAus, sitzungAus);
  emlwegeEinhaengen(app, kvnrAus, sitzungAus);
}
