import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { pfadKurz, useAufrufe } from '../epa/protokoll.js';
import { pfadNachspielen, startzustandHerstellen, wertSetzen } from './ausfuehren.js';
import {
  KLICKPFAD_ATTRIBUT,
  erfuellt,
  finden,
  geklicktBeschreibung,
  markierungsRahmen,
  zielBeschreibung,
  type Rahmen,
} from './finden.js';
import { MODUS_BEZEICHNUNG, type Modus, type Szenario, type Ziel } from './szenario.js';
import { SZENARIEN } from './szenarien/index.js';

/**
 * Ebene eines Klickpfads über der Demo (ADR 0061): Hervorhebung des nächsten Elements, kurzer
 * Text daran, Seitenleiste mit Schritten, Erläuterung und den ePA-Aufrufen des Schritts. Die
 * Ebene ist kein Teil des Praxissystems — sie erscheint nur über den Link und ist als
 * „Klickpfad“ abgesetzt; das Praxissystem selbst bleibt ohne Erklärtexte (ADR 0020).
 *
 * Modi: geführt (nur das nächste Element ist bedienbar), frei mit Wegweiser (alles bedienbar),
 * Aufgabe (keine Hervorhebung, Hilfe auf Abruf, Protokoll für Nutzertests — nur lokal).
 */

type Lage = 'startet' | 'laeuft' | 'fertig' | { fehler: string };

interface Ereignis {
  sekunde: number;
  art:
    'treffer' | 'fehlklick' | 'hilfe' | 'eingetragen' | 'schritt' | 'modus' | 'zurueck' | 'fertig';
  schritt: number;
  element?: string;
}

const TAKT_MS = 200;
/** So lange darf das Ziel fehlen, bevor „zurück zum Pfad“ erscheint. */
const VERLOREN_MS = 2500;

export default function KlickpfadEbene({ id, modus: startmodus }: { id: string; modus: Modus }) {
  const s = SZENARIEN[id];
  if (!s) return <Unbekannt id={id} />;
  return <Rundgang s={s} startmodus={startmodus} />;
}

function Unbekannt({ id }: { id: string }) {
  return createPortal(
    <aside className="klickpfad-leiste" aria-label="Klickpfad" {...{ [KLICKPFAD_ATTRIBUT]: '' }}>
      <div className="klickpfad-kopf">Klickpfad</div>
      <p>Den Klickpfad „{id}“ gibt es nicht. Vorhanden:</p>
      <ul>
        {Object.values(SZENARIEN).map((x) => (
          <li key={x.id}>
            <a href={`?klickpfad=${x.id}`}>{x.titel}</a>
          </li>
        ))}
      </ul>
    </aside>,
    document.body,
  );
}

