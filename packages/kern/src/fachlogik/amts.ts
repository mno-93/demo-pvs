import { amtsZuordnung } from '../kataloge/amtsZuordnung.js';
import type { ArzneimittelEintrag } from '../kataloge/typen.js';
import { GEWISSHEIT_BEZEICHNUNG, type Allergie } from '../typen/allergie.js';

/**
 * Prüfung der Arzneimitteltherapiesicherheit.
 *
 * Bewusst klein gehalten und auf drei Prüfungen beschränkt: Allergien, Nierenfunktion und
 * doppelte Wirkstoffe. Sie ersetzt keine AMTS-Prüfung, sondern zeigt den Mechanismus —
 * und sie zeigt vor allem eines: Die Prüfung ist nur so gut wie die Daten, auf die sie
 * zugreift. Genau das ist das Argument für strukturierte Allergien und Laborwerte in der
 * Akte.
 */

export type Befundschwere = 'kontraindiziert' | 'warnung' | 'hinweis';

export interface AmtsBefund {
  schwere: Befundschwere;
  art: 'Allergie' | 'Nierenfunktion' | 'Doppelverordnung';
  text: string;
  /** Woher die Angabe stammt, auf der der Befund beruht. */
  grundlage: string;
}

export interface DokumentierteAllergie {
  substanz: string;
  /** SNOMED-CT-Code der Substanz, sofern kodiert. */
  snomed: string | null;
  /** ATC-Codes oder -Präfixe, über die Arzneimittel erkannt werden. */
  atc: readonly string[];
  typ: string;
  /** Gewissheit nach dem Informationsmodell: bestätigt, unbestätigt, widerlegt, irrtümlich. */
  gewissheit: string;
  /** Aus welchem Bestand die Angabe stammt — für die Nachvollziehbarkeit des Befunds. */
  quelle: string;
}

/**
 * ATC-Codes zu einer auslösenden Substanz, aus der Demo-Zuordnung.
 *
 * Eine Allergie ohne SNOMED-CT-Code — also eine Freitextangabe — bekommt hier nichts. Das
 * ist beabsichtigt und die Aussage des Mechanismus: Was nicht kodiert ist, kann keine
 * Prüfung erreichen.
 */
export function atcFuerSubstanz(snomed: string | null): string[] {
  if (!snomed) return [];
  return amtsZuordnung.find((z) => z.snomed === snomed)?.atc ?? [];
}

/** Bringt eine Allergie des Praxissystems in die Form, die die Prüfung braucht. */
export function allergieFuerAmts(allergie: Allergie, quelle: string): DokumentierteAllergie {
  return {
    substanz: allergie.substanz,
    snomed: allergie.snomed?.code ?? null,
    atc: atcFuerSubstanz(allergie.snomed?.code ?? null),
    typ: allergie.typ,
    gewissheit: allergie.gewissheit,
    quelle,
  };
}

/** Widerlegte und irrtümlich erfasste Angaben lösen keine Warnung aus. */
function zaehlt(allergie: DokumentierteAllergie): boolean {
  return allergie.gewissheit !== 'widerlegt' && allergie.gewissheit !== 'irrtümlich';
}

export interface AmtsUmgebung {
  allergien: readonly DokumentierteAllergie[];
  /** Zuletzt bekannte eGFR in ml/min/1,73 m², sonst null. */
  egfr: number | null;
  /** Herkunft und Datum des Nierenwerts, für die Begründung des Befunds. */
  egfrGrundlage: string | null;
  /** ATC-Codes der bereits im Plan geführten Mittel. */
  bestehendeAtc: readonly string[];
}

/**
 * Trifft eine dokumentierte Allergie auf ein Arzneimittel zu?
 *
 * Drei Wege: über die ATC-Codes der Allergie, über die im Katalog hinterlegte
 * Allergiegruppe und über den Wirkstoffnamen. Ein ATC-Code der Allergie, der Präfix des
 * Arzneimittel-Codes ist, trifft die ganze Gruppe — `J01C` (Penicilline) trifft damit
 * `J01CA04` (Amoxicillin).
 */
