import {
  GESCHLECHT_BEZEICHNUNG,
  deutscherZeitpunkt,
  deutschesDatum,
  istGueltigeKvnr,
  rechteFuer,
} from '@demo-pvs/kern';
import { ausfuehren, useAuswahl, useZustand } from '../speicher/speicher.js';
import { vorgaenge } from '../speicher/vorgaenge.js';
import { Bestandsband, Karte, Marker } from '../bausteine/Bausteine.js';
import { usePatientId } from './Patientenkartei.js';
import { BefugnisMarker, EgkKnopf, useBefugnis } from '../epa/befugnis.js';

export function Stammdaten() {
  const patientId = usePatientId();
  const patient = useAuswahl((z) => z.patienten.find((p) => p.id === patientId), [patientId]);
  const rolle = useZustand((z) => z.nutzer.rolle);
  const rechte = rechteFuer(rolle);
  const befugnis = useBefugnis(patientId);

  if (!patient) return null;
  const v = patient.versicherung;

  return (
    <>
      <Bestandsband lage="lokal" />

      <div className="spalten">
        <div>
          <Karte titel="Person">
            <table className="liste">
              <tbody>
                <tr>
                  <td style={{ width: 200 }}>
                    <b>Name</b>
                  </td>
                  <td>
                    {patient.nachname}, {patient.vorname}
                  </td>
                </tr>
                <tr>
                  <td>
                    <b>Geburtsdatum</b>
                  </td>
                  <td>{deutschesDatum(patient.geburtsdatum)}</td>
                </tr>
                <tr>
                  <td>
                    <b>Geschlecht</b>
                  </td>
                  <td>{GESCHLECHT_BEZEICHNUNG[patient.geschlecht]}</td>
                </tr>
                <tr>
                  <td>
                    <b>Anschrift</b>
                  </td>
                  <td>
                    {patient.anschrift.strasse} {patient.anschrift.hausnummer}
                    <br />
                    {patient.anschrift.plz} {patient.anschrift.ort}
                  </td>
                </tr>
                <tr>
                  <td>
                    <b>Telefon</b>
                  </td>
                  <td>{patient.telefon}</td>
                </tr>
                <tr>
                  <td>
                    <b>In der Praxis seit</b>
                  </td>
                  <td>{deutschesDatum(patient.angelegtAm.slice(0, 10))}</td>
                </tr>
              </tbody>
            </table>
          </Karte>

          <Karte titel="Versicherung">
            <table className="liste">
              <tbody>
                <tr>
                  <td style={{ width: 200 }}>
                    <b>Versichertennummer</b>
                  </td>
                  <td>
                    <span className="code">{v.kvnr}</span>{' '}
                    {istGueltigeKvnr(v.kvnr) ? (
                      <Marker ton="gut">Prüfziffer stimmig</Marker>
                    ) : (
                      <Marker ton="fehler">Prüfziffer falsch</Marker>
                    )}
                  </td>
                </tr>
                <tr>
                  <td>
                    <b>Kostenträger</b>
                  </td>
                  <td>
                    {v.kostentraeger} <span className="code">IK {v.kostentraegerkennung}</span>
                  </td>
                </tr>
                <tr>
                  <td>
                    <b>Versichertenart</b>
                  </td>
                  <td>{v.versichertenart}</td>
                </tr>
                <tr>
                  <td>
                    <b>Zuzahlung</b>
                  </td>
                  <td>{v.zuzahlungsbefreit ? 'befreit' : 'nicht befreit'}</td>
                </tr>
                <tr>
                  <td>
                    <b>Karte gültig bis</b>
                  </td>
                  <td>{deutschesDatum(v.gueltigBis)}</td>
                </tr>
                <tr>
                  <td>
                    <b>Zuletzt eingelesen</b>
                  </td>
                  <td>
                    {v.zuletztEingelesen ? (
                      deutscherZeitpunkt(v.zuletztEingelesen)
                    ) : (
                      <Marker ton="warn">in diesem Quartal noch nicht</Marker>
                    )}
                  </td>
                </tr>
              </tbody>
            </table>
          </Karte>
        </div>

        <div>
          <Karte titel="Gesundheitskarte">
            <p style={{ fontSize: '0.9em', color: 'var(--text-leise)' }}>
              Das Einlesen ist simuliert. Es gibt keinen Kartenleser und keine Anbindung an die
              Telematikinfrastruktur. Wie im Wirkbetrieb begründet es aber den Behandlungskontext:
              Das Praxissystem registriert den Prüfungsnachweis bei der ePA, die ePA erteilt eine
              Befugnis für 90 Tage (Konzept ePA 3.1.3).
            </p>
            <div className="reihe" style={{ marginBottom: 8 }}>
              <BefugnisMarker patientId={patient.id} />
              {befugnis && (
                <span className="leise-klein">
                  erteilt beim Einlesen am {deutscherZeitpunkt(befugnis.erteiltAm)}
                </span>
              )}
            </div>
            {rechte.darfStammdatenPflegen && (
              <EgkKnopf patientId={patient.id} stark klein={false} beschriftung="Karte einlesen" />
            )}
          </Karte>

          <Karte titel="Hinweis auf der Patientenkarte">
            <div className="feldzeile">
              <label htmlFor="hinweis">Freitext</label>
              <textarea
                id="hinweis"
                value={patient.hinweis ?? ''}
                disabled={!rechte.darfStammdatenPflegen}
                onChange={(e) =>
                  ausfuehren(
                    vorgaenge.stammdatenAendern(patient.id, {
                      hinweis: e.target.value.trim() === '' ? null : e.target.value,
                    }),
                  )
                }
              />
            </div>
            <p style={{ fontSize: '0.82em', color: 'var(--text-sehr-leise)' }}>
              Erscheint im Kopf der Patientenkartei. Bleibt im Praxissystem.
            </p>
          </Karte>
        </div>
      </div>
    </>
  );
}
