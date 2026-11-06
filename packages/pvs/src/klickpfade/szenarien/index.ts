import type { Szenario } from '../szenario.js';
import diagnoseInPs from './diagnose-in-ps.js';

/** Alle Klickpfade, nach Kennung — die Kennung steht im Link (`?klickpfad=…`). */
export const SZENARIEN: Record<string, Szenario> = Object.fromEntries(
  [diagnoseInPs].map((s) => [s.id, s]),
);
