/**
 * ✦ Rückfrage zu einer Unterlage — von der Stelle im Dokument zu dem Menschen, der sie
 * geschrieben hat, oder zur behandelnden Praxis.
 *
 * Drei Regeln tragen den Entwurf (SPEZIFIKATION 8.10, ADR 0037):
 *
 * 1. **Erst das Anliegen, dann der Adressat.** „Was bedeutet das für mich?" gehört zur
 *    behandelnden Praxis, nicht zum Verfasser und nicht zum Lotsen. „Stimmt das?" und „Da fehlt
 *    etwas" gehören zur Einrichtung, die das Dokument eingestellt hat.
 * 2. **Zeiger statt Inhalt.** Eine Nachricht nennt Dokument und Datum, nicht den Inhalt — wer es
 *    verfasst hat, hat es selbst.
 * 3. **Telefon zuerst.** Der TI-Messenger erscheint nur bei Einrichtungen, die laut Verzeichnis
 *    für Versicherte erreichbar sind. ⚠ Wie das im Wirkbetrieb geregelt ist, ist nicht belegt;
 *    die Demo bereitet eine Nachricht nur vor und versendet nichts.
 */
import { useEffect, useState } from 'react';
import { EINRICHTUNG, kontaktSuchen, type Kontakteintrag } from '../epa/klient.js';
import { tag } from './bausteine.js';

export type Anliegen = 'bedeutung' | 'stimmt' | 'fehlt';

/** Worauf sich eine Frage bezieht — ein Zeiger, kein Inhalt. */
export interface Bezug {
  titel: string;
  datum: string;
  einrichtung: string;
}

export interface Frageeintrag {
  id: string;
  frage: string;
  bezug: Bezug | null;
  adressat: string;
  von: string;
  zustand: 'notiert' | 'vorbereitet';
}

export const ANLIEGEN: Record<Anliegen, { beschriftung: string; an: 'praxis' | 'verfasser' }> = {
  bedeutung: { beschriftung: 'Was bedeutet das für mich?', an: 'praxis' },
  stimmt: { beschriftung: 'Stimmt das?', an: 'verfasser' },
  fehlt: { beschriftung: 'Da fehlt etwas', an: 'verfasser' },
};

/** Die behandelnde Praxis der Demo — dieselbe, in deren Praxissystem die Demo läuft. */
export const BEHANDELNDE_PRAXIS = EINRICHTUNG.anzeige;

export function bezugAlsText(b: Bezug): string {
  return `${b.titel} · ${tag(b.datum)}`;
}

let laufendeNummer = 0;
export function neueFrageId(): string {
  laufendeNummer += 1;
  return `frage-${laufendeNummer}`;
}

type Kontaktlage =
  { art: 'laedt' } | { art: 'gefunden'; eintrag: Kontakteintrag } | { art: 'keiner' };

