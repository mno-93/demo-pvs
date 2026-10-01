# 0016 — Laborwerte nur aus Befunden

**Datum:** 10.09.2026 · **Status:** angenommen

## Zusammenhang

Laborwerte lagen als eigener Bestand im Zustand und ließen sich über die Karteikarte als Text
festhalten. Damit konnte ein Wert ohne Labor, Freigabe, Referenzbereich und Probe entstehen.

## Entscheidung

- Es gibt **keine Erfassung von Laborwerten**, weder als Feld noch als Karteikürzel.
- Laborwerte werden aus **Laborbefunden nach dgLP** gelesen (Bundle `bundle-dglp`,
  Content-IG `de.gematik.epa.laboratory` 1.0.0-ballot.1), die in der Dokumentenablage liegen — vom Labor
  übermittelt oder aus der ePA übernommen. Der Zustand führt keine Laborwerte.
- Der neue Reiter **Labor** zeigt Befunde und einen Kumulativbefund, nur lesend. Karteikarte und
  AMTS-Prüfung beziehen ihre Werte von dort.
- Derselbe Befund auf zwei Wegen — vom Labor und über die ePA — wird an der Dokumentkennung
  erkannt (⚠ Annahme: das Labor verwendet die Befund-UUID als XDS-uniqueId).

## Begründung

Ein Wert ohne Befund hat keine Herkunft. Für die AMTS-Prüfung und die Patient Summary zählt
aber genau die. ▸ Die Demo zeigt damit auch den Nutzen strukturierter Befunde: Erst nach der
Übernahme des Laborbefunds aus der ePA warnt die Prüfung bei Metformin.

## Verworfen

**Erfassung mit Pflichtangabe der Herkunft** — bleibt eine zweite Wahrheit neben dem Befund.
