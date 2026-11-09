import {
  PS_AENDERUNGSART_BEZEICHNUNG,
  deutscherZeitpunkt,
  psVerlaufLesen,
  type PsAenderung,
} from '@demo-pvs/kern';
import { useMemo } from 'react';
import { Leer, Marker } from '../bausteine/Bausteine.js';
import { useEpaAbfrage } from './epa-bestand.js';

/**
 * ✦ Änderungsverlauf der Patient Summary: je Änderung Zeitpunkt, Einrichtung, Quelle und was sich
 * in welchem Abschnitt änderte. „Stand ansehen“ zeigt die Patient Summary, wie sie damals galt —
 * gebildet aus dem, was die Quellen zu dem Zeitpunkt führten. Die jüngste Änderung ist der
 * aktuelle Stand.
 */
export function PsVerlauf({
  laden,
  schluessel,
  stand,
  standWaehlen,
}: {
  laden: () => Promise<unknown>;
  /** Ändert er sich — etwa nach „aktualisieren“ —, lädt der Verlauf neu. */
  schluessel: unknown;
  /** Angezeigter früherer Stand, `null` für jetzt. */
  stand: string | null;
  standWaehlen: (zeit: string | null) => void;
}) {
  const abfrage = useEpaAbfrage(laden, [laden, schluessel]);
  const eintraege = useMemo(() => psVerlaufLesen(abfrage.daten), [abfrage.daten]);
  return (
    <section className="ps-verlauf" aria-label="Änderungsverlauf der Patient Summary">
      <h4>Änderungsverlauf</h4>
      {abfrage.laedt && !abfrage.daten ? (
        <Leer>Wird abgefragt …</Leer>
      ) : abfrage.fehler ? (
        <Leer>Der Verlauf ist nicht abrufbar.</Leer>
      ) : eintraege.length === 0 ? (
        <Leer>Keine Änderungen.</Leer>
      ) : (
        <ol className="ps-verlauf-liste">
          {eintraege.map((v, i) => {
            const aktuell = i === 0;
            const angezeigt = aktuell ? stand === null : stand === v.zeit;
            const zeitpunkt = deutscherZeitpunkt(v.zeit);
            return (
              <li key={v.id} className={angezeigt ? 'angezeigt' : undefined}>
                <div className="reihe">
                  <b>{zeitpunkt}</b>
                  <span className="leise-klein">{v.wer.map((w) => w.anzeige).join(', ')}</span>
                  {aktuell && <Marker ton="gut">aktueller Stand</Marker>}
                  {angezeigt ? (
                    <Marker ton="akzent">angezeigt</Marker>
                  ) : (
                    <button
                      type="button"
                      className="knopf klein rechts"
                      aria-label={
                        aktuell ? 'Aktuellen Stand ansehen' : `Stand vom ${zeitpunkt} ansehen`
                      }
                      onClick={() => standWaehlen(aktuell ? null : v.zeit)}
                    >
                      Stand ansehen
                    </button>
                  )}
                </div>
                <ul className="ps-verlauf-aenderungen">
                  {nachAbschnitt(v.aenderungen).map(([titel, liste]) => (
                    <li key={titel}>
                      <span className="leise-klein">{titel}:</span>{' '}
                      {liste.map((a, j) => (
                        <span key={j} className="ps-verlauf-aenderung">
                          <Marker
                            ton={
                              a.art === 'added' ? 'gut' : a.art === 'removed' ? 'fehler' : 'neutral'
                            }
                          >
                            {PS_AENDERUNGSART_BEZEICHNUNG[a.art]}
                          </Marker>{' '}
                          {a.bezeichnung}
                        </span>
                      ))}
                    </li>
                  ))}
                </ul>
                <div className="leise-klein">Quelle: {quellenText(v.quellen)}</div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

/** Änderungen eines Zeitpunkts nach Abschnitt, in der Reihenfolge ihres ersten Auftretens. */
function nachAbschnitt(aenderungen: PsAenderung[]): [string, PsAenderung[]][] {
  const gruppen = new Map<string, PsAenderung[]>();
  for (const a of aenderungen)
    gruppen.set(a.abschnittTitel, [...(gruppen.get(a.abschnittTitel) ?? []), a]);
  return [...gruppen];
}

/** Quellen eines Zeitpunkts, gleiche zusammengefasst: „Änderungseintrag … (9)“. */
function quellenText(quellen: { anzeige: string }[]): string {
  const zahl = new Map<string, number>();
  for (const q of quellen) zahl.set(q.anzeige, (zahl.get(q.anzeige) ?? 0) + 1);
  return [...zahl].map(([a, n]) => (n > 1 ? `${a} (${n})` : a)).join(' · ');
}
