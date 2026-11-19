import type { Szenario } from '../szenario.js';
import auskunftAusVolltextsuche from './auskunft-aus-volltextsuche.js';
import demoUeberblick from './demo-ueberblick.js';
import diagnoseInPs from './diagnose-in-ps.js';
import fremdeAenderungAutomatisch from './fremde-aenderung-automatisch.js';
import psVerlauf from './ps-verlauf.js';

/** Alle Klickpfade, nach Kennung — die Kennung steht im Link (`?klickpfad=…`). */
export const SZENARIEN: Record<string, Szenario> = Object.fromEntries(
  [
    demoUeberblick,
    auskunftAusVolltextsuche,
    diagnoseInPs,
    fremdeAenderungAutomatisch,
    psVerlauf,
  ].map((s) => [s.id, s]),
);
