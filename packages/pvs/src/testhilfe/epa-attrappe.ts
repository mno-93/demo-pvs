import { vi } from 'vitest';
import type { Ressource } from '@demo-pvs/kern';

/**
 * Attrappe des Aktensystems für Oberflächentests: ersetzt `fetch`, zeichnet jeden Aufruf auf
 * und antwortet, wie der Test es vorgibt. Was der Test nicht beantwortet, bekommt 404.
 */

export interface Aufzeichnung {
  methode: string;
  pfad: string;
  kopf: Record<string, string>;
  koerper: unknown;
}

export interface Attrappenantwort {
  status: number;
  inhalt?: unknown;
  kopf?: Record<string, string>;
}

export function epaAttrappe(
  antworten: (a: Aufzeichnung) => Attrappenantwort | undefined,
): Aufzeichnung[] {
  const aufrufe: Aufzeichnung[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (pfad: string, init: RequestInit = {}) => {
      const a: Aufzeichnung = {
        methode: init.method ?? 'GET',
        pfad: String(pfad),
        kopf: (init.headers ?? {}) as Record<string, string>,
        koerper: init.body ? JSON.parse(String(init.body)) : null,
      };
      aufrufe.push(a);
      const antwort = antworten(a) ??
        informationService(a) ?? {
          status: 404,
          inhalt: {
            resourceType: 'OperationOutcome',
            issue: [
              { severity: 'error', code: 'not-found', diagnostics: `${a.methode} ${a.pfad}` },
            ],
          },
        };
      return new Response(antwort.inhalt === undefined ? null : JSON.stringify(antwort.inhalt), {
        status: antwort.status,
        headers: { 'content-type': 'application/json', ...(antwort.kopf ?? {}) },
      });
    }),
  );
  return aufrufe;
}

/**
 * Information Service, wenn der Test nichts anderes vorgibt: Die Akte besteht, kein Widerspruch.
 */
function informationService(a: Aufzeichnung): Attrappenantwort | undefined {
  if (a.pfad === '/information/api/v1/ehr') return { status: 204 };
  if (a.pfad === '/information/api/v1/ehr/consentdecisions') {
    return {
      status: 200,
      inhalt: {
        data: [
          { functionId: 'medication', decision: 'permit' },
          { functionId: 'erp-submission', decision: 'permit' },
        ],
      },
    };
  }
  return undefined;
}

export function suchergebnis(treffer: Ressource[], eingeschlossen: Ressource[] = []) {
  return {
    resourceType: 'Bundle',
    type: 'searchset',
    total: treffer.length,
    entry: [
      ...treffer.map((resource) => ({ resource, search: { mode: 'match' } })),
      ...eingeschlossen.map((resource) => ({ resource, search: { mode: 'include' } })),
    ],
  };
}

export function provenance(
  ziel: Ressource,
  wer: { telematikId: string; anzeige: string },
  recorded: string,
  taetigkeit = 'CREATE',
): Ressource {
  return {
    resourceType: 'Provenance',
    id: `prov-${String(ziel.id)}-${taetigkeit}`,
    target: [
      {
        reference: `${ziel.resourceType}/${String(ziel.id)}/_history/${ziel.meta?.versionId ?? '1'}`,
      },
    ],
    recorded,
    activity: { coding: [{ code: taetigkeit }] },
    agent: [
      {
        who: {
          identifier: {
            system: 'https://gematik.de/fhir/sid/telematik-id',
            value: wer.telematikId,
          },
          display: wer.anzeige,
        },
      },
    ],
  };
}

export const PRAXIS = {
  telematikId: 'DEMO-PRAXIS-STADTGARTEN',
  anzeige: 'Hausarztpraxis am Stadtgarten',
};
export const KLINIKUM = {
  telematikId: 'DEMO-KLINIKUM-SONNENSCHEIN',
  anzeige: 'Klinikum Sonnenschein',
};

/** Eine Befugnis, die im Test nicht abläuft. */
export function dauerhafteBefugnis(patientId: string) {
  return {
    patientId,
    gueltigBis: '2099-01-01T00:00:00+01:00',
    erteiltAm: '2026-09-09T08:00:00+02:00',
  };
}
