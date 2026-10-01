import { Link } from 'react-router-dom';
import {
  TERMINART_BEZEICHNUNG,
  TERMINSTATUS_BEZEICHNUNG,
  type Terminstatus,
  deutschesDatum,
} from '@demo-pvs/kern';
import { ausfuehren, useZustand } from '../speicher/speicher.js';
import { vorgaenge } from '../speicher/vorgaenge.js';
import { Karte, Leer, Marker } from '../bausteine/Bausteine.js';
import { BefugnisMarker, EgkKnopf, istGueltig } from '../epa/befugnis.js';

const NAECHSTER_STATUS: Partial<Record<Terminstatus, Terminstatus>> = {
  geplant: 'wartend',
  wartend: 'inBehandlung',
  inBehandlung: 'erledigt',
};

const STATUS_TON = {
  geplant: 'neutral',
  wartend: 'warn',
  inBehandlung: 'akzent',
  erledigt: 'gut',
  abgesagt: 'neutral',
} as const;

export function Tagesuebersicht() {
  const heute = useZustand((z) => z.heute);
  const termine = useZustand((z) => z.termine);
  const patienten = useZustand((z) => z.patienten);
  const befugnisse = useZustand((z) => z.epaBefugnisse);

  const heutige = termine
    .filter((t) => t.datum === heute)
    .slice()
    .sort((a, b) => a.uhrzeit.localeCompare(b.uhrzeit));
  const kommende = termine
    .filter((t) => t.datum > heute)
    .slice()
    .sort((a, b) => (a.datum + a.uhrzeit).localeCompare(b.datum + b.uhrzeit));

  const name = (patientId: string) => {
    const p = patienten.find((x) => x.id === patientId);
    return p ? `${p.vorname} ${p.nachname}` : 'unbekannt';
  };

  return (
    <>
      <h1 style={{ marginBottom: 14 }}>Tagesübersicht</h1>

      <Karte titel={`Sprechstunde am ${deutschesDatum(heute)}`}>
        <p className="leise-klein">
          Mit dem Einlesen der eGK erhält die Praxis eine Befugnis für die ePA — 90 Tage lang
          (Konzept ePA 3.1.3). Ohne sie gibt die ePA keine Daten heraus.
        </p>
        {heutige.length === 0 ? (
          <Leer>Für heute sind keine Termine eingetragen.</Leer>
        ) : (
          <table className="liste">
            <thead>
              <tr>
                <th>Zeit</th>
                <th>Patient:in</th>
                <th>Anlass</th>
                <th>Art</th>
                <th>Status</th>
                <th>eGK · ePA</th>
                <th>
                  <span className="nur-fuer-screenreader">Aktionen</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {heutige.map((t) => {
                const naechster = NAECHSTER_STATUS[t.status];
                return (
                  <tr key={t.id}>
                    <td>
                      <span className="code">{t.uhrzeit}</span>
                    </td>
                    <td>
                      <Link to={`/patient/${t.patientId}/karteikarte`}>{name(t.patientId)}</Link>
                    </td>
                    <td>{t.anlass}</td>
                    <td>{TERMINART_BEZEICHNUNG[t.art]}</td>
                    <td>
                      <Marker ton={STATUS_TON[t.status]}>
                        {TERMINSTATUS_BEZEICHNUNG[t.status]}
                      </Marker>
                    </td>
                    <td>
                      <div className="reihe" style={{ gap: 6 }}>
                        <BefugnisMarker patientId={t.patientId} />
                        {!istGueltig(
                          befugnisse.find((b) => b.patientId === t.patientId) ?? null,
                        ) && <EgkKnopf patientId={t.patientId} />}
                      </div>
                    </td>
                    <td>
                      {naechster && (
                        <button
                          type="button"
                          className="knopf klein"
                          onClick={() => ausfuehren(vorgaenge.terminstatusSetzen(t.id, naechster))}
                        >
                          {TERMINSTATUS_BEZEICHNUNG[naechster]}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Karte>

      <Karte titel="Kommende Termine">
        {kommende.length === 0 ? (
          <Leer>Keine weiteren Termine vereinbart.</Leer>
        ) : (
          <table className="liste">
            <tbody>
              {kommende.map((t) => (
                <tr key={t.id}>
                  <td style={{ width: 130 }}>
                    {deutschesDatum(t.datum)}, {t.uhrzeit}
                  </td>
                  <td>
                    <Link to={`/patient/${t.patientId}/karteikarte`}>{name(t.patientId)}</Link>
                  </td>
                  <td>{t.anlass}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Karte>
    </>
  );
}
