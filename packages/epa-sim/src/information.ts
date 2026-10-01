import type { FastifyInstance } from 'fastify';
import { bestandFuer, bestandVorhanden } from './bestand.ts';

/**
 * Information Service des Aktensystems — nach OpenAPI `I_Information_Service` 1.5.1
 * (ePA-Basic, Release 3.1.3).
 *
 * Zwei Abfragen, die ein Primärsystem **vor** jedem Zugriff stellen kann, ohne Anmeldung an
 * der Akte und ohne Befugnis:
 * - `getRecordStatus` — gibt es eine Akte, und ist sie nutzbar? 204, 404 `noHealthRecord`,
 *   409 `statusMismatch` (Akte vorübergehend gesperrt, etwa beim Anbieterwechsel);
 * - `getConsentDecisionInformation` — Widersprüche gegen Versorgungsprozesse
 *   (`medication`, `erp-submission`), wie sie das Consent Management spiegelt.
 *
 * Damit kann das Praxissystem den Zustand der Akte zeigen, bevor es etwas aus ihr liest.
 */

export const INFORMATION_BASIS = '/information/api/v1/ehr';

const USER_AGENT = /^[a-zA-Z0-9-]{1,20}\/[a-zA-Z0-9\-.]{1,15}$/;
const KVNR = /^[A-Z]\d{9}$/;

function fehler(errorCode: string, errorDetail: string) {
  return { errorCode, errorDetail };
}

export function informationEinhaengen(app: FastifyInstance): void {
  /** Gemeinsame Prüfung: Kopfzeilen, Akte, Zustand. Gibt die KVNR zurück oder antwortet selbst. */
  function pruefen(
    anfrage: { headers: Record<string, unknown> },
    antwort: { code: (c: number) => { send: (k: unknown) => unknown } },
  ): string | null {
    const kvnr = String(anfrage.headers['x-insurantid'] ?? '');
    if (!USER_AGENT.test(String(anfrage.headers['x-useragent'] ?? '')) || !KVNR.test(kvnr)) {
      antwort
        .code(400)
        .send(fehler('malformedRequest', 'x-useragent oder x-insurantid fehlt oder ist ungültig.'));
      return null;
    }
    if (!bestandVorhanden(kvnr)) {
      antwort.code(404).send(fehler('noHealthRecord', `Für ${kvnr} besteht keine Akte.`));
      return null;
    }
    if (bestandFuer(kvnr).status !== 'ACTIVATED') {
      antwort
        .code(409)
        .send(fehler('statusMismatch', 'Die Akte ist vorübergehend nicht nutzbar (SUSPENDED).'));
      return null;
    }
    return kvnr;
  }

  app.get(INFORMATION_BASIS, async (anfrage, antwort) => {
    if (!pruefen(anfrage, antwort)) return antwort;
    return antwort.code(204).send();
  });

  app.get(`${INFORMATION_BASIS}/consentdecisions`, async (anfrage, antwort) => {
    const kvnr = pruefen(anfrage, antwort);
    if (!kvnr) return antwort;
    const w = bestandFuer(kvnr).widersprueche;
    return {
      data: [
        { functionId: 'medication', decision: w.medication },
        { functionId: 'erp-submission', decision: w['erp-submission'] },
      ],
    };
  });
}
