import type { SimAntwort, SimAnwendung } from './schnittstelle.ts';
import { automatischeKategorie, type Ressource, neueId } from '@demo-pvs/kern';
import { uuidV7 } from './plattform.ts';
import { aktuelleChronologie, chronologieAnlegen, lesenachweisPruefen } from './chronologie.ts';
import { ausgabe, jetzt, operationOutcome, parameterAlle, parameterLesen } from './fhir-hilfen.ts';
import {
  aktivitaetAnlegen,
  archivSichern,
  archivWiederherstellen,
  fortschreiben,
  identitaetAbweisen,
  istGeloescht,
  loeschen,
  subjektFuer,
  versionierterVerweis,
  type Handelnde,
} from './schreibwege.ts';
import {
  EMP,
  EMP_IDENTIFIER,
  EXT,
  MEDIKATION_BASIS,
  MSG,
  PROFIL,
  ablage,
  bestaetigt,
  detail,
  dosierungAbweisen,
  empEintragPruefen,
  finden,
  gruendeAbweisen,
  gruendeAnlegen,
  inhaltGleich,
  istEmpEintrag,
  kategorieSetzen,
  kontext,
  letzteAktivitaet,
  medicationPruefen,
  melden,
  mitKontext,
  mittelLoeschenWennFrei,
  mittelstatus,
  mittelstatusSetzen,
  organisationAus,
  profilAbweisen,
  referenzId,
  statusUngueltig,
  ungueltig,
  verknuepfen,
  verknuepfterEintrag,
  verknuepfungLoesen,
} from './medikation.ts';

