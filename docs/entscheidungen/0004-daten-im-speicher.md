# 0004 — Daten im Arbeitsspeicher statt in einer Datenbank

**Datum:** 09.09.2026 · **Status:** angenommen · **ergänzt durch:** 0058 · **berichtigt:** 16.11.2026

## Entscheidung

Beide Anwendungen halten ihre Daten im Arbeitsspeicher und laden beim Start JSON-Startdaten.
Der Simulator bietet Zurücksetzen und Zustandsausgabe als Verwaltungsendpunkte.

## Begründung

Für einen Demonstrator ist Reproduzierbarkeit wichtiger als Dauerhaftigkeit: Jeder Termin muss im selben
Zustand beginnen. Ein interessanter Zwischenstand lässt sich als Datei sichern und wieder einspielen —
das genügt und ist obendrein versionierbar. **Berichtigt 16.11.2026:** Weder Sichern noch Einspielen
gibt es. `GET /verwaltung/bestand` liefert nur eine Übersicht je Akte (Kennungen der Dokumente,
Zählwerte), nicht den Bestand mit Befugnissen, E-Rezepten, Fassungen und Chronologie. Die Startdaten
sind TypeScript-Module im Kern (`beispiele.ts`, `startbestand.ts`, `startdaten.ts`), kein JSON. Eine Datenbank brächte Betriebsaufwand, Migrationsfragen und
bei nativen Treibern Bauprobleme, ohne dass die Fragestellung davon profitierte.

## Verworfen

**SQLite** — naheliegend, aber native Abhängigkeiten erschweren den Bau auf fremden Rechnern.
**Dauerhafte JSON-Dateien** — verlockend, führt aber dazu, dass Vorführungen im Zustand der letzten
Vorführung beginnen. Genau das soll nicht passieren.
