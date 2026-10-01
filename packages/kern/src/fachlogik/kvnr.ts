/**
 * Krankenversichertennummer: ein Buchstabe, acht Ziffern, eine Prüfziffer.
 *
 * Das Prüfverfahren ist hier nach dem veröffentlichten Vorgehen umgesetzt: Der Buchstabe
 * wird durch seine zweistellige Position im Alphabet ersetzt, die entstehenden zehn Ziffern
 * werden abwechselnd mit 1 und 2 gewichtet, Produkte über 9 um 9 vermindert, die Summe
 * modulo 10 ergibt die Prüfziffer.
 *
 * ⚠ Vor einer Verwendung außerhalb der Demo gegen die maßgebliche Festlegung prüfen.
 * Die Demo-Nummern sind mit derselben Funktion erzeugt und daher in sich stimmig.
 */

const BUCHSTABEN = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

export function pruefzifferFuer(buchstabe: string, achtZiffern: string): number {
  const position = BUCHSTABEN.indexOf(buchstabe.toUpperCase()) + 1;
  if (position === 0) throw new Error(`Kein Buchstabe A–Z: ${buchstabe}`);
  if (!/^\d{8}$/.test(achtZiffern)) throw new Error(`Es müssen acht Ziffern sein: ${achtZiffern}`);

  const ziffern = String(position).padStart(2, '0') + achtZiffern;
  let summe = 0;
  for (let i = 0; i < ziffern.length; i++) {
    const wert = Number(ziffern[i]) * (i % 2 === 0 ? 1 : 2);
    summe += wert > 9 ? wert - 9 : wert;
  }
  return summe % 10;
}

export function kvnrBilden(buchstabe: string, achtZiffern: string): string {
  return `${buchstabe.toUpperCase()}${achtZiffern}${pruefzifferFuer(buchstabe, achtZiffern)}`;
}

export function istGueltigeKvnr(kvnr: string): boolean {
  if (!/^[A-Z]\d{9}$/.test(kvnr)) return false;
  const buchstabe = kvnr.slice(0, 1);
  const achtZiffern = kvnr.slice(1, 9);
  const pruefziffer = Number(kvnr.slice(9, 10));
  try {
    return pruefzifferFuer(buchstabe, achtZiffern) === pruefziffer;
  } catch {
    return false;
  }
}