export function allergieTrifftZu(
  mittel: Pick<ArzneimittelEintrag, 'atc' | 'allergiegruppen' | 'wirkstoff'>,
  allergie: DokumentierteAllergie,
): boolean {
  const substanz = allergie.substanz.trim().toLowerCase();
  if (!substanz) return false;

  if (allergie.atc.some((praefix) => mittel.atc.startsWith(praefix))) return true;
  if (mittel.allergiegruppen.some((g) => g.toLowerCase() === substanz)) return true;
  if (mittel.wirkstoff.toLowerCase() === substanz) return true;
  return false;
}

export function amtsPruefen(mittel: ArzneimittelEintrag, umgebung: AmtsUmgebung): AmtsBefund[] {
  const befunde: AmtsBefund[] = [];

  for (const allergie of umgebung.allergien) {
    if (!zaehlt(allergie) || !allergieTrifftZu(mittel, allergie)) continue;
    const bestaetigt = allergie.gewissheit === 'bestätigt';
    const gewissheit =
      GEWISSHEIT_BEZEICHNUNG[allergie.gewissheit as keyof typeof GEWISSHEIT_BEZEICHNUNG] ??
      allergie.gewissheit;
    befunde.push({
      schwere: bestaetigt && allergie.typ === 'Allergie' ? 'kontraindiziert' : 'warnung',
      art: 'Allergie',
      text: bestaetigt
        ? `Dokumentierte ${allergie.typ} gegen ${allergie.substanz}.`
        : `${allergie.typ} gegen ${allergie.substanz} ist dokumentiert, Gewissheit: ${gewissheit.toLowerCase()}.`,
      grundlage: allergie.quelle,
    });
  }

  const grenze = mittel.nierengrenze;
  if (grenze && umgebung.egfr !== null) {
    if (grenze.kontraindiziertAb !== null && umgebung.egfr < grenze.kontraindiziertAb) {
      befunde.push({
        schwere: 'kontraindiziert',
        art: 'Nierenfunktion',
        text: `${grenze.text} Zuletzt gemessen: ${umgebung.egfr} ml/min/1,73 m².`,
        grundlage: umgebung.egfrGrundlage ?? 'Laborwert',
      });
    } else if (umgebung.egfr < grenze.warnungAb) {
      befunde.push({
        schwere: 'warnung',
        art: 'Nierenfunktion',
        text: `${grenze.text} Zuletzt gemessen: ${umgebung.egfr} ml/min/1,73 m².`,
        grundlage: umgebung.egfrGrundlage ?? 'Laborwert',
      });
    }
  } else if (grenze && umgebung.egfr === null) {
    befunde.push({
      schwere: 'hinweis',
      art: 'Nierenfunktion',
      text: `Für dieses Mittel ist die Nierenfunktion bedeutsam, es liegt aber kein Wert vor.`,
      grundlage: 'kein Laborwert verfügbar',
    });
  }

  if (umgebung.bestehendeAtc.includes(mittel.atc)) {
    befunde.push({
      schwere: 'hinweis',
      art: 'Doppelverordnung',
      text: `Ein Mittel mit demselben ATC-Code (${mittel.atc}) steht bereits im Plan.`,
      grundlage: 'Medikationsplan',
    });
  }

  const rang: Record<Befundschwere, number> = { kontraindiziert: 0, warnung: 1, hinweis: 2 };
  return befunde.sort((a, b) => rang[a.schwere] - rang[b.schwere]);
}

export function schwersterBefund(befunde: readonly AmtsBefund[]): Befundschwere | null {
  if (befunde.some((b) => b.schwere === 'kontraindiziert')) return 'kontraindiziert';
  if (befunde.some((b) => b.schwere === 'warnung')) return 'warnung';
  if (befunde.some((b) => b.schwere === 'hinweis')) return 'hinweis';
  return null;
}
