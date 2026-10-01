# 0020 — Selbsterklärende Oberfläche, Erklärung in der Dokumentation

**Datum:** 27.09.2026 · **Status:** angenommen

## Zusammenhang

Die Oberfläche trug viele Erklärtexte: Bänder mit Absätzen über den Bestand, Hinweisboxen zu
Spezifikationsständen, eine aufklappbare Tabelle der Modellelemente unter jeder Maske, Karten wie
„Warum es kein Eingabefeld für Laborwerte gibt". In der Vorführung lenkten sie von der Handlung
ab und machten die Anwendung zu einer Präsentation statt zu einem Praxissystem.

Zugleich soll das Repository ohne das übergeordnete Projekt verständlich sein und später
öffentlich liegen können.

## Entscheidung

- Die Oberfläche erklärt sich durch Benutzung: Beschriftungen, Zustände als Wort, Marker,
  Bestandsband ohne Text. Hinweise bleiben, wo sie eine Lage melden (Fehler, Konflikt, AMTS),
  und sind dann ein Satz.
- Was eine Ansicht zeigt und warum, steht in [SPEZIFIKATION.md](../SPEZIFIKATION.md). Sie wird
  mit jeder Änderung der Demo fortgeschrieben.
- Das Repository verweist nur auf öffentliche Quellen ([QUELLEN.md](../QUELLEN.md)). Werkzeuge,
  die lokale Repositories lesen, bekommen deren Pfad über Umgebungsvariablen.

## Verworfen

**Erklärtexte hinter einem Schalter „Erläuterungen"** — doppelte Pflege an zwei Orten, und die
Texte wären weiter im Quelltext der Oberfläche verstreut.
