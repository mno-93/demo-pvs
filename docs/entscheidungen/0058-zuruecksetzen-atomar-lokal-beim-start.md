# 0058 — Zurücksetzen atomar, lokal auch beim Start

**Datum:** 02.11.2026 · **Status:** angenommen · **ergänzt:** 0004, 0025

## Zusammenhang

„Zurücksetzen“ im Kopf setzte zuerst das Praxissystem zurück und schickte danach, ohne zu warten,
die Rücksetzung an den Simulator; einen Fehler verschluckte es. Scheiterte der Simulator, stand
die Praxis im Startbestand und die ePA im alten Stand — ohne Hinweis.

Lokal läuft der Simulator als eigener Dienst. Lud die Seite neu, begann das Praxissystem beim
Startbestand, der Simulator behielt seinen Stand: Verknüpfungen und Lesezeichen der Praxis waren
weg, die Einträge in der ePA nicht. Gehostet beginnen beim Neuladen beide neu (ADR 0025).

## Entscheidung

1. **Erst das Aktensystem, dann die Praxis.** Der Knopf wartet auf den Simulator; erst wenn er
   zurückgesetzt ist, folgen Praxis, Zwischenspeicher des Klienten und Briefentwürfe. Scheitert
   er, bleibt die Praxis, wie sie war, und der Kopf zeigt „Zurücksetzen fehlgeschlagen“ mit dem
   Grund. Solange es läuft, ist der Knopf gesperrt.
2. **Lokal setzt der Start des Praxissystems auch den Simulator zurück**, wie gehostet. Anfragen
   an den Simulator warten, bis das geschehen ist; gelingt es nicht, melden sie ihren eigenen
   Fehler, die Konsole eine Warnung.
3. Im Simulator gibt es dafür eine Funktion (`simulatorZuruecksetzen`), die auch Server- und
   Browserstart nutzen.

## Folgen

- Neuladen bedeutet überall: Startbestand in Praxis und Aktensystem.
- ⚠ Ein zweites Fenster auf denselben lokalen Simulator setzt beim Öffnen auch für das erste
  zurück.
- ⚠ ADR 0004 nennt das Sichern und Einspielen eines Zwischenstands als Datei; das gibt es nicht.
  `GET /verwaltung/bestand` gibt den Bestand aus, ein Einspielen fehlt.

## Verworfen

**Den Stand des Praxissystems im Browser halten** (`sessionStorage`), damit er zum
weiterlaufenden Simulator passt. Das löst nur das Neuladen, nicht den Neustart des Simulators,
und Vorführungen begännen im Stand der letzten (ADR 0004). **Zuerst die Praxis zurücksetzen und
den Simulator nachziehen, mit Fehlermeldung.** Dann stünde bei einem Fehler genau der
widersprüchliche Stand da, den das Zurücksetzen vermeiden soll.
