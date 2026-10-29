import type { Ressource } from '@demo-pvs/kern';
import { imZeitraum } from './fhir-hilfen.ts';

/**
 * Suchparameter der Common Query API nach dem CapabilityStatement
 * `epa-common-query-api-server` (`de.gematik.epa` 1.4.0-ballot.1), für die Typen des Medication
 * Service samt `Condition`, `Organization` und `Provenance`.
 *
 * - Ein Parameter, den der Typ nicht kennt, ergibt 400 `MSG_PARAM_UNKNOWN`; ein Wert, der nicht
 *   zur Art des Parameters passt, 400 `MSG_BAD_SYNTAX` — die Fehlercodes, die der IG für die
 *   Suche nennt.
 * - Kommagetrennte Werte verknüpfen ODER, wiederholte Parameter UND (FHIR Search).
 * - `_has:{Typ}:{Verweis}:{Parameter}=Wert` sucht rückwärts über einen Verweisparameter.
 * - Ergebnisparameter `_count`, `_offset`, `_format`. ⚠ `_sort`, `_include` und Modifikatoren außer
 *   `_has` sind nicht nachgebildet und ergeben `MSG_PARAM_UNKNOWN`.
 */

type Art = 'token' | 'date' | 'reference' | 'string';
type Json = Record<string, unknown>;
interface Kennung {
  system?: string;
  code: string;
}
interface Parameter {
  art: Art;
  /** Werte der Instanz: Kennungen (token), Zeitpunkte (date), Verweise (reference), Texte (string). */
  werte: (r: Ressource) => (Kennung | string)[];
}

const MS = 'https://gematik.de/fhir/epa-medication/StructureDefinition/';
const RX = 'https://gematik.de/fhir/epa-medication/sid/rx-prescription-process-identifier';

const liste = <T>(v: unknown): T[] =>
  Array.isArray(v) ? (v as T[]) : v === undefined ? [] : [v as T];
const kennungen = (v: unknown): Kennung[] =>
  liste<{ system?: string; value?: string }>(v)
    .filter((k) => k?.value)
    .map((k) => ({ ...(k.system ? { system: k.system } : {}), code: String(k.value) }));
const codierungen = (v: unknown): Kennung[] =>
  liste<{ coding?: { system?: string; code?: string }[] }>(v)
    .flatMap((c) => c?.coding ?? [])
    .filter((k) => k.code)
    .map((k) => ({ ...(k.system ? { system: k.system } : {}), code: String(k.code) }));
const code = (v: unknown): Kennung[] => (typeof v === 'string' ? [{ code: v }] : []);
const verweise = (v: unknown): string[] =>
  liste<{ reference?: string }>(v)
    .map((x) => x?.reference)
    .filter((x): x is string => !!x);
const erweiterung = (r: Ressource, url: string) =>
  ((r.extension ?? []) as { url: string; valueCode?: string; valueBoolean?: boolean }[]).find(
    (e) => e.url === url,
  );
const kontext = (r: Ressource) => code(erweiterung(r, `${MS}context-extension`)?.valueCode);
const rezeptkennung = (r: Ressource) => kennungen(r['identifier']).filter((k) => k.system === RX);

const GEMEINSAM: Record<string, Parameter> = {
  _id: { art: 'token', werte: (r) => code(r.id) },
  _lastUpdated: { art: 'date', werte: (r) => (r.meta?.lastUpdated ? [r.meta.lastUpdated] : []) },
};

