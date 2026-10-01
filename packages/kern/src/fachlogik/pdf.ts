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
