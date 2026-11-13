import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { pfadKurz, useAufrufe } from '../epa/protokoll.js';
import { adresseFuehren } from './aufruf.js';
import { pfadNachspielen, wertSetzen } from './ausfuehren.js';
import {
  KLICKPFAD_ATTRIBUT,
  erfuellt,
  finden,
  ganzSichtbar,
  geklicktBeschreibung,
  markierungsRahmen,
  zielBeschreibung,
  type Rahmen,
} from './finden.js';
import { imRepository } from '../demo/dokumentation.js';
import {
  MODUS_BEZEICHNUNG,
  modiVon,
  type Modus,
  type Schritt,
  type Szenario,
  type Ziel,
} from './szenario.js';
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
/** So lange darf das Ziel frei fehlen, bevor „zurück zum Pfad“ erscheint. */
const VERLOREN_MS = 2500;
/** Geführt ist alles außer dem Ziel gesperrt — fehlt es, braucht es den Ausweg rasch. */
const VERLOREN_GEFUEHRT_MS = 800;
/** So lange muss das Ziel ruhig im Blick stehen, bis der Rundgang aufhört, es nachzurücken. */
const RUHIG_MS = 1000;
/** Höchstbreite der Sprechblase (`.klickpfad-blase`) und der Platz, den sie über oder unter dem Ziel braucht. */
const BLASE_BREITE = 320;
const BLASE_HOEHE = 140;

export default function KlickpfadEbene({ id, modus }: { id: string; modus: Modus }) {
  // „beenden“ hängt die Ebene ganz aus: Sperre, Rand und Adresse gehen mit ihr.
  const [offen, setzeOffen] = useState(true);
  if (!offen) return null;
  const beenden = () => {
    adresseFuehren(null);
    setzeOffen(false);
  };
  const s = SZENARIEN[id];
  if (!s) return <Unbekannt id={id} beenden={beenden} />;
  // Nennt die Adresse einen Modus, den der Klickpfad nicht anbietet, beginnt er im ersten.
  const erlaubt = modiVon(s);
  return (
    <Rundgang s={s} startmodus={erlaubt.includes(modus) ? modus : erlaubt[0]!} beenden={beenden} />
  );
}