export const SUCHPARAMETER: Record<string, Record<string, Parameter>> = {
  Medication: {
    identifier: { art: 'token', werte: (r) => kennungen(r['identifier']) },
    code: { art: 'token', werte: (r) => codierungen(r['code']) },
    status: { art: 'token', werte: (r) => code(r['status']) },
    'ingredient-code': {
      art: 'token',
      werte: (r) =>
        liste<Json>(r['ingredient']).flatMap((i) => codierungen(i['itemCodeableConcept'])),
    },
    'rx-prescription': { art: 'token', werte: rezeptkennung },
    context: { art: 'token', werte: kontext },
  },
  MedicationRequest: {
    identifier: { art: 'token', werte: (r) => kennungen(r['identifier']) },
    authoredon: { art: 'date', werte: (r) => liste<string>(r['authoredOn']) },
    intent: { art: 'token', werte: (r) => code(r['intent']) },
    status: { art: 'token', werte: (r) => code(r['status']) },
    requester: { art: 'reference', werte: (r) => verweise(r['requester']) },
    medication: { art: 'reference', werte: (r) => verweise(r['medicationReference']) },
    context: { art: 'token', werte: kontext },
    activity: {
      art: 'reference',
      werte: (r) =>
        (
          (r.extension ?? []) as {
            url: string;
            extension?: { url: string; valueReference?: unknown }[];
          }[]
        )
          .filter((e) => e.url === `${MS}emp-medicationrequest-activity-extension`)
          .flatMap((e) =>
            verweise(e.extension?.find((x) => x.url === 'reference')?.valueReference),
          ),
    },
    'effective-dose-period': {
      art: 'date',
      werte: (r) =>
        liste<Json>(r['dosageInstruction']).flatMap((d) => {
          const p = ((d['timing'] as Json | undefined)?.['repeat'] as Json | undefined)?.[
            'boundsPeriod'
          ] as { start?: string; end?: string } | undefined;
          return [p?.start, p?.end].filter((x): x is string => !!x);
        }),
    },
    'reason-reference': { art: 'reference', werte: (r) => verweise(r['reasonReference']) },
  },
  MedicationDispense: {
    identifier: { art: 'token', werte: (r) => kennungen(r['identifier']) },
    whenhandedover: { art: 'date', werte: (r) => liste<string>(r['whenHandedOver']) },
    prescription: { art: 'reference', werte: (r) => verweise(r['authorizingPrescription']) },
    performer: {
      art: 'reference',
      werte: (r) => liste<Json>(r['performer']).flatMap((p) => verweise(p['actor'])),
    },
    status: { art: 'token', werte: (r) => code(r['status']) },
    medication: { art: 'reference', werte: (r) => verweise(r['medicationReference']) },
    'rx-prescription': { art: 'token', werte: rezeptkennung },
  },
  MedicationStatement: {
    medication: { art: 'reference', werte: (r) => verweise(r['medicationReference']) },
    status: { art: 'token', werte: (r) => code(r['status']) },
    effective: {
      art: 'date',
      werte: (r) =>
        [
          r['effectiveDateTime'] as string | undefined,
          (r['effectivePeriod'] as { start?: string } | undefined)?.start,
        ].filter((x): x is string => !!x),
    },
    'rx-prescription': { art: 'token', werte: rezeptkennung },
    'derived-from': { art: 'reference', werte: (r) => verweise(r['derivedFrom']) },
    context: { art: 'token', werte: kontext },
    'based-on-emp': {
      art: 'reference',
      werte: (r) =>
        verweise(
          liste<{ reference?: string; extension?: { url: string; valueBoolean?: boolean }[] }>(
            r['basedOn'],
          ).filter((v) =>
            v.extension?.some((e) => e.url === `${MS}is-emp-extension` && e.valueBoolean),
          ),
        ),
    },
  },
  Condition: {
    subject: { art: 'reference', werte: (r) => verweise(r['subject']) },
    code: { art: 'token', werte: (r) => codierungen(r['code']) },
  },
  Organization: {
    identifier: { art: 'token', werte: (r) => kennungen(r['identifier']) },
    name: { art: 'string', werte: (r) => liste<string>(r['name']) },
  },
  Provenance: {
    agent: {
      art: 'reference',
      werte: (r) => liste<Json>(r['agent']).flatMap((a) => verweise(a['who'])),
    },
    'agent-identifier': {
      art: 'token',
      werte: (r) =>
        liste<Json>(r['agent']).flatMap((a) =>
          kennungen((a['who'] as Json | undefined)?.['identifier']),
        ),
    },
    target: { art: 'reference', werte: (r) => verweise(r['target']) },
    recorded: { art: 'date', werte: (r) => liste<string>(r['recorded']) },
    when: { art: 'date', werte: (r) => liste<string>(r['occurredDateTime']) },
    'is-emp-chronology': {
      art: 'token',
      werte: (r) => {
        const e = erweiterung(r, `${MS}is-emp-chronology-extension`);
        return e ? [{ code: String(e.valueBoolean === true) }] : [{ code: 'false' }];
      },
    },
  },
};

