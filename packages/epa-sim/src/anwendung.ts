/**
 * ePA-Simulator — Aufbau der Anwendung als Fastify-Server (lokal, ADR 0002).
 *
 * Prüfkette und Wege stehen in `wege.ts`; derselbe Code läuft in der gehosteten Demo im
 * Browser (`browser.ts`, ADR 0025). Beide erfüllen dieselbe Schnittstelle (`schnittstelle.ts`,
 * ADR 0050); hier liegt die dünne Hülle um Fastify. Körper, Fehler und Grenzen behandeln beide
 * Seiten gleich — ein Differenztest prüft das (`browser-paritaet.test.ts`).
 */
import cors from '@fastify/cors';
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import { jsonMitSchreibweise } from '@demo-pvs/kern';
import { simulatorZuruecksetzen } from './betrieb-ruecksetzen.ts';
import {
  KOERPER_GRENZE,
  fehlerKoerper,
  type SimAntwort,
  type SimAnwendung,
  type SimHandler,
} from './schnittstelle.ts';
import { wegeEinhaengen } from './wege.ts';

/** Die Antwort, wie sie die Wege sehen; gibt ein Weg sie zurück, gilt die Fastify-Antwort. */
function antwortHuelle(r: FastifyReply): SimAntwort {
  const huelle: SimAntwort = {
    get sent() {
      return r.sent;
    },
    get statusCode() {
      return r.statusCode;
    },
    code(status) {
      r.code(status);
      return huelle;
    },
    header(name, wert) {
      r.header(name, wert);
      return huelle;
    },
    getHeader: (name) => r.getHeader(name),
    type(inhaltstyp) {
      r.type(inhaltstyp);
      return huelle;
    },
    send(koerper) {
      r.send(koerper);
      return huelle;
    },
  };
  return huelle;
}

function alsSimAnwendung(app: FastifyInstance): SimAnwendung {
  const ausfuehren = async (handler: SimHandler, anfrage: FastifyRequest, r: FastifyReply) => {
    const huelle = antwortHuelle(r);
    const ergebnis = await handler(anfrage, huelle);
    return ergebnis === huelle ? r : ergebnis;
  };
  const weg = (handler: SimHandler) => (anfrage: FastifyRequest, r: FastifyReply) =>
    ausfuehren(handler, anfrage, r);
  return {
    get: (pfad, handler) => void app.get(pfad, weg(handler)),
    post: (pfad, handler) => void app.post(pfad, weg(handler)),
    put: (pfad, handler) => void app.put(pfad, weg(handler)),
    anfrageHaken: (haken) =>
      void app.addHook('onRequest', async (anfrage, r) => {
        await ausfuehren(haken, anfrage, r);
      }),
    serialisierHaken: (haken) =>
      void app.addHook('preSerialization', async (anfrage, r, koerper) =>
        haken(anfrage, antwortHuelle(r), koerper),
      ),
    sendeHaken: (haken) =>
      void app.addHook('onSend', async (anfrage, r, koerper) =>
        haken(anfrage, antwortHuelle(r), koerper),
      ),
    nichtGefunden: (handler) => void app.setNotFoundHandler(weg(handler)),
  };
}

/**
 * JSON-Körper wie im Browser-Adapter: leer ergibt `{}`, unlesbar 400. Dezimalzahlen behalten
 * ihre Schreibweise für den Dosierungstext (`1.0` → „1,0“, `fhir/schreibweise.ts` im Kern).
 */
function jsonLesen(text: string): unknown {
  if (text.trim() === '') return {};
  try {
    return jsonMitSchreibweise(text);
  } catch {
    throw Object.assign(new Error('Körper nicht lesbar.'), { statusCode: 400 });
  }
}

/** Baut den Simulator mit frischem Startbestand und Standard-Betriebslage. */
export async function simulatorBauen(): Promise<FastifyInstance> {
  simulatorZuruecksetzen();

  const app = Fastify({ logger: false, bodyLimit: KOERPER_GRENZE });
  await app.register(cors, {
    origin: true,
    exposedHeaders: ['ETag', 'Last-Modified', 'X-Request-ID'],
  });

  // ITI-67 erlaubt die Suche auch als POST mit Formularkörper.
  app.addContentTypeParser(
    'application/x-www-form-urlencoded',
    { parseAs: 'string' },
    (_a, koerper, fertig) =>
      fertig(null, Object.fromEntries(new URLSearchParams(koerper as string))),
  );

  // JSON und FHIR-JSON gleich behandelt wie im Browser-Adapter.
  app.removeContentTypeParser('application/json');
  for (const typ of ['application/json', 'application/fhir+json']) {
    app.addContentTypeParser(typ, { parseAs: 'string' }, (_a, koerper, fertig) => {
      try {
        fertig(null, jsonLesen(koerper as string));
      } catch (fehler) {
        fertig(fehler as Error, undefined);
      }
    });
  }

  // ITI-41 spricht SOAP 1.2; der Demo-Ersatz des KIM-Clientmoduls nimmt eine Mail entgegen; die
  // Render API nimmt ihre Einstellung auch als XML an. Alle bleiben Text — gelesen wird im Weg.
  for (const typ of ['application/soap+xml', 'message/rfc822', 'application/xml', 'text/xml']) {
    app.addContentTypeParser(typ, { parseAs: 'string' }, (_a, koerper, fertig) =>
      fertig(null, koerper),
    );
  }

  // Fehler außerhalb der Wege (Körper, Größe, Ausnahmen) im Fehlerformat der Basisdienste.
  // Texte wie im Browser-Adapter, damit beide Seiten gleich antworten.
  app.setErrorHandler(async (fehler: Error & { statusCode?: number }, anfrage, antwort) => {
    const status = fehler.statusCode ?? 500;
    const typ = String(anfrage.headers['content-type'] ?? '')
      .split(';')[0]!
      .trim()
      .toLowerCase();
    const [code, text] =
      status === 413
        ? ['payloadTooLarge', `Körper größer als ${KOERPER_GRENZE} Byte.`]
        : status === 415
          ? ['malformedRequest', `Inhaltstyp ${typ} wird nicht unterstützt.`]
          : status < 500
            ? ['malformedRequest', fehler.message]
            : ['internalError', fehler.message];
    return antwort.code(status).send(fehlerKoerper(code, text));
  });

  wegeEinhaengen(alsSimAnwendung(app));
  return app;
}
