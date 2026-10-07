/**
 * ✦ VORSCHLAG — Die Sicht der Versicherten und ihrer Angehörigen.
 *
 * Kein Teil des Praxissystems: Was hier zu sehen ist, liefe im Frontend des Versicherten
 * (FdV) — der App der Krankenkasse. Die Demo zeigt es im selben Fenster, weil der Entwurf
 * nur nebeneinander verständlich wird: derselbe Dienst, dieselben Quellen, andere Sprache.
 *
 * Aufbau wie ein FdV: Die Akte besteht aus **Bereichen**, und der Einstieg ist die
 * Dokumentenliste — das, was eine versicherte Person heute vorfindet. Der ✦ Aktenlotse ist
 * **ein Bereich unter anderen**, erkennbar als neu. Er tritt nicht an die Stelle der Akte,
 * er führt hinein: Jede Quellenangabe seiner Antworten öffnet das Dokument im Bereich
 * „Dokumente".
 *
 * Drei Zustände der Berechtigung sind umschaltbar. Sie sind der Kern des Entwurfs: Der Lotse
 * hat **keine eigenen Rechte**. Ohne Vertretung sieht er die Akte nicht — und die
 * Dokumentenliste bleibt genauso leer.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  VORSCHLAGSFRAGEN,
  type Lotsenantwort,
  type Quellenangabe,
  type Quellentext,
  type Ressource,
} from '@demo-pvs/kern';
import { useZustand } from '../speicher/speicher.js';
import {
  EpaFehler,
  dokumentAbrufen,
  dokumenteSuchen,
  lotseBeschriftung,
  lotseFragen,
  lotseQuelle,
  type Beschriftungsbefund,
} from '../epa/klient.js';
import {
  dokumentverweisLesen,
  fehlerTitel,
  useBetriebsstand,
  type Dokumentverweis,
} from '../epa/epa-bestand.js';
import { DokumentBetrachter } from '../bausteine/DokumentBetrachter.js';
import {
  Absaetze,
  Begriffe,
  belegzeilen,
  Fragefeld,
  Antworthinweis,
  Textquelle,
  Umfangsangabe,
  Vorlesen,
  antwortAlsText,
  tag,
} from './bausteine.js';
import { useLotseVorhanden } from './vorhanden.js';
import {
  BEHANDELNDE_PRAXIS,
  Fragenliste,
  Rueckfrage,
  neueFrageId,
  type Anliegen,
  type Bezug,
  type Frageeintrag,
} from './Rueckfrage.js';

/** Wer gerade in die Akte sieht. */
type Rolle = 'versicherte' | 'vertretung' | 'ohne-vertretung';

const ROLLEN: { id: Rolle; name: string; zusatz: string; befugt: boolean }[] = [
  { id: 'versicherte', name: 'Renate Hoffmann', zusatz: 'eigene Akte', befugt: true },
  { id: 'vertretung', name: 'Sabine Hoffmann', zusatz: 'Tochter · Vertretung', befugt: true },
  { id: 'ohne-vertretung', name: 'Sabine Hoffmann', zusatz: 'Vertretung entzogen', befugt: false },
];

type Bereich = 'dokumente' | 'lotse' | 'fragen';

/** Eine offene Rückfrage: zu welcher Unterlage, mit welchem Anliegen. */
type OffeneRueckfrage = { bezug: Bezug | null; vorgabe?: { anliegen: Anliegen; frage?: string } };

