/**
 * ePA-Simulator — Aufbau der Anwendung als Fastify-Server (lokal, ADR 0002).
 *
 * Prüfkette und Wege stehen in `wege.ts`; derselbe Code läuft in der gehosteten Demo im
 * Browser (`browser.ts`, ADR 0025).
 */
import cors from '@fastify/cors';
import Fastify, { type FastifyInstance } from 'fastify';
import { betriebslage, STANDARD_BETRIEBSLAGE } from './betrieb.ts';
import { erezepteLeeren } from './erezept.ts';
import { startbestandAufbauen } from './startbestand.ts';
import { wegeEinhaengen } from './wege.ts';

/** Baut den Simulator mit frischem Startbestand und Standard-Betriebslage. */
export async function simulatorBauen(): Promise<FastifyInstance> {
  startbestandAufbauen();
  erezepteLeeren();
  Object.assign(betriebslage, STANDARD_BETRIEBSLAGE);

  const app = Fastify({ logger: false });
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

  app.addContentTypeParser(
    'application/fhir+json',
    { parseAs: 'string' },
    (_a, koerper, fertig) => {
      try {
        fertig(null, koerper === '' ? {} : JSON.parse(koerper as string));
      } catch (fehler) {
        fertig(fehler as Error, undefined);
      }
    },
  );

  // ITI-41 spricht SOAP 1.2; der Demo-Ersatz des KIM-Clientmoduls nimmt eine Mail entgegen.
  // Beide bleiben Text — gelesen wird im Weg.
  for (const typ of ['application/soap+xml', 'message/rfc822']) {
    app.addContentTypeParser(typ, { parseAs: 'string' }, (_a, koerper, fertig) =>
      fertig(null, koerper),
    );
  }

  wegeEinhaengen(app);
  return app;
}
