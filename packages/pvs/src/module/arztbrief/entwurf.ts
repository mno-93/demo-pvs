import { useSyncExternalStore } from 'react';
import { ADRESSBUCH } from '@demo-pvs/kern';

/**
 * Entwurf eines Arztbriefs je Person — außerhalb des Bildschirms gehalten.
 *
 * Wer im Brief etwas vermisst, trägt es in seiner eigentlichen Quelle ein: Diagnosen und
 * Allergien im Pop-up mit der Maske der Liste (`Quellpflege.tsx`), das Mittel im Medikationsplan,
 * die Notiz in der Karteikarte — dafür verlässt man den Reiter. Der Entwurf überlebt das, und was
 * in der Zwischenzeit neu angelegt wurde, ist schon ausgewählt.
 *
 * Gewählt wird über Abweichungen von der Vorauswahl: `hinzu` und `ab`. So bleibt die Vorauswahl
 * für Einträge gültig, die erst später geladen werden — etwa aus der ePA.
 */

export type Weg =
  | { art: 'bereit' }
  | { art: 'laeuft' }
  | { art: 'erledigt'; text: string }
  | { art: 'fehler'; text: string };

export interface Unterschriebener {
  dokumentId: string;
  uuid: string;
  bundle: Record<string, unknown>;
  zeitpunkt: string;
}

export interface Briefentwurf {
  /** Beginn des Entwurfs — was danach angelegt wird, gilt als für den Brief angelegt. */
  beginn: string;
  /** Ob schon etwas geändert wurde; erst dann ist es ein Entwurf. */
  geaendert: boolean;
  empfaengerId: string;
  anlass: string;
  beurteilung: string;
  empfehlungen: string;
  hinzu: readonly string[];
  ab: readonly string[];
  brief: Unterschriebener | null;
  epa: Weg;
  kim: Weg;
}

const entwuerfe = new Map<string, Briefentwurf>();
const hoerer = new Set<() => void>();
const melden = () => hoerer.forEach((h) => h());

function neuerEntwurf(beginn: string): Briefentwurf {
  return {
    beginn,
    geaendert: false,
    empfaengerId: ADRESSBUCH[0]!.id,
    anlass: '',
    beurteilung: '',
    empfehlungen: '',
    hinzu: [],
    ab: [],
    brief: null,
    epa: { art: 'bereit' },
    kim: { art: 'bereit' },
  };
}

/** Den Entwurf einer Person — angelegt beim ersten Aufruf. */
export function entwurfFuer(patientId: string, beginn: string): Briefentwurf {
  let e = entwuerfe.get(patientId);
  if (!e) {
    e = neuerEntwurf(beginn);
    entwuerfe.set(patientId, e);
  }
  return e;
}

/** Ändert den Entwurf; wirkt auch, wenn der Bildschirm inzwischen gewechselt wurde. */
export function entwurfAendern(
  patientId: string,
  teil: Partial<Briefentwurf> | ((e: Briefentwurf) => Partial<Briefentwurf>),
): void {
  const vorher = entwuerfe.get(patientId);
  if (!vorher) return;
  const aenderung = typeof teil === 'function' ? teil(vorher) : teil;
  const inhaltlich = Object.keys(aenderung).some((k) => k !== 'epa' && k !== 'kim');
  entwuerfe.set(patientId, {
    ...vorher,
    ...aenderung,
    geaendert: vorher.geaendert || inhaltlich,
  });
  melden();
}

export function entwurfVerwerfen(patientId: string, beginn: string): void {
  entwuerfe.set(patientId, neuerEntwurf(beginn));
  melden();
}

export function entwuerfeLeeren(): void {
  entwuerfe.clear();
  melden();
}

function abonnieren(h: () => void) {
  hoerer.add(h);
  return () => {
    hoerer.delete(h);
  };
}

export function useEntwurf(patientId: string, beginn: string): Briefentwurf {
  return useSyncExternalStore(
    abonnieren,
    () => entwurfFuer(patientId, beginn),
    () => entwurfFuer(patientId, beginn),
  );
}

/** Für den Reiter: offener Entwurf, unterschrieben oder nichts. */
export function useEntwurfsstand(patientId: string): 'entwurf' | 'unterschrieben' | null {
  return useSyncExternalStore(
    abonnieren,
    () => {
      const e = entwuerfe.get(patientId);
      if (!e) return null;
      if (e.brief) return 'unterschrieben';
      return e.geaendert ? 'entwurf' : null;
    },
    () => null,
  );
}

/** Gewählt ist, was vorgegeben und nicht abgewählt oder ausdrücklich hinzugewählt ist. */
export function istGewaehlt(e: Briefentwurf, id: string, vorgabe: boolean): boolean {
  return (vorgabe || e.hinzu.includes(id)) && !e.ab.includes(id);
}

export function umschalten(
  patientId: string,
  id: string,
  vorgabe: boolean,
  gewaehlt: boolean,
): void {
  entwurfAendern(patientId, (e) =>
    gewaehlt
      ? { hinzu: e.hinzu.filter((x) => x !== id), ab: vorgabe ? [...e.ab, id] : e.ab }
      : { ab: e.ab.filter((x) => x !== id), hinzu: vorgabe ? e.hinzu : [...e.hinzu, id] },
  );
}
