# 0041 — FHIR-Validator in der CI: auf jedem Branch, vor jeder Veröffentlichung

**Datum:** 16.10.2026 · **Status:** angenommen · **ergänzt:** 0025, 0040

## Zusammenhang

Seit der Kalibrierung am 15.10.2026 endet `npm run fhir:validieren` ohne Fehler und lässt jeden
neuen Fehler scheitern (ADR 0040). In der CI blieben vier Lücken:

- Der Workflow lief nur auf `main` und bei Pull Requests. Ein gepushter Branch ohne Pull Request
  bekam keine Rückmeldung.
- Die Veröffentlichung auf GitHub Pages wartete nicht auf den Validator. Eine Fassung mit
  fehlerhaften FHIR-Ausgaben konnte öffentlich werden.
- Das Ergebnis lag nur im Protokoll und im Artefakt. Wer einen Pull Request ansieht, sah es nicht.
- Der Validator wurde bei jedem Lauf frisch geladen, ohne Prüfung, ob es die erwartete Datei ist.

Dazu kam ein Befund am Laborbefund: Die gematik-Codesysteme der Kennungsart und der
Untersuchungsgruppe stehen im Terminologiepaket `de.gematik.terminology`, das weder das Laborpaket
noch TI Common als Abhängigkeit führt (SPEZIFIKATION 5.5, Befund 4). Ohne dieses Paket prüft der
Validator diese Codes nicht.

## Entscheidung

1. **Der Workflow läuft bei jedem Push auf jeden Branch**, dazu bei Pull Requests aus Forks. Pull
   Requests aus dem Repository sind über den Push schon geprüft; ein zweiter Lauf entfällt.
2. **Veröffentlicht wird nur, was der Validator ohne Fehler geprüft hat:** Der Job „Auf GitHub
   Pages veröffentlichen" hängt an „Gehostete Fassung bauen" **und** an „FHIR-Validator".
3. **Feste Fassung mit Prüfsumme:** Version und SHA-256 des Validators stehen im Workflow. Die Datei
   kommt aus dem Cache oder von GitHub und wird vor dem Lauf geprüft.
4. **Ergebnis sichtbar am Lauf:** Das Skript schreibt die Zusammenfassung — Dateien, Fehler,
   Warnungen, Ausnahmen mit Trefferzahl — auf die Seite des Laufs. Jeder verbleibende Fehler wird
   eine Anmerkung (höchstens 50), der vollständige Bericht bleibt Artefakt.
5. **Überholte Ausnahmen werden gemeldet:** Eine Ausnahme ohne Treffer lässt den Lauf nicht
   scheitern, erscheint aber als Warnung. Behebt der Ballot einen Fehler, fällt das auf.
6. **Terminologiepaket ausdrücklich laden:** `de.gematik.terminology` 1.1.0-ballot.2 steht in der
   Paketliste der Konfiguration.

## Verworfene Alternativen

- **Nur Pull Requests prüfen.** Bliebe es dabei, sähe niemand ein Ergebnis für einen gepushten
  Branch, bevor er einen Pull Request öffnet.
- **Bei Pull Requests aus dem Repository zusätzlich laufen.** Doppelte Läufe für denselben Commit
  ohne zusätzlichen Erkenntnisgewinn.
- **Validator informativ** (`continue-on-error`). So war es bis zur Kalibrierung; danach hätte es
  jede neue Abweichung verdeckt.
- **Immer die neueste Fassung des Validators.** Nicht reproduzierbar: Eine neue Fassung kann neue
  Fehler melden, ohne dass sich an der Demo etwas geändert hat.
- **Terminologieserver in der CI.** Macht die Prüfung vom Netz abhängig, schickt die Ausgaben nach
  außen und kennt die deutschen Codesysteme nicht vollständig (ENTWICKLUNG, „Nicht abgedeckt").

## Folgen

- Die Veröffentlichung wartet zusätzlich auf den Validator. Lokal braucht er rund 40 Sekunden,
  dazu kommen Installation und Tests.
- Eine neue Validator-Fassung braucht zwei Änderungen an einer Stelle: `VALIDATOR_VERSION` und
  `VALIDATOR_SHA256` im Workflow, dazu die Angabe in ENTWICKLUNG.
- ▸ Wer „FHIR-Validator" als erforderliche Prüfung für `main` einträgt (Einstellungen des
  Repositorys, Schutz des Branches), macht ihn auch für das Zusammenführen verbindlich.
