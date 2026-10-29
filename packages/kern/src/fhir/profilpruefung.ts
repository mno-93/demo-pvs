import fhirpath from 'fhirpath';
import r4 from 'fhirpath/fhir-context/r4/index.js';
import katalog from './profilregeln.json' with { type: 'json' };
import type { Ressource } from './typen.js';

/**
 * Profilprüfung, wie sie der Medication Service vor jeder Schreibung vornimmt
 * (`MEDSVC_NO_VALID_STRUCTURE`, IG 1.4.0-ballot.1). Die Regeln stammen wörtlich aus den Profilen
 * (`profilregeln.json`, erzeugt mit `werkzeuge/profilregeln-erzeugen.mjs`); die Invarianten wertet
 * `fhirpath` (HL7 FHIRPath.js) aus — derselbe Ausdruck wie im Profil (ADR 0048).
 *
 * Geprüft werden Invarianten mit Schwere `error`, Kardinalitäten, feste Werte und Muster und
 * verpflichtende Wertelisten, die sich aus den Paketen auflösen lassen. ⚠ Nicht geprüft: Slices
 * (etwa die Extensions eines Profils einzeln), Typ- und Profilangaben von Verweisen, Wertelisten
 * außerhalb der Pakete (UCUM, Sprachen, große Kataloge) und die Formate primitiver Datentypen.
 *
 * Das Praxissystem nutzt dieselbe Prüfung vor dem Senden: Was der Dienst abweisen würde, sieht
 * die Ärztin schon bei der Eingabe.
 */

export interface Profilbefund {
  /** Element, an dem die Regel gilt (FHIRPath ohne `[x]`). */
  pfad: string;
  /** Schlüssel der Invariante oder Art der Regel (`Kardinalität`, `Muster`, `Werteliste`). */
  regel: string;
  text: string;
}

interface Regeln {
  version: string;
  typ: string;
  invarianten: { pfad: string; key: string; text: string; ausdruck: string }[];
  kardinalitaeten: { pfad: string; min: number; max: string }[];
  muster: { pfad: string; art: 'fixed' | 'pattern'; wert: unknown }[];
  wertelisten: { pfad: string; valueSet: string; codes: string[] }[];
}

const PROFILE = (katalog as unknown as { profile: Record<string, Regeln> }).profile;
export const PROFILREGELN_PAKETE = (katalog as unknown as { pakete: string[] }).pakete;

function auswerten(r: Ressource, ausdruck: string): unknown[] {
  return fhirpath.evaluate(r as object, ausdruck, undefined, r4) as unknown[];
}

function enthaelt(wert: unknown, muster: unknown): boolean {
  if (Array.isArray(muster))
    return Array.isArray(wert) && muster.every((m) => wert.some((w) => enthaelt(w, m)));
  if (muster && typeof muster === 'object')
    return (
      !!wert &&
      typeof wert === 'object' &&
      Object.entries(muster).every(([k, v]) => enthaelt((wert as Record<string, unknown>)[k], v))
    );
  return wert === muster;
}

function codesVon(wert: unknown): { system?: string; code: string }[] {
  if (typeof wert === 'string') return [{ code: wert }];
  if (!wert || typeof wert !== 'object') return [];
  const w = wert as { system?: string; code?: string; coding?: unknown[] };
  if (Array.isArray(w.coding)) return w.coding.flatMap(codesVon);
  return w.code ? [{ ...(w.system ? { system: w.system } : {}), code: w.code }] : [];
}

/** Prüft eine Ressource gegen ein Profil (kanonische URL, mit oder ohne `|Version`). */
export function profilPruefen(r: Ressource, profil: string): Profilbefund[] {
  const regeln = PROFILE[profil.split('|')[0]!];
  if (!regeln) return [{ pfad: '', regel: 'Profil', text: `Unbekanntes Profil: ${profil}` }];
  if (r.resourceType !== regeln.typ)
    return [{ pfad: '', regel: 'Typ', text: `Erwartet ${regeln.typ}, erhalten ${r.resourceType}` }];
  const befunde: Profilbefund[] = [];

  for (const k of regeln.kardinalitaeten) {
    const teile = k.pfad.split('.');
    const kind = teile.pop()!;
    const eltern = teile.join('.');
    let anzahlen: unknown[];
    try {
      anzahlen = auswerten(r, `${eltern}.select(${kind}.count())`);
    } catch {
      continue;
    }
    const max = k.max === '*' ? Infinity : Number(k.max);
    for (const n of anzahlen as number[]) {
      if (n < k.min || n > max)
        befunde.push({
          pfad: k.pfad,
          regel: 'Kardinalität',
          text: `${k.pfad}: ${n} statt ${k.min}..${k.max}`,
        });
    }
  }

  for (const m of regeln.muster) {
    let werte: unknown[];
    try {
      werte = auswerten(r, m.pfad);
    } catch {
      continue;
    }
    for (const w of werte) {
      const ok =
        m.art === 'fixed' ? JSON.stringify(w) === JSON.stringify(m.wert) : enthaelt(w, m.wert);
      if (!ok)
        befunde.push({
          pfad: m.pfad,
          regel: 'Muster',
          text: `${m.pfad} entspricht nicht ${JSON.stringify(m.wert)}`,
        });
    }
  }

  for (const v of regeln.wertelisten) {
    let werte: unknown[];
    try {
      werte = auswerten(r, v.pfad);
    } catch {
      continue;
    }
    for (const w of werte) {
      const codes = codesVon(w);
      const passt = codes.some((c) =>
        v.codes.some((z) =>
          c.system ? z === `${c.system}|${c.code}` : z.slice(z.lastIndexOf('|') + 1) === c.code,
        ),
      );
      if (codes.length > 0 && !passt)
        befunde.push({
          pfad: v.pfad,
          regel: 'Werteliste',
          text: `${v.pfad}: ${codes.map((c) => c.code).join(', ')} nicht in ${v.valueSet}`,
        });
    }
  }

  for (const k of regeln.invarianten) {
    const ausdruck = k.pfad.includes('.') ? `${k.pfad}.all(${k.ausdruck})` : k.ausdruck;
    let ergebnis: unknown[];
    try {
      ergebnis = auswerten(r, ausdruck);
    } catch {
      continue; // ⚠ Ausdruck, den FHIRPath.js nicht auswerten kann: keine Aussage
    }
    if (ergebnis.length > 0 && !ergebnis.every((x) => x === true))
      befunde.push({ pfad: k.pfad, regel: k.key, text: k.text });
  }
  return befunde;
}

/** Profile, für die Regeln vorliegen. */
export function geprueftesProfil(profil: string): boolean {
  return profil.split('|')[0]! in PROFILE;
}
