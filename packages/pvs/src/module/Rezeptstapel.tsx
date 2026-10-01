import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  REZEPTFREIGABE_BEZEICHNUNG,
  deutschesDatum,
  reichweiteTage,
  type Rezept,
  type Rezeptfreigabe,
} from '@demo-pvs/kern';
import { ausfuehren, useZustand } from '../speicher/speicher.js';
import { vorgaenge } from '../speicher/vorgaenge.js';
import { Karte, Leer, Marker } from '../bausteine/Bausteine.js';
import { EpaFehler } from '../epa/klient.js';
import { rezeptSenden } from './medikation/rezepte.js';

/**
 * Signaturstapel: alle vorbereiteten E-Rezepte der Praxis (ADR 0024).
 *
 * Die MFA bereitet vor und gibt frei — freigegeben, mit Hinweis, gesperrt; die Ärztin prüft und
 * signiert gesammelt. ⚠ Die Stapelsignatur mit dem eHBA (eine PIN für mehrere Signaturen) ist
 * als ein Schritt abgebildet; jedes Rezept wird danach einzeln im Fachdienst aktiviert.
 */
export function Rezeptstapel() {
  const rezepte = useZustand((z) => z.rezepte);
  const patienten = useZustand((z) => z.patienten);
  const nutzer = useZustand((z) => z.nutzer);
  const aerztlich = nutzer.rolle === 'aerztin';
  const offen = rezepte.filter((r) => r.status === 'vorbereitet');
  const [gewaehlt, setzeGewaehlt] = useState<Set<string>>(new Set());
  const [meldung, setzeMeldung] = useState<{ gut: boolean; text: string } | null>(null);
  const [laeuft, setzeLaeuft] = useState(false);

  const signierbar = offen.filter((r) => r.freigabe !== 'gesperrt');
  const auswahl = signierbar.filter((r) => gewaehlt.has(r.id));

  async function stapelSignieren() {
    setzeLaeuft(true);
    let gesendet = 0;
    const fehler: string[] = [];
    for (const r of auswahl) {
      try {
        await rezeptSenden(r);
        gesendet += 1;
      } catch (f) {
        fehler.push(
          `${r.arzneimittel.bezeichnung}: ${f instanceof EpaFehler ? f.diagnose : 'Fehler'}`,
        );
      }
    }
    setzeGewaehlt(new Set());
    setzeLaeuft(false);
    setzeMeldung(
      fehler.length === 0
        ? {
            gut: true,
            text: `${gesendet} E-Rezept${gesendet === 1 ? '' : 'e'} signiert und gesendet.`,
          }
        : { gut: false, text: fehler.join(' · ') },
    );
  }

  const name = (r: Rezept) => {
    const p = patienten.find((x) => x.id === r.patientId);
    return p ? `${p.nachname}, ${p.vorname}` : r.patientId;
  };

  return (
    <>
      {meldung && (
        <div className={`hinweisbox ${meldung.gut ? 'gut' : 'fehler'}`} role="status">
          {meldung.text}
        </div>
      )}
      <Karte
        titel={`Signaturstapel (${offen.length})`}
        werkzeuge={
          aerztlich ? (
            <button
              type="button"
              className="knopf stark"
              disabled={auswahl.length === 0 || laeuft}
              onClick={() => void stapelSignieren()}
            >
              {laeuft ? 'wird signiert …' : `Auswahl signieren und senden (${auswahl.length})`}
            </button>
          ) : undefined
        }
      >
        {offen.length === 0 ? (
          <Leer>Keine vorbereiteten E-Rezepte.</Leer>
        ) : (
          <div className="tabelle-rahmen">
            <table className="liste">
              <thead>
                <tr>
                  <th>
                    {aerztlich && (
                      <input
                        type="checkbox"
                        aria-label="Alle signierbaren wählen"
                        checked={auswahl.length === signierbar.length && signierbar.length > 0}
                        onChange={(e) =>
                          setzeGewaehlt(
                            new Set(e.target.checked ? signierbar.map((r) => r.id) : []),
                          )
                        }
                      />
                    )}
                  </th>
                  <th>Person</th>
                  <th>Arzneimittel</th>
                  <th>Reichweite</th>
                  <th>Freigabe</th>
                  <th>Vorbereitet</th>
                </tr>
              </thead>
              <tbody>
                {offen.map((r) => {
                  const tage = reichweiteTage(r.dosierung, r.packungen, r.normgroesse);
                  return (
                    <tr key={r.id}>
                      <td>
                        {aerztlich && (
                          <input
                            type="checkbox"
                            aria-label={`${r.arzneimittel.bezeichnung} für ${name(r)} wählen`}
                            disabled={r.freigabe === 'gesperrt'}
                            checked={gewaehlt.has(r.id)}
                            onChange={(e) => {
                              const neu = new Set(gewaehlt);
                              if (e.target.checked) neu.add(r.id);
                              else neu.delete(r.id);
                              setzeGewaehlt(neu);
                            }}
                          />
                        )}
                      </td>
                      <td>
                        <Link to={`/patient/${r.patientId}/medikation`}>{name(r)}</Link>
                      </td>
                      <td>
                        <b>{r.arzneimittel.bezeichnung}</b>
                        <div className="leise-klein">
                          {r.packungen} × {r.normgroesse} ·{' '}
                          <span className="code">{r.dosierung}</span>
                          {r.empId ? ' · aus dem Plan' : ''}
                        </div>
                      </td>
                      <td className="leise-klein">{tage !== null ? `${tage} Tage` : '—'}</td>
                      <td>
                        <select
                          aria-label="Freigabe"
                          value={r.freigabe}
                          onChange={(e) =>
                            ausfuehren(
                              vorgaenge.rezeptFreigabeSetzen(
                                r.id,
                                e.target.value as Rezeptfreigabe,
                                r.hinweis,
                              ),
                            )
                          }
                        >
                          {(Object.keys(REZEPTFREIGABE_BEZEICHNUNG) as Rezeptfreigabe[]).map(
                            (f) => (
                              <option key={f} value={f}>
                                {REZEPTFREIGABE_BEZEICHNUNG[f]}
                              </option>
                            ),
                          )}
                        </select>
                        {r.hinweis && (
                          <div>
                            <Marker ton={r.freigabe === 'gesperrt' ? 'fehler' : 'warn'}>
                              {r.hinweis}
                            </Marker>
                          </div>
                        )}
                      </td>
                      <td className="leise-klein">
                        {r.vorbereitetVon}
                        <div>{deutschesDatum(r.erstelltAm.slice(0, 10))}</div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Karte>
    </>
  );
}

/** Zahl der vorbereiteten Rezepte — für den Reiter in der Kopfleiste. */
export function useStapelzahl(): number {
  return useZustand((z) => z.rezepte.filter((r) => r.status === 'vorbereitet').length);
}
