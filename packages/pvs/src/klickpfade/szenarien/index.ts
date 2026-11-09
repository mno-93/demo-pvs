import type { Szenario } from '../szenario.js';
import demoUeberblick from './demo-ueberblick.js';
import diagnoseInPs from './diagnose-in-ps.js';

/** Alle Klickpfade, nach Kennung — die Kennung steht im Link (`?klickpfad=…`). */
export const SZENARIEN: Record<string, Szenario> = Object.fromEntries(
  [demoUeberblick, diagnoseInPs].map((s) => [s.id, s]),
);
