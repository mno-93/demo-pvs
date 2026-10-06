/**
 * Kleinste PDF-Datei mit Textzeilen — für Befunde und Briefe, die in der ePA als PDF liegen,
 * und für `DiagnosticReport.presentedForm` des Laborbefunds (1..1 mit Daten).
 *
 * Ein-Seiten-PDF mit Helvetica, WinAnsi-Kodierung; Umlaute werden über die Zeichentabelle
 * geschrieben. Keine Bibliothek, damit Simulator und Praxissystem dieselbe Datei erzeugen.
 */

/** Zeichen außerhalb von Latin-1, die WinAnsi an eigener Stelle führt. */
const WINANSI: Record<string, number> = {
  '–': 0x96,
  '—': 0x97,
  '„': 0x84,
  '“': 0x93,
  '”': 0x94,
  '‚': 0x82,
  '‘': 0x91,
  '’': 0x92,
  '•': 0x95,
  '…': 0x85,
  '€': 0x80,
};

function maskieren(text: string): string {
  let aus = '';
  for (const zeichen of text) {
    const code = WINANSI[zeichen] ?? zeichen.charCodeAt(0);
    if (zeichen === '(' || zeichen === ')' || zeichen === '\\') aus += `\\${zeichen}`;
    else if (code < 128) aus += zeichen;
    else if (code < 256) aus += `\\${code.toString(8).padStart(3, '0')}`;
    else aus += '?';
  }
  return aus;
}

