/**
 * ✦ VORSCHLAG — Glossar Fachsprache → Alltagssprache.
 *
 * Auszug, nicht amtlich. Ein echter Dienst würde hier eine gepflegte, fachlich abgenommene
 * Liste führen; in der Demo steht nur, was die Beispielfälle brauchen. Die Übersetzung ist
 * bewusst eine **Umschreibung**, keine Deutung: Sie sagt, was ein Wort heißt, und nicht,
 * was es für die fragende Person bedeutet.
 *
 * Herkunft: eigene Formulierung, an die Verständlichkeitsstufen der Patienteninformation
 * angelehnt. ⚠ Nicht gegen eine Terminologie geprüft.
 */

export interface Alltagswort {
  /** Fachbegriff, wie er im Dokument steht. */
  fach: string;
  /** Umschreibung in Alltagssprache. */
  alltag: string;
}

/**
 * Längere Begriffe stehen vorn: Ersetzt wird in dieser Reihenfolge, damit
 * „Diabetes mellitus Typ 2" nicht vorher über „Diabetes" zerfällt.
 */
export const ALLTAGSSPRACHE: readonly Alltagswort[] = [
  { fach: 'Diabetes mellitus Typ 2', alltag: 'Zuckerkrankheit (Typ 2)' },
  { fach: 'makulopapulöses Exanthem', alltag: 'fleckiger Hautausschlag' },
  { fach: 'Vorhofflimmern, persistierend', alltag: 'anhaltender unregelmäßiger Herzschlag' },
  { fach: 'intermittierendes Vorhofflimmern', alltag: 'zeitweise unregelmäßiger Herzschlag' },
  { fach: 'Elektrische Kardioversion', alltag: 'Stromstoß, der den Herzrhythmus ordnet' },
  { fach: 'Belastungsdyspnoe', alltag: 'Atemnot bei Anstrengung' },
  { fach: 'Unterschenkelödeme', alltag: 'Wassereinlagerungen in den Unterschenkeln' },
  { fach: 'Echokardiographie', alltag: 'Ultraschall des Herzens' },
  { fach: 'Harnwegsinfektion', alltag: 'Blasenentzündung' },
  { fach: 'Herzschrittmacher (Zweikammer)', alltag: 'Herzschrittmacher mit zwei Sonden' },
  { fach: 'Antikoagulation', alltag: 'Blutverdünnung' },
  { fach: 'Hyperlipidämie', alltag: 'erhöhte Blutfettwerte' },
  { fach: 'Arterielle Hypertonie', alltag: 'Bluthochdruck' },
  { fach: 'eGFR nach CKD-EPI', alltag: 'Maß dafür, wie gut die Nieren filtern' },
  { fach: 'Kreatinin im Serum', alltag: 'Nierenwert im Blut' },
  { fach: 'Nierenfunktion', alltag: 'Arbeit der Nieren' },
  { fach: 'Vorhofflimmern', alltag: 'unregelmäßiger Herzschlag' },
  { fach: 'Kardioversion', alltag: 'Behandlung, die den Herzrhythmus ordnet' },
  { fach: 'Langzeit-EKG', alltag: 'EKG über einen ganzen Tag' },
  { fach: 'Unverträglichkeit', alltag: 'der Körper reagiert empfindlich darauf' },
  { fach: 'Kontrastmittel', alltag: 'Mittel, das Gewebe im Röntgenbild sichtbar macht' },
  { fach: 'Erstdiagnose', alltag: 'zum ersten Mal festgestellt' },
  { fach: 'Entlassmedikation', alltag: 'Medikamente für zu Hause' },
  { fach: 'Prozeduren', alltag: 'Eingriffe' },
  { fach: 'Implantate', alltag: 'eingesetzte Geräte' },
  { fach: 'Exanthem', alltag: 'Hautausschlag' },
  { fach: 'Serum', alltag: 'flüssiger Teil des Blutes' },
  { fach: 'stationär', alltag: 'mit Übernachtung im Krankenhaus' },
  { fach: 'Stationärer Aufenthalt', alltag: 'Aufenthalt mit Übernachtung im Krankenhaus' },
  { fach: 'persistierend', alltag: 'anhaltend' },
  { fach: 'i. v.', alltag: 'über die Vene' },
  { fach: 'LVEF', alltag: 'Pumpleistung der linken Herzkammer' },
] as const;

/** Buchstaben einschließlich Umlauten — für die Wortgrenze. */
const BUCHSTABE = /[A-Za-zÄÖÜäöüß]/;

/** Trifft der Begriff an dieser Stelle ein ganzes Wort? */
function ganzesWort(text: string, von: number, bis: number): boolean {
  const davor = von > 0 ? text[von - 1]! : '';
  const danach = bis < text.length ? text[bis]! : '';
  return !BUCHSTABE.test(davor) && !BUCHSTABE.test(danach);
}

/**
 * Setzt hinter jeden erkannten Fachbegriff seine Umschreibung in Klammern. Der Fachbegriff
 * bleibt stehen — wer ihn kennt, soll ihn weiter lesen, und wer ihn nachschlägt, findet
 * dasselbe Wort wie im Originaldokument wieder.
 *
 * Zwei Regeln halten das Ergebnis lesbar:
 * - **Nur ganze Wörter.** Sonst würde aus „Stationärer Aufenthalt" ein „Stationär (…)er".
 * - **Keine Überschneidung.** Der längste Treffer gewinnt; was in ihm steckt, wird nicht
 *   noch einmal erläutert. Sonst stünde hinter „Elektrische Kardioversion" zweimal dieselbe
 *   Umschreibung.
 */
export function mitAlltagssprache(text: string): string {
  const treffer: { von: number; bis: number; alltag: string }[] = [];
  const unten = text.toLowerCase();

  for (const { fach, alltag } of ALLTAGSSPRACHE) {
    const gesucht = fach.toLowerCase();
    const von = unten.indexOf(gesucht);
    if (von < 0) continue;
    const bis = von + gesucht.length;
    if (!ganzesWort(text, von, bis)) continue;
    // Steckt der Treffer in einem längeren, der schon gefunden wurde, bleibt er weg.
    if (treffer.some((t) => von < t.bis && bis > t.von)) continue;
    treffer.push({ von, bis, alltag });
  }

  // Von hinten einsetzen, damit die Stellen davor gültig bleiben.
  return treffer
    .sort((a, b) => b.von - a.von)
    .reduce((ergebnis, t) => `${ergebnis.slice(0, t.bis)} (${t.alltag})${ergebnis.slice(t.bis)}`, text);
}

/** Erläuterungen, die zu einem Text passen — für eine Begriffsliste neben der Antwort. */
export function begriffeIn(text: string): Alltagswort[] {
  const gefunden: Alltagswort[] = [];
  const unten = text.toLowerCase();
  for (const wort of ALLTAGSSPRACHE) {
    const gesucht = wort.fach.toLowerCase();
    const von = unten.indexOf(gesucht);
    if (von < 0 || !ganzesWort(text, von, von + gesucht.length)) continue;
    // Enthält bereits ein längerer Treffer diesen Begriff, reicht der längere.
    if (gefunden.some((g) => g.fach.toLowerCase().includes(gesucht))) continue;
    gefunden.push(wort);
  }
  return gefunden;
}
