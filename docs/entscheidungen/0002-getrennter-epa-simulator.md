# 0002 — Der ePA-Simulator ist eine eigene Anwendung

**Datum:** 09.09.2026 · **Status:** angenommen

## Zusammenhang

Die Demo soll die ePA-Anbindung zeigen, ohne an die Telematikinfrastruktur angebunden zu sein.
Der einfachere Weg wäre ein Modul im Frontend, das ePA-Daten vortäuscht.

## Entscheidung

Ein eigener Dienst mit echter HTTP-Schnittstelle im FHIR-REST-Stil. Das PVS ruft ihn über Netzwerk auf.
Ein einblendbares Aufrufprotokoll im PVS zeigt jeden Aufruf mit Operation, Status und Dauer.

## Begründung

Die Aussage, um die es im Projekt geht, ist eine Aussage über eine Grenze: Welche Daten liegen im
Primärsystem, welche in der Akte, und wer darf sie ändern. Ein Modul im selben Prozess kann diese
Grenze nicht beweisen — es kann sie nur behaupten. Über HTTP wird sie überprüfbar, und drei Dinge
werden zeigbar, die sonst Behauptung blieben: Latenz, Fehlerfälle und Berechtigungen.

Hinzu kommt der Nutzen für M6: Ein zweites Primärsystem kann gegen denselben Simulator laufen, ohne
dass an der Fachlogik etwas geändert wird. Kollaborative Pflege wird damit vorführbar statt erklärbar.

## Verworfen

**Gemockte ePA-Schicht im Frontend** — schneller gebaut und ohne laufenden Server vorführbar, aber die
Systemgrenze bliebe konzeptionell. Genau sie ist der Gegenstand.

## Folgen

Für die Vorführung müssen zwei Prozesse laufen. Das ist der Preis und wird über ein gemeinsames
Startskript abgefedert.