export function pdfErzeugen(titel: string, zeilen: readonly string[]): string {
  const inhalt = [
    'BT',
    '/F1 15 Tf',
    '56 790 Td',
    `(${maskieren(titel)}) Tj`,
    '/F1 10 Tf',
    '0 -24 Td',
    ...zeilen.flatMap((z) => [`(${maskieren(z)}) Tj`, '0 -14 Td']),
    'ET',
  ].join('\n');
  const objekte = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${inhalt.length} >>\nstream\n${inhalt}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
  ];
  let datei = '%PDF-1.4\n';
  const lagen: number[] = [];
  objekte.forEach((o, i) => {
    lagen.push(datei.length);
    datei += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const verzeichnis = datei.length;
  datei += `xref\n0 ${objekte.length + 1}\n0000000000 65535 f \n`;
  datei += lagen.map((l) => `${String(l).padStart(10, '0')} 00000 n \n`).join('');
  datei += `trailer\n<< /Size ${objekte.length + 1} /Root 1 0 R >>\nstartxref\n${verzeichnis}\n%%EOF\n`;
  return datei;
}

/**
 * Eine eingescannte Seite: ein PDF, das nur ein Bild trägt und **keine Textebene** — so, wie
 * ein Scanner ohne Texterkennung es ablegt. Weder Volltextsuche noch ✦ Aktenlotse finden darin
 * etwas; ein Mensch liest es trotzdem.
 *
 * A4, hoch oder quer — je nachdem, wie das Bild liegt.
 *
 * @param jpeg Graustufen-JPEG als Bytezeichen (ein Zeichen je Byte)
 */
export function scanPdfErzeugen(jpeg: string, breite: number, hoehe: number): string {
  const [b, h] = breite > hoehe ? [842, 595] : [595, 842];
  const inhalt = `q\n${b} 0 0 ${h} 0 0 cm\n/Scan Do\nQ`;
  const objekte = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${b} ${h}] /Resources << /XObject << /Scan 5 0 R >> >> /Contents 4 0 R >>`,
    `<< /Length ${inhalt.length} >>\nstream\n${inhalt}\nendstream`,
    `<< /Type /XObject /Subtype /Image /Width ${breite} /Height ${hoehe} /ColorSpace /DeviceGray /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n${jpeg}\nendstream`,
  ];
  let datei = '%PDF-1.4\n';
  const lagen: number[] = [];
  objekte.forEach((o, i) => {
    lagen.push(datei.length);
    datei += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const verzeichnis = datei.length;
  datei += `xref\n0 ${objekte.length + 1}\n0000000000 65535 f \n`;
  datei += lagen.map((l) => `${String(l).padStart(10, '0')} 00000 n \n`).join('');
  datei += `trailer\n<< /Size ${objekte.length + 1} /Root 1 0 R >>\nstartxref\n${verzeichnis}\n%%EOF\n`;
  return datei;
}

/* ---------- Briefe ---------- */

/**
 * Ein Baustein eines Briefs. `zeile` ist eine eingerückte Listenzeile (Diagnose, Mittel),
 * `absatz` Fließtext, der umbrochen wird.
 */
export type Briefbaustein =
  | { art: 'ueberschrift'; text: string }
  | { art: 'absatz'; text: string }
  | { art: 'zeile'; text: string }
  | { art: 'leer' };

/** Ein Arzt- oder Entlassbrief, wie er als PDF in der ePA liegt: Kopf, Anschrift, Text. */
export interface Briefvorlage {
  /** Briefkopf der Einrichtung; die erste Zeile ist der Name. */
  absender: string[];
  empfaenger: string[];
  ortDatum: string;
  betreff: string;
  bausteine: Briefbaustein[];
  fusszeile: string;
}

/**
 * Die Textzeilen eines Briefs, wie sie die Textebene des PDFs trägt: Betreff, dann je
 * Baustein eine Zeile. Überschriften stehen ohne Einzug, Listenzeilen eingerückt, ein
 * Abschnitt endet an der Leerzeile — so lesen Volltextsuche und ✦ Aktenlotse den Brief.
 */
export function briefTextzeilen(b: Briefvorlage): string[] {
  return [
    b.betreff,
    '',
    ...b.bausteine.map((x) =>
      x.art === 'leer' ? '' : x.art === 'zeile' ? `   ${x.text}` : x.text,
    ),
  ];
}

/** Bricht Text an Leerzeichen um — Breite in Zeichen, für Helvetica 10 pt grob geschätzt. */
function umbrechen(text: string, breite: number): string[] {
  const zeilen: string[] = [];
  let aktuell = '';
  for (const wort of text.split(/\s+/).filter(Boolean)) {
    if (aktuell && aktuell.length + 1 + wort.length > breite) {
      zeilen.push(aktuell);
      aktuell = wort;
    } else aktuell = aktuell ? `${aktuell} ${wort}` : wort;
  }
  if (aktuell) zeilen.push(aktuell);
  return zeilen.length > 0 ? zeilen : [''];
}

/**
 * Mehrseitiges Brief-PDF mit Briefkopf, Anschriftfeld, Betreff, Abschnitten und Fußzeile mit
 * Seitenzahl. Helvetica und Helvetica-Bold, WinAnsi-Kodierung. Die Textebene ist echt — die
 * Volltextsuche findet, was im Brief steht.
 */
export function briefPdfErzeugen(b: Briefvorlage): string {
  const LINKS = 64;
  const RECHTS = 531;
  const OBEN = 792;
  const UNTEN = 72;
  type Schrift = 'F1' | 'F2';
  const seiten: string[][] = [[]];
  let y = OBEN;
  const seite = () => seiten.at(-1)!;
  const neueSeite = () => {
    seiten.push([]);
    y = OBEN;
  };
  const text = (t: string, x: number, schrift: Schrift, groesse: number, grau = 0) =>
    seite().push(
      `${grau} g BT /${schrift} ${groesse} Tf ${x} ${y.toFixed(1)} Td (${maskieren(t)}) Tj ET`,
    );
  const vor = (abstand: number, folgend = 0) => {
    if (y - abstand - folgend < UNTEN) neueSeite();
    else y -= abstand;
  };

  // Briefkopf
  b.absender.forEach((z, i) => {
    text(z, LINKS, i === 0 ? 'F2' : 'F1', i === 0 ? 13 : 8.5, i === 0 ? 0 : 0.35);
    y -= i === 0 ? 15 : 11;
  });
  y -= 4;
  seite().push(`0.6 G 0.5 w ${LINKS} ${y} m ${RECHTS} ${y} l S`);
  y -= 30;
  // Anschrift links, Ort und Datum rechts auf Höhe der ersten Zeile
  const anschriftOben = y;
  for (const z of b.empfaenger) {
    text(z, LINKS, 'F1', 10);
    y -= 13;
  }
  const merk = y;
  y = anschriftOben;
  text(b.ortDatum, RECHTS - b.ortDatum.length * 4.9, 'F1', 10);
  y = merk - 26;
  for (const z of umbrechen(b.betreff, 82)) {
    text(z, LINKS, 'F2', 10.5);
    y -= 14;
  }
  y -= 8;

  for (const x of b.bausteine) {
    if (x.art === 'leer') {
      y -= 7;
    } else if (x.art === 'ueberschrift') {
      vor(10, 30);
      text(x.text, LINKS, 'F2', 10.5);
      y -= 15;
    } else {
      const einzug = x.art === 'zeile' ? 14 : 0;
      for (const z of umbrechen(x.text, x.art === 'zeile' ? 88 : 94)) {
        vor(0, 14);
        text(z, LINKS + einzug, 'F1', 10);
        y -= 13.5;
      }
    }
  }

  // Fußzeile je Seite
  const anzahl = seiten.length;
  seiten.forEach((ops, i) => {
    const fuss = `Seite ${i + 1} von ${anzahl}`;
    ops.push(`0.6 G 0.5 w ${LINKS} 52 m ${RECHTS} 52 l S`);
    ops.push(`0.4 g BT /F1 8 Tf ${LINKS} 40 Td (${maskieren(b.fusszeile)}) Tj ET`);
    ops.push(`0.4 g BT /F1 8 Tf ${RECHTS - fuss.length * 3.9} 40 Td (${maskieren(fuss)}) Tj ET`);
  });

  // Objekte: 1 Katalog, 2 Seitenbaum, 3 F1, 4 F2, dann je Seite Seite und Inhalt
  const objekte: string[] = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>',
  ];
  const kinder: string[] = [];
  seiten.forEach((ops) => {
    const nr = objekte.length + 1;
    kinder.push(`${nr} 0 R`);
    const inhalt = ops.join('\n');
    objekte.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${nr + 1} 0 R >>`,
      `<< /Length ${inhalt.length} >>\nstream\n${inhalt}\nendstream`,
    );
  });
  objekte[1] = `<< /Type /Pages /Kids [${kinder.join(' ')}] /Count ${kinder.length} >>`;

  let datei = '%PDF-1.4\n';
  const lagen: number[] = [];
  objekte.forEach((o, i) => {
    lagen.push(datei.length);
    datei += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const verzeichnis = datei.length;
  datei += `xref\n0 ${objekte.length + 1}\n0000000000 65535 f \n`;
  datei += lagen.map((l) => `${String(l).padStart(10, '0')} 00000 n \n`).join('');
  datei += `trailer\n<< /Size ${objekte.length + 1} /Root 1 0 R >>\nstartxref\n${verzeichnis}\n%%EOF\n`;
  return datei;
}

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** Base64 einer Zeichenkette, deren Zeichen je ein Byte sind (wie die PDF-Datei oben). */
export function base64AusBytes(text: string): string {
  let aus = '';
  for (let i = 0; i < text.length; i += 3) {
    const a = text.charCodeAt(i) & 0xff;
    const b = i + 1 < text.length ? text.charCodeAt(i + 1) & 0xff : NaN;
    const c = i + 2 < text.length ? text.charCodeAt(i + 2) & 0xff : NaN;
    const n = (a << 16) | ((b || 0) << 8) | (c || 0);
    aus += ALPHABET[(n >> 18) & 63]! + ALPHABET[(n >> 12) & 63]!;
    aus += Number.isNaN(b) ? '=' : ALPHABET[(n >> 6) & 63]!;
    aus += Number.isNaN(c) ? '=' : ALPHABET[n & 63]!;
  }
  return aus;
}

/* ---------- Seiten lesen ---------- */

/** Ein Element einer gelesenen PDF-Seite, in PDF-Koordinaten (Ursprung unten links). */
export type Seitenelement =
  | {
      art: 'text';
      x: number;
      y: number;
      text: string;
      groesse: number;
      fett: boolean;
      grau: number;
    }
  | { art: 'linie'; x1: number; y1: number; x2: number; y2: number; grau: number };

export interface Seite {
  breite: number;
  hoehe: number;
  elemente: Seitenelement[];
}

/** WinAnsi-Byte → Zeichen; über 0x9F gilt Latin-1. */
const WINANSI_ZURUECK: Record<number, string> = Object.fromEntries(
  Object.entries(WINANSI).map(([zeichen, code]) => [code, zeichen]),
);

function pdfZeichenkette(roh: string): string {
  let aus = '';
  for (let i = 0; i < roh.length; i++) {
    const c = roh[i]!;
    if (c !== '\\') {
      const code = c.charCodeAt(0);
      aus += WINANSI_ZURUECK[code] ?? c;
      continue;
    }
    const n = roh[i + 1] ?? '';
    if (/[0-7]/.test(n)) {
      const oktal = /^[0-7]{1,3}/.exec(roh.slice(i + 1))![0];
      const code = parseInt(oktal, 8);
      aus += WINANSI_ZURUECK[code] ?? String.fromCharCode(code);
      i += oktal.length;
    } else {
      aus += n === 'n' ? '\n' : n === 'r' ? '\r' : n === 't' ? '\t' : n;
      i += 1;
    }
  }
  return aus;
}

/**
 * Liest die Seiten eines einfachen PDFs — so, wie es diese Demo erzeugt: unkomprimierte
 * Inhaltsströme mit Text (`BT … Tf … Td (…) Tj ET`), Grauwerten und Linien. Damit lässt sich
 * ein Brief seitengetreu darstellen und eine Stelle darin markieren, ohne eine PDF-Bibliothek.
 *
 * Gibt `null` zurück, wenn die Datei anders aufgebaut ist (etwa komprimiert oder ein Scan).
 */
export function pdfSeitenLesen(pdf: string): Seite[] | null {
  if (!pdf.startsWith('%PDF')) return null;
  const objekte = new Map<number, string>();
  for (const m of pdf.matchAll(/(\d+) 0 obj\n([\s\S]*?)\nendobj/g)) {
    objekte.set(Number(m[1]), m[2]!);
  }
  const katalog = [...objekte.values()].find((o) => o.includes('/Type /Catalog'));
  const baumNr = Number(/\/Pages (\d+) 0 R/.exec(katalog ?? '')?.[1]);
  const baum = objekte.get(baumNr);
  const kinder = /\/Kids \[([^\]]*)\]/.exec(baum ?? '')?.[1];
  if (!kinder) return null;
  const seitenNr = [...kinder.matchAll(/(\d+) 0 R/g)].map((m) => Number(m[1]));
  const seiten: Seite[] = [];
  for (const nr of seitenNr) {
    const seite = objekte.get(nr) ?? '';
    if (/\/Filter/.test(seite)) return null;
    const box = /\/MediaBox \[([\d.\s-]+)\]/.exec(seite)?.[1]?.trim().split(/\s+/).map(Number);
    const schriften = new Map<string, boolean>();
    for (const m of seite.matchAll(/\/(F\d+) (\d+) 0 R/g)) {
      schriften.set(m[1]!, /Bold/.test(objekte.get(Number(m[2])) ?? ''));
    }
    const inhaltNr = Number(/\/Contents (\d+) 0 R/.exec(seite)?.[1]);
    const inhalt = objekte.get(inhaltNr) ?? '';
    if (/\/Filter/.test(inhalt)) return null;
    const strom = /stream\n([\s\S]*?)\nendstream/.exec(inhalt)?.[1] ?? '';
    seiten.push({
      breite: box?.[2] ?? 595,
      hoehe: box?.[3] ?? 842,
      elemente: inhaltLesen(strom, schriften),
    });
  }
  return seiten;
}

