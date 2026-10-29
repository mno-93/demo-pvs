/**
 * Dosierungstext nach dem Algorithmus von HL7 Deutschland (Medication IG DE 2.0.0-ballot,
 * „Dosis Textgenerierung"; Spezifikation `dosage-text-algorithm-spec.md` im Repository
 * `hl7germany/dgMP-DosageTextgenerierung-Skript`, Stand 2.0.0-rc.2).
 *
 * Der IG Medication Service 1.4.0-ballot.1 verlangt, dass das Primärsystem den Text einer
 * strukturierten Dosierung selbst erzeugt und in `renderedDosageInstruction` mitschickt; der
 * Dienst erzeugt ihn neu und lehnt bei Abweichung ab (`SVC_DOSAGE_INVALID_RENDERED_INSTRUCTION`).
 * Deshalb liegt der Algorithmus im Kern: Praxissystem und Simulator rechnen mit derselben
 * Funktion.
 *
 * ⚠ Der Dienst akzeptiert nur die Algorithmusversion `2.0.0`; veröffentlicht sind bisher nur
 * Release Candidates. Die Demo setzt `2.0.0` und bildet 2.0.0-rc.2 nach (SPEZIFIKATION 5.14).
 *
 * Abweichung von der Referenz: JSON-Zahlen verlieren in JavaScript nachfolgende Nullen (`1.0`
 * wird `1`). Die Demo erzeugt solche Werte nicht; die Referenz liest sie als Dezimalzahl.
 */

type Json = Record<string, unknown>;

/** Algorithmusversion, die der Medication Service annimmt (Ballot 1.4.0, general-principles). */
export const DOSIERUNGSTEXT_VERSION = '2.0.0';
export const DOSIERUNGSTEXT_SPRACHE = 'de-DE';

export class DosierungstextFehler extends Error {}

const ASNEEDEDFOR = 'http://hl7.org/fhir/5.0/StructureDefinition/extension-Dosage.asNeededFor';
const MINDESTABSTAND =
  'http://ig.fhir.de/igs/medication/StructureDefinition/MinimumIntervalBetweenAdministrations';

const ZEITEINHEIT: Record<string, [string, string]> = {
  s: ['Sekunde', 'Sekunden'],
  min: ['Minute', 'Minuten'],
  h: ['Stunde', 'Stunden'],
  d: ['Tag', 'Tage'],
  wk: ['Woche', 'Wochen'],
  mo: ['Monat', 'Monate'],
  a: ['Jahr', 'Jahre'],
};
const WOCHENTAG: Record<string, string> = {
  mon: 'montags',
  tue: 'dienstags',
  wed: 'mittwochs',
  thu: 'donnerstags',
  fri: 'freitags',
  sat: 'samstags',
  sun: 'sonntags',
};
const WOCHENTAGE = Object.keys(WOCHENTAG);
const ABSCHNITT: Record<string, string> = {
  MORN: 'morgens',
  NOON: 'mittags',
  EVE: 'abends',
  NIGHT: 'zur Nacht',
};
const ABSCHNITTE = Object.keys(ABSCHNITT);
const UHRZEIT = /^([01]\d|2[0-3]):([0-5]\d)(:([0-5]\d|60)(\.\d+)?)?$/;
const DATUM =
  /^(\d{4})-(\d{2})-(\d{2})(T(\d{2}):(\d{2})(:(\d{2}|60)(\.\d+)?)?(Z|[+-]\d{2}:\d{2}))?$/;

const fehler = (text: string): never => {
  throw new DosierungstextFehler(text);
};

/* ---------- Typen der gelesenen Felder ---------- */

const istObjekt = (v: unknown): v is Json =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

function objekt(v: unknown, feld: string): Json | undefined {
  if (v === undefined) return undefined;
  if (!istObjekt(v)) fehler(`${feld} muss ein Objekt sein.`);
  return v as Json;
}
function liste(v: unknown, feld: string): unknown[] | undefined {
  if (v === undefined) return undefined;
  if (!Array.isArray(v)) fehler(`${feld} muss eine Liste sein.`);
  return v as unknown[];
}
function zahlFeld(v: unknown, feld: string): number | undefined {
  if (v === undefined) return undefined;
  if (typeof v !== 'number') fehler(`${feld} muss numerisch sein.`);
  return v as number;
}
function ganzzahl(v: unknown, feld: string): number | undefined {
  if (v === undefined) return undefined;
  if (typeof v !== 'number' || !Number.isInteger(v)) fehler(`${feld} muss eine ganze Zahl sein.`);
  return v as number;
}
function zeichen(v: unknown, feld: string): string | undefined {
  if (v === undefined) return undefined;
  if (typeof v !== 'string') fehler(`${feld} muss ein String sein.`);
  return v as string;
}

