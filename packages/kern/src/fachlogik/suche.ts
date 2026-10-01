/**
 * Katalogsuche. Bewertet Treffer so, wie in der Praxis gesucht wird: erst über den
 * Schlüssel, dann über den Wortanfang der Bezeichnung, zuletzt über beliebige Teiltreffer.
 */

export interface Treffer<T> {
  eintrag: T;
  punkte: number;
}

function normalisiere(text: string): string {
  return text
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .trim();
}

export function bewerte(suchbegriff: string, schluessel: string, bezeichnung: string): number {
  const s = normalisiere(suchbegriff);
  if (!s) return 0;
  const k = normalisiere(schluessel);
  const b = normalisiere(bezeichnung);

  if (k === s) return 100;
  if (k.startsWith(s)) return 80;
  if (b.startsWith(s)) return 60;
  if (b.split(/[\s,()/-]+/).some((wort) => wort.startsWith(s))) return 40;
  if (b.includes(s)) return 20;
  if (k.includes(s)) return 10;
  return 0;
}

export function suche<T>(
  eintraege: readonly T[],
  suchbegriff: string,
  schluesselVon: (e: T) => string,
  bezeichnungVon: (e: T) => string,
  hoechstens = 25,
): T[] {
  if (!suchbegriff.trim()) return [];
  return eintraege
    .map((eintrag) => ({
      eintrag,
      punkte: bewerte(suchbegriff, schluesselVon(eintrag), bezeichnungVon(eintrag)),
    }))
    .filter((t) => t.punkte > 0)
    .sort(
      (a, b) =>
        b.punkte - a.punkte ||
        bezeichnungVon(a.eintrag).localeCompare(bezeichnungVon(b.eintrag), 'de'),
    )
    .slice(0, hoechstens)
    .map((t) => t.eintrag);
}

/* ---------- Terminologiesuche mit Synonymen ---------- */

export interface Terminologietreffer<T> {
  eintrag: T;
  /** Der Text, über den gefunden wurde — Bezeichnung, Synonym oder Code. */
  ueber: string;
  /** Ob über ein Synonym gefunden wurde; die Anzeige nennt es dann ausdrücklich. */
  synonym: boolean;
}

/**
 * Sucht in einer Terminologie über Codes, Bezeichnung und Synonyme — so, wie ein
 * Kodierservice arbeitet: Wer „Bluthochdruck" tippt, findet die essentielle Hypertonie mit
 * ICD-10-GM und SNOMED CT, auch wenn keines der beiden Wörter in deren Bezeichnung steht.
 */
export function terminologieSuchen<T>(
  eintraege: readonly T[],
  suchbegriff: string,
  felder: (e: T) => { codes: string[]; bezeichnung: string; synonyme: string[] },
  hoechstens = 12,
): Terminologietreffer<T>[] {
  if (!suchbegriff.trim()) return [];
  const bewertet = eintraege.map((eintrag) => {
    const f = felder(eintrag);
    let bester = { punkte: 0, ueber: f.bezeichnung, synonym: false };
    const pruefen = (schluessel: string, text: string, ueber: string, synonym: boolean) => {
      const punkte = bewerte(suchbegriff, schluessel, text) - (synonym ? 5 : 0);
      if (punkte > bester.punkte) bester = { punkte, ueber, synonym };
    };
    for (const code of f.codes) pruefen(code, '', code, false);
    pruefen('', f.bezeichnung, f.bezeichnung, false);
    for (const s of f.synonyme) pruefen('', s, s, true);
    return { eintrag, ...bester, bezeichnung: f.bezeichnung };
  });
  return bewertet
    .filter((t) => t.punkte > 0)
    .sort((a, b) => b.punkte - a.punkte || a.bezeichnung.localeCompare(b.bezeichnung, 'de'))
    .slice(0, hoechstens)
    .map(({ eintrag, ueber, synonym }) => ({ eintrag, ueber, synonym }));
}
