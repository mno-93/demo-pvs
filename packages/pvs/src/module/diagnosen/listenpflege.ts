import { useState } from 'react';
import {
  istGegenwaertig,
  istKeineBekannteAllergie,
  type Allergie,
  type Diagnose,
  type Patient,
} from '@demo-pvs/kern';
import { ausfuehren, lesen, useZustand } from '../../speicher/speicher.js';
import { neueId, vorgaenge } from '../../speicher/vorgaenge.js';
import { EpaFehler, type Listenart } from '../../epa/klient.js';
import type { Ladezustand } from '../../epa/epa-bestand.js';
import {
  LISTENNAME,
  inDieListeAufnehmen,
  inDieListeUebertragen,
  type EpaListen,
  type Listeneintrag,
  type Listenlage,
} from '../../epa/listen.js';
import type { Diagnoseentwurf } from './DiagnoseFormular.js';
import type { Allergieentwurf } from './AllergieFormular.js';
import type { Listenoption } from './Listenwahl.js';

/**
 * Pflege von Diagnosen und Allergien an ihrer Quelle: Eintrag der Praxis anlegen oder ändern und
 * — wenn das Kästchen in der Maske gesetzt ist — in die ✦ Liste der ePA aufnehmen oder die
 * Änderung übertragen. Genutzt von „Diagnosen und Allergien" und vom Pop-up im Arztbrief, damit
 * beide Wege dieselben Regeln haben.
 */

export type Pflegeart = 'diagnose' | 'allergie';
export type Meldung = { art: 'gut' | 'fehler' | 'neutral'; text: string } | null;

export const LISTENART: Record<Pflegeart, Listenart> = {
  diagnose: 'Condition',
  allergie: 'AllergyIntolerance',
};

export function bezeichnung(e: Diagnose | Allergie): string {
  return 'substanz' in e ? e.substanz : e.bezeichnung;
}

export function istBerichtigt(e: Diagnose | Allergie): boolean {
  return 'substanz' in e ? e.gewissheit === 'irrtümlich' : e.diagnosesicherheit === 'irrtümlich';
}

/** Gehört der Eintrag nach der Vorbelegung in die Liste? */
export function naheliegend(e: Diagnose | Allergie): boolean {
  return 'substanz' in e
    ? e.klinischerStatus === 'aktiv' && !istBerichtigt(e)
    : e.art === 'dauer' && istGegenwaertig(e.klinischerStatus);
}

