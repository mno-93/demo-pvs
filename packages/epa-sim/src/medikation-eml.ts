import type { SimAnwendung } from './schnittstelle.ts';
import { type Ressource, neueId } from '@demo-pvs/kern';
import { aktuelleChronologie, chronologieAnlegen, lesenachweisPruefen } from './chronologie.ts';
import { ausgabe, jetzt, operationOutcome, parameterLesen } from './fhir-hilfen.ts';
import {
  aktivitaetAnlegen,
  fortschreiben,
  identitaetAbweisen,
  istGeloescht,
  loeschen,
  subjektFuer,
  versionierterVerweis,
} from './schreibwege.ts';
import {
  EMP,
  EXT,
  MEDIKATION_BASIS,
  MSG,
  PROFIL,
  VERARBEITUNG,
  ablage,
  bestaetigt,
  detail,
  dosierungAbweisen,
  empZuruecksetzen,
  finden,
  istEmpEintrag,
  kontext,
  letzteAktivitaet,
  medicationPruefen,
  melden,
  mitKontext,
  organisationAus,
  profilAbweisen,
  referenzId,
  statusUngueltig,
  ungueltig,
  verknuepfen,
  verknuepfterEintrag,
  schonAufgenommen,
} from './medikation.ts';

/** Schreiben in der eML: Nachtrag und Storno, `$link-emp` und `$unlink-emp`; die Operationen des E-Rezept-Fachdienstes sind ihm vorbehalten. */
export function emlwegeEinhaengen(
  app: SimAnwendung,
  kvnrAus: (anfrage: { headers: Record<string, unknown> }) => string,
  sitzungAus: (anfrage: { headers: Record<string, unknown> }) => string,
) {
  const b = MEDIKATION_BASIS;
  const organisation = organisationAus(sitzungAus);
  /* ---------- Schreiben: eML ---------- */

  /** `$add-eml-entry` — Nachtrag einer Medikation in die eML (Kontext MANUAL). */
  app.post(`${b}/MedicationStatement/$add-eml-entry`, async (anfrage, antwort) => {
    const kvnr = kvnrAus(anfrage);
    const wer = organisation(anfrage, antwort);
    if (!wer) return antwort;
    const aussage = parameterLesen(anfrage.body, 'medicationStatement')?.resource;
    const mittel = parameterLesen(anfrage.body, 'medication')?.resource;
    if (identitaetAbweisen(kvnr, aussage, antwort)) return antwort;
    const f = medicationPruefen(mittel);
    if (f) return ungueltig(antwort, f);
    if (!aussage || aussage.resourceType !== 'MedicationStatement') {
      return ungueltig(antwort, 'Es fehlt eine MedicationStatement-Ressource.');
    }
    if (
      profilAbweisen(aussage, PROFIL.aussage, antwort) ||
      profilAbweisen(mittel, PROFIL.medication, antwort)
    )
      return antwort;
    // Geschäftslogik IG 1.4.0-ballot.1: Arzneimittel `active`, Nachtrag `unknown`.
    if (mittel!['status'] !== 'active')
      return statusUngueltig(antwort, 'Das Arzneimittel eines Nachtrags muss aktiv sein.');
    if (aussage['status'] !== 'unknown')
      return statusUngueltig(antwort, 'Ein Nachtrag trägt den Status „unknown“.');
    if (dosierungAbweisen(aussage, antwort)) return antwort;
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
    // Ziel des Änderungseintrags ist nur der Nachtrag (IG-MED-BL-ADD-EML-ENTRY-V3).
    const aktivitaet = aktivitaetAnlegen(
      ablage(kvnr),
      [versionierterVerweis(neu)],
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
    if (!aussage)
      return melden(
        antwort,
        404,
        'not-found',
        'Kein eML-Eintrag mit dieser Kennung.',
        MSG.unbekannt,
      );
    if (kontext(aussage) !== 'MANUAL')
      return melden(
        antwort,
        405,
        'forbidden',
        'Nur Nachträge lassen sich stornieren, keine Einträge aus Verordnung oder Abgabe.',
        MSG.nichtErlaubt,
      );
    const zeit = jetzt();
    // 1.4.0 (IG-MED-BL-CANCEL-EML-ENTRY-V4): Ein verknüpfter eMP-Eintrag wird wie bei
    // `$unlink-emp` gelöst und gegebenenfalls zurückgesetzt — mit eigenem Änderungseintrag; dann
    // entsteht ein neuer Stand des eMP (`systemNotice` `empChanged`).
    const planId = verknuepfterEintrag(aussage);
    const eintrag = planId ? finden(kvnr, 'MedicationRequest', planId) : undefined;
    let empGeaendert = false;
    if (eintrag) {
      empGeaendert = empZuruecksetzen(kvnr, eintrag, aussage, zeit).eintragGeaendert;
      fortschreiben(aussage, zeit);
      if (empGeaendert) {
        fortschreiben(eintrag, zeit);
        aktivitaetAnlegen(ablage(kvnr), [versionierterVerweis(eintrag)], wer, 'UPDATE', zeit);
      }
    }
    // Der Nachtrag wird gelöscht (bleibt über die Historie abrufbar), sein Arzneimittel ebenso,
    // sofern kein eMP-Eintrag mehr darauf verweist.
    const aktivitaet = aktivitaetAnlegen(
      ablage(kvnr),
      [versionierterVerweis(aussage)],
      wer,
      'DELETE',
      zeit,
    );
    loeschen(ablage(kvnr), aussage);
    const mittelId = referenzId(aussage['medicationReference']);
    const mittel = finden(kvnr, 'Medication', mittelId);
    const nochImPlan = ablage(kvnr).some(
      (r) =>
        istEmpEintrag(r) &&
        (referenzId(r['medicationReference']) === mittelId ||
          ((r.extension ?? []) as { url: string; valueReference?: unknown }[]).some(
            (e) => e.url === EXT.herkunftsmittel && referenzId(e.valueReference) === mittelId,
          )),
    );
    if (mittel && !nochImPlan) loeschen(ablage(kvnr), mittel);
    if (empGeaendert) chronologieAnlegen(ablage(kvnr), EMP, wer, zeit);
    const ergebnis = ausgabe([['relatedActivity', aktivitaet]]);
    return empGeaendert
      ? {
          ...ergebnis,
          parameter: [...ergebnis.parameter, { name: 'systemNotice', valueCode: 'empChanged' }],
        }
      : ergebnis;
  });

  /**
   * `$link-emp` / `$unlink-emp` — eML-Eintrag mit einem eMP-Eintrag verknüpfen oder lösen
   * (Diagramme IG-MED-BL-LINK-EMP-ENTRY-V2 und IG-MED-BL-UNLINK-EMP-ENTRY-V3).
   */
  for (const art of ['link', 'unlink'] as const) {
    app.post(`${b}/MedicationStatement/:id/$${art}-emp`, async (anfrage, antwort) => {
      const kvnr = kvnrAus(anfrage);
      const wer = organisation(anfrage, antwort);
      if (!wer) return antwort;
      const kennung = parameterLesen(anfrage.body, 'medicationPlanIdentifier')?.valueIdentifier
        ?.value;
      if (!kennung) return ungueltig(antwort, 'Der Parameter „medicationPlanIdentifier“ fehlt.');
      if (!lesenachweisPruefen(ablage(kvnr), EMP, bestaetigt(anfrage.body), antwort))
        return antwort;
      const msId = (anfrage.params as { id: string }).id;
      const aussage = finden(kvnr, 'MedicationStatement', msId);
      // eML-Eintrag gelöscht 410, unbekannt 404; eMP-Eintrag über die Kennung mit Kontext EMP,
      // sonst 400 (UN)LINKING_NOT_SUCCESSFUL.
      if (!aussage)
        return istGeloescht(ablage(kvnr), 'MedicationStatement', msId)
          ? melden(antwort, 410, 'processing', 'Der eML-Eintrag wurde gelöscht.', MSG.geloescht)
          : melden(
              antwort,
              404,
              'not-found',
              'Kein eML-Eintrag mit dieser Kennung.',
              MSG.unbekannt,
            );
      if (art === 'link' && aussage['status'] === 'entered-in-error')
        return statusUngueltig(antwort, 'Der eML-Eintrag ist als fehlerhaft gekennzeichnet.');
      const eintrag = ablage(kvnr).find(
        (r) =>
          istEmpEintrag(r) &&
          kontext(r) === 'EMP' &&
          ((r['identifier'] as { value?: string }[] | undefined) ?? []).some(
            (i) => i.value === kennung,
          ),
      );
      if (!eintrag)
        return melden(
          antwort,
          400,
          'processing',
          `Kein eMP-Eintrag ${kennung}.`,
          art === 'link'
            ? {
                system: VERARBEITUNG,
                code: 'LINKING_NOT_SUCCESSFUL',
                display: 'MedicationStatement could not be linked to an eMP-Entry successfully',
              }
            : {
                system: VERARBEITUNG,
                code: 'UNLINKING_NOT_SUCCESSFUL',
                display: 'MedicationStatement could not be unlinked from an eMP-Entry successfully',
              },
        );
      if (art === 'link' && eintrag['status'] === 'entered-in-error')
        return statusUngueltig(antwort, 'Der eMP-Eintrag ist als fehlerhaft gekennzeichnet.');
      const bisher = verknuepfterEintrag(aussage);
      const zeit = jetzt();
      let verordnung: Ressource | null = null;
      if (art === 'link') {
        if (bisher && bisher !== eintrag.id)
          return melden(
            antwort,
            400,
            'business-rule',
            'Der eML-Eintrag ist bereits mit einem anderen eMP-Eintrag verknüpft.',
            detail('MEDSVC_ALREADY_LINKED', 'Already linked to another instance'),
          );
        // Schon aufgenommen (`extension[activity]`): keine Änderung, der letzte Änderungseintrag
        // gilt. Zeigt nur `basedOn` schon auf den Eintrag — etwa nach einer Verordnung aus dem
        // Plan —, wird verknüpft und übernommen (IG-MED-BL-LINK-EMP-ENTRY-V2).
        if (bisher === eintrag.id && schonAufgenommen(eintrag, msId)) {
          const aktivitaet =
            letzteAktivitaet(kvnr, 'MedicationStatement', msId) ??
            letzteAktivitaet(kvnr, 'MedicationRequest', String(eintrag.id));
          return ausgabe([
            ['medicationStatement', aussage],
            ['empEntry', eintrag],
            ['relatedActivity', aktivitaet],
            ['relatedChronology', aktuelleChronologie(ablage(kvnr), EMP) ?? undefined],
          ]);
        }
        verordnung = verknuepfen(kvnr, aussage, eintrag, zeit, true);
        fortschreiben(eintrag, zeit);
      } else {
        if (bisher !== eintrag.id)
          return melden(
            antwort,
            405,
            'forbidden',
            'Der eML-Eintrag ist nicht mit diesem eMP-Eintrag verknüpft.',
            MSG.nichtErlaubt,
          );
        const loesung = empZuruecksetzen(kvnr, eintrag, aussage, zeit);
        verordnung = loesung.verordnung;
        if (loesung.eintragGeaendert) fortschreiben(eintrag, zeit);
      }
      fortschreiben(aussage, zeit);
      const eintragGeaendert = art === 'link' || String(eintrag.meta?.lastUpdated) === zeit;
      const aktivitaet = aktivitaetAnlegen(
        ablage(kvnr),
        [
          versionierterVerweis(aussage),
          ...(eintragGeaendert ? [versionierterVerweis(eintrag)] : []),
          ...(verordnung ? [versionierterVerweis(verordnung)] : []),
        ],
        wer,
        'UPDATE',
        zeit,
      );
      const chronologie = chronologieAnlegen(ablage(kvnr), EMP, wer, zeit);
      return ausgabe([
        ['medicationStatement', aussage],
        ['empEntry', eintrag],
        ['prescription', verordnung ?? undefined],
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
