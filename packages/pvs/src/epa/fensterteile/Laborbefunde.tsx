import { useEffect, useState } from 'react';
import { deutschesDatum, laborbefundLesen } from '@demo-pvs/kern';
import { Leer, Marker } from '../../bausteine/Bausteine.js';
import { Befundansicht } from '../../bausteine/Befundansicht.js';
import { DokumentBetrachter } from '../../bausteine/DokumentBetrachter.js';
import { istStrukturiert } from '../epa-bestand.js';
import { Dokumentzugang, Abschnitt } from './Teile.js';

/** Bereich „Laborbefunde“ des ePA-Fensters: Befunde als PDF und strukturiert (dgLP). */

export function LaborbefundeInEpa({
  patientId,
  verweise,
  lokalNachEpaId,
  inhalte,
  abrufen,
  uebernehmen,
  laeuft,
}: Dokumentzugang & { laeuft: boolean }) {
  // Ergebnisse der Diagnostik — im Release als PDF, in der Weiterentwicklung strukturiert (dgLP).
  const kandidaten = verweise.filter((v) => v.typ?.code === 'BEFU');
  const [offen, setzeOffen] = useState<string | null>(null);

  useEffect(() => {
    void abrufen(kandidaten.filter(istStrukturiert));
    // Nur beim Öffnen und wenn neue Kandidaten hinzukommen.
  }, [kandidaten.map((k) => k.id).join('|')]);

  return (
    <Abschnitt titel={`Laborbefunde (${kandidaten.length})`}>
      {kandidaten.length === 0 ? (
        <Leer>Keine Laborbefunde.</Leer>
      ) : (
        kandidaten.map((v) => {
          const lokal = lokalNachEpaId.has(v.id);
          const inhalt = inhalte[v.id]?.inhalt;
          const befund = istStrukturiert(v)
            ? laborbefundLesen(inhalt, patientId, { bestand: 'epa', dokumentId: v.id })
            : null;
          return (
            <div key={v.id} className="epa-betrachter">
              <div className="reihe" style={{ marginBottom: 8 }}>
                <b>{v.titel}</b>
                <span className="leise-klein">
                  {deutschesDatum(v.datum)} · {v.autor}
                </span>
                <Marker ton={istStrukturiert(v) ? 'akzent' : 'neutral'}>
                  {istStrukturiert(v) ? 'FHIR' : 'PDF'}
                </Marker>
                <div className="rechts reihe" style={{ gap: 5 }}>
                  {!istStrukturiert(v) && (
                    <button
                      type="button"
                      className="knopf klein"
                      aria-expanded={offen === v.id}
                      onClick={() => {
                        setzeOffen(offen === v.id ? null : v.id);
                        void abrufen([v]);
                      }}
                    >
                      {offen === v.id ? 'Schließen' : 'Ansehen'}
                    </button>
                  )}
                  {lokal ? (
                    <Marker ton="gut">in der Praxis</Marker>
                  ) : (
                    <button
                      type="button"
                      className="knopf klein stark"
                      onClick={() => void uebernehmen(v)}
                    >
                      Übernehmen
                    </button>
                  )}
                </div>
              </div>
              {befund ? (
                <Befundansicht befund={befund} kompakt />
              ) : istStrukturiert(v) || offen === v.id ? (
                inhalt !== undefined ? (
                  <DokumentBetrachter
                    inhalt={inhalt}
                    patientId={patientId}
                    dokumentId={v.id}
                    bestand="epa"
                  />
                ) : inhalte[v.id]?.fehler ? (
                  <div className="hinweisbox fehler">{inhalte[v.id]?.fehler}</div>
                ) : (
                  <Leer>{laeuft ? 'Wird abgerufen …' : '—'}</Leer>
                )
              ) : null}
            </div>
          );
        })
      )}
    </Abschnitt>
  );
}

/* ---------- Inhalte aus Dokumenten ---------- */
