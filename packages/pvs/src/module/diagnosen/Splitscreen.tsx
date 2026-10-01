import { useState, type DragEvent, type ReactNode } from 'react';
import {
  LISTENSTATUS_BEZEICHNUNG,
  SORTIERUNG_BEZEICHNUNG,
  deutschesDatum,
  deutscherZeitpunkt,
  ordnen,
  reihenfolgeAus,
  verschieben,
  type Chronik,
  type Listenstatus,
  type Listenzeile,
  type Ordnungsangaben,
  type Sortierung,
} from '@demo-pvs/kern';
import { Leer, Marker } from '../../bausteine/Bausteine.js';
import type { Listenlage } from '../../epa/listen.js';

/**
 * Splitscreen aus der Liste der ePA und den Einträgen des Praxissystems — für Allergien
 * und Diagnosen: links, was die Praxis
 * führt, rechts, was in der Liste der ePA steht, dazwischen der Abgleich und die Handlungen.
 *
 * Jede Zeile ist kompakt; ein Klick auf die Bezeichnung klappt die Angaben beider Seiten auf.
 * Geordnet wird nach dem Datum der Einstellung oder nach Wahl der Praxis (ADR 0029).
 *
 * Kann die ePA nicht gelesen werden, bleibt die rechte Spalte als eine Fläche stehen, die sagt,
 * warum — die linke bleibt vollständig nutzbar.
 */

const STATUSTON: Record<Listenstatus, 'gut' | 'akzent' | 'lokal' | 'warn' | 'neutral' | 'fehler'> =
  {
    abgeglichen: 'gut',
    'epa-geaendert': 'akzent',
    'lokal-geaendert': 'lokal',
    ungekoppelt: 'warn',
    'nur-lokal': 'neutral',
    'nur-epa': 'akzent',
    'epa-berichtigt': 'fehler',
  };

/** Aufgeklappt oder nicht, und wie man es umschaltet — für die Karten einer Zeile. */
export interface Aufklappen {
  offen: boolean;
  umschalten: () => void;
}

/** Die Ordnung einer Liste, wie sie das Praxissystem führt. */
export interface Ordnung {
  sortierung: Sortierung;
  reihenfolge: readonly string[];
  sortierungSetzen: (s: Sortierung) => void;
  reihenfolgeSetzen: (kennungen: string[]) => void;
}