export function Rueckfrage({
  bezug,
  vorgabe,
  von,
  notieren,
  schliessen,
}: {
  bezug: Bezug | null;
  vorgabe?: { anliegen: Anliegen; frage?: string };
  /** Wer fragt — die versicherte Person oder ihre Vertretung. */
  von: string;
  notieren: (e: Frageeintrag) => void;
  schliessen: () => void;
}) {
  const [anliegen, setzeAnliegen] = useState<Anliegen | null>(vorgabe?.anliegen ?? null);
  const [frage, setzeFrage] = useState(vorgabe?.frage ?? '');
  const [kontakt, setzeKontakt] = useState<Kontaktlage>({ art: 'laedt' });
  const [nachrichtOffen, setzeNachrichtOffen] = useState(false);
  const [vorbereitet, setzeVorbereitet] = useState(false);

  const adressat = !anliegen
    ? null
    : ANLIEGEN[anliegen].an === 'praxis'
      ? BEHANDELNDE_PRAXIS
      : (bezug?.einrichtung ?? '');

  useEffect(() => {
    if (adressat === null) return;
    setzeNachrichtOffen(false);
    setzeVorbereitet(false);
    if (!adressat.trim()) {
      setzeKontakt({ art: 'keiner' });
      return;
    }
    let abgebrochen = false;
    setzeKontakt({ art: 'laedt' });
    void kontaktSuchen(adressat)
      .then((k) => {
        if (!abgebrochen) setzeKontakt(k ? { art: 'gefunden', eintrag: k } : { art: 'keiner' });
      })
      .catch(() => {
        if (!abgebrochen) setzeKontakt({ art: 'keiner' });
      });
    return () => {
      abgebrochen = true;
    };
  }, [adressat]);

  const eintrag = (zustand: Frageeintrag['zustand']): Frageeintrag => ({
    id: neueFrageId(),
    frage: frage.trim(),
    bezug,
    adressat:
      kontakt.art === 'gefunden'
        ? kontakt.eintrag.name
        : adressat?.trim() || 'Einrichtung unbekannt',
    von,
    zustand,
  });

  return (
    <section className="rueckfrage" aria-label="Nachfragen">
      <div className="rueckfrage-kopf">
        <strong>Nachfragen</strong>
        <button type="button" className="knopf klein" onClick={schliessen}>
          Schließen
        </button>
      </div>
      {bezug && <p className="rueckfrage-bezug">Bezug: {bezugAlsText(bezug)}</p>}

      <div className="lotse-vorschlagsfragen" role="group" aria-label="Anliegen">
        {(Object.keys(ANLIEGEN) as Anliegen[]).map((a) => (
          <button
            key={a}
            type="button"
            className={`chip ${anliegen === a ? 'aktiv' : ''}`}
            aria-pressed={anliegen === a}
            onClick={() => setzeAnliegen(a)}
          >
            {ANLIEGEN[a].beschriftung}
          </button>
        ))}
      </div>

      {anliegen && (
        <>
          <div className="rueckfrage-adressat">
            <span className="leise-klein">an</span>{' '}
            <b>
              {kontakt.art === 'gefunden'
                ? kontakt.eintrag.name
                : adressat?.trim() || 'Einrichtung nicht angegeben'}
            </b>
            {kontakt.art === 'keiner' && <span className="marker warn">nicht im Verzeichnis</span>}
          </div>

          {kontakt.art === 'gefunden' && (
            <div className="rueckfrage-wege">
              <a className="knopf" href={`tel:${kontakt.eintrag.telefon.replace(/\s/g, '')}`}>
                Anrufen · {kontakt.eintrag.telefon}
              </a>
              {kontakt.eintrag.tiMessenger ? (
                <button
                  type="button"
                  className="knopf"
                  aria-pressed={nachrichtOffen}
                  onClick={() => setzeNachrichtOffen(!nachrichtOffen)}
                >
                  Nachricht ✦
                </button>
              ) : (
                <span className="marker neutral">kein TI-Messenger</span>
              )}
            </div>
          )}

          <label className="rueckfrage-feld" htmlFor="rueckfrage-text">
            Ihre Frage
            <textarea
              id="rueckfrage-text"
              rows={3}
              value={frage}
              onChange={(e) => setzeFrage(e.target.value)}
            />
          </label>

          {nachrichtOffen && kontakt.art === 'gefunden' && (
            <div className="rueckfrage-nachricht">
              <span className="marker lotse">✦ Vorschlag · TI-Messenger</span>
              <dl>
                <dt>An</dt>
                <dd>{kontakt.eintrag.name}</dd>
                <dt>Von</dt>
                <dd>{von}</dd>
                {bezug && (
                  <>
                    <dt>Bezug</dt>
                    <dd>{bezugAlsText(bezug)}</dd>
                  </>
                )}
              </dl>
              <button
                type="button"
                className="knopf stark"
                disabled={!frage.trim() || vorbereitet}
                onClick={() => {
                  notieren(eintrag('vorbereitet'));
                  setzeVorbereitet(true);
                }}
              >
                {vorbereitet ? 'Nachricht vorbereitet' : 'Nachricht vorbereiten'}
              </button>
              {vorbereitet && <span className="marker neutral">nicht versendet</span>}
            </div>
          )}

          <button
            type="button"
            className="knopf"
            disabled={!frage.trim()}
            onClick={() => {
              notieren(eintrag('notiert'));
              schliessen();
            }}
          >
            Für den Termin notieren
          </button>
        </>
      )}
    </section>
  );
}

/** Die gesammelten Fragen — für den nächsten Termin oder als vorbereitete Nachricht. */
export function Fragenliste({
  fragen,
  entfernen,
}: {
  fragen: Frageeintrag[];
  entfernen: (id: string) => void;
}) {
  if (fragen.length === 0) return <p className="leer">Keine Fragen notiert.</p>;
  return (
    <ul className="fragenliste" aria-label="Meine Fragen">
      {fragen.map((f) => (
        <li key={f.id}>
          <p className="lotse-zeile">{f.frage}</p>
          <span className="leise-klein">
            an {f.adressat}
            {f.bezug ? ` · Bezug: ${bezugAlsText(f.bezug)}` : ''}
          </span>
          <div className="reihe">
            {f.zustand === 'vorbereitet' ? (
              <span className="marker lotse">✦ Nachricht vorbereitet · nicht versendet</span>
            ) : (
              <span className="marker neutral">für den Termin</span>
            )}
            <button type="button" className="knopf klein" onClick={() => entfernen(f.id)}>
              entfernen
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}