/* ---------- Teil A: einzelne Angaben ---------- */

/** Zahl mit deutschem Dezimalkomma, ohne Rundung. */
export function zahlText(v: number): string {
  let s = String(v);
  if (/e/i.test(s))
    s = v.toLocaleString('en-US', { useGrouping: false, maximumFractionDigits: 20 });
  return s.replace('.', ',');
}

function zeiteinheit(code: string, bezug: number): string {
  const e = ZEITEINHEIT[code] ?? fehler(`Nicht unterstützte Zeiteinheit: '${code}'.`);
  return bezug === 1 ? e[0] : e[1];
}

function ohneVergleich(q: Json | undefined, feld: string) {
  if (q && 'comparator' in q) fehler(`${feld}.comparator wird nicht unterstützt.`);
}

const leer = (s: string | undefined) => s === undefined || s.trim() === '';

/** Dosis ohne „je": Wert (oder Bereich) und Einheit, wörtlich. */
interface Dosis {
  wert: string;
  einheit: string;
  bereich: boolean;
}
const gleich = (a: Dosis, b: Dosis) => a.wert === b.wert && a.einheit === b.einheit;
const dosisText = (d: Dosis) => `${d.wert} ${d.einheit}`;

function dosisVon(el: Json): Dosis {
  const dr = liste(el['doseAndRate'], 'doseAndRate');
  if (!dr || dr.length === 0) fehler('doseAndRate ist für die Textgenerierung erforderlich.');
  const erster = objekt(dr![0], 'doseAndRate[]')!;
  const menge = objekt(erster['doseQuantity'], 'doseQuantity');
  if (menge) {
    ohneVergleich(menge, 'doseQuantity');
    const wert = zahlFeld(menge['value'], 'doseQuantity.value');
    const einheit = zeichen(menge['unit'], 'doseQuantity.unit');
    if (wert === undefined) fehler('doseQuantity.value ist für die Textgenerierung erforderlich.');
    if (leer(einheit)) fehler('doseQuantity.unit ist für die Textgenerierung erforderlich.');
    if (wert! < 0) fehler('doseQuantity.value darf nicht negativ sein.');
    return { wert: zahlText(wert!), einheit: einheit!, bereich: false };
  }
  const bereich = objekt(erster['doseRange'], 'doseRange');
  if (!bereich) fehler('Dosisangabe in doseAndRate[0] fehlt.');
  const tief = objekt(bereich!['low'], 'doseRange.low');
  const hoch = objekt(bereich!['high'], 'doseRange.high');
  ohneVergleich(tief, 'doseRange.low');
  ohneVergleich(hoch, 'doseRange.high');
  const hw = zahlFeld(hoch?.['value'], 'doseRange.high.value');
  const he = zeichen(hoch?.['unit'], 'doseRange.high.unit');
  if (hw === undefined) fehler('doseRange.high.value ist für die Textgenerierung erforderlich.');
  if (leer(he)) fehler('doseRange.high.unit ist für die Textgenerierung erforderlich.');
  if (hw! < 0) fehler('doseRange.high.value darf nicht negativ sein.');
  if (!tief) return { wert: `bis zu ${zahlText(hw!)}`, einheit: he!, bereich: true };
  const tw = zahlFeld(tief['value'], 'doseRange.low.value');
  const te = zeichen(tief['unit'], 'doseRange.low.unit');
  if (tw === undefined) fehler('doseRange.low.value ist für die Textgenerierung erforderlich.');
  if (tw! < 0) fehler('doseRange.low.value darf nicht negativ sein.');
  if (te !== undefined && te !== he)
    fehler('doseRange.low.unit und doseRange.high.unit müssen übereinstimmen.');
  return { wert: `${zahlText(tw!)} bis ${zahlText(hw!)}`, einheit: he!, bereich: true };
}

function wiederholung(el: Json): Json {
  const t = objekt(el['timing'], 'timing');
  return objekt(t?.['repeat'], 'timing.repeat') ?? {};
}

