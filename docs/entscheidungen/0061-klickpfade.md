# 0061 — Klickpfade: gezielte Abläufe als Rundgang, Export und Test

**Datum:** 06.11.2026 · **Status:** angenommen (Pilot) · **ergänzt:** 0020

## Zusammenhang

Die Demo zeigt viel auf einmal. Für eine bestimmte Frage — etwa „Wie kommt eine Diagnose in die
Patient Summary?“ — braucht es einen gezielten Ablauf: zum Verschicken, für Nutzertests und als
Übergabe an Gestaltung und Entwicklung. Bisher entstanden solche Klickstrecken getrennt von der
Demo, als Prototyp aus Einzelbildern. Sie veralten, sobald sich die Demo ändert, und zeigen nicht,
was die ePA dabei sieht.

Die Demo bringt die Bausteine mit: rund 70 Abläufe in Abschnitt 11 der Spezifikation, benannte
Bedienelemente, Startzustände per Code, einen austauschbaren Transport mit dem Simulator im
Browser (ADR 0025), die feste Demo-Uhr (ADR 0049) und das Aufrufprotokoll.

## Entscheidung

1. **Eine Szenario-Datei je Fragestellung** (`packages/pvs/src/klickpfade/szenarien/`): Frage,
   Aufgabentext, Startzustand (Ausbaustand, Person, eGK, Ansicht) und Schritte. Ein Schritt nennt
   sein Ziel über **Rolle und zugänglichen Namen**, wahlweise innerhalb eines anderen Elements —
   wie die Oberflächentests, nicht über CSS. Dazu eine Handlung (klicken, eingeben, wählen) oder
   eine Prüfung, ein kurzer Satz für das Element und eine Erläuterung für die Seitenleiste.
2. **Rollen und Namen löst `dom-accessibility-api` auf** (MIT) — dieselbe Bibliothek, die die
   Testing Library nutzt. Rundgang und Test sehen dieselben Elemente.
3. **Rundgang über den Link** `?klickpfad=<kennung>&modus=…`: Die Ebene setzt Praxis und
   Aktensystem zurück, stellt den Startzustand her und führt durch die Schritte. Drei Modi,
   umschaltbar:
   - **geführt** — nur das nächste Element ist bedienbar, der Rest abgedunkelt; ein Klick daneben
     zeigt „hier geht es weiter“; Prüfpunkte warten auf „weiter“;
   - **frei mit Wegweiser** — alles bedienbar; fehlt das Ziel, bietet die Seitenleiste „zurück zum
     Pfad“ (Startzustand und Schritte bis dahin werden nachgespielt);
   - **Aufgabe** — keine Hervorhebung, nur der Aufgabentext und „Hilfe“; gezählt werden Zeit,
     Fehlklicks und Hilfen. Das Protokoll bleibt im Browser und lässt sich als JSON herunterladen;
     es enthält keine Angaben zur Testperson und wird nicht übertragen.
4. **Die Ebene ist kein Teil des Praxissystems.** Sie erscheint nur über den Link, ist als
   „Klickpfad“ abgesetzt (Akzentblau, nicht Violett) und wird erst dann geladen (eigenes Paket).
   Das Praxissystem bleibt ohne Erklärtexte (ADR 0020).
5. **Jeder Klickpfad ist ein Test** (`klickpfade.test.tsx`) gegen den echten Simulator: Jedes Ziel
   muss eindeutig sein, wenn es an der Reihe ist, und kein schreibender Aufruf darf scheitern.
6. **Die ePA-Aufrufe je Schritt** kommen aus dem Aufrufprotokoll, zugeordnet nach ihrem Beginn —
   nicht von Hand geschrieben. Sonden nach Diensten, Aktenstatus und die Demo-Steuerung bleiben
   draußen.

## Mitziehen (ergänzt am 06.11.2026)

Klickpfade ändern sich mit der Demo. Der Test fängt einen gebrochenen Pfad ab, nicht aber einen,
der noch durchläuft und etwas anderes zeigt als seine Texte erklären. Deshalb vergleicht der Test
je Klickpfad ein eingechecktes **Abbild**: je Schritt Ziel, Beschriftung oder Inhalt und die
ePA-Aufrufe, Uhrzeiten und erzeugte Kennungen vereinheitlicht. Weicht es ab, sind erst die Texte
zu prüfen, dann wird das Abbild neu geschrieben (`npm run klickpfade:abbilden`). Die Regel steht
in `CLAUDE.md` („Bei jeder Änderung“), in der Pull-Request-Vorlage und in `docs/ZUSAMMENARBEIT.md`.

Verworfen: **eine Liste der Quelldateien je Klickpfad** mit einer Warnung bei deren Änderung —
pflegeaufwendig, warnt bei jeder Formatänderung und übersieht Änderungen in gemeinsam genutzten
Bausteinen. Das Abbild misst, was die Person sieht, nicht, wo es herkommt.

## Verworfene Alternativen

- **Klickstrecken als Bildfolge von Hand** (wie bisher im Prototyping-Werkzeug). Veraltet mit
  jeder Änderung, zeigt kein echtes Verhalten und keine Aufrufe.
- **Ziele über CSS-Selektoren oder Koordinaten.** Bräche bei jeder Umgestaltung; die Namen sind
  ohnehin Pflicht (Bedienbarkeit per Tastatur und Screenreader).
- **Eine Tour-Bibliothek.** Sie kennt weder Startzustände noch Simulator noch Test; die
  Ebene ist klein und nutzt, was die Demo hat.
- **Erklärtexte direkt in der Oberfläche.** Widerspräche ADR 0020; die Demo soll sich durch
  Benutzung erklären, der Klickpfad ist eine bewusst zugeschaltete Lesart.

## Folgen

- Mehrdeutige Namen fallen auf: Der Kopfknopf „Patient Summary“ und jeder ★-Schalter heißen
  gleich. Der Patientenkopf ist deshalb eine benannte Gruppe („Patientenkopf“).
- ⚠ Noch offen: Export als eingefrorene HTML-Klickstrecke (Bildschirmfotos mit Klickzonen) aus
  derselben Datei, ein wiederholbarer Ablauf für neue Szenarien (Projekt-Skill) — beide nach dem
  Pilot.
- Grenzen: Im geführten Modus sperrt die Ebene Klicks, Zeigergesten und Enter/Leertaste außerhalb
  des Ziels; Tabulator bleibt frei. Tipp-Schritte brauchen feste Eingaben.
