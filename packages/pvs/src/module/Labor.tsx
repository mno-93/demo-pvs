import { useMemo, useState } from 'react';
import {
  deutschesDatum,
  laborbefundeAusDokumenten,
  DOKUMENTURSPRUNG_BEZEICHNUNG,
  type Laborbefund,
} from '@demo-pvs/kern';
import { useAuswahl } from '../speicher/speicher.js';
import { Bestandsband, Karte, Leer, Marker } from '../bausteine/Bausteine.js';
import { Befundansicht, Bewertung } from '../bausteine/Befundansicht.js';
import { epaFensterOeffnen } from '../epa/fenster.js';
import { usePatientId } from './Patientenkartei.js';

/**
 * Laborbefunde des Praxissystems.
 *
 * Nur Lesesicht: Laborwerte werden nicht erfasst, sondern aus Laborbefunden gelesen — vom
 * Labor übermittelt oder aus der ePA übernommen (Festlegung vom 10.09.2026). Jeder Wert
 * steht damit in seinem Befund, mit Labor, Freigabe und Referenzbereich. Ein Eingabefeld, das
 * einen Wert ohne Befund entstehen ließe, gibt es nicht.
 */
export function Labor() {
  const patientId = usePatientId();
  const dokumente = useAuswahl(
    (z) => z.dokumente.filter((d) => d.patientId === patientId),
    [patientId],
  );
  const befunde = useMemo(() => laborbefundeAusDokumenten(dokumente), [dokumente]);
  const [gewaehlt, setzeGewaehlt] = useState<string | null>(null);
  const befund = befunde.find((b) => b.dokument.id === gewaehlt) ?? befunde[0] ?? null;

  return (
    <>
      <Bestandsband lage="lokal" />

      {befunde.length === 0 ? (
        <Karte titel="Laborbefunde">
          <Leer>Kein Laborbefund.</Leer>
          <div className="reihe">
            <button
              type="button"
              className="knopf stark"
              onClick={() => epaFensterOeffnen(patientId, 'labor')}
            >
              Laborbefunde in der ePA
            </button>
          </div>
        </Karte>
      ) : (
        <div className="spalten labor-spalten">
          <div>
            <Karte titel={`Laborbefunde (${befunde.length})`}>
              <ul className="befundliste">
                {befunde.map((b) => {
                  const auffaellig = b.werte.filter((w) => w.bewertung !== 'normal').length;
                  return (
                    <li key={b.dokument.id}>
                      <button
                        type="button"
                        className={befund?.dokument.id === b.dokument.id ? 'aktiv' : ''}
                        aria-current={befund?.dokument.id === b.dokument.id}
                        onClick={() => setzeGewaehlt(b.dokument.id)}
                      >
                        <b>{deutschesDatum(b.kopf.entnahme)}</b> · {b.kopf.labor}
                        <span className="leise-klein">
                          {b.werte.length} {b.werte.length === 1 ? 'Wert' : 'Werte'}
                          {auffaellig > 0 ? `, ${auffaellig} auffällig` : ''} ·{' '}
                          {DOKUMENTURSPRUNG_BEZEICHNUNG[b.dokument.ursprung]}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
              <button
                type="button"
                className="knopf klein"
                style={{ marginTop: 10 }}
                onClick={() => epaFensterOeffnen(patientId, 'labor')}
              >
                Laborbefunde in der ePA
              </button>
            </Karte>
          </div>
          <div>
            {befund && (
              <Karte titel={`${befund.dokument.titel} vom ${deutschesDatum(befund.kopf.entnahme)}`}>
                <Befundansicht befund={befund} />
                <p className="leise-klein" style={{ marginTop: 8 }}>
                  {DOKUMENTURSPRUNG_BEZEICHNUNG[befund.dokument.ursprung]}
                </p>
              </Karte>
            )}
          </div>
        </div>
      )}

      {befunde.length > 0 && <Kumulativbefund befunde={befunde} />}
    </>
  );
}

/** Kumulativbefund: je Untersuchung eine Zeile, je Befund eine Spalte — jüngster links. */
function Kumulativbefund({ befunde }: { befunde: Laborbefund[] }) {
  const analyte = new Map<string, string>();
  for (const b of befunde)
    for (const w of b.werte) if (!analyte.has(w.loinc)) analyte.set(w.loinc, w.bezeichnung);
  return (
    <Karte titel="Kumulativbefund">
      <div className="tabelle-rahmen">
        <table className="liste">
          <thead>
            <tr>
              <th>Untersuchung</th>
              {befunde.map((b) => (
                <th key={b.dokument.id} className="zahl">
                  {deutschesDatum(b.kopf.entnahme)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[...analyte].map(([loinc, bezeichnung]) => (
              <tr key={loinc}>
                <td>
                  {bezeichnung}
                  <div className="leise-klein">LOINC {loinc}</div>
                </td>
                {befunde.map((b) => {
                  const w = b.werte.find((x) => x.loinc === loinc);
                  return (
                    <td key={b.dokument.id} className="zahl">
                      {w ? (
                        <>
                          <b>
                            {w.wert} {w.einheit}
                          </b>
                          {w.bewertung !== 'normal' && (
                            <div>
                              <Bewertung wert={w} />
                            </div>
                          )}
                        </>
                      ) : (
                        <span className="leise-klein">—</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Marker ton="neutral">
        aus {befunde.length} Befund{befunde.length === 1 ? '' : 'en'}
      </Marker>
    </Karte>
  );
}
