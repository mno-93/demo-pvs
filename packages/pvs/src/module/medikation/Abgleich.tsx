import { useState } from 'react';
import { praxisGeaendert, deutscherZeitpunkt } from '@demo-pvs/kern';
import { Marker } from '../../bausteine/Bausteine.js';
import { EpaFehler } from '../../epa/klient.js';
import { medikationsplanStand } from '../../epa/dienste/medikation.js';
import { Ansichtszeile } from './stand.js';

/** Band „Praxissystem und ePA“ und der Marker je Zeile: wie der Plan der Praxis zum eMP steht (ADR 0046). */

export function Abgleichband({
  kvnr,
  mitEpa,
  grund,
  zuletzt,
  offen,
  lesenachweis,
  neuLaden,
}: {
  kvnr: string;
  mitEpa: boolean;
  /** Warum nicht abgeglichen wird. */
  grund: string | null;
  /** Letzter erfolgreicher Abgleich. */
  zuletzt: string | null;
  /** Unterschiede, die eine Handlung brauchen. */
  offen: number;
  lesenachweis: string | null;
  neuLaden: () => void;
}) {
  const [pruefung, setzePruefung] = useState<string | null>(null);

  async function pruefen() {
    try {
      const aktuell = await medikationsplanStand(kvnr);
      const gleich = aktuell.lesenachweis === lesenachweis;
      setzePruefung(gleich ? 'Plan unverändert' : 'Plan geändert — neu geladen');
      // Die Liste hat keine Chronologie; Abgaben ändern sie auch bei unverändertem Plan.
      neuLaden();
    } catch (f) {
      setzePruefung(f instanceof EpaFehler ? f.diagnose : 'keine Antwort');
    }
  }

  return (
    <div className={`abgleichband ${mitEpa && offen === 0 ? 'synchron' : 'veraltet'}`}>
      <span className="abgleichband-punkt" aria-hidden="true" />
      {mitEpa ? (
        <span>
          <b>Abgeglichen</b>
          {zuletzt && ` · ${deutscherZeitpunkt(zuletzt)}`}
          {offen > 0 && ` · ${offen} ${offen === 1 ? 'Unterschied' : 'Unterschiede'} offen`}
        </span>
      ) : (
        <span>
          <b>Nicht abgeglichen</b>
          {grund && ` · ${grund}`}
          {' · '}
          {zuletzt
            ? `Stand des letzten Abgleichs ${deutscherZeitpunkt(zuletzt)}`
            : 'noch nie mit der ePA abgeglichen'}
        </span>
      )}
      <button
        type="button"
        className="knopf klein rechts"
        disabled={!mitEpa}
        onClick={() => void pruefen()}
      >
        Stand prüfen
      </button>
      {pruefung && <span className="leise-klein">{pruefung}</span>}
    </div>
  );
}

/** Lage eines Eintrags im Abgleich mit dem eMP — ohne eMP, was der letzte Abgleich hinterließ. */
export function AbgleichMarker({ zeile: z }: { zeile: Ansichtszeile }) {
  const lage =
    z.lage ??
    (z.lokal?.epaId ? (praxisGeaendert(z.lokal) ? 'praxis-geaendert' : 'stand') : 'nur-praxis');
  switch (lage) {
    case 'abgeglichen':
    case 'epa-geaendert':
      return <Marker ton="gut">abgeglichen</Marker>;
    case 'stand':
      return (
        <Marker ton="neutral" titel="Stand des letzten Abgleichs">
          verknüpft
        </Marker>
      );
    case 'praxis-geaendert':
      return <Marker ton="warn">lokal geändert</Marker>;
    case 'beide-geaendert':
      return <Marker ton="warn">in beiden geändert</Marker>;
    case 'nur-praxis':
      return <Marker ton="lokal">nur Praxis</Marker>;
    case 'nur-epa':
      return <Marker ton="akzent">nur ePA</Marker>;
    case 'gleiches-mittel':
      return <Marker ton="warn">gleiches Mittel in der ePA</Marker>;
    case 'nicht-in-epa':
      return <Marker ton="warn">nicht mehr in der ePA</Marker>;
  }
}

/* ---------- Handlungen am Plan ---------- */
