import { type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { type LokalesDokument } from '@demo-pvs/kern';
import { Marker } from '../../bausteine/Bausteine.js';
import { type Medikationsliste, type Medikationsplan } from '../dienste/medikation.js';
import {
  fehlerTitel,
  ohneBefugnis,
  type Abfragefehler,
  type Dokumentverweis,
} from '../epa-bestand.js';
import { EgkKnopf } from '../befugnis.js';
import { epaFensterSchliessen } from '../fenster.js';
import { pfadKurz, protokollOeffnen, useAufrufe } from '../protokoll.js';

/** Teile, die mehrere Bereiche des ePA-Fensters nutzen: Abschnitt, Zugriff, Fehler, letzte Aufrufe. */

/** Abgerufene Dokumentinhalte, nach Dokumentkennung. Lebt nur, solange das Fenster offen ist. */
export type Inhaltsspeicher = Record<string, { inhalt?: unknown; fehler?: string }>;

export type Medikation = [Medikationsliste, Medikationsplan];

export interface Dokumentzugang {
  patientId: string;
  verweise: Dokumentverweis[];
  lokalNachEpaId: Map<string, LokalesDokument>;
  inhalte: Inhaltsspeicher;
  abrufen: (v: Dokumentverweis[]) => Promise<Inhaltsspeicher>;
  uebernehmen: (v: Dokumentverweis) => Promise<void>;
}

/* ---------- Bausteine des Fensters ---------- */

export function Zugriffsmarker({
  laedt,
  fehler,
}: {
  laedt: boolean;
  fehler: Abfragefehler | null;
}) {
  if (laedt) return <Marker ton="neutral">wird abgefragt …</Marker>;
  if (fehler)
    return (
      <Marker ton="fehler">
        kein Zugriff ({fehler.status || '—'}
        {fehler.code ? ` ${fehler.code}` : ''})
      </Marker>
    );
  return <Marker ton="gut">Zugriff besteht</Marker>;
}

export function Fehlerlage({
  fehler,
  neuLaden,
  patientId,
}: {
  fehler: Abfragefehler;
  neuLaden: () => void;
  patientId: string;
}) {
  const befugnisFehlt = ohneBefugnis(fehler);
  return (
    <div className={`hinweisbox ${befugnisFehlt ? 'warn' : 'fehler'}`}>
      <b>{fehlerTitel(fehler)}</b>
      <div className="leise-klein" style={{ margin: '4px 0 8px' }}>
        {fehler.text}
      </div>
      {befugnisFehlt ? (
        <EgkKnopf patientId={patientId} stark klein={false} />
      ) : (
        <button type="button" className="knopf klein" onClick={neuLaden}>
          erneut versuchen
        </button>
      )}
    </div>
  );
}

export function LetzteAufrufe() {
  const aufrufe = useAufrufe().slice(0, 3);
  return (
    <footer className="epa-fenster-fuss">
      <span className="leise-klein">Letzte Aufrufe</span>
      {aufrufe.length === 0 ? (
        <span className="leise-klein">—</span>
      ) : (
        aufrufe.map((a) => (
          <span
            key={a.id}
            className={`epa-fuss-aufruf ${a.fehler ? 'fehler' : ''}`}
            title={a.grundlage}
          >
            <b>{a.status ?? '—'}</b> {a.methode} {pfadKurz(a.pfad)}
          </span>
        ))
      )}
      <button type="button" className="knopf klein rechts" onClick={protokollOeffnen}>
        Aufrufprotokoll öffnen
      </button>
    </footer>
  );
}

export function Abschnitt({
  titel,
  werkzeuge,
  children,
}: {
  titel: string;
  werkzeuge?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="epa-abschnitt">
      <div className="reihe" style={{ marginBottom: 8 }}>
        <h3>{titel}</h3>
        {werkzeuge && <div className="rechts reihe">{werkzeuge}</div>}
      </div>
      {children}
    </section>
  );
}

export function ZurKartei({
  patientId,
  ziel,
  children,
}: {
  patientId: string;
  ziel: string;
  children: ReactNode;
}) {
  const navigiere = useNavigate();
  return (
    <button
      type="button"
      className="knopf klein stark"
      onClick={() => {
        epaFensterSchliessen();
        navigiere(`/patient/${patientId}/${ziel}`);
      }}
    >
      {children}
    </button>
  );
}

/* ---------- Übersicht ---------- */
