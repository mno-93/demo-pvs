# 0005 — Katalogauszüge als erzeugte TypeScript-Module

**Datum:** 09.09.2026 · **Status:** angenommen

## Zusammenhang

Die Katalogauszüge (ICD-10-GM, EBM, Arzneimittel, LOINC, Allergene) werden in beiden Laufzeiten
gebraucht: im Browser über Vite und im Simulator unter Node. Sie sollen zugleich ohne
Entwicklungsumgebung bearbeitbar bleiben — Fachleute pflegen Kataloge, nicht Programmierende.

## Entscheidung

Die JSON-Dateien in `daten/kataloge/` sind die bearbeitbare Quelle. Ein Skript
(`werkzeuge/kataloge-erzeugen.mjs`) übersetzt sie in typisierte Module unter
`packages/kern/src/kataloge/`. Nur diese Module werden importiert.

## Begründung

Direkte JSON-Importe verhalten sich in den beiden Laufzeiten unterschiedlich: Node verlangt seit
Version 20 Import-Attribute, Bundler nicht; bei Projektreferenzen kommt hinzu, dass Dateien außerhalb
des Paketverzeichnisses die Typprüfung stören. Der erzeugte Zwischenschritt beseitigt beides und
bringt Typsicherheit über die Katalogeinträge, die bei einer Laufzeitprüfung fehlen würde.

## Verworfen

**Kataloge unmittelbar als TypeScript schreiben** — spart den Schritt, macht die Pflege aber von
Programmierkenntnissen abhängig.
**Zur Laufzeit laden** — verlangt in jeder Laufzeit eigene Ladelogik und verschiebt Fehler in Kataloge
von der Übersetzungs- in die Laufzeit.

## Folgen

Nach jeder Katalogänderung ist das Skript auszuführen. Die erzeugten Dateien werden mit eingecheckt,
damit ein frisch geklontes Projekt ohne Zusatzschritt baut.
