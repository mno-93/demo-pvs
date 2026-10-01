/**
 * Reihenfolge der Einträge in den Listen für Diagnosen und Allergien (ADR 0029).
 *
 * Voreingestellt ist das Datum der Einstellung, der jüngste Eintrag zuerst. Die Praxis kann nach
 * Beginn oder Bezeichnung sortieren oder eine eigene Reihenfolge festlegen. Die Reihenfolge ist
 * eine Ansicht des Praxissystems; in die ePA geht sie nicht.
 */

export type Sortierung =
  'eingestellt-neu' | 'eingestellt-alt' | 'beginn' | 'bezeichnung' | 'eigene';

export const SORTIERUNG_BEZEICHNUNG: Record<Sortierung, string> = {
  'eingestellt-neu': 'Eingestellt, neueste zuerst',
  'eingestellt-alt': 'Eingestellt, älteste zuerst',
  beginn: 'Beginn, jüngster zuerst',
  bezeichnung: 'Bezeichnung',
  eigene: 'Eigene Reihenfolge',
};

/** Was die Ordnung über einen Eintrag wissen muss. */
export interface Ordnungsangaben {
  /** Kennungen, unter denen der Eintrag bekannt ist — in der Praxis und in der ePA. */
  kennungen: readonly string[];
  /** ISO-Datum oder -Zeitpunkt der Einstellung. */
  eingestelltAm: string;
  /** ISO-Datum des Beginns; leer, wenn unbekannt. */
  beginn: string;
  bezeichnung: string;
}

/**
 * Ordnet Einträge. Bei eigener Reihenfolge stehen Einträge, die darin noch nicht vorkommen,
 * oben — nach Einstellung, der jüngste zuerst —, damit Neues nicht am Ende verschwindet.
 */
export function ordnen<T>(
  eintraege: readonly T[],
  angaben: (e: T) => Ordnungsangaben,
  sortierung: Sortierung,
  reihenfolge: readonly string[] = [],
): T[] {
  const mit = eintraege.map((e) => ({ e, a: angaben(e) }));
  const nachEinstellung = (x: Ordnungsangaben, y: Ordnungsangaben) =>
    y.eingestelltAm.localeCompare(x.eingestelltAm) ||
    x.bezeichnung.localeCompare(y.bezeichnung, 'de');
  const vergleich: Record<Sortierung, (x: Ordnungsangaben, y: Ordnungsangaben) => number> = {
    'eingestellt-neu': nachEinstellung,
    'eingestellt-alt': (x, y) => -nachEinstellung(x, y),
    beginn: (x, y) => y.beginn.localeCompare(x.beginn) || nachEinstellung(x, y),
    bezeichnung: (x, y) => x.bezeichnung.localeCompare(y.bezeichnung, 'de'),
    eigene: (x, y) => {
      const rx = rang(x, reihenfolge);
      const ry = rang(y, reihenfolge);
      if (rx === ry) return nachEinstellung(x, y);
      return rx - ry;
    },
  };
  return mit.sort((x, y) => vergleich[sortierung](x.a, y.a)).map((m) => m.e);
}

/** Platz in der eigenen Reihenfolge; unbekannte Einträge vor allen bekannten. */
function rang(a: Ordnungsangaben, reihenfolge: readonly string[]): number {
  return reihenfolge.findIndex((k) => a.kennungen.includes(k));
}

/** Die eigene Reihenfolge als Liste von Kennungen — je Eintrag die erste bekannte. */
export function reihenfolgeAus<T>(
  eintraege: readonly T[],
  angaben: (e: T) => Ordnungsangaben,
): string[] {
  return eintraege.flatMap((e) => angaben(e).kennungen.slice(0, 1));
}

/** Verschiebt einen Eintrag an eine andere Stelle. */
export function verschieben<T>(liste: readonly T[], von: number, nach: number): T[] {
  if (von === nach || von < 0 || nach < 0 || von >= liste.length || nach >= liste.length) {
    return [...liste];
  }
  const neu = [...liste];
  const [e] = neu.splice(von, 1);
  neu.splice(nach, 0, e as T);
  return neu;
}
