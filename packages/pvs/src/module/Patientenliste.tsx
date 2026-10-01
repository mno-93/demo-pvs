import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { alterInJahren, deutschesDatum, istGueltigeKvnr } from '@demo-pvs/kern';
import { useZustand } from '../speicher/speicher.js';
import { Karte, Leer, Marker } from '../bausteine/Bausteine.js';

export function Patientenliste() {
  const patienten = useZustand((z) => z.patienten);
  const heute = useZustand((z) => z.heute);
  const [begriff, setzeBegriff] = useState('');

  const gefunden = useMemo(() => {
    const s = begriff.trim().toLowerCase();
    const liste = s
      ? patienten.filter((p) =>
          [
            p.nachname,
            p.vorname,
            p.versicherung.kvnr,
            p.geburtsdatum,
            deutschesDatum(p.geburtsdatum),
          ]
            .join(' ')
            .toLowerCase()
            .includes(s),
        )
      : patienten;
    return liste.slice().sort((a, b) => a.nachname.localeCompare(b.nachname, 'de'));
  }, [patienten, begriff]);

  return (
    <>
      <h1 style={{ marginBottom: 14 }}>Patient:innen</h1>

      <Karte>
        <div className="feldzeile" style={{ marginBottom: 0 }}>
          <label htmlFor="patientensuche">
            Suche nach Name, Geburtsdatum oder Versichertennummer
          </label>
          <input
            id="patientensuche"
            type="search"
            value={begriff}
            autoFocus
            placeholder="z. B. Hoffmann, 14.03.1958 oder A123456780"
            onChange={(e) => setzeBegriff(e.target.value)}
          />
        </div>
      </Karte>

      <Karte titel={`${gefunden.length} von ${patienten.length} Einträgen`}>
        {gefunden.length === 0 ? (
          <Leer>Kein Treffer. In der Demo sind drei Patient:innen angelegt.</Leer>
        ) : (
          <table className="liste">
            <thead>
              <tr>
                <th>Name</th>
                <th>Geburtsdatum</th>
                <th>Alter</th>
                <th>Versichertennummer</th>
                <th>Kostenträger</th>
                <th>Karte eingelesen</th>
              </tr>
            </thead>
            <tbody>
              {gefunden.map((p) => (
                <tr key={p.id}>
                  <td>
                    <Link to={`/patient/${p.id}/karteikarte`}>
                      <b>
                        {p.nachname}, {p.vorname}
                      </b>
                    </Link>
                    {p.hinweis && (
                      <div style={{ fontSize: '0.85em', color: 'var(--text-sehr-leise)' }}>
                        {p.hinweis}
                      </div>
                    )}
                  </td>
                  <td>{deutschesDatum(p.geburtsdatum)}</td>
                  <td>{alterInJahren(p.geburtsdatum, heute)} J.</td>
                  <td>
                    <span className="code">{p.versicherung.kvnr}</span>{' '}
                    {!istGueltigeKvnr(p.versicherung.kvnr) && (
                      <Marker ton="fehler">Prüfziffer falsch</Marker>
                    )}
                  </td>
                  <td>{p.versicherung.kostentraeger}</td>
                  <td>
                    {p.versicherung.zuletztEingelesen ? (
                      deutschesDatum(p.versicherung.zuletztEingelesen.slice(0, 10))
                    ) : (
                      <Marker ton="warn">in diesem Quartal nicht</Marker>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Karte>
    </>
  );
}
