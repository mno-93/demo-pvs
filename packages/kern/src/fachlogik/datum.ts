/** Datums- und Quartalsrechnung. Alle Datumsangaben im Projekt sind ISO-Zeichenketten. */

export interface Quartalsangabe {
  jahr: number;
  /** 1 bis 4. */
  quartal: number;
}

export function quartalVon(isoDatum: string): Quartalsangabe {
  const jahr = Number(isoDatum.slice(0, 4));
  const monat = Number(isoDatum.slice(5, 7));
  if (!jahr || !monat || monat < 1 || monat > 12) {
    throw new Error(`Kein gültiges ISO-Datum: ${isoDatum}`);
  }
  return { jahr, quartal: Math.floor((monat - 1) / 3) + 1 };
}

export function quartalsBezeichnung(angabe: Quartalsangabe): string {
  return `${angabe.quartal}/${angabe.jahr}`;
}

export function gleichesQuartal(a: string, b: string): boolean {
  const qa = quartalVon(a);
  const qb = quartalVon(b);
  return qa.jahr === qb.jahr && qa.quartal === qb.quartal;
}

/** Alter in vollendeten Jahren am Stichtag. */
export function alterInJahren(geburtsdatum: string, stichtag: string): number {
  const geb = new Date(geburtsdatum);
  const tag = new Date(stichtag);
  let alter = tag.getFullYear() - geb.getFullYear();
  const monatsdifferenz = tag.getMonth() - geb.getMonth();
  if (monatsdifferenz < 0 || (monatsdifferenz === 0 && tag.getDate() < geb.getDate())) {
    alter -= 1;
  }
  return alter;
}

/** 2026-08-30 wird zu 30.08.2026. Leere oder unvollständige Werte bleiben unverändert. */
export function deutschesDatum(isoDatum: string | null | undefined): string {
  if (!isoDatum || isoDatum.length < 10) return isoDatum ?? '';
  return `${isoDatum.slice(8, 10)}.${isoDatum.slice(5, 7)}.${isoDatum.slice(0, 4)}`;
}

export function deutscherZeitpunkt(isoZeitpunkt: string): string {
  if (isoZeitpunkt.length < 16) return deutschesDatum(isoZeitpunkt);
  return `${deutschesDatum(isoZeitpunkt.slice(0, 10))}, ${isoZeitpunkt.slice(11, 16)} Uhr`;
}
