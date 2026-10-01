import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ALLERGIESTATUS_BEZEICHNUNG,
  CODESYSTEM,
  DIAGNOSEART_BEZEICHNUNG,
  GEWISSHEIT_BEZEICHNUNG,
  KLINISCHER_STATUS_BEZEICHNUNG,
  deutschesDatum,
  deutscherZeitpunkt,
  dokumentinhaltLesen,
  istKeineBekannteAllergie,
  laborbefundLesen,
  ordnen,
  patientSummaryLesen,
  reaktionenAlsText,
  type Allergie,
  type Diagnose,
  type Dokumentart,
  type LokalesDokument,
  type Patient,
  type Ressource,
} from '@demo-pvs/kern';
import { ausfuehren, useAuswahl } from '../speicher/speicher.js';
import { vorgaenge } from '../speicher/vorgaenge.js';
import { Leer, Marker } from '../bausteine/Bausteine.js';
import { Befundansicht } from '../bausteine/Befundansicht.js';
import { DokumentBetrachter } from '../bausteine/DokumentBetrachter.js';
import {
  EINRICHTUNG,
  EpaFehler,
  USER_AGENT,
  diagnosedienstVerfuegbar,
  dokumentAbrufen,
  dokumenteSuchen,
  istDatei,
  medikationslisteLesen,
  medikationsplanLesen,
  patientSummaryAbrufen,
  patientSummaryVerfuegbar,
  type Medikationsliste,
  type Medikationsplan,
} from './klient.js';
import {
  codeVon,
  datumVon,
  dokumentverweisLesen,
  fehlerTitel,
  istStrukturiert,
  medikamentZu,
  ohneBefugnis,
  textVon,
  useBetriebsstand,
  useEpaAbfrage,
  type Abfragefehler,
  type Dokumentverweis,
} from './epa-bestand.js';
import { BefugnisMarker, EgkKnopf, useBefugnis, useEinlesungen } from './befugnis.js';
import { Abrufstand } from './aktenstatus.js';
import { listenLaden, type EpaListen, type Listeneintrag } from './listen.js';
import {
  EPA_BEREICHE,
  epaBereichWaehlen,
  epaFensterSchliessen,
  useEpaFenster,
  type EpaBereich,
} from './fenster.js';
import { pfadKurz, protokollOeffnen, useAufrufe, useProtokollSichtbar } from './protokoll.js';
import { PatientSummaryAnsicht } from './PatientSummary.js';
import { PsMarke } from '../bausteine/PsMarke.js';
import {
  Kompaktkarte,
  Listenwerkzeug,
  useAufgeklappt,
  type Aufklappen,
  type Ordnung,
} from '../module/diagnosen/Splitscreen.js';
import { ordnungsangaben, useOrdnung } from '../module/diagnosen/ordnung.js';

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
  return <EpaDialog key={patient.id} patient={patient} bereich={fenster.bereich} />;
}

/** Abgerufene Dokumentinhalte, nach Dokumentkennung. Lebt nur, solange das Fenster offen ist. */
type Inhaltsspeicher = Record<string, { inhalt?: unknown; fehler?: string }>;

type Medikation = [Medikationsliste, Medikationsplan];

