import { useMemo, useState } from 'react';
import {
  deutschesDatum,
  ebm,
  pruefeLeistung,
  quartalsBezeichnung,
  quartalVon,
  type EbmEintrag,
} from '@demo-pvs/kern';
import { ausfuehren, useZustand } from '../speicher/speicher.js';
import { fallFuer, vorgaenge } from '../speicher/vorgaenge.js';
import { Bestandsband, Karte, Leer, Marker } from '../bausteine/Bausteine.js';
import { usePatientId } from './Patientenkartei.js';
import { Katalogsuche } from '../bausteine/Katalogsuche.js';

export function Abrechnung() {
  const patientId = usePatientId();
  const zustand = useZustand((z) => z);
  const heute = zustand.heute;
  const quartal = quartalVon(heute);
  const fall = fallFuer(zustand, patientId);

  const erfasst = useMemo(
    () =>
      zustand.leistungen
        .filter((l) => l.patientId === patientId && l.fallId === fall.id)
        .slice()
        .sort((a, b) => b.datum.localeCompare(a.datum)),
    [zustand.leistungen, patientId, fall.id],
  );
  const diagnosen = useMemo(
    () => zustand.diagnosen.filter((d) => d.patientId === patientId),
    [zustand.diagnosen, patientId],
  );

  const [gewaehlt, setzeGewaehlt] = useState<EbmEintrag | null>(null);
  const meldungen = gewaehlt
    ? pruefeLeistung(gewaehlt.ziffer, { bestehende: erfasst, diagnosen, datum: heute })
    : [];
  const blockiert = meldungen.some((m) => m.art === 'fehler');

  const fruehereQuartale = zustand.leistungen.filter(
    (l) => l.patientId === patientId && l.fallId !== fall.id,
  );

  return (
    <>
      <Bestandsband lage="lokal" />

      <div className="spalten">
        <div>
          <Karte titel={`Behandlungsfall ${quartalsBezeichnung(quartal)}`}>
            {erfasst.length === 0 ? (
              <Leer>In diesem Quartal ist noch keine Leistung erfasst.</Leer>
            ) : (
              <table className="liste">
                <thead>
                  <tr>
                    <th>Ziffer</th>
                    <th>Bezeichnung</th>
                    <th>Datum</th>
                    <th>Erfasst von</th>
                    <th>
                      <span className="nur-fuer-screenreader">Aktionen</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {erfasst.map((l) => (
                    <tr key={l.id}>
                      <td>
                        <span className="code">{l.ziffer}</span>
                      </td>
                      <td>{l.bezeichnung}</td>
                      <td>{deutschesDatum(l.datum)}</td>
                      <td>{l.erfasstVon}</td>
                      <td>
                        <button
                          type="button"
                          className="knopf klein"
                          onClick={() => ausfuehren(vorgaenge.leistungEntfernen(l.id))}
                        >
                          entfernen
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Karte>

          {fruehereQuartale.length > 0 && (
            <Karte titel="Frühere Quartale">
              <table className="liste">
                <tbody>
                  {fruehereQuartale.map((l) => (
                    <tr key={l.id}>
                      <td style={{ width: 90 }}>
                        <span className="code">{l.ziffer}</span>
                      </td>
                      <td>{l.bezeichnung}</td>
                      <td style={{ width: 110 }}>{deutschesDatum(l.datum)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Karte>
          )}
        </div>

        <div>
          <Karte titel="Leistung erfassen">
            {!gewaehlt ? (
              <Katalogsuche
                beschriftung="EBM-Ziffer suchen"
                eintraege={ebm}
                schluesselVon={(e) => e.ziffer}
                bezeichnungVon={(e) => e.bezeichnung}
                beiAuswahl={setzeGewaehlt}
                platzhalter="Ziffer oder Stichwort, z. B. 03000 oder Gespräch"
              />
            ) : (
              <>
                <div className="hinweisbox">
                  <span className="code">{gewaehlt.ziffer}</span> {gewaehlt.bezeichnung}
                  <div style={{ marginTop: 4, fontSize: '0.9em' }}>{gewaehlt.hinweis}</div>
                  <button
                    type="button"
                    className="knopf klein"
                    style={{ marginTop: 6 }}
                    onClick={() => setzeGewaehlt(null)}
                  >
                    andere Ziffer
                  </button>
                </div>

                {meldungen.map((m, i) => (
                  <div key={i} className={`hinweisbox ${m.art === 'fehler' ? 'fehler' : 'warn'}`}>
                    <b>{m.art === 'fehler' ? 'Nicht ansetzbar.' : 'Hinweis.'}</b> {m.text}
                  </div>
                ))}

                <button
                  type="button"
                  className="knopf stark"
                  disabled={blockiert}
                  onClick={() => {
                    ausfuehren(
                      vorgaenge.leistungErfassen(patientId, gewaehlt.ziffer, gewaehlt.bezeichnung),
                    );
                    setzeGewaehlt(null);
                  }}
                >
                  Ziffer ansetzen
                </button>
              </>
            )}

            <Marker ton="neutral">{ebm.length} Ziffern im Auszug</Marker>
          </Karte>
        </div>
      </div>
    </>
  );
}
