import type { Szenario } from '../szenario.js';
import demoUeberblick from './demo-ueberblick.js';
import diagnoseInPs from './diagnose-in-ps.js';
import psVerlauf from './ps-verlauf.js';

/** Alle Klickpfade, nach Kennung — die Kennung steht im Link (`?klickpfad=…`). */
export const SZENARIEN: Record<string, Szenario> = Object.fromEntries(
  [demoUeberblick, diagnoseInPs, psVerlauf].map((s) => [s.id, s]),
);
