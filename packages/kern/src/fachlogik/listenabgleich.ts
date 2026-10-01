import type { Allergie } from '../typen/allergie.js';
import { istGegenwaertig, type Diagnose } from '../typen/diagnose.js';
import { atcFuerSubstanz } from './amts.js';

/**
 * Abgleich zwischen den lokalen Einträgen des Praxissystems und der Liste in der ePA
 * (✦ Diagnose-Service). Grundlage des Splitscreens für Allergien und
 * Diagnosen vorsieht: „Splitscreen aus Diagnosenliste (ePA) und lokalen Diagnosen"
 * zentral geführter Liste in der ePA und lokalen Einträgen.
 *
 * Zugeordnet wird in dieser Reihenfolge: über die Verknüpfung (`epaId`), dann über SNOMED CT,
 * bei Diagnosen zuletzt über die ICD-10-GM. Verwandte Allergien — etwa Amoxicillin lokal und
 * Penicillin in der ePA — bleiben getrennte Zeilen, tragen aber einen Hinweis.
 */

export type Listenstatus =
  /** Verknüpft, gleiche Fassung, gleiche Kernangaben. */
  | 'abgeglichen'
  /** Verknüpft, in der ePA seit dem letzten Abgleich geändert. */
  | 'epa-geaendert'
  /** Verknüpft, lokal abweichend — die Änderung ist noch nicht in der ePA. */
  | 'lokal-geaendert'
  /** Derselbe Begriff lokal und in der ePA, aber nicht verknüpft. */
  | 'ungekoppelt'
  | 'nur-lokal'
  | 'nur-epa'
  /** Verknüpft, in der ePA als irrtümlich berichtigt. */
  | 'epa-berichtigt';

export const LISTENSTATUS_BEZEICHNUNG: Record<Listenstatus, string> = {
  abgeglichen: 'abgeglichen',
  'epa-geaendert': 'in der ePA geändert',
  'lokal-geaendert': 'lokal geändert',
  ungekoppelt: 'gleicher Eintrag, nicht verknüpft',
  'nur-lokal': 'nur in der Praxis',
  'nur-epa': 'nur in der ePA',
  'epa-berichtigt': 'in der ePA berichtigt',
};

export interface Listenzeile<T> {
  schluessel: string;
  lokal: T | null;
  epa: T | null;
  status: Listenstatus;
  /** Zusätzlicher Hinweis, etwa auf eine verwandte Substanz oder eine andere ICD-Granularität. */
  hinweis: string | null;
}

interface Regeln<T> {
  id: (e: T) => string;
  epaId: (e: T) => string | null;
  fassung: (e: T) => string | null;
  begriffe: (e: T) => string[];
  kern: (e: T) => string;
  berichtigt: (e: T) => boolean;
  gegenwaertig: (e: T) => boolean;
  bezeichnung: (e: T) => string;
}

function abgleichen<T>(lokal: readonly T[], epa: readonly T[], r: Regeln<T>): Listenzeile<T>[] {
  const zeilen: Listenzeile<T>[] = [];
  const verbraucht = new Set<string>();
  const epaNachId = new Map(epa.map((e) => [r.epaId(e) ?? r.id(e), e]));

  for (const l of lokal) {
    const verknuepft = r.epaId(l) ? epaNachId.get(r.epaId(l) as string) : undefined;
    if (verknuepft) {
      verbraucht.add(r.id(verknuepft));
      const status: Listenstatus = r.berichtigt(verknuepft)
        ? 'epa-berichtigt'
        : r.fassung(l) !== r.fassung(verknuepft)
          ? 'epa-geaendert'
          : r.kern(l) !== r.kern(verknuepft)
            ? 'lokal-geaendert'
            : 'abgeglichen';
      zeilen.push({ schluessel: `v-${r.id(l)}`, lokal: l, epa: verknuepft, status, hinweis: null });
      continue;
    }
    const begriffe = new Set(r.begriffe(l));
    const gleich = epa.find(
      (e) =>
        !verbraucht.has(r.id(e)) && !r.berichtigt(e) && r.begriffe(e).some((b) => begriffe.has(b)),
    );
    if (gleich) {
      verbraucht.add(r.id(gleich));
      zeilen.push({
        schluessel: `g-${r.id(l)}`,
        lokal: l,
        epa: gleich,
        status: 'ungekoppelt',
        hinweis: null,
      });
      continue;
    }
    zeilen.push({
      schluessel: `l-${r.id(l)}`,
      lokal: l,
      epa: null,
      status: 'nur-lokal',
      hinweis: null,
    });
  }

  for (const e of epa) {
    if (verbraucht.has(r.id(e)) || r.berichtigt(e)) continue;
    zeilen.push({
      schluessel: `e-${r.id(e)}`,
      lokal: null,
      epa: e,
      status: 'nur-epa',
      hinweis: null,
    });
  }

  const eintrag = (z: Listenzeile<T>) => (z.lokal ?? z.epa) as T;
  return zeilen.sort(
    (a, b) =>
      Number(r.gegenwaertig(eintrag(b))) - Number(r.gegenwaertig(eintrag(a))) ||
      r.bezeichnung(eintrag(a)).localeCompare(r.bezeichnung(eintrag(b)), 'de'),
  );
}