function datumText(wert: unknown, feld: 'start' | 'end'): string {
  const s = zeichen(wert, `timing.repeat.boundsPeriod.${feld}`)!;
  const m = DATUM.exec(s);
  const ungueltig = () =>
    fehler(
      `boundsPeriod.${feld} muss ein parsebares FHIR-dateTime mit vollständigem Datum im Format JJJJ-MM-TT sein; eine Uhrzeit erfordert eine Zeitzone.`,
    );
  if (!m) return ungueltig();
  const [j, mo, t] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const kalender = new Date(Date.UTC(j, mo - 1, t));
  if (kalender.getUTCMonth() !== mo - 1 || kalender.getUTCDate() !== t) return ungueltig();
  if (!m[4]) return `${m[3]}.${m[2]}.${m[1]}`;
  const zeitpunkt = new Date(s.replace(/:60(\.\d+)?/, ':59'));
  if (Number.isNaN(zeitpunkt.getTime())) return ungueltig();
  const teile = Object.fromEntries(
    new Intl.DateTimeFormat('de-DE', {
      timeZone: 'Europe/Berlin',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(zeitpunkt)
      .map((p) => [p.type, p.value]),
  );
  return `${teile['day']}.${teile['month']}.${teile['year']} um ${teile['hour']}:${teile['minute']} Uhr`;
}

/** Zeitrahmen aus `boundsDuration` oder `boundsPeriod` des ersten Elements. */
function zeitrahmen(el: Json): string | null {
  const r = wiederholung(el);
  const dauer = objekt(r['boundsDuration'], 'timing.repeat.boundsDuration');
  const zeitraum = objekt(r['boundsPeriod'], 'timing.repeat.boundsPeriod');
  if (dauer && zeitraum)
    fehler('boundsPeriod und boundsDuration dürfen nicht gleichzeitig vorhanden sein.');
  if (dauer) {
    ohneVergleich(dauer, 'timing.repeat.boundsDuration');
    const w = zahlFeld(dauer['value'], 'timing.repeat.boundsDuration.value');
    const c = zeichen(dauer['code'], 'timing.repeat.boundsDuration.code');
    if (w === undefined) fehler('boundsDuration.value ist für die Textgenerierung erforderlich.');
    if (c === undefined) fehler('boundsDuration.code ist für die Textgenerierung erforderlich.');
    return `für ${zahlText(w!)} ${zeiteinheit(c!, w!)}`;
  }
  if (zeitraum) {
    const hatStart = zeitraum['start'] !== undefined;
    const hatEnde = zeitraum['end'] !== undefined;
    if (!hatStart && !hatEnde) fehler('boundsPeriod muss start und/oder end enthalten.');
    const start = hatStart ? datumText(zeitraum['start'], 'start') : null;
    const ende = hatEnde ? datumText(zeitraum['end'], 'end') : null;
    if (start && ende) return `vom ${start} bis zum ${ende}`;
    return start ? `ab dem ${start}` : `bis zum ${ende!}`;
  }
  return null;
}

/** Einnahmerhythmus; ohne Frequenz für die Intervall-Kombination. */
function rhythmus(r: Json, mitFrequenz: boolean): string {
  const f = ganzzahl(r['frequency'], 'timing.repeat.frequency');
  const fmax = ganzzahl(r['frequencyMax'], 'timing.repeat.frequencyMax');
  const p = zahlFeld(r['period'], 'timing.repeat.period')!;
  const pmax = zahlFeld(r['periodMax'], 'timing.repeat.periodMax');
  const einheit = zeichen(r['periodUnit'], 'timing.repeat.periodUnit')!;
  const kurz: Record<string, string> = { d: 'täglich', wk: 'wöchentlich', mo: 'monatlich' };
  const frequenz = fmax !== undefined ? `${zahlText(f!)} bis ${zahlText(fmax)}` : zahlText(f ?? 1);
  const eins = f === 1 && fmax === undefined;
  if (p === 1 && pmax === undefined && kurz[einheit]) {
    if (!mitFrequenz || eins) return kurz[einheit]!;
    return `${frequenz} x ${kurz[einheit]!}`;
  }
  const periode = pmax !== undefined ? `${zahlText(p)} bis ${zahlText(pmax)}` : zahlText(p);
  const alle = `alle ${periode} ${zeiteinheit(einheit, pmax ?? p)}`;
  return !mitFrequenz || eins ? alle : `${frequenz} x ${alle}`;
}

function anlaesse(el: Json): string[] {
  return (liste(el['extension'], 'extension') ?? [])
    .map((e) => objekt(e, 'extension[]')!)
    .filter((e) => e['url'] === ASNEEDEDFOR)
    .map((e) => {
      const k = objekt(e['valueCodeableConcept'], 'extension[].valueCodeableConcept');
      const t = zeichen(k?.['text'], 'extension[].valueCodeableConcept.text');
      if (leer(t))
        fehler('asNeededFor.valueCodeableConcept.text ist für die Textgenerierung erforderlich.');
      return t!.trim();
    });
}

function bedarfText(el: Json): string {
  const a = anlaesse(el);
  if (a.length === 0) return 'bei Bedarf';
  if (a.length === 1) return `bei ${a[0]!}`;
  return `bei ${a.slice(0, -1).join(', ')} oder ${a[a.length - 1]!}`;
}

function mindestabstand(el: Json): Json | undefined {
  return (liste(el['modifierExtension'], 'modifierExtension') ?? [])
    .map((e) => objekt(e, 'modifierExtension[]')!)
    .find((e) => e['url'] === MINDESTABSTAND);
}

function mindestabstandText(ext: Json): string {
  const d = objekt(ext['valueDuration'], 'modifierExtension[].valueDuration');
  if (!d)
    fehler(
      'MinimumIntervalBetweenAdministrations.valueDuration ist für die Textgenerierung erforderlich.',
    );
  ohneVergleich(d, 'modifierExtension[].valueDuration');
  const w = zahlFeld(d!['value'], 'modifierExtension[].valueDuration.value');
  const c = zeichen(d!['code'], 'modifierExtension[].valueDuration.code');
  if (w === undefined)
    fehler(
      'MinimumIntervalBetweenAdministrations.valueDuration.value ist für die Textgenerierung erforderlich.',
    );
  if (c === undefined)
    fehler(
      'MinimumIntervalBetweenAdministrations.valueDuration.code ist für die Textgenerierung erforderlich.',
    );
  return `im Abstand von mindestens ${zahlText(w!)} ${zeiteinheit(c!, w!)}`;
}

function maximalmengeText(el: Json): string | null {
  const m = objekt(el['maxDosePerPeriod'], 'maxDosePerPeriod');
  if (!m) return null;
  const zaehler = objekt(m['numerator'], 'maxDosePerPeriod.numerator');
  const nenner = objekt(m['denominator'], 'maxDosePerPeriod.denominator');
  ohneVergleich(zaehler, 'maxDosePerPeriod.numerator');
  ohneVergleich(nenner, 'maxDosePerPeriod.denominator');
  const zw = zahlFeld(zaehler?.['value'], 'maxDosePerPeriod.numerator.value');
  const ze = zeichen(zaehler?.['unit'], 'maxDosePerPeriod.numerator.unit');
  const nw = zahlFeld(nenner?.['value'], 'maxDosePerPeriod.denominator.value');
  const nc = zeichen(nenner?.['code'], 'maxDosePerPeriod.denominator.code');
  const pflicht = (f: string) =>
    fehler(`maxDosePerPeriod.${f} ist für die Textgenerierung erforderlich.`);
  if (zw === undefined) pflicht('numerator.value');
  if (leer(ze)) pflicht('numerator.unit');
  if (nw === undefined) pflicht('denominator.value');
  if (nc === undefined) pflicht('denominator.code');
  const zeitraum =
    nw === 24 && nc === 'h' ? 'in 24 Stunden' : nw === 1 && nc === 'd' ? 'pro Tag' : null;
  if (!zeitraum) fehler('maxDosePerPeriod.denominator muss 1 d oder 24 h sein.');
  return `nicht mehr als ${zahlText(zw!)} ${ze!} ${zeitraum!}`;
}

/* ---------- Schema-Erkennung ---------- */

export type Dosierungsschema =
  | 'FreeText'
  | 'AsNeeded'
  | '4-Schema'
  | 'DayOfWeek'
  | 'DayOfWeek and Time/4-Schema'
  | 'TimeOfDay'
  | 'Interval and Time/4-Schema'
  | 'Interval'
  | 'Unknown';

const nichtLeer = (v: unknown) => Array.isArray(v) && v.length > 0;

function merkmale(el: Json) {
  const t = el['timing'];
  const r = wiederholung(el);
  return {
    hatText: typeof el['text'] === 'string' && el['text'] !== '',
    hatTiming: istObjekt(t) && Object.keys(t).length > 0,
    hatDosis: nichtLeer(el['doseAndRate']),
    istBedarf: el['asNeededBoolean'] === true,
    r,
  };
}

const istFreitext = (el: Json) => {
  const m = merkmale(el);
  return m.hatText && !m.hatTiming && !m.hatDosis;
};

export function schemaVon(el: Json): Dosierungsschema {
  const { hatText, hatTiming, hatDosis, istBedarf, r } = merkmale(el);
  const has = (k: string) => k in r;
  const wochentag = nichtLeer(r['dayOfWeek']);
  const when = nichtLeer(r['when']);
  const uhrzeit = nichtLeer(r['timeOfDay']);
  const legacy = (einheit: string) =>
    !has('frequencyMax') &&
    !has('periodMax') &&
    ((!has('period') && !has('periodUnit')) || (r['period'] === 1 && r['periodUnit'] === einheit));
  const tagesmuster = r['period'] === 1 && r['periodUnit'] === 'd' && !has('periodMax');
  const nichtTagesmuster = has('period') && has('periodUnit') && !tagesmuster;
  if (hatText && !hatTiming && !hatDosis) return 'FreeText';
  if (istBedarf && !hatTiming) return 'AsNeeded';
  if (when && !uhrzeit && !wochentag && legacy('d')) return '4-Schema';
  if (wochentag && !when && !uhrzeit && legacy('wk')) return 'DayOfWeek';
  if (wochentag && (uhrzeit || when) && legacy('wk')) return 'DayOfWeek and Time/4-Schema';
  if (uhrzeit && !wochentag && !when && legacy('d')) return 'TimeOfDay';
  if (
    nichtTagesmuster &&
    (uhrzeit || when) &&
    !wochentag &&
    !has('frequencyMax') &&
    ['d', 'wk', 'mo'].includes(String(r['periodUnit']))
  )
    return 'Interval and Time/4-Schema';
  if (has('frequency') && has('period') && has('periodUnit') && !(when || uhrzeit || wochentag))
    return 'Interval';
  return 'Unknown';
}

/* ---------- Teil B: Aufbau je Schema ---------- */

function codes(r: Json, feld: 'when' | 'dayOfWeek', tabelle: Record<string, string>): string[] {
  return (liste(r[feld], `timing.repeat.${feld}`) ?? []).map((c) => {
    const code = zeichen(c, `timing.repeat.${feld}[]`)!;
    if (!(code in tabelle))
      fehler(
        feld === 'when'
          ? `Nicht unterstützter Tagesabschnitt (when): '${code}'.`
          : `Nicht unterstützter Wochentag (dayOfWeek): '${code}'.`,
      );
    return code;
  });
}

function uhrzeiten(r: Json): { roh: string; anzeige: string }[] {
  return (liste(r['timeOfDay'], 'timing.repeat.timeOfDay') ?? []).map((z) => {
    const s = zeichen(z, 'timing.repeat.timeOfDay[]')!;
    const m = UHRZEIT.exec(s);
    if (!m) fehler('timeOfDay muss im Format HH:MM oder HH:MM:SS[.Bruchteile] angegeben sein.');
    return { roh: s, anzeige: `${m![1]!}:${m![2]!} Uhr` };
  });
}

/** Belegung ohne Widerspruch: gleiche Dosis einmal, abweichende Dosis bricht ab. */
function belegen<K>(karte: Map<K, Dosis>, schluessel: K, d: Dosis, meldung: string) {
  const vorher = karte.get(schluessel);
  if (vorher && !gleich(vorher, d)) fehler(meldung);
  if (!vorher) karte.set(schluessel, d);
}

/** Uhrzeitgruppen: aufsteigend, aufeinanderfolgende mit gleicher Dosis zusammengefasst. */
function zeitgruppen(belegung: Map<string, { roh: string; d: Dosis }>): string {
  const sortiert = [...belegung.entries()].sort((a, b) => a[1].roh.localeCompare(b[1].roh));
  const gruppen: { zeiten: string[]; d: Dosis }[] = [];
  for (const [anzeige, { d }] of sortiert) {
    const letzte = gruppen[gruppen.length - 1];
    if (letzte && gleich(letzte.d, d)) letzte.zeiten.push(anzeige);
    else gruppen.push({ zeiten: [anzeige], d });
  }
  return gruppen.map((g) => `${g.zeiten.join(', ')} — je ${dosisText(g.d)}`).join(', ');
}

function uhrzeitBelegen(
  karte: Map<string, { roh: string; d: Dosis }>,
  z: { roh: string; anzeige: string },
  d: Dosis,
) {
  const vorher = karte.get(z.anzeige);
  if (vorher && !gleich(vorher.d, d))
    fehler(`Doppelte Belegung der Uhrzeit '${z.anzeige}' mit unterschiedlicher Dosis.`);
  if (!vorher) karte.set(z.anzeige, { roh: z.roh, d });
}

/** Tagesabschnitte als Viererschema oder ausgeschrieben. */
function viererschema(belegung: Map<string, Dosis>): { kompakt: boolean; text: string } {
  const belegt = ABSCHNITTE.filter((c) => belegung.has(c)).map(
    (c) => [c, belegung.get(c)!] as const,
  );
  const einheiten = new Set(belegt.map(([, d]) => d.einheit));
  const kompakt = !belegt.some(([, d]) => d.bereich) && einheiten.size <= 1;
  if (kompakt) {
    const werte = ABSCHNITTE.map((c) => belegung.get(c)?.wert ?? '0');
    return { kompakt, text: `${werte.join('-')} ${[...einheiten][0] ?? ''}` };
  }
  return {
    kompakt,
    text: belegt.map(([c, d]) => `${ABSCHNITT[c]!} — je ${dosisText(d)}`).join(', '),
  };
}

function kernText(
  schema: Dosierungsschema,
  els: Json[],
): { kern: string; rhythmus: string | null } {
  if (schema === '4-Schema') {
    const belegung = new Map<string, Dosis>();
    for (const el of els) {
      const d = dosisVon(el);
      for (const c of codes(wiederholung(el), 'when', ABSCHNITT))
        belegen(
          belegung,
          c,
          d,
          `Doppelte Belegung des Tagesabschnitts '${c}' mit unterschiedlicher Dosis.`,
        );
    }
    return { kern: viererschema(belegung).text, rhythmus: 'täglich' };
  }
  if (schema === 'TimeOfDay') {
    const belegung = new Map<string, { roh: string; d: Dosis }>();
    for (const el of els) {
      const d = dosisVon(el);
      for (const z of uhrzeiten(wiederholung(el))) uhrzeitBelegen(belegung, z, d);
    }
    return { kern: zeitgruppen(belegung), rhythmus: 'täglich' };
  }
  if (schema === 'DayOfWeek') {
    const belegung = new Map<string, Dosis>();
    for (const el of els) {
      const d = dosisVon(el);
      for (const c of codes(wiederholung(el), 'dayOfWeek', WOCHENTAG))
        belegen(
          belegung,
          c,
          d,
          `Doppelte Belegung des Wochentags '${c}' mit unterschiedlicher Dosis.`,
        );
    }
    const kern = WOCHENTAGE.filter((c) => belegung.has(c))
      .map((c) => `${WOCHENTAG[c]!} — je ${dosisText(belegung.get(c)!)}`)
      .join('; ');
    return { kern, rhythmus: null };
  }
  if (schema === 'DayOfWeek and Time/4-Schema') {
    const mitUhrzeit = els.some((el) => nichtLeer(wiederholung(el)['timeOfDay']));
    const mitAbschnitt = els.some((el) => nichtLeer(wiederholung(el)['when']));
    if (mitUhrzeit && mitAbschnitt)
      fehler(
        'Wochentags-Kombinationen mit Uhrzeiten und mit Tagesabschnitten dürfen nicht gemischt werden.',
      );
    if (mitUhrzeit) {
      const tage = new Map<string, Map<string, { roh: string; d: Dosis }>>();
      for (const el of els) {
        const r = wiederholung(el);
        const d = dosisVon(el);
        const zeiten = uhrzeiten(r);
        for (const c of codes(r, 'dayOfWeek', WOCHENTAG)) {
          const tag = tage.get(c) ?? new Map<string, { roh: string; d: Dosis }>();
          tage.set(c, tag);
          for (const z of zeiten) uhrzeitBelegen(tag, z, d);
        }
      }
      const kern = WOCHENTAGE.filter((c) => tage.has(c))
        .map((c) => `${WOCHENTAG[c]!} ${zeitgruppen(tage.get(c)!)}`)
        .join('; ');
      return { kern, rhythmus: null };
    }
    const tage = new Map<string, Map<string, Dosis>>();
    for (const el of els) {
      const r = wiederholung(el);
      const d = dosisVon(el);
      const abschnitte = codes(r, 'when', ABSCHNITT);
      for (const c of codes(r, 'dayOfWeek', WOCHENTAG)) {
        const tag = tage.get(c) ?? new Map<string, Dosis>();
        tage.set(c, tag);
        for (const a of abschnitte)
          belegen(
            tag,
            a,
            d,
            `Doppelte Belegung der Kombination aus Wochentag '${c}' und Zeit-/Tagesabschnitt '${a}' mit unterschiedlicher Dosis.`,
          );
      }
    }
    const belegteTage = WOCHENTAGE.filter((c) => tage.has(c));
    const kompakt = belegteTage.every((c) => viererschema(tage.get(c)!).kompakt);
    const kern = belegteTage
      .map((c) => {
        const tag = tage.get(c)!;
        if (kompakt) return `${WOCHENTAG[c]!} ${viererschema(tag).text}`;
        const segmente = ABSCHNITTE.filter((a) => tag.has(a)).map(
          (a) => `${ABSCHNITT[a]!} — je ${dosisText(tag.get(a)!)}`,
        );
        return `${WOCHENTAG[c]!} ${segmente.join(', ')}`;
      })
      .join('; ');
    return { kern, rhythmus: null };
  }
  if (schema === 'Interval and Time/4-Schema') {
    const abschnitte = new Map<string, Dosis>();
    const zeiten = new Map<string, { roh: string; d: Dosis }>();
    for (const el of els) {
      const r = wiederholung(el);
      const d = dosisVon(el);
      for (const c of codes(r, 'when', ABSCHNITT))
        belegen(
          abschnitte,
          c,
          d,
          `Doppelte Belegung des Tagesabschnitts '${c}' mit unterschiedlicher Dosis.`,
        );
      for (const z of uhrzeiten(r)) uhrzeitBelegen(zeiten, z, d);
    }
    const segmente = [
      ...ABSCHNITTE.filter((c) => abschnitte.has(c)).map(
        (c) => `${ABSCHNITT[c]!} — je ${dosisText(abschnitte.get(c)!)}`,
      ),
      ...[...zeiten.entries()]
        .sort((a, b) => a[1].roh.localeCompare(b[1].roh))
        .map(([anzeige, { d }]) => `${anzeige} — je ${dosisText(d)}`),
    ];
    return { kern: segmente.join(', '), rhythmus: rhythmus(wiederholung(els[0]!), false) };
  }
  // Wiederkehrende Intervalle
  if (els.length !== 1) fehler('Wiederkehrende Intervalle erlauben genau ein Dosage-Element.');
  return {
    kern: `je ${dosisText(dosisVon(els[0]!))}`,
    rhythmus: rhythmus(wiederholung(els[0]!), true),
  };
}

function normalisieren(t: string): string {
  return t
    .replace(/\s+/gu, ' ')
    .replace(/ +([;:.,])/g, '$1')
    .trim();
}

/* ---------- Gesamtalgorithmus ---------- */

/** Dosierungstext zu einer Liste von `Dosage`-Elementen. Wirft `DosierungstextFehler`. */
export function dosierungstextAus(dosierungen: unknown): string {
  const els = (liste(dosierungen, 'dosage') ?? []).map((e) => objekt(e, 'Dosage')!);
  if (els.length === 0) return '';

  // Schritt 3: Typen der gelesenen Felder, unbekannte modifierExtension
  for (const el of els) {
    if (el['asNeededBoolean'] !== undefined && typeof el['asNeededBoolean'] !== 'boolean')
      fehler('asNeededBoolean muss ein boolescher Wert sein.');
    zeichen(el['text'], 'text');
    zeichen(el['patientInstruction'], 'patientInstruction');
    const r = wiederholung(el);
    ganzzahl(r['frequency'], 'timing.repeat.frequency');
    ganzzahl(r['frequencyMax'], 'timing.repeat.frequencyMax');
    zahlFeld(r['period'], 'timing.repeat.period');
    zahlFeld(r['periodMax'], 'timing.repeat.periodMax');
    zeichen(r['periodUnit'], 'timing.repeat.periodUnit');
    for (const e of liste(el['modifierExtension'], 'modifierExtension') ?? []) {
      const url = objekt(e, 'modifierExtension[]')!['url'];
      if (url !== MINDESTABSTAND) fehler(`Nicht unterstützte modifierExtension: '${String(url)}'.`);
    }
  }

  // Schritt 4
  if (
    els.some(
      (el) => nichtLeer(wiederholung(el)['timeOfDay']) && nichtLeer(wiederholung(el)['when']),
    )
  )
    fehler('timeOfDay und when dürfen nicht gemeinsam angegeben werden (tim-10).');
  for (const el of els) {
    const { istBedarf, hatTiming } = merkmale(el);
    if (anlaesse(el).length > 0 && !istBedarf)
      fehler('Ein Einnahmeanlass (asNeededFor) setzt asNeededBoolean = true voraus.');
    const abstand = mindestabstand(el);
    if (abstand) {
      mindestabstandText(abstand);
      if (!istBedarf) fehler('Ein Mindestabstand setzt asNeededBoolean = true voraus.');
      if (hatTiming)
        fehler(
          'Ein Mindestabstand ist nur bei reiner Bedarfsmedikation zulässig, nicht zusammen mit einem strukturierten Rhythmus.',
        );
      if (istFreitext(el))
        fehler('Ein Mindestabstand ist bei einer Freitext-Dosierung nicht darstellbar.');
    }
    if (el['maxDosePerPeriod'] !== undefined) {
      maximalmengeText(el);
      if (!istBedarf) fehler('Eine Maximalmenge setzt asNeededBoolean = true voraus.');
      if (hatTiming)
        fehler(
          'Eine Maximalmenge ist nur bei reiner Bedarfsmedikation zulässig, nicht zusammen mit einem strukturierten Rhythmus.',
        );
      if (istFreitext(el))
        fehler('Eine Maximalmenge ist bei einer Freitext-Dosierung nicht darstellbar.');
    }
  }

  // Schritt 5
  if (els.length !== 1 && els.some((el) => merkmale(el).istBedarf && !merkmale(el).hatTiming))
    fehler('Reine Bedarfsmedikation erlaubt genau ein Dosage-Element.');

  // Schritt 6
  const schema = schemaVon(els[0]!);
  els.slice(1).forEach((el, i) => {
    const s = schemaVon(el);
    if (s !== schema)
      fehler(
        `Alle Dosage-Elemente müssen demselben Schema folgen; Element 1 ergibt '${schema}', Element ${i + 2} '${s}'.`,
      );
  });
  if (schema === 'Unknown')
    fehler('Die Dosierung entspricht keinem unterstützten Dosierungsschema.');

  if (schema === 'FreeText') return els.map((el) => String(el['text'])).join(' ');

  const erstes = els[0]!;
  let text: string;
  if (schema === 'AsNeeded') {
    const abstand = mindestabstand(erstes);
    const max = maximalmengeText(erstes);
    text =
      `${bedarfText(erstes)}: ` +
      (abstand ? `${mindestabstandText(abstand)} ` : '') +
      `je ${dosisText(dosisVon(erstes))}` +
      (max ? ` — ${max}` : '');
  } else {
    const rahmen = zeitrahmen(erstes);
    const { kern, rhythmus: takt } = kernText(schema, els);
    const bedarf = merkmale(erstes).istBedarf ? bedarfText(erstes) : null;
    const wann = bedarf ? (takt ? `${bedarf}, ${takt}` : bedarf) : takt;
    const links = [rahmen, wann].filter(Boolean).join(' ');
    text = links ? `${links}: ${kern}` : kern;
  }
  const hinweis = (zeichen(erstes['patientInstruction'], 'patientInstruction') ?? '').trim();
  if (hinweis) {
    text = text.trimEnd();
    text = `${text.endsWith('.') ? text : `${text}.`} Hinweis: ${hinweis}`;
  }
  return normalisieren(text);
}

const DOSIERUNGSFELD: Record<string, string> = {
  MedicationRequest: 'dosageInstruction',
  MedicationDispense: 'dosageInstruction',
  MedicationStatement: 'dosage',
};

/** Dosierungstext zu einer ganzen Ressource. */
export function dosierungstext(ressource: Record<string, unknown>): string {
  const typ = typeof ressource['resourceType'] === 'string' ? ressource['resourceType'] : '';
  const feld = DOSIERUNGSFELD[typ];
  if (!feld) fehler(`Unsupported resource type: ${typ}`);
  return dosierungstextAus(ressource[feld!] ?? []);
}
