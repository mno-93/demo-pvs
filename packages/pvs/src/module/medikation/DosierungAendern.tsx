import { useEffect, useRef, useState } from 'react';
import type { Dosierung } from '@demo-pvs/kern';
import { DosierungEingabe, dosierungGueltig } from './DosierungEingabe.js';

/**
 * „Dosierung ändern“ an einer Planzeile (IG 1.4.0-ballot.1, Anwendungsfall „Editieren von
 * eMP-Einträgen“, `$update-emp-entry`): dieselbe Dosierungseingabe wie beim Anlegen; „Dosierung
 * übernehmen“ bestätigt, dass die Anpassung abgeschlossen ist. Der Fokus springt ins erste Feld,
 * Escape bricht ab, und danach steht er wieder auf dem Knopf, der das Formular geöffnet hat.
 */
export function DosierungAendern({
  id,
  bezeichnung,
  start,
  beiUebernahme,
  abbrechen,
}: {
  /** Kennung des Formulars; der auslösende Knopf nennt sie in `aria-controls`. */
  id: string;
  bezeichnung: string;
  start: Dosierung;
  beiUebernahme: (d: Dosierung) => void;
  abbrechen: () => void;
}) {
  const [dosis, setzeDosis] = useState<Dosierung>(start);
  const rahmen = useRef<HTMLDivElement>(null);
  useEffect(() => {
    rahmen.current?.querySelector<HTMLElement>('select, input')?.focus();
    // Zurück auf den Knopf, der das Formular geöffnet hat — auch wenn ein Klick ihn nicht
    // fokussiert hatte (manche Browser fokussieren Knöpfe beim Klicken nicht).
    return () => document.querySelector<HTMLElement>(`[aria-controls="${id}"]`)?.focus();
  }, [id]);
  return (
    <div
      ref={rahmen}
      id={id}
      aria-label={`Dosierung ändern: ${bezeichnung}`}
      role="group"
      onKeyDown={(ev) => {
        if (ev.key === 'Escape') abbrechen();
      }}
    >
      <DosierungEingabe wert={dosis} setze={setzeDosis} />
      <div className="reihe" style={{ gap: 6 }}>
        <button
          type="button"
          className="knopf stark"
          disabled={!dosierungGueltig(dosis)}
          onClick={() => beiUebernahme(dosis)}
        >
          Dosierung übernehmen
        </button>
        <button type="button" className="knopf" onClick={abbrechen}>
          abbrechen
        </button>
      </div>
    </div>
  );
}
