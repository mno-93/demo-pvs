import type { Modus } from './szenario.js';

/**
 * Ein Klickpfad startet über die Adresse: `?klickpfad=<kennung>` und wahlweise `&modus=frei` oder
 * `&modus=aufgabe` (ADR 0061). Gelesen einmal beim Laden. Solange der Klickpfad offen ist, hält
 * die Ebene beides in der Adresse (`adresseFuehren`) — der Router der Demo navigiert ohne
 * Suchparameter. So lässt sich die Adresse jederzeit weitergeben, und Neuladen beginnt den Pfad im
 * gewählten Modus neu.
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

/** Adresse mit dem Klickpfad (`geführt` ohne `modus`) oder, mit `null`, ohne ihn. */
export function adresseMitKlickpfad(href: string, aufruf: KlickpfadAufruf | null): string {
  const adresse = new URL(href);
  adresse.searchParams.delete('klickpfad');
  adresse.searchParams.delete('modus');
  if (aufruf) {
    adresse.searchParams.set('klickpfad', aufruf.id);
    if (aufruf.modus !== 'gefuehrt') adresse.searchParams.set('modus', aufruf.modus);
  }
  return adresse.href;
}

/** Schreibt den Klickpfad in die Adresse, ohne einen Verlaufseintrag und ohne den Router zu stören. */
export function adresseFuehren(aufruf: KlickpfadAufruf | null): void {
  const soll = adresseMitKlickpfad(window.location.href, aufruf);
  if (soll !== window.location.href) window.history.replaceState(window.history.state, '', soll);
}
