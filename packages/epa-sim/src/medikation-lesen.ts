import type { SimAntwort, SimAnwendung } from './schnittstelle.ts';
import { vollUrl, type Ressource } from '@demo-pvs/kern';
import { bestandFuer } from './bestand.ts';
import { aktuelleChronologie, istChronologie } from './chronologie.ts';
import { imZeitraum, jetzt, operationOutcome, suchergebnis } from './fhir-hilfen.ts';
import { fassung, fassungZum, patientFuer, versionierterVerweis } from './schreibwege.ts';
import {
  type Anfrage,
  DATUMSWERT,
  EMP,
  MEDIKATION_BASIS,
  MSG,
  RENDER_EINSTELLUNG,
  ZAHL,
  ablage,
  aktivitaetsverweise,
  bezugsdatum,
  fehlt,
  finden,
  melden,
  nachBezugsdatum,
  operationsparameterAbweisen,
  referenzId,
  seitenverweise,
} from './medikation.ts';

/** Lesen im Medication Service: `$medication-list`, `$medication-plan`, das Protokoll des Plans und die Einstellung der Zwischenüberschriften (Render API). */
export function lesewegeEinhaengen(
  app: SimAnwendung,
  kvnrAus: (anfrage: { headers: Record<string, unknown> }) => string,
) {
  const b = MEDIKATION_BASIS;
  /* ---------- Lesen ---------- */

  /** Einschlüsse zu einer Medikationsinformation: Arzneimittel, Verordnung, Abgabe, Änderungen. */
  function einschluesse(kvnr: string, aussagen: Ressource[]): Ressource[] {
    const alle = ablage(kvnr);
    const ids = new Set<string>();
    const dazu: Ressource[] = [];
    const nimm = (r: Ressource | undefined) => {
      if (r && !ids.has(`${r.resourceType}/${String(r.id)}`)) {
        ids.add(`${r.resourceType}/${String(r.id)}`);
        dazu.push(r);
      }
    };
    for (const a of aussagen) {
      nimm(finden(kvnr, 'Medication', referenzId(a['medicationReference'])));
      for (const q of (a['derivedFrom'] as { reference?: string }[] | undefined) ?? []) {
        const [typ, id] = String(q.reference ?? '').split('/');
        const quelle = finden(kvnr, String(typ), String(id));
        nimm(quelle);
        // Das abgegebene Arzneimittel kann vom verordneten abweichen (Austausch).
        if (quelle) nimm(finden(kvnr, 'Medication', referenzId(quelle['medicationReference'])));
      }
      // Änderungseinträge, die auf genau diese Fassung zeigen (IG-MED98416U4Q).
      for (const p of alle.filter(
        (r) =>
          r.resourceType === 'Provenance' &&
          !istChronologie(r, EMP) &&
          (r['target'] as { reference: string }[]).some(
            (t) => t.reference === versionierterVerweis(a),
          ),
      )) {
        nimm(p);
        nimm(finden(kvnr, 'Organization', referenzId((p['agent'] as { who: unknown }[])[0]?.who)));
      }
    }
    return dazu;
  }

  /**
   * eML — `$medication-list`: nicht stornierte Medikationsinformationen, optional nach Datum;
   * absteigend nach Datumsbezug (IG-MED03188C0X), die Person als erstes Element der ersten Seite
   * (IG-MED25360QCP); ohne Treffer 404 `MSG_NO_MATCH` (IG-MED16217P4A).
   */
  app.get(`${b}/$medication-list`, async (anfrage, antwort) => {
    if (
      operationsparameterAbweisen(
        anfrage,
        { date: DATUMSWERT, _count: ZAHL, _offset: ZAHL },
        antwort,
        { date: 2 },
      )
    )
      return antwort;
    const kvnr = kvnrAus(anfrage);
    const q = anfrage.query as Record<string, string | string[] | undefined>;
    // `date` (0..2, Ober- und Untergrenze) — auch für „neu seit dem letzten Aufruf".
    // ⚠ „neu seit" trifft damit nur neue Einnahmezeiträume, keine späteren Nachträge zu alten.
    const aussagen = ablage(kvnr)
      .filter(
        (r) =>
          r.resourceType === 'MedicationStatement' &&
          r['status'] !== 'entered-in-error' &&
          imZeitraum(bezugsdatum(r), q['date']),
      )
      .sort(nachBezugsdatum);
    if (aussagen.length === 0)
      return melden(
        antwort,
        404,
        'not-found',
        'Keine Medikationsinformation zur Anfrage.',
        MSG.keinTreffer,
      );
    const q2 = anfrage.query as Record<string, string | undefined>;
    const ab = Number(q2['_offset'] ?? 0);
    const anzahl = Number(q2['_count'] ?? aussagen.length);
    const seite = aussagen.slice(ab, ab + anzahl);
    const ergebnis = suchergebnis(seite, einschluesse(kvnr, seite));
    return {
      ...ergebnis,
      total: aussagen.length,
      link: seitenverweise(anfrage, ab, Math.max(anzahl, 1), aussagen.length),
      // Die Person steht als erstes Element der ersten Seite.
      entry: [
        ...(ab === 0
          ? [
              {
                fullUrl: vollUrl(patientFuer(kvnr)),
                resource: patientFuer(kvnr),
                search: { mode: 'include' },
              },
            ]
          : []),
        ...ergebnis.entry,
      ],
    };
  });

  /**
   * eMP — `$medication-plan`: Bundle vom Typ collection mit dem Chronologieeintrag, den
   * eMP-Einträgen in der dort referenzierten Fassung, ihren Arzneimitteln und den
   * verknüpften eML-Einträgen. Mit `provenance` ein früherer Stand.
   */
  app.get(`${b}/$medication-plan`, async (anfrage, antwort) => {
    if (operationsparameterAbweisen(anfrage, { provenance: /^[A-Za-z0-9\-.]{1,64}$/ }, antwort))
      return antwort;
    const kvnr = kvnrAus(anfrage);
    const gewuenscht = (anfrage.query as Record<string, string | undefined>)['provenance'];
    const chronologie = gewuenscht
      ? ablage(kvnr).find((r) => istChronologie(r, EMP) && r.id === gewuenscht)
      : aktuelleChronologie(ablage(kvnr), EMP);
    // Unbekannter Stand: 404 MSG_RESOURCE_ID_FAIL (IG-MED14428K6S); noch kein eMP: 404
    // MEDSVC_EMP_NO_EXIST (IG-MED35894UP4).
    if (gewuenscht && !chronologie)
      return melden(antwort, 404, 'not-found', `Kein eMP-Stand ${gewuenscht}.`, MSG.unbekannt);
    if (!chronologie)
      return fehlt(
        antwort,
        'MEDSVC_EMP_NO_EXIST',
        'eMP does not exist',
        'Es gibt noch keinen eMP.',
      );
    // 1.4.0 (IG-MED04510JHX): alle Instanzen in der Fassung zum Bezugszeitpunkt — `recorded`
    // des Chronologieeintrags, sonst der Zeitpunkt der Anfrage.
    const bezug = gewuenscht ? String(chronologie?.['recorded'] ?? jetzt()) : jetzt();
    const zumBezug = (typ: string, id: string) =>
      fassungZum(ablage(kvnr), typ, id, bezug) ?? finden(kvnr, typ, id);
    // Einträge nach authoredOn aufsteigend, dann nach Kennung (IG-MED07144WB0).
    const eintraege = ((chronologie['target'] as { reference?: string }[] | undefined) ?? [])
      .filter((t) => !!t.reference)
      .map((t) => {
        const [typ, id, , v] = String(t.reference).split('/');
        return (
          (v ? fassung(ablage(kvnr), String(typ), String(id), v) : undefined) ??
          finden(kvnr, String(typ), String(id))
        );
      })
      .filter((r): r is Ressource => !!r)
      .sort(
        (x, y) =>
          String(x['authoredOn'] ?? '').localeCompare(String(y['authoredOn'] ?? '')) ||
          String(x.id).localeCompare(String(y.id)),
      );
    const dazu: Ressource[] = [];
    const nimm = (r: Ressource | undefined) => {
      if (r && !dazu.some((x) => x.resourceType === r.resourceType && x.id === r.id)) dazu.push(r);
    };
    for (const e of eintraege) {
      nimm(zumBezug('Medication', referenzId(e['medicationReference'])));
      for (const v of (e['reasonReference'] as { reference?: string }[] | undefined) ?? [])
        nimm(zumBezug('Condition', referenzId(v)));
      // Über `activity` die jüngste Medikationsinformation (nach Datumsbezug) mit Verordnung,
      // Abgabe und deren Arzneimitteln (IG-MED77392SBV, IG-MED49768SWR).
      const juengste = aktivitaetsverweise(e)
        .map((id) => zumBezug('MedicationStatement', id))
        .filter((r): r is Ressource => !!r)
        .sort(nachBezugsdatum)[0];
      if (juengste) {
        nimm(juengste);
        for (const q of (juengste['derivedFrom'] as { reference?: string }[] | undefined) ?? []) {
          const [typ, id] = String(q.reference ?? '').split('/');
          const quelle = zumBezug(String(typ), String(id));
          nimm(quelle);
          if (quelle) nimm(zumBezug('Medication', referenzId(quelle['medicationReference'])));
        }
      }
      // Änderungseinträge des eMP-Eintrags mit den verantwortlichen Organisationen.
      for (const p of ablage(kvnr).filter(
        (r) =>
          r.resourceType === 'Provenance' &&
          !istChronologie(r, EMP) &&
          String(r['recorded'] ?? '') <= bezug &&
          (r['target'] as { reference: string }[]).some((t) =>
            t.reference.startsWith(`MedicationRequest/${String(e.id)}/`),
          ),
      )) {
        nimm(p);
        nimm(finden(kvnr, 'Organization', referenzId((p['agent'] as { who: unknown }[])[0]?.who)));
      }
    }
    return {
      resourceType: 'Bundle',
      meta: { lastUpdated: jetzt() },
      type: 'collection',
      timestamp: jetzt(),
      entry: [patientFuer(kvnr), chronologie, ...eintraege, ...dazu].map((r) => ({
        fullUrl: vollUrl(r),
        resource: r,
      })),
    };
  });

  /** `$medication-plan-log` — die Chronologie, neueste zuerst. */
  app.get(`${b}/$medication-plan-log`, async (anfrage, antwort) => {
    if (operationsparameterAbweisen(anfrage, { _count: ZAHL, _offset: ZAHL }, antwort))
      return antwort;
    const kvnr = kvnrAus(anfrage);
    const q = anfrage.query as Record<string, string | undefined>;
    const anzahl = Number(q['_count'] ?? 50);
    const ab = Number(q['_offset'] ?? 0);
    // Neueste zuerst; bei gleichem Zeitpunkt die zuletzt angelegte.
    const sortiert = ablage(kvnr)
      .filter((r) => istChronologie(r, EMP))
      .reverse();
    const treffer = sortiert.slice(ab, ab + anzahl);
    return { ...suchergebnis(treffer), total: sortiert.length };
  });

  /**
   * Render API: Einstellung der Zwischenüberschriften im eMP (IG 1.4.0-ballot.1, „Render API:
   * Einstellung der Zwischenüberschriften (eMP)"): je Aktenkonto, PUT setzt, GET liefert den
   * anwendbaren Wert; JSON und XML mit dem Feld `subheadings`, Standard `true`. Kein FHIR.
   */
  const einstellung = (wert: boolean, anfrage: Anfrage, antwort: SimAntwort) =>
    String(anfrage.headers['accept'] ?? '').includes('xml')
      ? antwort
          .type('application/xml')
          .send(`<settings><subheadings>${String(wert)}</subheadings></settings>`)
      : antwort.type('application/json').send({ subheadings: wert });
  app.get(RENDER_EINSTELLUNG, async (anfrage, antwort) =>
    einstellung(bestandFuer(kvnrAus(anfrage)).empZwischenueberschriften ?? true, anfrage, antwort),
  );
  app.put(RENDER_EINSTELLUNG, async (anfrage, antwort) => {
    const koerper = anfrage.body;
    const wert =
      typeof koerper === 'string'
        ? /<subheadings>\s*(true|false)\s*<\/subheadings>/.exec(koerper)?.[1]
        : (koerper as { subheadings?: unknown } | undefined)?.subheadings;
    const gueltig = wert === true || wert === false || wert === 'true' || wert === 'false';
    if (!gueltig)
      return antwort
        .code(400)
        .send(operationOutcome('error', 'invalid', 'Erwartet wird subheadings (boolean).'));
    const b = bestandFuer(kvnrAus(anfrage));
    b.empZwischenueberschriften = wert === true || wert === 'true';
    return einstellung(b.empZwischenueberschriften, anfrage, antwort);
  });
}
