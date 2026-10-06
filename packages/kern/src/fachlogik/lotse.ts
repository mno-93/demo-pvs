/**
 * ✦ VORSCHLAG — Aktenlotse. Nicht spezifiziert.
 *
 * Beantwortet Fragen an den Aktenbestand in zusammenhängenden Sätzen und nennt dazu die
 * Unterlage, in der es nachzulesen ist. Vier Regeln tragen den Entwurf und stehen deshalb
 * hier und nicht in der Dokumentation:
 *
 * 1. **Keine eigenen Rechte.** Dieses Modul bekommt nur Quellen übergeben, die der oder die
 *    Fragende ohnehin einsehen darf. Es ermittelt selbst keine und kennt keine Akte.
 * 2. **Jede Antwort nennt ihre Quelle.** Nicht als Zitat unter jedem Satz, sondern als
 *    Verweis auf die Unterlage, die sich öffnen und nachlesen lässt. Ein Absatz ohne Quelle
 *    entsteht nicht — es gibt keinen Weg, hier freien Text zu erzeugen.
 * 3. **Umfangsangabe.** Jede Antwort sagt, wie viele Quellen gelesen wurden und welche nicht.
 *    Die gefährlichste Antwort ist die, die vollständig *wirkt*.
 * 4. **Keine Bewertung.** Der Lotse gibt wieder, was dasteht — auch eine Richtung („von 46 auf
 *    38"). Er ordnet nicht ein, setzt keine Dringlichkeit und empfiehlt nichts.
 *
 * ⚠ In der Demo **regelbasiert statt mit einem Sprachmodell**. Die Sätze entstehen aus
 * Vorlagen über dem, was in den Quellen steht. Geprüft werden soll der Umgang — Quellenangabe,
 * Umfangsangabe, Rechteerbung, Grenze zur Bewertung —, nicht die Sprachleistung.
 */

import { begriffeIn, mitAlltagssprache, type Alltagswort } from '../kataloge/alltagssprache.js';

/** Fachsprachlich wie im Dokument, oder in Alltagssprache umschrieben. */
export type Lesart = 'fach' | 'alltag';

/**
 * Eine Quelle, die der Lotse lesen darf. Das aufrufende System hat die Befugnis bereits
 * geprüft und reicht nur durch, was sichtbar ist.
 */
export interface Lotsenquelle {
  id: string;
  titel: string;
  /** ISO-Datum oder -Zeitpunkt der Erstellung. */
  datum: string;
  einrichtung: string;
  /** Lesbare Zeilen. Leer, wenn die Quelle nicht ausgewertet werden konnte. */
  zeilen: string[];
  /** Warum keine Zeilen vorliegen — erscheint wörtlich in der Umfangsangabe. */
  nichtLesbar?: string;
}

/** Die Unterlage, in der eine Aussage nachzulesen ist. */
export interface Quellenangabe {
  quelleId: string;
  titel: string;
  datum: string;
  einrichtung: string;
}

/** Eine belegende Stelle mit der Zeile — für Abweichungen und Vorschläge, nicht für Antworten. */
export interface Fundstelle extends Quellenangabe {
  zeile: string;
}

export interface Lotsenabsatz {
  /** Zusammenhängender Text. Keine Stichpunkte, keine Zitate. */
  text: string;
  /** Unterlagen, auf denen der Absatz beruht — zum Öffnen und Nachlesen. */
  quellen: Quellenangabe[];
}

export interface Umfang {
  gelesen: number;
  gesamt: number;
  uebergangen: { titel: string; grund: string }[];
}

export interface Lotsenantwort {
  frage: string;
  absaetze: Lotsenabsatz[];
  /** Trägt die Aussage, wenn nichts belegbar war — sonst null. */
  hinweis: string | null;
  umfang: Umfang;
  /** Fachbegriffe aus den gelesenen Stellen mit ihrer Umschreibung. */
  begriffe: Alltagswort[];
}

/* ---------- Absichten ---------- */

/**
 * Welche Frage gestellt wurde. Bewusst eine kurze, geschlossene Liste: Was der Lotse nicht
 * erkennt, beantwortet er als Stellensuche — und sagt das auch.
 */