export function Versichertensicht() {
  const patienten = useZustand((z) => z.patienten);
  // Die Demo führt die Versichertensicht für die Patientin mit dem größten Aktenbestand.
  const person = useMemo(
    () => patienten.find((p) => p.nachname === 'Hoffmann') ?? patienten[0],
    [patienten],
  );
  const kvnr = person?.versicherung.kvnr ?? '';

  const [rolle, setzeRolle] = useState<Rolle>('versicherte');
  const [bereich, setzeBereich] = useState<Bereich>('dokumente');
  const [fehler, setzeFehler] = useState<string | null>(null);
  /** Die ePA hat den Zugang zur ganzen Akte abgelehnt — etwa weil sie gesperrt ist. */
  const [aktenfehler, setzeAktenfehler] = useState<string | null>(null);
  /** ✦ Gesammelte Fragen und die gerade offene Rückfrage. */
  const [fragen, setzeFragen] = useState<Frageeintrag[]>([]);
  const [rueckfrage, setzeRueckfrage] = useState<OffeneRueckfrage | null>(null);
  /** Eine Quelle ohne Datei — etwa der Medikationsplan —, geöffnet aus einer Antwort. */
  const [offeneQuelle, setzeOffeneQuelle] = useState<{
    quelle: Quellentext;
    markieren: string[];
  } | null>(null);
  /** ✦ Was laut Inhalt in unklar beschrifteten Dokumenten steht, nach Dokumentkennung. */
  const [beschriftung, setzeBeschriftung] = useState<Map<string, Beschriftungsbefund>>(new Map());

  const [verweise, setzeVerweise] = useState<Dokumentverweis[] | null>(null);
  const [offenesDokument, setzeOffenesDokument] = useState<Dokumentverweis | null>(null);
  const [inhalt, setzeInhalt] = useState<unknown>(null);
  /** Stellen, die im geöffneten Dokument markiert sind — aus der Antwort des Lotsen. */
  const [markieren, setzeMarkieren] = useState<string[]>([]);

  const lotseDa = useLotseVorhanden() === true;
  const befugt = ROLLEN.find((r) => r.id === rolle)?.befugt ?? false;
  // Stellt die Demo-Steuerung den Ausbaustand um, ändert sich der Bestand der Akte.
  const betriebsstand = useBetriebsstand();

  const von =
    rolle === 'vertretung'
      ? 'Sabine Hoffmann (Vertretung)'
      : `${person?.vorname ?? ''} ${person?.nachname ?? ''}`.trim();

  useEffect(() => {
    if (!kvnr || !befugt || !lotseDa) {
      setzeBeschriftung(new Map());
      return;
    }
    let abgebrochen = false;
    void lotseBeschriftung(kvnr, kvnr)
      .then((liste) => {
        if (!abgebrochen) setzeBeschriftung(new Map(liste.map((b) => [b.quelleId, b])));
      })
      .catch(() => {
        if (!abgebrochen) setzeBeschriftung(new Map());
      });
    return () => {
      abgebrochen = true;
    };
  }, [kvnr, befugt, lotseDa, betriebsstand]);

  // Fragen gehören der Person, die sie gestellt hat — beim Rollenwechsel verfallen sie.
  useEffect(() => {
    setzeFragen([]);
    setzeRueckfrage(null);
  }, [rolle]);

  const notieren = (e: Frageeintrag) => setzeFragen((alt) => [...alt, e]);

  /* ---------- Dokumente ---------- */

  useEffect(() => {
    if (!kvnr || !befugt) {
      setzeVerweise(null);
      return;
    }
    let abgebrochen = false;
    setzeAktenfehler(null);
    void dokumenteSuchen(kvnr, undefined, kvnr)
      .then((r: Ressource[]) => {
        if (!abgebrochen) setzeVerweise(r.map(dokumentverweisLesen));
      })
      .catch((f: unknown) => {
        if (abgebrochen) return;
        // Keine stille Null und kein „Keine Dokumente": Eine gesperrte Akte ist nicht leer. Sie
        // heißt hier dasselbe wie im Praxissystem, und Dokumente wie Lotse treten zurück.
        setzeVerweise(null);
        setzeAktenfehler(
          f instanceof EpaFehler ? fehlerTitel(f) : 'Die ePA hat nicht geantwortet.',
        );
      });
    return () => {
      abgebrochen = true;
    };
  }, [kvnr, befugt, betriebsstand]);

  const dokumentOeffnen = useCallback(
    async (verweis: Dokumentverweis, stellen: string[] = []) => {
      setzeMarkieren(stellen);
      setzeOffenesDokument(verweis);
      setzeInhalt(null);
      setzeBereich('dokumente');
      try {
        setzeInhalt(await dokumentAbrufen(kvnr, verweis.ressource, kvnr));
      } catch {
        setzeFehler('Dieses Dokument lässt sich nicht öffnen.');
      }
    },
    [kvnr],
  );

  /**
   * Die Quellenangabe einer Antwort führt ins Dokument — im Bereich „Dokumente", nicht in ein
   * eigenes Fenster — und markiert dort die Stellen, auf denen die Antwort beruht.
   */
  const zurQuelle = useCallback(
    (q: Quellenangabe, stellen: string[]) => {
      const verweis = verweise?.find((v) => v.id === q.quelleId);
      if (verweis) {
        void dokumentOeffnen(verweis, stellen);
        return;
      }
      // Kein Dokument — etwa der Medikationsplan. Der Verweis führt trotzdem hin: zu den Zeilen,
      // die der Lotse gelesen hat, die belegenden markiert.
      void lotseQuelle(kvnr, q.quelleId, kvnr)
        .then((quelle) => setzeOffeneQuelle({ quelle, markieren: stellen }))
        .catch(() => setzeFehler('Diese Angabe lässt sich nicht öffnen.'));
    },
    [verweise, dokumentOeffnen, kvnr],
  );

  // Beim Rollenwechsel verfällt alles: Es gehört zu den Rechten, unter denen es entstand. Nach
  // einer Umstellung der Demo-Steuerung ebenso — das geöffnete Dokument gibt es vielleicht
  // nicht mehr in dieser Fassung.
  useEffect(() => {
    setzeOffenesDokument(null);
    setzeInhalt(null);
    setzeMarkieren([]);
    setzeOffeneQuelle(null);
  }, [rolle, betriebsstand]);

  /** Ein Bereichswechsel schließt, was darüber geöffnet war. */
  const waehle = (b: Bereich) => {
    setzeRueckfrage(null);
    setzeOffeneQuelle(null);
    setzeBereich(b);
  };
  useEffect(() => {
    setzeFehler(null);
  }, [rolle]);

  if (!person) return <div className="karte">Kein Beispielfall vorhanden.</div>;

  return (
    <div className="versichertensicht">
      <div className="telefon">
        <header className="telefon-kopf">
          <div className="telefon-marke">
            <span className="punkt" aria-hidden="true" />
            Meine ePA
            <span className="fiktiv">fiktive App</span>
          </div>
          <label className="nur-fuer-screenreader" htmlFor="rollenwahl-versicherte">
            Wer sieht die Akte
          </label>
          <select
            id="rollenwahl-versicherte"
            className="telefon-rollenwahl"
            value={rolle}
            onChange={(e) => setzeRolle(e.target.value as Rolle)}
          >
            {ROLLEN.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name} — {r.zusatz}
              </option>
            ))}
          </select>
        </header>

        <div className="telefon-akte">
          <span className="telefon-name">
            {person.vorname} {person.nachname}
          </span>
          <span className="telefon-geb">geboren {tag(person.geburtsdatum)}</span>
        </div>

        <nav className="telefon-bereiche" aria-label="Bereiche der Akte">
          <button
            type="button"
            className={bereich === 'dokumente' ? 'aktiv' : ''}
            aria-pressed={bereich === 'dokumente'}
            onClick={() => waehle('dokumente')}
          >
            Dokumente
            {verweise && <span className="telefon-zahl">{verweise.length}</span>}
          </button>
          {lotseDa && (
            <button
              type="button"
              className={bereich === 'lotse' ? 'aktiv' : ''}
              aria-pressed={bereich === 'lotse'}
              onClick={() => waehle('lotse')}
            >
              Aktenlotse
              <span className="telefon-neu">neu</span>
            </button>
          )}
          {lotseDa && (
            <button
              type="button"
              className={bereich === 'fragen' ? 'aktiv' : ''}
              aria-pressed={bereich === 'fragen'}
              onClick={() => waehle('fragen')}
            >
              Meine Fragen
              {fragen.length > 0 && <span className="telefon-zahl">{fragen.length}</span>}
            </button>
          )}
        </nav>

        <div className="telefon-inhalt">
          {!befugt ? (
            <div className="lotse-ohne-rechte">
              <span className="marker">ohne Vertretung</span>
              <p className="lotse-zeile">Keine Akte · keine Dokumente · keine Antwort</p>
            </div>
          ) : aktenfehler ? (
            <p className="lotse-fehler">{aktenfehler}</p>
          ) : (
            <>
              {rueckfrage ? (
                <Rueckfrage
                  bezug={rueckfrage.bezug}
                  vorgabe={rueckfrage.vorgabe}
                  von={von}
                  notieren={notieren}
                  schliessen={() => setzeRueckfrage(null)}
                />
              ) : offeneQuelle ? (
                <div className="telefon-dokument">
                  <div className="telefon-dokument-kopf">
                    <strong>{offeneQuelle.quelle.titel}</strong>
                    <button
                      type="button"
                      className="knopf klein"
                      onClick={() => setzeOffeneQuelle(null)}
                    >
                      Zurück
                    </button>
                  </div>
                  <span className="herkunft">
                    {offeneQuelle.quelle.einrichtung} · Stand {tag(offeneQuelle.quelle.datum)}
                  </span>
                  <Textquelle
                    zeilen={offeneQuelle.quelle.zeilen}
                    markieren={offeneQuelle.markieren}
                  />
                </div>
              ) : null}
              {/* Darunter bleibt alles stehen, nur verdeckt: „Zurück" führt zur selben Antwort. */}
              <div hidden={!!rueckfrage || !!offeneQuelle}>
                {bereich === 'fragen' && (
                  <Fragenliste
                    fragen={fragen}
                    entfernen={(id) => setzeFragen((alt) => alt.filter((f) => f.id !== id))}
                  />
                )}
                {bereich === 'dokumente' && (
                  <Dokumentenbereich
                    beschriftung={beschriftung}
                    nachfragen={
                      lotseDa
                        ? (v) =>
                            setzeRueckfrage({
                              // Bei unklarer Beschriftung trägt der Zeiger auch, was laut Inhalt
                              // darin steht — sonst weiß auch die Einrichtung nicht, welches gemeint ist.
                              bezug: {
                                titel: beschriftung.get(v.id)?.lautInhalt
                                  ? `${v.titel} (laut Inhalt: ${beschriftung.get(v.id)!.lautInhalt})`
                                  : v.titel,
                                datum: v.datum,
                                einrichtung: v.einrichtung,
                              },
                            })
                        : undefined
                    }
                    verweise={verweise}
                    offenes={offenesDokument}
                    inhalt={inhalt}
                    markieren={markieren}
                    patientId={person.id}
                    oeffnen={(v) => void dokumentOeffnen(v)}
                    schliessen={() => {
                      setzeOffenesDokument(null);
                      setzeInhalt(null);
                      setzeMarkieren([]);
                    }}
                  />
                )}
                {lotseDa && (
                  <div hidden={bereich !== 'lotse'}>
                    // Neu aufgebaut nach jeder Umstellung: Eine alte Antwort beruht auf altem
                    Stand.
                    <Lotsenbereich
                      key={betriebsstand}
                      kvnr={kvnr}
                      zurQuelle={zurQuelle}
                      anPraxis={(frage) =>
                        setzeRueckfrage({ bezug: null, vorgabe: { anliegen: 'bedeutung', frage } })
                      }
                      notieren={(frage) =>
                        notieren({
                          id: neueFrageId(),
                          frage,
                          bezug: null,
                          adressat: BEHANDELNDE_PRAXIS,
                          von,
                          zustand: 'notiert',
                        })
                      }
                    />
                  </div>
                )}
              </div>
            </>
          )}
          {fehler && <p className="lotse-fehler">{fehler}</p>}
        </div>
      </div>
    </div>
  );
}

