import { deutscherZeitpunkt, type GelesenerBefund, type Laborwert } from '@demo-pvs/kern';
import { Marker } from './Bausteine.js';

/**
 * Darstellung eines Laborbefunds nach dgLP — im Labor-Reiter der Kartei ebenso wie im
 * ePA-Fenster. Werte stehen immer in ihrem Befund: mit Labor, Freigabe und Referenzbereich.
 *
 * Die Bewertung trägt Pfeil und Wort, nicht nur Farbe.
 */
export function Befundansicht({
  befund,
  kompakt = false,
}: {
  befund: GelesenerBefund;
  kompakt?: boolean;
}) {
  const { kopf, gruppen } = befund;
  return (
    <div className="befund">
      <dl className="befund-kopf">
        <div>
          <dt>Labor</dt>
          <dd>{kopf.labor}</dd>
        </div>
        <div>
          <dt>Freigabe</dt>
          <dd>
            {deutscherZeitpunkt(kopf.freigabe)} · {kopf.freigebendePerson}
          </dd>
        </div>
        <div>
          <dt>Entnahme</dt>
          <dd>
            {deutscherZeitpunkt(kopf.entnahme)} · {kopf.probenart}
          </dd>
        </div>
        {!kompakt && (
          <>
            <div>
              <dt>Auftragsnummer</dt>
              <dd className="code">{kopf.auftragsnummer}</dd>
            </div>
            <div>
              <dt>Befundkennung</dt>
              <dd className="code" title={`urn:uuid:${kopf.uuid}`}>
                {kopf.uuid.slice(0, 8)}…
              </dd>
            </div>
          </>
        )}
      </dl>

      {gruppen.map((g) => (
        <div key={g.bezeichnung} className="befund-gruppe">
          <div className="befund-gruppe-titel">{g.bezeichnung}</div>
          <table className="liste befund-tabelle">
            <thead>
              <tr>
                <th>Untersuchung</th>
                <th className="zahl">Ergebnis</th>
                <th>Einheit</th>
                <th>Referenzbereich</th>
                <th>Bewertung</th>
              </tr>
            </thead>
            <tbody>
              {g.werte.map((w) => (
                <tr key={w.id} className={w.bewertung !== 'normal' ? 'auffaellig' : undefined}>
                  <td>
                    {w.bezeichnung}
                    <div className="leise-klein">LOINC {w.loinc}</div>
                  </td>
                  <td className="zahl">
                    <b>{w.wert}</b>
                  </td>
                  <td>{w.einheit}</td>
                  <td>{w.referenz}</td>
                  <td>
                    <Bewertung wert={w} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}

      {kopf.beurteilung && (
        <div className="hinweisbox">
          <b>Beurteilung des Labors.</b> {kopf.beurteilung}
        </div>
      )}
    </div>
  );
}

export function Bewertung({ wert }: { wert: Pick<Laborwert, 'bewertung'> }) {
  if (wert.bewertung === 'hoch') return <Marker ton="warn">↑ erhöht</Marker>;
  if (wert.bewertung === 'niedrig') return <Marker ton="warn">↓ erniedrigt</Marker>;
  return <Marker ton="neutral">im Bereich</Marker>;
}