export type Absicht = 'laborverlauf' | 'krankenhaus' | 'allergien' | 'medikation' | 'stellensuche';

const STICHWOERTER: Record<Exclude<Absicht, 'stellensuche'>, string[]> = {
  laborverlauf: [
    'niere',
    'nieren',
    'nierenwert',
    'nierenwerte',
    'nierenfunktion',
    'kreatinin',
    'gfr',
    'egfr',
    'laborwert',
    'laborwerte',
    'blutwert',
    'blutwerte',
    'verlauf',
    'entwickelt',
    'entwicklung',
  ],
  krankenhaus: [
    'krankenhaus',
    'klinik',
    'klinikum',
    'entlassbrief',
    'entlassung',
    'aufenthalt',
    'stationaer',
    'stationär',
  ],
  allergien: [
    'allergie',
    'allergien',
    'vertrage',
    'vertraege',
    'verträge',
    'unvertraeglichkeit',
    'unverträglichkeit',
    'penicillin',
    'kontrastmittel',
  ],
  medikation: [
    'medikament',
    'medikamente',
    'tablette',
    'tabletten',
    'arznei',
    'nehme',
    'einnehmen',
    'wofuer',
    'wofür',
    'warum',
    'dosis',
    'dosierung',
  ],
};

function normalisiere(text: string): string {
  return text
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss');
}

/**
 * Ordnet die Frage einer Absicht zu. Mehrere Treffer entscheidet die Reihenfolge der
 * Tabelle: Eine Frage nach dem Verlauf von Laborwerten ist spezifischer als eine nach
 * Medikamenten, auch wenn beide Wörter vorkommen.
 */
export function absichtErkennen(frage: string): Absicht {
  const f = normalisiere(frage);
  for (const absicht of ['laborverlauf', 'krankenhaus', 'allergien', 'medikation'] as const) {
    if (STICHWOERTER[absicht].some((w) => f.includes(normalisiere(w)))) return absicht;
  }
  return 'stellensuche';
}

/* ---------- Hilfen ---------- */

function alsQuelle(q: Lotsenquelle): Quellenangabe {
  return { quelleId: q.id, titel: q.titel, datum: q.datum, einrichtung: q.einrichtung };
}

function alsFundstelle(quelle: Lotsenquelle, zeile: string): Fundstelle {
  return { ...alsQuelle(quelle), zeile: zeile.trim() };
}

function umfangBilden(quellen: Lotsenquelle[]): Umfang {
  return {
    gelesen: quellen.filter((q) => q.zeilen.length > 0).length,
    gesamt: quellen.length,
    uebergangen: quellen
      .filter((q) => q.zeilen.length === 0)
      .map((q) => ({ titel: q.titel, grund: q.nichtLesbar ?? 'kein lesbarer Text hinterlegt' })),
  };
}

function nachDatum(a: { datum: string }, b: { datum: string }): number {
  return a.datum.localeCompare(b.datum);
}