/* ---------- Bereich „Dokumente" ---------- */

function Dokumentenbereich({
  beschriftung,
  nachfragen,
  verweise,
  offenes,
  inhalt,
  markieren,
  patientId,
  oeffnen,
  schliessen,
}: {
  beschriftung: Map<string, Beschriftungsbefund>;
  /** ✦ Rückfrage zu einem Dokument; fehlt ohne Aktenlotsen. */
  nachfragen?: (v: Dokumentverweis) => void;
  verweise: Dokumentverweis[] | null;
  offenes: Dokumentverweis | null;
  inhalt: unknown;
  markieren: string[];
  patientId: string;
  oeffnen: (v: Dokumentverweis) => void;
  schliessen: () => void;
}) {
  if (!verweise) return <p className="leer">Wird geladen …</p>;
  if (verweise.length === 0) return <p className="leer">Keine Dokumente in der Akte.</p>;

  if (offenes) {
    return (
      <div className="telefon-dokument">
        <div className="telefon-dokument-kopf">
          <strong>{offenes.titel}</strong>
          <div className="reihe">
            {nachfragen && (
              <button type="button" className="knopf klein" onClick={() => nachfragen(offenes)}>
                Nachfragen
              </button>
            )}
            <button type="button" className="knopf klein" onClick={schliessen}>
              Zurück
            </button>
          </div>
        </div>
        {beschriftung.get(offenes.id)?.lautInhalt && (
          <span className="telefon-dok-inhalt">
            ✦ laut Inhalt: {beschriftung.get(offenes.id)!.lautInhalt}
          </span>
        )}
        <span className="herkunft">
          {offenes.autor} · {tag(offenes.datum)}
          {offenes.typ ? ` · ${offenes.typ.anzeige}` : ''}
        </span>
        {inhalt === null ? (
          <p className="leer">Wird abgerufen …</p>
        ) : (
          <DokumentBetrachter
            inhalt={inhalt}
            patientId={patientId}
            dokumentId={offenes.id}
            bestand="epa"
            markieren={markieren}
            anfang="pdf"
          />
        )}
      </div>
    );
  }

  return (
    <ul className="telefon-dokumentliste">
      {[...verweise]
        .sort((a, b) => b.datum.localeCompare(a.datum))
        .map((v) => (
          <li key={v.id}>
            <button type="button" onClick={() => oeffnen(v)}>
              <span className="telefon-dok-titel">{v.titel}</span>
              {beschriftung.get(v.id)?.lautInhalt && (
                <span className="telefon-dok-inhalt">
                  ✦ laut Inhalt: {beschriftung.get(v.id)!.lautInhalt}
                </span>
              )}
              <span className="telefon-dok-zeile">
                {v.autor} · {tag(v.datum)}
              </span>
            </button>
          </li>
        ))}
    </ul>
  );
}

