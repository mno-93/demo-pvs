import {
  DOSIERUNGSTEXT_SPRACHE,
  DOSIERUNGSTEXT_VERSION,
  dosierungstextAus,
  schemaVon,
} from './dosierungstext.js';

/**
 * Strukturierte Dosierung nach `DosageDgMP` und `TimingDgMP` (Medication IG DE 2.0.0-ballot),
 * wie sie der IG Medication Service 1.4.0-ballot.1 für eMP und eML verlangt.
 *
 * Das Praxissystem erfasst eine Dosierung als **Schema** — dieselben Schemata, die der IG kennt.
 * Daraus entstehen die `Dosage`-Elemente und der Text nach dem Algorithmus 2.0.0
 * (`dosierungstext.ts`). Ein Viererschema als Freitext („1-0-1-0") verbietet das Profil
 * (`DosageFourSlotPatternInText`).
 */

const BMP = 'https://fhir.kbv.de/CodeSystem/KBV_CS_SFHIR_BMP_DOSIEREINHEIT';
const UCUM = 'http://unitsofmeasure.org';
const ASNEEDEDFOR = 'http://hl7.org/fhir/5.0/StructureDefinition/extension-Dosage.asNeededFor';
const MINDESTABSTAND =
  'http://ig.fhir.de/igs/medication/StructureDefinition/MinimumIntervalBetweenAdministrations';
const GENERIERT =
  'http://ig.fhir.de/igs/medication/StructureDefinition/GeneratedDosageInstructionsMeta';

/** Dosiereinheit aus `KBV_CS_SFHIR_BMP_DOSIEREINHEIT` 1.01 (Auszug, Codes wörtlich). */
export interface Dosiereinheit {
  code: string;
  anzeige: string;
}

export const DOSIEREINHEITEN: readonly Dosiereinheit[] = [
  { code: '1', anzeige: 'Stück' },
  { code: '6', anzeige: 'Tropfen' },
  { code: '5', anzeige: 'Hub' },
  { code: 'o', anzeige: 'Sprühstoß' },
  { code: '4', anzeige: 'Beutel' },
  { code: '#', anzeige: 'Messlöffel' },
  { code: '7', anzeige: 'Teelöffel' },
  { code: 'g', anzeige: 'Einzeldosis' },
  { code: 'b', anzeige: 'Applikatorfüllung' },
  { code: 's', anzeige: 'ml' },
  { code: 'v', anzeige: 'mg' },
  { code: 'p', anzeige: 'IE' },
];
export const STUECK: Dosiereinheit = DOSIEREINHEITEN[0]!;

