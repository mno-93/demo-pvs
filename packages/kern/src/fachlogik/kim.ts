/**
 * KIM — Kommunikation im Medizinwesen: die **Client-Mail**, wie das Praxissystem sie an das
 * KIM-Clientmodul übergibt.
 *
 * Grundlage: `gemSpec_CM_KOMLE` V1.16.6 (18.03.2025, öffentlich).
 * - Das Primärsystem übergibt eine gewöhnliche Internet-Mail (RFC 5322, MIME) per SMTP an das
 *   Clientmodul; Signatur und Verschlüsselung nach S/MIME übernimmt das Clientmodul, nicht das
 *   Primärsystem.
 * - `X-KIM-Dienstkennung` ist optional; fehlt sie, setzt das Clientmodul den Standardwert
 *   `KIM-Mail;Default;V1.0` (A_19488-02). Sie steht auch im unverschlüsselten äußeren Kopf,
 *   damit das empfangende System die Nachricht einordnen kann.
 * - `X-KIM-Sendersystem: <Produkt>;<Version>` — so im Beispiel der Spezifikation, dort auch
 *   mit `Arztbrief;VHitG-Versand;V1.2` und einem Arztbrief als PDF-Anhang.
 * - Client-Mails bis 15 MiB gehen direkt (KOM-LE-A_2004-01); größere lädt das Clientmodul in
 *   den Kontenverwaltungs- und Anhangsdienst (A_19357-02). Die Demo bildet nur den ersten Fall ab.
 *
 * Die Dienstkennungen legt die gematik im Fachportal fest (Toolkit „Dienstkennung KIM",
 * Stand 18.06.2026). Für den eArztbrief: `Arztbrief;VHitG-Versand;V1.2` — PDF und optional
 * strukturierte Anhänge, verantwortet von der KBV. Eine Dienstkennung für einen strukturierten
 * Arztbrief nach FHIR gibt es nicht. ⚠ Ob die nicht öffentliche KBV-Spezifikation „KIM
 * eArztbrief" V1.2.2 einen FHIR-Anhang zulässt, ist nicht geprüft.
 */

export const KIM_DIENSTKENNUNG = {
  arztbrief: 'Arztbrief;VHitG-Versand;V1.2',
  standard: 'KIM-Mail;Default;V1.0',
} as const;

/** Grenze der direkten Zustellung; darüber der Weg über den Anhangsdienst (A_19357-02). */
export const KIM_GRENZE_BYTES = 15 * 1024 * 1024;

export interface KimAnhang {
  dateiname: string;
  mimeType: string;
  /** Inhalt als base64. */
  base64: string;
}

export interface KimNachricht {
  von: string;
  an: string[];
  betreff: string;
  /** ISO-Zeitpunkt. */
  datum: string;
  nachrichtId: string;
  dienstkennung: string;
  /** `<Produkt>;<Version>`. */
  sendersystem: string;
  text: string;
  anhaenge: KimAnhang[];
}

const TAGE = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONATE = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Datum nach RFC 5322, in UTC. */
export function mailDatum(iso: string): string {
  const d = new Date(/Z|[+-]\d\d:\d\d$/.test(iso) ? iso : `${iso}Z`);
  const z = (n: number) => String(n).padStart(2, '0');
  return `${TAGE[d.getUTCDay()]}, ${d.getUTCDate()} ${MONATE[d.getUTCMonth()]} ${d.getUTCFullYear()} ${z(d.getUTCHours())}:${z(d.getUTCMinutes())}:${z(d.getUTCSeconds())} +0000`;
}

/** Kopfzeilenwert mit Umlauten als „encoded word" (RFC 2047). */
function kopfwert(t: string): string {
  if (/^[\x20-\x7e]*$/.test(t)) return t;
  const bytes = new TextEncoder().encode(t);
  let bin = '';
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return `=?UTF-8?B?${btoa(bin)}?=`;
}

function kopfwertLesen(t: string): string {
  return t.replace(/=\?UTF-8\?B\?([^?]+)\?=/gi, (_g, b64: string) => {
    const bin = atob(b64);
    return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
  });
}

function textBase64(t: string): string {
  const bytes = new TextEncoder().encode(t);
  let bin = '';
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin);
}

const zeilen76 = (b64: string) => b64.match(/.{1,76}/g)?.join('\r\n') ?? '';