/** 2026-07-17 → 17.07.2026 */
export function alsTag(iso: string): string {
  return iso.length >= 10 ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}` : iso;
}

const MONAT = [
  'Januar',
  'Februar',
  'März',
  'April',
  'Mai',
  'Juni',
  'Juli',
  'August',
  'September',
  'Oktober',
  'November',
  'Dezember',
];

/** 2026-07-17 → Juli 2026 — für Sätze, in denen der Tag nicht zählt. */
function alsMonat(iso: string): string {
  const nummer = Number(iso.slice(5, 7));
  return nummer >= 1 && nummer <= 12 ? `${MONAT[nummer - 1]} ${iso.slice(0, 4)}` : iso;
}

function fassung(text: string, lesart: Lesart): string {
  return lesart === 'alltag' ? mitAlltagssprache(text) : text;
}

/** Zählwörter bis zwölf — „fünf Medikamente" liest sich besser als „5 Medikamente". */
const ZAHLWORT = [
  'kein',
  'ein',
  'zwei',
  'drei',
  'vier',
  'fünf',
  'sechs',
  'sieben',
  'acht',
  'neun',
  'zehn',
  'elf',
  'zwölf',
];

function zahlwort(n: number): string {
  return n < ZAHLWORT.length ? (ZAHLWORT[n] as string) : String(n);
}

/** „a, b und c" */
function aufzaehlen(teile: string[]): string {
  if (teile.length === 0) return '';
  if (teile.length === 1) return teile[0] as string;
  return `${teile.slice(0, -1).join(', ')} und ${teile.at(-1)}`;
}

/** Zeilen, die unter einer Überschrift stehen, bis zur nächsten Leerzeile. */
function abschnitt(zeilen: string[], ueberschrift: string): string[] {
  const start = zeilen.findIndex(
    (z) => normalisiere(z.trim()) === normalisiere(ueberschrift) && !z.startsWith(' '),
  );
  if (start < 0) return [];
  const gesammelt: string[] = [];
  for (const zeile of zeilen.slice(start + 1)) {
    if (!zeile.trim()) break;
    gesammelt.push(zeile.trim());
  }
  return gesammelt;
}

/**
 * Zerlegt die Zeilen eines Medikationsabschnitts in einzelne Mittel.
 *
 * Eine Zeile führt oft mehrere Mittel, durch Komma getrennt. Das Komma trennt aber nicht
 * immer: In „Bisoprolol 2,5 mg" steht es im Zahlwert. Getrennt wird deshalb nur an einem
 * Komma, auf das keine Ziffer folgt.
 */
export function medikationszeilenZerlegen(zeilen: string[]): string[] {
  return zeilen
    .flatMap((zeile) => zeile.split(/,(?!\d)/))
    .map((teil) => teil.trim().replace(/,$/, '').trim())
    .filter(Boolean);
}

/** Entfernt einen führenden Kode, damit der Satz mit der Bezeichnung beginnt. */
function ohneKode(zeile: string): string {
  return zeile.replace(/^[A-Z][0-9]{2}(\.[0-9A-Z]{1,3})?\s+/, '').trim();
}

/* ---------- Die einzelnen Absichten ---------- */

const MESSWERT = /^(.+?):\s*([0-9]+(?:[.,][0-9]+)?)\s*(.*)$/;

function laborverlauf(frage: string, quellen: Lotsenquelle[], lesart: Lesart): Lotsenabsatz[] {
  const gesucht = normalisiere(frage);
  const nierenfrage = ['niere', 'nieren', 'nierenwert', 'nierenfunktion', 'kreatinin', 'gfr'].some(
    (w) => gesucht.includes(normalisiere(w)),
  );

  const treffer: { quelle: Lotsenquelle; bezeichnung: string; wert: string }[] = [];
  for (const quelle of quellen) {
    for (const zeile of quelle.zeilen) {
      const m = MESSWERT.exec(zeile.trim());
      if (!m) continue;
      const bezeichnung = m[1]!.trim();
      const passt = nierenfrage
        ? /kreatinin|gfr|niere/i.test(bezeichnung)
        : gesucht
            .split(/\s+/)
            .filter((w) => w.length > 3)
            .some((w) => normalisiere(bezeichnung).includes(w));
      if (!passt) continue;
      treffer.push({
        quelle,
        bezeichnung,
        wert: `${m[2]}${m[3]?.trim() ? ' ' + m[3].trim() : ''}`,
      });
    }
  }
  if (treffer.length === 0) return [];

  const befunde = [...new Map(treffer.map((t) => [t.quelle.id, t.quelle])).values()].sort(
    nachDatum,
  );
  const zeitraum = [...new Set(befunde.map((b) => alsMonat(b.datum)))];

  const nachAnalyt = new Map<string, typeof treffer>();
  for (const t of treffer) {
    nachAnalyt.set(t.bezeichnung, [...(nachAnalyt.get(t.bezeichnung) ?? []), t]);
  }

  const saetze: string[] = [
    befunde.length === 1
      ? `Dazu liegt ein Befund vor, aus ${zeitraum[0]}.`
      : `Dazu liegen ${zahlwort(befunde.length)} Befunde vor, aus ${aufzaehlen(zeitraum)}.`,
  ];

  for (const [bezeichnung, reihe] of nachAnalyt) {
    const geordnet = [...reihe].sort((a, b) => nachDatum(a.quelle, b.quelle));
    const name = fassung(bezeichnung, lesart);
    if (geordnet.length === 1) {
      const nur = geordnet[0]!;
      saetze.push(`${name} lag am ${alsTag(nur.quelle.datum)} bei ${nur.wert}.`);
      continue;
    }
    const erster = geordnet[0]!;
    const letzter = geordnet.at(-1)!;
    const mitte = geordnet
      .slice(1, -1)
      .map((t) => `${t.wert} am ${alsTag(t.quelle.datum)}`)
      .join(', ');
    saetze.push(
      `${name} lag am ${alsTag(erster.quelle.datum)} bei ${erster.wert}` +
        (mitte ? `, dann bei ${mitte}` : '') +
        ` und am ${alsTag(letzter.quelle.datum)} bei ${letzter.wert}.`,
    );
  }

  return [{ text: saetze.join(' '), quellen: befunde.map(alsQuelle) }];
}

function krankenhaus(quellen: Lotsenquelle[], lesart: Lesart): Lotsenabsatz[] {
  const brief = quellen
    .filter((q) => /entlassbrief/i.test(q.titel) && q.zeilen.length > 0)
    .sort((a, b) => nachDatum(b, a))[0];
  if (!brief) return [];

  const quelle = [alsQuelle(brief)];
  const absaetze: Lotsenabsatz[] = [];
  const satz = (text: string) => absaetze.push({ text, quellen: quelle });

  const kopf = brief.zeilen.find((z) => /aufenthalt/i.test(z));
  const zeitraum = kopf?.match(/([0-9.]{8,10})\s*bis\s*([0-9.]{8,10})/);
  satz(
    zeitraum
      ? `Sie waren vom ${zeitraum[1]} bis zum ${zeitraum[2]} im ${brief.einrichtung}.`
      : `Es liegt ein Entlassbrief des ${brief.einrichtung} vom ${alsTag(brief.datum)} vor.`,
  );

  const diagnosen = abschnitt(brief.zeilen, 'Diagnosen').map((z) => fassung(ohneKode(z), lesart));
  if (diagnosen.length > 0) {
    satz(
      `Festgehalten ${
        diagnosen.length === 1
          ? 'ist eine Diagnose'
          : `sind ${zahlwort(diagnosen.length)} Diagnosen`
      }: ${aufzaehlen(diagnosen)}.`,
    );
  }

  for (const p of abschnitt(brief.zeilen, 'Prozeduren')) {
    const mitDatum = p.match(/^([0-9.]{8,10})\s+(.*)$/);
    satz(
      mitDatum
        ? `Am ${mitDatum[1]} wurde ${fassung(
            mitDatum[2]!.replace(/\s*\(OPS[^)]*\)/, ''),
            lesart,
          )} durchgeführt.`
        : `Durchgeführt wurde ${fassung(p, lesart)}.`,
    );
  }

  const implantate = abschnitt(brief.zeilen, 'Implantate');
  if (implantate.length > 0) {
    satz(
      `Zu eingesetzten Geräten steht dort: ${aufzaehlen(
        implantate.map((i) => fassung(i, lesart)),
      )}.`,
    );
  }

  const allergien = abschnitt(brief.zeilen, 'Allergien und Unverträglichkeiten').map((z) =>
    (z.split(':')[0] ?? z).trim(),
  );
  if (allergien.length > 0) {
    satz(
      `Als Unverträglichkeit${allergien.length === 1 ? '' : 'en'} ${
        allergien.length === 1 ? 'ist' : 'sind'
      } ${aufzaehlen(allergien.map((a) => fassung(a, lesart)))} vermerkt.`,
    );
  }

  const mittel = medikationszeilenZerlegen(abschnitt(brief.zeilen, 'Entlassmedikation'));
  if (mittel.length > 0) {
    satz(
      `Für zu Hause ${
        mittel.length === 1 ? 'ist ein Medikament' : `sind ${zahlwort(mittel.length)} Medikamente`
      } aufgeführt: ${aufzaehlen(mittel)}.`,
    );
  }

  return absaetze;
}

/**
 * Ein abschließender Punkt gehört zum Satz, nicht zum Inhalt — außer er gehört zu einer
 * Abkürzung wie „i. v.". Dort steht am Ende ein einzelner Buchstabe.
 */
function ohneSatzpunkt(text: string): string {
  return /(?:^|\s)[A-Za-zÄÖÜäöüß]\.$/.test(text) ? text : text.replace(/\.$/, '');
}

/** „Penicillin: makulopapulöses Exanthem unter Ampicillin i. v. (14.07.2026)" → ein Satz. */
function allergiesatz(zeile: string, lesart: Lesart): string {
  const teil = zeile.indexOf(':');
  if (teil < 0) return `Vermerkt ist: ${fassung(zeile, lesart)}.`;
  const substanz = fassung(zeile.slice(0, teil).trim(), lesart);
  const reaktion = fassung(ohneSatzpunkt(zeile.slice(teil + 1).trim()), lesart);
  return `Auf ${substanz} ist ${reaktion} vermerkt.`;
}

function allergien(quellen: Lotsenquelle[], lesart: Lesart): Lotsenabsatz[] {
  const gefunden: { quelle: Lotsenquelle; zeilen: string[] }[] = [];
  for (const quelle of [...quellen].sort(nachDatum)) {
    const ausAbschnitt = abschnitt(quelle.zeilen, 'Allergien und Unverträglichkeiten');
    const zeilen =
      ausAbschnitt.length > 0
        ? ausAbschnitt
        : quelle.zeilen.filter((z) => /allergie|unverträglich|exanthem/i.test(z));
    if (zeilen.length > 0) gefunden.push({ quelle, zeilen });
  }
  if (gefunden.length === 0) return [];

  const alle = gefunden.flatMap((g) => g.zeilen);
  const einleitung =
    alle.length === 1
      ? 'In den Unterlagen ist eine Unverträglichkeit festgehalten.'
      : `In den Unterlagen sind ${zahlwort(alle.length)} Unverträglichkeiten festgehalten.`;

  return [
    {
      text: [einleitung, ...alle.map((z) => allergiesatz(z, lesart))].join(' '),
      quellen: gefunden.map((g) => alsQuelle(g.quelle)),
    },
  ];
}

/** „Apixaban 5 mg Filmtabletten — 1-0-1-0 — wegen Vorhofflimmern" → ein Satzteil. */
function medikamentensatz(zeile: string, lesart: Lesart): string {
  const teile = zeile.split('—').map((t) => t.trim());
  const mittel = teile[0] ?? zeile;
  const dosis = teile[1];
  const grund = teile[2]?.replace(/^wegen\s*/i, '');
  return mittel + (dosis ? `, ${dosis}` : '') + (grund ? `, wegen ${fassung(grund, lesart)}` : '');
}

function medikation(frage: string, quellen: Lotsenquelle[], lesart: Lesart): Lotsenabsatz[] {
  const woerter = normalisiere(frage)
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 3 && !STICHWOERTER.medikation.includes(w));

  // Der Medikationsplan ist die geführte Quelle; ein Dokument tritt nur ein, wenn es ihn nicht gibt.
  const plan = quellen.find((q) => /medikationsplan/i.test(q.titel) && q.zeilen.length > 0);
  const quelle =
    plan ??
    [...quellen]
      .sort((a, b) => nachDatum(b, a))
      .find((q) => abschnitt(q.zeilen, 'Entlassmedikation').length > 0);
  if (!quelle) return [];

  const roh = plan
    ? quelle.zeilen
    : medikationszeilenZerlegen(abschnitt(quelle.zeilen, 'Entlassmedikation'));
  const gefiltert =
    woerter.length > 0 ? roh.filter((z) => woerter.some((w) => normalisiere(z).includes(w))) : roh;
  const genommen = gefiltert.length > 0 ? gefiltert : roh;
  if (genommen.length === 0) return [];

  const einleitung = plan
    ? genommen.length === 1
      ? 'Im Medikationsplan steht ein Mittel.'
      : `Im Medikationsplan stehen ${zahlwort(genommen.length)} Mittel.`
    : genommen.length === 1
      ? 'Im Entlassbrief ist ein Medikament aufgeführt.'
      : `Im Entlassbrief sind ${zahlwort(genommen.length)} Medikamente aufgeführt.`;

  return [
    {
      text: `${einleitung} ${aufzaehlen(genommen.map((z) => medikamentensatz(z, lesart)))}.`,
      quellen: [alsQuelle(quelle)],
    },
  ];
}

function stellensuche(frage: string, quellen: Lotsenquelle[], lesart: Lesart): Lotsenabsatz[] {
  const woerter = normalisiere(frage)
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 3);
  if (woerter.length === 0) return [];
  const absaetze: Lotsenabsatz[] = [];
  for (const quelle of [...quellen].sort((a, b) => nachDatum(b, a))) {
    const zeilen = quelle.zeilen.filter((z) => woerter.some((w) => normalisiere(z).includes(w)));
    if (zeilen.length === 0) continue;
    absaetze.push({
      text: zeilen.map((z) => fassung(z.trim(), lesart)).join(' '),
      quellen: [alsQuelle(quelle)],
    });
  }
  return absaetze;
}

/* ---------- Die Antwort ---------- */

export function lotseAntworten(
  frage: string,
  quellen: Lotsenquelle[],
  lesart: Lesart = 'fach',
): Lotsenantwort {
  const umfang = umfangBilden(quellen);
  const lesbare = quellen.filter((q) => q.zeilen.length > 0);
  const absicht = absichtErkennen(frage);

  const absaetze =
    absicht === 'laborverlauf'
      ? laborverlauf(frage, lesbare, lesart)
      : absicht === 'krankenhaus'
        ? krankenhaus(lesbare, lesart)
        : absicht === 'allergien'
          ? allergien(lesbare, lesart)
          : absicht === 'medikation'
            ? medikation(frage, lesbare, lesart)
            : stellensuche(frage, lesbare, lesart);

  const hinweis =
    absaetze.length === 0
      ? 'Dazu steht in den gelesenen Unterlagen nichts, was sich belegen lässt.'
      : absicht === 'stellensuche'
        ? 'Diese Frage ist dem Lotsen nicht bekannt. Er gibt die Stellen wieder, an denen die Wörter vorkommen.'
        : null;

  // Begriffe aus den gelesenen Quellen, nicht aus dem gebildeten Text: Dort stünden die
  // Umschreibungen in der Lesart „alltag" schon drin.
  const benutzte = new Set(absaetze.flatMap((a) => a.quellen.map((q) => q.quelleId)));
  return {
    frage,
    absaetze,
    hinweis,
    umfang,
    begriffe: begriffeIn(
      lesbare
        .filter((q) => benutzte.has(q.id))
        .flatMap((q) => q.zeilen)
        .join(' '),
    ),
  };
}

/* ---------- S4: Widersprüche zwischen zwei Beständen ---------- */

export interface Abweichung {
  /** Bezeichnung des Mittels, wie sie in der Quelle steht, die es führt. */
  bezeichnung: string;
  art: 'fehlt-im-plan' | 'nur-im-plan' | 'dosis-abweichend';
  ausDokument: string | null;
  imPlan: string | null;
  fundstelle: Fundstelle | null;
}

/** Wirkstoffname ohne Stärke und Darreichungsform — Grundlage des Abgleichs. */
function mittelname(zeile: string): string {
  return normalisiere(zeile.trim())
    .replace(/[0-9]+([.,][0-9]+)?\s*(mg|µg|ug|g|ml|i\.e\.).*/, '')
    .replace(/[^a-z]/g, '')
    .trim();
}

/**
 * Vergleicht die Medikation aus einem Dokument mit der im Medikationsplan. Das ist ein
 * reiner Abgleich — er sagt, dass zwei Angaben auseinandergehen, und ausdrücklich nicht,
 * welche richtig ist.
 */
export function medikationAbgleichen(
  ausDokument: { zeile: string; fundstelle: Fundstelle }[],
  imPlan: string[],
): Abweichung[] {
  const abweichungen: Abweichung[] = [];
  const planNamen = new Map(imPlan.map((p) => [mittelname(p), p]));

  for (const { zeile, fundstelle } of ausDokument) {
    const name = mittelname(zeile);
    if (!name) continue;
    if (!planNamen.get(name)) {
      abweichungen.push({
        bezeichnung: zeile.trim(),
        art: 'fehlt-im-plan',
        ausDokument: zeile.trim(),
        imPlan: null,
        fundstelle,
      });
    }
    planNamen.delete(name);
  }
  for (const [, eintrag] of planNamen) {
    abweichungen.push({
      bezeichnung: eintrag,
      art: 'nur-im-plan',
      ausDokument: null,
      imPlan: eintrag,
      fundstelle: null,
    });
  }
  return abweichungen;
}

/* ---------- S5: Vorschläge aus unstrukturiertem Text ---------- */

export interface Extraktionsvorschlag {
  /** Welche Liste den Eintrag aufnehmen würde. */
  liste: 'diagnosen' | 'allergien' | 'prozeduren';
  text: string;
  fundstelle: Fundstelle;
}

const ICD_ZEILE = /^([A-Z][0-9]{2}(?:\.[0-9A-Z]{1,3})?)\s+(.+)$/;
const OPS_ZEILE = /\(OPS\s+([0-9][-0-9a-z.]*)\)/i;

/**
 * Liest aus einer Quelle die Einträge, die eine strukturierte Liste aufnehmen könnte.
 *
 * ▸ Was hier entsteht, ist ein **Vorschlag** und kein Eintrag. Er wird nicht geschrieben,
 * sondern angeboten; bestätigen muss ihn ein Mensch. Die Herkunft bleibt am Eintrag sichtbar.
 */
export function vorschlaegeAusText(quelle: Lotsenquelle): Extraktionsvorschlag[] {
  const vorschlaege: Extraktionsvorschlag[] = [];

  for (const zeile of abschnitt(quelle.zeilen, 'Diagnosen')) {
    const m = ICD_ZEILE.exec(zeile.trim());
    if (m) {
      vorschlaege.push({
        liste: 'diagnosen',
        text: `${m[1]} ${m[2]}`,
        fundstelle: alsFundstelle(quelle, zeile),
      });
    }
  }
  for (const zeile of abschnitt(quelle.zeilen, 'Allergien und Unverträglichkeiten')) {
    vorschlaege.push({
      liste: 'allergien',
      text: zeile.trim(),
      fundstelle: alsFundstelle(quelle, zeile),
    });
  }
  for (const zeile of quelle.zeilen) {
    if (OPS_ZEILE.test(zeile) || /echokardiographie|sonographie|endoskopie/i.test(zeile)) {
      vorschlaege.push({
        liste: 'prozeduren',
        text: zeile.trim(),
        fundstelle: alsFundstelle(quelle, zeile),
      });
    }
  }
  return vorschlaege;
}

/* ---------- Antwortformen der beiden zusammengesetzten Auskünfte ---------- */

/**
 * Kontext zum Anlass eines Kontakts (S6) samt auseinandergehenden Angaben (S4).
 * Steht hier und nicht im Simulator, weil beide Seiten dieselbe Form lesen.
 */
export interface Lotsenkontext {
  anlass: string;
  verlauf: Lotsenabsatz[];
  abweichungen: Abweichung[];
  umfang: Umfang;
}

/** Was eine strukturierte Liste aus dem unstrukturierten Bestand aufnehmen könnte (S5). */
export interface Lotsenvorschlaege {
  vorschlaege: (Extraktionsvorschlag & { schonInListe: boolean })[];
  umfang: Umfang;
}

/** Eine geöffnete Unterlage — Herkunft und der lesbare Text, zum Nachlesen. */
export interface Quellentext {
  quelleId: string;
  titel: string;
  datum: string;
  einrichtung: string;
  zeilen: string[];
  nichtLesbar: string | null;
}

/* ---------- S6: Vorschlagsfragen ---------- */

/**
 * Fragen, die der Lotse von sich aus anbietet. Sie stehen hier und nicht in der Oberfläche,
 * weil beide Sichten dieselben Einstiege brauchen — nur in anderer Sprache.
 */
export const VORSCHLAGSFRAGEN: Record<'versicherte' | 'praxis', string[]> = {
  versicherte: [
    'Was stand im Brief vom Krankenhaus?',
    'Welche Medikamente nehme ich und wofür?',
    'Was vertrage ich nicht?',
    'Wie haben sich meine Nierenwerte entwickelt?',
  ],
  praxis: [
    'Wie haben sich die Nierenwerte entwickelt?',
    'Was stand im Entlassbrief?',
    'Welche Allergien sind dokumentiert?',
    'Welche Dauermedikation ist dokumentiert?',
  ],
};
