import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Marker } from '../../bausteine/Bausteine.js';
import type { Angebot, Quelle } from './angebote.js';

/** Anlegen und Ändern an der Quelle, im Pop-up (`Quellpflege.tsx`). */
export interface Pflege {
  /** Beschriftung des Anlegens, z. B. „Neue Diagnose". */
  neu: string;
  anlegen: () => void;
  aendern: (a: Angebot) => void;
  aenderbar: (a: Angebot) => boolean;
}

/**
 * Ein Abschnitt des Briefs: die gewählten Einträge, je mit Quelle, und ein Menü mit allem, was
 * Praxis und ePA dazu führen. Neues wird nicht im Brief erfasst, sondern in seiner Quelle — bei
 * Diagnosen und Allergien im Pop-up mit der Maske der Liste (`pflege`), sonst über den Verweis
 * unten im Menü.
 */
export function Briefabschnitt({
  titel,
  angebote,
  quellen,
  gewaehlt,
  umschalten,
  erfassen,
  pflege = null,
  gesperrt,
}: {
  titel: string;
  angebote: Angebot[];
  quellen: Quelle[];
  gewaehlt: (a: Angebot) => boolean;
  umschalten: (a: Angebot) => void;
  /** Wo Neues erfasst wird: Reiter der Kartei und Beschriftung. */
  erfassen: { pfad: string; text: string } | null;
  pflege?: Pflege | null;
  gesperrt: boolean;
}) {
  const [offen, setzeOffen] = useState(false);
  const knopf = useRef<HTMLButtonElement | null>(null);
  const auswahl = angebote.filter(gewaehlt);
  const angeboten = angebote.length;

  return (
    <section className="brief-abschnitt" aria-label={titel}>
      <div className="brief-abschnitt-kopf">
        <h4>{titel}</h4>
        <span className="leise-klein">
          {auswahl.length} von {angeboten}
        </span>
        {!gesperrt && pflege && (
          <button type="button" className="knopf klein rechts" onClick={pflege.anlegen}>
            + {pflege.neu}
          </button>
        )}
        {!gesperrt && (
          <button
            ref={knopf}
            type="button"
            className={`knopf klein ${pflege ? '' : 'rechts'}`}
            aria-haspopup="dialog"
            aria-expanded={offen}
            aria-label={`${titel} auswählen`}
            onClick={() => setzeOffen(!offen)}
          >
            Auswählen ▾
          </button>
        )}
      </div>
      {auswahl.length === 0 ? (
        <p className="leise-klein">Nichts ausgewählt.</p>
      ) : (
        <ul className="brief-gewaehlt" aria-label={`${titel} im Brief`}>
          {auswahl.map((a) => (
            <li key={a.id}>
              <span>{a.text}</span>
              <Marker ton={a.bestand === 'epa' ? 'akzent' : 'lokal'}>
                {a.bestand === 'epa' ? 'ePA' : 'Praxis'}
              </Marker>
              {a.marken.includes('neu') && <Marker ton="gut">neu</Marker>}
              {!gesperrt && pflege?.aenderbar(a) && (
                <button
                  type="button"
                  className="knopf klein"
                  aria-label={`${a.text} ändern`}
                  onClick={() => pflege.aendern(a)}
                >
                  Ändern
                </button>
              )}
              {!gesperrt && (
                <button
                  type="button"
                  className="knopf klein"
                  aria-label={`${a.text} entfernen`}
                  onClick={() => umschalten(a)}
                >
                  ×
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {offen && (
        <Menue
          titel={titel}
          angebote={angebote}
          quellen={quellen}
          gewaehlt={gewaehlt}
          umschalten={umschalten}
          erfassen={erfassen}
          pflege={pflege}
          schliessen={() => {
            setzeOffen(false);
            knopf.current?.focus();
          }}
          knopf={knopf}
        />
      )}
    </section>
  );
}

function Menue({
  titel,
  angebote,
  quellen,
  gewaehlt,
  umschalten,
  erfassen,
  pflege,
  schliessen,
  knopf,
}: {
  titel: string;
  angebote: Angebot[];
  quellen: Quelle[];
  gewaehlt: (a: Angebot) => boolean;
  umschalten: (a: Angebot) => void;
  erfassen: { pfad: string; text: string } | null;
  pflege: Pflege | null;
  schliessen: () => void;
  knopf: React.RefObject<HTMLButtonElement | null>;
}) {
  const rahmen = useRef<HTMLDivElement | null>(null);
  const [filter, setzeFilter] = useState('');

  // Die Rückmeldung ist bei jedem Zeichnen neu; der Hörer soll trotzdem nur einmal hängen.
  const zu = useRef(schliessen);
  zu.current = schliessen;
  useEffect(() => {
    rahmen.current?.querySelector('input')?.focus();
    const draussen = (e: MouseEvent) => {
      const ziel = e.target as Node;
      if (!rahmen.current?.contains(ziel) && !knopf.current?.contains(ziel)) zu.current();
    };
    document.addEventListener('mousedown', draussen);
    return () => document.removeEventListener('mousedown', draussen);
  }, [knopf]);

  const passt = (a: Angebot) =>
    !filter.trim() ||
    `${a.text} ${a.marken.join(' ')}`.toLowerCase().includes(filter.trim().toLowerCase());

  return (
    <div
      ref={rahmen}
      className="brief-menue"
      role="dialog"
      aria-label={`${titel} auswählen`}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          schliessen();
        }
      }}
    >
      <input
        type="search"
        aria-label="Filtern"
        placeholder="Filtern"
        value={filter}
        onChange={(e) => setzeFilter(e.target.value)}
      />
      {quellen.map((q) => {
        const eintraege = angebote.filter((a) => a.quelle === q.name && passt(a));
        return (
          <fieldset key={q.name} className="brief-menue-gruppe">
            <legend>
              <Marker ton={q.bestand === 'epa' ? 'akzent' : 'lokal'}>
                {q.bestand === 'epa' ? 'ePA' : 'Praxis'}
              </Marker>{' '}
              {q.name.replace(/^(Praxis|ePA) · /, '')}
            </legend>
            {q.zustand ? (
              <p className="leise-klein">{q.zustand}</p>
            ) : eintraege.length === 0 ? (
              <p className="leise-klein">Keine Einträge.</p>
            ) : (
              eintraege.map((a) => (
                <div key={a.id} className="brief-eintrag-zeile">
                  <label className="brief-eintrag">
                    <input type="checkbox" checked={gewaehlt(a)} onChange={() => umschalten(a)} />
                    <span>{a.text}</span>
                    <span className="leise-klein">{a.marken.join(' · ')}</span>
                  </label>
                  {pflege?.aenderbar(a) && (
                    <button
                      type="button"
                      className="knopf klein"
                      aria-label={`${a.text} ändern`}
                      onClick={() => {
                        schliessen();
                        pflege.aendern(a);
                      }}
                    >
                      Ändern
                    </button>
                  )}
                </div>
              ))
            )}
          </fieldset>
        );
      })}
      <div className="brief-menue-fuss">
        {pflege ? (
          <button
            type="button"
            className="knopf klein"
            onClick={() => {
              schliessen();
              pflege.anlegen();
            }}
          >
            + {pflege.neu}
          </button>
        ) : (
          erfassen && <Link to={`../${erfassen.pfad}`}>{erfassen.text} →</Link>
        )}
        <button type="button" className="knopf klein rechts" onClick={schliessen}>
          Fertig
        </button>
      </div>
    </div>
  );
}
