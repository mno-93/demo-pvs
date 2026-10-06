# 0034 — Ausbaustände neu geordnet: Labor, Briefe, Listen, Lotse

**Datum:** 06.10.2026 · **Status:** angenommen · **ersetzt die Stufenfolge aus:** 0021, 0026, 0032

## Zusammenhang

Die Weiterentwicklungen der Demo waren gewachsen, nicht geplant: Stufe 1 brachte strukturierte
Laborbefunde, den strukturierten Entlassbrief, die Listen und die Patient Summary zugleich, Stufe 2
nur die Impfliste, Stufe 3 den Aktenlotsen. So ließ sich nicht zeigen, was jede Voraussetzung für
sich bringt — etwa, wie viel strukturierte Briefe schon ohne zentrale Listen leisten.

## Entscheidung

Vier aufeinander aufbauende Stufen; jede enthält die vorige (`epa-sim/src/betrieb.ts`, `AB_STUFE`):

| Stufe | Ausbaustand           | Was hinzukommt                                                                  |
| ----- | --------------------- | ------------------------------------------------------------------------------- |
| 0     | `release-3.1.3`       | — (Standard der Demo)                                                           |
| 1     | `weiterentwicklung`   | strukturierte Laborbefunde (Vorschau ePA 3.2) und Volltextsuche über `_content` |
| 2     | `weiterentwicklung-2` | ✦ Arzt- und Entlassbriefe als FHIR-Dokument (ADR 0033)                          |
| 3     | `weiterentwicklung-3` | ✦ Allergien- und Diagnosenliste, Impfliste, Patient Summary                     |
| 4     | `weiterentwicklung-4` | ✦ Aktenlotse                                                                    |

Die **Volltextsuche** gibt es erst ab Stufe 1. Im Release lehnt der Dokumentendienst `_content` mit
400 (`not-supported`) ab, statt den Parameter stillschweigend zu übergehen. Welche Suchparameter er
kennt, nennt sein CapabilityStatement unter `…/epa/mhd/api/v1/fhir/metadata`; das Primärsystem zeigt
das Suchfeld nur, wenn `_content` dort steht.

## Begründung

▸ Die Reihenfolge folgt den Voraussetzungen: Erst wenn Befunde und Briefe strukturiert vorliegen,
kann eine Liste oder eine Patient Summary sie nachnutzen; der Aktenlotse ergänzt, was unstrukturiert
bleibt. So lässt sich in der Demo Stufe für Stufe zeigen, was jede Voraussetzung bringt — in Stufe 2
etwa strukturierte Briefe, die noch niemand in eine Übersicht zieht.

▸ Ein Suchfeld, das im Release eine Fehlermeldung erzeugt, wäre eine schlechte Blaupause. Das
Primärsystem fragt die Fähigkeit ab, statt sie anzunehmen (U2).

## Folgen

- Listen, Impfliste und Patient Summary antworten erst ab Stufe 3 (vorher 1 bzw. 2), der Aktenlotse
  ab Stufe 4 (vorher 3). Die Demo-Steuerung „andere Einrichtung trägt ein" folgt derselben Ordnung.
- ⚠ Ob `_content` im Release 3.1.3 tatsächlich nicht angeboten wird, ist nicht gegen die
  Spezifikation geprüft; die Zuordnung zu Stufe 1 ist eine Setzung für die Vorführung.

## Verworfen

**Impfliste als eigene Stufe behalten** — sie hat dieselbe Mechanik wie die Allergien- und
Diagnosenliste und ist für die Patient Summary gleich wichtig; eine eigene Stufe zeigte nichts Neues.

**Volltextsuche im Release lassen und nur kennzeichnen** — die Stufen sollen zeigen, was fehlt.
