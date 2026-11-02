import type { SimAntwort, SimAnwendung } from './schnittstelle.ts';
import { vollUrl, type Ressource } from '@demo-pvs/kern';
import { suchen } from './suche.ts';
import { jetzt, operationOutcome, suchergebnis } from './fhir-hilfen.ts';
import { archivierteKennungen, fassungen, istGeloescht } from './schreibwege.ts';
import { MSG, QUERY_BASIS, ablage, finden, melden } from './medikation.ts';

/** Common Query API für die Typen des Medication Service: Suche, Lesen und Versionshistorie. */
export function querywegeEinhaengen(
  app: SimAnwendung,
  kvnrAus: (anfrage: { headers: Record<string, unknown> }) => string,
) {
  /**
   * Common Query API `/epa/query/api/v1/fhir` (`de.gematik.epa` 1.4.0-ballot.1): Suche, Lesen und
   * Versionshistorie je Ressourcentyp. Der Medication Service hat seit 1.4.0 keine eigene Query
   * API mehr. Neben `_id`, `_lastUpdated`, `status` und `identifier` die Parameter, mit denen ein
   * Primärsystem Änderungen seit einem Zeitpunkt abfragt: an Provenance `recorded`, `when`,
   * `agent-identifier`, `target`, `is-emp-chronology`. ⚠ Die Demo bedient nur die Typen des
   * Medication Service samt `Condition` (Behandlungsgründe); `_has`, `Patient`, `Practitioner`,
   * `PractitionerRole` und `AuditEvent` sind nicht nachgebildet.
   */
  const q = QUERY_BASIS;
  /** Fassungen einer Instanz, neueste zuerst — aus dem Archiv, dazu die aktuelle. */
  const verlauf = (kvnr: string, typ: string, id: string): Ressource[] => {
    const aktuell = finden(kvnr, typ, id);
    const alle = fassungen(ablage(kvnr), typ, id);
    return (
      aktuell && !alle.some((f) => f.meta?.versionId === aktuell.meta?.versionId)
        ? [...alle, aktuell]
        : alle
    )
      .slice()
      .reverse();
  };
  const verlaufsbundle = (eintraege: Ressource[]) => ({
    resourceType: 'Bundle',
    meta: { lastUpdated: jetzt() },
    type: 'history',
    total: eintraege.length,
    entry: eintraege.map((f) => ({
      fullUrl: vollUrl(f),
      resource: f,
      request: {
        method: f.meta?.versionId === '1' ? 'POST' : 'PUT',
        url: `${f.resourceType}/${String(f.id)}`,
      },
      response: { status: f.meta?.versionId === '1' ? '201 Created' : '200 OK' },
    })),
  });
  const nachAktualitaet = (a: Ressource, b: Ressource) =>
    String(b.meta?.lastUpdated ?? '').localeCompare(String(a.meta?.lastUpdated ?? ''));
  for (const typ of [
    'Medication',
    'MedicationRequest',
    'MedicationDispense',
    'MedicationStatement',
    'Condition',
    'Organization',
    'Provenance',
  ]) {
    // Provenance kennt laut CapabilityStatement nur Suche und Lesen, keine Historie.
    const mitHistorie = typ !== 'Provenance';
    if (mitHistorie) {
      /** history-type: alle Fassungen aller Instanzen des Typs, neueste zuerst. */
      app.get(`${q}/${typ}/_history`, async (anfrage) => {
        const kvnr = kvnrAus(anfrage);
        const kennungen = new Set([
          ...ablage(kvnr)
            .filter((r) => r.resourceType === typ)
            .map((r) => String(r.id)),
          ...archivierteKennungen(ablage(kvnr), typ),
        ]);
        return verlaufsbundle(
          [...kennungen].flatMap((id) => verlauf(kvnr, typ, id)).sort(nachAktualitaet),
        );
      });
    }
    app.get(`${q}/${typ}`, async (anfrage, antwort) => {
      const kvnr = kvnrAus(anfrage);
      const p = anfrage.query as Record<string, string | string[] | undefined>;
      const ergebnis = suchen(typ, p, ablage(kvnr));
      if (!Array.isArray(ergebnis))
        return melden(
          antwort,
          400,
          ergebnis.art === 'unbekannt' ? 'not-supported' : 'invalid',
          ergebnis.text,
          ergebnis.art === 'unbekannt' ? MSG.parameterUnbekannt : MSG.syntax,
        );
      // Standardsortierung: zuletzt geändert zuerst (IG-MED37997J2U und Verwandte).
      ergebnis.sort(nachAktualitaet);
      const ab = Number(([] as string[]).concat(p['_offset'] ?? [])[0] ?? 0);
      const anzahl = Number(([] as string[]).concat(p['_count'] ?? [])[0] ?? ergebnis.length);
      return { ...suchergebnis(ergebnis.slice(ab, ab + anzahl)), total: ergebnis.length };
    });
    const unbekannt = (antwort: SimAntwort) =>
      antwort.code(404).send(operationOutcome('error', 'not-found', `${typ} nicht gefunden.`));
    // Gelöschte Instanzen: 410 (FHIR read); ihre Fassungen bleiben über die Historie abrufbar.
    const fehltOderGeloescht = (kvnr: string, id: string, antwort: SimAntwort) =>
      istGeloescht(ablage(kvnr), typ, id)
        ? melden(antwort, 410, 'deleted', `${typ}/${id} wurde gelöscht.`, MSG.geloescht)
        : unbekannt(antwort);
    app.get(`${q}/${typ}/:id`, async (anfrage, antwort) => {
      const kvnr = kvnrAus(anfrage);
      const id = (anfrage.params as { id: string }).id;
      return finden(kvnr, typ, id) ?? fehltOderGeloescht(kvnr, id, antwort);
    });
    if (!mitHistorie) continue;
    /** Versionshistorie einer Instanz, neueste zuerst — aus dem Fassungsarchiv, auch gelöscht. */
    app.get(`${q}/${typ}/:id/_history`, async (anfrage, antwort) => {
      const kvnr = kvnrAus(anfrage);
      const id = (anfrage.params as { id: string }).id;
      const liste = verlauf(kvnr, typ, id);
      return liste.length > 0 ? verlaufsbundle(liste) : unbekannt(antwort);
    });
    app.get(`${q}/${typ}/:id/_history/:vid`, async (anfrage, antwort) => {
      const kvnr = kvnrAus(anfrage);
      const { id, vid } = anfrage.params as { id: string; vid: string };
      const f = verlauf(kvnr, typ, id).find((x) => x.meta?.versionId === vid);
      return f ?? unbekannt(antwort);
    });
  }
}
