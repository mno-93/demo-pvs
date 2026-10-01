/**
 * „Neu seit dem letzten Aufruf" — für Sichten auf die ePA (ADR 0027).
 *
 * Einrichtungen bekommen aus der ePA keine Benachrichtigungen; Push-Nachrichten gibt es nur für
 * Versicherte. Ein Primärsystem erkennt Änderungen deshalb selbst: Es merkt sich beim Aufruf
 * einer Sicht, welche Einträge in welcher Fassung es gesehen hat, und vergleicht beim nächsten
 * Aufruf. Grundlage ist, was jede Antwort ohnehin trägt — Kennung und `meta.versionId` je
 * Eintrag, dazu die Einrichtung der letzten Änderung aus den Änderungseinträgen.
 */

/** Ein Eintrag, wie ihn eine Sicht gerade zeigt. */
export interface GesehenerEintrag {
  /** `Typ/Kennung`, etwa `Condition/cond-h-1`. */
  schluessel: string;
  fassung: string;
  /** Zuletzt von einer anderen Einrichtung geändert — nur solche Änderungen werden gemeldet. */
  vonAnderen: boolean;
}

/** Was die Praxis beim letzten Aufruf gesehen hat. */
export interface Fassungsstand {
  /** ISO-Zeitpunkt des Aufrufs. */
  am: string;
  fassungen: Record<string, string>;
}

export interface Aenderungen {
  neu: ReadonlySet<string>;
  geaendert: ReadonlySet<string>;
  /** Einträge, die beim letzten Aufruf da waren und jetzt fehlen. */
  entfallen: number;
}

export const KEINE_AENDERUNGEN: Aenderungen = {
  neu: new Set(),
  geaendert: new Set(),
  entfallen: 0,
};

export function fassungsstandBilden(
  eintraege: readonly GesehenerEintrag[],
  am: string,
): Fassungsstand {
  return { am, fassungen: Object.fromEntries(eintraege.map((e) => [e.schluessel, e.fassung])) };
}

/**
 * Vergleicht den jetzigen Stand mit dem zuletzt gesehenen. Ohne früheren Aufruf gibt es nichts
 * zu melden. Eigene Änderungen werden nicht gemeldet — die kennt die Praxis.
 */
export function aenderungenSeit(
  vorher: Fassungsstand | null,
  jetzt: readonly GesehenerEintrag[],
): Aenderungen {
  if (!vorher) return KEINE_AENDERUNGEN;
  const neu = new Set<string>();
  const geaendert = new Set<string>();
  for (const e of jetzt) {
    const alt = vorher.fassungen[e.schluessel];
    if (!e.vonAnderen) continue;
    if (alt === undefined) neu.add(e.schluessel);
    else if (Number(e.fassung) > Number(alt)) geaendert.add(e.schluessel);
  }
  const da = new Set(jetzt.map((e) => e.schluessel));
  const entfallen = Object.keys(vorher.fassungen).filter((s) => !da.has(s)).length;
  return { neu, geaendert, entfallen };
}

export function anzahlAenderungen(a: Aenderungen): number {
  return a.neu.size + a.geaendert.size + a.entfallen;
}

/** Ein Eintrag eines Stands, etwa ein Planeintrag des Medikationsplans. */
export interface Standeintrag {
  id: string;
  fassung: string;
  bezeichnung: string;
  /** Zuletzt von einer anderen Einrichtung geändert. */
  vonAnderen: boolean;
}

export interface Standaenderungen {
  neu: ReadonlySet<string>;
  geaendert: ReadonlySet<string>;
  /** Bezeichnungen der Einträge, die im früheren Stand standen und jetzt fehlen. */
  entfallen: string[];
}

/**
 * Vergleicht zwei Stände, die das Aktensystem selbst liefert — für den Medikationsplan den Stand
 * zum Chronologieeintrag des letzten Aufrufs und den aktuellen (ADR 0030). Anders als beim
 * gemerkten Fassungsstand (`aenderungenSeit`) sind entfallene Einträge hier mit Namen bekannt.
 * Neu und geändert zählen nur, wenn eine andere Einrichtung zuletzt geändert hat.
 */
export function staendeVergleichen(
  vorher: readonly Standeintrag[],
  jetzt: readonly Standeintrag[],
): Standaenderungen {
  const alt = new Map(vorher.map((e) => [e.id, e]));
  const da = new Set(jetzt.map((e) => e.id));
  return {
    neu: new Set(jetzt.filter((e) => e.vonAnderen && !alt.has(e.id)).map((e) => e.id)),
    geaendert: new Set(
      jetzt
        .filter((e) => e.vonAnderen && alt.has(e.id) && alt.get(e.id)!.fassung !== e.fassung)
        .map((e) => e.id),
    ),
    entfallen: vorher.filter((e) => !da.has(e.id)).map((e) => e.bezeichnung),
  };
}
