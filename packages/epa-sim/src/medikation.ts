import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Ressource } from '@demo-pvs/kern';
import { bestandFuer } from './bestand.ts';
import {
  aktuelleChronologie,
  chronologieAnlegen,
  istChronologie,
  lesenachweisPruefen,
  type Chronologieart,
} from './chronologie.ts';
import {
  MS_DETAILS,
  ausgabe,
  jetzt,
  neueId,
  operationOutcome,
  parameterLesen,
  suchergebnis,
  type Detailcode,
} from './fhir-hilfen.ts';
import {
  aktivitaetAnlegen,
  fortschreiben,
  organisationAusKopf,
  patientFuer,
  subjektFuer,
  versionierterVerweis,
  type Handelnde,
} from './schreibwege.ts';

/**
 * Medication Service der ePA für alle — nach dem Implementation Guide
 * `de.gematik.epa.medication` 1.3.5 (Release ePA 3.1.3) und den generellen Prinzipien aus
 * `de.gematik.epa` 1.3.2.
 *
 * - eML: `$medication-list` — Medikationsinformationen (MedicationStatement) aus Verordnung,
 *   Abgabe und Nachtrag, mit Verordnung, Abgabe, Arzneimittel, Änderungseinträgen und der
 *   Person als Einschluss.
 * - eMP: `$medication-plan` — die Einträge (MedicationRequest mit `intent = plan`) eines
 *   Chronologieeintrags; `$medication-plan-log` — die Chronologie selbst.
 * - Schreiben: `$add-emp-entry`, `$update-emp-entry` (auch zum Beenden oder Berichtigen),
 *   `$add-eml-entry`, `$cancel-eml-entry`, `$link-emp`, `$unlink-emp`, `$batch-emp` mit
 *   `$emp-commit`. Jede Schreibung trägt den Lesenachweis `acknowledgedChronologyId` und
 *   den Header `X-Requesting-Organization`.
 *
 * Die Operationen des E-Rezept-Fachdienstes (`$provide-prescription-erp` und Verwandte) sind
 * dem Fachdienst vorbehalten; der Demo-Ersatz in `erezept.ts` wendet sie intern an, von
 * außen antworten sie mit 403. Nicht nachgebildet: Render API; Paginierung über
 * `_count`/`_offset` hinaus; Datenmigration.
 */

export const MEDIKATION_BASIS = '/epa/medication/api/v1/fhir';

const MS = 'https://gematik.de/fhir/epa-medication/StructureDefinition/';
export const PROFIL = {
  medication: `${MS}epa-medication`,
  empMedication: `${MS}emp-medication`,
  empEintrag: `${MS}emp-medication-request`,
  verordnung: `${MS}epa-medication-request`,
  abgabe: `${MS}epa-medication-dispense`,
  aussage: `${MS}epa-medication-statement`,
  chronologie: `${MS}emp-chronology-provenance`,
} as const;
export const EXT = {
  kontext: `${MS}context-extension`,
  herkunftsmittel: `${MS}emp-origin-medication-extension`,
  aktivitaet: `${MS}emp-medicationrequest-activity-extension`,
  chronologie: `${MS}is-emp-chronology-extension`,
} as const;
export const EMP_IDENTIFIER = 'https://gematik.de/fhir/sid/emp-identifier';
const ATC = 'http://fhir.de/CodeSystem/bfarm/atc';

const detail = (code: string, display: string): Detailcode => ({
  system: MS_DETAILS,
  code,
  display,
});

function kontext(r: Ressource): string | undefined {
  return ((r.extension ?? []) as { url: string; valueCode?: string }[]).find(
    (e) => e.url === EXT.kontext,
  )?.valueCode;
}

export function istEmpEintrag(r: Ressource): boolean {
  return r.resourceType === 'MedicationRequest' && r['intent'] === 'plan';
}

/** Einträge mit Status aktiv oder pausiert bilden den gültigen Plan. */
const IM_PLAN = new Set(['active', 'on-hold']);

