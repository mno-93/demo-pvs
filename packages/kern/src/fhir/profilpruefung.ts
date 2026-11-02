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
 * Nur der Simulator nutzt die Prüfung; sie hat einen eigenen Einstiegspunkt
 * (`@demo-pvs/kern/profilpruefung`), damit FHIRPath.js und die Regeln nicht im Startpaket des
 * Praxissystems landen (ADR 0056). Jeder Ausdruck wird einmal übersetzt und dann wiederverwendet;
 * `trace()` in den Regeln der Pakete schreibt nichts in die Konsole. Ausdrücke, die FHIRPath.js
 * nicht auswerten kann, führt `nichtAuswertbar()` — die Tests prüfen die Liste. ⚠ Bekannt: `tim-10`
 * (Timing, R4) prüft `when in (…)`; bei mehreren `when` wertet FHIRPath.js das nicht aus, die Regel
 * bleibt dann ohne Aussage.
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

/** `trace()` steht in vielen Regeln der Pakete; ohne eigene Funktion schriebe es in die Konsole. */
const OPTIONEN = { traceFn: () => undefined };
type Auswertung = (r: object, umgebung: Record<string, unknown>) => unknown[];
/** Übersetzte Ausdrücke; `null`, wenn FHIRPath.js den Ausdruck nicht übersetzen kann. */
const UEBERSETZT = new Map<string, Auswertung | null>();
const NICHT_AUSWERTBAR = new Set<string>();

function auswerten(r: Ressource, ausdruck: string): unknown[] {
  let f = UEBERSETZT.get(ausdruck);
  if (f === undefined) {
    try {
      const g = fhirpath.compile(ausdruck, r4, OPTIONEN);
      f = (x: object, umgebung: Record<string, unknown>) => g(x, umgebung) as unknown[];
    } catch {
      f = null;
    }
    UEBERSETZT.set(ausdruck, f);
  }
  if (f === null) {
    NICHT_AUSWERTBAR.add(ausdruck);
    throw new Error(`Nicht auswertbar: ${ausdruck}`);
  }
  try {
    // `%resource` und `%rootResource` nennen viele Regeln (DosageDgMP); ohne sie wirft FHIRPath.js.
    return f(r as object, { resource: r, rootResource: r });
  } catch (e) {
    NICHT_AUSWERTBAR.add(ausdruck);
    throw e;
  }
}

/** Ausdrücke, die bisher nicht auswertbar waren — eine Prüfung ohne Aussage ist kein Erfolg. */
export function nichtAuswertbar(): string[] {
  return [...NICHT_AUSWERTBAR].sort();
}

/** Alle Ausdrücke der Regeln, je Profil — für die Prüfung, ob FHIRPath.js sie übersetzen kann. */
export function regelausdruecke(): string[] {
  return Object.values(PROFILE).flatMap((p) => [
    ...p.invarianten.map(invariantenausdruck),
    ...p.muster.map((m) => m.pfad),
    ...p.wertelisten.map((v) => v.pfad),
  ]);
}

/**
 * Eine Invariante gilt je Element ihres Pfads. `select()` statt `all()`: Ein leeres Ergebnis macht
 * keine Aussage — so besteht `ref-1` einen Verweis nur mit `identifier`, wie in R5 ausdrücklich
 * (`reference.exists() implies …`) und wie beim HL7 FHIR Validator (ADR 0056).
 */
function invariantenausdruck(k: { pfad: string; ausdruck: string }): string {
  return k.pfad.includes('.') ? `${k.pfad}.select(${k.ausdruck})` : k.ausdruck;
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
    let ergebnis: unknown[];
    try {
      ergebnis = auswerten(r, invariantenausdruck(k));
    } catch {
      continue; // ⚠ Ausdruck, den FHIRPath.js nicht auswerten kann: keine Aussage
    }
    if (!ergebnis.every((x) => x === true))
      befunde.push({ pfad: k.pfad, regel: k.key, text: k.text });
  }
  return befunde;
}

/** Profile, für die Regeln vorliegen. */
export function geprueftesProfil(profil: string): boolean {
  return profil.split('|')[0]! in PROFILE;
}
