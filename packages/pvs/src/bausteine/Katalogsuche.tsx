import { useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { suche } from '@demo-pvs/kern';

interface Eigenschaften<T> {
  beschriftung: string;
  eintraege: readonly T[];
  schluesselVon: (e: T) => string;
  bezeichnungVon: (e: T) => string;
  beiAuswahl: (eintrag: T) => void;
  platzhalter?: string;
}

/**
 * Suchfeld mit Vorschlagsliste, bedienbar mit Pfeiltasten und Eingabetaste.
 *
 * In der Praxis wird ein Diagnosecode getippt, nicht angeklickt. Die Tastaturbedienung
 * ist deshalb keine Zutat, sondern der eigentliche Weg.
 */
export function Katalogsuche<T>({
  beschriftung,
  eintraege,
  schluesselVon,
  bezeichnungVon,
  beiAuswahl,
  platzhalter,
}: Eigenschaften<T>) {
  const [begriff, setzeBegriff] = useState('');
  const [markiert, setzeMarkiert] = useState(0);
  const feldId = useId();
  const listenId = useId();
  const feld = useRef<HTMLInputElement>(null);

  const treffer = useMemo(
    () => suche(eintraege, begriff, schluesselVon, bezeichnungVon, 12),
    [eintraege, begriff, schluesselVon, bezeichnungVon],
  );

  function uebernehmen(eintrag: T | undefined) {
    if (!eintrag) return;
    beiAuswahl(eintrag);
    setzeBegriff('');
    setzeMarkiert(0);
    feld.current?.focus();
  }

  function beiTaste(ereignis: KeyboardEvent<HTMLInputElement>) {
    if (treffer.length === 0) return;
    if (ereignis.key === 'ArrowDown') {
      ereignis.preventDefault();
      setzeMarkiert((m) => (m + 1) % treffer.length);
    } else if (ereignis.key === 'ArrowUp') {
      ereignis.preventDefault();
      setzeMarkiert((m) => (m - 1 + treffer.length) % treffer.length);
    } else if (ereignis.key === 'Enter') {
      ereignis.preventDefault();
      uebernehmen(treffer[markiert]);
    } else if (ereignis.key === 'Escape') {
      setzeBegriff('');
    }
  }

  return (
    <div className="feldzeile">
      <label htmlFor={feldId}>{beschriftung}</label>
      <input
        id={feldId}
        ref={feld}
        type="text"
        role="combobox"
        aria-expanded={treffer.length > 0}
        aria-controls={listenId}
        aria-autocomplete="list"
        autoComplete="off"
        value={begriff}
        placeholder={platzhalter}
        onChange={(e) => {
          setzeBegriff(e.target.value);
          setzeMarkiert(0);
        }}
        onKeyDown={beiTaste}
      />
      {treffer.length > 0 && (
        <div className="vorschlaege" id={listenId} role="listbox" aria-label={beschriftung}>
          {treffer.map((eintrag, i) => (
            <button
              key={schluesselVon(eintrag) + i}
              type="button"
              role="option"
              aria-selected={i === markiert}
              onMouseEnter={() => setzeMarkiert(i)}
              onClick={() => uebernehmen(eintrag)}
            >
              <span className="code">{schluesselVon(eintrag)}</span> {bezeichnungVon(eintrag)}
            </button>
          ))}
        </div>
      )}
      {begriff.trim() !== '' && treffer.length === 0 && (
        <div className="hinweisbox">Kein Treffer.</div>
      )}
    </div>
  );
}
