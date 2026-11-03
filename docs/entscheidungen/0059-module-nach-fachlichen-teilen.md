# 0059 — Module nach fachlichen Teilen, Demo-Steuerung getrennt

**Datum:** 02.11.2026 · **Status:** angenommen · **ergänzt:** 0002, 0050

## Zusammenhang

Vier Dateien waren zu groß, um sie zu überblicken: die Medikation im Praxissystem (1 866 Zeilen),
der Medication Service im Simulator (1 975), der ePA-Klient (1 596) und das ePA-Fenster (1 466).
Der ePA-Klient enthielt auch die Demo-Steuerung (`/verwaltung`), obwohl sie keine Schnittstelle
der ePA ist. Wege, Typen und Hilfsfunktionen standen doppelt in Praxissystem und Simulator: die
Basispfade der Dienste, `Ausbaustand`, `Kontakteintrag`, `neueId`, der Fehlerkörper der
Basisdienste, die Formate der Kopfzeilen und die Codesysteme ATC und PZN als Literal an mehr als
acht Stellen.

## Entscheidung

1. **Demo-Steuerung in ein eigenes Modul** (`pvs/src/demo/steuerung.ts`). Der ePA-Klient kennt
   sie nicht; sie nutzt seine Anfragefunktion.
2. **ePA-Klient je Dienst** (`pvs/src/epa/dienste/`: `dokumente`, `medikation`, `erezept`,
   `listendienste`, `vorschlaege`, `kim`). `epa/klient.ts` behält Kopfzeilen, Protokoll, Fehler,
   Befugnis und Aktenstatus. Was ein Dienst über das Angebot des Aktensystems merkt, meldet er mit
   `angebotMerken` an; nach einer Umstellung der Betriebslage vergisst der Klient alles auf einmal.
3. **Medikation im Praxissystem** nach Teilen (`module/medikation/`): Stand und Abgleich
   (`stand.ts`), Laden und Nachfragen (`laden.ts`), AMTS-Umgebung (`amts.ts`), Rezeptvorlagen
   (`vorlagen.ts`), Band und Marker des Abgleichs, Tabellen, neuer Planeintrag.
4. **ePA-Fenster je Bereich** (`epa/fensterteile/`).
5. **Medication Service im Simulator** je Abschnitt: Lesen, Common Query API, Schreiben im eMP,
   Schreiben in der eML (`medikation-*.ts`); `medikation-wege.ts` hängt sie ein, `medikation.ts`
   behält die gemeinsame Fachlogik. Kein Modul importiert zurück, was es einhängt.
6. **Gemeinsames im Kern**: `WEG` (Basispfade), `Ausbaustand`, `Kontakteintrag`, `neueId`,
   `CODESYSTEM.pzn`. Im Simulator stehen Fehlerkörper und Kopfzeilenformate in `schnittstelle.ts`.

## Folgen

- Keine Datei über 1 000 Zeilen in diesen Bereichen; keine zyklischen Importe zwischen den Modulen
  (geprüft).
- Verhalten unverändert: Tests, Typprüfung und Prüfliste wie zuvor. ▸ Ein beim Verschieben ohne
  `type` importierter Typ ließ den Simulator unter Node nicht starten; Vitest und Vite übersetzen
  anders und merkten es nicht. Seitdem melden `verbatimModuleSyntax` und `erasableSyntaxOnly` in
  der tsconfig des Simulators das bei der Typprüfung (Nachtrag 03.11.2026).
- Wer einen Weg ändert, ändert ihn an einer Stelle; Praxissystem und Simulator können nicht mehr
  auseinanderlaufen.

## Verworfen

**`klient.ts` als Sammelmodul, das alle Dienste weiterreicht.** Die Aufrufstellen blieben
unverändert, aber die Grenze zwischen ePA und Demo-Steuerung wäre wieder verwischt, und jede
Ansicht hinge an allen Diensten. **Die großen Dateien lassen und nur Abschnitte markieren.** Das
hilft beim Lesen, nicht beim Ändern: Ein Fehler in einem Abschnitt zwingt weiter, die ganze Datei
zu verstehen.
