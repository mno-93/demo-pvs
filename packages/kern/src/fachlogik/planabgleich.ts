import type { EpaStand, PraxisplanEintrag, SpiegelEintrag } from '../typen/medikation.js';
import { imGueltigenPlan } from './praxisplan.js';

/**
 * Abgleich des Medikationsplans der Praxis mit dem eMP (ADR 0046).
 *
 * Die Praxis führt ihren Plan selbst. Jeder verknüpfte Eintrag trägt den Stand seines
 * eMP-Eintrags beim letzten Abgleich (`epaStand`). Daran zeigt sich beim nächsten Abgleich, wer
 * seither geändert hat:
 *
 * | Lage | Praxis geändert | eMP geändert | Folge |
 * |---|---|---|---|
 * | abgeglichen | nein | nein | — |
 * | epa-geaendert | nein | ja | **automatisch**: Praxis übernimmt den eMP-Stand |
 * | praxis-geaendert | ja | nein | „Änderung in die ePA →" oder „← ePA-Stand" |
 * | beide-geaendert | ja | ja | die Ärztin entscheidet |
 * | nur-epa | — | — | **automatisch** in den Plan der Praxis, verknüpft |
 * | nur-praxis | — | — | „in die ePA →" |
 * | gleiches-mittel | — | — | unverknüpft beide mit demselben ATC: „verknüpfen" |
 * | nicht-in-epa | — | — | verknüpft, im eMP aber nicht mehr vorhanden |
 *
 * Automatisch geschieht nur, was eindeutig ist: Die Praxis hat nichts geändert, also gibt es
 * nichts abzuwägen. Was die Praxis geändert hat, geht nie ohne Handlung in die ePA.
 */

export type Abgleichlage =
  | 'abgeglichen'
  | 'epa-geaendert'
  | 'praxis-geaendert'
  | 'beide-geaendert'
  | 'nur-epa'
  | 'nur-praxis'
  | 'gleiches-mittel'
  | 'nicht-in-epa';

export interface Planabgleichzeile {
  lage: Abgleichlage;
  lokal: PraxisplanEintrag | null;
  epa: SpiegelEintrag | null;
}

/** Der Stand, den ein eMP-Eintrag als Abgleichsgrundlage hinterlässt. */
export function epaStandVon(
  e: Pick<SpiegelEintrag, 'fassung' | 'dosierung' | 'grund' | 'status'>,
): EpaStand {
  return { fassung: e.fassung, dosierung: e.dosierung, grund: e.grund, status: e.status };
}

/** Hat die Praxis den Eintrag seit dem letzten Abgleich geändert? */
export function praxisGeaendert(e: PraxisplanEintrag): boolean {
  if (!e.epaStand) return false;
  return (
    e.dosierung !== e.epaStand.dosierung ||
    (e.grund ?? null) !== (e.epaStand.grund ?? null) ||
    e.status !== e.epaStand.status
  );
}

/** Gültig im Sinne des Abgleichs: Ein fehlerhafter Eintrag zieht nichts mehr an sich. */
const verwendbar = (e: Pick<SpiegelEintrag, 'status'>) => e.status !== 'entered-in-error';

export function planAbgleichen(
  lokal: readonly PraxisplanEintrag[],
  epa: readonly SpiegelEintrag[],
): Planabgleichzeile[] {
  const zeilen: Planabgleichzeile[] = [];
  const verknuepft = new Set<string>();

  for (const l of lokal) {
    if (!l.epaId) continue;
    const e = epa.find((x) => x.id === l.epaId);
    verknuepft.add(l.epaId);
    if (!e) {
      zeilen.push({ lage: 'nicht-in-epa', lokal: l, epa: null });
      continue;
    }
    const praxis = praxisGeaendert(l);
    const ePA = !!l.epaStand && e.fassung !== l.epaStand.fassung;
    zeilen.push({
      lage:
        praxis && ePA
          ? 'beide-geaendert'
          : praxis
            ? 'praxis-geaendert'
            : ePA
              ? 'epa-geaendert'
              : 'abgeglichen',
      lokal: l,
      epa: e,
    });
  }

  // Unverknüpfte Einträge der Praxis, die ein eMP-Eintrag mit demselben Mittel finden kann.
  const offen = lokal.filter((l) => !l.epaId);
  const vergeben = new Set<string>();
  for (const e of epa) {
    if (verknuepft.has(e.id)) continue;
    const partner = verwendbar(e)
      ? offen.find((l) => !vergeben.has(l.id) && verwendbar(l) && !!l.atc && l.atc === e.atc)
      : undefined;
    if (partner) {
      vergeben.add(partner.id);
      zeilen.push({ lage: 'gleiches-mittel', lokal: partner, epa: e });
    } else {
      zeilen.push({ lage: 'nur-epa', lokal: null, epa: e });
    }
  }
  for (const l of offen) {
    if (!vergeben.has(l.id)) zeilen.push({ lage: 'nur-praxis', lokal: l, epa: null });
  }
  return zeilen;
}

/**
 * Was der Abgleich ohne Handlung erledigt: neue eMP-Einträge in den Plan der Praxis aufnehmen
 * und eMP-Änderungen übernehmen, wo die Praxis nichts geändert hat. Fehlerhafte Einträge des
 * eMP werden nicht neu aufgenommen.
 */
export function automatischerAbgleich(zeilen: readonly Planabgleichzeile[]): {
  aufnehmen: SpiegelEintrag[];
  uebernehmen: { lokalId: string; epa: SpiegelEintrag }[];
} {
  return {
    aufnehmen: zeilen
      .filter((z) => z.lage === 'nur-epa' && z.epa && verwendbar(z.epa))
      .map((z) => z.epa!),
    uebernehmen: zeilen
      .filter((z) => z.lage === 'epa-geaendert')
      .map((z) => ({ lokalId: z.lokal!.id, epa: z.epa! })),
  };
}

/**
 * Offene Unterschiede, die eine Handlung brauchen — für das Band über dem Plan. Ein beendeter
 * oder abgesetzter Eintrag nur der Praxis gehört nicht mehr in den eMP und zählt nicht.
 */
export function offeneUnterschiede(zeilen: readonly Planabgleichzeile[]): number {
  return zeilen.filter(
    (z) =>
      z.lage === 'praxis-geaendert' ||
      z.lage === 'beide-geaendert' ||
      z.lage === 'gleiches-mittel' ||
      (z.lage === 'nur-praxis' && !!z.lokal && imGueltigenPlan(z.lokal)),
  ).length;
}
