# 0014 — Die ePA als Fenster über der Kartei

**Datum:** 10.09.2026 · **Status:** angenommen

## Zusammenhang

Die ePA war ein Reiter der Patientenkartei, gleichrangig mit Diagnosen und Abrechnung. Das
legte nahe, sie sei ein Bereich des Praxissystems. Das Aufrufprotokoll lag als festes
Seitenfenster über dem Schalter, der es geöffnet hatte, und ließ sich nicht mehr schließen.

## Entscheidung

- Die ePA öffnet sich über einen Knopf im Patientenkopf als **eigenes Fenster** über der
  Kartei: eigener Kopf mit ePA-Siegel, eigener Hintergrund, Schließen über Kreuz, Escape und
  Klick daneben. Die frühere Adresse `…/epa` öffnet die Karteikarte und das Fenster.
- Das Fenster bietet, was der Reiter bot: Übersicht mit Zugriffsdaten, Dokumente in ePA
  (ansehen ohne Kopie, übernehmen), Medikation in ePA (Lesesicht mit Sprung ins Modul),
  Laborbefunde in ePA, Inhalte aus Dokumenten. (Seit 0020 ohne erklärende Textblöcke.)
- Die Bereiche der Kartei öffnen das Fenster gezielt: „in der ePA öffnen" bei den Dokumenten,
  „Laborbefunde in der ePA" beim Labor und in der Medikation.
- Das Aufrufprotokoll schließt über ein Kreuz und Escape; es liegt über dem ePA-Fenster, damit
  beide zugleich nutzbar sind. Escape schließt zuerst das Fenster, dann das Protokoll.

## Begründung

Die Hierarchie der Oberfläche soll die Hierarchie der Systeme wiedergeben: Die Kartei ist das
eigene System, die ePA ein fremdes, das aufgerufen wird. Ein Fenster eine Ebene höher sagt das
ohne Erklärtext. ▸ Es entspricht auch dem Splitscreen-Gedanken der Ausbaustufen: Die ePA
steht neben der Arbeit, nicht an ihrer Stelle.

## Verworfen

**Reiter behalten** — hält den Missverstand wach. **Eigene Seite** — verliert den Kontext der
Kartei. **Seitenleiste** — konkurriert mit dem Aufrufprotokoll um denselben Platz.
