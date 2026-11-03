import { useState } from 'react';
import type { Dosierung } from '@demo-pvs/kern';
import { DosierungEingabe, dosierungGueltig } from './DosierungEingabe.js';

/**
 * „Dosierung ändern“ an einer Planzeile (IG 1.4.0-ballot.1, Anwendungsfall „Editieren von
 * eMP-Einträgen“, `$update-emp-entry`): dieselbe Dosierungseingabe wie beim Anlegen; „Dosierung
 * übernehmen“ bestätigt, dass die Anpassung abgeschlossen ist.
 */
export function DosierungAendern({
  bezeichnung,
  start,
  beiUebernahme,
  abbrechen,
}: {
  bezeichnung: string;
  start: Dosierung;
  beiUebernahme: (d: Dosierung) => void;
  abbrechen: () => void;
}) {
  const [dosis, setzeDosis] = useState<Dosierung>(start);
  return (
    <div aria-label={`Dosierung ändern: ${bezeichnung}`} role="group">
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
