import type { PraxisplanEintrag } from '../typen/medikation.js';
import type { Rezept } from '../typen/rezept.js';

/**
 * Medikationsplan der Praxis ohne ePA (ADR 0045).
 *
 * Ein Rezept gehört zu einem Planeintrag, wenn es aus ihm verordnet oder ihm zugeordnet wurde
 * (ADR 0051). Derselbe Wirkstoff allein genügt nicht: Eine andere Stärke oder ein anderes Mittel
 * ist gerade die Abweichung, die der Plan zeigen soll. Er ist ein eigener Hinweis.
 */

/** Aktiv und pausiert gehören zum gültigen Plan; beendet, abgesetzt und fehlerhaft nicht. */
export function imGueltigenPlan(e: Pick<PraxisplanEintrag, 'status'>): boolean {
  return e.status === 'aktiv' || e.status === 'pausiert';
}

/** Der gültige Planeintrag, dem ein Rezept zugeordnet ist — oder null, wenn es nicht im Plan steht. */
export function planeintragZumRezept(
  rezept: Pick<Rezept, 'id'>,
  plan: readonly PraxisplanEintrag[],
): PraxisplanEintrag | null {
  return plan.filter(imGueltigenPlan).find((e) => e.rezeptIds.includes(rezept.id)) ?? null;
}

/**
 * Ein gültiger Planeintrag mit demselben Wirkstoff (ATC-Code), dem das Rezept nicht zugeordnet
 * ist — Anlass für den Hinweis „Wirkstoff im Plan“ und für das Zuordnen.
 */
export function planeintragGleicherWirkstoff(
  rezept: Pick<Rezept, 'id' | 'arzneimittel'>,
  plan: readonly PraxisplanEintrag[],
): PraxisplanEintrag | null {
  if (!rezept.arzneimittel.atc || planeintragZumRezept(rezept, plan)) return null;
  return plan.filter(imGueltigenPlan).find((e) => e.atc === rezept.arzneimittel.atc) ?? null;
}

/** Das jüngste gesendete Rezept zu einem Planeintrag. */
export function letzteVerordnung(
  eintrag: Pick<PraxisplanEintrag, 'rezeptIds'>,
  rezepte: readonly Rezept[],
): Rezept | null {
  return (
    rezepte
      .filter((r) => r.status === 'gesendet' && eintrag.rezeptIds.includes(r.id))
      .sort((a, b) => (b.gesendetAm ?? '').localeCompare(a.gesendetAm ?? ''))[0] ?? null
  );
}

/** Angaben für einen neuen Planeintrag aus einem Rezept — Mittel, Dosierung und Grund. */
export function planangabeAusRezept(
  rezept: Pick<Rezept, 'arzneimittel' | 'dosierung' | 'grund'>,
): Pick<PraxisplanEintrag, 'bezeichnung' | 'atc' | 'atcVersion' | 'pzn' | 'dosierung' | 'grund'> {
  return {
    bezeichnung: rezept.arzneimittel.bezeichnung,
    atc: rezept.arzneimittel.atc,
    atcVersion: rezept.arzneimittel.atcVersion,
    pzn: rezept.arzneimittel.pzn || null,
    dosierung: rezept.dosierung,
    grund: rezept.grund,
  };
}
