import { useEffect, useState } from 'react';
import {
  AUTOMATIKART_BEZEICHNUNG,
  DIAGNOSENUMFANG_BEZEICHNUNG,
  DIAGNOSENWEG_BEZEICHNUNG,
  deutscherZeitpunkt,
  schreibtInDieEpa,
} from '@demo-pvs/kern';
import { ausfuehren, useAuswahl, useZustand } from '../../speicher/speicher.js';
import { vorgaenge } from '../../speicher/vorgaenge.js';
import { Marker } from '../../bausteine/Bausteine.js';

/**
 * ✦ Band über den Diagnosen im automatischen Weg (ADR 0063): was das Praxissystem ohne Handlung
 * übertragen und übernommen hat. Was seit dem letzten Öffnen dazukam, trägt „noch nicht
 * angezeigt“ — mit dem Öffnen gilt es als angezeigt.
 */
export function Automatikband({ patientId }: { patientId: string }) {
  const weg = useZustand((z) => z.diagnosenweg);
  const umfang = useZustand((z) => z.diagnosenumfang);
  const vermerke = useAuswahl(
    (z) => z.diagnosenautomatik.filter((v) => v.patientId === patientId),
    [patientId],
  );
  // Was beim Öffnen noch nicht angezeigt war, bleibt für diesen Besuch gekennzeichnet.
  const [neu, setzeNeu] = useState<ReadonlySet<string>>(new Set());
  const [auf, setzeAuf] = useState(false);
  const offene = vermerke.filter((v) => !v.angezeigtAm).map((v) => v.id);
  const offen = offene.join(',');
  useEffect(() => {
    if (offene.length === 0) return;
    setzeNeu((bisher) => new Set([...bisher, ...offene]));
    setzeAuf(true);
    ausfuehren(vorgaenge.automatikAngezeigt(patientId));
    // `offen` steht für `offene`: gleiche Kennungen, gleicher Lauf.
  }, [offen, patientId]);

  if (weg === 'gefuehrt' && vermerke.length === 0) return null;
  const inDieEpa = vermerke.filter((v) => schreibtInDieEpa(v.art)).length;
  const ausDerEpa = vermerke.length - inDieEpa;
  return (
    <details
      className="abgleichband automatikband"
      role="group"
      aria-label="Automatische Übertragung"
      open={auf}
      onToggle={(e) => setzeAuf(e.currentTarget.open)}
    >
      <summary>
        <span className="abgleichband-punkt" aria-hidden="true" />
        <span>
          <b>Automatische Übertragung ✦</b> · {DIAGNOSENWEG_BEZEICHNUNG[weg]}
          {weg === 'gefuehrt' ? '' : ` · ${DIAGNOSENUMFANG_BEZEICHNUNG[umfang]}`}
        </span>
        <span className="rechts reihe">
          <span>
            {inDieEpa} in die ePA · {ausDerEpa} aus der ePA · ohne Handlung
          </span>
          {neu.size > 0 && <Marker ton="warn">{neu.size} neu</Marker>}
        </span>
      </summary>
      {vermerke.length === 0 ? (
        <p>Noch nichts übertragen.</p>
      ) : (
        <table className="liste">
          <thead>
            <tr>
              <th>Zeitpunkt</th>
              <th>Diagnose</th>
              <th>Ohne Handlung</th>
              <th>Einrichtung</th>
              <th>Angezeigt</th>
            </tr>
          </thead>
          <tbody>
            {vermerke.map((v) => (
              <tr key={v.id}>
                <td>{deutscherZeitpunkt(v.zeitpunkt)}</td>
                <td>
                  <span className="code">{v.code}</span> {v.bezeichnung}
                </td>
                <td>{AUTOMATIKART_BEZEICHNUNG[v.art]}</td>
                <td>{v.einrichtung ?? 'Praxis'}</td>
                <td>
                  {v.angezeigtAm ? deutscherZeitpunkt(v.angezeigtAm) : 'noch nicht'}{' '}
                  {neu.has(v.id) && <Marker ton="warn">neu</Marker>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </details>
  );
}