function Unbekannt({ id, beenden }: { id: string; beenden: () => void }) {
  return createPortal(
    <aside className="klickpfad-leiste" aria-label="Klickpfad" {...{ [KLICKPFAD_ATTRIBUT]: '' }}>
      <div className="klickpfad-kopf">
        Klickpfad
        <button type="button" className="knopf klein rechts" onClick={beenden}>
          beenden
        </button>
      </div>
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

function Rundgang({
  s,
  startmodus,
  beenden,
}: {
  s: Szenario;
  startmodus: Modus;
  beenden: () => void;
}) {
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
  const ereignisse = useRef<Ereignis[]>([]);
  const beginn = useRef(performance.now());
  const schrittBeginn = useRef<number[]>([]);
  const fehltSeit = useRef<number | null>(null);
  /**
   * Der Rundgang rückt das Ziel dieses Schritts in den Blick, bis es eine Weile ruhig zu sehen ist
   * — die Ansicht lädt nach und verschiebt sich. Eigenes Scrollen oder Bedienen beendet das.
   */
  const nachruecken = useRef<{ schritt: number; ruhigSeit: number | null } | null>(null);
  const leiste = useRef<HTMLElement>(null);

  const schritt = s.schritte[index];
  const sekunde = () => Math.round((performance.now() - beginn.current) / 100) / 10;
  /** Dauer bis zum Ziel — nach „Geschafft“ steht sie still. */
  const ende = useRef<number | null>(null);
  const dauer = () => (lage === 'fertig' && ende.current !== null ? ende.current : sekunde());
  const notieren = useCallback(
    (e: Omit<Ereignis, 'sekunde'>) => ereignisse.current.push({ ...e, sekunde: sekunde() }),
    [],
  );

  /** Der aktuelle Schritt, ohne auf das Rendern zu warten — Takt und Klick schalten sonst doppelt. */
  const indexRef = useRef(0);

  const zielZeigen = useCallback((i: number) => {
    nachruecken.current = { schritt: i, ruhigSeit: null };
  }, []);

  const schrittBeginnen = useCallback(
    (i: number) => {
      indexRef.current = i;
      schrittBeginn.current[i] = Date.now();
      setzeIndex(i);
      setzePruefErfuellt(false);
      setzeVerloren(false);
      setzeHilfe(false);
      setzeBlitz(0);
      fehltSeit.current = null;
      zielZeigen(i);
    },
    [zielZeigen],
  );

  /** Schritt `von` ist erledigt — nur einmal, auch wenn Takt und Klick es beide melden. */
  const weiter = useCallback(
    (von: number) => {
      if (indexRef.current !== von) return;
      const naechster = von + 1;
      notieren({ art: 'schritt', schritt: naechster });
      if (naechster >= s.schritte.length) {
        indexRef.current = naechster;
        notieren({ art: 'fertig', schritt: naechster });
        ende.current = sekunde();
        setzeLage('fertig');
        return;
      }
      schrittBeginnen(naechster);
    },
    [notieren, s.schritte.length, schrittBeginnen],
  );

  /**
   * Startzustand und die ersten `bis` Schritte nachspielen — Start, „neu beginnen“, „Schritt
   * zurück“, „zurück zum Pfad“ und der Wechsel in die Aufgabe. `neu` beginnt auch die Messung neu.
   * Aufrufe des Nachspielens zählen zu keinem Schritt. Läuft schon eins, bleibt es dabei.
   */
  const nachspielLaeuft = useRef(false);
  const nachspielen = useCallback(
    async (bis: number, { neu = false }: { neu?: boolean } = {}) => {
      if (nachspielLaeuft.current) return;
      nachspielLaeuft.current = true;
      setzeLage('startet');
      setzeRahmen(null);
      try {
        await pfadNachspielen(s, bis, (p) => navigieren(p));
        schrittBeginn.current = [];
        if (neu) {
          ereignisse.current = [];
          beginn.current = performance.now();
        }
        ende.current = null;
        schrittBeginnen(bis);
        setzeLage('laeuft');
      } catch (f) {
        setzeLage({ fehler: (f as Error).message });
      } finally {
        nachspielLaeuft.current = false;
      }
    },
    [s, navigieren, schrittBeginnen],
  );

  // Start: Startzustand herstellen — einmal, auch wenn der StrictMode den Effekt doppelt anstößt.
  const gestartet = useRef(false);
  useEffect(() => {
    if (gestartet.current) return;
    gestartet.current = true;
    void nachspielen(0, { neu: true });
  }, [nachspielen]);

  // Platz für die Seitenleiste.
  useEffect(() => {
    document.body.classList.add('mit-klickpfad');
    return () => document.body.classList.remove('mit-klickpfad');
  }, []);

  // Klickpfad und Modus bleiben in der Adresse, auch wenn die Demo ohne Suchparameter navigiert.
  useEffect(() => {
    const fuehren = () => adresseFuehren({ id: s.id, modus });
    fuehren();
    const takt = window.setInterval(fuehren, 500);
    return () => window.clearInterval(takt);
  }, [s.id, modus]);

  // Wer selbst scrollt oder bedient, bestimmt den Ausschnitt; der Rundgang rückt nicht mehr nach.
  useEffect(() => {
    const selbst = () => {
      nachruecken.current = null;
    };
    const arten = ['wheel', 'touchstart', 'pointerdown', 'keydown'] as const;
    for (const a of arten) window.addEventListener(a, selbst, { capture: true, passive: true });
    return () => {
      for (const a of arten) window.removeEventListener(a, selbst, { capture: true });
    };
  }, []);

  // Takt: Ziel suchen, in den Blick rücken, Rahmen messen, Eingaben und Prüfpunkte erkennen.
  useEffect(() => {
    if (lage !== 'laeuft' || !schritt) return;
    const takt = window.setInterval(() => {
      // Eine Erzählung zeigt nichts auf der Seite; sie wartet auf „weiter“.
      if (!schritt.ziel) {
        setzeRahmen(null);
        setzeAusserhalb(false);
        setzeVerloren(false);
        if (modus === 'aufgabe') weiter(index);
        else setzePruefErfuellt(true);
        return;
      }
      const e = finden(schritt.ziel);
      if (!e) {
        setzeRahmen(null);
        setzeAusserhalb(false);
        fehltSeit.current ??= Date.now();
        const grenze = modus === 'gefuehrt' ? VERLOREN_GEFUEHRT_MS : VERLOREN_MS;
        setzeVerloren(Date.now() - fehltSeit.current > grenze);
        return;
      }
      fehltSeit.current = null;
      setzeVerloren(false);
      // Die Ansicht lädt nach und verschiebt sich — einmal scrollen reicht nicht.
      const n = nachruecken.current;
      if ((modus !== 'aufgabe' || hilfe) && n?.schritt === index) {
        if (!ganzSichtbar(e)) {
          n.ruhigSeit = null;
          e.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
        } else if ((n.ruhigSeit ??= Date.now()) < Date.now() - RUHIG_MS) nachruecken.current = null;
      }
      const r = markierungsRahmen(e);
      setzeRahmen(r);
      setzeAusserhalb(r === null);
      /*
       * Wie weit ist die Person schon? Erfüllte Eingaben ab dem aktuellen Schritt gelten bis zum
       * nächsten Klickschritt als erledigt. Ein erfüllter Prüfpunkt wartet geführt und frei auf
       * „weiter“ — Zeit zum Lesen —, wird frei aber übergangen, wenn die Person dahinter schon
       * weitergemacht hat. Als Aufgabe gibt es nichts zu lesen; dort gelten Prüfpunkte sofort.
       */
      let bis = -1;
      for (let i = index; i < s.schritte.length; i++) {
        const x = s.schritte[i]!;
        if (!x.ziel || x.handlung?.art === 'klicken') break;
        if (!x.handlung && i > index && modus === 'gefuehrt') break;
        const xe = i === index ? e : finden(x.ziel);
        if (!xe || !erfuellt(x, xe)) break;
        if (x.handlung || modus === 'aufgabe') bis = i;
      }
      if (bis >= index) for (let i = index; i <= bis; i++) weiter(i);
      else if (!schritt.handlung && erfuellt(schritt, e)) setzePruefErfuellt(true);
    }, TAKT_MS);
    return () => window.clearInterval(takt);
  }, [lage, schritt, index, modus, hilfe, weiter, s.schritte]);

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
    const trifft = (ziel: Ziel | undefined, t: EventTarget | null) => {
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
        if (!x.ziel) return null;
        if (x.handlung?.art === 'klicken') return i > index && trifft(x.ziel, t) ? i : null;
        if (!x.handlung && modus === 'gefuehrt') return null;
        const e = finden(x.ziel);
        // Eine Eingabe darf unvollständig sein, wenn der Klick schon dahinter trifft — wer „migr“
        // tippt und den Treffer wählt, ist weiter. Eine Auswahl und ein Prüfpunkt nicht.
        if (!e || (!erfuellt(x, e) && x.handlung?.art !== 'eingeben')) return null;
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

  /**
   * Geführt und frei wechseln am selben Schritt; der Rundgang rückt das Ziel wieder in den Blick.
   * Die Aufgabe beginnt von vorn mit neuer Messung — Zeit, Fehlklicks und Hilfen eines halb
   * gezeigten Pfads taugen für keinen Nutzertest. Zurück aus der Aufgabe bleibt der Stand.
   */
  function modusWechseln(m: Modus) {
    if (m === modus) return;
    notieren({ art: 'modus', schritt: index, element: m });
    setzeModus(m);
    fehltSeit.current = null;
    setzeVerloren(false);
    if (m === 'aufgabe') void nachspielen(0, { neu: true });
    else zielZeigen(index);
  }

  function hilfeZeigen() {
    setzeHilfe(true);
    zielZeigen(index);
    notieren({ art: 'hilfe', schritt: index });
  }

  function zeigen() {
    zielZeigen(index);
    if (schritt) finden(schritt.ziel)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
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
      dauerSekunden: dauer(),
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

  const startet = lage === 'startet';
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
        <Sprechblase rahmen={rahmen} leiste={leiste.current}>
          <span className="klickpfad-nummer">
            {index + 1}/{s.schritte.length}
          </span>{' '}
          {schritt.kurz}
          {schritt.handlung && schritt.handlung.art !== 'klicken' && (
            <button type="button" className="knopf klein" onClick={eintragen}>
              {schritt.handlung.art === 'eingeben'
                ? schritt.handlung.frei
                  ? 'Vorschlag eintragen'
                  : `„${schritt.handlung.wert}“ eintragen`
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

      <aside ref={leiste} className="klickpfad-leiste" aria-label="Klickpfad">
        <div className="klickpfad-kopf">
          Klickpfad
          <button type="button" className="knopf klein rechts" onClick={beenden}>
            beenden
          </button>
        </div>
        <h2 className="klickpfad-titel">{s.titel}</h2>

        <div role="radiogroup" aria-label="Modus" className="klickpfad-modi">
          {modiVon(s).map((m) => (
            <label key={m}>
              <input
                type="radio"
                name="klickpfad-modus"
                checked={modus === m}
                disabled={startet}
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
            <Schrittliste s={s} index={index} lage={lage} />
            {lage === 'laeuft' &&
              schritt &&
              (schritt.lang || !schritt.handlung || schritt.mehr) && (
                <div className="klickpfad-erlaeuterung">
                  {!schritt.ziel && <h3 className="klickpfad-erzaehlung">{schritt.kurz}</h3>}
                  {absaetze(schritt.lang).map((a, i) => (
                    <p key={i}>{a}</p>
                  ))}
                  {schritt.mehr && <MehrDazu verweise={schritt.mehr} />}
                  {/* Erzählungen und Prüfpunkte: „weiter“ auch hier, nicht nur an der Sprechblase —
                    sie kann verdeckt sein, und wer liest, ist ohnehin in der Seitenleiste. */}
                  {!schritt.handlung && (
                    <button
                      type="button"
                      className="knopf klein stark"
                      disabled={!pruefErfuellt}
                      onClick={() => weiter(index)}
                    >
                      weiter →
                    </button>
                  )}
                </div>
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
            <button type="button" className="knopf klein" onClick={zeigen}>
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
                {dauer().toLocaleString('de-DE')} s · {fehlklicks}{' '}
                {fehlklicks === 1 ? 'Fehlklick' : 'Fehlklicks'} · {hilfen}{' '}
                {hilfen === 1 ? 'Hilfe' : 'Hilfen'}
              </span>
            )}
          </div>
        )}

        <div className="klickpfad-knoepfe">
          {/* Als Aufgabe verriete „Schritt zurück“ die Schritte; dort nur „neu beginnen“. */}
          {modus !== 'aufgabe' && (lage === 'fertig' || (lage === 'laeuft' && index > 0)) && (
            <button
              type="button"
              className="knopf klein"
              onClick={() => {
                notieren({ art: 'zurueck', schritt: index });
                void nachspielen(lage === 'fertig' ? s.schritte.length - 1 : index - 1);
              }}
            >
              ← Schritt zurück
            </button>
          )}
          <button
            type="button"
            className="knopf klein"
            disabled={startet}
            onClick={() => void nachspielen(0, { neu: true })}
          >
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

/** Absätze einer Erläuterung — getrennt durch eine Leerzeile. */
function absaetze(text: string | undefined): string[] {
  return (text ?? '')
    .split(/\n\s*\n/)
    .map((a) => a.trim())
    .filter(Boolean);
}

/** Wo es in der Dokumentation weitergeht — im Repository, in einem neuen Fenster. */
function MehrDazu({ verweise }: { verweise: { text: string; pfad: string }[] }) {
  return (
    <p className="klickpfad-mehr">
      Mehr dazu:{' '}
      {verweise.map((v, i) => (
        <span key={v.pfad}>
          {i > 0 && ' · '}
          <a href={imRepository(v.pfad)} target="_blank" rel="noreferrer">
            {v.text} ↗
          </a>
        </span>
      ))}
    </p>
  );
}

/**
 * Die Schritte in der Seitenleiste. Mit Kapiteln: alle Kapitel, aufgeklappt nur das aktuelle —
 * ein langer Rundgang bleibt so überschaubar.
 */
function Schrittliste({ s, index, lage }: { s: Szenario; index: number; lage: Lage }) {
  const zustand = (i: number) =>
    i < index || lage === 'fertig' ? 'erledigt' : i === index ? 'aktuell' : '';
  const eintrag = (x: Schritt, i: number) => (
    <li
      key={i}
      className={zustand(i)}
      aria-current={i === index && lage === 'laeuft' ? 'step' : undefined}
    >
      {x.kurz}
    </li>
  );
  const kapitel: { titel: string; von: number; bis: number }[] = [];
  s.schritte.forEach((x, i) => {
    if (x.kapitel || kapitel.length === 0) kapitel.push({ titel: x.kapitel ?? '', von: i, bis: i });
    kapitel[kapitel.length - 1]!.bis = i;
  });
  if (kapitel.length === 1 && !kapitel[0]!.titel)
    return <ol className="klickpfad-schritte">{s.schritte.map(eintrag)}</ol>;
  return (
    <ol className="klickpfad-kapitel">
      {kapitel.map((k) => {
        const hier = index >= k.von && index <= k.bis && lage !== 'fertig';
        const fertig = index > k.bis || lage === 'fertig';
        return (
          <li key={k.von} className={hier ? 'aktuell' : fertig ? 'erledigt' : ''}>
            <span className="klickpfad-kapitel-titel">{k.titel}</span>
            {hier && (
              <ol className="klickpfad-schritte" start={k.von + 1}>
                {s.schritte.slice(k.von, k.bis + 1).map((x, j) => eintrag(x, k.von + j))}
              </ol>
            )}
          </li>
        );
      })}
    </ol>
  );
}

/**
 * Kurzer Text am Element — unterhalb, wenn Platz ist, sonst darüber; nie unter der Seitenleiste
 * (rechts im breiten Fenster, unten im schmalen).
 */
function Sprechblase({
  rahmen,
  leiste,
  children,
}: {
  rahmen: Rahmen;
  leiste: HTMLElement | null;
  children: React.ReactNode;
}) {
  const l = leiste?.getBoundingClientRect();
  const unten = l && l.top > 0 ? l.top : window.innerHeight;
  const rechts = l && l.top <= 0 ? l.left : window.innerWidth;
  const links = Math.max(8, Math.min(rahmen.left, rechts - BLASE_BREITE - 8));
  // Unter dem Ziel, sonst darüber; ist es so groß, dass beides nicht passt (ein ganzes
  // Seitenfenster, eine lange Karte), in seiner oberen Ecke — nie außerhalb des Bildes.
  const lage =
    unten - rahmen.bottom > BLASE_HOEHE ? 'unten' : rahmen.top > BLASE_HOEHE ? 'oben' : 'innen';
  const stil =
    lage === 'unten'
      ? { top: rahmen.bottom + 10, left: links }
      : lage === 'oben'
        ? { top: rahmen.top - 10, left: links }
        : { top: Math.max(rahmen.top, 0) + 10, left: Math.max(links, rahmen.left + 10) };
  return (
    <div className={`klickpfad-blase ${lage}`} style={stil}>
      {children}
    </div>
  );
}
