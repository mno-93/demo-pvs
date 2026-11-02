# 0050 — Eine Schnittstelle für Server und Browser

**Datum:** 02.11.2026 · **Status:** angenommen · **ergänzt:** 0025

## Zusammenhang

Die Wege des Simulators hingen an den Typen von Fastify. Der Browser-Adapter der gehosteten Demo
(ADR 0025) bildete nur die benutzten Teile nach und wurde mit `as unknown as FastifyInstance`
übergeben. Damit prüfte die Typprüfung nicht, ob der Adapter alles kann, was die Wege benutzen.
So blieb unbemerkt, dass ihm `type()` fehlte: Die Render API `emp/settings` antwortete in der
gehosteten Fassung nicht, und der Schalter „Zwischenüberschriften“ blieb ohne Meldung stehen.

Dazu kamen Unterschiede, die Fastify selbst erledigt: unlesbare JSON-Körper (Server 500, Browser
400), leere JSON-Körper (Server 400, Browser `{}`), XML-Körper (Server 415, Browser durchgereicht),
keine Größengrenze im Browser, Ausnahmen im Weg (Server 500, Browser „nicht erreichbar“) und der
Vorrang fester Pfadteile vor Platzhaltern.

## Entscheidung

1. **Eine eigene, schmale Schnittstelle** (`epa-sim/src/schnittstelle.ts`): `SimAnwendung` mit
   `get`, `post`, `put`, `anfrageHaken`, `sendeHaken`, `nichtGefunden` (seit ADR 0057 auch
   `serialisierHaken`); `SimAnfrage` und `SimAntwort` mit genau den Teilen, die die Wege benutzen.
   Die Wege kennen nur sie.
2. **Fastify bekommt eine dünne Hülle** (`anwendung.ts`), der Browser-Adapter erfüllt die
   Schnittstelle direkt (`browser.ts`). Fehlt einer Seite etwas, meldet es die Typprüfung.
3. **Gleiches Verhalten, wo Fastify selbst handelt:** gleiche Leser für JSON (leer ergibt `{}`,
   unlesbar 400), Formular, SOAP, Mail und XML; 415 für andere Inhaltstypen; Grenze 16 MiB (413);
   Ausnahmen werden 500 `internalError`; Vorrang Segment für Segment wie in find-my-way;
   `charset=utf-8` an Text- und JSON-Typen.
4. **Ein Differenztest** (`browser-paritaet.test.ts`) schickt dieselbe Folge von Anfragen an beide
   Seiten und vergleicht Status, Inhaltstyp, `X-Request-ID` und Körper, bis auf vergebene Kennungen
   und Zeitpunkte.
5. **Eine Rücksetzfunktion** (`betrieb-ruecksetzen.ts`) für Serverstart, Browserstart und
   `POST /verwaltung/zuruecksetzen`; sie leert auch die erzeugten ePS.

## Verworfene Alternativen

- **Den Adapter um die fehlenden Fastify-Methoden ergänzen und beim Cast bleiben.** Die nächste
  benutzte Methode fiele wieder erst im Browser auf.
- **Fastify im Browser bündeln.** Fastify braucht Node-Module (`http`, Streams); das Bündel würde
  groß, und die gehostete Fassung hinge an Nachbildungen dieser Module.
- **Nur den Differenztest, ohne eigene Schnittstelle.** Er fände Lücken nur auf den Wegen, die er
  aufruft; die Typprüfung findet sie auf allen.
