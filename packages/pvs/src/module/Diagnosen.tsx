import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import {
  ALLERGIESTATUS_BEZEICHNUNG,
  DIAGNOSEART_BEZEICHNUNG,
  DIAGNOSESICHERHEIT_BEZEICHNUNG,
  GEWISSHEIT_BEZEICHNUNG,
  KLINISCHER_STATUS_BEZEICHNUNG,
  allergienAbgleichen,
  atcFuerSubstanz,
  deutschesDatum,
  diagnosenAbgleichen,
  istGegenwaertig,
  istKeineBekannteAllergie,
  reaktionenAlsText,
  type Allergie,
  type Diagnose,
  type Listenzeile,
  type Ressource,
} from '@demo-pvs/kern';
import { ausfuehren, lesen, useAuswahl, useZustand } from '../speicher/speicher.js';
import { neueId, vorgaenge } from '../speicher/vorgaenge.js';
import { Bestandsband, Karte, Leer, Marker } from '../bausteine/Bausteine.js';
import { usePatientId } from './Patientenkartei.js';
import {
  DiagnoseFormular,
  leererEntwurf,
  type Diagnoseentwurf,
} from './diagnosen/DiagnoseFormular.js';
import {
  AllergieFormular,
  leererAllergieentwurf,
  type Allergieentwurf,
} from './diagnosen/AllergieFormular.js';
import type { Listenoption } from './diagnosen/Listenwahl.js';
import {
  Herkunftszeile,
  Kompaktkarte,
  SplitBlock,
  type Aufklappen,
} from './diagnosen/Splitscreen.js';
import { ordnungsangaben, useOrdnung } from './diagnosen/ordnung.js';
import { EpaFehler, type Listenart } from '../epa/klient.js';
import {
  LISTENNAME,
  inDerListeBerichtigen,
  inDieListeAufnehmen,
  inDieListeUebertragen,
  psRelevanzAendern,
  keineBekannteAllergieEintragen,
  useEpaListen,
  type Listeneintrag,
  type Listenlage,
} from '../epa/listen.js';
import { EgkKnopf, useBefugnis } from '../epa/befugnis.js';
import { PsMarke, PsSchalter } from '../bausteine/PsMarke.js';
import { fehlerTitel } from '../epa/epa-bestand.js';
import { Abrufstand } from '../epa/aktenstatus.js';
import {
  NeuMarke,
  SeitLetztemAufrufBand,
  gesehenAusListe,
  useSeitLetztemAufruf,
} from '../epa/gesehen.js';
import { epaFensterOeffnen } from '../epa/fenster.js';
import { protokollOeffnen } from '../epa/protokoll.js';

/**
 * Diagnosen und Allergien — im Splitscreen gegen die Listen der ePA.
 *
 * Links steht, was das Praxissystem führt, rechts die Diagnosenliste und die Allergienliste der
 * ePA (✦ Vorschlag Diagnose-Service, ADR 0018), dazwischen der Abgleich. Gepflegt wird in den
 * zentralen Listen, gegen die lokalen Einträge — die Patient Summary entsteht später daraus und
 * wird nie selbst bearbeitet (docs/SPEZIFIKATION.md).
 *
 * Erfasst wird nach dem Informationsmodell der Patient Summary. Im Hintergrund arbeiten der
 * Kodierservice (ICD-10-GM und SNOMED CT) und die national abgestimmte Werteliste der
 * auslösenden Substanzen. Ob ein Eintrag in die Liste der ePA gehört, entscheidet ein Kästchen
 * in derselben Maske.
 */

type Art = 'diagnose' | 'allergie';
type Bearbeitung = { art: Art; id: string } | null;
type Meldung = { art: 'gut' | 'fehler' | 'neutral'; text: string } | null;

const LISTENART: Record<Art, Listenart> = { diagnose: 'Condition', allergie: 'AllergyIntolerance' };

function bezeichnung(e: Diagnose | Allergie): string {
  return 'substanz' in e ? e.substanz : e.bezeichnung;
}

function istBerichtigt(e: Diagnose | Allergie): boolean {
  return 'substanz' in e ? e.gewissheit === 'irrtümlich' : e.diagnosesicherheit === 'irrtümlich';
}