export const EMP: Chronologieart = {
  profil: PROFIL.chronologie,
  kennzeichen: EXT.chronologie,
  gueltig: (r) => istEmpEintrag(r) && IM_PLAN.has(String(r['status'])),
  konflikt: detail(
    'MEDSVC_EMP_CHRONOLOGY_ID_MISMATCH',
    'Mismatch between acknowledged and current eMP chronology ID',
  ),
};

function ablage(kvnr: string): Ressource[] {
  return bestandFuer(kvnr).medikation;
}

function finden(kvnr: string, typ: string, id: string): Ressource | undefined {
  return ablage(kvnr).find((r) => r.resourceType === typ && r.id === id);
}

function referenzId(verweis: unknown): string {
  return (
    String((verweis as { reference?: string } | undefined)?.reference ?? '').split('/')[1] ?? ''
  );
}

function fehlt(antwort: FastifyReply, code: string, display: string, text: string, status = 404) {
  return antwort
    .code(status)
    .send(
      operationOutcome(
        'error',
        status === 404 ? 'not-found' : 'processing',
        text,
        detail(code, display),
      ),
    );
}

function ungueltig(antwort: FastifyReply, text: string) {
  return antwort
    .code(422)
    .send(
      operationOutcome(
        'error',
        'invalid',
        text,
        detail('MEDSVC_NO_VALID_STRUCTURE', 'Invalid Data Structure in Medication Service'),
      ),
    );
}

/**
 * Validierung, soweit sie die Demo nachbildet: Die ATC-de-Kodierung eines Arzneimittels
 * verlangt eine Versionsangabe (`EPAMedication`, `code.coding:atc-de.version` 1..1).
 */
function medicationPruefen(m: Ressource | undefined): string | null {
  if (!m || m.resourceType !== 'Medication') return 'Es fehlt eine Medication-Ressource.';
  const atc = (
    (m['code'] as { coding?: { system?: string; version?: string }[] } | undefined)?.coding ?? []
  ).filter((k) => k.system === ATC);
  if (atc.some((k) => !k.version)) {
    return 'Profilvalidierung fehlgeschlagen: code.coding:atc-de.version ist 1..1.';
  }
  return null;
}

function empEintragPruefen(r: Ressource | undefined): string | null {
  if (!r || r.resourceType !== 'MedicationRequest')
    return 'Es fehlt ein eMP-Eintrag (MedicationRequest).';
  if (r['intent'] !== 'plan') return 'Profilvalidierung fehlgeschlagen: intent muss „plan" sein.';
  if (!r['authoredOn']) return 'Profilvalidierung fehlgeschlagen: authoredOn ist 1..1.';
  const dosierung = r['dosageInstruction'];
  if (!Array.isArray(dosierung) || dosierung.length === 0) {
    return 'Profilvalidierung fehlgeschlagen: dosageInstruction ist 1..*.';
  }
  const status = String(r['status'] ?? 'active');
  if (!['active', 'on-hold', 'completed', 'stopped', 'entered-in-error'].includes(status)) {
    return `Der Status „${status}" ist für einen eMP-Eintrag nicht zulässig.`;
  }
  return null;
}

function mitKontext(r: Ressource, wert: string): Ressource {
  return {
    ...r,
    extension: [
      ...((r.extension ?? []) as { url: string }[]).filter((e) => e.url !== EXT.kontext),
      { url: EXT.kontext, valueCode: wert },
    ],
  };
}

type Anfrage = FastifyRequest;

