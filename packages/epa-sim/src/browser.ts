/**
 * ePA-Simulator im Browser — für die gehostete Demo (ADR 0025).
 *
 * Statische Hosts wie GitHub Pages liefern nur Dateien aus; einen Server für den Simulator gibt
 * es dort nicht. Dieser Adapter hängt dieselben Wege (`wege.ts`) an eine kleine Nachbildung
 * der benutzten Fastify-Schnittstelle und beantwortet damit `Request`-Objekte im Browser. Das
 * Praxissystem ruft ihn an der Stelle auf, an der es sonst `fetch` benutzt — Kopfzeilen,
 * Statuscodes und Körper bleiben dieselben, das Aufrufprotokoll ebenso.
 *
 * Der Bestand liegt im Speicher der Seite: Neu laden setzt ihn zurück, jede Besucherin hat ihren
 * eigenen.
 */
import type { FastifyInstance } from 'fastify';
import { betriebslage, STANDARD_BETRIEBSLAGE } from './betrieb.ts';
import { erezepteLeeren } from './erezept.ts';
import { startbestandAufbauen } from './startbestand.ts';
import { wegeEinhaengen } from './wege.ts';

type Kopf = Record<string, string>;

interface Anfrage {
  method: string;
  url: string;
  headers: Kopf;
  params: Record<string, string>;
  query: Record<string, string | string[]>;
  body: unknown;
}

class Antwort {
  statusCode = 200;
  kopf: Kopf = {};
  koerper: unknown = undefined;
  sent = false;

  code(status: number): this {
    this.statusCode = status;
    return this;
  }

  header(name: string, wert: string): this {
    this.kopf[name.toLowerCase()] = String(wert);
    return this;
  }

  getHeader(name: string): string | undefined {
    return this.kopf[name.toLowerCase()];
  }

  send(koerper?: unknown): this {
    this.koerper = koerper;
    this.sent = true;
    return this;
  }
}

type Handler = (anfrage: Anfrage, antwort: Antwort) => unknown;
type SendeHaken = (anfrage: Anfrage, antwort: Antwort, koerper: unknown) => unknown;

interface Weg {
  methode: string;
  teile: string[];
  platzhalter: number;
  handler: Handler;
}

/** Die Teile der Fastify-Schnittstelle, die `wege.ts` und die Dienste benutzen. */
class BrowserAnwendung {
  wege: Weg[] = [];
  anfrageHaken: Handler[] = [];
  sendeHaken: SendeHaken[] = [];
  nichtGefunden: Handler = (a, r) => r.code(404).send({ fehler: `${a.method} ${a.url}` });

  private weg(methode: string, pfad: string, handler: Handler) {
    const teile = pfad.split('/');
    this.wege.push({
      methode,
      teile,
      platzhalter: teile.filter((t) => t.startsWith(':')).length,
      handler,
    });
  }

  get(pfad: string, handler: Handler) {
    this.weg('GET', pfad, handler);
  }

  post(pfad: string, handler: Handler) {
    this.weg('POST', pfad, handler);
  }

  addHook(art: 'onRequest' | 'onSend', haken: Handler | SendeHaken) {
    if (art === 'onRequest') this.anfrageHaken.push(haken as Handler);
    else this.sendeHaken.push(haken as SendeHaken);
  }

  setNotFoundHandler(handler: Handler) {
    this.nichtGefunden = handler;
  }

  /** Feste Wege vor solchen mit Platzhaltern, wie in Fastify. */
  finden(methode: string, pfad: string): { weg: Weg; params: Record<string, string> } | null {
    const teile = pfad.split('/');
    const passend = this.wege
      .filter((w) => w.methode === methode && w.teile.length === teile.length)
      .map((w) => {
        const params: Record<string, string> = {};
        const ok = w.teile.every((t, i) => {
          if (t.startsWith(':')) {
            params[t.slice(1)] = decodeURIComponent(teile[i]!);
            return true;
          }
          return t === teile[i];
        });
        return ok ? { weg: w, params } : null;
      })
      .filter((x): x is { weg: Weg; params: Record<string, string> } => x !== null)
      .sort((a, b) => a.weg.platzhalter - b.weg.platzhalter);
    return passend[0] ?? null;
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

function koerperLesen(text: string, typ: string): unknown {
  if (!text) return typ.includes('json') ? {} : undefined;
  if (typ.startsWith('application/x-www-form-urlencoded')) {
    return Object.fromEntries(new URLSearchParams(text));
  }
  if (typ.includes('json')) return JSON.parse(text);
  return text;
}

/** Ein Simulator im Speicher der Seite; `abrufen` beantwortet Anfragen wie der Server. */
export interface BrowserSimulator {
  abrufen: (anfrage: Request) => Promise<Response>;
}

export function simulatorImBrowser(): BrowserSimulator {
  startbestandAufbauen();
  erezepteLeeren();
  Object.assign(betriebslage, STANDARD_BETRIEBSLAGE);
  const app = new BrowserAnwendung();
  wegeEinhaengen(app as unknown as FastifyInstance);

  async function abrufen(eingang: Request): Promise<Response> {
    const url = new URL(eingang.url, 'http://simulator.local');
    const kopf: Kopf = {};
    eingang.headers.forEach((wert, name) => {
      kopf[name.toLowerCase()] = wert;
    });
    const text = eingang.method === 'GET' ? '' : await eingang.text();
    const anfrage: Anfrage = {
      method: eingang.method,
      url: url.pathname + url.search,
      headers: kopf,
      params: {},
      query: abfrageLesen(url.searchParams),
      body: undefined,
    };
    const antwort = new Antwort();
    try {
      anfrage.body = koerperLesen(text, kopf['content-type'] ?? '');
    } catch {
      antwort
        .code(400)
        .send({ errorCode: 'malformedRequest', errorDetail: 'Körper nicht lesbar.' });
    }

    if (!antwort.sent) {
      for (const haken of app.anfrageHaken) {
        await haken(anfrage, antwort);
        if (antwort.sent) break;
      }
    }
    if (!antwort.sent) {
      const treffer = app.finden(eingang.method, url.pathname);
      const handler = treffer?.weg.handler ?? app.nichtGefunden;
      anfrage.params = treffer?.params ?? {};
      const ergebnis = await handler(anfrage, antwort);
      if (!antwort.sent && ergebnis !== antwort && ergebnis !== undefined) antwort.send(ergebnis);
    }

    // Wie Fastify: Objekte als JSON, Binärinhalt unverändert.
    let koerper: unknown = antwort.koerper;
    const binaer = koerper instanceof Uint8Array;
    if (!binaer && koerper !== undefined && typeof koerper !== 'string') {
      koerper = JSON.stringify(koerper);
      if (!antwort.getHeader('content-type')) {
        antwort.header('content-type', 'application/json; charset=utf-8');
      }
    }
    for (const haken of app.sendeHaken) {
      koerper = await haken(anfrage, antwort, koerper);
    }
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