export function Diagnosen() {
  const patientId = usePatientId();
  const patient = useAuswahl((z) => z.patienten.find((p) => p.id === patientId), [patientId]);
  const heute = useZustand((z) => z.heute);
  const nutzer = useZustand((z) => z.nutzer);
  const darfStellen = nutzer.rolle === 'aerztin';
  const kvnr = patient?.versicherung.kvnr ?? '';
  const befugnis = useBefugnis(patientId);

  const diagnosen = useAuswahl(
    (z) =>
      z.diagnosen
        .filter((d) => d.patientId === patientId)
        .slice()
        .sort((a, b) =>
          istGegenwaertig(a.klinischerStatus) !== istGegenwaertig(b.klinischerStatus)
            ? istGegenwaertig(a.klinischerStatus)
              ? -1
              : 1
            : a.art !== b.art
              ? a.art === 'dauer'
                ? -1
                : 1
              : b.beginn.localeCompare(a.beginn),
        ),
    [patientId],
  );
  const allergien = useAuswahl(
    (z) => z.allergien.filter((a) => a.patientId === patientId),
    [patientId],
  );

  const { lage, abfrage } = useEpaListen(patient);
  const listen = lage.art === 'bereit' ? lage.listen : null;
  const ordnungDiagnosen = useOrdnung(patientId, 'Condition');
  const ordnungAllergien = useOrdnung(patientId, 'AllergyIntolerance');

  // Neu seit dem letzten Aufruf — je Liste (ADR 0027).
  const gesehenDiagnosen = useMemo(
    () => (listen ? gesehenAusListe(listen.diagnosen) : null),
    [listen],
  );
  const gesehenAllergien = useMemo(
    () => (listen ? gesehenAusListe(listen.allergien) : null),
    [listen],
  );
  const seitDiagnosen = useSeitLetztemAufruf(patientId, 'Condition', gesehenDiagnosen);
  const seitAllergien = useSeitLetztemAufruf(patientId, 'AllergyIntolerance', gesehenAllergien);

  // „Keine bekannte Allergie" ist eine Aussage über die Liste, kein Eintrag neben anderen.
  const keineBekannte = (listen?.allergien ?? []).filter((e) =>
    istKeineBekannteAllergie(e.eintrag),
  );
  const keineBekannteGueltig = keineBekannte.filter(
    (e) => e.eintrag.gewissheit === 'bestätigt' || e.eintrag.gewissheit === 'unbestätigt',
  );
  const epaAllergien = (listen?.allergien ?? []).filter(
    (e) => !istKeineBekannteAllergie(e.eintrag),
  );

  const diagnoseZeilen = listen
    ? diagnosenAbgleichen(
        diagnosen,
        listen.diagnosen.map((e) => e.eintrag),
      )
    : [];
  const allergieZeilen = listen
    ? allergienAbgleichen(
        allergien,
        epaAllergien.map((e) => e.eintrag),
      )
    : [];

  // Sprung aus der Patient Summary: `#allergien` oder `#diagnosen`.
  const { hash } = useLocation();
  useEffect(() => {
    const ziel = hash ? document.getElementById(hash.slice(1)) : null;
    ziel?.scrollIntoView?.({ block: 'start' });
    ziel?.focus?.({ preventScroll: true });
  }, [hash, lage.art]);

  const [bearbeitung, setzeBearbeitung] = useState<Bearbeitung>(null);
  const [erfassung, setzeErfassung] = useState<Art>('diagnose');
  // Neuer Schlüssel nach jedem Speichern setzt die Maske zurück.
  const [durchlauf, setzeDurchlauf] = useState(0);
  const [meldung, setzeMeldung] = useState<Meldung>(null);
  const [laeuft, setzeLaeuft] = useState(false);
  const [rueckfrage, setzeRueckfrage] = useState<string | null>(null);

  const inBearbeitung =
    bearbeitung?.art === 'diagnose'
      ? diagnosen.find((d) => d.id === bearbeitung.id)
      : bearbeitung?.art === 'allergie'
        ? allergien.find((a) => a.id === bearbeitung.id)
        : undefined;

  function eintragZu(
    art: Art,
    epaId: string | null,
  ): Listeneintrag<Diagnose | Allergie> | undefined {
    if (!listen || !epaId) return undefined;
    const alle: Listeneintrag<Diagnose | Allergie>[] =
      art === 'diagnose' ? listen.diagnosen : listen.allergien;
    return alle.find((x) => x.eintrag.id === epaId);
  }

  /** Führt eine Schreibung an der ePA aus, meldet das Ergebnis und fragt die Listen neu ab. */
  async function epaHandlung(schritt: () => Promise<void>, erfolg: string) {
    setzeLaeuft(true);
    setzeMeldung({ art: 'neutral', text: 'Wird an die ePA übermittelt …' });
    try {
      await schritt();
      setzeMeldung({ art: 'gut', text: erfolg });
    } catch (f) {
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
    setzeRueckfrage(null);
    abfrage.neuLaden();
  }

  /**
   * Nimmt einen Eintrag der Praxis in die Liste auf oder überträgt seine Änderung. Als Folge des
   * Speicherns ist das keine eigene Handlung — gezählt wird dann nur das Speichern.
   */
  async function inDieEpa(
    art: Art,
    lokal: Diagnose | Allergie,
    alsFolge = false,
    psRelevant?: boolean,
  ) {
    const vorhanden = eintragZu(art, lokal.epaId);
    const liste = LISTENNAME[LISTENART[art]];
    const lesenachweis = listen?.lesenachweis[LISTENART[art]] ?? null;
    const setztAusserKraft = art === 'allergie' && !vorhanden && keineBekannteGueltig.length > 0;
    await epaHandlung(
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

  function inDiePraxis(art: Art, epa: Diagnose | Allergie) {
    const eintrag = eintragZu(art, epa.id);
    const quelle = `${LISTENNAME[LISTENART[art]]} der ePA, angelegt von ${eintrag?.chronik.angelegtVon ?? 'unbekannt'}`;
    ausfuehren(
      art === 'diagnose'
        ? vorgaenge.diagnoseAusEpaUebernehmen(patientId, epa as Diagnose, quelle)
        : vorgaenge.allergieAusEpaUebernehmen(patientId, epa as Allergie, quelle),
    );
    setzeMeldung({
      art: 'gut',
      text: `„${bezeichnung(epa)}" in die Praxis übernommen — verknüpft mit der ${LISTENNAME[LISTENART[art]]}.`,
    });
  }

  function verknuepfen(art: Art, lokal: Diagnose | Allergie, epa: Diagnose | Allergie) {
    ausfuehren(vorgaenge.listeneintragVerknuepfen(art, lokal.id, epa.id, epa.epaFassung));
    setzeMeldung({
      art: 'gut',
      text: `„${bezeichnung(lokal)}" mit dem Eintrag der ePA verknüpft. Weichen die Angaben ab, steht die Zeile auf „lokal geändert".`,
    });
  }

  function epaStandUebernehmen(art: Art, lokal: Diagnose | Allergie, epa: Diagnose | Allergie) {
    ausfuehren(
      art === 'diagnose'
        ? vorgaenge.diagnoseNachEpaAngleichen(lokal.id, epa as Diagnose)
        : vorgaenge.allergieNachEpaAngleichen(lokal.id, epa as Allergie),
    );
    setzeMeldung({ art: 'gut', text: `„${bezeichnung(lokal)}" auf den Stand der ePA gebracht.` });
  }

  function loesen(art: Art, lokal: Diagnose | Allergie) {
    ausfuehren(vorgaenge.listeneintragVerknuepfen(art, lokal.id, null, null));
    setzeMeldung({
      art: 'neutral',
      text: `Verknüpfung gelöst. „${bezeichnung(lokal)}" steht nur noch in der Praxis.`,
    });
  }

  async function berichtigen(
    art: Art,
    epa: Diagnose | Allergie,
    ressource: Ressource,
    lokal: Diagnose | Allergie | null,
  ) {
    const lesenachweis = listen?.lesenachweis[LISTENART[art]] ?? null;
    await epaHandlung(
      async () => {
        await inDerListeBerichtigen(kvnr, LISTENART[art], lesenachweis, ressource);
        if (lokal) ausfuehren(vorgaenge.listeneintragVerknuepfen(art, lokal.id, null, null));
      },
      `„${bezeichnung(epa)}" in der ${LISTENNAME[LISTENART[art]]} als fehlerhaft gekennzeichnet.`,
    );
  }

  async function keineBekanntenEintragen() {
    await epaHandlung(async () => {
      await keineBekannteAllergieEintragen(
        kvnr,
        listen?.lesenachweis.AllergyIntolerance ?? null,
        nutzer.name,
        heute,
      );
    }, '„Keine bekannten Allergien" in die Allergienliste der ePA eingetragen.');
  }

  /** ✦ Relevanz für die Patient Summary setzen — der Eintrag bleibt in der Liste. */
  async function relevanzSetzen(
    art: Art,
    eintrag: Listeneintrag<Diagnose | Allergie>,
    wert: boolean,
  ) {
    const liste = LISTENNAME[LISTENART[art]];
    await epaHandlung(
      async () => {
        await psRelevanzAendern(
          kvnr,
          LISTENART[art],
          listen?.lesenachweis[LISTENART[art]] ?? null,
          eintrag.eintrag.id,
          wert,
        );
      },
      wert
        ? `„${bezeichnung(eintrag.eintrag)}" für die Patient Summary markiert.`
        : `„${bezeichnung(eintrag.eintrag)}" nicht mehr in der Patient Summary — bleibt in der ${liste}.`,
    );
  }

  async function diagnoseSpeichern(
    e: Diagnoseentwurf,
    inListe: boolean,
    psRelevant: boolean,
    id?: string,
  ) {
    const kennung = id ?? neueId('diag');
    ausfuehren(id ? vorgaenge.diagnoseAendern(id, e) : vorgaenge.diagnoseAnlegen(e, kennung));
    if (id) setzeBearbeitung(null);
    else setzeDurchlauf((n) => n + 1);
    const lokal = lesen().diagnosen.find((d) => d.id === kennung);
    if (inListe && lokal) await inDieEpa('diagnose', lokal, true, psRelevant);
  }

  async function allergieSpeichern(
    e: Allergieentwurf,
    inListe: boolean,
    psRelevant: boolean,
    id?: string,
  ) {
    const kennung = id ?? neueId('allg');
    ausfuehren(id ? vorgaenge.allergieAendern(id, e) : vorgaenge.allergieAnlegen(e, kennung));
    if (id) setzeBearbeitung(null);
    else setzeDurchlauf((n) => n + 1);
    const lokal = lesen().allergien.find((a) => a.id === kennung);
    if (inListe && lokal) await inDieEpa('allergie', lokal, true, psRelevant);
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

  function listenoption(art: Art, e?: Diagnose | Allergie): Listenoption {
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

  /* ---------- Zeilen ---------- */

  const knopf = (beschriftung: string, handlung: () => void, titel?: string, stark = false) => (
    <button
      type="button"
      className={`knopf klein ${stark ? 'stark' : ''}`}
      disabled={laeuft}
      title={titel}
      onClick={handlung}
    >
      {beschriftung}
    </button>
  );

  /** Gehört der Eintrag nach der Vorbelegung in die Liste? Dann ist das Aufnehmen hervorgehoben. */
  function naheliegend(e: Diagnose | Allergie): boolean {
    return 'substanz' in e
      ? e.klinischerStatus === 'aktiv' && !istBerichtigt(e)
      : e.art === 'dauer' && istGegenwaertig(e.klinischerStatus);
  }

  function mitte<T extends Diagnose | Allergie>(art: Art) {
    const operation = art === 'diagnose' ? 'condition' : 'allergy';
    return function handlungen(z: Listenzeile<T>): ReactNode {
      if (!darfStellen) return null;
      const { lokal, epa } = z;
      switch (z.status) {
        case 'nur-lokal':
          return knopf(
            'in die ePA →',
            () => void inDieEpa(art, lokal!),
            `$add-${operation}-entry`,
            naheliegend(lokal!),
          );
        case 'nur-epa':
          return knopf('← in die Praxis', () => inDiePraxis(art, epa!), undefined);
        case 'ungekoppelt':
          return knopf('verknüpfen', () => verknuepfen(art, lokal!, epa!), undefined);
        case 'epa-geaendert':
          return (
            <>
              {knopf(
                '← ePA-Stand übernehmen',
                () => epaStandUebernehmen(art, lokal!, epa!),
                undefined,
                true,
              )}
              {knopf(
                'Praxisstand →',
                () => void inDieEpa(art, lokal!),
                `$update-${operation}-entry`,
              )}
            </>
          );
        case 'lokal-geaendert':
          return (
            <>
              {knopf(
                'Änderung → ePA',
                () => void inDieEpa(art, lokal!),
                `$update-${operation}-entry`,
                true,
              )}
              {knopf('← ePA-Stand', () => epaStandUebernehmen(art, lokal!, epa!))}
            </>
          );
        case 'epa-berichtigt':
          return knopf('Verknüpfung lösen', () => loesen(art, lokal!));
        default:
          return null;
      }
    };
  }

  function berichtigenKnopf(
    art: Art,
    epa: Diagnose | Allergie,
    ressource: Ressource,
    lokal: Diagnose | Allergie | null,
  ) {
    const schluessel = `${art}-${epa.id}`;
    const operation = art === 'diagnose' ? '$update-condition-entry' : '$update-allergy-entry';
    if (rueckfrage !== schluessel) {
      return knopf('berichtigen …', () => setzeRueckfrage(schluessel), operation);
    }
    return (
      <span className="rueckfrage-inline" role="group" aria-label="Berichtigung bestätigen">
        Für alle Einrichtungen als fehlerhaft kennzeichnen?
        {knopf('berichtigen', () => void berichtigen(art, epa, ressource, lokal), operation, true)}
        {knopf('abbrechen', () => setzeRueckfrage(null))}
      </span>
    );
  }

  const dokumentOeffnen = () => epaFensterOeffnen(patientId, 'dokumente');

  const diagnoseLokal = (d: Diagnose, auf: Aufklappen) => (
    <DiagnoseKarte d={d} lokal aufklappen={auf}>
      {darfStellen && knopf('bearbeiten', () => setzeBearbeitung({ art: 'diagnose', id: d.id }))}
    </DiagnoseKarte>
  );

  const diagnoseEpa = (d: Diagnose, auf: Aufklappen) => {
    const eintrag = eintragZu('diagnose', d.id);
    const lokal = diagnosen.find((x) => x.epaId === d.id) ?? null;
    return (
      <DiagnoseKarte
        d={d}
        aufklappen={auf}
        markiert={!!eintrag?.psRelevant && !istBerichtigt(d)}
        rechts={
          eintrag && (
            <>
              <NeuMarke seit={seitDiagnosen} ressource={eintrag.ressource} />
              {!istBerichtigt(d) &&
                (darfStellen ? (
                  <PsSchalter
                    kompakt
                    an={eintrag.psRelevant}
                    gesperrt={laeuft}
                    aendern={(wert) => void relevanzSetzen('diagnose', eintrag, wert)}
                  />
                ) : (
                  eintrag.psRelevant && <PsMarke kompakt />
                ))}
            </>
          )
        }
        herkunft={
          eintrag && <Herkunftszeile chronik={eintrag.chronik} dokumentOeffnen={dokumentOeffnen} />
        }
      >
        {darfStellen &&
          eintrag &&
          !istBerichtigt(d) &&
          berichtigenKnopf('diagnose', d, eintrag.ressource, lokal)}
      </DiagnoseKarte>
    );
  };

  const allergieLokal = (a: Allergie, auf: Aufklappen) => (
    <AllergieKarte a={a} lokal aufklappen={auf}>
      {darfStellen && knopf('bearbeiten', () => setzeBearbeitung({ art: 'allergie', id: a.id }))}
    </AllergieKarte>
  );

  const allergieEpa = (a: Allergie, auf: Aufklappen) => {
    const eintrag = eintragZu('allergie', a.id);
    const lokal = allergien.find((x) => x.epaId === a.id) ?? null;
    return (
      <AllergieKarte
        a={a}
        aufklappen={auf}
        markiert={!!eintrag?.psRelevant && !istBerichtigt(a)}
        rechts={
          eintrag && (
            <>
              <NeuMarke seit={seitAllergien} ressource={eintrag.ressource} />
              {!istBerichtigt(a) &&
                (darfStellen ? (
                  <PsSchalter
                    kompakt
                    an={eintrag.psRelevant}
                    gesperrt={laeuft}
                    aendern={(wert) => void relevanzSetzen('allergie', eintrag, wert)}
                  />
                ) : (
                  eintrag.psRelevant && <PsMarke kompakt />
                ))}
            </>
          )
        }
        herkunft={
          eintrag && <Herkunftszeile chronik={eintrag.chronik} dokumentOeffnen={dokumentOeffnen} />
        }
      >
        {darfStellen &&
          eintrag &&
          !istBerichtigt(a) &&
          berichtigenKnopf('allergie', a, eintrag.ressource, lokal)}
      </AllergieKarte>
    );
  };

  /** Ordnungsangaben einer Zeile: Einstellung in die Liste, sonst Dokumentation in der Praxis. */
  const diagnoseAngaben = (z: Listenzeile<Diagnose>) => {
    const e = (z.epa ?? z.lokal)!;
    return ordnungsangaben(
      z.lokal,
      z.epa,
      z.epa ? (eintragZu('diagnose', z.epa.id)?.chronik ?? null) : null,
      e.beginn,
      e.bezeichnung,
    );
  };
  const allergieAngaben = (z: Listenzeile<Allergie>) => {
    const e = (z.epa ?? z.lokal)!;
    return ordnungsangaben(
      z.lokal,
      z.epa,
      z.epa ? (eintragZu('allergie', z.epa.id)?.chronik ?? null) : null,
      e.beginn ?? '',
      e.substanz,
    );
  };

  const ohneEpa = (liste: string) => (
    <OhneEpaFlaeche lage={lage} liste={liste} neuLaden={abfrage.neuLaden} />
  );

  const aktiveLokale = allergien.filter((a) => a.klinischerStatus === 'aktiv' && !istBerichtigt(a));
  const gueltigeEpaAllergien = epaAllergien.filter((e) => !istBerichtigt(e.eintrag));
  const allergienKopf = listen ? (
    <KeineBekanntenAllergien
      gueltig={keineBekannteGueltig}
      ausserKraft={keineBekannte.length - keineBekannteGueltig.length}
      lokalDokumentiert={aktiveLokale.length}
      eintragbar={darfStellen && allergien.length === 0 && gueltigeEpaAllergien.length === 0}
      laeuft={laeuft}
      eintragen={() => void keineBekanntenEintragen()}
    />
  ) : null;

  return (
    <>
      <Bestandsband lage="beides" />

      <Listenband
        lage={lage}
        patientId={patientId}
        befugnisBis={befugnis?.gueltigBis ?? null}
        geladenUm={abfrage.geladenUm}
        neuLaden={() => {
          setzeMeldung(null);
          abfrage.neuLaden();
        }}
      />

      <SeitLetztemAufrufBand seit={seitDiagnosen} liste="Diagnosenliste" />
      <SeitLetztemAufrufBand seit={seitAllergien} liste="Allergienliste" />

      {meldung && (
        <div
          className={`hinweisbox ${meldung.art === 'gut' ? 'gut' : meldung.art === 'fehler' ? 'fehler' : ''}`}
          role="status"
        >
          {meldung.text}
        </div>
      )}

      <div className="spalten">
        <div>
          <SplitBlock<Diagnose>
            titel="Diagnosen"
            anker="diagnosen"
            psAnzahl={
              listen
                ? listen.diagnosen.filter((e) => e.psRelevant && !istBerichtigt(e.eintrag)).length
                : undefined
            }
            liste="Diagnosenliste"
            lage={lage}
            zeilen={diagnoseZeilen}
            lokal={diagnosen}
            schluessel={(d) => d.id}
            verknuepft={(d) => !!d.epaId}
            lokalKarte={diagnoseLokal}
            epaKarte={diagnoseEpa}
            mitte={mitte<Diagnose>('diagnose')}
            ohneEpa={ohneEpa('Diagnosenliste')}
            leer="Keine Diagnose dokumentiert."
            ordnung={ordnungDiagnosen}
            angaben={diagnoseAngaben}
            fuss={
              <SnomedBilanz
                gesamt={diagnosen.length}
                kodiert={diagnosen.filter((d) => d.snomed).length}
                was="Diagnosen der Praxis"
              />
            }
          />

          <SplitBlock<Allergie>
            titel="Allergien und Unverträglichkeiten"
            anker="allergien"
            psAnzahl={
              listen
                ? epaAllergien.filter((e) => e.psRelevant && !istBerichtigt(e.eintrag)).length
                : undefined
            }
            liste="Allergienliste"
            lage={lage}
            zeilen={allergieZeilen}
            lokal={allergien}
            schluessel={(a) => a.id}
            verknuepft={(a) => !!a.epaId}
            lokalKarte={allergieLokal}
            epaKarte={allergieEpa}
            mitte={mitte<Allergie>('allergie')}
            ohneEpa={ohneEpa('Allergienliste')}
            kopf={allergienKopf}
            leer="Keine Allergie dokumentiert."
            ordnung={ordnungAllergien}
            angaben={allergieAngaben}
            fuss={
              <SnomedBilanz
                gesamt={allergien.length}
                kodiert={allergien.filter((a) => a.snomed).length}
                was="Allergien der Praxis"
              />
            }
          />
        </div>

        <div>
          {!darfStellen ? (
            <Karte titel="Dokumentieren">
              <div className="hinweisbox warn">Nur in ärztlicher Rolle.</div>
            </Karte>
          ) : inBearbeitung && bearbeitung?.art === 'diagnose' ? (
            <DiagnoseFormular
              key={`b-${bearbeitung.id}`}
              titel="Diagnose bearbeiten"
              ausgang={inBearbeitung as Diagnose}
              kvnr={kvnr}
              heute={heute}
              person={nutzer.name}
              liste={listenoption('diagnose', inBearbeitung)}
              beiSpeichern={(e, inListe, ps) =>
                void diagnoseSpeichern(e, inListe, ps, bearbeitung.id)
              }
              beiAbbruch={() => setzeBearbeitung(null)}
            />
          ) : inBearbeitung && bearbeitung?.art === 'allergie' ? (
            <AllergieFormular
              key={`b-${bearbeitung.id}`}
              titel="Allergie bearbeiten"
              ausgang={inBearbeitung as Allergie}
              kvnr={kvnr}
              heute={heute}
              person={nutzer.name}
              liste={listenoption('allergie', inBearbeitung)}
              beiSpeichern={(e, inListe, ps) =>
                void allergieSpeichern(e, inListe, ps, bearbeitung.id)
              }
              beiAbbruch={() => setzeBearbeitung(null)}
            />
          ) : (
            <>
              <div
                className="reihe"
                style={{ marginBottom: 10 }}
                role="group"
                aria-label="Was dokumentieren"
              >
                <button
                  type="button"
                  className="knopf"
                  aria-pressed={erfassung === 'diagnose'}
                  onClick={() => setzeErfassung('diagnose')}
                >
                  Diagnose
                </button>
                <button
                  type="button"
                  className="knopf"
                  aria-pressed={erfassung === 'allergie'}
                  onClick={() => setzeErfassung('allergie')}
                >
                  Allergie
                </button>
              </div>
              {erfassung === 'diagnose' ? (
                <DiagnoseFormular
                  key={`d-${durchlauf}`}
                  titel="Diagnose dokumentieren"
                  ausgang={leererEntwurf(patientId, heute, nutzer.name)}
                  kvnr={kvnr}
                  heute={heute}
                  person={nutzer.name}
                  liste={listenoption('diagnose')}
                  beiSpeichern={(e, inListe, ps) => void diagnoseSpeichern(e, inListe, ps)}
                />
              ) : (
                <AllergieFormular
                  key={`a-${durchlauf}`}
                  titel="Allergie dokumentieren"
                  ausgang={leererAllergieentwurf(patientId, heute, nutzer.name)}
                  kvnr={kvnr}
                  heute={heute}
                  person={nutzer.name}
                  liste={listenoption('allergie')}
                  beiSpeichern={(e, inListe, ps) => void allergieSpeichern(e, inListe, ps)}
                />
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}

/* ---------- Band über dem Splitscreen ---------- */

function Listenband({
  lage,
  patientId,
  befugnisBis,
  geladenUm,
  neuLaden,
}: {
  lage: Listenlage;
  patientId: string;
  befugnisBis: string | null;
  geladenUm: Date | null;
  neuLaden: () => void;
}) {
  const ansehen = (
    <button
      type="button"
      className="knopf klein"
      onClick={() => epaFensterOeffnen(patientId, 'listen')}
    >
      in der ePA ansehen
    </button>
  );
  if (lage.art === 'bereit') {
    return (
      <div className="abgleichband synchron" role="status">
        <span className="abgleichband-punkt" aria-hidden="true" />
        <span>
          Listen der ePA
          {befugnisBis ? ` · Befugnis bis ${deutschesDatum(befugnisBis.slice(0, 10))}` : ''}
        </span>
        <span className="rechts reihe">
          <Abrufstand geladenUm={geladenUm} laedt={false} neuLaden={neuLaden} />
          {ansehen}
        </span>
      </div>
    );
  }
  if (lage.art === 'laedt') {
    return (
      <div className="abgleichband" role="status">
        <span className="abgleichband-punkt" aria-hidden="true" />
        <span>Wird abgefragt …</span>
      </div>
    );
  }
  if (lage.art === 'ohne-befugnis') {
    return (
      <div className="abgleichband veraltet" role="status">
        <span className="abgleichband-punkt" aria-hidden="true" />
        <span>
          <b>Keine Befugnis für die ePA.</b>
        </span>
        <span className="rechts reihe">
          <EgkKnopf patientId={patientId} stark />
        </span>
      </div>
    );
  }
  if (lage.art === 'nicht-angeboten') {
    return (
      <div className="abgleichband" role="status">
        <span className="abgleichband-punkt" aria-hidden="true" />
        <span>
          <b>Release 3.1.3:</b> keine Listen in der ePA.
        </span>
        <span className="rechts reihe">
          <button type="button" className="knopf klein" onClick={protokollOeffnen}>
            Aufrufe
          </button>
        </span>
      </div>
    );
  }
  return (
    <div className="abgleichband veraltet" role="status">
      <span className="abgleichband-punkt" aria-hidden="true" />
      <span>
        <b>{fehlerTitel(lage)}</b> {lage.text}
      </span>
      <span className="rechts reihe">
        <button type="button" className="knopf klein" onClick={neuLaden}>
          erneut versuchen
        </button>
      </span>
    </div>
  );
}

function OhneEpaFlaeche({
  lage,
  liste,
  neuLaden,
}: {
  lage: Listenlage;
  liste: string;
  neuLaden: () => void;
}) {
  if (lage.art === 'laedt') return <Leer>Wird abgefragt …</Leer>;
  if (lage.art === 'ohne-befugnis') {
    return (
      <div className="split-grund">
        <b>Keine Befugnis.</b>
      </div>
    );
  }
  if (lage.art === 'nicht-angeboten') {
    return (
      <div className="split-grund">
        <b>Release 3.1.3: keine {liste}.</b>
      </div>
    );
  }
  return (
    <div className="split-grund">
      <b>ePA-Fehler.</b>{' '}
      <button type="button" className="knopf klein" onClick={neuLaden}>
        erneut versuchen
      </button>
    </div>
  );
}

/* ---------- „Keine bekannten Allergien" ---------- */

function KeineBekanntenAllergien({
  gueltig,
  ausserKraft,
  lokalDokumentiert,
  eintragbar,
  laeuft,
  eintragen,
}: {
  gueltig: Listeneintrag<Allergie>[];
  ausserKraft: number;
  lokalDokumentiert: number;
  eintragbar: boolean;
  laeuft: boolean;
  eintragen: () => void;
}) {
  const angabe = gueltig[0];
  return (
    <>
      {angabe ? (
        <div className={`hinweisbox ${lokalDokumentiert > 0 ? 'warn' : 'gut'}`}>
          <b>Keine bekannten Allergien</b> ·{' '}
          {deutschesDatum(angabe.chronik.angelegtAm.slice(0, 10))}, {angabe.chronik.angelegtVon}
          {angabe.chronik.erstelltDurch ? ` (${angabe.chronik.erstelltDurch})` : ''}
          {lokalDokumentiert > 0 && ' · widerspricht der Praxisdokumentation'}
        </div>
      ) : (
        eintragbar && (
          <div className="hinweisbox">
            <button
              type="button"
              className="knopf klein stark"
              disabled={laeuft}
              onClick={eintragen}
            >
              „Keine bekannten Allergien" in die ePA eintragen
            </button>
          </div>
        )
      )}
      {ausserKraft > 0 && (
        <p className="leise-klein">„Keine bekannten Allergien" außer Kraft ({ausserKraft})</p>
      )}
    </>
  );
}

/* ---------- Karten ---------- */

function DiagnoseKarte({
  d,
  aufklappen,
  lokal = false,
  markiert = false,
  rechts,
  herkunft,
  children,
}: {
  d: Diagnose;
  aufklappen: Aufklappen;
  lokal?: boolean;
  /** ✦ Als relevant für die Patient Summary markiert. */
  markiert?: boolean;
  /** Marken und Schalter, die auch zugeklappt sichtbar bleiben. */
  rechts?: ReactNode;
  /** Herkunftszeile des Listeneintrags — in den Details. */
  herkunft?: ReactNode;
  children?: ReactNode;
}) {
  const berichtigt = d.diagnosesicherheit === 'irrtümlich';
  const gegenwaertig = istGegenwaertig(d.klinischerStatus) && !berichtigt;
  const zeitraum = d.ende
    ? `${deutschesDatum(d.beginn)} – ${deutschesDatum(d.ende)}`
    : `seit ${deutschesDatum(d.beginn)}`;
  return (
    <Kompaktkarte
      titel={d.bezeichnung}
      aufklappen={aufklappen}
      vergangen={!gegenwaertig}
      markiert={markiert}
      berichtigt={berichtigt}
      rechts={rechts}
      zeile={
        <>
          {d.code && (
            <span className="code" title="ICD-10-GM mit Zusatzkennzeichen und Seite">
              {d.code} {d.zusatzkennzeichen}
              {d.seitenlokalisation ? ` ${d.seitenlokalisation}` : ''}
            </span>
          )}{' '}
          {berichtigt ? (
            <Marker ton="fehler">fehlerhaft</Marker>
          ) : (
            <span>
              {d.art === 'dauer' ? 'Dauer' : 'Akut'} · {zeitraum}
            </span>
          )}
        </>
      }
      details={
        <>
          <div className="codezeile">
            {d.snomed ? (
              <span
                className="code snomed"
                title={`SNOMED CT ${d.snomed.code} — ${d.snomed.anzeige}`}
              >
                SCT {d.snomed.code}
              </span>
            ) : (
              <span className="marker warn">ohne SNOMED CT</span>
            )}
          </div>
          <div className="split-angaben">
            <Marker ton={d.art === 'dauer' ? 'akzent' : 'neutral'}>
              {DIAGNOSEART_BEZEICHNUNG[d.art]}
            </Marker>{' '}
            {!berichtigt && (
              <span>
                {KLINISCHER_STATUS_BEZEICHNUNG[d.klinischerStatus]} ·{' '}
                {DIAGNOSESICHERHEIT_BEZEICHNUNG[d.diagnosesicherheit]}
              </span>
            )}
          </div>
          {d.notiz && <div className="leise-klein">{d.notiz}</div>}
          {lokal && d.herkunft.bestand === 'epa' && (
            <div className="herkunft">übernommen aus {d.herkunft.quelle}</div>
          )}
          {herkunft}
          {children && <div className="split-karte-fuss">{children}</div>}
        </>
      }
    />
  );
}

function AllergieKarte({
  a,
  aufklappen,
  lokal = false,
  markiert = false,
  rechts,
  herkunft,
  children,
}: {
  a: Allergie;
  aufklappen: Aufklappen;
  lokal?: boolean;
  /** ✦ Als relevant für die Patient Summary markiert. */
  markiert?: boolean;
  rechts?: ReactNode;
  herkunft?: ReactNode;
  children?: ReactNode;
}) {
  const atc = atcFuerSubstanz(a.snomed?.code ?? null);
  const berichtigt = a.gewissheit === 'irrtümlich';
  return (
    <Kompaktkarte
      titel={a.substanz}
      aufklappen={aufklappen}
      vergangen={a.klinischerStatus !== 'aktiv' || berichtigt}
      markiert={markiert}
      berichtigt={berichtigt}
      rechts={rechts}
      zeile={
        <>
          <span>{a.typ}</span>{' '}
          <Marker ton={a.gewissheit === 'bestätigt' ? 'gut' : berichtigt ? 'fehler' : 'warn'}>
            {GEWISSHEIT_BEZEICHNUNG[a.gewissheit]}
          </Marker>{' '}
          <span>{a.kritikalitaet}</span>
        </>
      }
      details={
        <>
          <div className="codezeile">
            {a.snomed ? (
              <span className="code snomed" title={`SNOMED CT ${a.snomed.code}`}>
                SCT {a.snomed.code}
              </span>
            ) : (
              <span className="marker warn">Freitext</span>
            )}
            {atc.length > 0 && <span className="leise-klein">ATC {atc.join(', ')}</span>}
          </div>
          <div className="split-angaben">{ALLERGIESTATUS_BEZEICHNUNG[a.klinischerStatus]}</div>
          {a.reaktionen.length > 0 && (
            <div className="leise-klein">Reaktion: {reaktionenAlsText(a.reaktionen)}</div>
          )}
          {a.notiz && <div className="leise-klein">{a.notiz}</div>}
          {lokal && a.herkunft.bestand === 'epa' && (
            <div className="herkunft">übernommen aus {a.herkunft.quelle}</div>
          )}
          {herkunft}
          {children && <div className="split-karte-fuss">{children}</div>}
        </>
      }
    />
  );
}

function SnomedBilanz({ gesamt, kodiert, was }: { gesamt: number; kodiert: number; was: string }) {
  if (gesamt === 0) return null;
  return (
    <p className="leise-klein" style={{ marginTop: 8 }}>
      SNOMED CT: {kodiert} von {gesamt} {was}
    </p>
  );
}
