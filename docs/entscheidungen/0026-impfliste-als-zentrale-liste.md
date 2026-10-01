# 0026 — ✦ Impfliste als zentrale Liste in der ePA

**Datum:** 30.09.2026 · **Status:** angenommen · **baut auf:** 0021, 0022

## Zusammenhang

In der Patient Summary blieb der Block „Impfungen" bisher immer leer: Kein Dienst der ePA liefert
Impfungen als Einträge. Im Release 3.1.3 stehen sie, wenn überhaupt, in Dokumenten. Die
europäische Patient Summary kennt eine eigene Section „Immunizations".

## Entscheidung

1. Ein dritter Ausbaustand **„Weiterentwicklung 2"** ergänzt den Diagnose-Service um eine
   ✦ **Impfliste**. Er ist der Standard der Demo; „Weiterentwicklung 1" bleibt als Stand ohne
   Impfliste wählbar.
2. Die Impfliste liegt unter `/epa/vorschlag/immunization/api/v1/fhir` und folgt derselben
   Mechanik wie Allergien- und Diagnosenliste: `$immunization-list`, `$immunization-list-log`,
   `$add-immunization-entry`, `$update-immunization-entry`, Lesenachweis über
   `acknowledgedChronologyId`, Änderungseinträge, Berichtigen über den Status. Einträge nach
   `immunization-eu-core`.
3. Eine **Relevanzmarkierung gibt es nicht.** Die Patient Summary übernimmt jede durchgeführte
   Impfung der Liste.
4. Im PVS gibt es einen Bereich **Impfungen** im Splitscreen: Impfungen der Praxis links, die
   Impfliste der ePA rechts, mit „in die ePA" und „in die Praxis". Erfasst wird über einen
   Impfstoffkatalog (Auszug, ATC real, Zielkrankheiten als SNOMED CT).

## Begründung

▸ Die Impfliste ist der naheliegende nächste Block: Die Angaben entstehen bei jeder Impfung ohnehin
strukturiert, und sie sind eine der Sections der europäischen Patient Summary. Dieselbe Mechanik
wie bei den anderen Listen hält den Aufwand für Primärsysteme klein.

▸ Relevanz zu markieren ergibt bei Impfungen keinen Sinn: Für den Impfschutz zählt jede Dosis.
Die Auswahl, die bei Diagnosen den Wert der Übersicht ausmacht, wäre hier ein zusätzlicher
Schritt ohne Nutzen.

## Folgen

Ein eigener Ausbaustand hält die Stufen vergleichbar: „Weiterentwicklung 1" zeigt die Patient
Summary mit leerem Impfblock, „Weiterentwicklung 2" denselben Block aus der Impfliste. Der
Startbestand enthält fünf Impfungen der früheren Hausarztpraxis bei Frau Hoffmann und eine
Impfung der Praxis bei Frau Yildiz, die noch nicht in der ePA steht.

## Verworfen

**Impfungen nur aus Dokumenten** (elektronischer Impfpass) — bleibt der Weg des Release 3.1.3;
die Patient Summary müsste jedes Dokument zerlegen. **Impfungen im Diagnose-Service mitführen** —
eine Liste, eine Mechanik, aber ein Dienst mit wachsender Zuständigkeit; getrennte Basen lassen
sich einzeln einführen.
