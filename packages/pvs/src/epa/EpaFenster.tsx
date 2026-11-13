import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { deutschesDatum, patientSummaryLesen, type Patient } from '@demo-pvs/kern';
import { ausfuehren, useAuswahl } from '../speicher/speicher.js';
import { vorgaenge } from '../speicher/vorgaenge.js';
import { Leer } from '../bausteine/Bausteine.js';
import { AktenlotseInhalt } from '../lotse/PraxisLotse.js';
import { useLotseVorhanden } from '../lotse/vorhanden.js';
import { EpaFehler } from './klient.js';
import {
  epaPatientSummarySuchen,
  patientSummaryAbrufen,
  patientSummaryVerfuegbar,
  patientSummaryVerlaufAbrufen,
} from './dienste/vorschlaege.js';
import { diagnosedienstVerfuegbar } from './dienste/listendienste.js';
import { medikationslisteLesen, medikationsplanLesen } from './dienste/medikation.js';
import { dokumentAbrufen, dokumenteSuchen } from './dienste/dokumente.js';
import {
  dokumentverweisLesen,
  useBetriebsstand,
  useEpaAbfrage,
  type Dokumentverweis,
} from './epa-bestand.js';
import { BefugnisMarker, useEinlesungen } from './befugnis.js';
import { Abrufstand } from './aktenstatus.js';
import { listenLaden } from './listen.js';
import {
  EPA_BEREICHE,
  epaBereichWaehlen,
  epaDokumentZeigen,
  epaFensterSchliessen,
  useEpaFenster,
  type EpaBereich,
} from './fenster.js';
import { protokollOeffnen, useProtokollSichtbar } from './protokoll.js';
import { PatientSummaryAnsicht, type PsStand } from './PatientSummary.js';
import {
  Inhaltsspeicher,
  Medikation,
  Zugriffsmarker,
  Fehlerlage,
  LetzteAufrufe,
} from './fensterteile/Teile.js';
import { Uebersicht } from './fensterteile/Uebersicht.js';
import { DokumenteInEpa, artZuordnen } from './fensterteile/Dokumente.js';
import { MedikationInEpa } from './fensterteile/Medikation.js';
import { ListenInEpa } from './fensterteile/Listen.js';
import { LaborbefundeInEpa } from './fensterteile/Laborbefunde.js';
import { InhalteAusDokumenten } from './fensterteile/Inhalte.js';

/**
 * Die elektronische Patientenakte als eigenes Fenster über der Patientenkartei — eine Ebene
 * höher, weil die ePA ein fremdes System ist, das aufgerufen wird (ADR 0014). Jede Ansicht
 * beruht auf einem Weg des Release ePA 3.1.3 (ADR 0013); was erst die Weiterentwicklung
 * bringt — strukturierte Laborbefunde, ✦ Listen —, erscheint nur, wenn das Aktensystem es
 * anbietet. Ohne Befugnis antwortet die ePA mit 403 `notEntitled` (ADR 0017).
 */
export function EpaFenster() {
  const fenster = useEpaFenster();
  const patient = useAuswahl(
    (z) => z.patienten.find((p) => p.id === fenster.patientId),
    [fenster.patientId],
  );
  if (!fenster.offen || !patient) return null;
  return (
    <EpaDialog
      key={patient.id}
      patient={patient}
      bereich={fenster.bereich}
      dokumentId={fenster.dokumentId}
    />
  );
}