/** Die Client-Mail als Text mit CRLF-Zeilenenden. */
export function kimNachrichtErzeugen(n: KimNachricht): string {
  const grenze = `----=_Teil_${n.nachrichtId.replace(/[^A-Za-z0-9]/g, '').slice(0, 24)}`;
  const kopf = [
    `Date: ${mailDatum(n.datum)}`,
    `From: ${n.von}`,
    `To: ${n.an.join(', ')}`,
    `Subject: ${kopfwert(n.betreff)}`,
    `Message-ID: <${n.nachrichtId}>`,
    'MIME-Version: 1.0',
    `X-KIM-Dienstkennung: ${n.dienstkennung}`,
    `X-KIM-Sendersystem: ${n.sendersystem}`,
    `Content-Type: multipart/mixed; boundary="${grenze}"`,
  ];
  const teile = [
    [
      'Content-Type: text/plain; charset=utf-8',
      'Content-Transfer-Encoding: base64',
      '',
      zeilen76(textBase64(n.text)),
    ].join('\r\n'),
    ...n.anhaenge.map((a) =>
      [
        `Content-Type: ${a.mimeType}; name="${a.dateiname}"`,
        `Content-Disposition: attachment; filename="${a.dateiname}"`,
        'Content-Transfer-Encoding: base64',
        '',
        zeilen76(a.base64),
      ].join('\r\n'),
    ),
  ];
  return [
    ...kopf,
    '',
    'This is a multi-part message in MIME format.',
    ...teile.map((t) => `--${grenze}\r\n${t}`),
    `--${grenze}--`,
    '',
  ].join('\r\n');
}

export interface GeleseneKimNachricht {
  kopf: Record<string, string>;
  /** Text des ersten text/plain-Teils. */
  text: string;
  anhaenge: KimAnhang[];
}

function kopfLesen(block: string): Record<string, string> {
  const kopf: Record<string, string> = {};
  // Fortsetzungszeilen beginnen mit Leerraum (RFC 5322, „folding").
  for (const zeile of block.replace(/\r?\n[ \t]+/g, ' ').split(/\r?\n/)) {
    const i = zeile.indexOf(':');
    if (i > 0)
      kopf[zeile.slice(0, i).trim().toLowerCase()] = kopfwertLesen(zeile.slice(i + 1).trim());
  }
  return kopf;
}

function parameter(wert: string, name: string): string {
  return new RegExp(`${name}="?([^";]+)"?`, 'i').exec(wert)?.[1] ?? '';
}

/** Liest eine Client-Mail. Wirft, wenn Kopf und Körper nicht getrennt sind. */
export function kimNachrichtLesen(roh: string): GeleseneKimNachricht {
  const trenn = roh.search(/\r?\n\r?\n/);
  if (trenn < 0) throw new Error('Kopf und Körper der Nachricht sind nicht getrennt.');
  const kopf = kopfLesen(roh.slice(0, trenn));
  const grenze = parameter(kopf['content-type'] ?? '', 'boundary');
  const koerper = roh.slice(trenn).replace(/^\r?\n\r?\n/, '');
  const teile = grenze
    ? koerper
        .split(`--${grenze}`)
        .slice(1)
        .filter((t) => !t.startsWith('--'))
    : [`Content-Type: ${kopf['content-type'] ?? 'text/plain'}\r\n\r\n${koerper}`];
  let text = '';
  const anhaenge: KimAnhang[] = [];
  for (const teil of teile) {
    const t = teil.replace(/^\r?\n/, '');
    const ende = t.search(/\r?\n\r?\n/);
    if (ende < 0) continue;
    const k = kopfLesen(t.slice(0, ende));
    const inhalt = t
      .slice(ende)
      .replace(/^\r?\n\r?\n/, '')
      .replace(/\s+$/, '');
    const typ = (k['content-type'] ?? 'text/plain').split(';')[0]!.trim();
    const base64 = /base64/i.test(k['content-transfer-encoding'] ?? '');
    const dateiname =
      parameter(k['content-disposition'] ?? '', 'filename') ||
      parameter(k['content-type'] ?? '', 'name');
    if (!dateiname && typ === 'text/plain' && !text) {
      const roh64 = inhalt.replace(/\s+/g, '');
      text = base64
        ? new TextDecoder().decode(Uint8Array.from(atob(roh64), (c) => c.charCodeAt(0)))
        : inhalt;
    } else {
      anhaenge.push({
        dateiname,
        mimeType: typ,
        base64: base64 ? inhalt.replace(/\s+/g, '') : textBase64(inhalt),
      });
    }
  }
  return { kopf, text, anhaenge };
}
