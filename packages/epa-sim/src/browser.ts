/**
 * ePA-Simulator im Browser — für die gehostete Demo (ADR 0025).
 *
 * Statische Hosts wie GitHub Pages liefern nur Dateien aus; einen Server für den Simulator gibt
 * es dort nicht. Dieser Adapter erfüllt dieselbe Schnittstelle wie die Hülle um Fastify
 * (`schnittstelle.ts`, ADR 0050), hängt dieselben Wege (`wege.ts`) daran und beantwortet damit
 * `Request`-Objekte im Browser. Das Praxissystem ruft ihn an der Stelle auf, an der es sonst
 * `fetch` benutzt — Kopfzeilen, Statuscodes und Körper bleiben dieselben, das Aufrufprotokoll
 * ebenso. Wo Fastify etwas selbst erledigt (Wegvorrang, Körper lesen, Grenzen, Fehler, Inhaltstyp),
 * bildet der Adapter es nach; `browser-paritaet.test.ts` vergleicht beide Seiten.
 *
 * Der Bestand liegt im Speicher der Seite: Neu laden setzt ihn zurück, jede Besucherin hat ihren
 * eigenen.
 */
import { jsonMitSchreibweise } from '@demo-pvs/kern';
import { simulatorZuruecksetzen } from './betrieb-ruecksetzen.ts';
import {
  KOERPER_GRENZE,
  fehlerKoerper,
  type Kopfwert,
  type SimAnfrage,
  type SimAntwort,
  type SimAnwendung,
  type SimHandler,
  type SimSendeHaken,
} from './schnittstelle.ts';
import { wegeEinhaengen } from './wege.ts';

type Kopf = Record<string, string>;

interface Anfrage extends SimAnfrage {
  params: Record<string, string>;
  body: unknown;
}

class Antwort implements SimAntwort {
  statusCode = 200;
  kopf: Kopf = {};
  koerper: unknown = undefined;
  sent = false;

  code(status: number): this {
    this.statusCode = status;
    return this;
  }

  header(name: string, wert: string | number): this {
    this.kopf[name.toLowerCase()] = String(wert);
    return this;
  }

  getHeader(name: string): string | undefined {
    return this.kopf[name.toLowerCase()];
  }

  type(inhaltstyp: string): this {
    return this.header('content-type', inhaltstyp);
  }

  send(koerper?: unknown): this {
    this.koerper = koerper;
    this.sent = true;
    return this;
  }
}

interface Weg {
  methode: string;
  teile: string[];
  handler: SimHandler;
}

/** Vorrang wie in Fastify (find-my-way): Segment für Segment schlägt ein fester Teil einen Platzhalter. */
function vorrang(a: Weg, b: Weg): number {
  for (let i = 0; i < a.teile.length; i++) {
    const pa = a.teile[i]!.startsWith(':');
    const pb = b.teile[i]!.startsWith(':');
    if (pa !== pb) return pa ? 1 : -1;
  }
  return 0;
}

class BrowserAnwendung implements SimAnwendung {
  wege: Weg[] = [];
  anfrageHakenListe: SimHandler[] = [];
  serialisierHakenListe: SimSendeHaken[] = [];
  sendeHakenListe: SimSendeHaken[] = [];
  nichtGefundenHandler: SimHandler = (a, r) =>
    r.code(404).send(fehlerKoerper('notFound', `${a.method} ${a.url}`));

  private weg(methode: string, pfad: string, handler: SimHandler) {
    this.wege.push({ methode, teile: pfad.split('/'), handler });
  }

  get(pfad: string, handler: SimHandler) {
    this.weg('GET', pfad, handler);
  }

  post(pfad: string, handler: SimHandler) {
    this.weg('POST', pfad, handler);
  }

  put(pfad: string, handler: SimHandler) {
    this.weg('PUT', pfad, handler);
  }

  anfrageHaken(haken: SimHandler) {
    this.anfrageHakenListe.push(haken);
  }

  serialisierHaken(haken: SimSendeHaken) {
    this.serialisierHakenListe.push(haken);
  }

  sendeHaken(haken: SimSendeHaken) {
    this.sendeHakenListe.push(haken);
  }

  nichtGefunden(handler: SimHandler) {
    this.nichtGefundenHandler = handler;
  }

  /** Wirft `URIError`, wenn ein Platzhalter nicht dekodierbar ist (wie Fastify: 400). */
  finden(methode: string, pfad: string): { weg: Weg; params: Record<string, string> } | null {
    const teile = pfad.split('/');
    const passend = this.wege
      .filter(
        (w) =>
          w.methode === methode &&
          w.teile.length === teile.length &&
          w.teile.every((t, i) => t.startsWith(':') || t === teile[i]),
      )
      .sort(vorrang);
    const weg = passend[0];
    if (!weg) return null;
    const params: Record<string, string> = {};
    weg.teile.forEach((t, i) => {
      if (t.startsWith(':')) params[t.slice(1)] = decodeURIComponent(teile[i]!);
    });
    return { weg, params };
  }
}

function abfrageLesen(suche: URLSearchParams): Record<string, string | string[]> {
  const aus: Record<string, string | string[]> = {};
  for (const [k, v] of suche) {
    const bisher = aus[k];
    aus[k] = bisher === undefined ? v : ([] as string[]).concat(bisher, v);
  }
  return aus;
}

/** Inhaltstypen mit Leser — dieselben wie in `anwendung.ts` samt den Vorgaben von Fastify. */
const TEXTTYPEN = [
  'application/soap+xml',
  'message/rfc822',
  'application/xml',
  'text/xml',
  'text/plain',
];

