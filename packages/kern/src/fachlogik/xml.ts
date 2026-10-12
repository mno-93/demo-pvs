/**
 * Ein kleiner XML-Leser für die SOAP-Nachrichten des XDS Document Service.
 *
 * Er läuft ohne DOM, damit derselbe Code im Simulator unter Node und in der gehosteten Demo im
 * Browser liest. Er kennt Elemente, Attribute, Text und CDATA; Namensraumpräfixe bleiben am
 * Namen stehen, gesucht wird über den lokalen Namen. DTDs und Entitäten außer den fünf
 * vordefinierten liest er nicht — die braucht eine ebXML-Nachricht nicht.
 */

export interface XmlElement {
  /** Name mit Präfix, etwa `rim:Slot`. */
  name: string;
  /** Name ohne Präfix, etwa `Slot`. */
  lokal: string;
  attribute: Record<string, string>;
  kinder: XmlElement[];
  /** Zusammengefügter Text der direkten Textknoten. */
  text: string;
}

const ENTITAET: Record<string, string> = {
  lt: '<',
  gt: '>',
  amp: '&',
  quot: '"',
  apos: "'",
};

function entschluesseln(t: string): string {
  return t.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|[a-z]+);/g, (ganz, e: string) => {
    if (e.startsWith('#x')) return String.fromCodePoint(parseInt(e.slice(2), 16));
    if (e.startsWith('#')) return String.fromCodePoint(parseInt(e.slice(1), 10));
    return ENTITAET[e] ?? ganz;
  });
}

export function xmlMaskieren(t: string): string {
  return t
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const lokalerName = (n: string) => n.slice(n.indexOf(':') + 1);

/** Liest ein XML-Dokument. Wirft bei nicht wohlgeformtem Inhalt. */
export function xmlLesen(xml: string): XmlElement {
  const wurzel: XmlElement = {
    name: '#dokument',
    lokal: '#dokument',
    attribute: {},
    kinder: [],
    text: '',
  };
  const stapel: XmlElement[] = [wurzel];
  const muster =
    /<!\[CDATA\[([\s\S]*?)\]\]>|<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!DOCTYPE[^>]*>|<\/([^\s>]+)\s*>|<([^\s/>]+)((?:\s+[^\s=]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|([^<]+)/g;
  let treffer: RegExpExecArray | null;
  while ((treffer = muster.exec(xml)) !== null) {
    const oben = stapel[stapel.length - 1]!;
    const [, cdata, ende, start, attr, leer, text] = treffer;
    if (cdata !== undefined) oben.text += cdata;
    else if (ende !== undefined) {
      if (oben.name !== ende)
        throw new Error(`XML nicht wohlgeformt: </${ende}> schließt <${oben.name}>.`);
      stapel.pop();
    } else if (start !== undefined) {
      const attribute: Record<string, string> = {};
      for (const a of (attr ?? '').matchAll(/([^\s=]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
        attribute[a[1]!] = entschluesseln(a[2] ?? a[3] ?? '');
      }
      const element: XmlElement = {
        name: start,
        lokal: lokalerName(start),
        attribute,
        kinder: [],
        text: '',
      };
      oben.kinder.push(element);
      if (!leer) stapel.push(element);
    } else if (text !== undefined) {
      if (text.includes('<')) throw new Error('XML nicht wohlgeformt.');
      oben.text += entschluesseln(text);
    }
  }
  if (stapel.length !== 1)
    throw new Error(
      `XML nicht wohlgeformt: <${stapel[stapel.length - 1]!.name}> nicht geschlossen.`,
    );
  const dokument = wurzel.kinder[0];
  if (!dokument) throw new Error('XML ohne Wurzelelement.');
  return dokument;
}

/** Direkte Kinder mit diesem lokalen Namen. */
export function kinder(e: XmlElement, lokal: string): XmlElement[] {
  return e.kinder.filter((k) => k.lokal === lokal);
}

export function kind(e: XmlElement, lokal: string): XmlElement | undefined {
  return e.kinder.find((k) => k.lokal === lokal);
}

/** Alle Nachfahren mit diesem lokalen Namen, in Dokumentreihenfolge. */
export function nachfahren(e: XmlElement, lokal: string): XmlElement[] {
  const aus: XmlElement[] = [];
  const gehen = (x: XmlElement) => {
    for (const k of x.kinder) {
      if (k.lokal === lokal) aus.push(k);
      gehen(k);
    }
  };
  gehen(e);
  return aus;
}
