import { useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';

interface Eigenschaften<T> {
  beschriftung: string;
  platzhalter?: string;
  /** Liefert die Treffer zum Suchbegriff, bereits sortiert. */
  suchen: (begriff: string) => T[];
  schluessel: (t: T) => string;
  /** Darstellung einer Vorschlagszeile. */
  zeile: (t: T) => ReactNode;
  beiAuswahl: (t: T) => void;
  /** Was unter den Vorschlägen steht — etwa die Übernahme als Freitext. */
  zusatz?: (begriff: string, anzahl: number) => ReactNode;
  autoFocus?: boolean;
  /** Vorbelegter Suchbegriff, etwa der ICD-10-GM-Code einer Diagnose, die nachkodiert wird. */
  anfangswert?: string;
}

/**
 * Suchfeld mit Vorschlagsliste für Terminologien, bedienbar mit Pfeiltasten und
 * Eingabetaste.
 *
 * Gesucht wird über Codes, Bezeichnungen und Synonyme. Die Vorschlagszeile zeigt, welche
 * Codes hinter einem Begriff hinterlegt werden — der Kodierservice arbeitet im Hintergrund,
 * aber nicht unsichtbar.
 */
export function Terminologiesuche<T>({
  beschriftung,
  platzhalter,
  suchen,
  schluessel,
  zeile,
  beiAuswahl,
  zusatz,
  autoFocus,
  anfangswert = '',
}: Eigenschaften<T>) {
  const [begriff, setzeBegriff] = useState(anfangswert);
  const [markiert, setzeMarkiert] = useState(0);
  const feldId = useId();
  const listenId = useId();
  const feld = useRef<HTMLInputElement>(null);
  const treffer = useMemo(() => suchen(begriff), [suchen, begriff]);

  function uebernehmen(t: T | undefined) {
    if (!t) return;
    beiAuswahl(t);
    setzeBegriff('');
    setzeMarkiert(0);
  }

  function beiTaste(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') {
      if (begriff) {
        e.preventDefault();
        setzeBegriff('');
      }
      return;
    }
    if (treffer.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setzeMarkiert((m) => (m + 1) % treffer.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setzeMarkiert((m) => (m - 1 + treffer.length) % treffer.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      uebernehmen(treffer[markiert]);
    }
  }

  return (
    <div className="feldzeile terminologiesuche">
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
        autoFocus={autoFocus}
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
          {treffer.map((t, i) => (
            <button
              key={schluessel(t)}
              type="button"
              role="option"
              aria-selected={i === markiert}
              onMouseEnter={() => setzeMarkiert(i)}
              onClick={() => uebernehmen(t)}
            >
              {zeile(t)}
            </button>
          ))}
        </div>
      )}
      {begriff.trim() !== '' && zusatz?.(begriff.trim(), treffer.length)}
    </div>
  );
}
