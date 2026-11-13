import { istGegenwaertig, type Diagnose } from '../typen/diagnose.js';
import type { Listenzeile } from './listenabgleich.js';

/**
 * ✦ Automatische Übertragung der Diagnosen zwischen Praxissystem und Diagnosenliste der ePA
 * (ADR 0063) — der Gegenentwurf zum geführten Abgleich im Splitscreen (ADR 0018, 0022).
 *
 * Drei Wege, wie die Diagnosen der Praxis in die Liste kommen:
 * - `gefuehrt`: Die Ärztin entscheidet je Eintrag; vorbelegt für Dauerdiagnosen.
 * - `hochladen`: Das Praxissystem überträgt seinen Bestand von selbst, jede Einrichtung führt
 *   ihre eigenen Einträge. Nichts kommt ohne Handlung aus der ePA zurück.
 * - `beidseitig`: Die Liste der ePA ist der gemeinsame Bestand. Das Praxissystem überträgt von
 *   selbst und übernimmt von selbst, was andere Einrichtungen eingetragen oder geändert haben.
 *
 * Die Funktion plant nur; ausgeführt wird im Praxissystem. So ist an einer Stelle nachlesbar und
 * prüfbar, was ohne ärztliche Handlung geschieht.
 */

export type Diagnosenweg = 'gefuehrt' | 'hochladen' | 'beidseitig';

export const DIAGNOSENWEG_BEZEICHNUNG: Record<Diagnosenweg, string> = {
  gefuehrt: 'geführt',
  hochladen: 'automatisch, nur in die ePA',
  beidseitig: 'automatisch, in beide Richtungen',
};

/** Was automatisch in die Liste geht: nur gegenwärtige Dauerdiagnosen oder jede Diagnose. */
export type Diagnosenumfang = 'dauer' | 'alle';

export const DIAGNOSENUMFANG_BEZEICHNUNG: Record<Diagnosenumfang, string> = {
  dauer: 'Dauerdiagnosen',
  alle: 'alle Diagnosen',
};

export type Automatikart =
  /** Eintrag der Praxis in die Liste aufnehmen. */
  | 'in-die-epa'
  /** Änderung der Praxis auf den verknüpften Eintrag der Liste übertragen. */
  | 'aenderung-in-die-epa'
  /** Eintrag der Liste in die Praxis übernehmen, verknüpft. */
  | 'in-die-praxis'
  /** Gleicher Eintrag ohne Verknüpfung: verknüpfen und den Stand der ePA übernehmen. */
  | 'verknuepfen'
  /** Verknüpfter Eintrag, in der ePA geändert: Stand der ePA übernehmen. */
  | 'epa-stand'
  /** Verknüpfter Eintrag, in der ePA als fehlerhaft gekennzeichnet: in der Praxis ebenso. */
  | 'berichtigt';

export const AUTOMATIKART_BEZEICHNUNG: Record<Automatikart, string> = {
  'in-die-epa': 'in die ePA übertragen',
  'aenderung-in-die-epa': 'Änderung in die ePA übertragen',
  'in-die-praxis': 'aus der ePA übernommen',
  verknuepfen: 'verknüpft, ePA-Stand übernommen',
  'epa-stand': 'ePA-Stand übernommen',
  berichtigt: 'als fehlerhaft übernommen',
};

/** Richtung eines Schritts — in die ePA wird geschrieben, in die Praxis nur übernommen. */
export function schreibtInDieEpa(art: Automatikart): boolean {
  return art === 'in-die-epa' || art === 'aenderung-in-die-epa';
}

export interface Automatikschritt {
  art: Automatikart;
  lokal: Diagnose | null;
  epa: Diagnose | null;
}

/** Gehört eine Diagnose der Praxis nach dem gewählten Umfang von selbst in die Liste? */
export function imUmfang(d: Diagnose, umfang: Diagnosenumfang): boolean {
  if (d.diagnosesicherheit === 'irrtümlich') return false;
  return umfang === 'alle' || (d.art === 'dauer' && istGegenwaertig(d.klinischerStatus));
}

/**
 * Was der gewählte Weg aus dem Abgleich ohne Handlung macht. Die Reihenfolge ist die der
 * Ausführung: erst übernehmen, dann schreiben — so überschreibt die Praxis keinen Stand, den sie
 * noch nicht kennt.
 */
export function diagnosenAutomatikPlanen(
  zeilen: readonly Listenzeile<Diagnose>[],
  weg: Diagnosenweg,
  umfang: Diagnosenumfang,
): Automatikschritt[] {
  if (weg === 'gefuehrt') return [];
  const schritte: Automatikschritt[] = [];
  const schritt = (art: Automatikart, z: Listenzeile<Diagnose>) =>
    schritte.push({ art, lokal: z.lokal, epa: z.epa });

  for (const z of zeilen) {
    const lokalImUmfang = !!z.lokal && imUmfang(z.lokal, umfang);
    switch (z.status) {
      case 'nur-lokal':
        if (lokalImUmfang) schritt('in-die-epa', z);
        break;
      case 'lokal-geaendert':
        schritt('aenderung-in-die-epa', z);
        break;
      case 'ungekoppelt':
        // Nur in die ePA: Jede Einrichtung führt ihren Eintrag — auch neben dem gleichen einer
        // anderen. Beidseitig gibt es je Erkrankung einen Eintrag, und der der ePA gilt.
        if (weg === 'beidseitig') schritt('verknuepfen', z);
        else if (lokalImUmfang) schritte.push({ art: 'in-die-epa', lokal: z.lokal, epa: null });
        break;
      case 'nur-epa':
        if (weg === 'beidseitig') schritt('in-die-praxis', z);
        break;
      case 'epa-geaendert':
        if (weg === 'beidseitig') schritt('epa-stand', z);
        break;
      case 'epa-berichtigt':
        // Einmal: Ist der Eintrag der Praxis schon als fehlerhaft geführt, bleibt nichts zu tun.
        if (weg === 'beidseitig' && z.lokal?.diagnosesicherheit !== 'irrtümlich') {
          schritt('berichtigt', z);
        }
        break;
      case 'abgeglichen':
        break;
    }
  }
  return schritte.sort((a, b) => Number(schreibtInDieEpa(a.art)) - Number(schreibtInDieEpa(b.art)));
}
