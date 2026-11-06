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
geht einen Schritt zurück oder beginnt neu; „beenden“ blendet sie aus.

**Nutzertest:** Link mit `&modus=aufgabe` öffnen, die Testperson arbeitet nur mit dem
Aufgabentext. Am Ende „Protokoll herunterladen“: JSON mit Dauer, Fehlklicks, Hilfen und den
Ereignissen je Schritt. Es bleibt im Browser, wird nicht übertragen und enthält keine Angaben zur
Testperson.

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
   Ziel alle vorhandenen Namen der Rolle), dann im Browser in allen drei Modi.
6. **Eintragen** — Tabelle oben, Prüfliste in `ENTWICKLUNG.md`, Änderungsverlauf der Spezifikation.
