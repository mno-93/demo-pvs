import type { PraxisplanEintrag } from '../typen/medikation.js';
import type { Rezept } from '../typen/rezept.js';

/**
 * Medikationsplan der Praxis ohne ePA (ADR 0045).
 *
 * Ein Rezept gehört zu einem Planeintrag, wenn es aus ihm verordnet oder in ihn übernommen
 * wurde. Ein Rezept über einen Wirkstoff, der schon gültig im Plan steht, gilt ebenfalls als
 * „im Plan" — sonst würde dasselbe Mittel zweimal aufgenommen.
 */

/** Aktiv und pausiert gehören zum gültigen Plan; beendet, abgesetzt und fehlerhaft nicht. */
export function imGueltigenPlan(e: Pick<PraxisplanEintrag, 'status'>): boolean {
  return e.status === 'aktiv' || e.status === 'pausiert';
}

/** Der Planeintrag, zu dem ein Rezept gehört — oder null, wenn es nicht im Plan steht. */
export function planeintragZumRezept(
  rezept: Pick<Rezept, 'id' | 'arzneimittel'>,
  plan: readonly PraxisplanEintrag[],
): PraxisplanEintrag | null {
  const gueltig = plan.filter(imGueltigenPlan);
  return (
    gueltig.find((e) => e.rezeptIds.includes(rezept.id)) ??
    (rezept.arzneimittel.atc
      ? (gueltig.find((e) => e.atc === rezept.arzneimittel.atc) ?? null)
      : null)
  );
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