function Rundgang({ s, startmodus }: { s: Szenario; startmodus: Modus }) {
  const navigieren = useNavigate();
  const aufrufe = useAufrufe();
  const [lage, setzeLage] = useState<Lage>('startet');
  const [index, setzeIndex] = useState(0);
  const [modus, setzeModus] = useState<Modus>(startmodus);
  const [rahmen, setzeRahmen] = useState<Rahmen | null>(null);
  const [pruefErfuellt, setzePruefErfuellt] = useState(false);
  const [verloren, setzeVerloren] = useState(false);
  /** Ziel vorhanden, aber außerhalb des sichtbaren Bereichs — dann fehlen Rahmen und Sprechblase. */
  const [ausserhalb, setzeAusserhalb] = useState(false);
  const [hilfe, setzeHilfe] = useState(false);
  const [blitz, setzeBlitz] = useState(0);
  const [offen, setzeOffen] = useState(true);
  const ereignisse = useRef<Ereignis[]>([]);
  const beginn = useRef(performance.now());
  const schrittBeginn = useRef<number[]>([]);
  const fehltSeit = useRef<number | null>(null);
  const gerollt = useRef(-1);

  const schritt = s.schritte[index];
  const sekunde = () => Math.round((performance.now() - beginn.current) / 100) / 10;
  const notieren = useCallback(
    (e: Omit<Ereignis, 'sekunde'>) => ereignisse.current.push({ ...e, sekunde: sekunde() }),
    [],
  );

  /** Der aktuelle Schritt, ohne auf das Rendern zu warten — Takt und Klick schalten sonst doppelt. */
  const indexRef = useRef(0);

  const schrittBeginnen = useCallback((i: number) => {
    indexRef.current = i;
    schrittBeginn.current[i] = Date.now();
    setzeIndex(i);
    setzePruefErfuellt(false);
    setzeVerloren(false);
    setzeHilfe(false);
    setzeBlitz(0);
    fehltSeit.current = null;
  }, []);

  /** Schritt `von` ist erledigt — nur einmal, auch wenn Takt und Klick es beide melden. */
  const weiter = useCallback(
    (von: number) => {
      if (indexRef.current !== von) return;
      const naechster = von + 1;
      notieren({ art: 'schritt', schritt: naechster });
      if (naechster >= s.schritte.length) {
        indexRef.current = naechster;
        notieren({ art: 'fertig', schritt: naechster });
        setzeLage('fertig');
        return;
      }
      schrittBeginnen(naechster);
    },
    [notieren, s.schritte.length, schrittBeginnen],
  );

  async function nachspielen(bis: number) {
    setzeLage('startet');
    try {
      await pfadNachspielen(s, bis, (p) => navigieren(p));
      schrittBeginnen(bis);
      setzeLage('laeuft');
    } catch (f) {
      setzeLage({ fehler: (f as Error).message });
    }
  }

  // Start: Startzustand herstellen — einmal, auch wenn der StrictMode den Effekt doppelt anstößt.
  const gestartet = useRef(false);
  useEffect(() => {
    if (gestartet.current) return;
    gestartet.current = true;
    startzustandHerstellen(s, (p) => navigieren(p)).then(
      () => {
        beginn.current = performance.now();
        schrittBeginnen(0);
        setzeLage('laeuft');
      },
      (f: unknown) => setzeLage({ fehler: (f as Error).message }),
    );
  }, [s, navigieren, schrittBeginnen]);

  // Platz für die Seitenleiste.
  useEffect(() => {
    document.body.classList.add('mit-klickpfad');
    return () => document.body.classList.remove('mit-klickpfad');
  }, []);

  // Takt: Ziel suchen, Rahmen messen, Eingaben und Prüfpunkte erkennen.
  useEffect(() => {
    if (lage !== 'laeuft' || !schritt) return;
    const takt = window.setInterval(() => {
      const e = finden(schritt.ziel);
      if (!e) {
        setzeRahmen(null);
        setzeAusserhalb(false);
        fehltSeit.current ??= Date.now();
        setzeVerloren(Date.now() - fehltSeit.current > VERLOREN_MS);
        return;
      }
      fehltSeit.current = null;
      setzeVerloren(false);
      if (gerollt.current !== index) {
        gerollt.current = index;
        if (modus !== 'aufgabe') e.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
      }
      const r = markierungsRahmen(e);
      setzeRahmen(r);
      setzeAusserhalb(r === null);
      if (schritt.handlung && schritt.handlung.art !== 'klicken' && erfuellt(schritt, e))
        weiter(index);
      else if (!schritt.handlung && erfuellt(schritt, e)) {
        // Nur geführt wartet ein Prüfpunkt auf „weiter“ — Zeit zum Lesen. Frei und als Aufgabe
        // geht es sonst nicht weiter, wenn jemand ohne Bestätigung den nächsten Schritt tut.
        if (modus === 'gefuehrt') setzePruefErfuellt(true);
        else weiter(index);
      }
    }, TAKT_MS);
    return () => window.clearInterval(takt);
  }, [lage, schritt, index, modus, weiter]);

  // Rahmen beim Scrollen und bei Größenänderung sofort nachziehen — der Takt allein hinkt.
  useEffect(() => {
    if (lage !== 'laeuft' || !schritt) return;
    let geplant = 0;
    const messen = () => {
      if (geplant) return;
      geplant = window.requestAnimationFrame(() => {
        geplant = 0;
        const e = finden(schritt.ziel);
        setzeRahmen(e ? markierungsRahmen(e) : null);
      });
    };
    window.addEventListener('scroll', messen, { capture: true, passive: true });
    window.addEventListener('resize', messen);
    return () => {
      window.removeEventListener('scroll', messen, { capture: true });
      window.removeEventListener('resize', messen);
      window.cancelAnimationFrame(geplant);
    };
  }, [lage, schritt]);

  // Klicks: Treffer erkennen, im geführten Modus alles andere sperren.
  useEffect(() => {
    if (lage !== 'laeuft' || !schritt) return;
    const inEbene = (t: EventTarget | null) =>
      t instanceof Element && !!t.closest(`[${KLICKPFAD_ATTRIBUT}]`);
    const trifft = (ziel: Ziel, t: EventTarget | null) => {
      const e = finden(ziel);
      return !!e && t instanceof Node && e.contains(t);
    };
    const imZiel = (t: EventTarget | null) => trifft(schritt.ziel, t);
    /*
     * Vorgriff: Sind der Schritt und die folgenden ohne Klick schon erfüllt (Eingabe gemacht,
     * Prüfpunkt sichtbar), der Takt hat es aber noch nicht bemerkt, und trifft der Klick das Ziel
     * des nächsten Klickschritts, gelten alle als erledigt. Sonst bliebe der Pfad bei schnellen
     * Klicks hängen. Geführt warten Prüfpunkte auf „weiter“ und werden nicht übersprungen.
     * Ergebnis: Index des getroffenen Klickschritts, sonst `null`.
     */
    const vorgriff = (t: EventTarget | null): number | null => {
      for (let i = index; i < s.schritte.length; i++) {
        const x = s.schritte[i]!;
        if (x.handlung?.art === 'klicken') return i > index && trifft(x.ziel, t) ? i : null;
        if (!x.handlung && modus === 'gefuehrt') return null;
        const e = finden(x.ziel);
        if (!e || !erfuellt(x, e)) return null;
      }
      return null;
    };
    const sperren = (ev: Event) => {
      if (modus !== 'gefuehrt' || inEbene(ev.target) || imZiel(ev.target)) return;
      if (vorgriff(ev.target) !== null) return;
      ev.preventDefault();
      ev.stopImmediatePropagation();
    };
    const klick = (ev: MouseEvent) => {
      if (inEbene(ev.target)) return;
      const bis = vorgriff(ev.target);
      if (bis !== null) {
        for (let i = index; i < bis; i++) weiter(i);
        notieren({
          art: 'treffer',
          schritt: bis,
          element: zielBeschreibung(s.schritte[bis]!.ziel),
        });
        window.setTimeout(() => weiter(bis), 0);
        return;
      }
      if (imZiel(ev.target)) {
        if (schritt.handlung?.art === 'klicken') {
          notieren({ art: 'treffer', schritt: index, element: zielBeschreibung(schritt.ziel) });
          window.setTimeout(() => weiter(index), 0);
        }
        return;
      }
      const element = geklicktBeschreibung(ev.target as Element);
      if (element !== 'Fläche') notieren({ art: 'fehlklick', schritt: index, element });
      if (modus === 'gefuehrt') {
        ev.preventDefault();
        ev.stopImmediatePropagation();
        setzeBlitz((b) => b + 1);
      }
    };
    const taste = (ev: KeyboardEvent) => {
      if (modus !== 'gefuehrt' || (ev.key !== 'Enter' && ev.key !== ' ')) return;
      if (inEbene(document.activeElement) || imZiel(document.activeElement)) return;
      ev.preventDefault();
      ev.stopImmediatePropagation();
      setzeBlitz((b) => b + 1);
    };
    document.addEventListener('pointerdown', sperren, true);
    document.addEventListener('mousedown', sperren, true);
    document.addEventListener('click', klick, true);
    document.addEventListener('keydown', taste, true);
    return () => {
      document.removeEventListener('pointerdown', sperren, true);
      document.removeEventListener('mousedown', sperren, true);
      document.removeEventListener('click', klick, true);
      document.removeEventListener('keydown', taste, true);
    };
  }, [lage, schritt, index, modus, notieren, weiter, s.schritte]);

  function eintragen() {
    const e = schritt && finden(schritt.ziel);
    const h = schritt?.handlung;
    if (!e || !h || h.art === 'klicken') return;
    wertSetzen(e, h.wert);
    notieren({ art: 'eingetragen', schritt: index });
  }

  function modusWechseln(m: Modus) {
    setzeModus(m);
    notieren({ art: 'modus', schritt: index, element: m });
  }

  function hilfeZeigen() {
    setzeHilfe(true);
    notieren({ art: 'hilfe', schritt: index });
  }

  function beenden() {
    const adresse = new URL(window.location.href);
    adresse.searchParams.delete('klickpfad');
    adresse.searchParams.delete('modus');
    window.history.replaceState(window.history.state, '', adresse);
    setzeOffen(false);
  }

  function protokollHerunterladen() {
    const daten = {
      hinweis: 'Lokal im Browser erzeugt, nicht übertragen; enthält keine Angaben zur Testperson.',
      klickpfad: s.id,
      titel: s.titel,
      modus,
      schritte: s.schritte.length,
      erreicht: lage === 'fertig' ? s.schritte.length : index,
      fertig: lage === 'fertig',
      dauerSekunden: sekunde(),
      fehlklicks: ereignisse.current.filter((e) => e.art === 'fehlklick').length,
      hilfen: ereignisse.current.filter((e) => e.art === 'hilfe').length,
      ereignisse: ereignisse.current,
    };
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(daten, null, 2)], { type: 'application/json' }),
    );
    const a = document.createElement('a');
    a.href = url;
    a.download = `klickpfad-${s.id}-protokoll.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (!offen) return null;

  const zeigeRahmen = lage === 'laeuft' && rahmen && (modus !== 'aufgabe' || hilfe);
  // Aufrufe des letzten Schritts nach ihrem Beginn — protokolliert werden sie erst mit der
  // Antwort, oft nach dem Wechsel zum nächsten Schritt. Sonden und Hintergrundabfragen
  // (Aktenstatus, Metadaten) und die Demo-Steuerung bleiben draußen; Wiederholungen gezählt.
  const vorher = index > 0 ? schrittBeginn.current[index - 1] : undefined;
  const bis = schrittBeginn.current[index] ?? Infinity;
  const aufrufeDesSchritts = new Map<string, number>();
  for (const a of [...aufrufe].reverse()) {
    const start = a.zeitpunkt - a.dauerMs;
    if (vorher === undefined || start < vorher || start >= bis) continue;
    if (/^\/(verwaltung|information)\//.test(a.pfad) || a.pfad.endsWith('/metadata')) continue;
    const zeile = `${a.status ?? '—'} ${a.methode} ${pfadKurz(a.pfad)}`;
    aufrufeDesSchritts.set(zeile, (aufrufeDesSchritts.get(zeile) ?? 0) + 1);
  }
  const fehlklicks = ereignisse.current.filter((e) => e.art === 'fehlklick').length;
  const hilfen = ereignisse.current.filter((e) => e.art === 'hilfe').length;

  return createPortal(
    <div {...{ [KLICKPFAD_ATTRIBUT]: '' }}>
      {zeigeRahmen && (
        <div
          className={`klickpfad-rahmen ${modus === 'gefuehrt' ? 'abgedunkelt' : ''} ${blitz % 2 ? 'blitz-a' : blitz ? 'blitz-b' : ''}`}
          style={{
            top: rahmen.top - 4,
            left: rahmen.left - 4,
            width: rahmen.width + 8,
            height: rahmen.height + 8,
          }}
          aria-hidden="true"
        />
      )}
      {zeigeRahmen && schritt && (
        <Sprechblase rahmen={rahmen}>
          <span className="klickpfad-nummer">
            {index + 1}/{s.schritte.length}
          </span>{' '}
          {schritt.kurz}
          {schritt.handlung && schritt.handlung.art !== 'klicken' && (
            <button type="button" className="knopf klein" onClick={eintragen}>
              {schritt.handlung.art === 'eingeben'
                ? `„${schritt.handlung.wert}“ eintragen`
                : `„${schritt.handlung.anzeige}“ wählen`}
            </button>
          )}
          {!schritt.handlung && pruefErfuellt && (
            <button type="button" className="knopf klein stark" onClick={() => weiter(index)}>
              ✓ weiter
            </button>
          )}
        </Sprechblase>
      )}

      <aside className="klickpfad-leiste" aria-label="Klickpfad">
        <div className="klickpfad-kopf">
          Klickpfad
          <button type="button" className="knopf klein rechts" onClick={beenden}>
            beenden
          </button>
        </div>
        <h2 className="klickpfad-titel">{s.titel}</h2>

        <div role="radiogroup" aria-label="Modus" className="klickpfad-modi">
          {(Object.keys(MODUS_BEZEICHNUNG) as Modus[]).map((m) => (
            <label key={m}>
              <input
                type="radio"
                name="klickpfad-modus"
                checked={modus === m}
                onChange={() => modusWechseln(m)}
              />{' '}
              {MODUS_BEZEICHNUNG[m]}
            </label>
          ))}
        </div>

        {typeof lage === 'object' && (
          <p className="klickpfad-fehler" role="alert">
            {lage.fehler}
          </p>
        )}
        {lage === 'startet' && <p className="leise-klein">Startzustand wird hergestellt …</p>}

        {modus === 'aufgabe' ? (
          <>
            <p className="klickpfad-aufgabe">{s.aufgabe}</p>
            {lage === 'laeuft' && (
              <button type="button" className="knopf klein" onClick={hilfeZeigen} disabled={hilfe}>
                Hilfe: nächster Schritt
              </button>
            )}
            {hilfe && schritt && <p className="leise-klein">{schritt.kurz}</p>}
          </>
        ) : (
          <>
            <p className="leise-klein">{s.frage}</p>
            <ol className="klickpfad-schritte">
              {s.schritte.map((x, i) => (
                <li
                  key={i}
                  className={
                    i < index || lage === 'fertig' ? 'erledigt' : i === index ? 'aktuell' : ''
                  }
                  aria-current={i === index && lage === 'laeuft' ? 'step' : undefined}
                >
                  {x.kurz}
                </li>
              ))}
            </ol>
            {lage === 'laeuft' && schritt?.lang && (
              <p className="klickpfad-erlaeuterung">{schritt.lang}</p>
            )}
            {aufrufeDesSchritts.size > 0 && index > 0 && (
              <div className="klickpfad-aufrufe">
                <div className="leise-klein">ePA-Aufrufe bei „{s.schritte[index - 1]!.kurz}“</div>
                <ul>
                  {[...aufrufeDesSchritts].map(([zeile, n]) => (
                    <li key={zeile}>
                      <code>{zeile}</code>
                      {n > 1 && <span className="leise-klein"> ×{n}</span>}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}

        <p className="klickpfad-live" aria-live="polite">
          {lage === 'laeuft' && modus !== 'aufgabe' && schritt
            ? `Schritt ${index + 1}: ${schritt.kurz}`
            : ''}
          {blitz > 0 && modus === 'gefuehrt' && lage === 'laeuft' ? ' — hier geht es weiter.' : ''}
        </p>

        {lage === 'laeuft' && ausserhalb && (modus !== 'aufgabe' || hilfe) && (
          <p>
            <span className="leise-klein">
              Der nächste Schritt liegt außerhalb des Bildausschnitts.
            </span>{' '}
            <button
              type="button"
              className="knopf klein"
              onClick={() =>
                schritt &&
                finden(schritt.ziel)?.scrollIntoView({ block: 'center', behavior: 'smooth' })
              }
            >
              zeigen
            </button>
          </p>
        )}
        {/* Als Aufgabe verriete der Hinweis den Weg — dort erst nach „Hilfe“. */}
        {lage === 'laeuft' && verloren && (modus !== 'aufgabe' || hilfe) && (
          <p>
            <span className="leise-klein">Der nächste Schritt ist hier nicht zu sehen.</span>{' '}
            <button type="button" className="knopf klein" onClick={() => void nachspielen(index)}>
              zurück zum Pfad
            </button>
          </p>
        )}

        {lage === 'fertig' && (
          <div className="klickpfad-fertig" role="status">
            <b>Geschafft.</b>
            {modus === 'aufgabe' && (
              <span>
                {' '}
                {sekunde().toLocaleString('de-DE')} s · {fehlklicks}{' '}
                {fehlklicks === 1 ? 'Fehlklick' : 'Fehlklicks'} · {hilfen}{' '}
                {hilfen === 1 ? 'Hilfe' : 'Hilfen'}
              </span>
            )}
          </div>
        )}

        <div className="klickpfad-knoepfe">
          {index > 0 && lage === 'laeuft' && (
            <button
              type="button"
              className="knopf klein"
              onClick={() => {
                notieren({ art: 'zurueck', schritt: index });
                void nachspielen(index - 1);
              }}
            >
              ← Schritt zurück
            </button>
          )}
          <button type="button" className="knopf klein" onClick={() => void nachspielen(0)}>
            neu beginnen
          </button>
          {modus === 'aufgabe' && (
            <button type="button" className="knopf klein" onClick={protokollHerunterladen}>
              Protokoll herunterladen
            </button>
          )}
        </div>
      </aside>
    </div>,
    document.body,
  );
}

/** Kurzer Text am Element — unterhalb, wenn Platz ist, sonst darüber. */
function Sprechblase({ rahmen, children }: { rahmen: Rahmen; children: React.ReactNode }) {
  const unten = window.innerHeight - rahmen.bottom > 140;
  const links = Math.max(8, Math.min(rahmen.left, window.innerWidth - 360 - 320));
  return (
    <div
      className={`klickpfad-blase ${unten ? 'unten' : 'oben'}`}
      style={
        unten ? { top: rahmen.bottom + 10, left: links } : { top: rahmen.top - 10, left: links }
      }
    >
      {children}
    </div>
  );
}