const ERGEBNIS = new Set(['_count', '_offset', '_format']);
const DATUM =
  /^(eq|ne|gt|lt|ge|le|sa|eb|ap)?\d{4}(-\d{2}(-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})?)?)?)?$/;

export type Suchfehler = { art: 'unbekannt' | 'syntax'; text: string };

function parameterVon(typ: string, name: string): Parameter | undefined {
  return GEMEINSAM[name] ?? SUCHPARAMETER[typ]?.[name];
}

function wertPrueft(p: Parameter, wert: string): boolean {
  if (wert === '') return false;
  if (p.art === 'date') return DATUM.test(wert);
  return true;
}

function trifft(p: Parameter, r: Ressource, wert: string): boolean {
  const werte = p.werte(r);
  switch (p.art) {
    case 'token': {
      const [system, c] = wert.includes('|') ? wert.split('|', 2) : [undefined, wert];
      return (werte as Kennung[]).some(
        (k) =>
          (system === undefined || (system === '' ? !k.system : k.system === system)) &&
          (c === '' || k.code === c),
      );
    }
    case 'date':
      return (werte as string[]).some((w) => imZeitraum(w, wert));
    case 'reference':
      return (werte as string[]).some((w) => {
        const ohneFassung = w.replace(/\/_history\/.*$/, '');
        return ohneFassung === wert || ohneFassung.endsWith(`/${wert}`) || w === wert;
      });
    case 'string':
      return (werte as string[]).some((w) => w.toLowerCase().startsWith(wert.toLowerCase()));
  }
}

/**
 * Wendet die Suchparameter einer Anfrage an. `alle` ist die ganze Ablage — für `_has`.
 * Liefert die Treffer oder den Fehler, den der Dienst meldet.
 */
export function suchen(
  typ: string,
  anfrage: Record<string, string | string[] | undefined>,
  alle: readonly Ressource[],
): Ressource[] | Suchfehler {
  let treffer = alle.filter((r) => r.resourceType === typ);
  for (const [roh, werte] of Object.entries(anfrage)) {
    if (ERGEBNIS.has(roh)) {
      if ((roh === '_count' || roh === '_offset') && !/^\d+$/.test(String(werte)))
        return { art: 'syntax', text: `${roh} muss eine ganze Zahl sein.` };
      continue;
    }
    for (const wert of ([] as string[]).concat(werte ?? [])) {
      if (roh.startsWith('_has:')) {
        const [, quelltyp, verweis, parameter] = roh.split(':');
        const vp = quelltyp && verweis ? parameterVon(quelltyp, verweis) : undefined;
        const zp = quelltyp && parameter ? parameterVon(quelltyp, parameter) : undefined;
        if (!vp || vp.art !== 'reference' || !zp)
          return { art: 'unbekannt', text: `Unbekannter Suchparameter: ${roh}` };
        if (!wert.split(',').every((w) => wertPrueft(zp, w)))
          return { art: 'syntax', text: `Ungültiger Wert für ${roh}: ${wert}` };
        const quellen = alle.filter(
          (q) => q.resourceType === quelltyp && wert.split(',').some((w) => trifft(zp, q, w)),
        );
        treffer = treffer.filter((r) =>
          quellen.some((q) => trifft(vp, q, `${typ}/${String(r.id)}`)),
        );
        continue;
      }
      const p = parameterVon(typ, roh);
      if (!p) return { art: 'unbekannt', text: `Unbekannter Suchparameter: ${roh}` };
      const teile = wert.split(',');
      if (!teile.every((w) => wertPrueft(p, w)))
        return { art: 'syntax', text: `Ungültiger Wert für ${roh}: ${wert}` };
      treffer = treffer.filter((r) => teile.some((w) => trifft(p, r, w)));
    }
  }
  return treffer;
}
