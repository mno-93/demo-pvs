import { demoZeitpunkt, ohneZeitzone, vollUrl, type Ressource } from '@demo-pvs/kern';

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
        fullUrl: vollUrl(r),
        resource: r,
        search: { mode: 'match' },
      })),
      ...zusatz.map((r) => ({
        fullUrl: vollUrl(r),
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

/**
 * Zeitpunkt für Einträge nach der Demo-Uhr des Kerns (`demoZeitpunkt`): Demo-Tag und deutsche
 * Uhrzeit, mit Millisekunden und streng steigend, wie in einem Aktensystem. Ein Lesezeichen aus
 * einer Antwort darf nie mit einer späteren Änderung zusammenfallen (Abfrage „seit", ADR 0030).
 */
export function jetzt(): string {
  return demoZeitpunkt();
}

/** Datumspräfixe, die `imZeitraum` auswertet; `ap` („ungefähr“) nicht. */
export const DATUMSPRAEFIXE = ['eq', 'ne', 'gt', 'ge', 'lt', 'le', 'sa', 'eb'] as const;

/**
 * Prüft einen Zeitpunkt gegen FHIR-Datumsparameter (`gt`, `ge`, `lt`, `le`, `eq`, `ne`, `sa`,
 * `eb`; ohne Präfix `eq`). Für einen Zeitpunkt gilt `sa` wie `gt` und `eb` wie `lt`. Mehrere Werte
 * gelten zusammen, etwa `date=ge…&date=le…`. Der Bestand führt Zeitpunkte ohne Zone, Antworten
 * tragen sie (zeit.ts im Kern) — und so kommen sie als Lesezeichen zurück. Verglichen wird
 * deshalb ohne Zone, als Zeichenkette: Alle stammen aus derselben Uhr.
 */
export function imZeitraum(
  zeitpunkt: string | undefined,
  werte: string | string[] | undefined,
): boolean {
  const bedingungen = ([] as string[]).concat(werte ?? []);
  if (bedingungen.length === 0) return true;
  if (!zeitpunkt) return false;
  const lokal = ohneZeitzone(zeitpunkt);
  return bedingungen.every((b) => {
    const angabe = /^(gt|ge|lt|le|eq|ne|sa|eb)/.exec(b)?.[1] ?? 'eq';
    const praefix = angabe === 'sa' ? 'gt' : angabe === 'eb' ? 'lt' : angabe;
    const wert = ohneZeitzone(b.replace(/^(gt|ge|lt|le|eq|ne|sa|eb)/, ''));
    const t = lokal.slice(0, Math.max(wert.length, 10));
    // Ein reines Datum steht für den ganzen Tag (FHIR Search, Datumsbereiche): „nach" vergleicht
    // mit dessen Ende, „vor" mit dessen Anfang.
    const tag = lokal.length === 10 && wert.length > 10;
    const ende = tag ? `${lokal}T23:59:59.999` : t;
    const anfang = tag ? `${lokal}T00:00:00` : t;
    if (praefix === 'gt') return ende > wert;
    if (praefix === 'ge') return ende >= wert;
    if (praefix === 'lt') return anfang < wert;
    if (praefix === 'le') return anfang <= wert;
    if (praefix === 'ne') return !lokal.startsWith(wert);
    return lokal.startsWith(wert);
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
