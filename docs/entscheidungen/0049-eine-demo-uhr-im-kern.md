# 0049 — Eine Demo-Uhr im Kern

**Datum:** 02.11.2026 · **Status:** angenommen · **ergänzt:** 0004, 0030

## Zusammenhang

„Jetzt“ entstand an fünf Stellen auf vier Arten: `demoJetzt()` im Kern, `jetzt()` im Simulator,
`jetzt(zustand)` in den Vorgängen des Praxissystems, Zeilen mit `new Date().toTimeString()` in
Oberflächenmodulen und `jetztAlsIsoOrtszeit()` mit `new Date()` als Vorgabe. Das hatte drei Folgen:

- **Echtes Datum in fachlichen Daten.** Der Abgleich des Medikationsplans zeigte „Abgeglichen ·
  30.10.2026“, während die Praxis den 09.09.2026 führt; die `submissionTime` eines eingestellten
  Arztbriefs und das Datum der KIM-Nachricht trugen ebenfalls das echte Datum.
- **Uhrzeit des Rechners.** Alle Varianten nahmen die Uhrzeit aus der Zone des Rechners und
  setzten beim Übergang nach FHIR den deutschen Versatz an. Wer die öffentliche Demo außerhalb
  Deutschlands öffnete, bekam Zeitpunkte mit falschem Versatz; der Startbestand legte Befugnisse
  mit Zeitpunkten ohne Zone an.
- **Sprung über Mitternacht.** Die Zeichenkette fiel nach Mitternacht auf `T00:00` desselben Tages
  zurück. „Neu seit dem letzten Aufruf“ vergleicht Zeitpunkte als Zeichenkette und hätte danach
  Änderungen übersehen.

## Entscheidung

1. **Eine Uhr im Kern** (`packages/kern/src/uhr.ts`): `DEMO_HEUTE`, `demoZeitpunkt()` (ohne Zone, mit
   Millisekunden), `demoZeitpunktSekunden()`, `demoUhrzeit()`, `demoJetzt()` als `Date` für
   Vergleiche mit Angaben, die eine Zone tragen, und `ortszeitDeutschland(date)`.
2. **Deutsche Wanduhrzeit**, unabhängig von der Zone des Rechners (`Intl.DateTimeFormat` mit
   `Europe/Berlin`). Der Versatz in FHIR kommt weiter aus `fhir/zeit.ts`.
3. **Streng steigend.** Zwei Aufrufe ergeben nie denselben Zeitpunkt, auch nicht in der Nacht der
   Zeitumstellung. Über Mitternacht geht die Uhr auf den nächsten Tag weiter; gezählt wird ab dem
   Tag, an dem sie zum ersten Mal gelesen wurde.
4. **Praxissystem und Simulator lesen nur diese Uhr.** `jetzt()` im Simulator und in den Vorgängen
   sind schmale Hüllen darum; `jetztAlsIsoOrtszeit()` entfällt. Technische Zeitmarken, die nicht in
   fachliche Daten gehen (Aufrufprotokoll, Kennungen, UUID Version 7), bleiben bei `Date.now()`.

## Folgen

- Lokal laufen Praxissystem und Simulator in getrennten Prozessen mit je eigener Uhr. Startet einer
  vor und einer nach Mitternacht, liegen ihre Demo-Tage einen Tag auseinander. ▸ Hingenommen: Beide
  werden mit `npm run dev` gemeinsam gestartet.
- Die Tagesübersicht bleibt beim Demo-Tag (`zustand.heute`); nach Mitternacht entstehende Einträge
  tragen den Folgetag.

## Verworfene Alternativen

- **Uhrzeit nach Mitternacht auf 23:59:59.999 halten.** Bliebe nicht streng steigend, sobald mehr als
  eine Änderung in dieselbe Millisekunde fällt.
- **Die Uhr im Simulator führen und vom Praxissystem abfragen.** Jeder Vorgang bräuchte einen
  Aufruf; die Uhr ist Demo-Steuerung, keine Schnittstelle der ePA.
- **Echtes Datum statt Demo-Tag.** Termine, Befugnisse und Startbestand sind auf den Demo-Tag
  abgestimmt; mit dem Kalender veraltete die Demo.
