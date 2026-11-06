import type { Modus } from './szenario.js';

/**
 * Ein Klickpfad startet über die Adresse: `?klickpfad=<kennung>` und wahlweise `&modus=frei` oder
 * `&modus=aufgabe` (ADR 0061). Gelesen einmal beim Laden — der Router der Demo navigiert danach
 * ohne Suchparameter.
 */
export interface KlickpfadAufruf {
  id: string;
  modus: Modus;
}

export function klickpfadAusAdresse(suche: string): KlickpfadAufruf | null {
  const p = new URLSearchParams(suche);
  const id = p.get('klickpfad');
  if (!id) return null;
  const m = p.get('modus');
  return { id, modus: m === 'frei' || m === 'aufgabe' ? m : 'gefuehrt' };
}
