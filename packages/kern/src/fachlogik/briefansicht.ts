import type { Ressource } from '../fhir/typen.js';
import { istLaborbefund } from './laborbefund.js';
import { briefPdfErzeugen, type Briefbaustein, type Briefvorlage } from './pdf.js';

/**
 * Die gewohnte Ansicht eines strukturierten Dokuments: ein PDF.
 *
 * Wer einen Brief liest, erwartet einen Brief — Kopf, Anschrift, Abschnitte —, keine Liste von
 * Einträgen. Ein FHIR-Dokument trägt dafür alles Nötige: Je Abschnitt steht ein Erzähltext, der
 * Kopf nennt Verfasserin, Einrichtung und Datum. Daraus entsteht hier eine Druckansicht. Sie ist
 * eine **Ansicht**, kein zweites Dokument: Maßgeblich bleibt das FHIR-Dokument.
 *
 * Für Laborbefunde nach dgLP gibt es die Ansicht schon im Dokument (`presentedForm`).
 */

interface Abschnitt {
  title?: string;
  text?: { div?: string };
  entry?: unknown[];
}

function ressourcen(bundle: unknown): Ressource[] {
  const e = (bundle as { entry?: { resource?: Ressource }[] } | null)?.entry ?? [];
  return e.map((x) => x.resource).filter((r): r is Ressource => !!r);
}

/** Absätze aus dem XHTML-Erzähltext — ohne DOM, damit es auch im Simulator läuft. */
function absaetze(div: string | undefined): string[] {
  if (!div) return [];
  const teile = [...div.matchAll(/<(p|li)[^>]*>([\s\S]*?)<\/\1>/g)].map((m) => m[2]!);
  const roh = teile.length > 0 ? teile : [div];
  return roh
    .map((t) =>
      t
        .replace(/<[^>]+>/g, '')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&amp;/g, '&')
        .trim(),
    )
    .filter(Boolean);
}

const deutsch = (iso: string) =>
  iso.length >= 10 ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}` : iso;

/** Die Briefvorlage zu einem strukturierten Brief — oder `null`, wenn es keiner ist. */
export function briefAusFhir(bundle: unknown): Briefvorlage | null {
  if (istLaborbefund(bundle)) return null;
  const r = ressourcen(bundle);
  const komposition = r.find((x) => x.resourceType === 'Composition');
  const abschnitte = (komposition?.['section'] as Abschnitt[] | undefined) ?? [];
  if (!komposition || abschnitte.length === 0) return null;

  const nachVerweis = (verweis: unknown) => {
    const ref = (verweis as { reference?: string } | undefined)?.reference ?? '';
    return r.find((x) => `${x.resourceType}/${String(x.id)}` === ref);
  };
  const autoren = (komposition['author'] as { reference?: string; display?: string }[]) ?? [];
  const organisation =
    nachVerweis(komposition['custodian']) ??
    autoren.map(nachVerweis).find((x) => x?.resourceType === 'Organization');
  const person = autoren.find(
    (a) => !nachVerweis(a) || nachVerweis(a)?.resourceType !== 'Organization',
  );
  const patient = r.find((x) => x.resourceType === 'Patient');
  const name = (patient?.['name'] as { family?: string; given?: string[] }[] | undefined)?.[0];
  const geburt = String(patient?.['birthDate'] ?? '');
  const aufenthalt = nachVerweis(komposition['encounter']);
  const zeitraum = aufenthalt?.['period'] as { start?: string; end?: string } | undefined;
  const titel = String(komposition['title'] ?? 'Dokument');
  const datum = String(komposition['date'] ?? '');
  const einrichtung = String(organisation?.['name'] ?? person?.display ?? '');

  const bausteine: Briefbaustein[] = [];
  for (const a of abschnitte) {
    const text = absaetze(a.text?.div);
    if (text.length === 0) continue;
    bausteine.push({ art: 'ueberschrift', text: a.title ?? '' });
    // Abschnitte mit Einträgen sind Aufzählungen, die übrigen Fließtext.
    const art = (a.entry?.length ?? 0) > 0 ? 'zeile' : 'absatz';
    for (const t of text) bausteine.push({ art, text: t });
    bausteine.push({ art: 'leer' });
  }
  if (person?.display) bausteine.push({ art: 'absatz', text: person.display });

  return {
    absender: [einrichtung || titel],
    empfaenger: name
      ? [
          `${(name.given ?? []).join(' ')} ${name.family ?? ''}`.trim(),
          ...(geburt ? [`geb. ${deutsch(geburt)}`] : []),
        ]
      : [],
    ortDatum: datum ? deutsch(datum) : '',
    betreff:
      zeitraum?.start && zeitraum.end
        ? `${titel} — stationärer Aufenthalt ${deutsch(zeitraum.start)} bis ${deutsch(zeitraum.end)}`
        : titel,
    bausteine,
    fusszeile: 'Ansicht, erzeugt aus dem strukturierten Dokument',
  };
}

/**
 * Das PDF zu einem strukturierten Dokument — für einen Brief erzeugt, für einen Laborbefund
 * aus `presentedForm`. Als Zeichenkette mit einem Byte je Zeichen; `null`, wenn es keins gibt.
 */
export function pdfAnsichtFuer(bundle: unknown): string | null {
  const vorlage = briefAusFhir(bundle);
  if (vorlage) return briefPdfErzeugen(vorlage);
  const bericht = ressourcen(bundle).find((x) => x.resourceType === 'DiagnosticReport');
  const form = (
    bericht?.['presentedForm'] as { contentType?: string; data?: string }[] | undefined
  )?.find((f) => f.contentType === 'application/pdf' && f.data);
  return form?.data ? bytesAusBase64(form.data) : null;
}

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function bytesAusBase64(b64: string): string {
  const sauber = b64.replace(/[^A-Za-z0-9+/]/g, '');
  let aus = '';
  for (let i = 0; i < sauber.length; i += 4) {
    const n = [0, 1, 2, 3].map((k) => ALPHABET.indexOf(sauber[i + k] ?? 'A'));
    const wert = (n[0]! << 18) | (n[1]! << 12) | (Math.max(n[2]!, 0) << 6) | Math.max(n[3]!, 0);
    aus += String.fromCharCode((wert >> 16) & 0xff);
    if (i + 2 < sauber.length) aus += String.fromCharCode((wert >> 8) & 0xff);
    if (i + 3 < sauber.length) aus += String.fromCharCode(wert & 0xff);
  }
  return aus;
}
