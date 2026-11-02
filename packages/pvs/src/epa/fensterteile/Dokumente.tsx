import { useEffect, useRef, useState } from 'react';
import { deutschesDatum, dokumentinhaltLesen, type Dokumentart } from '@demo-pvs/kern';
import { Leer, Marker } from '../../bausteine/Bausteine.js';
import { DokumentBetrachter } from '../../bausteine/DokumentBetrachter.js';
import { dokumenteSuchen, istDatei, volltextsucheVerfuegbar } from '../dienste/dokumente.js';
import {
  dokumenteSortieren,
  dokumentverweisLesen,
  useBetriebsstand,
  type Dokumentverweis,
} from '../epa-bestand.js';
import { LautInhalt, useBeschriftung } from '../../lotse/beschriftung.js';
import { Dokumentzugang, Abschnitt } from './Teile.js';

/** Bereich „Dokumente“ des ePA-Fensters: Liste nach MHD, Volltextsuche, Ansehen und Übernehmen. */

export function DokumenteInEpa({
  kvnr,
  patientId,
  verweise,
  laedt,
  lokalNachEpaId,
  inhalte,
  abrufen,
  uebernehmen,
  ziel,
}: Dokumentzugang & { kvnr: string; laedt: boolean; ziel: string | null }) {
  const [ansicht, setzeAnsicht] = useState<string | null>(null);
  const betrachter = useRef<HTMLDivElement>(null);
  const [begriff, setzeBegriff] = useState('');
  const [treffer, setzeTreffer] = useState<Dokumentverweis[] | null>(null);
  const [volltext, setzeVolltext] = useState(false);
  const betriebsstand = useBetriebsstand();
  const liste = dokumenteSortieren(treffer ?? verweise);
  const beschriftung = useBeschriftung(kvnr);

  // Die Volltextsuche gibt es erst ab Weiterentwicklung 1 — das Feld erscheint nur, wenn der
  // Dokumentendienst `_content` in seinem CapabilityStatement führt.
  useEffect(() => {
    let abgebrochen = false;
    setzeTreffer(null);
    void volltextsucheVerfuegbar()
      .then((v) => {
        if (!abgebrochen) setzeVolltext(v);
      })
      .catch(() => {
        if (!abgebrochen) setzeVolltext(false);
      });
    return () => {
      abgebrochen = true;
    };
  }, [betriebsstand]);
  const gezeigt = liste.find((v) => v.id === ansicht) ?? null;

  // Sprung aus der Patient Summary: das Quelldokument öffnen, sobald die Liste es kennt.
  const angesprungen = useRef<string | null>(null);
  useEffect(() => {
    if (!ziel || angesprungen.current === ziel) return;
    const v = verweise.find((x) => x.id === ziel);
    if (!v) return;
    angesprungen.current = ziel;
    setzeTreffer(null);
    setzeAnsicht(v.id);
    void abrufen([v]);
  }, [ziel, verweise, abrufen]);
  useEffect(() => {
    if (ansicht && ansicht === angesprungen.current) {
      betrachter.current?.scrollIntoView?.({ block: 'start' });
    }
  }, [ansicht]);

  async function suchen() {
    const b = begriff.trim();
    if (!b) return setzeTreffer(null);
    try {
      setzeTreffer((await dokumenteSuchen(kvnr, b)).map(dokumentverweisLesen));
    } catch {
      setzeTreffer([]);
    }
  }

  return (
    <Abschnitt
      titel={
        treffer
          ? `Treffer (${treffer.length} von ${verweise.length})`
          : `Dokumente (${verweise.length})`
      }
      werkzeuge={
        volltext && (
          <form
            className="reihe"
            role="search"
            onSubmit={(e) => {
              e.preventDefault();
              void suchen();
            }}
          >
            <input
              type="search"
              className="suchfeld"
              aria-label="Volltextsuche in der ePA"
              placeholder="Volltext"
              value={begriff}
              onChange={(e) => {
                setzeBegriff(e.target.value);
                if (!e.target.value) setzeTreffer(null);
              }}
            />
            <button type="submit" className="knopf klein">
              Suchen
            </button>
          </form>
        )
      }
    >
      {laedt ? (
        <Leer>Wird abgefragt …</Leer>
      ) : liste.length === 0 ? (
        <Leer>{treffer ? 'Kein Treffer.' : 'Keine Dokumente.'}</Leer>
      ) : (
        <div className="tabelle-rahmen">
          <table className="liste">
            <thead>
              <tr>
                <th>Datum</th>
                <th>Dokument</th>
                <th>Klasse · Typ</th>
                <th>Format</th>
                <th>In der Praxis</th>
                <th>
                  <span className="nur-fuer-screenreader">Aktionen</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {liste.map((v) => {
                const lokal = lokalNachEpaId.get(v.id);
                return (
                  <tr key={v.id} className={ansicht === v.id ? 'hervorgehoben' : undefined}>
                    <td>{deutschesDatum(v.datum)}</td>
                    <td>
                      <b>{v.titel}</b>
                      <LautInhalt befund={beschriftung.get(v.id)} />
                      <div className="leise-klein">{v.autor}</div>
                    </td>
                    <td>
                      <span className="code" title={v.klasse?.anzeige}>
                        {v.klasse?.code ?? '—'}
                      </span>{' '}
                      <span className="code" title={v.typ?.anzeige}>
                        {v.typ?.code ?? '—'}
                      </span>
                      <div className="leise-klein">{v.typ?.anzeige}</div>
                    </td>
                    <td>
                      {v.format ? (
                        <span className="code" title={v.format.code}>
                          {v.format.anzeige}
                        </span>
                      ) : (
                        <Marker ton="warn" titel="formatCode im Release 3.1.3 nicht registriert">
                          ohne formatCode
                        </Marker>
                      )}
                      <div className="leise-klein">{v.mimeType}</div>
                    </td>
                    <td>
                      {lokal ? (
                        <Marker ton="gut">vorhanden</Marker>
                      ) : (
                        <Marker ton="warn">neu</Marker>
                      )}
                    </td>
                    <td>
                      <div className="reihe" style={{ gap: 5 }}>
                        <button
                          type="button"
                          className="knopf klein"
                          onClick={() => {
                            setzeAnsicht(v.id);
                            void abrufen([v]);
                          }}
                        >
                          Ansehen
                        </button>
                        {!lokal && (
                          <button
                            type="button"
                            className="knopf klein stark"
                            onClick={() => void uebernehmen(v)}
                          >
                            Übernehmen
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {gezeigt && (
        <div ref={betrachter} className="epa-betrachter" aria-label={`Dokument ${gezeigt.titel}`}>
          <div className="reihe" style={{ marginBottom: 8 }}>
            <b>{gezeigt.titel}</b>
            <button type="button" className="knopf klein rechts" onClick={() => setzeAnsicht(null)}>
              Schließen
            </button>
          </div>
          {inhalte[gezeigt.id]?.fehler ? (
            <div className="hinweisbox fehler">{inhalte[gezeigt.id]?.fehler}</div>
          ) : inhalte[gezeigt.id] ? (
            <DokumentBetrachter
              inhalt={inhalte[gezeigt.id]?.inhalt}
              patientId={patientId}
              dokumentId={gezeigt.id}
              bestand="epa"
            />
          ) : (
            <Leer>Wird abgerufen …</Leer>
          )}
        </div>
      )}
    </Abschnitt>
  );
}

export function artZuordnen(v: Dokumentverweis, inhalt: unknown): Dokumentart {
  if (!istDatei(inhalt)) {
    const art = dokumentinhaltLesen(inhalt).art;
    if (art === 'Laborbefund') return 'Laborbefund';
    if (art === 'Entlassbrief') return 'Entlassbrief';
  }
  if (v.typ?.code === 'BEFU') return 'Laborbefund';
  if (v.klasse?.code === 'BRI') return 'Arztbrief';
  if (v.klasse?.code === 'BEF') return 'Befundbericht';
  return 'Sonstiges';
}

/* ---------- Medikation ---------- */
