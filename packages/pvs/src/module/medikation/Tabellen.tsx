import { useMemo, useState } from 'react';
import {
  EMP_STATUS_BEZEICHNUNG,
  amtsPruefen,
  arzneimittel,
  deutschesDatum,
  imGueltigenPlan,
  letzteVerordnung,
  schwersterBefund,
  type Rezept,
  type AmtsUmgebung,
  type ArzneimittelEintrag,
  type EmpStatus,
  type PraxisplanEintrag,
  type SpiegelEintrag,
} from '@demo-pvs/kern';
import { Marker } from '../../bausteine/Bausteine.js';
import { Befundliste } from '../../bausteine/Befundliste.js';
import { textVon } from '../../epa/epa-bestand.js';
import { Listenzeile, Rezeptspur } from './stand.js';

/** Teile der Plan- und Listentabelle: Spur eines Rezepts, Handlungen je Eintrag, die Medikationsliste. */

export const STATUS_TON: Record<EmpStatus, 'gut' | 'neutral' | 'warn'> = {
  aktiv: 'gut',
  pausiert: 'warn',
  beendet: 'neutral',
  abgesetzt: 'neutral',
  'entered-in-error': 'warn',
};

/** Letzte Verschreibung und Abgabe am Planeintrag. */
export function Spur({ spur }: { spur: Rezeptspur }) {
  if (!spur.verordnetAm) return null;
  return (
    <div className="leise-klein">
      verordnet {deutschesDatum(spur.verordnetAm)}
      {spur.abgegebenAm ? ` · abgegeben ${deutschesDatum(spur.abgegebenAm)}` : ' · nicht eingelöst'}
      {spur.mehrfach && (
        <>
          {' '}
          <Marker ton="warn">{spur.mehrfach.length} Arzneimittel abgegeben</Marker>
        </>
      )}
    </div>
  );
}

/** Letzte Verordnung am Eintrag des Medikationsplans der Praxis — ohne ePA keine Abgabe. */
export function PraxisplanSpur({
  eintrag,
  rezepte,
}: {
  eintrag: PraxisplanEintrag;
  rezepte: readonly Rezept[];
}) {
  const letzte = letzteVerordnung(eintrag, rezepte);
  if (!letzte?.gesendetAm) return null;
  return (
    <div className="leise-klein">verordnet {deutschesDatum(letzte.gesendetAm.slice(0, 10))}</div>
  );
}

/* ---------- Abgleich ---------- */

export function Planhandlungen({
  zeile,
  ausfuehren,
}: {
  zeile: Pick<SpiegelEintrag, 'status'>;
  ausfuehren: (status: EmpStatus, text: string) => void;
}) {
  const [rueckfrage, setzeRueckfrage] = useState(false);
  if (rueckfrage) {
    return (
      <div className="rueckfrage-inline" role="group" aria-label="Als fehlerhaft kennzeichnen?">
        <span>Als fehlerhaft kennzeichnen?</span>
        <button
          type="button"
          className="knopf klein stark"
          onClick={() => {
            setzeRueckfrage(false);
            ausfuehren('entered-in-error', 'Als fehlerhaft gekennzeichnet.');
          }}
        >
          ja
        </button>
        <button type="button" className="knopf klein" onClick={() => setzeRueckfrage(false)}>
          nein
        </button>
      </div>
    );
  }
  return (
    <div className="reihe" style={{ gap: 5 }}>
      {zeile.status === 'aktiv' ? (
        <button
          type="button"
          className="knopf klein"
          onClick={() => ausfuehren('pausiert', 'Pausiert.')}
        >
          pausieren
        </button>
      ) : (
        <button
          type="button"
          className="knopf klein"
          onClick={() => ausfuehren('aktiv', 'Fortgesetzt.')}
        >
          fortsetzen
        </button>
      )}
      <button
        type="button"
        className="knopf klein"
        onClick={() => ausfuehren('abgesetzt', 'Abgesetzt.')}
      >
        absetzen
      </button>
      <button type="button" className="knopf klein" onClick={() => setzeRueckfrage(true)}>
        fehlerhaft …
      </button>
    </div>
  );
}

/* ---------- eML ---------- */

