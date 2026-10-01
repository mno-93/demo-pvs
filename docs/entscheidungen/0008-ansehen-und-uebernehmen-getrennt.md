# 0008 — Ansehen und Übernehmen sind zwei Handlungen

**Datum:** 09.09.2026 · **Status:** angenommen

## Zusammenhang

Das Praxissystem führt eine eigene Dokumentenablage. Aus der elektronischen Patientenakte
lassen sich Dokumente abrufen. Naheliegend wäre, ein abgerufenes Dokument gleich lokal
abzulegen — der Abruf hat es ohnehin geladen.

## Entscheidung

Das Betrachten eines Aktendokuments erzeugt **keine** lokale Kopie. Erst „Übernehmen" legt
es in der Praxisablage ab, mit Zeitpunkt und verantwortlicher Person. Beide Handlungen
stehen als eigene Schaltflächen nebeneinander.

## Begründung

Ein Blick in ein Dokument ist keine Aneignung. Würde jeder Abruf eine Kopie erzeugen, wüchse
die lokale Ablage mit jedem Blick, und die Frage, die diese Ansicht beantworten soll — was
liegt bei uns, was nicht — würde bedeutungslos. Hinzu kommt der datenschutzrechtliche
Gedanke: Eine Kopie in der eigenen Verantwortung entsteht durch eine Entscheidung, nicht
durch Betrachtung.

▸ Fachlich ist das dieselbe Unterscheidung wie bei der Patient Summary: Ein Datensatz
wechselt den Bestand nur durch eine benannte Handlung.

## Verworfen

**Abruf legt automatisch ab** — bequemer, aber der Abgleich verlöre seine Aussage.
**Nur Übernehmen anbieten** — zwänge zur Kopie, um überhaupt hineinsehen zu können.