export function medikationEinhaengen(
  app: FastifyInstance,
  kvnrAus: (anfrage: { headers: Record<string, unknown> }) => string,
  sitzungAus: (anfrage: { headers: Record<string, unknown> }) => string,
) {
  const b = MEDIKATION_BASIS;

  const organisation = (anfrage: Anfrage, antwort: FastifyReply): Handelnde | null =>
    organisationAusKopf(anfrage.headers as Record<string, unknown>, sitzungAus(anfrage), antwort);

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
      for (const p of alle.filter(
        (r) =>
          r.resourceType === 'Provenance' &&
          !istChronologie(r, EMP) &&
          (r['target'] as { reference: string }[]).some((t) =>
            t.reference.startsWith(`MedicationStatement/${String(a.id)}/`),
          ),
      )) {
        nimm(p);
        nimm(finden(kvnr, 'Organization', referenzId((p['agent'] as { who: unknown }[])[0]?.who)));
      }
    }
    return dazu;
  }

  /** eML — `$medication-list`: nicht stornierte Medikationsinformationen, optional nach Datum. */
  app.get(`${b}/$medication-list`, async (anfrage) => {
    const kvnr = kvnrAus(anfrage);
    const q = anfrage.query as Record<string, string | string[] | undefined>;
    const daten = ([] as string[]).concat(q['date'] ?? []);
    const imZeitraum = (r: Ressource) => {
      const t = String(
        r['dateAsserted'] ?? (r['effectivePeriod'] as { start?: string })?.start ?? '',
      );
      return daten.every((d) => {
        const vergleich = d.slice(0, 2);
        const wert = /^(ge|le|gt|lt|eq)/.test(d) ? d.slice(2) : d;
        if (vergleich === 'ge') return t >= wert;
        if (vergleich === 'gt') return t > wert;
        if (vergleich === 'le') return t.slice(0, wert.length) <= wert;
        if (vergleich === 'lt') return t < wert;
        return t.startsWith(wert);
      });
    };
    const aussagen = ablage(kvnr).filter(
      (r) =>
        r.resourceType === 'MedicationStatement' &&
        r['status'] !== 'entered-in-error' &&
        imZeitraum(r),
    );
    return suchergebnis(aussagen, [patientFuer(kvnr), ...einschluesse(kvnr, aussagen)]);
  });

  /**
   * eMP — `$medication-plan`: Bundle vom Typ collection mit dem Chronologieeintrag, den
   * eMP-Einträgen in der dort referenzierten Fassung, ihren Arzneimitteln und den
   * verknüpften eML-Einträgen. Mit `provenance` ein früherer Stand.
   */
  app.get(`${b}/$medication-plan`, async (anfrage, antwort) => {
    const kvnr = kvnrAus(anfrage);
    const gewuenscht = (anfrage.query as Record<string, string | undefined>)['provenance'];
    const chronologie = gewuenscht
      ? ablage(kvnr).find((r) => istChronologie(r, EMP) && r.id === gewuenscht)
      : aktuelleChronologie(ablage(kvnr), EMP);
    if (gewuenscht && !chronologie) {
      return fehlt(
        antwort,
        'MEDSVC_EMP_NO_EXIST',
        'eMP does not exist',
        `Kein eMP-Stand ${gewuenscht}.`,
      );
    }
    const eintraege = ((chronologie?.['target'] as { reference: string }[] | undefined) ?? [])
      .map((t) => {
        const [typ, id, , fassung] = t.reference.split('/');
        const r = finden(kvnr, String(typ), String(id));
        // Eine spätere Fassung liefert die Demo nicht historisch nach; sie kennzeichnet sie.
        return r && fassung && r.meta?.versionId !== fassung
          ? { ...r, meta: { ...r.meta, versionId: fassung } }
          : r;
      })
      .filter((r): r is Ressource => !!r);
    const dazu: Ressource[] = [];
    for (const e of eintraege) {
      const m = finden(kvnr, 'Medication', referenzId(e['medicationReference']));
      if (m) dazu.push(m);
      for (const a of (
        (e.extension ?? []) as {
          url: string;
          extension?: { url: string; valueReference?: unknown }[];
        }[]
      ).filter((x) => x.url === EXT.aktivitaet)) {
        const ms = finden(
          kvnr,
          'MedicationStatement',
          referenzId(a.extension?.find((y) => y.url === 'reference')?.valueReference),
        );
        if (ms) dazu.push(ms);
      }
      // Änderungseinträge des eMP-Eintrags mit den verantwortlichen Organisationen.
      for (const p of ablage(kvnr).filter(
        (r) =>
          r.resourceType === 'Provenance' &&
          !istChronologie(r, EMP) &&
          (r['target'] as { reference: string }[]).some((t) =>
            t.reference.startsWith(`MedicationRequest/${String(e.id)}/`),
          ),
      )) {
        dazu.push(p);
        const org = finden(
          kvnr,
          'Organization',
          referenzId((p['agent'] as { who: unknown }[])[0]?.who),
        );
        if (org && !dazu.includes(org)) dazu.push(org);
      }
    }
    return {
      resourceType: 'Bundle',
      type: 'collection',
      timestamp: jetzt(),
      entry: [patientFuer(kvnr), ...(chronologie ? [chronologie] : []), ...eintraege, ...dazu].map(
        (r) => ({
          fullUrl: `urn:uuid:${String(r.id)}`,
          resource: r,
        }),
      ),
    };
  });

  /** `$medication-plan-log` — die Chronologie, neueste zuerst. */
  app.get(`${b}/$medication-plan-log`, async (anfrage) => {
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

  /** Query API: Suche und Lesen je Ressourcentyp. */
  for (const typ of [
    'Medication',
    'MedicationRequest',
    'MedicationDispense',
    'MedicationStatement',
    'Organization',
    'Provenance',
  ]) {
    app.get(`${b}/${typ}`, async (anfrage) => {
      const kvnr = kvnrAus(anfrage);
      const q = anfrage.query as Record<string, string | undefined>;
      return suchergebnis(
        ablage(kvnr).filter(
          (r) =>
            r.resourceType === typ &&
            (!q['_id'] || r.id === q['_id']) &&
            (!q['status'] || r['status'] === q['status']) &&
            (q['is-emp-chronology'] === undefined ||
              istChronologie(r, EMP) === (q['is-emp-chronology'] === 'true')),
        ),
      );
    });
    app.get(`${b}/${typ}/:id`, async (anfrage, antwort) => {
      const r = finden(kvnrAus(anfrage), typ, (anfrage.params as { id: string }).id);
      return (
        r ??
        antwort.code(404).send(operationOutcome('error', 'not-found', `${typ} nicht gefunden.`))
      );
    });
  }

  /* ---------- Schreiben: eMP ---------- */

  interface Ergebnis {
    eintrag: Ressource;
    medication?: Ressource;
    aktivitaet: Ressource;
  }

  /** Kern von `$add-emp-entry`, ohne Chronologie — auch für den Stapel. */
  function empEintragAnlegen(
    kvnr: string,
    koerper: unknown,
    wer: Handelnde,
    antwort: FastifyReply,
  ): Ergebnis | null {
    const eingang = parameterLesen(koerper, 'empEntry')?.resource;
    const fehler = empEintragPruefen(eingang);
    if (fehler) {
      void ungueltig(antwort, fehler);
      return null;
    }
    const mittelteil = parameterLesen(koerper, 'medication')?.part ?? [];
    const neuesMittel = mittelteil.find((p) => p.name === 'resource')?.resource;
    const verweis = mittelteil.find((p) => p.name === 'reference')?.valueReference?.reference;
    let medication: Ressource | undefined;
    const zeit = jetzt();
    if (neuesMittel) {
      const f = medicationPruefen(neuesMittel);
      if (f) {
        void ungueltig(antwort, f);
        return null;
      }
      medication = mitKontext(
        {
          ...neuesMittel,
          id: neueId('med'),
          meta: { versionId: '1', lastUpdated: zeit, profile: [PROFIL.empMedication] },
          status: 'active',
        },
        'EMP',
      );
      ablage(kvnr).push(medication);
    } else if (verweis) {
      if (/\/_history\//.test(verweis)) {
        void ungueltig(
          antwort,
          'Der Verweis auf das Arzneimittel darf keine Versionsangabe tragen.',
        );
        return null;
      }
      medication = finden(kvnr, 'Medication', verweis.split('/')[1] ?? '');
      if (!medication) {
        void fehlt(
          antwort,
          'MEDSVC_PARAMETERS_REFERENCE_NO_EXIST',
          'Unresolved Reference in Parameters',
          `Nicht gefunden: ${verweis}`,
          422,
        );
        return null;
      }
    } else {
      void ungueltig(antwort, 'Der Parameter „medication" fehlt (resource oder reference).');
      return null;
    }
    const id = neueId('emp');
    const eintrag: Ressource = mitKontext(
      {
        ...eingang!,
        id,
        meta: { versionId: '1', lastUpdated: zeit, profile: [PROFIL.empEintrag] },
        // Der Dienst setzt den MedicationPlanIdentifier gleich der Ressourcenkennung.
        identifier: [{ system: EMP_IDENTIFIER, value: id }],
        status: eingang!['status'] ?? 'active',
        medicationReference: { reference: `Medication/${String(medication.id)}` },
        subject: subjektFuer(kvnr),
        extension: [
          ...((eingang!.extension ?? []) as { url: string }[]).filter(
            (e) => e.url !== EXT.herkunftsmittel,
          ),
          {
            url: EXT.herkunftsmittel,
            valueReference: { reference: `Medication/${String(medication.id)}` },
          },
        ],
      },
      'EMP',
    );
    ablage(kvnr).push(eintrag);
    const aktivitaet = aktivitaetAnlegen(
      ablage(kvnr),
      [versionierterVerweis(eintrag), ...(neuesMittel ? [versionierterVerweis(medication)] : [])],
      wer,
      'CREATE',
      zeit,
    );
    return { eintrag, medication, aktivitaet };
  }

  /** Kern von `$update-emp-entry`. */
  function empEintragAendern(
    kvnr: string,
    koerper: unknown,
    wer: Handelnde,
    antwort: FastifyReply,
  ): Ergebnis | null {
    const kennung = parameterLesen(koerper, 'medicationPlanIdentifier')?.valueIdentifier?.value;
    const eingang = parameterLesen(koerper, 'empEntry')?.resource;
    const vorhanden = ablage(kvnr).find(
      (r) =>
        istEmpEintrag(r) &&
        (r['identifier'] as { value?: string }[] | undefined)?.some((i) => i.value === kennung),
    );
    if (!vorhanden) {
      void fehlt(
        antwort,
        'MEDSVC_EMP_NO_EXIST',
        'eMP does not exist',
        `Kein eMP-Eintrag ${kennung ?? ''}.`,
      );
      return null;
    }
    const fehler = empEintragPruefen(eingang);
    if (fehler) {
      void ungueltig(antwort, fehler);
      return null;
    }
    if (vorhanden['status'] === 'entered-in-error') {
      void antwort
        .code(422)
        .send(
          operationOutcome(
            'error',
            'business-rule',
            'Ein fehlerhafter Eintrag wird nicht mehr geändert.',
            detail('MEDSVC_STATUS_INVALID', 'Invalid Status in Parameters'),
          ),
        );
      return null;
    }
    // Arzneimittel, Kennung, Herkunft und Verknüpfungen führt der Dienst; der Rest kommt vom Primärsystem.
    for (const feld of [
      'status',
      'statusReason',
      'dosageInstruction',
      'reasonCode',
      'note',
      'authoredOn',
    ]) {
      if (feld in eingang!) vorhanden[feld] = eingang![feld];
      else if (feld !== 'authoredOn') delete vorhanden[feld];
    }
    const behalten = new Set<string>([EXT.kontext, EXT.herkunftsmittel, EXT.aktivitaet]);
    vorhanden.extension = [
      ...((vorhanden.extension ?? []) as { url: string }[]).filter((e) => behalten.has(e.url)),
      ...((eingang!.extension ?? []) as { url: string }[]).filter((e) => !behalten.has(e.url)),
    ];
    const zeit = jetzt();
    fortschreiben(vorhanden, zeit);
    const medication = finden(kvnr, 'Medication', referenzId(vorhanden['medicationReference']));
    const aktivitaet = aktivitaetAnlegen(
      ablage(kvnr),
      [versionierterVerweis(vorhanden)],
      wer,
      'UPDATE',
      zeit,
    );
    return { eintrag: vorhanden, medication, aktivitaet };
  }

  const bestaetigt = (koerper: unknown) =>
    parameterLesen(koerper, 'acknowledgedChronologyId')?.valueId;

  app.post(`${b}/$add-emp-entry`, async (anfrage, antwort) => {
    const kvnr = kvnrAus(anfrage);
    const wer = organisation(anfrage, antwort);
    if (!wer || !lesenachweisPruefen(ablage(kvnr), EMP, bestaetigt(anfrage.body), antwort))
      return antwort;
    const e = empEintragAnlegen(kvnr, anfrage.body, wer, antwort);
    if (!e) return antwort;
    const chronologie = chronologieAnlegen(ablage(kvnr), EMP, wer);
    return ausgabe([
      ['empEntry', e.eintrag],
      ['medication', e.medication],
      ['relatedActivity', e.aktivitaet],
      ['relatedChronology', chronologie],
    ]);
  });

  app.post(`${b}/$update-emp-entry`, async (anfrage, antwort) => {
    const kvnr = kvnrAus(anfrage);
    const wer = organisation(anfrage, antwort);
    if (!wer || !lesenachweisPruefen(ablage(kvnr), EMP, bestaetigt(anfrage.body), antwort))
      return antwort;
    const e = empEintragAendern(kvnr, anfrage.body, wer, antwort);
    if (!e) return antwort;
    const chronologie = chronologieAnlegen(ablage(kvnr), EMP, wer);
    return ausgabe([
      ['empEntry', e.eintrag],
      ['medication', e.medication],
      ['relatedActivity', e.aktivitaet],
      ['relatedChronology', chronologie],
    ]);
  });

  /** `$emp-commit` gibt es nur im Stapel. */
  app.post(`${b}/$emp-commit`, async (_anfrage, antwort) =>
    antwort
      .code(405)
      .send(
        operationOutcome(
          'error',
          'forbidden',
          '$emp-commit ist nur innerhalb von $batch-emp zulässig.',
          detail(
            'MEDSVC_OPERATION_OUTSIDE_BATCH',
            'The operation can only be executed within a batch context',
          ),
        ),
      ),
  );

  /**
   * `$batch-emp` — mehrere Änderungen in einem Aufruf, abgeschlossen mit `$emp-commit`, der
   * genau eine neue Fassung erzeugt. Die Demo verarbeitet atomar: Scheitert ein Eintrag,
   * bleibt der Plan unverändert.
   */
  app.post(`${b}/$batch-emp`, async (anfrage, antwort) => {
    const kvnr = kvnrAus(anfrage);
    const wer = organisation(anfrage, antwort);
    if (!wer) return antwort;
    const bundle = (parameterLesen(anfrage.body, 'resource')?.resource ?? anfrage.body) as {
      type?: string;
      entry?: { request?: { url?: string }; resource?: unknown }[];
    };
    const eintraege = bundle.entry ?? [];
    const letzter = eintraege[eintraege.length - 1];
    if (
      bundle.type !== 'transaction' ||
      !String(letzter?.request?.url ?? '').includes('$emp-commit')
    ) {
      return ungueltig(
        antwort,
        'Erwartet wird ein Bundle vom Typ transaction, das mit $emp-commit endet.',
      );
    }
    if (!lesenachweisPruefen(ablage(kvnr), EMP, bestaetigt(letzter?.resource), antwort))
      return antwort;
    const sicherung = JSON.parse(JSON.stringify(ablage(kvnr))) as Ressource[];
    const antworten: unknown[] = [];
    for (const e of eintraege.slice(0, -1)) {
      const url = String(e.request?.url ?? '');
      const erg = url.includes('$add-emp-entry')
        ? empEintragAnlegen(kvnr, e.resource, wer, antwort)
        : url.includes('$update-emp-entry')
          ? empEintragAendern(kvnr, e.resource, wer, antwort)
          : null;
      if (!erg) {
        ablage(kvnr).splice(0, ablage(kvnr).length, ...sicherung);
        return antwort.sent ? antwort : ungueltig(antwort, `Im Stapel nicht zulässig: ${url}`);
      }
      antworten.push({
        response: { status: '200 OK' },
        resource: ausgabe([
          ['empEntry', erg.eintrag],
          ['medication', erg.medication],
          ['relatedActivity', erg.aktivitaet],
        ]),
      });
    }
    const chronologie = chronologieAnlegen(ablage(kvnr), EMP, wer);
    antworten.push({ response: { status: '200 OK' }, resource: chronologie });
    return { resourceType: 'Bundle', type: 'transaction-response', entry: antworten };
  });

  /* ---------- Schreiben: eML ---------- */

  /** `$add-eml-entry` — Nachtrag einer Medikation in die eML (Kontext MANUAL). */
  app.post(`${b}/MedicationStatement/$add-eml-entry`, async (anfrage, antwort) => {
    const kvnr = kvnrAus(anfrage);
    const wer = organisation(anfrage, antwort);
    if (!wer) return antwort;
    const aussage = parameterLesen(anfrage.body, 'medicationStatement')?.resource;
    const mittel = parameterLesen(anfrage.body, 'medication')?.resource;
    const f = medicationPruefen(mittel);
    if (f) return ungueltig(antwort, f);
    if (!aussage || aussage.resourceType !== 'MedicationStatement') {
      return ungueltig(antwort, 'Es fehlt eine MedicationStatement-Ressource.');
    }
    const zeit = jetzt();
    const medication: Ressource = {
      ...mittel!,
      id: neueId('med'),
      meta: { versionId: '1', lastUpdated: zeit, profile: [PROFIL.medication] },
    };
    const neu = mitKontext(
      {
        ...aussage,
        id: neueId('ms'),
        meta: { versionId: '1', lastUpdated: zeit, profile: [PROFIL.aussage] },
        status: aussage['status'] ?? 'unknown',
        medicationReference: { reference: `Medication/${String(medication.id)}` },
        subject: subjektFuer(kvnr),
        dateAsserted: zeit,
      },
      'MANUAL',
    );
    ablage(kvnr).push(medication, neu);
    const aktivitaet = aktivitaetAnlegen(
      ablage(kvnr),
      [versionierterVerweis(neu), versionierterVerweis(medication)],
      wer,
      'CREATE',
      zeit,
    );
    return ausgabe([
      ['medicationStatement', neu],
      ['medication', medication],
      ['relatedActivity', aktivitaet],
    ]);
  });

  /** `$cancel-eml-entry` — nur für Nachträge; Einträge aus Verordnung oder Abgabe nicht. */
  app.post(`${b}/MedicationStatement/:id/$cancel-eml-entry`, async (anfrage, antwort) => {
    const kvnr = kvnrAus(anfrage);
    const wer = organisation(anfrage, antwort);
    if (!wer) return antwort;
    const aussage = finden(kvnr, 'MedicationStatement', (anfrage.params as { id: string }).id);
    if (!aussage) {
      return fehlt(
        antwort,
        'MEDSVC_STATEMENT_NO_EXIST',
        'MedicationStatement Not Found',
        'Kein eML-Eintrag mit dieser Kennung.',
      );
    }
    if (kontext(aussage) !== 'MANUAL') {
      return antwort
        .code(422)
        .send(
          operationOutcome(
            'error',
            'business-rule',
            'Nur Nachträge lassen sich stornieren, keine Einträge aus Verordnung oder Abgabe.',
            detail('MEDSVC_PARAMETERS_INVALID_CONTENT', 'Provided content not allowed'),
          ),
        );
    }
    const zeit = jetzt();
    aussage['status'] = 'entered-in-error';
    fortschreiben(aussage, zeit);
    const aktivitaet = aktivitaetAnlegen(
      ablage(kvnr),
      [versionierterVerweis(aussage)],
      wer,
      'DELETE',
      zeit,
    );
    return ausgabe([['relatedActivity', aktivitaet]]);
  });

  /** `$link-emp` / `$unlink-emp` — eML-Eintrag mit einem eMP-Eintrag verknüpfen oder lösen. */
  for (const art of ['link', 'unlink'] as const) {
    app.post(`${b}/MedicationStatement/:id/$${art}-emp`, async (anfrage, antwort) => {
      const kvnr = kvnrAus(anfrage);
      const wer = organisation(anfrage, antwort);
      if (!wer || !lesenachweisPruefen(ablage(kvnr), EMP, bestaetigt(anfrage.body), antwort))
        return antwort;
      const aussage = finden(kvnr, 'MedicationStatement', (anfrage.params as { id: string }).id);
      const kennung = parameterLesen(anfrage.body, 'medicationPlanIdentifier')?.valueIdentifier
        ?.value;
      const eintrag = ablage(kvnr).find((r) => istEmpEintrag(r) && r.id === kennung);
      if (!aussage)
        return fehlt(
          antwort,
          'MEDSVC_STATEMENT_NO_EXIST',
          'MedicationStatement Not Found',
          'Kein eML-Eintrag mit dieser Kennung.',
        );
      if (!eintrag)
        return fehlt(
          antwort,
          'MEDSVC_EMP_NO_EXIST',
          'eMP does not exist',
          `Kein eMP-Eintrag ${kennung ?? ''}.`,
        );
      const verweis = `MedicationRequest/${String(eintrag.id)}`;
      const basis = (aussage['basedOn'] as { reference?: string }[] | undefined) ?? [];
      const zeit = jetzt();
      if (art === 'link') {
        if (basis.length > 0) {
          return antwort
            .code(422)
            .send(
              operationOutcome(
                'error',
                'business-rule',
                'Der eML-Eintrag ist bereits verknüpft.',
                detail('MEDSVC_ALREADY_LINKED', 'Already linked to another instance'),
              ),
            );
        }
        aussage['basedOn'] = [{ reference: verweis }];
        eintrag.extension = [
          ...((eintrag.extension ?? []) as { url: string }[]),
          {
            url: EXT.aktivitaet,
            extension: [
              {
                url: 'reference',
                valueReference: { reference: `MedicationStatement/${String(aussage.id)}` },
              },
              { url: 'addedOn', valueDateTime: zeit },
            ],
          },
        ];
        eintrag['medicationReference'] = aussage['medicationReference'];
      } else {
        if (eintrag['status'] === 'entered-in-error') {
          return antwort
            .code(422)
            .send(
              operationOutcome(
                'error',
                'business-rule',
                'Ein fehlerhafter eMP-Eintrag wird nicht gelöst.',
                detail('MEDSVC_STATUS_INVALID', 'Invalid Status in Parameters'),
              ),
            );
        }
        delete aussage['basedOn'];
        eintrag.extension = (eintrag.extension ?? []).filter(
          (e) =>
            !(
              e.url === EXT.aktivitaet &&
              referenzId(e.extension?.find((y) => y.url === 'reference')?.valueReference) ===
                aussage.id
            ),
        );
        const herkunft = (
          (eintrag.extension ?? []) as { url: string; valueReference?: unknown }[]
        ).find((e) => e.url === EXT.herkunftsmittel);
        if (herkunft) eintrag['medicationReference'] = herkunft.valueReference;
      }
      fortschreiben(aussage, zeit);
      fortschreiben(eintrag, zeit);
      const aktivitaet = aktivitaetAnlegen(
        ablage(kvnr),
        [versionierterVerweis(aussage), versionierterVerweis(eintrag)],
        wer,
        'UPDATE',
        zeit,
      );
      const chronologie = chronologieAnlegen(ablage(kvnr), EMP, wer, zeit);
      return ausgabe([
        ['medicationStatement', aussage],
        ['empEntry', eintrag],
        ['relatedActivity', aktivitaet],
        ['relatedChronology', chronologie],
      ]);
    });
  }

  /**
   * Operationen des E-Rezept-Fachdienstes — nicht für Primärsysteme. Der Demo-Ersatz des
   * Fachdienstes (`erezept.ts`) wendet sie intern an.
   */
  for (const op of [
    'provide-prescription-erp',
    'cancel-prescription-erp',
    'provide-dispensation-erp',
    'cancel-dispensation-erp',
  ]) {
    app.post(`${b}/$${op}`, async (_a, antwort) =>
      antwort
        .code(403)
        .send(
          operationOutcome('error', 'forbidden', `$${op} ist dem E-Rezept-Fachdienst vorbehalten.`),
        ),
    );
  }
}