export function EmlTabelle({
  zeilen,
  neu,
  darfVerordnen,
  rezept,
  umgebung,
  uebernehmen,
  verknuepfen,
}: {
  zeilen: Listenzeile[];
  /** Seit dem letzten Aufruf neu, von anderen Einrichtungen. */
  neu: ReadonlySet<string>;
  darfVerordnen: boolean;
  rezept: (z: Listenzeile) => void;
  umgebung: AmtsUmgebung;
  uebernehmen: (z: Listenzeile) => void;
  /** Verknüpft den Eintrag mit dem Planeintrag desselben Wirkstoffs (`$link-emp`). */
  verknuepfen: (z: Listenzeile) => void;
}) {
  return (
    <div className="tabelle-rahmen">
      <table className="liste">
        <thead>
          <tr>
            <th>Datum</th>
            <th>Art</th>
            <th>Arzneimittel</th>
            <th>Einrichtung</th>
            <th>Plan</th>
            <th>
              <span className="nur-fuer-screenreader">Aktionen</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {zeilen.map((z) => {
            const katalog = arzneimittel.find((a) => a.atc === z.atc);
            return (
              <tr key={String(z.aussage.id)}>
                <td>{deutschesDatum(z.datum)}</td>
                <td>
                  <Marker ton={z.art === 'Verordnung' ? 'akzent' : 'neutral'}>{z.art}</Marker>
                </td>
                <td>
                  {z.medikament ? textVon(z.medikament) : '—'}
                  {neu.has(String(z.aussage.id)) && <span className="neu-marke">neu</span>}
                  <div className="leise-klein">ATC {z.atc || '—'}</div>
                </td>
                <td className="leise-klein">{z.einrichtung}</td>
                <td>
                  {!z.planeintrag ? (
                    <Marker ton="warn">nicht im Plan</Marker>
                  ) : imGueltigenPlan(z.planeintrag) ? (
                    <Marker ton="gut">im Plan</Marker>
                  ) : (
                    <Marker ton="neutral">
                      im Plan · {EMP_STATUS_BEZEICHNUNG[z.planeintrag.status]}
                    </Marker>
                  )}
                  {z.wirkstoffImPlan && (
                    <div className="leise-klein">
                      Wirkstoff im Plan: {z.wirkstoffImPlan.bezeichnung}
                    </div>
                  )}
                </td>
                <td>
                  <div className="reihe" style={{ gap: 5 }}>
                    {z.art === 'Verordnung' && z.medikament && katalog && (
                      <button type="button" className="knopf klein" onClick={() => rezept(z)}>
                        Rezept
                      </button>
                    )}
                    {darfVerordnen && z.wirkstoffImPlan && (
                      <button
                        type="button"
                        className="knopf klein"
                        aria-label={`verknüpfen mit ${z.wirkstoffImPlan.bezeichnung}`}
                        onClick={() => verknuepfen(z)}
                      >
                        verknüpfen
                      </button>
                    )}
                    {darfVerordnen && !z.planeintrag && z.medikament && katalog && (
                      <UebernahmeKnopf
                        mittel={katalog}
                        umgebung={umgebung}
                        beiUebernahme={() => uebernehmen(z)}
                      />
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ---------- AMTS ---------- */

function UebernahmeKnopf({
  mittel,
  umgebung,
  beiUebernahme,
}: {
  mittel: ArzneimittelEintrag;
  umgebung: AmtsUmgebung;
  beiUebernahme: () => void;
}) {
  const [offen, setzeOffen] = useState(false);
  const befunde = useMemo(() => amtsPruefen(mittel, umgebung), [mittel, umgebung]);
  const schwere = schwersterBefund(befunde);
  if (!offen) {
    return (
      <button type="button" className="knopf klein" onClick={() => setzeOffen(true)}>
        in den Plan{schwere === 'kontraindiziert' ? ' ⚠' : ''}
      </button>
    );
  }
  return (
    <div style={{ minWidth: 260 }}>
      <Befundliste befunde={befunde} />
      <div className="reihe" style={{ gap: 6 }}>
        <button
          type="button"
          className={`knopf klein ${schwere === 'kontraindiziert' ? '' : 'stark'}`}
          onClick={() => {
            beiUebernahme();
            setzeOffen(false);
          }}
        >
          {schwere === 'kontraindiziert' ? 'trotzdem übernehmen' : 'übernehmen'}
        </button>
        <button type="button" className="knopf klein" onClick={() => setzeOffen(false)}>
          abbrechen
        </button>
      </div>
    </div>
  );
}