class KoerperFehler extends Error {
  readonly status: number;
  constructor(status: number, text: string) {
    super(text);
    this.status = status;
  }
}

function koerperLesen(text: string, kopf: string | undefined): unknown {
  if (kopf === undefined) return text === '' ? undefined : text;
  const typ = kopf.split(';')[0]!.trim().toLowerCase();
  if (typ === 'application/json' || typ === 'application/fhir+json') {
    if (text.trim() === '') return {};
    try {
      return jsonMitSchreibweise(text);
    } catch {
      throw new KoerperFehler(400, 'Körper nicht lesbar.');
    }
  }
  if (typ === 'application/x-www-form-urlencoded') {
    return Object.fromEntries(new URLSearchParams(text));
  }
  if (TEXTTYPEN.includes(typ)) return text;
  throw new KoerperFehler(415, `Inhaltstyp ${typ} wird nicht unterstützt.`);
}

/** Wie Fastify: `charset=utf-8` an Text- und JSON-Typen, Vorgaben für Text und Binärinhalt. */
function inhaltstypVervollstaendigen(antwort: Antwort, koerper: unknown): void {
  const typ = antwort.getHeader('content-type');
  if (!typ) {
    if (typeof koerper === 'string') antwort.header('content-type', 'text/plain; charset=utf-8');
    else if (koerper instanceof Uint8Array)
      antwort.header('content-type', 'application/octet-stream');
    return;
  }
  if (!/charset=/i.test(typ) && (/json/i.test(typ) || /^text\//i.test(typ))) {
    antwort.header('content-type', `${typ}; charset=utf-8`);
  }
}

const KOERPERLOS = new Set(['GET', 'HEAD']);

/** Ein Simulator im Speicher der Seite; `abrufen` beantwortet Anfragen wie der Server. */
export interface BrowserSimulator {
  abrufen: (anfrage: Request) => Promise<Response>;
}

export function simulatorImBrowser(): BrowserSimulator {
  simulatorZuruecksetzen();
  const app = new BrowserAnwendung();
  wegeEinhaengen(app);

  async function beantworten(anfrage: Anfrage, antwort: Antwort, pfad: string, text: string) {
    try {
      anfrage.body = KOERPERLOS.has(anfrage.method)
        ? undefined
        : koerperLesen(text, firstHeader(anfrage.headers['content-type']));
    } catch (f) {
      const status = f instanceof KoerperFehler ? f.status : 400;
      antwort.code(status).send(fehlerKoerper('malformedRequest', (f as Error).message));
      return;
    }
    for (const haken of app.anfrageHakenListe) {
      await haken(anfrage, antwort);
      if (antwort.sent) return;
    }
    let treffer: ReturnType<BrowserAnwendung['finden']>;
    try {
      treffer = app.finden(anfrage.method, pfad);
    } catch {
      antwort.code(400).send(fehlerKoerper('malformedRequest', 'Pfad nicht lesbar.'));
      return;
    }
    const handler = treffer?.weg.handler ?? app.nichtGefundenHandler;
    anfrage.params = treffer?.params ?? {};
    const ergebnis = await handler(anfrage, antwort);
    if (!antwort.sent && ergebnis !== antwort && ergebnis !== undefined) antwort.send(ergebnis);
  }

  async function abrufen(eingang: Request): Promise<Response> {
    const url = new URL(eingang.url, 'http://simulator.local');
    const kopf: Kopf = {};
    eingang.headers.forEach((wert, name) => {
      kopf[name.toLowerCase()] = wert;
    });
    const anfrage: Anfrage = {
      method: eingang.method,
      url: url.pathname + url.search,
      headers: kopf,
      params: {},
      query: abfrageLesen(url.searchParams),
      body: undefined,
    };
    const antwort = new Antwort();
    const bytes = KOERPERLOS.has(eingang.method)
      ? new Uint8Array()
      : new Uint8Array(await eingang.arrayBuffer());
    if (bytes.byteLength > KOERPER_GRENZE) {
      antwort
        .code(413)
        .send(fehlerKoerper('payloadTooLarge', `Körper größer als ${KOERPER_GRENZE} Byte.`));
    } else {
      try {
        await beantworten(anfrage, antwort, url.pathname, new TextDecoder().decode(bytes));
      } catch (f) {
        // Wie die Fehlerbehandlung des Servers: eine Ausnahme im Weg ist ein 500, kein Abbruch.
        antwort.kopf = {};
        antwort.code(500).send(fehlerKoerper('internalError', (f as Error).message));
      }
    }

    // Wie Fastify: Objekte als JSON, Binärinhalt unverändert.
    let koerper: unknown = antwort.koerper;
    const binaer = koerper instanceof Uint8Array;
    if (!binaer && koerper !== undefined && typeof koerper !== 'string') {
      if (koerper !== null)
        for (const haken of app.serialisierHakenListe) {
          koerper = await haken(anfrage, antwort, koerper);
        }
      koerper = JSON.stringify(koerper);
      if (!antwort.getHeader('content-type')) {
        antwort.header('content-type', 'application/json; charset=utf-8');
      }
    }
    for (const haken of app.sendeHakenListe) {
      koerper = await haken(anfrage, antwort, koerper);
    }
    inhaltstypVervollstaendigen(antwort, koerper);
    const ohneKoerper = antwort.statusCode === 204 || koerper === undefined;
    return new Response(
      ohneKoerper ? null : (koerper as ConstructorParameters<typeof Response>[0]),
      {
        status: antwort.statusCode,
        headers: antwort.kopf,
      },
    );
  }

  return { abrufen };
}

function firstHeader(wert: Kopfwert): string | undefined {
  return Array.isArray(wert) ? wert[0] : wert;
}
