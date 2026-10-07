/**
 * ✦ Bausteine des Aktenlotsen — von der Versichertensicht und der Praxissicht gemeinsam
 * genutzt. Beide zeigen dieselbe Antwort; sie unterscheiden sich in Sprache und Rahmen,
 * nicht in dem, worauf sie beruht.
 */
import { useEffect, useRef, useState } from 'react';
import type React from 'react';
import type { Lotsenabsatz, Lotsenantwort, Quellenangabe, Umfang } from '@demo-pvs/kern';

/** Datum als Tag.Monat.Jahr — in der Antwort steht nie ein ISO-Datum. */
export function tag(iso: string): string {
  return iso.length >= 10 ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}` : iso;
}

/**
 * Die Unterlage, in der eine Aussage nachzulesen ist.
 *
 * ▸ Kein Zitat unter dem Satz: Der Lotse führt zur Quelle hin, und wer nachlesen will, öffnet
 * sie. Ein Absatz ohne Verweis entsteht nicht.
 */
export function Quellenverweis({
  quellen,
  oeffnen,
  vorsatz,
}: {
  quellen: Quellenangabe[];
  oeffnen?: (q: Quellenangabe) => void;
  /** Steht vor den Unterlagen, etwa „Im Dokument nachlesen:". */
  vorsatz?: string;
}) {
  if (quellen.length === 0) return null;
  return (
    <p className="lotse-quellen">
      {vorsatz && <span className="lotse-quellen-vorsatz">{vorsatz} </span>}
      {quellen.map((q, i) => (
        <span key={q.quelleId}>
          {i > 0 && ' · '}
          {oeffnen ? (
            <button type="button" className="lotse-quelle-knopf" onClick={() => oeffnen(q)}>
              {q.titel}, {q.einrichtung}, {tag(q.datum)}
            </button>
          ) : (
            <span className="lotse-quelle-text">
              {q.titel}, {q.einrichtung}, {tag(q.datum)}
            </span>
          )}
        </span>
      ))}
    </p>
  );
}

function gleicheQuellen(a: Quellenangabe[], b: Quellenangabe[]): boolean {
  return a.length === b.length && a.every((q, i) => q.quelleId === b[i]?.quelleId);
}

/**
 * Die Absätze einer Antwort.
 *
 * ▸ Die Quellenangabe steht nur dort, wo sie sich ändert: Stünde unter jedem Satz dieselbe
 * Unterlage, läse sich die Antwort wie ein Fußnotenapparat. Sichtbar bleibt sie trotzdem für
 * jeden Absatz — sie gilt bis zur nächsten.
 */
export function Absaetze({
  absaetze,
  oeffnen,
  vorsatz,
}: {
  absaetze: Lotsenabsatz[];
  oeffnen?: (q: Quellenangabe) => void;
  vorsatz?: string;
}) {
  return (
    <>
      {absaetze.map((a, i) => {
        const naechste = absaetze[i + 1];
        const letzterDieserQuelle = !naechste || !gleicheQuellen(a.quellen, naechste.quellen);
        return (
          <div key={i} className="lotse-absatz">
            <p className="lotse-zeile">{a.text}</p>
            {letzterDieserQuelle && (
              <Quellenverweis quellen={a.quellen} oeffnen={oeffnen} vorsatz={vorsatz} />
            )}
          </div>
        );
      })}
    </>
  );
}

/**
 * Die Zeilen einer Unterlage, auf denen Absätze beruhen — zum Markieren im Dokument. Gesammelt
 * über alle Absätze, die sich auf die Unterlage stützen.
 */
export function belegzeilen(absaetze: Lotsenabsatz[], quelleId: string): string[] {
  return [
    ...new Set(
      absaetze.flatMap((a) =>
        (a.belege ?? []).filter((b) => b.quelleId === quelleId).flatMap((b) => b.zeilen),
      ),
    ),
  ];
}

/**
 * Wie viele Quellen gelesen wurden — und welche nicht.
 *
 * ▸ Steht bewusst an der Antwort: Die gefährlichste Antwort ist die, die vollständig wirkt.
 * Was der Lotse nicht gelesen hat, muss derselbe Blick erfassen.
 */
export function Umfangsangabe({ umfang }: { umfang: Umfang }) {
  return (
    <div className="lotse-umfang">
      <span className="lotse-umfang-zahl">
        {umfang.gelesen} von {umfang.gesamt} Unterlagen gelesen
      </span>
      {umfang.uebergangen.length > 0 && (
        <ul className="lotse-umfang-liste">
          {umfang.uebergangen.map((u, i) => (
            <li key={i}>
              {u.titel} — {u.grund}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Erläuterte Fachbegriffe der Antwort. */
export function Begriffe({ antwort }: { antwort: Lotsenantwort }) {
  if (antwort.begriffe.length === 0) return null;
  return (
    <dl className="lotse-begriffe">
      {antwort.begriffe.map((b) => (
        <div key={b.fach}>
          <dt>{b.fach}</dt>
          <dd>{b.alltag}</dd>
        </div>
      ))}
    </dl>
  );
}

/* ---------- Gliederung ---------- */

/**
 * Ein aufklappbarer Abschnitt des Lotsen.
 *
 * ▸ Der Lotse liefert vier verschiedene Dinge auf einmal — Kontext, Auffälligkeiten, Antworten,
 * Vorschläge. Alles nebeneinander ist eine Wand. Die Abschnitte tragen deshalb ihren Zähler im
 * Kopf und sind nur dort offen, wo etwas zu tun ist.
 */
export function Abschnitt({
  titel,
  zahl,
  offenAnfangs = false,
  betont = false,
  children,
}: {
  titel: string;
  /** Anzahl im Kopf — sagt ohne Aufklappen, ob sich das Öffnen lohnt. */
  zahl?: number;
  offenAnfangs?: boolean;
  /** Hebt den Abschnitt hervor, wenn er Handlungsbedarf trägt. */
  betont?: boolean;
  children: React.ReactNode;
}) {
  const [offen, setzeOffen] = useState(offenAnfangs);
  return (
    <section className={`lotse-abschnitt ${betont ? 'betont' : ''}`}>
      <button
        type="button"
        className="lotse-abschnitt-kopf"
        aria-expanded={offen}
        onClick={() => setzeOffen(!offen)}
      >
        <span aria-hidden="true" className="lotse-pfeil">
          {offen ? '▾' : '▸'}
        </span>
        <span className="lotse-abschnitt-titel">{titel}</span>
        {zahl !== undefined && <span className="lotse-zahl">{zahl}</span>}
      </button>
      {offen && <div className="lotse-abschnitt-inhalt">{children}</div>}
    </section>
  );
}

/** Die Absätze einer Antwort, bei denen nur der erste steht, bis jemand mehr sehen will. */
export function AbsaetzeGekuerzt({
  absaetze,
  oeffnen,
}: {
  absaetze: Lotsenabsatz[];
  oeffnen?: (q: Quellenangabe) => void;
}) {
  const [alle, setzeAlle] = useState(false);
  if (absaetze.length === 0) return null;
  const gezeigt = alle ? absaetze : absaetze.slice(0, 1);
  return (
    <>
      <Absaetze absaetze={gezeigt} oeffnen={oeffnen} />
      {absaetze.length > 1 && (
        <button type="button" className="lotse-mehr" onClick={() => setzeAlle(!alle)}>
          {alle ? 'weniger anzeigen' : `${absaetze.length - 1} weitere Angaben anzeigen`}
        </button>
      )}
    </>
  );
}

/* ---------- Vorlesen ---------- */

/** Ob die Sprachausgabe des Browsers zur Verfügung steht. */
export function vorlesenMoeglich(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

/**
 * Liest die Antwort vor. Die Sprachausgabe läuft im Browser der nutzenden Person; es geht
 * dafür nichts an einen Dienst.
 */
export function Vorlesen({ text }: { text: string }) {
  const [laeuft, setzeLaeuft] = useState(false);
  const laufend = useRef<SpeechSynthesisUtterance | null>(null);

  useEffect(() => () => window.speechSynthesis?.cancel(), []);

  if (!vorlesenMoeglich() || !text.trim()) return null;

  const anhalten = () => {
    window.speechSynthesis.cancel();
    setzeLaeuft(false);
  };

  const starten = () => {
    window.speechSynthesis.cancel();
    const spruch = new SpeechSynthesisUtterance(text);
    spruch.lang = 'de-DE';
    spruch.rate = 0.95;
    spruch.onend = () => setzeLaeuft(false);
    spruch.onerror = () => setzeLaeuft(false);
    laufend.current = spruch;
    window.speechSynthesis.speak(spruch);
    setzeLaeuft(true);
  };

  return (
    <button
      type="button"
      className="knopf lotse-vorlesen"
      aria-pressed={laeuft}
      onClick={laeuft ? anhalten : starten}
    >
      <span aria-hidden="true">{laeuft ? '■' : '▶'}</span> {laeuft ? 'Anhalten' : 'Vorlesen'}
    </button>
  );
}

/** Die Antwort als zusammenhängender Text — Grundlage der Sprachausgabe. */
export function antwortAlsText(antwort: Lotsenantwort): string {
  return [antwort.hinweis, ...antwort.absaetze.map((a) => a.text)].filter(Boolean).join(' ');
}

/* ---------- Grenze ---------- */

/**
 * Der Hinweis über einer Antwort — oder, wenn der Lotse eine Bewertungsfrage ablehnt, die
 * Ablehnung selbst.
 *
 * ▸ Die Ablehnung steht nicht kursiv und leise wie ein Randhinweis, sondern als eigene
 * Antwort mit Marker: Sie ist die sichtbarste Form von Prinzip 4 und soll nicht wie ein
 * Fehler aussehen.
 */
export function Antworthinweis({ antwort }: { antwort: Lotsenantwort }) {
  if (!antwort.hinweis) return null;
  if (antwort.grenze === 'bewertung') {
    return (
      <div className="lotse-grenze">
        <span className="marker lotse">Keine Bewertung</span>
        <p>{antwort.hinweis}</p>
      </div>
    );
  }
  return <p className="lotse-hinweis">{antwort.hinweis}</p>;
}

/* ---------- Fragefeld ---------- */

export function Fragefeld({
  vorschlaege,
  laeuft,
  fragen,
  beschriftung,
  kennung,
}: {
  vorschlaege: string[];
  laeuft: boolean;
  fragen: (frage: string) => void;
  beschriftung: string;
  kennung: string;
}) {
  const [text, setzeText] = useState('');

  return (
    <div className="lotse-fragefeld">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (text.trim()) fragen(text.trim());
        }}
      >
        <label className="nur-fuer-screenreader" htmlFor={kennung}>
          {beschriftung}
        </label>
        <div className="lotse-eingabe">
          <input
            id={kennung}
            type="text"
            value={text}
            placeholder={beschriftung}
            onChange={(e) => setzeText(e.target.value)}
          />
          <button type="submit" className="knopf" disabled={laeuft || !text.trim()}>
            Fragen
          </button>
        </div>
      </form>
      <div className="lotse-vorschlagsfragen">
        {vorschlaege.map((v) => (
          <button
            key={v}
            type="button"
            className="chip"
            disabled={laeuft}
            onClick={() => {
              setzeText(v);
              fragen(v);
            }}
          >
            {v}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ---------- Geöffnete Unterlage ---------- */

export function Quellenblatt({
  titel,
  einrichtung,
  datum,
  zeilen,
  nichtLesbar,
  schliessen,
}: {
  titel: string;
  einrichtung: string;
  datum: string;
  zeilen: string[];
  nichtLesbar: string | null;
  schliessen: () => void;
}) {
  return (
    <div className="lotse-blatt" role="dialog" aria-label={titel}>
      <div className="lotse-blatt-kopf">
        <strong>{titel}</strong>
        <button type="button" className="knopf klein" onClick={schliessen}>
          Schließen
        </button>
      </div>
      <span className="herkunft">
        {einrichtung} · {tag(datum)}
      </span>
      {nichtLesbar ? (
        <p className="leer">{nichtLesbar}</p>
      ) : (
        <pre className="lotse-blatt-text">{zeilen.join('\n')}</pre>
      )}
    </div>
  );
}

/* ---------- Quelle ohne Datei ---------- */

/**
 * Eine Quelle, die kein Dokument ist — etwa der Medikationsplan: die Zeilen, die der Lotse
 * gelesen hat, die belegenden hervorgehoben. Ein Verweis darauf führt hierher und nicht ins Leere.
 */
export function Textquelle({ zeilen, markieren }: { zeilen: string[]; markieren: string[] }) {
  return (
    <ul className="lotse-textquelle">
      {zeilen.map((z, i) => (
        <li key={i} className={markieren.includes(z.trim()) ? 'markiert' : ''}>
          {z}
        </li>
      ))}
    </ul>
  );
}
