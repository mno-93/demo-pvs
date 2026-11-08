# Klickpfade

Gezielte Abläufe durch die Demo zu einer Fragestellung — als Rundgang über einen Link, im Test
gegen den Simulator geprüft ([ADR 0061](entscheidungen/0061-klickpfade.md)).

## Vorhandene Klickpfade

| Kennung          | Frage                                                                                     | Ausbaustand         | Schritte |
| ---------------- | ----------------------------------------------------------------------------------------- | ------------------- | -------- |
| `diagnose-in-ps` | Wie kommt eine neue Dauerdiagnose in die Patient Summary — und was kostet das die Praxis? | Weiterentwicklung 3 | 7        |

## Aufrufen

An die Adresse der Demo `?klickpfad=<kennung>` anhängen, wahlweise mit `&modus=…`:

| Modus              | Adresse (lokal)                                                 | Wofür                              |
| ------------------ | --------------------------------------------------------------- | ---------------------------------- |
| geführt (Standard) | `http://localhost:5173/?klickpfad=diagnose-in-ps`               | Verschicken, Übergabe              |
| frei mit Wegweiser | `http://localhost:5173/?klickpfad=diagnose-in-ps&modus=frei`    | Erkunden nach dem ersten Durchgang |
| Aufgabe            | `http://localhost:5173/?klickpfad=diagnose-in-ps&modus=aufgabe` | Nutzertests                        |

Gehostet: `https://<konto>.github.io/<repository>/?klickpfad=…`. Der Klickpfad setzt Praxis und
Aktensystem zurück und stellt den Startzustand selbst her. Die Seitenleiste wechselt den Modus,
geht einen Schritt zurück oder beginnt neu; „beenden“ nimmt die Ebene ganz weg, die Demo bleibt
im erreichten Stand.

**Modus wechseln:** geführt ↔ frei am selben Schritt. In die Aufgabe beginnt der Pfad neu, mit
neuer Messung; zurück aus der Aufgabe bleibt der Stand. Klickpfad und Modus stehen in der
Adresse, solange der Pfad offen ist — die Adresse lässt sich jederzeit weitergeben, Neuladen
beginnt neu.

**Nutzertest:** Link mit `&modus=aufgabe` öffnen, die Testperson arbeitet nur mit dem
Aufgabentext. Am Ende „Protokoll herunterladen“: JSON mit Dauer, Fehlklicks, Hilfen und den
Ereignissen je Schritt. Es bleibt im Browser, wird nicht übertragen und enthält keine Angaben zur
Testperson.

## Mitziehen

Klickpfade sind Teil der Demo und ändern sich mit ihr. Zwei Sicherungen laufen in `npm run pruefen`
und in der CI:

1. **Der Pfad selbst** — fehlt ein Ziel, ist es mehrdeutig oder scheitert ein schreibender
   ePA-Aufruf, schlägt der Test fehl. Die Meldung nennt alle vorhandenen Namen der Rolle.
2. **Das Abbild** (`packages/pvs/src/klickpfade/abbilder/<kennung>.json`) — je Schritt das Ziel,
   seine Beschriftung oder sein Inhalt und die ePA-Aufrufe. Läuft der Pfad noch, zeigt aber etwas
   anderes (eine Vorbelegung, eine Beschriftung, ein anderer ePA-Weg beim Speichern), weicht das
   Abbild ab.

**Bei einer Abweichung:** erst die Texte des Szenarios (`kurz`, `lang`, `aufgabe`, `frage`) gegen
die neue Lage prüfen und berichtigen, dann `npm run klickpfade:abbilden` und den Klickpfad im
Browser ansehen. Nie nur das Abbild neu schreiben — dann stimmen die Erläuterungen nicht mehr. Im
Review gehört ein geändertes Abbild zur Durchsicht. Entfällt ein Ablauf, entfällt sein Klickpfad
(Szenario, Abbild, Zeile oben).

## Einen Klickpfad schreiben

1. **Ablauf finden** — in [SPEZIFIKATION.md, Abschnitt 11](SPEZIFIKATION.md#11-vorführung) oder
   in der Demo. Kein erfundener Weg: Was die Demo nicht kann, wird kein Klickpfad.
2. **Datei anlegen** — `packages/pvs/src/klickpfade/szenarien/<kennung>.ts` nach dem Muster von
   `diagnose-in-ps.ts`, in `szenarien/index.ts` eintragen.
3. **Ziele über Rolle und Namen** — so, wie ein Screenreader sie nennt. Gibt es einen Namen
   mehrfach, mit `in` eingrenzen; fehlt ein Name, ist das ein Fehler der Oberfläche (beheben, nicht
   umgehen).
4. **Texte** — `kurz`: ein Satz am Element. `lang`: warum der Schritt zählt, was dahinter
   passiert; ✦ für Vorschläge wie in der Demo. `aufgabe`: das Ziel, nicht den Weg.
5. **Prüfen** — `npx vitest run packages/pvs/src/klickpfade` (der Test nennt bei einem fehlenden
   Ziel alle vorhandenen Namen der Rolle; beim ersten Lauf entsteht das Abbild), dann im Browser
   in allen drei Modi. Das Abbild durchsehen und mit einchecken.
6. **Eintragen** — Tabelle oben, Prüfliste in `ENTWICKLUNG.md`, Änderungsverlauf der Spezifikation.