function EpaDialog({
  patient,
  bereich,
  dokumentId,
}: {
  patient: Patient;
  bereich: EpaBereich;
  dokumentId: string | null;
}) {
  const kvnr = patient.versicherung.kvnr;
  const dialog = useRef<HTMLDivElement>(null);
  const protokollOffen = useProtokollSichtbar();
  // Nach dem Einlesen der eGK oder einer Umstellung der Demo-Steuerung wird neu abgefragt.
  const einlesungen = useEinlesungen();
  const betriebsstand = useBetriebsstand();
  const lokale = useAuswahl(
    (z) => z.dokumente.filter((d) => d.patientId === patient.id),
    [patient.id],
  );

  // Fokus in das Fenster und beim Schließen zurück; Escape schließt.
  useEffect(() => {
    const vorher = document.activeElement as HTMLElement | null;
    dialog.current?.focus();
    const beiTaste = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.defaultPrevented) {
        // Das Aufrufprotokoll schließt erst mit der nächsten Escape-Taste.
        e.preventDefault();
        epaFensterSchliessen();
      }
    };
    window.addEventListener('keydown', beiTaste);
    return () => {
      window.removeEventListener('keydown', beiTaste);
      vorher?.focus?.();
    };
  }, []);

  const dokumente = useEpaAbfrage(
    () => dokumenteSuchen(kvnr).then((r) => r.map(dokumentverweisLesen)),
    [kvnr, einlesungen, betriebsstand],
  );
  // Ob das Aktensystem den Diagnose-Service anbietet, sagt sein CapabilityStatement (✦).
  const dienst = useEpaAbfrage(() => diagnosedienstVerfuegbar(), [betriebsstand]);
  const mitListen = dienst.daten === true;
  const summaryDienst = useEpaAbfrage(() => patientSummaryVerfuegbar(), [betriebsstand]);
  const mitLotse = useLotseVorhanden() === true;
  const zugriff = !dokumente.fehler;
  // Ohne den ✦ Dienst sucht das Praxissystem die ePS des Aktensystems über MHD (Vorschau ePA 3.2,
  // ADR 0042). Im Release 3.1.3 findet die Suche keine; dann gibt es den Reiter nicht. Gesucht wird
  // erst nach der frischen Antwort, ob es den Dienst gibt — sonst liefe beim Umschalten des
  // Ausbaustands eine Suche mit dem alten Stand.
  const epsAktensystem = useEpaAbfrage(
    () => epaPatientSummarySuchen(kvnr),
    [kvnr, einlesungen, summaryDienst.geladenUm],
    zugriff && summaryDienst.daten === false && !summaryDienst.laedt,
  );
  const vomAktensystem = summaryDienst.daten === false && !!epsAktensystem.daten;
  const mitSummary = summaryDienst.daten === true || vomAktensystem;
  // Ein Reiter, den das Aktensystem nicht (mehr) anbietet, fällt auf die Übersicht zurück.
  const ansicht: EpaBereich =
    (bereich === 'summary' &&
      summaryDienst.daten === false &&
      !epsAktensystem.laedt &&
      !epsAktensystem.daten) ||
    (bereich === 'listen' && dienst.daten === false) ||
    (bereich === 'lotse' && !mitLotse)
      ? 'uebersicht'
      : bereich;
  const navigiere = useNavigate();

  // Medikation und Listen erst, wenn sie gebraucht werden — dann nicht bei jedem Wechsel erneut.
  const [gebraucht, setzeGebraucht] = useState<Set<EpaBereich>>(() => new Set([bereich]));
  useEffect(() => {
    setzeGebraucht((alt) => (alt.has(bereich) ? alt : new Set([...alt, bereich])));
  }, [bereich]);
  const ueberblick = gebraucht.has('uebersicht');
  const medikation = useEpaAbfrage<Medikation>(
    () => Promise.all([medikationslisteLesen(kvnr), medikationsplanLesen(kvnr)]),
    [kvnr, einlesungen, betriebsstand],
    zugriff && (ueberblick || gebraucht.has('medikation')),
  );
  const listen = useEpaAbfrage(
    () => listenLaden(kvnr, patient.id),
    [kvnr, einlesungen, betriebsstand],
    zugriff && mitListen && (ueberblick || gebraucht.has('listen')),
  );
  const vorschlag = useEpaAbfrage(
    () => patientSummaryAbrufen(kvnr),
    [kvnr, einlesungen, summaryDienst.geladenUm],
    zugriff &&
      summaryDienst.daten === true &&
      !summaryDienst.laedt &&
      (ueberblick || gebraucht.has('summary')),
  );
  /*
   * ✦ Früherer Stand der Patient Summary (`_at`), gewählt im Verlauf. Er gilt für diese Person;
   * eine andere beginnt beim heutigen Stand.
   */
  const [psStand, setzePsStand] = useState<PsStand | null>(null);
  useEffect(() => setzePsStand(null), [kvnr]);
  const frueher = useEpaAbfrage(
    () => patientSummaryAbrufen(kvnr, psStand!.id),
    [kvnr, psStand],
    zugriff && summaryDienst.daten === true && psStand !== null,
  );
  const frueherInhalt = useMemo(
    () => (psStand && frueher.daten ? patientSummaryLesen(frueher.daten) : null),
    [psStand, frueher.daten],
  );
  const verlaufLaden = useCallback(() => patientSummaryVerlaufAbrufen(kvnr), [kvnr]);
  const [verlaufOffen, setzeVerlaufOffen] = useState(false);
  // Der Reiter zeigt die ✦ Patient Summary, sonst die ePS des Aktensystems.
  const summary = vomAktensystem ? epsAktensystem : vorschlag;
  const summaryRoh = vomAktensystem ? epsAktensystem.daten?.inhalt : vorschlag.daten;
  // Ohne Patient Summary kein Inhalt — auch nicht der einer früheren Abfrage, etwa nach dem
  // Umschalten auf einen Ausbaustand ohne sie.
  const summaryInhalt = useMemo(
    () => (mitSummary ? patientSummaryLesen(summaryRoh, { nurVorhandene: vomAktensystem }) : null),
    [mitSummary, summaryRoh, vomAktensystem],
  );
  // Stand und „aktualisieren" gelten für die Abfrage, auf der der gewählte Reiter beruht.
  const aktiv =
    ansicht === 'summary'
      ? summary
      : ansicht === 'medikation'
        ? medikation
        : ansicht === 'listen'
          ? listen
          : dokumente;

  // Dokumentinhalte (ITI-68) werden zwischengespeichert, damit ein Wechsel keinen Abruf wiederholt.
  const [inhalte, setzeInhalte] = useState<Inhaltsspeicher>({});
  const [laeuft, setzeLaeuft] = useState(false);
  /** Ruft fehlende Dokumente ab und gibt den vollständigen Stand zurück. */
  async function abrufen(verweise: Dokumentverweis[]): Promise<Inhaltsspeicher> {
    const offen = verweise.filter((v) => !(v.id in inhalte));
    if (offen.length === 0) return inhalte;
    setzeLaeuft(true);
    // Unabhängige Abrufe parallel; mit der einstellbaren Antwortzeit der Demo zählt das.
    const neu: Inhaltsspeicher = Object.fromEntries(
      await Promise.all(
        offen.map(async (v) => {
          try {
            return [v.id, { inhalt: await dokumentAbrufen(kvnr, v.ressource) }] as const;
          } catch (f) {
            return [
              v.id,
              { fehler: f instanceof EpaFehler ? f.diagnose : 'Abruf fehlgeschlagen' },
            ] as const;
          }
        }),
      ),
    );
    setzeInhalte((alt) => ({ ...alt, ...neu }));
    setzeLaeuft(false);
    return { ...inhalte, ...neu };
  }

  const verweise = dokumente.daten ?? [];
  const lokalNachEpaId = useMemo(
    () => new Map(lokale.filter((d) => d.epaId).map((d) => [d.epaId!, d])),
    [lokale],
  );

  async function uebernehmen(v: Dokumentverweis) {
    const stand = await abrufen([v]);
    const eintrag = stand[v.id];
    if (!eintrag || eintrag.fehler) return;
    const [autor, ...einrichtung] = v.autor.split(', ');
    ausfuehren(
      vorgaenge.dokumentUebernehmen(patient.id, {
        epaId: v.id,
        titel: v.titel,
        art: artZuordnen(v, eintrag.inhalt),
        datum: v.datum.slice(0, 10),
        einrichtung: einrichtung.join(', ') || v.autor,
        autor: autor ?? v.autor,
        inhalt: eintrag.inhalt,
        inhaltstyp: v.mimeType,
      }),
    );
  }

  const gemeinsam = {
    patientId: patient.id,
    verweise,
    lokalNachEpaId,
    inhalte,
    abrufen,
    uebernehmen,
  };

  return (
    <div
      className="epa-fenster-hintergrund"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) epaFensterSchliessen();
      }}
    >
      <div
        ref={dialog}
        className={`epa-fenster ${protokollOffen ? 'mit-protokoll' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="epa-fenster-titel"
        tabIndex={-1}
      >
        <header className="epa-fenster-kopf">
          <span className="epa-siegel" aria-hidden="true">
            ePA
          </span>
          <div className="epa-fenster-titelblock">
            <h2 id="epa-fenster-titel">Elektronische Patientenakte</h2>
            <div className="leise-klein">
              {patient.nachname}, {patient.vorname} · {deutschesDatum(patient.geburtsdatum)} · KVNR{' '}
              <span className="code">{kvnr}</span>
            </div>
          </div>
          <div className="rechts reihe">
            <BefugnisMarker patientId={patient.id} />
            <Zugriffsmarker laedt={dokumente.laedt} fehler={dokumente.fehler} />
            <Abrufstand geladenUm={aktiv.geladenUm} laedt={aktiv.laedt} neuLaden={aktiv.neuLaden} />
            <button type="button" className="knopf klein" onClick={protokollOeffnen}>
              Aufrufe
            </button>
            <button
              type="button"
              className="schliessen gross"
              aria-label="ePA schließen"
              title="Schließen (Esc)"
              onClick={epaFensterSchliessen}
            >
              ×
            </button>
          </div>
        </header>

        <nav className="epa-fenster-reiter" aria-label="Bereiche der ePA">
          {EPA_BEREICHE.filter(
            (b) =>
              !b.bedingung ||
              (b.bedingung === 'listen'
                ? mitListen
                : b.bedingung === 'lotse'
                  ? mitLotse
                  : mitSummary),
          ).map((b) => (
            <button
              key={b.schluessel}
              type="button"
              className={ansicht === b.schluessel ? 'aktiv' : ''}
              aria-current={ansicht === b.schluessel ? 'page' : undefined}
              onClick={() => epaBereichWaehlen(b.schluessel)}
            >
              {b.beschriftung}
            </button>
          ))}
        </nav>

        <div className="epa-fenster-inhalt">
          {dokumente.fehler ? (
            <Fehlerlage
              fehler={dokumente.fehler}
              neuLaden={dokumente.neuLaden}
              patientId={patient.id}
            />
          ) : ansicht === 'summary' ? (
            summary.fehler ? (
              <Fehlerlage
                fehler={summary.fehler}
                neuLaden={summary.neuLaden}
                patientId={patient.id}
              />
            ) : psStand && !vomAktensystem && frueher.fehler ? (
              <Fehlerlage
                fehler={frueher.fehler}
                neuLaden={frueher.neuLaden}
                patientId={patient.id}
              />
            ) : summary.laedt || !summaryInhalt || (psStand && !frueherInhalt) ? (
              <Leer>Wird abgefragt …</Leer>
            ) : (
              <PatientSummaryAnsicht
                inhalt={psStand && frueherInhalt ? frueherInhalt : summaryInhalt}
                roh={psStand ? frueher.daten : summaryRoh}
                {...(vomAktensystem
                  ? {}
                  : {
                      verlauf: {
                        laden: verlaufLaden,
                        schluessel: summary.geladenUm,
                        offen: verlaufOffen,
                        umschalten: () => setzeVerlaufOffen((o) => !o),
                      },
                      stand: psStand?.zeit ?? null,
                      standWaehlen: setzePsStand,
                    })}
                herkunft={vomAktensystem ? 'aktensystem' : 'vorschlag'}
                patientId={patient.id}
                sprung={(ziel) => {
                  epaFensterSchliessen();
                  navigiere(
                    ziel === 'allergien' || ziel === 'diagnosen'
                      ? `/patient/${patient.id}/diagnosen#${ziel}`
                      : ziel === 'medikation'
                        ? `/patient/${patient.id}/medikation`
                        : ziel === 'impfungen'
                          ? `/patient/${patient.id}/impfungen`
                          : `/patient/${patient.id}/labor`,
                  );
                }}
                inDokumentenSuchen={() => epaBereichWaehlen('dokumente')}
                dokumentZeigen={epaDokumentZeigen}
              />
            )
          ) : ansicht === 'uebersicht' ? (
            <Uebersicht
              kvnr={kvnr}
              patientId={patient.id}
              verweise={verweise}
              laedt={dokumente.laedt}
              lokalNachEpaId={lokalNachEpaId}
              medikation={medikation.daten}
              listen={mitListen ? listen.daten : null}
              summaryAbschnitte={
                summaryInhalt
                  ? {
                      gefuellt: summaryInhalt.abschnitte.filter((a) => a.eintraege.length > 0)
                        .length,
                      gesamt: summaryInhalt.abschnitte.length,
                    }
                  : null
              }
            />
          ) : ansicht === 'dokumente' ? (
            <DokumenteInEpa {...gemeinsam} kvnr={kvnr} laedt={dokumente.laedt} ziel={dokumentId} />
          ) : ansicht === 'medikation' ? (
            <MedikationInEpa
              patientId={patient.id}
              laedt={medikation.laedt}
              fehler={medikation.fehler}
              daten={medikation.daten}
              neuLaden={medikation.neuLaden}
            />
          ) : ansicht === 'listen' ? (
            <ListenInEpa
              patientId={patient.id}
              laedt={listen.laedt}
              fehler={listen.fehler}
              daten={listen.daten}
              neuLaden={listen.neuLaden}
            />
          ) : ansicht === 'lotse' ? (
            <AktenlotseInhalt patientId={patient.id} />
          ) : ansicht === 'labor' ? (
            <LaborbefundeInEpa {...gemeinsam} laeuft={laeuft} />
          ) : (
            <InhalteAusDokumenten {...gemeinsam} laeuft={laeuft} />
          )}
        </div>

        <LetzteAufrufe />
      </div>
    </div>
  );
}
