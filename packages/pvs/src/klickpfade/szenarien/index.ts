import type { Szenario } from '../szenario.js';
import diagnoseInPs from './diagnose-in-ps.js';
import fremdeAenderungAutomatisch from './fremde-aenderung-automatisch.js';

/** Alle Klickpfade, nach Kennung — die Kennung steht im Link (`?klickpfad=…`). */
export const SZENARIEN: Record<string, Szenario> = Object.fromEntries(
  [diagnoseInPs, fremdeAenderungAutomatisch].map((s) => [s.id, s]),
);