export function useListenpflege(
  patient: Patient | undefined,
  { lage, abfrage }: { lage: Listenlage; abfrage: Ladezustand<EpaListen> },
  nachHandlung?: () => void,
) {
  const nutzer = useZustand((z) => z.nutzer);
  const kvnr = patient?.versicherung.kvnr ?? '';
  const patientId = patient?.id ?? '';
  const listen = lage.art === 'bereit' ? lage.listen : null;
  const [meldung, setzeMeldung] = useState<Meldung>(null);
  const [laeuft, setzeLaeuft] = useState(false);

  const keineBekannteGueltig = (listen?.allergien ?? []).filter(
    (e) =>
      istKeineBekannteAllergie(e.eintrag) &&
      (e.eintrag.gewissheit === 'bestätigt' || e.eintrag.gewissheit === 'unbestätigt'),
  );

  function eintragZu(
    art: Pflegeart,
    epaId: string | null,
  ): Listeneintrag<Diagnose | Allergie> | undefined {
    if (!listen || !epaId) return undefined;
    const alle: Listeneintrag<Diagnose | Allergie>[] =
      art === 'diagnose' ? listen.diagnosen : listen.allergien;
    return alle.find((x) => x.eintrag.id === epaId);
  }

  /**
   * Führt eine Schreibung an der ePA aus, meldet das Ergebnis und fragt die Listen neu ab.
   * Liefert, ob sie gelungen ist.
   */
  async function epaHandlung(schritt: () => Promise<void>, erfolg: string): Promise<boolean> {
    setzeLaeuft(true);
    setzeMeldung({ art: 'neutral', text: 'Wird an die ePA übermittelt …' });
    let gelungen = true;
    try {
      await schritt();
      setzeMeldung({ art: 'gut', text: erfolg });
    } catch (f) {
      gelungen = false;
      setzeMeldung({
        art: 'fehler',
        text:
          f instanceof EpaFehler && f.veraltet
            ? 'Die Liste wurde inzwischen geändert und ist neu geladen. Bitte prüfen und wiederholen.'
            : f instanceof EpaFehler
              ? `Von der ePA abgelehnt — ${f.status}${f.code ? ` ${f.code}` : ''}: ${f.diagnose}`
              : 'Der Vorgang ist fehlgeschlagen.',
      });
    }
    setzeLaeuft(false);
    nachHandlung?.();
    abfrage.neuLaden();
    return gelungen;
  }

  /**
   * Nimmt einen Eintrag der Praxis in die Liste auf oder überträgt seine Änderung. Als Folge des
   * Speicherns ist das keine eigene Handlung — gezählt wird dann nur das Speichern.
   */
  async function inDieEpa(
    art: Pflegeart,
    lokal: Diagnose | Allergie,
    alsFolge = false,
    psRelevant?: boolean,
  ): Promise<boolean> {
    const vorhanden = eintragZu(art, lokal.epaId);
    const liste = LISTENNAME[LISTENART[art]];
    const lesenachweis = listen?.lesenachweis[LISTENART[art]] ?? null;
    const setztAusserKraft = art === 'allergie' && !vorhanden && keineBekannteGueltig.length > 0;
    return epaHandlung(
      async () => {
        const { eintrag: neu } = vorhanden
          ? await inDieListeUebertragen(
              kvnr,
              LISTENART[art],
              lesenachweis,
              lokal,
              vorhanden.ressource,
              nutzer.name,
            )
          : await inDieListeAufnehmen(
              kvnr,
              LISTENART[art],
              lesenachweis,
              lokal,
              nutzer.name,
              psRelevant ?? naheliegend(lokal),
            );
        ausfuehren(
          vorgaenge.listeneintragVerknuepfen(
            art,
            lokal.id,
            String(neu.id),
            neu.meta?.versionId ?? '1',
            alsFolge,
          ),
        );
      },
      vorhanden
        ? `Änderung an „${bezeichnung(lokal)}" in die ${liste} der ePA übertragen.`
        : `„${bezeichnung(lokal)}" in die ${liste} der ePA aufgenommen.${setztAusserKraft ? ' Die Angabe „Keine bekannten Allergien" hat der Dienst damit außer Kraft gesetzt.' : ''}`,
    );
  }

  /** Übernimmt einen Eintrag der ePA-Liste in die Praxis, verknüpft. Liefert den neuen Eintrag. */
  function inDiePraxis(art: Pflegeart, epa: Diagnose | Allergie): Diagnose | Allergie | undefined {
    const eintrag = eintragZu(art, epa.id);
    const quelle = `${LISTENNAME[LISTENART[art]]} der ePA, angelegt von ${eintrag?.chronik.angelegtVon ?? 'unbekannt'}`;
    ausfuehren(
      art === 'diagnose'
        ? vorgaenge.diagnoseAusEpaUebernehmen(patientId, epa as Diagnose, quelle)
        : vorgaenge.allergieAusEpaUebernehmen(patientId, epa as Allergie, quelle),
    );
    const z = lesen();
    const alle: readonly (Diagnose | Allergie)[] = art === 'diagnose' ? z.diagnosen : z.allergien;
    return alle.find((x) => x.patientId === patientId && x.epaId === epa.id);
  }

  /** Speichert eine Diagnose der Praxis; mit Kästchen auch in die Liste. Liefert die Kennung. */
  async function diagnoseSpeichern(
    e: Diagnoseentwurf,
    inListe: boolean,
    psRelevant: boolean,
    id?: string,
  ): Promise<{ id: string; gelungen: boolean }> {
    const kennung = id ?? neueId('diag');
    ausfuehren(id ? vorgaenge.diagnoseAendern(id, e) : vorgaenge.diagnoseAnlegen(e, kennung));
    const lokal = lesen().diagnosen.find((d) => d.id === kennung);
    const gelungen = inListe && lokal ? await inDieEpa('diagnose', lokal, true, psRelevant) : true;
    return { id: kennung, gelungen };
  }

  async function allergieSpeichern(
    e: Allergieentwurf,
    inListe: boolean,
    psRelevant: boolean,
    id?: string,
  ): Promise<{ id: string; gelungen: boolean }> {
    const kennung = id ?? neueId('allg');
    ausfuehren(id ? vorgaenge.allergieAendern(id, e) : vorgaenge.allergieAnlegen(e, kennung));
    const lokal = lesen().allergien.find((a) => a.id === kennung);
    const gelungen = inListe && lokal ? await inDieEpa('allergie', lokal, true, psRelevant) : true;
    return { id: kennung, gelungen };
  }

  const grundOhneListe =
    lage.art === 'ohne-befugnis'
      ? 'Keine Befugnis für die ePA.'
      : lage.art === 'nicht-angeboten'
        ? 'Release 3.1.3: keine Liste in der ePA.'
        : lage.art === 'laedt'
          ? 'Wird abgefragt …'
          : lage.art === 'fehler'
            ? `ePA-Fehler (${lage.status || '—'}).`
            : null;

  function listenoption(art: Pflegeart, e?: Diagnose | Allergie): Listenoption {
    const eintrag = eintragZu(art, e?.epaId ?? null);
    const berichtigt = eintrag ? istBerichtigt(eintrag.eintrag) : false;
    return {
      moeglich: lage.art === 'bereit' && !berichtigt,
      grund: berichtigt ? 'In der ePA als fehlerhaft gekennzeichnet.' : grundOhneListe,
      // Eine Verknüpfung auf einen Eintrag, den die gelesene Liste nicht kennt, zählt nicht.
      verknuepft: !!eintrag || (!!e?.epaId && lage.art !== 'bereit'),
      angelegtVon: eintrag?.chronik.angelegtVon ?? null,
    };
  }

  return {
    kvnr,
    listen,
    meldung,
    setzeMeldung,
    laeuft,
    keineBekannteGueltig,
    eintragZu,
    epaHandlung,
    inDieEpa,
    inDiePraxis,
    diagnoseSpeichern,
    allergieSpeichern,
    listenoption,
  };
}
