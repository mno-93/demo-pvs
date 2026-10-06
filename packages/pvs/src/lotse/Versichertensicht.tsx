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
  type Lesart,
  type Lotsenantwort,
  type Quellenangabe,
  type Ressource,
} from '@demo-pvs/kern';
import { useZustand } from '../speicher/speicher.js';
import { dokumentAbrufen, dokumenteSuchen, lotseFragen } from '../epa/klient.js';
import { dokumentverweisLesen, type Dokumentverweis } from '../epa/epa-bestand.js';
import { DokumentBetrachter } from '../bausteine/DokumentBetrachter.js';
import {
  Absaetze,
  Begriffe,
  Fragefeld,
  Umfangsangabe,
  Vorlesen,
  antwortAlsText,
  tag,
} from './bausteine.js';
import { useLotseVorhanden } from './vorhanden.js';

/** Wer gerade in die Akte sieht. */
type Rolle = 'versicherte' | 'vertretung' | 'ohne-vertretung';

const ROLLEN: { id: Rolle; name: string; zusatz: string; befugt: boolean }[] = [
  { id: 'versicherte', name: 'Renate Hoffmann', zusatz: 'eigene Akte', befugt: true },
  { id: 'vertretung', name: 'Sabine Hoffmann', zusatz: 'Tochter · Vertretung', befugt: true },
  { id: 'ohne-vertretung', name: 'Sabine Hoffmann', zusatz: 'Vertretung entzogen', befugt: false },
];

type Bereich = 'dokumente' | 'lotse';

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

  const [verweise, setzeVerweise] = useState<Dokumentverweis[] | null>(null);
  const [offenesDokument, setzeOffenesDokument] = useState<Dokumentverweis | null>(null);
  const [inhalt, setzeInhalt] = useState<unknown>(null);

  const lotseDa = useLotseVorhanden() === true;
  const befugt = ROLLEN.find((r) => r.id === rolle)?.befugt ?? false;

  /* ---------- Dokumente ---------- */

  useEffect(() => {
    if (!kvnr || !befugt) {
      setzeVerweise(null);
      return;
    }
    let abgebrochen = false;
    void dokumenteSuchen(kvnr, undefined, kvnr)
      .then((r: Ressource[]) => {
        if (!abgebrochen) setzeVerweise(r.map(dokumentverweisLesen));
      })
      .catch(() => {
        if (!abgebrochen) setzeVerweise([]);
      });
    return () => {
      abgebrochen = true;
    };
  }, [kvnr, befugt]);

  const dokumentOeffnen = useCallback(
    async (verweis: Dokumentverweis) => {
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

  /** Die Quellenangabe einer Antwort führt in die Dokumentenliste — nicht in ein eigenes Fenster. */
  const zurQuelle = useCallback(
    (q: Quellenangabe) => {
      const verweis = verweise?.find((v) => v.id === q.quelleId);
      if (verweis) void dokumentOeffnen(verweis);
      else setzeFehler('Diese Quelle ist kein Dokument der Akte.');
    },
    [verweise, dokumentOeffnen],
  );

  // Beim Rollenwechsel verfällt alles: Es gehört zu den Rechten, unter denen es entstand.
  useEffect(() => {
    setzeOffenesDokument(null);
    setzeInhalt(null);
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
            onClick={() => setzeBereich('dokumente')}
          >
            Dokumente
            {verweise && <span className="telefon-zahl">{verweise.length}</span>}
          </button>
          {lotseDa && (
            <button
              type="button"
              className={bereich === 'lotse' ? 'aktiv' : ''}
              aria-pressed={bereich === 'lotse'}
              onClick={() => setzeBereich('lotse')}
            >
              Aktenlotse
              <span className="telefon-neu">neu</span>
            </button>
          )}
        </nav>

        <div className="telefon-inhalt">
          {!befugt ? (
            <div className="lotse-ohne-rechte">
              <span className="marker">ohne Vertretung</span>
              <p className="lotse-zeile">Keine Akte · keine Dokumente · keine Antwort</p>
            </div>
          ) : bereich === 'dokumente' ? (
            <Dokumentenbereich
              verweise={verweise}
              offenes={offenesDokument}
              inhalt={inhalt}
              patientId={person.id}
              oeffnen={(v) => void dokumentOeffnen(v)}
              schliessen={() => {
                setzeOffenesDokument(null);
                setzeInhalt(null);
              }}
            />
          ) : (
            <Lotsenbereich kvnr={kvnr} zurQuelle={zurQuelle} />
          )}
          {fehler && <p className="lotse-fehler">{fehler}</p>}
        </div>
      </div>
    </div>
  );
}

/* ---------- Bereich „Dokumente" ---------- */

function Dokumentenbereich({
  verweise,
  offenes,
  inhalt,
  patientId,
  oeffnen,
  schliessen,
}: {
  verweise: Dokumentverweis[] | null;
  offenes: Dokumentverweis | null;
  inhalt: unknown;
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
          <button type="button" className="knopf klein" onClick={schliessen}>
            Zurück
          </button>
        </div>
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
}: {
  kvnr: string;
  zurQuelle: (q: Quellenangabe) => void;
}) {
  const [lesart, setzeLesart] = useState<Lesart>('alltag');
  const [antwort, setzeAntwort] = useState<Lotsenantwort | null>(null);
  const [laeuft, setzeLaeuft] = useState(false);
  const [fehler, setzeFehler] = useState<string | null>(null);

  async function fragen(frage: string, mitLesart: Lesart = lesart) {
    if (!kvnr) return;
    setzeLaeuft(true);
    setzeFehler(null);
    try {
      // Der Zugang ist der der versicherten Person, nicht der der Praxis.
      setzeAntwort(await lotseFragen(kvnr, frage, mitLesart, kvnr));
    } catch (f) {
      setzeFehler(f instanceof Error ? f.message : 'Der Lotse hat nicht geantwortet.');
      setzeAntwort(null);
    } finally {
      setzeLaeuft(false);
    }
  }

  return (
    <>
      <div className="lotse-lesart">
        <span className="lotse-lesart-titel">Sprache</span>
        <div className="modusschalter">
          <button
            type="button"
            className={lesart === 'alltag' ? 'aktiv' : ''}
            aria-pressed={lesart === 'alltag'}
            onClick={() => {
              setzeLesart('alltag');
              if (antwort) void fragen(antwort.frage, 'alltag');
            }}
          >
            Einfach
          </button>
          <button
            type="button"
            className={lesart === 'fach' ? 'aktiv' : ''}
            aria-pressed={lesart === 'fach'}
            onClick={() => {
              setzeLesart('fach');
              if (antwort) void fragen(antwort.frage, 'fach');
            }}
          >
            Wie im Dokument
          </button>
        </div>
      </div>

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
          {antwort.hinweis && <p className="lotse-hinweis">{antwort.hinweis}</p>}
          <Absaetze absaetze={antwort.absaetze} oeffnen={zurQuelle} />
          <Begriffe antwort={antwort} />
          <Umfangsangabe umfang={antwort.umfang} />
        </section>
      )}
    </>
  );
}