function inhaltLesen(strom: string, schriften: Map<string, boolean>): Seitenelement[] {
  const elemente: Seitenelement[] = [];
  const stapel: string[] = [];
  let grau = 0;
  let strichgrau = 0;
  let schrift = 'F1';
  let groesse = 10;
  let zeileX = 0;
  let zeileY = 0;
  let pfad: [number, number] | null = null;
  const linien: [number, number, number, number][] = [];
  const re = /\((?:\\.|[^\\)])*\)|\/[A-Za-z0-9]+|-?\d+(?:\.\d+)?|[A-Za-z*'"]+/g;
  for (const m of strom.matchAll(re)) {
    const t = m[0];
    if (t.startsWith('(') || t.startsWith('/') || /^-?\d/.test(t)) {
      stapel.push(t);
      continue;
    }
    const zahl = (i: number) => Number(stapel[stapel.length - i]);
    switch (t) {
      case 'g':
        grau = zahl(1);
        break;
      case 'G':
        strichgrau = zahl(1);
        break;
      case 'BT':
        zeileX = 0;
        zeileY = 0;
        break;
      case 'Tf':
        schrift = (stapel[stapel.length - 2] ?? '/F1').slice(1);
        groesse = zahl(1);
        break;
      case 'Td':
        zeileX += zahl(2);
        zeileY += zahl(1);
        break;
      case 'Tj': {
        const roh = stapel[stapel.length - 1] ?? '()';
        const text = pdfZeichenkette(roh.slice(1, -1));
        if (text.trim()) {
          elemente.push({
            art: 'text',
            x: zeileX,
            y: zeileY,
            text,
            groesse,
            fett: schriften.get(schrift) ?? false,
            grau,
          });
        }
        break;
      }
      case 'm':
        pfad = [zahl(2), zahl(1)];
        break;
      case 'l':
        if (pfad) linien.push([pfad[0], pfad[1], zahl(2), zahl(1)]);
        pfad = [zahl(2), zahl(1)];
        break;
      case 'S':
        for (const [x1, y1, x2, y2] of linien.splice(0)) {
          elemente.push({ art: 'linie', x1, y1, x2, y2, grau: strichgrau });
        }
        break;
    }
    stapel.length = 0;
  }
  return elemente;
}