export function diagnosenAbgleichen(
  lokal: readonly Diagnose[],
  epa: readonly Diagnose[],
): Listenzeile<Diagnose>[] {
  const zeilen = abgleichen(lokal, epa, {
    id: (d) => d.id,
    epaId: (d) => d.epaId,
    fassung: (d) => d.epaFassung,
    // SNOMED CT verbindet, was die ICD-10-GM trennt; ohne SNOMED CT bleibt die ICD.
    begriffe: (d) => (d.snomed ? [`sct|${d.snomed.code}`] : [`icd|${d.code}`]),
    kern: (d) =>
      [
        d.klinischerStatus,
        d.diagnosesicherheit,
        d.art,
        d.ende ?? '',
        d.schweregrad?.code ?? '',
      ].join('|'),
    berichtigt: (d) => d.diagnosesicherheit === 'irrtümlich',
    gegenwaertig: (d) => istGegenwaertig(d.klinischerStatus),
    bezeichnung: (d) => d.bezeichnung,
  });
  for (const z of zeilen) {
    if (z.lokal && z.epa && z.lokal.code && z.epa.code && z.lokal.code !== z.epa.code) {
      z.hinweis = `Gleiche Erkrankung nach SNOMED CT, andere ICD-10-GM: ${z.lokal.code} in der Praxis, ${z.epa.code} in der ePA.`;
    }
  }
  return zeilen;
}

export function allergienAbgleichen(
  lokal: readonly Allergie[],
  epa: readonly Allergie[],
): Listenzeile<Allergie>[] {
  const zeilen = abgleichen(lokal, epa, {
    id: (a) => a.id,
    epaId: (a) => a.epaId,
    fassung: (a) => a.epaFassung,
    begriffe: (a) =>
      a.snomed ? [`sct|${a.snomed.code}`] : [`text|${a.substanz.trim().toLowerCase()}`],
    kern: (a) =>
      [a.klinischerStatus, a.gewissheit, a.kritikalitaet, a.typ, String(a.reaktionen.length)].join(
        '|',
      ),
    berichtigt: (a) => a.gewissheit === 'irrtümlich',
    gegenwaertig: (a) => a.klinischerStatus === 'aktiv',
    bezeichnung: (a) => a.substanz,
  });
  // Verwandte Substanzen über die Wirkstoffgruppe, etwa Amoxicillin und Penicillin.
  for (const z of zeilen) {
    const eigene = z.lokal ?? z.epa;
    if (!eigene?.snomed) continue;
    const atc = atcFuerSubstanz(eigene.snomed.code);
    const verwandt = zeilen.find((andere) => {
      const a = andere.lokal ?? andere.epa;
      if (!a?.snomed || andere === z || a.snomed.code === eigene.snomed?.code) return false;
      const fremd = atcFuerSubstanz(a.snomed.code);
      return atc.some((x) => fremd.some((y) => x.startsWith(y) || y.startsWith(x)));
    });
    if (verwandt) {
      const a = (verwandt.lokal ?? verwandt.epa) as Allergie;
      z.hinweis = `Verwandt mit ${a.substanz} ${verwandt.lokal ? 'in der Praxis' : 'in der ePA'} (${a.gewissheit}) — gleiche Wirkstoffgruppe. Prüfen.`;
    }
  }
  return zeilen;
}

/** Zahlen für den Kopf des Splitscreens. */
export function listenZaehlen<T>(zeilen: readonly Listenzeile<T>[]) {
  const zaehle = (...s: Listenstatus[]) => zeilen.filter((z) => s.includes(z.status)).length;
  return {
    abgeglichen: zaehle('abgeglichen'),
    offen: zaehle('epa-geaendert', 'lokal-geaendert', 'ungekoppelt', 'epa-berichtigt'),
    nurLokal: zaehle('nur-lokal'),
    nurEpa: zaehle('nur-epa'),
  };
}