export type Tagesabschnitt = 'MORN' | 'NOON' | 'EVE' | 'NIGHT';
export const TAGESABSCHNITTE: readonly Tagesabschnitt[] = ['MORN', 'NOON', 'EVE', 'NIGHT'];
export type Wochentag = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';
export const WOCHENTAGE: readonly Wochentag[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
export const WOCHENTAG_KURZ: Record<Wochentag, string> = {
  mon: 'Mo',
  tue: 'Di',
  wed: 'Mi',
  thu: 'Do',
  fri: 'Fr',
  sat: 'Sa',
  sun: 'So',
};

/** Zeiteinheit eines Intervalls (`PeriodUnitsOfTimeDgMP` ohne Minuten). */
export type Intervalleinheit = 'h' | 'd' | 'wk' | 'mo';

/** Die Schemata, die das Praxissystem anbietet — je eines der Schemata des Medication IG DE. */
export type Dosierschema =
  | { art: 'freitext'; text: string }
  /** Viererschema morgens-mittags-abends-nachts; 0 = nicht belegt. */
  | { art: 'tageszeiten'; mengen: readonly [number, number, number, number] }
  | { art: 'uhrzeiten'; gaben: readonly { uhrzeit: string; menge: number }[] }
  | { art: 'wochentage'; gaben: readonly { tag: Wochentag; menge: number }[] }
  | { art: 'intervall'; alle: number; einheit: Intervalleinheit; menge: number }
  | {
      art: 'bedarf';
      menge: number;
      /** Obergrenze einer variablen Einzeldosis („1 bis 2"). */
      mengeBis?: number | null;
      anlass?: string | null;
      mindestabstandStunden?: number | null;
      hoechstensProTag?: number | null;
    };

export interface Dosierung {
  schema: Dosierschema;
  einheit: Dosiereinheit;
  /** Anwendungszeitraum (`timing.repeat.boundsPeriod`), ISO-Datum. Nicht bei Freitext und reinem Bedarf. */
  von?: string | null;
  bis?: string | null;
  /** Ergänzender Hinweis für Patient:innen (`patientInstruction`). */
  hinweis?: string | null;
}

type Json = Record<string, unknown>;

const menge = (wert: number, e: Dosiereinheit) => ({
  value: wert,
  unit: e.anzeige,
  system: BMP,
  code: e.code,
});

/** `Dosage`-Elemente nach `DosageDgMP`. Mehrere Elemente nur für unterschiedliche Dosen. */
export function dosierungNachFhir(d: Dosierung): Json[] {
  const s = d.schema;
  if (s.art === 'freitext') return [{ text: s.text }];
  const rahmen = (repeat: Json): Json => ({
    ...repeat,
    ...(d.von || d.bis
      ? { boundsPeriod: { ...(d.von ? { start: d.von } : {}), ...(d.bis ? { end: d.bis } : {}) } }
      : {}),
  });
  const hinweis = d.hinweis?.trim() ? { patientInstruction: d.hinweis.trim() } : {};
  const dosis = (wert: number) => ({ doseAndRate: [{ doseQuantity: menge(wert, d.einheit) }] });
  /** Je Dosis ein Element — gleiche Dosen teilen sich eines (`TimingSingleDosageForWhen`). */
  function nachDosis<T>(gaben: readonly { wert: T; menge: number }[], bau: (werte: T[]) => Json) {
    const gruppen = new Map<number, T[]>();
    for (const g of gaben.filter((x) => x.menge > 0))
      gruppen.set(g.menge, [...(gruppen.get(g.menge) ?? []), g.wert]);
    return [...gruppen.entries()].map(([m, werte]) => ({
      timing: { repeat: rahmen(bau(werte)) },
      ...dosis(m),
      ...hinweis,
    }));
  }
  switch (s.art) {
    case 'tageszeiten':
      return nachDosis(
        s.mengen.map((m, i) => ({ wert: TAGESABSCHNITTE[i]!, menge: m })),
        (when) => ({ frequency: when.length, period: 1, periodUnit: 'd', when }),
      );
    case 'uhrzeiten':
      return nachDosis(
        [...s.gaben]
          .sort((a, b) => a.uhrzeit.localeCompare(b.uhrzeit))
          .map((g) => ({ wert: `${g.uhrzeit}:00`, menge: g.menge })),
        (timeOfDay) => ({ frequency: timeOfDay.length, period: 1, periodUnit: 'd', timeOfDay }),
      );
    case 'wochentage':
      return nachDosis(
        [...s.gaben]
          .sort((a, b) => WOCHENTAGE.indexOf(a.tag) - WOCHENTAGE.indexOf(b.tag))
          .map((g) => ({ wert: g.tag, menge: g.menge })),
        (dayOfWeek) => ({ dayOfWeek }),
      );
    case 'intervall':
      return [
        {
          timing: { repeat: rahmen({ frequency: 1, period: s.alle, periodUnit: s.einheit }) },
          ...dosis(s.menge),
          ...hinweis,
        },
      ];
    case 'bedarf': {
      const dose = s.mengeBis
        ? { doseRange: { low: menge(s.menge, d.einheit), high: menge(s.mengeBis, d.einheit) } }
        : { doseQuantity: menge(s.menge, d.einheit) };
      return [
        {
          ...(s.anlass?.trim()
            ? { extension: [{ url: ASNEEDEDFOR, valueCodeableConcept: { text: s.anlass.trim() } }] }
            : {}),
          ...(s.mindestabstandStunden
            ? {
                modifierExtension: [
                  {
                    url: MINDESTABSTAND,
                    valueDuration: {
                      value: s.mindestabstandStunden,
                      unit: s.mindestabstandStunden === 1 ? 'Stunde' : 'Stunden',
                      system: UCUM,
                      code: 'h',
                    },
                  },
                ],
              }
            : {}),
          asNeededBoolean: true,
          doseAndRate: [dose],
          ...(s.hoechstensProTag
            ? {
                maxDosePerPeriod: {
                  numerator: menge(s.hoechstensProTag, d.einheit),
                  denominator: { value: 1, unit: 'Tag', system: UCUM, code: 'd' },
                },
              }
            : {}),
          ...hinweis,
        },
      ];
    }
  }
}

/** Zeitraum und Hinweis lassen sich nicht bei jedem Schema angeben (Profil, Algorithmus). */
export function mitZeitraum(s: Dosierschema): boolean {
  return s.art !== 'freitext' && s.art !== 'bedarf';
}
export function mitHinweis(s: Dosierschema): boolean {
  return s.art !== 'freitext';
}

/** Text der Dosierung nach Algorithmus 2.0.0; wirft bei einer nicht darstellbaren Angabe. */
export function dosierungAlsText(d: Dosierung): string {
  return dosierungstextAus(dosierungNachFhir(d));
}

/**
 * Extensions zum erzeugten Text, die die Ressource trägt (`renderedDosageInstruction` mit dem
 * Ressourcentyp in der URL, `GeneratedDosageInstructionsMeta`).
 */
export function textErweiterungen(
  ressourcentyp: 'MedicationRequest' | 'MedicationStatement' | 'MedicationDispense',
  dosierungen: unknown,
): { url: string; [k: string]: unknown }[] {
  return [
    {
      url: `http://hl7.org/fhir/5.0/StructureDefinition/extension-${ressourcentyp}.renderedDosageInstruction`,
      valueMarkdown: dosierungstextAus(dosierungen),
    },
    {
      url: GENERIERT,
      extension: [
        { url: 'algorithmVersion', valueString: DOSIERUNGSTEXT_VERSION },
        { url: 'language', valueCode: DOSIERUNGSTEXT_SPRACHE },
      ],
    },
  ];
}

export const TEXT_EXTENSION = {
  gerendert: (typ: string) =>
    `http://hl7.org/fhir/5.0/StructureDefinition/extension-${typ}.renderedDosageInstruction`,
  generiert: GENERIERT,
} as const;

/** Der erzeugte Text einer Ressource, wie sie ihn trägt. */
export function gerenderterText(r: Json): string | null {
  const typ = String(r['resourceType'] ?? '');
  const ext = ((r['extension'] as Json[] | undefined) ?? []).find(
    (e) => e['url'] === TEXT_EXTENSION.gerendert(typ),
  );
  return typeof ext?.['valueMarkdown'] === 'string' ? ext['valueMarkdown'] : null;
}

/* ---------- Rückweg ---------- */

const zahl = (v: unknown) => (typeof v === 'number' ? v : 0);

/**
 * Schema zu `Dosage`-Elementen — für die Formen, die das Praxissystem selbst erzeugt. Andere
 * Formen ergeben `null`; dann bleibt nur der Text.
 */
export function dosierungAusFhir(dosierungen: unknown): Dosierung | null {
  if (!Array.isArray(dosierungen) || dosierungen.length === 0) return null;
  const els = dosierungen as Json[];
  const erstes = els[0]!;
  const r = ((erstes['timing'] as Json | undefined)?.['repeat'] as Json | undefined) ?? {};
  const q = (el: Json) =>
    ((el['doseAndRate'] as Json[] | undefined)?.[0]?.['doseQuantity'] as Json | undefined) ?? {};
  const einheitVon = (m: Json): Dosiereinheit =>
    DOSIEREINHEITEN.find((e) => e.code === m['code']) ?? {
      code: String(m['code'] ?? ''),
      anzeige: String(m['unit'] ?? ''),
    };
  const zeitraum = (r['boundsPeriod'] as { start?: string; end?: string } | undefined) ?? {};
  const rahmen = {
    von: zeitraum.start?.slice(0, 10) ?? null,
    bis: zeitraum.end?.slice(0, 10) ?? null,
    hinweis: typeof erstes['patientInstruction'] === 'string' ? erstes['patientInstruction'] : null,
  };
  let schema: Dosierschema;
  let einheit = einheitVon(q(erstes));
  try {
    switch (schemaVon(erstes)) {
      case 'FreeText':
        return { schema: { art: 'freitext', text: String(erstes['text']) }, einheit: STUECK };
      case '4-Schema': {
        const mengen = [0, 0, 0, 0] as [number, number, number, number];
        for (const el of els) {
          const w = ((el['timing'] as Json)['repeat'] as Json)['when'] as string[];
          for (const c of w)
            mengen[TAGESABSCHNITTE.indexOf(c as Tagesabschnitt)] = zahl(q(el)['value']);
        }
        schema = { art: 'tageszeiten', mengen };
        break;
      }
      case 'TimeOfDay':
        schema = {
          art: 'uhrzeiten',
          gaben: els.flatMap((el) =>
            (((el['timing'] as Json)['repeat'] as Json)['timeOfDay'] as string[]).map((z) => ({
              uhrzeit: z.slice(0, 5),
              menge: zahl(q(el)['value']),
            })),
          ),
        };
        break;
      case 'DayOfWeek':
        schema = {
          art: 'wochentage',
          gaben: els.flatMap((el) =>
            (((el['timing'] as Json)['repeat'] as Json)['dayOfWeek'] as Wochentag[]).map((tag) => ({
              tag,
              menge: zahl(q(el)['value']),
            })),
          ),
        };
        break;
      case 'Interval':
        schema = {
          art: 'intervall',
          alle: zahl(r['period']),
          einheit: r['periodUnit'] as Intervalleinheit,
          menge: zahl(q(erstes)['value']),
        };
        break;
      case 'AsNeeded': {
        const bereich = (erstes['doseAndRate'] as Json[])[0]?.['doseRange'] as Json | undefined;
        const max = erstes['maxDosePerPeriod'] as Json | undefined;
        const abstand = ((erstes['modifierExtension'] as Json[] | undefined) ?? []).find(
          (e) => e['url'] === MINDESTABSTAND,
        )?.['valueDuration'] as Json | undefined;
        if (bereich) einheit = einheitVon((bereich['high'] as Json) ?? {});
        schema = {
          art: 'bedarf',
          menge: zahl(
            bereich ? (bereich['low'] as Json | undefined)?.['value'] : q(erstes)['value'],
          ),
          mengeBis: bereich ? zahl((bereich['high'] as Json)['value']) : null,
          anlass:
            (
              ((erstes['extension'] as Json[] | undefined) ?? []).find(
                (e) => e['url'] === ASNEEDEDFOR,
              )?.['valueCodeableConcept'] as { text?: string } | undefined
            )?.text ?? null,
          mindestabstandStunden: abstand?.['code'] === 'h' ? zahl(abstand['value']) : null,
          hoechstensProTag:
            (max?.['denominator'] as Json | undefined)?.['code'] === 'd'
              ? zahl((max!['numerator'] as Json)['value'])
              : null,
        };
        return { schema, einheit, hinweis: rahmen.hinweis };
      }
      default:
        return null;
    }
  } catch {
    return null;
  }
  return { schema, einheit, ...rahmen };
}

/* ---------- Kategorie und Darstellung ---------- */

export type EmpKategorie = 'daily' | 'specific-days' | 'as-needed' | 'unassigned';

export const EMP_KATEGORIE_BEZEICHNUNG: Record<EmpKategorie, string> = {
  daily: 'Jeden Tag',
  'specific-days': 'Nur an bestimmten Tagen',
  'as-needed': 'Bei Bedarf',
  unassigned: 'Keine Gruppe zugeordnet: Bitte einzeln prüfen',
};
export const EMP_KATEGORIEN: readonly EmpKategorie[] = [
  'daily',
  'specific-days',
  'as-needed',
  'unassigned',
];

const MINUTEN: Record<string, number> = { min: 1, h: 60, d: 1440, wk: 10080, mo: 43200, a: 525600 };

/**
 * Kategorie, die der Medication Service bestimmt (IG 1.4.0-ballot.1, „Kategorisierung und
 * Sortierung", Geschäftslogik von `$add-emp-entry`): automatisch, wenn genau ein Element mit
 * `timing` oder `asNeeded` vorliegt — Bedarf, sonst täglich bei einem Rhythmus von höchstens einem
 * Tag, sonst „nur an bestimmten Tagen". Sonst `null`: Dann gilt die Angabe des Primärsystems.
 *
 * ⚠ Ohne `period` (reines Viererschema, Uhrzeiten) gilt die Gabe als täglich; Wochentage gelten
 * als „nur an bestimmten Tagen". Beides leitet die Demo aus dem Schema ab, der Ballot nennt nur
 * die Periode.
 */
export function automatischeKategorie(dosierungen: unknown): EmpKategorie | null {
  if (!Array.isArray(dosierungen) || dosierungen.length !== 1) return null;
  const el = dosierungen[0] as Json;
  const timing = el['timing'] as Json | undefined;
  if (!timing && el['asNeededBoolean'] === undefined) return null;
  if (el['asNeededBoolean'] === true) return 'as-needed';
  const r = (timing?.['repeat'] as Json | undefined) ?? {};
  if (Array.isArray(r['dayOfWeek']) && r['dayOfWeek'].length > 0) return 'specific-days';
  if (r['period'] === undefined) return 'daily';
  const minuten = zahl(r['period']) * (MINUTEN[String(r['periodUnit'])] ?? Infinity);
  return minuten <= 1440 ? 'daily' : 'specific-days';
}

/**
 * Tabellarische Darstellung (morgens-mittags-abends-nachts) nach „Darstellung von
 * Dosierungsinformationen" (IG 1.4.0-ballot.1); sonst der erzeugte Text.
 */
export function alsTabelle(dosierungen: unknown): number[] | null {
  if (!Array.isArray(dosierungen) || dosierungen.length === 0) return null;
  const els = dosierungen as Json[];
  const einfach = els.every((el) => {
    const r = ((el['timing'] as Json | undefined)?.['repeat'] as Json | undefined) ?? {};
    return (
      Array.isArray(r['when']) &&
      r['when'].length > 0 &&
      r['frequency'] !== undefined &&
      r['period'] === 1 &&
      r['periodUnit'] === 'd' &&
      r['timeOfDay'] === undefined &&
      r['dayOfWeek'] === undefined &&
      r['boundsPeriod'] === undefined &&
      r['boundsDuration'] === undefined
    );
  });
  const einheiten = new Set(
    els.map(
      (el) =>
        ((el['doseAndRate'] as Json[] | undefined)?.[0]?.['doseQuantity'] as Json | undefined)?.[
          'unit'
        ],
    ),
  );
  if (!einfach || einheiten.size !== 1) return null;
  const werte = [0, 0, 0, 0];
  for (const el of els) {
    const wert = zahl(((el['doseAndRate'] as Json[])[0]!['doseQuantity'] as Json)['value']);
    for (const c of ((el['timing'] as Json)['repeat'] as Json)['when'] as string[])
      werte[TAGESABSCHNITTE.indexOf(c as Tagesabschnitt)]! += wert;
  }
  return werte;
}

/* ---------- Übernahme aus Text ---------- */

const VIERER = /^\s*(\d+(?:[,.]\d+)?)-(\d+(?:[,.]\d+)?)-(\d+(?:[,.]\d+)?)-(\d+(?:[,.]\d+)?)\s*$/;

/**
 * Dosierung aus einer Textangabe, wie sie Rezept und ältere Bestände führen: Ein Viererschema
 * wird strukturiert, alles andere bleibt Freitext.
 */
export function dosierungAusText(text: string, einheit: Dosiereinheit = STUECK): Dosierung {
  const m = VIERER.exec(text);
  if (!m) return { schema: { art: 'freitext', text }, einheit };
  const n = (i: number) => Number(m[i]!.replace(',', '.'));
  return { schema: { art: 'tageszeiten', mengen: [n(1), n(2), n(3), n(4)] }, einheit };
}

/* ---------- Prüfung bei der Eingabe ---------- */

const ERLAUBTE_ANTEILE = [0, 0.25, 0.33, 0.5, 0.66, 0.75];
export const VIERERSCHEMA_IM_TEXT =
  /^\s*\d+([.,]\d+)?(\s*\/\s*\d+)?(\s*[-–]\s*\d+([.,]\d+)?(\s*\/\s*\d+)?){3}(\s*[A-Za-zÄÖÜäöüß().]+)?\s*$/;

/**
 * Regeln von `DosageDgMP` und `TimingDgMP`, die schon bei der Eingabe greifen — mit Namen der
 * Invariante, damit die Meldung nachvollziehbar bleibt. Leer, wenn die Dosierung zulässig ist.
 */
export function dosierungPruefen(d: Dosierung): string[] {
  const s = d.schema;
  const befunde: string[] = [];
  if (s.art === 'freitext') {
    if (s.text.trim() === '') befunde.push('Dosierung fehlt');
    else if (VIERERSCHEMA_IM_TEXT.test(s.text))
      befunde.push('Viererschema nicht als Freitext (DosageFourSlotPatternInText)');
    return befunde;
  }
  const mengen =
    s.art === 'tageszeiten'
      ? s.mengen.filter((m) => m > 0)
      : s.art === 'uhrzeiten' || s.art === 'wochentage'
        ? s.gaben.map((g) => g.menge)
        : s.art === 'bedarf'
          ? [s.menge, ...(s.mengeBis ? [s.mengeBis] : [])]
          : [s.menge];
  if (mengen.length === 0) befunde.push('Keine Gabe angegeben');
  if (mengen.some((m) => !(m > 0) && !(s.art === 'bedarf' && s.mengeBis && m === 0)))
    befunde.push('Dosis größer als 0 (DosageDoseValuePositive)');
  if (mengen.some((m) => !ERLAUBTE_ANTEILE.includes(Math.round((m % 1) * 100) / 100)))
    befunde.push(
      'Nachkommaanteil nur ,25 · ,33 · ,5 · ,66 · ,75 (DosageDoseQuantityAllowedFractions)',
    );
  if (s.art === 'uhrzeiten') {
    if (s.gaben.some((g) => !/^([01]\d|2[0-3]):[0-5]\d$/.test(g.uhrzeit)))
      befunde.push('Uhrzeit fehlt');
    if (new Set(s.gaben.map((g) => g.uhrzeit)).size !== s.gaben.length)
      befunde.push('Uhrzeit doppelt (TimingOnlyOneTimeOfDay)');
  }
  if (s.art === 'intervall' && !(Number.isInteger(s.alle) && s.alle > 0))
    befunde.push('Intervall als ganze Zahl (TimingPeriodOnlyWholeNumber)');
  if (s.art === 'bedarf' && s.mengeBis && s.mengeBis <= s.menge)
    befunde.push('Obergrenze über der Untergrenze');
  if (d.von && d.bis && d.bis < d.von) befunde.push('Ende vor Beginn');
  if (befunde.length === 0) {
    try {
      dosierungAlsText(d);
    } catch (e) {
      befunde.push(e instanceof Error ? e.message : String(e));
    }
  }
  return befunde;
}