/** Schreiben im eMP: `$add-emp-entry`, `$update-emp-entry`, `$emp-commit` und `$batch-emp` nach den Aktivitätsdiagrammen (ADR 0054). */
export function empwegeEinhaengen(
  app: SimAnwendung,
  kvnrAus: (anfrage: { headers: Record<string, unknown> }) => string,
  sitzungAus: (anfrage: { headers: Record<string, unknown> }) => string,
) {
  const b = MEDIKATION_BASIS;
  const organisation = organisationAus(sitzungAus);
  /* ---------- Schreiben: eMP ---------- */

  interface Ergebnis {
    /** Fehlt nach dem Löschen eines fehlerhaften Eintrags (IG-MED-BL-UPDATE-EMP-ENTRY-V3). */
    eintrag?: Ressource;
    medication?: Ressource;
    gruende: Ressource[];
    aktivitaet: Ressource;
    /** Ohne Änderung entsteht keine Fassung und kein Chronologieeintrag. */
    geaendert: boolean;
  }

  /**
   * Prüfungen vor der Transaktion, ohne etwas zu ändern (Diagramme IG-MED-BL-ADD-EMP-ENTRY-V2 und
   * IG-MED-BL-UPDATE-EMP-ENTRY-V3): Person (403), Struktur der Eingabe (422), Status (400),
   * Dosierungstext (400). Danach prüft der Aufrufer den Lesenachweis (409).
   */
  function eingangPruefen(
    kvnr: string,
    koerper: unknown,
    art: 'add' | 'update',
    antwort: SimAntwort,
  ): boolean {
    const eingang = parameterLesen(koerper, 'empEntry')?.resource;
    if (identitaetAbweisen(kvnr, eingang, antwort)) return false;
    const fehler = empEintragPruefen(eingang);
    if (fehler) {
      void ungueltig(antwort, fehler);
      return false;
    }
    if (art === 'add') {
      const teile = parameterLesen(koerper, 'medication')?.part ?? [];
      const resource = teile.find((p) => p.name === 'resource')?.resource;
      const reference = teile.find((p) => p.name === 'reference')?.valueReference?.reference;
      if (!resource === !reference) {
        void ungueltig(
          antwort,
          'Der Parameter „medication“ braucht genau eines: resource oder reference.',
        );
        return false;
      }
      const mittelfehler = resource ? medicationPruefen(resource) : null;
      if (mittelfehler) {
        void ungueltig(antwort, mittelfehler);
        return false;
      }
      if (reference && /\/_history\//.test(reference)) {
        // ⚠ Eigenregel der Demo: Der Verweis zielt auf die Instanz, nicht auf eine Fassung.
        void ungueltig(antwort, 'Der Verweis auf das Arzneimittel darf keine Fassung nennen.');
        return false;
      }
      if (
        profilAbweisen(eingang, PROFIL.empEintrag, antwort) ||
        (resource && profilAbweisen(resource, PROFIL.empMedication, antwort)) ||
        gruendeAbweisen(koerper, antwort)
      )
        return false;
      if (eingang!['status'] === 'entered-in-error') {
        void statusUngueltig(antwort, 'Ein neuer eMP-Eintrag kann nicht fehlerhaft sein.');
        return false;
      }
    } else {
      if (!parameterLesen(koerper, 'medicationPlanIdentifier')?.valueIdentifier?.value) {
        void ungueltig(antwort, 'Der Parameter „medicationPlanIdentifier“ fehlt.');
        return false;
      }
      // `medication` darf ein EMPMedication oder ein EPAMedication sein.
      const mittel = parameterLesen(koerper, 'medication')?.resource;
      const mittelfehler = mittel ? medicationPruefen(mittel) : null;
      if (mittelfehler) {
        void ungueltig(antwort, mittelfehler);
        return false;
      }
      const mittelprofil = ((mittel?.meta?.profile ?? []) as string[]).some((p) =>
        p.startsWith(PROFIL.medication.split('|')[0]!),
      )
        ? PROFIL.medication
        : PROFIL.empMedication;
      if (
        profilAbweisen(eingang, PROFIL.empEintrag, antwort) ||
        (mittel && profilAbweisen(mittel, mittelprofil, antwort)) ||
        gruendeAbweisen(koerper, antwort)
      )
        return false;
    }
    return !dosierungAbweisen(eingang!, antwort);
  }

  /** Kern von `$add-emp-entry` nach dem Lesenachweis — auch für den Stapel. */
  function empEintragAnlegen(
    kvnr: string,
    koerper: unknown,
    wer: Handelnde,
    antwort: SimAntwort,
  ): Ergebnis | null {
    const eingang = parameterLesen(koerper, 'empEntry')!.resource!;
    const mittelteil = parameterLesen(koerper, 'medication')?.part ?? [];
    const neuesMittel = mittelteil.find((p) => p.name === 'resource')?.resource;
    const verweis = mittelteil.find((p) => p.name === 'reference')?.valueReference?.reference;

    // Erst alle Prüfungen am Arzneimittel, dann die erste Änderung.
    let medication: Ressource | undefined;
    if (neuesMittel) {
      if (neuesMittel['status'] === 'entered-in-error') {
        void statusUngueltig(antwort, 'Das Arzneimittel ist als fehlerhaft gekennzeichnet.');
        return null;
      }
    } else {
      const mittelId = String(verweis).split('/')[1] ?? '';
      medication = finden(kvnr, 'Medication', mittelId);
      if (!medication) {
        void (istGeloescht(ablage(kvnr), 'Medication', mittelId)
          ? melden(antwort, 410, 'processing', `Gelöscht: ${String(verweis)}`, MSG.geloescht)
          : melden(antwort, 404, 'not-found', `Nicht gefunden: ${String(verweis)}`, MSG.unbekannt));
        return null;
      }
      if (medication['status'] === 'entered-in-error') {
        void statusUngueltig(antwort, 'Das Arzneimittel ist als fehlerhaft gekennzeichnet.');
        return null;
      }
      // Ein eMP-Eintrag verweist schon auf dieses Arzneimittel (medicationReference oder
      // originMedication) — 409.
      const schonImPlan = ablage(kvnr).some(
        (r) =>
          istEmpEintrag(r) &&
          kontext(r) === 'EMP' &&
          (referenzId(r['medicationReference']) === mittelId ||
            ((r.extension ?? []) as { url: string; valueReference?: unknown }[]).some(
              (e) => e.url === EXT.herkunftsmittel && referenzId(e.valueReference) === mittelId,
            )),
      );
      if (schonImPlan) {
        void melden(
          antwort,
          409,
          'conflict',
          'Ein eMP-Eintrag verweist bereits auf dieses Arzneimittel.',
          detail('MEDSVC_EMP_ENTRY_ALREADY_EXISTS', 'eMP entry already exists'),
        );
        return null;
      }
      if (
        ablage(kvnr).some(
          (r) =>
            r.resourceType === 'MedicationStatement' &&
            referenzId(r['medicationReference']) === mittelId &&
            verknuepfterEintrag(r) !== null,
        )
      ) {
        void antwort
          .code(400)
          .send(
            operationOutcome(
              'error',
              'business-rule',
              'Der eML-Eintrag zu diesem Arzneimittel ist bereits mit einem eMP-Eintrag verknüpft.',
              detail('MEDSVC_ALREADY_LINKED', 'Already linked to another instance'),
            ),
          );
        return null;
      }
    }

    const zeit = jetzt();
    if (neuesMittel) {
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
    }
    // Kennung und MedicationPlanIdentifier: derselbe UUID-Wert (IG-MED17706LL3).
    const id = uuidV7();
    const eintrag: Ressource = mitKontext(
      {
        ...eingang,
        id,
        meta: { versionId: '1', lastUpdated: zeit, profile: [PROFIL.empEintrag] },
        identifier: [{ system: EMP_IDENTIFIER, value: id }],
        status: eingang['status'] ?? 'active',
        medicationReference: { reference: `Medication/${String(medication!.id)}` },
        subject: subjektFuer(kvnr),
        extension: [
          ...((eingang.extension ?? []) as { url: string }[]).filter(
            (e) => e.url !== EXT.herkunftsmittel && e.url !== EXT.aktivitaet,
          ),
          {
            url: EXT.herkunftsmittel,
            valueReference: { reference: `Medication/${String(medication!.id)}` },
          },
        ],
      },
      'EMP',
    );
    const gruende = gruendeAnlegen(kvnr, koerper, eintrag, zeit);
    kategorieSetzen(eintrag, eingang, null);
    if (neuesMittel) mittelstatus(medication, eintrag);
    else mittelstatusSetzen(kvnr, eintrag, zeit);
    ablage(kvnr).push(eintrag);
    // Verweist der Eintrag auf das Arzneimittel eines eML-Eintrags, verknüpft der Dienst beide
    // selbst („link eMP element“) — ohne dessen Dosierung zu übernehmen.
    const zuVerknuepfen = neuesMittel
      ? []
      : ablage(kvnr).filter(
          (r) =>
            r.resourceType === 'MedicationStatement' &&
            r['status'] !== 'entered-in-error' &&
            kontext(r) !== 'EMP' &&
            referenzId(r['medicationReference']) === medication!.id &&
            verknuepfterEintrag(r) === null,
        );
    const verordnungen: Ressource[] = [];
    for (const a of zuVerknuepfen) {
      const v = verknuepfen(kvnr, a, eintrag, zeit, false);
      if (v) verordnungen.push(v);
      fortschreiben(a, zeit);
    }
    const aktivitaet = aktivitaetAnlegen(
      ablage(kvnr),
      [
        versionierterVerweis(eintrag),
        ...zuVerknuepfen.map(versionierterVerweis),
        ...verordnungen.map(versionierterVerweis),
      ],
      wer,
      'CREATE',
      zeit,
    );
    return { eintrag, medication, gruende, aktivitaet, geaendert: true };
  }

  /** Kern von `$update-emp-entry` nach dem Lesenachweis — auch für den Stapel. */
  function empEintragAendern(
    kvnr: string,
    koerper: unknown,
    wer: Handelnde,
    antwort: SimAntwort,
  ): Ergebnis | null {
    const kennung = parameterLesen(koerper, 'medicationPlanIdentifier')?.valueIdentifier?.value;
    const eingang = parameterLesen(koerper, 'empEntry')!.resource!;
    const vorhanden = ablage(kvnr).find(
      (r) =>
        istEmpEintrag(r) &&
        (r['identifier'] as { value?: string }[] | undefined)?.some((i) => i.value === kennung),
    );
    // Geschäftslogik IG 1.4.0-ballot.1: unbekannt 404, Fassung nicht aktuell 409, Kontext nicht
    // EMP 405, fehlerhaftes Arzneimittel 400 — alles vor der ersten Änderung.
    if (!vorhanden) {
      void melden(antwort, 404, 'not-found', `Kein eMP-Eintrag ${kennung ?? ''}.`, MSG.unbekannt);
      return null;
    }
    const fassungEingang = eingang.meta?.versionId;
    if (fassungEingang !== vorhanden.meta?.versionId) {
      void melden(
        antwort,
        409,
        'conflict',
        `Update Conflict (server current version = ${String(vorhanden.meta?.versionId)}, client version referenced = ${String(fassungEingang)})`,
        MSG.versionskonflikt,
      );
      return null;
    }
    if (kontext(vorhanden) !== 'EMP') {
      void melden(antwort, 405, 'forbidden', 'Kein eMP-Eintrag (Kontext).', MSG.nichtErlaubt);
      return null;
    }
    const neuesMittel = parameterLesen(koerper, 'medication')?.resource;
    if (neuesMittel?.['status'] === 'entered-in-error') {
      void statusUngueltig(antwort, 'Das Arzneimittel ist als fehlerhaft gekennzeichnet.');
      return null;
    }

    const zeit = jetzt();
    // Der neue Stand: alles aus der Eingabe — außer dem, was der Dienst führt.
    const geschuetzt = new Set<string>([
      EXT.kontext,
      EXT.herkunftsmittel,
      EXT.aktivitaet,
      EXT.kategorie,
    ]);
    const neu: Ressource = {
      ...eingang,
      id: vorhanden.id,
      meta: vorhanden.meta,
      identifier: vorhanden['identifier'],
      subject: vorhanden['subject'],
      medicationReference: vorhanden['medicationReference'],
      extension: [
        ...((vorhanden.extension ?? []) as { url: string }[]).filter((e) => geschuetzt.has(e.url)),
        ...((eingang.extension ?? []) as { url: string }[]).filter((e) => !geschuetzt.has(e.url)),
      ],
    };
    delete neu['reasonCode'];
    delete neu['reasonReference'];
    if (vorhanden['reasonReference'] !== undefined)
      neu['reasonReference'] = vorhanden['reasonReference'];
    // Behandlungsgründe: Neue Gründe ersetzen die alten; ohne Gründe und ohne Verweis entfallen sie.
    const neueGruende = parameterAlle(koerper, 'reasonCondition').length > 0;
    const alteGruende = (
      (vorhanden['reasonReference'] as { reference?: string }[] | undefined) ?? []
    ).map((v) => finden(kvnr, 'Condition', referenzId(v)));
    const gruendeEntfallen =
      neueGruende ||
      (eingang['reasonReference'] === undefined && vorhanden['reasonReference'] !== undefined);
    if (gruendeEntfallen) delete neu['reasonReference'];
    if (neueGruende) neu['reasonReference'] = eingang['reasonReference'];
    // Kategorie: neu nur bei strukturierter Dosierung, sonst unverändert.
    const auto = automatischeKategorie(neu['dosageInstruction']);
    if (auto)
      neu.extension = [
        ...((neu.extension ?? []) as { url: string }[]).filter((e) => e.url !== EXT.kategorie),
        { url: EXT.kategorie, valueCode: auto },
      ];

    // Keine Änderung: keine neue Fassung, der letzte Änderungseintrag gilt weiter.
    if (!neuesMittel && !neueGruende && !gruendeEntfallen && inhaltGleich(neu, vorhanden)) {
      const aktivitaet = letzteAktivitaet(kvnr, 'MedicationRequest', String(vorhanden.id));
      if (aktivitaet) return { eintrag: vorhanden, gruende: [], aktivitaet, geaendert: false };
    }

    // Fehlerhaft: verknüpfte eML-Einträge lösen (je eigener Änderungseintrag), den Eintrag löschen.
    if (neu['status'] === 'entered-in-error') {
      for (const a of ablage(kvnr).filter(
        (r) => r.resourceType === 'MedicationStatement' && verknuepfterEintrag(r) === vorhanden.id,
      )) {
        const verordnung = verknuepfungLoesen(kvnr, a, vorhanden, zeit);
        fortschreiben(a, zeit);
        aktivitaetAnlegen(
          ablage(kvnr),
          [versionierterVerweis(a), ...(verordnung ? [versionierterVerweis(verordnung)] : [])],
          wer,
          'UPDATE',
          zeit,
        );
      }
      const aktivitaet = aktivitaetAnlegen(
        ablage(kvnr),
        [versionierterVerweis(vorhanden)],
        wer,
        'DELETE',
        zeit,
      );
      loeschen(ablage(kvnr), vorhanden);
      const mittelId = referenzId(vorhanden['medicationReference']);
      const mittel = finden(kvnr, 'Medication', mittelId);
      if (mittel && kontext(mittel) === 'EMP') mittelLoeschenWennFrei(kvnr, mittelId);
      return { gruende: [], aktivitaet, geaendert: true };
    }

    for (const feld of Object.keys(vorhanden)) if (!(feld in neu)) delete vorhanden[feld];
    Object.assign(vorhanden, neu);
    // 1.4.0: Das Arzneimittel lässt sich über den Parameter `medication` austauschen; das alte
    // wird gelöscht, wenn es niemand mehr braucht.
    let ausgetauscht: Ressource | undefined;
    if (neuesMittel) {
      const altesMittel = referenzId(vorhanden['medicationReference']);
      const istEpa = ((neuesMittel.meta?.profile ?? []) as string[]).some((p) =>
        p.startsWith(PROFIL.medication.split('|')[0]!),
      );
      ausgetauscht = mitKontext(
        {
          ...neuesMittel,
          id: neueId('med'),
          meta: {
            versionId: '1',
            lastUpdated: zeit,
            profile: [istEpa ? PROFIL.medication : PROFIL.empMedication],
          },
        },
        'EMP',
      );
      ablage(kvnr).push(ausgetauscht);
      vorhanden['medicationReference'] = { reference: `Medication/${String(ausgetauscht.id)}` };
      mittelLoeschenWennFrei(kvnr, altesMittel);
    }
    if (gruendeEntfallen) for (const g of alteGruende) if (g) loeschen(ablage(kvnr), g);
    const gruende = neueGruende ? gruendeAnlegen(kvnr, koerper, vorhanden, zeit) : [];
    fortschreiben(vorhanden, zeit);
    mittelstatusSetzen(kvnr, vorhanden, zeit);
    const aktivitaet = aktivitaetAnlegen(
      ablage(kvnr),
      [versionierterVerweis(vorhanden)],
      wer,
      'UPDATE',
      zeit,
    );
    const medication = finden(kvnr, 'Medication', referenzId(vorhanden['medicationReference']));
    return { eintrag: vorhanden, medication, gruende, aktivitaet, geaendert: true };
  }

  /** Ausgabe nach `EPAOpEMPEntryOutputParameters`; die Chronologie nur, wenn es eine gibt. */
  const empAusgabe = (e: Ergebnis, chronologie: Ressource | null) =>
    ausgabe([
      ['empEntry', e.eintrag],
      ['medication', e.medication],
      ...e.gruende.map((g) => ['reasonCondition', g] as [string, Ressource]),
      ['relatedActivity', e.aktivitaet],
      ['relatedChronology', chronologie ?? undefined],
    ]);

  for (const [art, weg, kern] of [
    ['add', `${b}/$add-emp-entry`, empEintragAnlegen],
    ['update', `${b}/$update-emp-entry`, empEintragAendern],
  ] as const) {
    app.post(weg, async (anfrage, antwort) => {
      const kvnr = kvnrAus(anfrage);
      const wer = organisation(anfrage, antwort);
      if (!wer || !eingangPruefen(kvnr, anfrage.body, art, antwort)) return antwort;
      if (!lesenachweisPruefen(ablage(kvnr), EMP, bestaetigt(anfrage.body), antwort))
        return antwort;
      const e = kern(kvnr, anfrage.body, wer, antwort);
      if (!e) return antwort;
      // Ein Chronologieeintrag nur, wenn sich die Menge der gültigen Einträge ändert.
      const chronologie = e.geaendert
        ? chronologieAnlegen(ablage(kvnr), EMP, wer)
        : aktuelleChronologie(ablage(kvnr), EMP);
      return empAusgabe(e, chronologie);
    });
  }

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
   * `$batch-emp` — mehrere Änderungen in einem Aufruf, abgeschlossen mit genau einem
   * `$emp-commit` (Profil EPABatchEmpRequestBundle). Der Dienst führt alle Anlagen, dann alle
   * Änderungen, dann den Abschluss aus — gleich in welcher Reihenfolge das Bundle sie nennt
   * (IG-MED35195DPV). Atomar: Scheitert ein Eintrag, bleibt der Plan unverändert.
   */
  app.post(`${b}/$batch-emp`, async (anfrage, antwort) => {
    const kvnr = kvnrAus(anfrage);
    const wer = organisation(anfrage, antwort);
    if (!wer) return antwort;
    const bundle = (parameterLesen(anfrage.body, 'resource')?.resource ?? anfrage.body) as {
      type?: string;
      entry?: { request?: { method?: string; url?: string }; resource?: unknown }[];
    };
    const eintraege = bundle.entry ?? [];
    const art = (e: (typeof eintraege)[number]) => {
      const url = String(e.request?.url ?? '');
      return url.includes('$add-emp-entry')
        ? 'add'
        : url.includes('$update-emp-entry')
          ? 'update'
          : url.includes('$emp-commit')
            ? 'commit'
            : null;
    };
    const abschluss = eintraege.filter((e) => art(e) === 'commit');
    if (
      bundle.type !== 'transaction' ||
      abschluss.length !== 1 ||
      eintraege.some((e) => !art(e) || (e.request?.method ?? 'POST') !== 'POST')
    ) {
      return ungueltig(
        antwort,
        'Erwartet wird ein Bundle vom Typ transaction mit POST-Einträgen für $add-emp-entry und $update-emp-entry und genau einem $emp-commit.',
      );
    }
    for (const e of eintraege) {
      const a = art(e);
      if (a !== 'commit' && !eingangPruefen(kvnr, e.resource, a!, antwort)) return antwort;
    }
    if (!lesenachweisPruefen(ablage(kvnr), EMP, bestaetigt(abschluss[0]!.resource), antwort))
      return antwort;
    const sicherung = JSON.parse(JSON.stringify(ablage(kvnr))) as Ressource[];
    const archiv = archivSichern(ablage(kvnr));
    const antworten = new Map<number, unknown>();
    const reihenfolge = [
      ...eintraege.map((e, i) => [e, i] as const).filter(([e]) => art(e) === 'add'),
      ...eintraege.map((e, i) => [e, i] as const).filter(([e]) => art(e) === 'update'),
    ];
    for (const [e, i] of reihenfolge) {
      const erg =
        art(e) === 'add'
          ? empEintragAnlegen(kvnr, e.resource, wer, antwort)
          : empEintragAendern(kvnr, e.resource, wer, antwort);
      if (!erg) {
        ablage(kvnr).splice(0, ablage(kvnr).length, ...sicherung);
        archivWiederherstellen(ablage(kvnr), archiv);
        return antwort;
      }
      antworten.set(i, {
        response: { status: '200 OK' },
        resource: empAusgabe(erg, null),
      });
    }
    const chronologie = chronologieAnlegen(ablage(kvnr), EMP, wer);
    return {
      resourceType: 'Bundle',
      type: 'transaction-response',
      entry: eintraege.map((e, i) =>
        art(e) === 'commit'
          ? { response: { status: '200 OK' }, resource: chronologie }
          : antworten.get(i),
      ),
    };
  });
}
