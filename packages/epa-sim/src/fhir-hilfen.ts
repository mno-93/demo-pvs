import { DEMO_HEUTE, type Ressource } from '@demo-pvs/kern';

/** Hilfen für FHIR-Antworten und `Parameters`-Ressourcen. */

export interface Detailcode {
  system: string;
  code: string;
  display?: string;
}

/** Detailcodes der TI (TI Common, `operation-outcome-details-codes`). */
export const TI_DETAILS = 'https://gematik.de/fhir/ti/CodeSystem/operation-outcome-details-codes';
/** Detailcodes der ePA (`de.gematik.epa`, `epa-operation-outcome-details-codes`). */
export const EPA_DETAILS =
  'https://gematik.de/fhir/epa/CodeSystem/epa-operation-outcome-details-codes';
/** Detailcodes des Medication Service (`de.gematik.epa.medication`). */
export const MS_DETAILS =
  'https://gematik.de/fhir/epa-medication/CodeSystem/epa-ms-operation-outcome-details';

export function operationOutcome(
  schwere: 'error' | 'warning' | 'information',
  code: string,
  text: string,
  detail?: Detailcode,
) {
  return {
    resourceType: 'OperationOutcome',
    meta: { profile: ['https://gematik.de/fhir/ti/StructureDefinition/operation-outcome'] },
    issue: [
      {
        severity: schwere,
        code,
        ...(detail ? { details: { coding: [detail] } } : {}),
        diagnostics: text,
      },
    ],
  };
}

export function suchergebnis(ressourcen: Ressource[], zusatz: Ressource[] = []) {
  return {
    resourceType: 'Bundle',
    // Zeitpunkt des Aktensystems — das Lesezeichen für eine spätere Abfrage „seit".
    meta: { lastUpdated: jetzt() },
    type: 'searchset',
    total: ressourcen.length,
    entry: [
      ...ressourcen.map((r) => ({
        fullUrl: `urn:uuid:${r.id}`,
        resource: r,
        search: { mode: 'match' },
      })),
      ...zusatz.map((r) => ({
        fullUrl: `urn:uuid:${r.id}`,
        resource: r,
        search: { mode: 'include' },
      })),
    ],
  };
}

export interface Parameter {
  name: string;
  resource?: Ressource;
  valueString?: string;
  valueId?: string;
  valueIdentifier?: { system?: string; value?: string };
  valueReference?: {
    reference?: string;
    display?: string;
    identifier?: { system?: string; value?: string };
  };
  valueCode?: string;
  valueCoding?: { system?: string; code?: string; display?: string };
  valueBoolean?: boolean;
  part?: Parameter[];
}

export interface Parameters {
  resourceType: 'Parameters';
  parameter?: Parameter[];
}

export function parameterLesen(koerper: unknown, name: string): Parameter | undefined {
  const p = koerper as Parameters | undefined;
  return p?.parameter?.find((x) => x.name === name);
}

export function parameterAlle(koerper: unknown, name: string): Parameter[] {
  const p = koerper as Parameters | undefined;
  return p?.parameter?.filter((x) => x.name === name) ?? [];
}

/** Ausgabe einer Operation als Parameters-Ressource. */
export function ausgabe(teile: [string, Ressource | undefined][]) {
  return {
    resourceType: 'Parameters',
    parameter: teile
      .filter((t): t is [string, Ressource] => !!t[1])
      .map(([name, resource]) => ({ name, resource })),
  };
}

let zaehler = 0;
export function neueId(praefix: string): string {
  zaehler += 1;
  return `${praefix}-${Date.now().toString(36)}-${zaehler}`;
}

/**
 * Zeitpunkt für Einträge: das Demo-Datum der Praxis (`DEMO_HEUTE`) mit der Ortszeit — so gehören
 * Einträge von Praxis und Akte zum selben Tag und damit zum selben Besuch.
 */
export function jetzt(): string {
  // Millisekunden und streng steigend, wie in einem Aktensystem: Ein Lesezeichen aus einer
  // Antwort darf nie mit einer späteren Änderung zusammenfallen (Abfrage „seit", ADR 0030).
  zuletzt = Math.max(Date.now(), zuletzt + 1);
  const d = new Date(zuletzt);
  const z = (w: number, n = 2) => String(w).padStart(n, '0');
  return `${DEMO_HEUTE}T${z(d.getHours())}:${z(d.getMinutes())}:${z(d.getSeconds())}.${z(d.getMilliseconds(), 3)}`;
}
let zuletzt = 0;

/**
 * Prüft einen Zeitpunkt gegen FHIR-Datumsparameter (`gt`, `ge`, `lt`, `le`, `eq`; ohne Präfix
 * `eq`). Mehrere Werte gelten zusammen, etwa `date=ge…&date=le…`. Die Zeitpunkte der Demo
 * tragen keine Zone; verglichen wird als Zeichenkette — ausreichend, weil alle aus derselben
 * Uhr stammen (`jetzt()`).
 */
export function imZeitraum(
  zeitpunkt: string | undefined,
  werte: string | string[] | undefined,
): boolean {
  const bedingungen = ([] as string[]).concat(werte ?? []);
  if (bedingungen.length === 0) return true;
  if (!zeitpunkt) return false;
  return bedingungen.every((b) => {
    const praefix = /^(gt|ge|lt|le|eq)/.exec(b)?.[1] ?? 'eq';
    const wert = b.replace(/^(gt|ge|lt|le|eq)/, '');
    const t = zeitpunkt.slice(0, Math.max(wert.length, 10));
    if (praefix === 'gt') return t > wert;
    if (praefix === 'ge') return t >= wert;
    if (praefix === 'lt') return t < wert;
    if (praefix === 'le') return t <= wert;
    return zeitpunkt.startsWith(wert);
  });
}

/** Token-Suche nach `system|wert` oder nur `wert` auf einer Kennung. */
export function kennungPasst(
  kennung: { system?: string; value?: string } | undefined,
  wert: string,
): boolean {
  if (!kennung) return false;
  const [system, value] = wert.includes('|') ? wert.split('|') : [undefined, wert];
  return (!system || kennung.system === system) && kennung.value === value;
}
