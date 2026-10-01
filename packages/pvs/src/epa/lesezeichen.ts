import { useCallback, useRef } from 'react';
import { ausfuehren, lesen } from '../speicher/speicher.js';
import { vorgaenge } from '../speicher/vorgaenge.js';
import type { EpaLesezeichen } from '../speicher/zustand.js';

/**
 * Lesezeichen für die spezifizierte Abfrage „seit dem letzten Aufruf" (ADR 0030).
 *
 * `vorher` ist das Lesezeichen, das beim Öffnen der Ansicht galt; es bleibt für die Dauer der
 * Ansicht stehen, auch wenn die Ansicht neu lädt. `merken` legt nach jedem Abruf den Zeitpunkt
 * des Aktensystems ab — er gilt ab dem nächsten Öffnen.
 */
export function useLesezeichen(
  patientId: string,
  bestand: EpaLesezeichen['bestand'],
): {
  vorher: EpaLesezeichen | null;
  merken: (zeitpunkt: string, chronologie?: string | null) => void;
} {
  const schluessel = `${patientId}|${bestand}`;
  const gemerkt = useRef<{ schluessel: string; wert: EpaLesezeichen | null } | null>(null);
  if (gemerkt.current?.schluessel !== schluessel) {
    gemerkt.current = {
      schluessel,
      wert:
        lesen().epaLesezeichen.find((l) => l.patientId === patientId && l.bestand === bestand) ??
        null,
    };
  }
  const merken = useCallback(
    (zeitpunkt: string, chronologie: string | null = null) => {
      if (!zeitpunkt) return;
      ausfuehren(vorgaenge.epaLesezeichenMerken({ patientId, bestand, zeitpunkt, chronologie }));
    },
    [patientId, bestand],
  );
  return { vorher: gemerkt.current.wert, merken };
}