function EpaDialog({ patient, bereich }: { patient: Patient; bereich: EpaBereich }) {
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
  const mitSummary = summaryDienst.daten === true;
  const zugriff = !dokumente.fehler;
  // Ein Reiter, den das Aktensystem nicht (mehr) anbietet, fällt auf die Übersicht zurück.
  const ansicht: EpaBereich =
    (bereich === 'summary' && summaryDienst.daten === false) ||
    (bereich === 'listen' && dienst.daten === false)
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
  const summary = useEpaAbfrage(
    () => patientSummaryAbrufen(kvnr),
    [kvnr, einlesungen, betriebsstand],
    zugriff && mitSummary && (ueberblick || gebraucht.has('summary')),
  );
  const summaryInhalt = useMemo(() => patientSummaryLesen(summary.daten), [summary.daten]);
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
    const neu: Inhaltsspeicher = {};
    for (const v of offen) {
      try {
        neu[v.id] = { inhalt: await dokumentAbrufen(kvnr, v.ressource) };
      } catch (f) {
        neu[v.id] = { fehler: f instanceof EpaFehler ? f.diagnose : 'Abruf fehlgeschlagen' };
      }
    }
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
            (b) => !b.bedingung || (b.bedingung === 'listen' ? mitListen : mitSummary),
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
            ) : summary.laedt || !summaryInhalt ? (
              <Leer>Wird abgefragt …</Leer>
            ) : (
              <PatientSummaryAnsicht
                inhalt={summaryInhalt}
                roh={summary.daten}
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
            <DokumenteInEpa {...gemeinsam} kvnr={kvnr} laedt={dokumente.laedt} />
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

interface Dokumentzugang {
  patientId: string;
  verweise: Dokumentverweis[];
  lokalNachEpaId: Map<string, LokalesDokument>;
  inhalte: Inhaltsspeicher;
  abrufen: (v: Dokumentverweis[]) => Promise<Inhaltsspeicher>;
  uebernehmen: (v: Dokumentverweis) => Promise<void>;
}

/* ---------- Bausteine des Fensters ---------- */

function Zugriffsmarker({ laedt, fehler }: { laedt: boolean; fehler: Abfragefehler | null }) {
  if (laedt) return <Marker ton="neutral">wird abgefragt …</Marker>;
  if (fehler)
    return (
      <Marker ton="fehler">
        kein Zugriff ({fehler.status || '—'}
        {fehler.code ? ` ${fehler.code}` : ''})
      </Marker>
    );
  return <Marker ton="gut">Zugriff besteht</Marker>;
}

function Fehlerlage({
  fehler,
  neuLaden,
  patientId,
}: {
  fehler: Abfragefehler;
  neuLaden: () => void;
  patientId: string;
}) {
  const befugnisFehlt = ohneBefugnis(fehler);
  return (
    <div className={`hinweisbox ${befugnisFehlt ? 'warn' : 'fehler'}`}>
      <b>{fehlerTitel(fehler)}</b>
      <div className="leise-klein" style={{ margin: '4px 0 8px' }}>
        {fehler.text}
      </div>
      {befugnisFehlt ? (
        <EgkKnopf patientId={patientId} stark klein={false} />
      ) : (
        <button type="button" className="knopf klein" onClick={neuLaden}>
          erneut versuchen
        </button>
      )}
    </div>
  );
}

function LetzteAufrufe() {
  const aufrufe = useAufrufe().slice(0, 3);
  return (
    <footer className="epa-fenster-fuss">
      <span className="leise-klein">Letzte Aufrufe</span>
      {aufrufe.length === 0 ? (
        <span className="leise-klein">—</span>
      ) : (
        aufrufe.map((a) => (
          <span
            key={a.id}
            className={`epa-fuss-aufruf ${a.fehler ? 'fehler' : ''}`}
            title={a.grundlage}
          >
            <b>{a.status ?? '—'}</b> {a.methode} {pfadKurz(a.pfad)}
          </span>
        ))
      )}
      <button type="button" className="knopf klein rechts" onClick={protokollOeffnen}>
        Aufrufprotokoll öffnen
      </button>
    </footer>
  );
}

function Abschnitt({
  titel,
  werkzeuge,
  children,
}: {
  titel: string;
  werkzeuge?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="epa-abschnitt">
      <div className="reihe" style={{ marginBottom: 8 }}>
        <h3>{titel}</h3>
        {werkzeuge && <div className="rechts reihe">{werkzeuge}</div>}
      </div>
      {children}
    </section>
  );
}

function ZurKartei({
  patientId,
  ziel,
  children,
}: {
  patientId: string;
  ziel: string;
  children: ReactNode;
}) {
  const navigiere = useNavigate();
  return (
    <button
      type="button"
      className="knopf klein stark"
      onClick={() => {
        epaFensterSchliessen();
        navigiere(`/patient/${patientId}/${ziel}`);
      }}
    >
      {children}
    </button>
  );
}

/* ---------- Übersicht ---------- */

function Uebersicht({
  kvnr,
  patientId,
  verweise,
  laedt,
  lokalNachEpaId,
  medikation,
  listen,
  summaryAbschnitte,
}: {
  kvnr: string;
  patientId: string;
  verweise: Dokumentverweis[];
  laedt: boolean;
  lokalNachEpaId: Map<string, LokalesDokument>;
  medikation: Medikation | null;
  listen: EpaListen | null;
  summaryAbschnitte: { gefuellt: number; gesamt: number } | null;
}) {
  const befugnis = useBefugnis(patientId);
  const neu = verweise.filter((v) => !lokalNachEpaId.has(v.id)).length;
  const befunde = verweise.filter((v) => v.typ?.code === 'BEFU');
  const strukturiert = verweise.filter(istStrukturiert).length;
  const plan = medikation?.[1];
  const kachel = (ziel: EpaBereich, titel: string, zahl: ReactNode, text: string) => (
    <button type="button" className="epa-kachel" onClick={() => epaBereichWaehlen(ziel)}>
      <span className="epa-kachel-titel">{titel}</span>
      <span className="epa-kachel-zahl">{zahl}</span>
      <span className="leise-klein">{text}</span>
    </button>
  );
  return (
    <>
      <div className="epa-kacheln">
        {summaryAbschnitte &&
          kachel(
            'summary',
            'Patient Summary',
            `${summaryAbschnitte.gefuellt}/${summaryAbschnitte.gesamt}`,
            'Abschnitte mit Inhalt',
          )}
        {kachel(
          'dokumente',
          'Dokumente',
          laedt ? '…' : verweise.length,
          `${neu} neu für die Praxis`,
        )}
        {kachel(
          'medikation',
          'Medikationsplan',
          plan ? plan.eintraege.length : '…',
          plan?.stand ? `Stand ${deutscherZeitpunkt(plan.stand)}` : 'Einträge',
        )}
        {listen?.verfuegbar &&
          kachel(
            'listen',
            'Diagnosen · Allergien',
            `${listen.diagnosen.length} · ${listen.allergien.filter((a) => !istKeineBekannteAllergie(a.eintrag)).length}`,
            'Einträge',
          )}
        {kachel(
          'labor',
          'Laborbefunde',
          laedt ? '…' : befunde.length,
          befunde.some(istStrukturiert) ? 'strukturiert' : 'als PDF',
        )}
        {kachel(
          'inhalte',
          'Inhalte aus Dokumenten',
          laedt ? '…' : strukturiert,
          'strukturierte Dokumente',
        )}
      </div>

      <Abschnitt titel="Zugriff">
        <dl className="befund-kopf">
          <div>
            <dt>Akte</dt>
            <dd>
              <span className="code">x-insurantid: {kvnr}</span>
            </dd>
          </div>
          <div>
            <dt>Client</dt>
            <dd>
              <span className="code">x-useragent: {USER_AGENT}</span>
            </dd>
          </div>
          <div>
            <dt>Einrichtung</dt>
            <dd>
              {EINRICHTUNG.anzeige} · <span className="code">{EINRICHTUNG.telematikId}</span>
            </dd>
          </div>
          <div>
            <dt>Befugnis</dt>
            <dd>
              {befugnis
                ? `bis ${deutschesDatum(befugnis.gueltigBis.slice(0, 10))} (eGK eingelesen am ${deutschesDatum(befugnis.erteiltAm.slice(0, 10))})`
                : '—'}
            </dd>
          </div>
        </dl>
      </Abschnitt>
    </>
  );
}

/* ---------- Dokumente ---------- */

function DokumenteInEpa({
  kvnr,
  patientId,
  verweise,
  laedt,
  lokalNachEpaId,
  inhalte,
  abrufen,
  uebernehmen,
}: Dokumentzugang & { kvnr: string; laedt: boolean }) {
  const [ansicht, setzeAnsicht] = useState<string | null>(null);
  const [begriff, setzeBegriff] = useState('');
  const [treffer, setzeTreffer] = useState<Dokumentverweis[] | null>(null);
  const liste = treffer ?? verweise;
  const gezeigt = liste.find((v) => v.id === ansicht) ?? null;

  async function suchen() {
    const b = begriff.trim();
    if (!b) return setzeTreffer(null);
    try {
      setzeTreffer((await dokumenteSuchen(kvnr, b)).map(dokumentverweisLesen));
    } catch {
      setzeTreffer([]);
    }
  }

  return (
    <Abschnitt
      titel={
        treffer
          ? `Treffer (${treffer.length} von ${verweise.length})`
          : `Dokumente (${verweise.length})`
      }
      werkzeuge={
        <form
          className="reihe"
          role="search"
          onSubmit={(e) => {
            e.preventDefault();
            void suchen();
          }}
        >
          <input
            type="search"
            className="suchfeld"
            aria-label="Volltextsuche in der ePA"
            placeholder="Volltext"
            value={begriff}
            onChange={(e) => {
              setzeBegriff(e.target.value);
              if (!e.target.value) setzeTreffer(null);
            }}
          />
          <button type="submit" className="knopf klein">
            Suchen
          </button>
        </form>
      }
    >
      {laedt ? (
        <Leer>Wird abgefragt …</Leer>
      ) : liste.length === 0 ? (
        <Leer>{treffer ? 'Kein Treffer.' : 'Keine Dokumente.'}</Leer>
      ) : (
        <div className="tabelle-rahmen">
          <table className="liste">
            <thead>
              <tr>
                <th>Datum</th>
                <th>Dokument</th>
                <th>Klasse · Typ</th>
                <th>Format</th>
                <th>In der Praxis</th>
                <th>
                  <span className="nur-fuer-screenreader">Aktionen</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {liste.map((v) => {
                const lokal = lokalNachEpaId.get(v.id);
                return (
                  <tr key={v.id} className={ansicht === v.id ? 'hervorgehoben' : undefined}>
                    <td>{deutschesDatum(v.datum)}</td>
                    <td>
                      <b>{v.titel}</b>
                      <div className="leise-klein">{v.autor}</div>
                    </td>
                    <td>
                      <span className="code" title={v.klasse?.anzeige}>
                        {v.klasse?.code ?? '—'}
                      </span>{' '}
                      <span className="code" title={v.typ?.anzeige}>
                        {v.typ?.code ?? '—'}
                      </span>
                      <div className="leise-klein">{v.typ?.anzeige}</div>
                    </td>
                    <td>
                      {v.format ? (
                        <span className="code" title={v.format.code}>
                          {v.format.anzeige}
                        </span>
                      ) : (
                        <Marker ton="warn" titel="formatCode im Release 3.1.3 nicht registriert">
                          ohne formatCode
                        </Marker>
                      )}
                      <div className="leise-klein">{v.mimeType}</div>
                    </td>
                    <td>
                      {lokal ? (
                        <Marker ton="gut">vorhanden</Marker>
                      ) : (
                        <Marker ton="warn">neu</Marker>
                      )}
                    </td>
                    <td>
                      <div className="reihe" style={{ gap: 5 }}>
                        <button
                          type="button"
                          className="knopf klein"
                          onClick={() => {
                            setzeAnsicht(v.id);
                            void abrufen([v]);
                          }}
                        >
                          Ansehen
                        </button>
                        {!lokal && (
                          <button
                            type="button"
                            className="knopf klein stark"
                            onClick={() => void uebernehmen(v)}
                          >
                            Übernehmen
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {gezeigt && (
        <div className="epa-betrachter">
          <div className="reihe" style={{ marginBottom: 8 }}>
            <b>{gezeigt.titel}</b>
            <button type="button" className="knopf klein rechts" onClick={() => setzeAnsicht(null)}>
              Schließen
            </button>
          </div>
          {inhalte[gezeigt.id]?.fehler ? (
            <div className="hinweisbox fehler">{inhalte[gezeigt.id]?.fehler}</div>
          ) : inhalte[gezeigt.id] ? (
            <DokumentBetrachter
              inhalt={inhalte[gezeigt.id]?.inhalt}
              patientId={patientId}
              dokumentId={gezeigt.id}
              bestand="epa"
            />
          ) : (
            <Leer>Wird abgerufen …</Leer>
          )}
        </div>
      )}
    </Abschnitt>
  );
}

function artZuordnen(v: Dokumentverweis, inhalt: unknown): Dokumentart {
  if (!istDatei(inhalt)) {
    const art = dokumentinhaltLesen(inhalt).art;
    if (art === 'Laborbefund') return 'Laborbefund';
    if (art === 'Entlassbrief') return 'Entlassbrief';
  }
  if (v.typ?.code === 'BEFU') return 'Laborbefund';
  if (v.klasse?.code === 'BRI') return 'Arztbrief';
  if (v.klasse?.code === 'BEF') return 'Befundbericht';
  return 'Sonstiges';
}

/* ---------- Medikation ---------- */

/** Status eines Eintrags im eMP (EMPMedicationRequest) und einer Medikationsinformation. */
const STATUS: Record<string, string> = {
  active: 'aktiv',
  'on-hold': 'pausiert',
  completed: 'beendet',
  stopped: 'abgesetzt',
  'entered-in-error': 'fehlerhaft',
  intended: 'geplant',
  'not-taken': 'nicht eingenommen',
  unknown: 'unbekannt',
};

const EML_ART: Record<string, string> = {
  PRESCRIPTION: 'Verordnung',
  MANUAL: 'Nachtrag',
  EMP: 'Medikationsplan',
};

function kontextVon(r: Ressource): string {
  const e = (r.extension ?? []).find((x) => x.url.endsWith('/context'));
  return e?.valueCoding?.code ?? e?.valueCode ?? '';
}

function MedikationInEpa({
  patientId,
  laedt,
  fehler,
  daten,
  neuLaden,
}: {
  patientId: string;
  laedt: boolean;
  fehler: Abfragefehler | null;
  daten: Medikation | null;
  neuLaden: () => void;
}) {
  if (fehler) return <Fehlerlage fehler={fehler} neuLaden={neuLaden} patientId={patientId} />;
  if (laedt || !daten) return <Leer>Wird abgefragt …</Leer>;
  const [liste, plan] = daten;
  const medikamente = [...liste.einschluesse, ...plan.ressourcen].filter(
    (r) => r.resourceType === 'Medication',
  );
  const name = (r: Ressource) => {
    const m = medikamentZu(r, medikamente);
    return m ? textVon(m) : textVon(r);
  };
  const atc = (r: Ressource) => codeVon(medikamentZu(r, medikamente) ?? r, 'code', CODESYSTEM.atc);

  return (
    <>
      <Abschnitt
        titel="Medikationsplan"
        werkzeuge={
          <>
            <span className="leise-klein">
              {plan.stand ? `Stand ${deutscherZeitpunkt(plan.stand)}` : ''}
            </span>
            <ZurKartei patientId={patientId} ziel="medikation">
              Bearbeiten
            </ZurKartei>
          </>
        }
      >
        {plan.eintraege.length === 0 ? (
          <Leer>Keine Einträge.</Leer>
        ) : (
          <table className="liste">
            <thead>
              <tr>
                <th>Arzneimittel</th>
                <th>Dosierung</th>
                <th>Grund</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {plan.eintraege.map((e) => (
                <tr key={String(e.id)}>
                  <td>
                    <b>{name(e)}</b>
                    <div className="leise-klein">ATC {atc(e) ?? '—'}</div>
                  </td>
                  <td>
                    <span className="code">
                      {(e['dosageInstruction'] as { text?: string }[] | undefined)?.[0]?.text ??
                        '—'}
                    </span>
                  </td>
                  <td>{(e['reasonCode'] as { text?: string }[] | undefined)?.[0]?.text ?? '—'}</td>
                  <td>
                    <Marker ton="neutral">
                      {STATUS[String(e['status'])] ?? String(e['status'])}
                    </Marker>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Abschnitt>

      <Abschnitt titel={`Medikationsliste (${liste.eintraege.length})`}>
        {liste.eintraege.length === 0 ? (
          <Leer>Keine Einträge.</Leer>
        ) : (
          <table className="liste">
            <thead>
              <tr>
                <th>Datum</th>
                <th>Herkunft</th>
                <th>Arzneimittel</th>
                <th>Dosierung</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {liste.eintraege
                .slice()
                .sort((a, b) => datumVon(b).localeCompare(datumVon(a)))
                .map((e) => (
                  <tr key={String(e.id)}>
                    <td>{deutschesDatum(datumVon(e))}</td>
                    <td>
                      <Marker ton={kontextVon(e) === 'PRESCRIPTION' ? 'akzent' : 'neutral'}>
                        {EML_ART[kontextVon(e)] ?? (kontextVon(e) || '—')}
                      </Marker>
                    </td>
                    <td>{name(e)}</td>
                    <td>
                      <span className="code">
                        {(e['dosage'] as { text?: string }[] | undefined)?.[0]?.text ?? '—'}
                      </span>
                    </td>
                    <td>{STATUS[String(e['status'])] ?? String(e['status'])}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        )}
      </Abschnitt>
    </>
  );
}

/* ---------- Diagnosen und Allergien (✦ Vorschlag Diagnose-Service) ---------- */

function ListenInEpa({
  patientId,
  laedt,
  fehler,
  daten,
  neuLaden,
}: {
  patientId: string;
  laedt: boolean;
  fehler: Abfragefehler | null;
  daten: EpaListen | null;
  neuLaden: () => void;
}) {
  const ordnungAllergien = useOrdnung(patientId, 'AllergyIntolerance');
  const ordnungDiagnosen = useOrdnung(patientId, 'Condition');
  if (fehler) return <Fehlerlage fehler={fehler} neuLaden={neuLaden} patientId={patientId} />;
  if (laedt || !daten) return <Leer>Wird abgefragt …</Leer>;
  const keineBekannte = daten.allergien.find(
    (e) => istKeineBekannteAllergie(e.eintrag) && e.eintrag.gewissheit === 'bestätigt',
  );
  const allergien = daten.allergien.filter((e) => !istKeineBekannteAllergie(e.eintrag));
  return (
    <>
      <Abschnitt
        titel={`Allergienliste (${allergien.length})`}
        werkzeuge={
          <ZurKartei patientId={patientId} ziel="diagnosen">
            Abgleichen
          </ZurKartei>
        }
      >
        {keineBekannte && (
          <div className="hinweisbox gut">
            Keine bekannten Allergien · {keineBekannte.chronik.angelegtVon},{' '}
            {deutschesDatum(keineBekannte.chronik.angelegtAm.slice(0, 10))}
          </div>
        )}
        {allergien.length === 0 ? (
          !keineBekannte && <Leer>Keine Einträge.</Leer>
        ) : (
          <Listenposten eintraege={allergien} ordnung={ordnungAllergien} />
        )}
      </Abschnitt>

      <Abschnitt titel={`Diagnosenliste (${daten.diagnosen.length})`}>
        {daten.diagnosen.length === 0 ? (
          <Leer>Keine Einträge.</Leer>
        ) : (
          <Listenposten eintraege={daten.diagnosen} ordnung={ordnungDiagnosen} />
        )}
      </Abschnitt>
    </>
  );
}

type Posten = Listeneintrag<Diagnose> | Listeneintrag<Allergie>;

/** Lesesicht einer Liste: kompakte Zeilen, aufklappbar, in der Ordnung der Praxis (ADR 0029). */
function Listenposten({ eintraege, ordnung }: { eintraege: readonly Posten[]; ordnung: Ordnung }) {
  const aufgeklappt = useAufgeklappt();
  const angaben = (p: Posten) => {
    const e = p.eintrag;
    return 'substanz' in e
      ? ordnungsangaben(null, e, p.chronik, e.beginn ?? '', e.substanz)
      : ordnungsangaben(null, e, p.chronik, e.beginn, e.bezeichnung);
  };
  const geordnet = ordnen(eintraege, angaben, ordnung.sortierung, ordnung.reihenfolge);
  const schluessel = geordnet.map((p) => p.eintrag.id);
  const alleOffen = aufgeklappt.alleOffen(schluessel);
  return (
    <>
      <Listenwerkzeug
        ordnung={ordnung}
        alleOffen={alleOffen}
        leer={geordnet.length === 0}
        alleUmschalten={() => aufgeklappt.alle(schluessel, !alleOffen)}
      />
      {geordnet.map((p) => (
        <Listenzeile key={p.eintrag.id} eintrag={p} aufklappen={aufgeklappt.offen(p.eintrag.id)} />
      ))}
    </>
  );
}

function Listenzeile({ eintrag, aufklappen }: { eintrag: Posten; aufklappen: Aufklappen }) {
  const { chronik } = eintrag;
  const e = eintrag.eintrag;
  const allergie = 'substanz' in e ? e : null;
  const diagnose = 'substanz' in e ? null : e;
  const berichtigt = allergie
    ? allergie.gewissheit === 'irrtümlich'
    : diagnose?.diagnosesicherheit === 'irrtümlich';
  const eingestellt = chronik.angelegtAm ? deutschesDatum(chronik.angelegtAm.slice(0, 10)) : '—';
  return (
    <div className="akten-eintrag kompakt-eintrag">
      <Kompaktkarte
        titel={allergie ? allergie.substanz : (diagnose?.bezeichnung ?? '')}
        aufklappen={aufklappen}
        markiert={eintrag.psRelevant && !berichtigt}
        berichtigt={berichtigt}
        rechts={eintrag.psRelevant && !berichtigt ? <PsMarke kompakt /> : undefined}
        zeile={
          <>
            {diagnose?.code && (
              <span className="code">
                {diagnose.code} {diagnose.zusatzkennzeichen}
              </span>
            )}
            {berichtigt ? (
              <Marker ton="fehler">fehlerhaft</Marker>
            ) : allergie ? (
              <>
                <Marker ton={allergie.gewissheit === 'bestätigt' ? 'gut' : 'warn'}>
                  {GEWISSHEIT_BEZEICHNUNG[allergie.gewissheit]}
                </Marker>
                <span>{allergie.kritikalitaet}</span>
              </>
            ) : (
              diagnose && (
                <span>
                  {DIAGNOSEART_BEZEICHNUNG[diagnose.art]} ·{' '}
                  {KLINISCHER_STATUS_BEZEICHNUNG[diagnose.klinischerStatus]}
                </span>
              )
            )}
            <span title="Eingestellt">· {eingestellt}</span>
          </>
        }
        details={
          <>
            <div className="herkunft">
              {eingestellt} –{' '}
              {chronik.quelldokument ? (
                <>
                  aus <b>{chronik.quelldokument.anzeige}</b>
                </>
              ) : (
                <b>{chronik.angelegtVon}</b>
              )}
              {chronik.erstelltDurch && <> · {chronik.erstelltDurch}</>}
              {chronik.aenderungen > 0 &&
                ` · geändert ${deutscherZeitpunkt(chronik.zuletztAm)}, ${chronik.zuletztVon}`}
            </div>
            <div className="codezeile">
              {diagnose?.code && (
                <span className="code">
                  ICD-10-GM {diagnose.code} {diagnose.zusatzkennzeichen}
                </span>
              )}
              {e.snomed && <span className="code snomed">SNOMED CT {e.snomed.code}</span>}
              {allergie && (
                <span className="leise-klein">
                  {ALLERGIESTATUS_BEZEICHNUNG[allergie.klinischerStatus]}
                </span>
              )}
            </div>
            {allergie && allergie.reaktionen.length > 0 && (
              <div className="leise-klein">Reaktion: {reaktionenAlsText(allergie.reaktionen)}</div>
            )}
          </>
        }
      />
    </div>
  );
}

/* ---------- Laborbefunde ---------- */

function LaborbefundeInEpa({
  patientId,
  verweise,
  lokalNachEpaId,
  inhalte,
  abrufen,
  uebernehmen,
  laeuft,
}: Dokumentzugang & { laeuft: boolean }) {
  // Ergebnisse der Diagnostik — im Release als PDF, in der Weiterentwicklung strukturiert (dgLP).
  const kandidaten = verweise.filter((v) => v.typ?.code === 'BEFU');
  const [offen, setzeOffen] = useState<string | null>(null);

  useEffect(() => {
    void abrufen(kandidaten.filter(istStrukturiert));
    // Nur beim Öffnen und wenn neue Kandidaten hinzukommen.
  }, [kandidaten.map((k) => k.id).join('|')]);

  return (
    <Abschnitt titel={`Laborbefunde (${kandidaten.length})`}>
      {kandidaten.length === 0 ? (
        <Leer>Keine Laborbefunde.</Leer>
      ) : (
        kandidaten.map((v) => {
          const lokal = lokalNachEpaId.has(v.id);
          const inhalt = inhalte[v.id]?.inhalt;
          const befund = istStrukturiert(v)
            ? laborbefundLesen(inhalt, patientId, { bestand: 'epa', dokumentId: v.id })
            : null;
          return (
            <div key={v.id} className="epa-betrachter">
              <div className="reihe" style={{ marginBottom: 8 }}>
                <b>{v.titel}</b>
                <span className="leise-klein">
                  {deutschesDatum(v.datum)} · {v.autor}
                </span>
                <Marker ton={istStrukturiert(v) ? 'akzent' : 'neutral'}>
                  {istStrukturiert(v) ? 'FHIR' : 'PDF'}
                </Marker>
                <div className="rechts reihe" style={{ gap: 5 }}>
                  {!istStrukturiert(v) && (
                    <button
                      type="button"
                      className="knopf klein"
                      aria-expanded={offen === v.id}
                      onClick={() => {
                        setzeOffen(offen === v.id ? null : v.id);
                        void abrufen([v]);
                      }}
                    >
                      {offen === v.id ? 'Schließen' : 'Ansehen'}
                    </button>
                  )}
                  {lokal ? (
                    <Marker ton="gut">in der Praxis</Marker>
                  ) : (
                    <button
                      type="button"
                      className="knopf klein stark"
                      onClick={() => void uebernehmen(v)}
                    >
                      Übernehmen
                    </button>
                  )}
                </div>
              </div>
              {befund ? (
                <Befundansicht befund={befund} kompakt />
              ) : istStrukturiert(v) || offen === v.id ? (
                inhalt !== undefined ? (
                  <DokumentBetrachter
                    inhalt={inhalt}
                    patientId={patientId}
                    dokumentId={v.id}
                    bestand="epa"
                  />
                ) : inhalte[v.id]?.fehler ? (
                  <div className="hinweisbox fehler">{inhalte[v.id]?.fehler}</div>
                ) : (
                  <Leer>{laeuft ? 'Wird abgerufen …' : '—'}</Leer>
                )
              ) : null}
            </div>
          );
        })
      )}
    </Abschnitt>
  );
}

/* ---------- Inhalte aus Dokumenten ---------- */

interface Eintrag {
  ressource: Ressource;
  quelle: string;
}

/**
 * Das Release kennt keine Einzelabfrage von Diagnosen, Allergien oder Laborwerten: Das
 * Praxissystem ruft jedes strukturierte Dokument ab (ITI-68) und zerlegt es selbst.
 */
function InhalteAusDokumenten({
  patientId,
  verweise,
  inhalte,
  abrufen,
  laeuft,
}: Dokumentzugang & { laeuft: boolean }) {
  const strukturiert = verweise.filter(istStrukturiert);
  const lokaleDiagnosen = useAuswahl(
    (z) => z.diagnosen.filter((d) => d.patientId === patientId),
    [patientId],
  );
  const lokaleAllergien = useAuswahl(
    (z) => z.allergien.filter((a) => a.patientId === patientId),
    [patientId],
  );

  useEffect(() => {
    void abrufen(strukturiert);
  }, [strukturiert.map((s) => s.id).join('|')]);

  const daten = useMemo(() => {
    const ergebnis = {
      diagnosen: [] as Eintrag[],
      allergien: [] as Eintrag[],
      werte: [] as Eintrag[],
      prozeduren: [] as Eintrag[],
      implantate: [] as Eintrag[],
    };
    for (const v of strukturiert) {
      const inhalt = inhalte[v.id]?.inhalt;
      if (!inhalt || istDatei(inhalt)) continue;
      const s = dokumentinhaltLesen(inhalt);
      const quelle = `${v.titel}, ${v.autor.split(', ').slice(1).join(', ') || v.autor}`;
      ergebnis.diagnosen.push(...s.diagnosen.map((r) => ({ ressource: r, quelle })));
      ergebnis.allergien.push(...s.allergien.map((r) => ({ ressource: r, quelle })));
      ergebnis.werte.push(
        ...s.beobachtungen.filter((r) => r['valueQuantity']).map((r) => ({ ressource: r, quelle })),
      );
      ergebnis.prozeduren.push(...s.prozeduren.map((r) => ({ ressource: r, quelle })));
      // Ein Implantat steht als DeviceUseStatement; Bezeichnung und Code trägt das Device.
      const alle = ((inhalt as { entry?: { resource: Ressource }[] }).entry ?? []).map(
        (e) => e.resource,
      );
      ergebnis.implantate.push(
        ...s.implantate.map((r) => {
          const geraet = alle.find(
            (x) =>
              x.resourceType === 'Device' &&
              `Device/${String(x.id)}` === (r['device'] as { reference?: string })?.reference,
          );
          return { ressource: { ...r, code: geraet?.['type'] }, quelle };
        }),
      );
    }
    return ergebnis;
  }, [inhalte, strukturiert]);

  const lokaleIcd = new Set(lokaleDiagnosen.map((d) => d.code));
  const lokaleSnomed = new Set([
    ...lokaleDiagnosen.map((d) => d.snomed?.code),
    ...lokaleAllergien.map((a) => a.snomed?.code),
  ]);

  if (laeuft) return <Leer>Wird abgerufen …</Leer>;
  return (
    <>
      <Eintragsliste
        titel="Diagnosen"
        eintraege={daten.diagnosen}
        lokal={(r) =>
          lokaleIcd.has(codeVon(r, 'code', CODESYSTEM.icd10gm) ?? '') ||
          lokaleSnomed.has(codeVon(r, 'code', CODESYSTEM.snomed) ?? '')
        }
      />
      <Eintragsliste
        titel="Allergien und Unverträglichkeiten"
        eintraege={daten.allergien}
        lokal={(r) => lokaleSnomed.has(codeVon(r, 'code', CODESYSTEM.snomed) ?? '')}
      />
      <Eintragsliste titel="Laborwerte" eintraege={daten.werte} />
      <Eintragsliste titel="Prozeduren" eintraege={daten.prozeduren} />
      <Eintragsliste titel="Implantate" eintraege={daten.implantate} />
    </>
  );
}

function Eintragsliste({
  titel,
  eintraege,
  lokal,
}: {
  titel: string;
  eintraege: Eintrag[];
  lokal?: (r: Ressource) => boolean;
}) {
  const [offen, setzeOffen] = useState<string | null>(null);
  return (
    <Abschnitt titel={`${titel} (${eintraege.length})`}>
      {eintraege.length === 0 ? (
        <Leer>Keine Einträge.</Leer>
      ) : (
        eintraege.map(({ ressource: r, quelle }) => {
          const id = `${r.resourceType}-${String(r.id)}`;
          const menge = r['valueQuantity'] as { value?: number; unit?: string } | undefined;
          return (
            <div key={id} className="akten-eintrag">
              <div className="herkunft">
                {deutschesDatum(datumVon(r))} — aus <b>{quelle}</b>
              </div>
              <div className="reihe">
                <b>{textVon(r)}</b>
                {(
                  r['code'] as { coding?: { system?: string; code?: string }[] } | undefined
                )?.coding?.map((k) => (
                  <span key={`${k.system}-${k.code}`} className="code" title={k.system}>
                    {kurzSystem(k.system)} {k.code}
                  </span>
                ))}
                {menge?.value !== undefined && (
                  <span className="code">
                    {String(menge.value).replace('.', ',')} {menge.unit}
                  </span>
                )}
                {lokal?.(r) && <Marker ton="lokal">auch in der Praxis</Marker>}
                <button
                  type="button"
                  className="knopf klein rechts"
                  aria-expanded={offen === id}
                  onClick={() => setzeOffen(offen === id ? null : id)}
                >
                  FHIR
                </button>
              </div>
              {offen === id && <pre className="code-block">{JSON.stringify(r, null, 2)}</pre>}
            </div>
          );
        })
      )}
    </Abschnitt>
  );
}

function kurzSystem(system: string | undefined): string {
  if (system === CODESYSTEM.icd10gm) return 'ICD-10-GM';
  if (system === CODESYSTEM.snomed) return 'SNOMED CT';
  if (system === CODESYSTEM.atc) return 'ATC';
  if (system === CODESYSTEM.loinc) return 'LOINC';
  if (system === CODESYSTEM.ops) return 'OPS';
  return system ?? '';
}