export function SplitBlock<T>({
  titel,
  liste,
  lage,
  zeilen,
  lokal,
  schluessel,
  verknuepft,
  lokalKarte,
  epaKarte,
  mitte,
  ohneEpa,
  kopf,
  fuss,
  leer,
  anker,
  psAnzahl,
  ordnung,
  angaben,
}: {
  titel: string;
  /** Sprungziel, etwa aus der Patient Summary (`#allergien`). */
  anker?: string;
  /** ✦ Wie viele Einträge der Liste für die Patient Summary markiert sind. */
  psAnzahl?: number;
  /** „Diagnosenliste" oder „Allergienliste". */
  liste: string;
  lage: Listenlage;
  /** Abgeglichene Zeilen — nur, wenn die Liste gelesen wurde. */
  zeilen: Listenzeile<T>[];
  /** Die Einträge des Praxissystems — für die Ansicht ohne ePA. */
  lokal: readonly T[];
  schluessel: (e: T) => string;
  /** Ist der Eintrag mit der Liste verknüpft? Ohne gelesene ePA steht das in der Mitte. */
  verknuepft: (e: T) => boolean;
  lokalKarte: (e: T, a: Aufklappen) => ReactNode;
  epaKarte: (e: T, a: Aufklappen) => ReactNode;
  /** Handlungen zwischen den Spalten, je nach Stand der Zeile. */
  mitte: (z: Listenzeile<T>) => ReactNode;
  /** Die Fläche in der rechten Spalte, wenn die ePA nicht gelesen wurde. */
  ohneEpa: ReactNode;
  kopf?: ReactNode;
  fuss?: ReactNode;
  leer: string;
  ordnung: Ordnung;
  /** Einstelldatum, Beginn, Bezeichnung und Kennungen einer Zeile — für die Ordnung. */
  angaben: (z: Listenzeile<T>) => Ordnungsangaben;
}) {
  const bereit = lage.art === 'bereit';
  const zahl = (s: Listenstatus[]) => zeilen.filter((z) => s.includes(z.status)).length;
  const offen = zahl(['epa-geaendert', 'lokal-geaendert', 'ungekoppelt', 'epa-berichtigt']);
  const aufgeklappt = useAufgeklappt();
  const [gezogen, setzeGezogen] = useState<number | null>(null);

  // Ohne gelesene ePA sind die Zeilen die Einträge der Praxis.
  const roh: Listenzeile<T>[] = bereit
    ? zeilen
    : lokal.map((e) => ({
        schluessel: `l-${schluessel(e)}`,
        lokal: e,
        epa: null,
        status: 'nur-lokal',
        hinweis: null,
      }));
  const geordnet = ordnen(roh, angaben, ordnung.sortierung, ordnung.reihenfolge);
  const eigene = ordnung.sortierung === 'eigene';
  const alleSchluessel = geordnet.map((z) => z.schluessel);
  const alleOffen = aufgeklappt.alleOffen(alleSchluessel);

  function bewegen(von: number, nach: number) {
    ordnung.reihenfolgeSetzen(reihenfolgeAus(verschieben(geordnet, von, nach), angaben));
  }

  const flaeche = (
    <td className="split-zelle epa split-flaeche" rowSpan={Math.max(roh.length, 1)}>
      {ohneEpa}
    </td>
  );

  return (
    <section className="karte split" aria-label={titel} id={anker} tabIndex={-1}>
      <div className="reihe" style={{ marginBottom: 8 }}>
        <h3>{titel}</h3>
        <Marker ton="lokal">{lokal.length} in der Praxis</Marker>
        {bereit && (
          <>
            <Marker ton="akzent">{zeilen.filter((z) => z.epa).length} in der ePA</Marker>
            <Marker ton="gut">{zahl(['abgeglichen'])} abgeglichen</Marker>
            {offen > 0 && <Marker ton="warn">{offen} zu klären</Marker>}
            {psAnzahl !== undefined && (
              <span className="ps-marke">
                <span aria-hidden="true">★</span> {psAnzahl} in der Patient Summary
              </span>
            )}
          </>
        )}
      </div>
      <Listenwerkzeug
        ordnung={ordnung}
        alleOffen={alleOffen}
        leer={geordnet.length === 0}
        alleUmschalten={() => aufgeklappt.alle(alleSchluessel, !alleOffen)}
      />
      {kopf}
      <div className="tabelle-rahmen">
        <table className="split-tabelle">
          <colgroup>
            <col className="split-spalte-seite" />
            <col className="split-spalte-mitte" />
            <col className="split-spalte-seite" />
          </colgroup>
          <thead>
            <tr>
              <th scope="col" className="split-kopf lokal">
                Praxissystem
              </th>
              <th scope="col" className="split-kopf">
                Abgleich
              </th>
              <th scope="col" className="split-kopf epa">
                {liste} der ePA <span className="vorschlagsmarke">✦ Vorschlag</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {geordnet.length === 0 ? (
              <tr>
                {bereit ? (
                  <td colSpan={3}>
                    <Leer>{leer}</Leer>
                  </td>
                ) : (
                  <>
                    <td className="split-zelle lokal">
                      <Leer>{leer}</Leer>
                    </td>
                    <td className="split-mitte" />
                    {flaeche}
                  </>
                )}
              </tr>
            ) : (
              geordnet.map((z, i) => {
                const auf = aufgeklappt.offen(z.schluessel);
                const eingestellt = angaben(z).eingestelltAm;
                const ziehen = eigene
                  ? {
                      draggable: true,
                      onDragStart: () => setzeGezogen(i),
                      onDragOver: (e: DragEvent) => e.preventDefault(),
                      onDrop: () => {
                        if (gezogen !== null) bewegen(gezogen, i);
                        setzeGezogen(null);
                      },
                      onDragEnd: () => setzeGezogen(null),
                    }
                  : {};
                return (
                  <tr
                    key={z.schluessel}
                    className={`split-zeile ${z.status} ${eigene ? 'verschiebbar' : ''} ${gezogen === i ? 'gezogen' : ''}`}
                    {...ziehen}
                  >
                    <td className="split-zelle lokal">
                      {z.lokal ? (
                        lokalKarte(z.lokal, auf)
                      ) : (
                        <span className="split-luecke">nicht in der Praxis</span>
                      )}
                    </td>
                    <td className="split-mitte">
                      {bereit ? (
                        <>
                          <Marker ton={STATUSTON[z.status]}>
                            {LISTENSTATUS_BEZEICHNUNG[z.status]}
                          </Marker>
                          {eingestellt && (
                            <div className="split-datum" title="Eingestellt">
                              {deutschesDatum(eingestellt.slice(0, 10))}
                            </div>
                          )}
                          {z.hinweis && auf.offen && (
                            <div className="split-hinweis">{z.hinweis}</div>
                          )}
                          <div className="split-handlungen">{mitte(z)}</div>
                        </>
                      ) : (
                        <span className="leise-klein">
                          {z.lokal && verknuepft(z.lokal)
                            ? 'in der Liste geführt · Stand nicht gelesen'
                            : 'ePA nicht gelesen'}
                        </span>
                      )}
                      {eigene && (
                        <div className="split-verschieben" role="group" aria-label="Verschieben">
                          <span className="griff" aria-hidden="true">
                            ⋮⋮
                          </span>
                          <button
                            type="button"
                            className="knopf klein"
                            aria-label="nach oben"
                            disabled={i === 0}
                            onClick={() => bewegen(i, i - 1)}
                          >
                            ↑
                          </button>
                          <button
                            type="button"
                            className="knopf klein"
                            aria-label="nach unten"
                            disabled={i === geordnet.length - 1}
                            onClick={() => bewegen(i, i + 1)}
                          >
                            ↓
                          </button>
                        </div>
                      )}
                    </td>
                    {bereit ? (
                      <td className="split-zelle epa">
                        {z.epa ? (
                          epaKarte(z.epa, auf)
                        ) : (
                          <span className="split-luecke">nicht in der ePA</span>
                        )}
                      </td>
                    ) : (
                      i === 0 && flaeche
                    )}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      {fuss}
    </section>
  );
}

/** Sortierung und „alle aufklappen" über einer Liste. */
export function Listenwerkzeug({
  ordnung,
  alleOffen,
  leer,
  alleUmschalten,
}: {
  ordnung: Ordnung;
  alleOffen: boolean;
  leer: boolean;
  alleUmschalten: () => void;
}) {
  return (
    <div className="listenwerkzeug">
      <label>
        <span>Sortierung</span>
        <select
          aria-label="Sortierung"
          value={ordnung.sortierung}
          onChange={(e) => ordnung.sortierungSetzen(e.target.value as Sortierung)}
        >
          {(Object.keys(SORTIERUNG_BEZEICHNUNG) as Sortierung[]).map((s) => (
            <option key={s} value={s}>
              {SORTIERUNG_BEZEICHNUNG[s]}
            </option>
          ))}
        </select>
      </label>
      <button type="button" className="knopf klein" disabled={leer} onClick={alleUmschalten}>
        {alleOffen ? 'alle zuklappen' : 'alle aufklappen'}
      </button>
    </div>
  );
}

/** Welche Einträge aufgeklappt sind — je Ansicht. */
export function useAufgeklappt(): {
  offen: (s: string) => Aufklappen;
  alle: (schluessel: readonly string[], auf: boolean) => void;
  alleOffen: (schluessel: readonly string[]) => boolean;
} {
  const [menge, setzeMenge] = useState<ReadonlySet<string>>(new Set());
  return {
    offen: (s) => ({
      offen: menge.has(s),
      umschalten: () =>
        setzeMenge((alt) => {
          const neu = new Set(alt);
          if (neu.has(s)) neu.delete(s);
          else neu.add(s);
          return neu;
        }),
    }),
    alle: (schluessel, auf) => setzeMenge(auf ? new Set(schluessel) : new Set()),
    alleOffen: (schluessel) => schluessel.length > 0 && schluessel.every((s) => menge.has(s)),
  };
}

/**
 * Kompakte Karte eines Listeneintrags: Bezeichnung als Schalter zum Aufklappen, darunter eine
 * Zeile mit den wichtigsten Angaben; aufgeklappt alles Weitere.
 */
export function Kompaktkarte({
  titel,
  zeile,
  rechts,
  details,
  aufklappen,
  vergangen = false,
  markiert = false,
  berichtigt = false,
}: {
  titel: string;
  zeile: ReactNode;
  rechts?: ReactNode;
  details: ReactNode;
  aufklappen: Aufklappen;
  vergangen?: boolean;
  markiert?: boolean;
  berichtigt?: boolean;
}) {
  return (
    <div
      className={`split-karte kompakt ${vergangen ? 'vergangen' : ''} ${markiert ? 'ps-markiert' : ''}`}
    >
      <div className="kompakt-kopf">
        <button
          type="button"
          className="kompakt-taste"
          aria-expanded={aufklappen.offen}
          onClick={aufklappen.umschalten}
        >
          <span className="kompakt-pfeil" aria-hidden="true" />
          <b className={berichtigt ? 'berichtigt' : undefined}>{titel}</b>
        </button>
        {rechts && <span className="kompakt-rechts">{rechts}</span>}
      </div>
      <div className="kompakt-zeile">{zeile}</div>
      {aufklappen.offen && <div className="kompakt-details">{details}</div>}
    </div>
  );
}

/**
 * Herkunftszeile eines Listeneintrags: „Datum – aus Quelldokument
 * erstellt durch Person". Ohne Quelldokument nennt sie die eintragende Einrichtung.
 */
export function Herkunftszeile({
  chronik,
  dokumentOeffnen,
}: {
  chronik: Chronik;
  dokumentOeffnen?: () => void;
}) {
  const datum = chronik.angelegtAm ? deutschesDatum(chronik.angelegtAm.slice(0, 10)) : '—';
  return (
    <div className="herkunft">
      {datum} –{' '}
      {chronik.quelldokument ? (
        <>
          aus{' '}
          {dokumentOeffnen ? (
            <button type="button" className="kk-sprung" onClick={dokumentOeffnen}>
              {chronik.quelldokument.anzeige}
            </button>
          ) : (
            <b>{chronik.quelldokument.anzeige}</b>
          )}
        </>
      ) : (
        <>
          eingetragen von <b>{chronik.angelegtVon}</b>
        </>
      )}
      {chronik.erstelltDurch && (
        <>
          {' '}
          erstellt durch <b>{chronik.erstelltDurch}</b>
        </>
      )}
      {chronik.aenderungen > 0 && (
        <div>
          zuletzt geändert {deutscherZeitpunkt(chronik.zuletztAm)} von <b>{chronik.zuletztVon}</b>
        </div>
      )}
    </div>
  );
}