/* ---------- Bereich „Aktenlotse" ---------- */

function Lotsenbereich({
  kvnr,
  zurQuelle,
  anPraxis,
  notieren,
}: {
  kvnr: string;
  zurQuelle: (q: Quellenangabe, stellen: string[]) => void;
  /** ✦ Nach einer Ablehnung: die Frage an die behandelnde Praxis. */
  anPraxis: (frage: string) => void;
  notieren: (frage: string) => void;
}) {
  const [notiert, setzeNotiert] = useState(false);
  const [antwort, setzeAntwort] = useState<Lotsenantwort | null>(null);
  const [laeuft, setzeLaeuft] = useState(false);
  const [fehler, setzeFehler] = useState<string | null>(null);

  async function fragen(frage: string) {
    if (!kvnr) return;
    setzeLaeuft(true);
    setzeFehler(null);
    setzeNotiert(false);
    try {
      // Der Zugang ist der der versicherten Person, nicht der der Praxis. Die Antwort steht in
      // Alltagssprache; wer es genau wissen will, springt ins Dokument.
      setzeAntwort(await lotseFragen(kvnr, frage, 'alltag', kvnr));
    } catch (f) {
      setzeFehler(
        f instanceof EpaFehler
          ? fehlerTitel(f)
          : f instanceof Error
            ? f.message
            : 'Der Lotse hat nicht geantwortet.',
      );
      setzeAntwort(null);
    } finally {
      setzeLaeuft(false);
    }
  }

  return (
    <>
      <Fragefeld
        kennung="lotse-frage-versicherte"
        vorschlaege={VORSCHLAGSFRAGEN.versicherte}
        laeuft={laeuft}
        fragen={(f) => void fragen(f)}
        beschriftung="Frage an Ihre Unterlagen"
      />

      {laeuft && <p className="leer">Der Lotse liest …</p>}
      {fehler && <p className="lotse-fehler">{fehler}</p>}

      {antwort && !laeuft && (
        <section className="lotse-antwort" aria-live="polite">
          <div className="lotse-antwort-kopf">
            <h3>{antwort.frage}</h3>
            <Vorlesen text={antwortAlsText(antwort)} />
          </div>
          <Antworthinweis antwort={antwort} />
          {antwort.grenze === 'bewertung' && (
            // Die Ablehnung endet nicht in einer Sackgasse: Die Frage geht dorthin, wo sie
            // beantwortet werden darf.
            <div className="reihe lotse-grenze-wege">
              <button type="button" className="knopf" onClick={() => anPraxis(antwort.frage)}>
                An die Hausarztpraxis
              </button>
              <button
                type="button"
                className="knopf"
                disabled={notiert}
                onClick={() => {
                  notieren(antwort.frage);
                  setzeNotiert(true);
                }}
              >
                {notiert ? 'Für den Termin notiert' : 'Für den Termin notieren'}
              </button>
            </div>
          )}
          <Absaetze
            absaetze={antwort.absaetze}
            vorsatz="Im Dokument nachlesen:"
            oeffnen={(q) => zurQuelle(q, belegzeilen(antwort.absaetze, q.quelleId))}
          />
          <Begriffe antwort={antwort} />
          {/* Eine abgelehnte Frage hat nichts gelesen — eine Umfangsangabe wäre irreführend. */}
          {!antwort.grenze && <Umfangsangabe umfang={antwort.umfang} />}
        </section>
      )}
    </>
  );
}
