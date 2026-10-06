import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { psRelevanzSetzen, type Ressource } from '@demo-pvs/kern';
import { bestandFuer } from './bestand.ts';
import {
  aktuelleChronologie,
  chronologieAnlegen,
  istChronologie,
  lesenachweisPruefen,
  type Chronologieart,
} from './chronologie.ts';
import {
  ausgabe,
  jetzt,
  neueId,
  operationOutcome,
  parameterLesen,
  suchergebnis,
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
 * ✦ VORSCHLAG — Diagnose-Service für Allergien und Diagnosen. Nicht spezifiziert.
 *
 * Eine Weiterentwicklung der ePA: zentral geführte Listen, in die Primärsysteme Allergien
 * und Diagnosen schreiben und aus denen später eine Patient Summary entsteht — nach dem
 * Ansatz, eine Patient Summary aus mehreren zentral geführten Quellen zu bilden.
 *
 * Die Mechanik übernimmt der Dienst unverändert vom Medication Service
 * (`de.gematik.epa.medication` 1.3.5): Operationen `$…-list`, `$…-list-log`, `$add-…-entry`,
 * `$update-…-entry`; Lesenachweis `acknowledgedChronologyId` gegen den letzten
 * Chronologieeintrag; Organisation aus `X-Requesting-Organization`; Änderungseinträge nach
 * `EPAActivityProvenance`; Berichtigen über den Status statt über Löschen.
 *
 * ✦ Relevanzmarkierung: `$flag-condition-entry`, `$flag-allergy-entry` setzen am Eintrag, ob er in
 * die Patient Summary gehört (Extension `ps-relevant`). Die Liste bleibt vollständig; die
 * Markierung ist eine Schreibung wie jede andere — mit Lesenachweis und Änderungseintrag.
 *
 * Eigene Regeln des Vorschlags: Kodierung und Bezug eines Eintrags bleiben fest; eine
 * SNOMED-CT-Kodierung braucht eine Version (wie in `ti-condition-diagnosis`); „keine bekannte
 * Allergie" (SNOMED CT 716186003) schließt gültige Allergien aus und wird durch eine neue
 * Allergie widerlegt.
 *
 * Kennungen des Vorschlags liegen unter `https://example.org/demo-pvs/fhir/` — ausdrücklich
 * kein gematik-Namensraum.
 */

export const DIAGNOSEDIENST_BASIS = '/epa/vorschlag/diagnosis/api/v1/fhir';

const VORSCHLAG = 'https://example.org/demo-pvs/fhir/';
const SNOMED = 'http://snomed.info/sct';
const ICD = 'http://fhir.de/CodeSystem/bfarm/icd-10-gm';
export const KEINE_BEKANNTE_ALLERGIE = '716186003';

export type Art = 'AllergyIntolerance' | 'Condition' | 'Immunization';

const VERIFIKATION: Record<'Condition' | 'AllergyIntolerance', string> = {
  Condition: 'http://terminology.hl7.org/CodeSystem/condition-ver-status',
  AllergyIntolerance: 'http://terminology.hl7.org/CodeSystem/allergyintolerance-verification',
};

function status(r: Ressource, feld: 'clinicalStatus' | 'verificationStatus'): string {
  return (r[feld] as { coding?: { code?: string }[] } | undefined)?.coding?.[0]?.code ?? '';
}

/** Berichtigt: bei Impfungen über `status`, sonst über den Verifikationsstatus. */
function berichtigt(r: Ressource): boolean {
  return r.resourceType === 'Immunization'
    ? r['status'] === 'entered-in-error'
    : status(r, 'verificationStatus') === 'entered-in-error';
}

function gueltig(r: Ressource): boolean {
  if (r.resourceType === 'Immunization') return r['status'] === 'completed';
  const v = status(r, 'verificationStatus');
  return v !== 'refuted' && v !== 'entered-in-error';
}

const KONFLIKT = {
  system: `${VORSCHLAG}CodeSystem/list-operation-outcome-details`,
  code: 'LIST_CHRONOLOGY_ID_MISMATCH',
  display: 'Mismatch between acknowledged and current list chronology ID',
};

export const LISTE: Record<Art, Chronologieart> = {
  Condition: {
    profil: `${VORSCHLAG}StructureDefinition/condition-list-chronology-provenance`,
    kennzeichen: `${VORSCHLAG}StructureDefinition/is-condition-list-chronology`,
    gueltig: (r) => r.resourceType === 'Condition' && gueltig(r),
    konflikt: KONFLIKT,
  },
  AllergyIntolerance: {
    profil: `${VORSCHLAG}StructureDefinition/allergy-list-chronology-provenance`,
    kennzeichen: `${VORSCHLAG}StructureDefinition/is-allergy-list-chronology`,
    gueltig: (r) => r.resourceType === 'AllergyIntolerance' && gueltig(r),
    konflikt: KONFLIKT,
  },
  Immunization: {
    profil: `${VORSCHLAG}StructureDefinition/immunization-list-chronology-provenance`,
    kennzeichen: `${VORSCHLAG}StructureDefinition/is-immunization-list-chronology`,
    gueltig: (r) => r.resourceType === 'Immunization' && gueltig(r),
    konflikt: KONFLIKT,
  },
};

export const OPERATION: Record<
  Art,
  {
    liste: string;
    log: string;
    anlegen: string;
    aendern: string;
    /** Nur Allergien und Diagnosen; bei Impfungen ist die Liste zugleich die Auswahl. */
    markieren: string | null;
    parameter: string;
  }
> = {
  Condition: {
    liste: '$condition-list',
    log: '$condition-list-log',
    anlegen: '$add-condition-entry',
    aendern: '$update-condition-entry',
    markieren: '$flag-condition-entry',
    parameter: 'conditionEntry',
  },
  AllergyIntolerance: {
    liste: '$allergy-list',
    log: '$allergy-list-log',
    anlegen: '$add-allergy-entry',
    aendern: '$update-allergy-entry',
    markieren: '$flag-allergy-entry',
    parameter: 'allergyEntry',
  },
  Immunization: {
    liste: '$immunization-list',
    log: '$immunization-list-log',
    anlegen: '$add-immunization-entry',
    aendern: '$update-immunization-entry',
    markieren: null,
    parameter: 'immunizationEntry',
  },
};

function ablage(kvnr: string): Ressource[] {
  return bestandFuer(kvnr).diagnosedienst;
}

type Kodierung = { system?: string; code?: string; version?: string };

/** Die Kodierung, die einen Eintrag bestimmt: `code`, bei Impfungen `vaccineCode`. */
function codefeld(r: Ressource): { coding?: Kodierung[]; text?: string } | undefined {
  return (r.resourceType === 'Immunization' ? r['vaccineCode'] : r['code']) as
    { coding?: Kodierung[]; text?: string } | undefined;
}

function kodierungen(r: Ressource): Kodierung[] {
  return (codefeld(r)?.coding ?? []) as Kodierung[];
}

function istKeineBekannteAllergie(r: Ressource): boolean {
  return kodierungen(r).some((k) => k.system === SNOMED && k.code === KEINE_BEKANNTE_ALLERGIE);
}

/** Profilprüfung, soweit die Demo sie nachbildet. */
function pruefen(r: Ressource | undefined, art: Art): string | null {
  if (!r || r.resourceType !== art) return `Der Parameter enthält keine ${art}-Ressource.`;
  const k = kodierungen(r);
  const text = codefeld(r)?.text;
  if (k.length === 0 && !text) {
    return 'Die Ressource trägt weder eine Kodierung noch eine Bezeichnung.';
  }
  if (art === 'Immunization') {
    const ziele = (
      (r['protocolApplied'] as { targetDisease?: { coding?: Kodierung[] }[] }[] | undefined) ?? []
    ).flatMap((p) => (p.targetDisease ?? []).flatMap((t) => t.coding ?? []));
    if ([...k, ...ziele].some((x) => x.system === SNOMED && !x.version)) {
      return 'Profilvalidierung fehlgeschlagen: Eine SNOMED-CT-Kodierung verlangt die Versionsangabe.';
    }
    if (!['completed', 'entered-in-error', 'not-done'].includes(String(r['status']))) {
      return 'Der Status einer Impfung ist „completed", „not-done" oder „entered-in-error".';
    }
    if (!r['occurrenceDateTime'] && !r['occurrenceString']) {
      return 'Profilvalidierung fehlgeschlagen: occurrence[x] ist 1..1 (immunization-eu-core).';
    }
    return null;
  }
  if (k.some((x) => x.system === SNOMED && !x.version)) {
    return 'Profilvalidierung fehlgeschlagen: Eine SNOMED-CT-Kodierung verlangt die Versionsangabe (wie code.coding:snomed.version 1..1 in ti-condition-diagnosis).';
  }
  if (art === 'Condition' && !k.some((x) => x.system === ICD || x.system === SNOMED)) {
    return 'Eine Diagnose braucht eine ICD-10-GM- oder SNOMED-CT-Kodierung.';
  }
  const v = status(r, 'verificationStatus');
  if (v !== 'entered-in-error' && !status(r, 'clinicalStatus')) {
    return 'Der klinische Status fehlt.';
  }
  return null;
}

function ungueltig(antwort: FastifyReply, text: string, code = 'invalid') {
  return antwort.code(422).send(operationOutcome('error', code, text));
}

function gleicherCode(a: Ressource, b: Ressource): boolean {
  const schluessel = (r: Ressource) =>
    kodierungen(r)
      .map((k) => `${k.system}|${k.code}`)
      .sort()
      .join(',') || String(codefeld(r)?.text ?? '');
  return schluessel(a) === schluessel(b);
}

/** Legt einen Eintrag an — auch für den Startbestand, dort mit Zeitpunkt und Kennung. */
export function eintragAnlegen(
  kvnr: string,
  eingang: Ressource,
  wer: Handelnde,
  zeitpunkt: string = jetzt(),
  kennung?: string,
): { eintrag: Ressource; aktivitaet: Ressource } {
  const art = eingang.resourceType as Art;
  const eintrag: Ressource = {
    ...(JSON.parse(JSON.stringify(eingang)) as Ressource),
    id: kennung ?? neueId(art === 'Condition' ? 'cond' : art === 'Immunization' ? 'imm' : 'allg'),
    meta: {
      versionId: '1',
      lastUpdated: zeitpunkt,
      ...(eingang.meta?.profile ? { profile: eingang.meta.profile } : {}),
    },
  };
  if (art === 'Condition') eintrag['subject'] = subjektFuer(kvnr);
  else eintrag['patient'] = subjektFuer(kvnr);
  ablage(kvnr).push(eintrag);
  const aktivitaet = aktivitaetAnlegen(
    ablage(kvnr),
    [versionierterVerweis(eintrag)],
    wer,
    'CREATE',
    zeitpunkt,
  );
  return { eintrag, aktivitaet };
}

/** Schließt eine Änderung ab: neue Fassung der Liste. Auch für den Startbestand. */
export function listeFortschreiben(
  kvnr: string,
  art: Art,
  wer: Handelnde,
  zeitpunkt: string = jetzt(),
): Ressource {
  return chronologieAnlegen(ablage(kvnr), LISTE[art], wer, zeitpunkt);
}

/** Felder, die eine Änderung übernimmt. Code und Bezug bleiben — sonst neu anlegen. */
const AENDERBAR: Record<Art, string[]> = {
  AllergyIntolerance: [
    'clinicalStatus',
    'verificationStatus',
    'type',
    'category',
    'criticality',
    'onsetDateTime',
    'onsetPeriod',
    'lastOccurrence',
    'asserter',
    'note',
    'reaction',
    'extension',
  ],
  Condition: [
    'clinicalStatus',
    'verificationStatus',
    'category',
    'severity',
    'bodySite',
    'onsetDateTime',
    'abatementDateTime',
    'asserter',
    'note',
    'extension',
  ],
  Immunization: [
    'status',
    'statusReason',
    'occurrenceDateTime',
    'lotNumber',
    'doseQuantity',
    'performer',
    'location',
    'note',
    'protocolApplied',
    'extension',
  ],
};

export function diagnosedienstEinhaengen(
  app: FastifyInstance,
  kvnrAus: (anfrage: { headers: Record<string, unknown> }) => string,
  sitzungAus: (anfrage: { headers: Record<string, unknown> }) => string,
) {
  const b = DIAGNOSEDIENST_BASIS;
  const organisation = (anfrage: FastifyRequest, antwort: FastifyReply) =>
    organisationAusKopf(anfrage.headers as Record<string, unknown>, sitzungAus(anfrage), antwort);

  /** Fähigkeiten des Dienstes — so erkennt ein Primärsystem, ob es ihn gibt. */
  app.get(`${b}/metadata`, async () => ({
    resourceType: 'CapabilityStatement',
    status: 'draft',
    kind: 'instance',
    fhirVersion: '4.0.1',
    format: ['application/fhir+json'],
    software: { name: 'ePA-Simulator — Diagnose-Service (Vorschlag, nicht spezifiziert)' },
    rest: [
      {
        mode: 'server',
        resource: ['AllergyIntolerance', 'Condition', 'Provenance', 'Organization'].map((type) => ({
          type,
          interaction: [{ code: 'search-type' }, { code: 'read' }],
        })),
        operation: [OPERATION.Condition, OPERATION.AllergyIntolerance]
          .flatMap((o) => [o.liste, o.log, o.anlegen, o.aendern, o.markieren!])
          .map((name) => ({
            name: name.slice(1),
            definition: `${VORSCHLAG}OperationDefinition/${name.slice(1)}`,
          })),
      },
    ],
  }));

  for (const art of ['Condition', 'AllergyIntolerance'] as const) {
    listenwegeEinhaengen(app, b, art, kvnrAus, organisation);
  }

  for (const art of ['Condition', 'AllergyIntolerance'] as const) {
    const op = OPERATION[art];
    /**
     * ✦ Relevanz für die Patient Summary setzen oder aufheben. Parameter: `entry` (Reference),
     * `psRelevant` (boolean), `acknowledgedChronologyId`.
     */
    app.post(`${b}/${op.markieren!}`, async (anfrage, antwort) => {
      const kvnr = kvnrAus(anfrage);
      const wer = organisation(anfrage, antwort);
      const nachweis = parameterLesen(anfrage.body, 'acknowledgedChronologyId')?.valueId;
      if (!wer || !lesenachweisPruefen(ablage(kvnr), LISTE[art], nachweis, antwort)) return antwort;
      const verweis = parameterLesen(anfrage.body, 'entry')?.valueReference?.reference ?? '';
      const wert = parameterLesen(anfrage.body, 'psRelevant')?.valueBoolean;
      if (typeof wert !== 'boolean') {
        return ungueltig(antwort, 'Der Parameter „psRelevant" (boolean) fehlt.');
      }
      const [typ, id] = verweis.split('/');
      const index = ablage(kvnr).findIndex(
        (r) => r.resourceType === art && typ === art && r.id === id,
      );
      if (index < 0) {
        return antwort
          .code(404)
          .send(
            operationOutcome('error', 'not-found', `Kein Eintrag ${verweis || '(ohne Verweis)'}.`),
          );
      }
      const vorhanden = ablage(kvnr)[index]!;
      if (berichtigt(vorhanden)) {
        return ungueltig(antwort, 'Ein fehlerhafter Eintrag wird nicht mehr markiert.');
      }
      const neu = psRelevanzSetzen(vorhanden, wert);
      ablage(kvnr)[index] = neu;
      const zeit = jetzt();
      fortschreiben(neu, zeit);
      const aktivitaet = aktivitaetAnlegen(
        ablage(kvnr),
        [versionierterVerweis(neu)],
        wer,
        'UPDATE',
        zeit,
      );
      const chronologie = listeFortschreiben(kvnr, art, wer, zeit);
      return ausgabe([
        ['entry', neu],
        ['relatedActivity', aktivitaet],
        ['relatedChronology', chronologie],
      ]);
    });
  }

  for (const typ of ['AllergyIntolerance', 'Condition', 'Provenance', 'Organization']) {
    app.get(`${b}/${typ}`, async (anfrage) =>
      suchergebnis(ablage(kvnrAus(anfrage)).filter((r) => r.resourceType === typ)),
    );
    app.get(`${b}/${typ}/:id`, async (anfrage, antwort) => {
      const r = ablage(kvnrAus(anfrage)).find(
        (x) => x.resourceType === typ && x.id === (anfrage.params as { id: string }).id,
      );
      return (
        r ??
        antwort.code(404).send(operationOutcome('error', 'not-found', `${typ} nicht gefunden.`))
      );
    });
  }
}

/** Lesen, Log, Anlegen und Ändern einer Liste — gleich für Diagnosen, Allergien und Impfungen. */
function listenwegeEinhaengen(
  app: FastifyInstance,
  b: string,
  art: Art,
  kvnrAus: (anfrage: { headers: Record<string, unknown> }) => string,
  organisation: (anfrage: FastifyRequest, antwort: FastifyReply) => Handelnde | null,
): void {
  const op = OPERATION[art];
  const liste = LISTE[art];
  const lesenachweis = (koerper: unknown) =>
    parameterLesen(koerper, 'acknowledgedChronologyId')?.valueId;

  /**
   * Die Liste: alle Einträge (auch berichtigte — die Praxis muss sie abgleichen können),
   * mit Änderungseinträgen, Organisationen, der Person und dem aktuellen
   * Chronologieeintrag als Einschluss. Dessen Kennung ist der Lesenachweis.
   */
  app.get(`${b}/${op.liste}`, async (anfrage) => {
    const kvnr = kvnrAus(anfrage);
    const eintraege = ablage(kvnr).filter((r) => r.resourceType === art);
    const ids = eintraege.map((e) => `${art}/${String(e.id)}/`);
    const provenance = ablage(kvnr).filter(
      (r) =>
        r.resourceType === 'Provenance' &&
        !istChronologie(r, liste) &&
        (r['target'] as { reference: string }[]).some((t) =>
          ids.some((i) => t.reference.startsWith(i)),
        ),
    );
    const organisationen = ablage(kvnr).filter((r) => r.resourceType === 'Organization');
    const chronologie = aktuelleChronologie(ablage(kvnr), liste);
    return suchergebnis(eintraege, [
      ...(chronologie ? [chronologie] : []),
      ...provenance,
      ...organisationen,
      patientFuer(kvnr),
    ]);
  });

  app.get(`${b}/${op.log}`, async (anfrage) =>
    suchergebnis(
      ablage(kvnrAus(anfrage))
        .filter((r) => istChronologie(r, liste))
        .reverse(),
    ),
  );

  app.post(`${b}/${op.anlegen}`, async (anfrage, antwort) => {
    const kvnr = kvnrAus(anfrage);
    const wer = organisation(anfrage, antwort);
    if (!wer || !lesenachweisPruefen(ablage(kvnr), liste, lesenachweis(anfrage.body), antwort)) {
      return antwort;
    }
    const eingang = parameterLesen(anfrage.body, op.parameter)?.resource;
    const fehler = pruefen(eingang, art);
    if (fehler) return ungueltig(antwort, fehler);
    const zeit = jetzt();
    if (art === 'AllergyIntolerance') {
      const vorhanden = ablage(kvnr).filter((r) => r.resourceType === art && gueltig(r));
      if (istKeineBekannteAllergie(eingang!)) {
        const widerspruch = vorhanden.filter(
          (r) => !istKeineBekannteAllergie(r) && status(r, 'clinicalStatus') === 'active',
        );
        if (widerspruch.length > 0) {
          return ungueltig(
            antwort,
            `„Keine bekannte Allergie" widerspricht ${widerspruch.length} gültigen Einträgen der Allergienliste.`,
            'business-rule',
          );
        }
      } else {
        // Eine echte Allergie widerlegt eine vorhandene „keine bekannte Allergie".
        for (const keine of vorhanden.filter(istKeineBekannteAllergie)) {
          keine['verificationStatus'] = {
            coding: [{ system: VERIFIKATION[art], code: 'refuted' }],
          };
          fortschreiben(keine, zeit);
          aktivitaetAnlegen(ablage(kvnr), [versionierterVerweis(keine)], wer, 'UPDATE', zeit);
        }
      }
    }
    const { eintrag, aktivitaet } = eintragAnlegen(kvnr, eingang!, wer, zeit);
    const chronologie = listeFortschreiben(kvnr, art, wer, zeit);
    return ausgabe([
      ['entry', eintrag],
      ['relatedActivity', aktivitaet],
      ['relatedChronology', chronologie],
    ]);
  });

  app.post(`${b}/${op.aendern}`, async (anfrage, antwort) => {
    const kvnr = kvnrAus(anfrage);
    const wer = organisation(anfrage, antwort);
    if (!wer || !lesenachweisPruefen(ablage(kvnr), liste, lesenachweis(anfrage.body), antwort)) {
      return antwort;
    }
    const eingang = parameterLesen(anfrage.body, op.parameter)?.resource;
    const fehler = pruefen(eingang, art);
    if (fehler) return ungueltig(antwort, fehler);
    const vorhanden = ablage(kvnr).find((r) => r.resourceType === art && r.id === eingang?.id);
    if (!vorhanden) {
      return antwort
        .code(404)
        .send(operationOutcome('error', 'not-found', `Kein Eintrag ${String(eingang?.id)}.`));
    }
    if (berichtigt(vorhanden)) {
      return ungueltig(antwort, 'Ein fehlerhafter Eintrag wird nicht mehr geändert.');
    }
    if (!gleicherCode(vorhanden, eingang!)) {
      return ungueltig(
        antwort,
        'Kodierung und Bezeichnung eines Eintrags sind nicht änderbar. Einen falschen Eintrag als fehlerhaft kennzeichnen und den richtigen neu anlegen.',
      );
    }
    for (const feld of AENDERBAR[art]) {
      if (feld in eingang!) vorhanden[feld] = eingang![feld];
      else if (feld !== 'extension') delete vorhanden[feld];
    }
    // FHIR: Bei entered-in-error steht kein klinischer Status (con-5, ait-2).
    if (art !== 'Immunization' && berichtigt(vorhanden)) {
      delete vorhanden['clinicalStatus'];
    }
    const zeit = jetzt();
    fortschreiben(vorhanden, zeit);
    const aktivitaet = aktivitaetAnlegen(
      ablage(kvnr),
      [versionierterVerweis(vorhanden)],
      wer,
      'UPDATE',
      zeit,
    );
    const chronologie = listeFortschreiben(kvnr, art, wer, zeit);
    return ausgabe([
      ['entry', vorhanden],
      ['relatedActivity', aktivitaet],
      ['relatedChronology', chronologie],
    ]);
  });
}

/**
 * ✦ VORSCHLAG — Impfliste. Nicht spezifiziert (ADR 0026).
 *
 * Eine zentrale Liste der Impfungen in der ePA, mit derselben Mechanik wie Allergien und
 * Diagnosen: `$immunization-list`, `$immunization-list-log`, `$add-immunization-entry`,
 * `$update-immunization-entry`, Lesenachweis, Änderungseinträge, Berichtigen über den Status.
 * Einträge nach `immunization-eu-core` (HL7 Europe), wie ihn die Section „Immunizations" der EPS
 * verlangt. Eine Relevanzmarkierung gibt es nicht: Jede Impfung zählt für den Impfschutz.
 * Ab Ausbaustand „Weiterentwicklung 3".
 */
export const IMPFLISTE_BASIS = '/epa/vorschlag/immunization/api/v1/fhir';

export function impflisteEinhaengen(
  app: FastifyInstance,
  kvnrAus: (anfrage: { headers: Record<string, unknown> }) => string,
  sitzungAus: (anfrage: { headers: Record<string, unknown> }) => string,
) {
  const b = IMPFLISTE_BASIS;
  const organisation = (anfrage: FastifyRequest, antwort: FastifyReply) =>
    organisationAusKopf(anfrage.headers as Record<string, unknown>, sitzungAus(anfrage), antwort);
  const op = OPERATION.Immunization;
  app.get(`${b}/metadata`, async () => ({
    resourceType: 'CapabilityStatement',
    status: 'draft',
    kind: 'instance',
    fhirVersion: '4.0.1',
    format: ['application/fhir+json'],
    software: { name: 'ePA-Simulator — Impfliste (Vorschlag, nicht spezifiziert)' },
    rest: [
      {
        mode: 'server',
        resource: ['Immunization', 'Provenance', 'Organization'].map((type) => ({
          type,
          interaction: [{ code: 'search-type' }, { code: 'read' }],
        })),
        operation: [op.liste, op.log, op.anlegen, op.aendern].map((name) => ({
          name: name.slice(1),
          definition: `${VORSCHLAG}OperationDefinition/${name.slice(1)}`,
        })),
      },
    ],
  }));
  listenwegeEinhaengen(app, b, 'Immunization', kvnrAus, organisation);
  for (const typ of ['Immunization', 'Provenance', 'Organization']) {
    app.get(`${b}/${typ}`, async (anfrage) =>
      suchergebnis(ablage(kvnrAus(anfrage)).filter((r) => r.resourceType === typ)),
    );
  }
}
