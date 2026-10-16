# 0040 — Profilfehler im Ballot: an der Instanz abfangen, nur Unerfüllbares ausnehmen

**Datum:** 15.10.2026 · **Status:** angenommen · **ergänzt:** 0039

## Zusammenhang

Der HL7-Validator prüft die Ausgaben der Demo gegen veröffentlichte Pakete, darunter Ballots. Beim
Laborbefund nach `de.gematik.epa.laboratory` 1.0.0-ballot.1 blieben nach der Angleichung drei
Meldungen, die keine fachliche Abweichung der Demo zeigen (SPEZIFIKATION 5.5):

- `obs-range-2` verwirft einseitige Referenzbereiche („> 90"), obwohl FHIR und dasselbe Profil
  sie kennen;
- `dr-comp-identifier` ist mit den dgLP-Profilen von keiner Instanz erfüllbar;
- der Abschnitt der Composition wird über `memberOf` auf ein LOINC-ValueSet zugeordnet, was der
  Validator ohne Terminologieserver verneint.

Eine Ausnahme im Validator greift über den Meldungstext. Scheitert eine Beobachtung an einem
Profil, melden Gruppe, Bundle und Composition denselben Fehler noch einmal, mit allgemeinem Text.

## Entscheidung

1. **Gibt es eine FHIR-gerechte Abbildung, die die fehlerhafte Regel erfüllt und nichts anderes
   sagt, nimmt die Demo sie** und beschreibt den Umweg: Die fehlende Grenze eines einseitigen
   Bereichs steht mit Einheit und `data-absent-reason` „not-applicable".
2. **Nur was keine Instanz erfüllen kann oder ohne Terminologieserver nicht prüfbar ist, wird
   ausgenommen** — mit eigener Ausnahme je Ursache, so eng wie der Meldungstext es zulässt.
3. **Was der Validator dann nicht prüft, prüft ein Test** (`laborbefund.test.ts`: Abschnitt,
   Verweise, einseitige Bereiche).
4. Jeder solche Fall steht als ▸ Befund am Ballot in der Spezifikation.

## Verworfene Alternativen

- **Ausnahme für `obs-range-2`.** Die Folgemeldungen an Gruppe, Bundle und DiagnosticReport tragen
  keinen Bezug zur Ursache; sie auszunehmen hätte jede künftige Abweichung der Laborwerte verdeckt.
- **Beidseitige Referenzbereiche in den Beispielen.** Für die eGFR unüblich; die Demo soll Befunde
  zeigen, wie Labore sie schreiben.
- **Terminologieserver im Validator.** Macht Prüfung und CI vom Netz abhängig und bringt
  Bindungsprüfungen für ICD-10-GM und KBV-Codesysteme mit, für die kein öffentlicher Server alles
  kennt (ENTWICKLUNG, „Nicht abgedeckt").

## Folgen

▸ Der Laborbefund ist ohne Pauschalausnahme geprüft; eine neue Abweichung meldet der Validator.
Ändert der Ballot die Regeln, entfallen Umweg und Ausnahmen — beides steht an einer Stelle
(`laborbefund.ts`, `werkzeuge/fhir-validator.json`).
