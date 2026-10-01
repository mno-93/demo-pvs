# 0022 — ✦ Relevanz für die Patient Summary als Markierung am Listeneintrag

**Datum:** 29.09.2026 · **Status:** angenommen für die Demo · **Kennzeichnung:** ✦ Vorschlag, nicht
spezifiziert · **ändert:** 0021 (Auswahl der Einträge)

## Zusammenhang

Nach 0021 zeigte die Patient Summary alle gültigen, aktuellen Einträge der Allergien- und der
Diagnosenliste. Damit war die Liste zugleich die Auswahl: Wer einen Eintrag in der Liste führen
wollte, ohne ihn in der Übersicht zu haben, konnte das nicht. Die Listen sollen aber vollständig
sein — sie sind die zentrale Quelle für alle Einrichtungen —, und die Übersicht soll kurz sein.

## Entscheidung

1. Jeder Eintrag der Allergien- und der Diagnosenliste trägt optional die Markierung
   **„relevant für die Patient Summary"** (Extension `ps-relevant`, `valueBoolean`).
2. Gesetzt wird sie beim Anlegen im Eintrag oder danach über eine eigene Operation
   `$flag-condition-entry` / `$flag-allergy-entry` — mit Lesenachweis, Organisation und
   Änderungseintrag wie jede Schreibung. Sie gilt einrichtungsübergreifend.
3. Die Patient Summary zeigt nur markierte, gültige Einträge. Die Zahl der übrigen steht an der
   Section (`ps-section-further-entries`) und im Block, mit Sprung in die vollständige Liste.
4. Im PVS: Schalter ★ „Patient Summary" an jedem Listeneintrag im Splitscreen; in der
   Erfassungsmaske ein zweites Kästchen unter der Listenaufnahme, vorbelegt für Dauerdiagnosen
   und jede Allergie. Eine Farbe (Violett) und ein Zeichen (★) nur für die Patient Summary.
5. Für den Medikationsplan gibt es keine Markierung: Der Plan ist bereits die ärztlich
   verantwortete Auswahl aus der Medikationsliste.

## Begründung

▸ Liste und Übersicht beantworten verschiedene Fragen: „Was ist bekannt?" und „Was muss jemand,
der die Person nicht kennt, zuerst wissen?". Eine Markierung trennt beides, ohne Daten zu
verdoppeln. Die Markierung am Eintrag in der ePA — statt im Primärsystem — macht die Auswahl für
jede befugte Einrichtung sichtbar und änderbar; der Lesenachweis verhindert, dass zwei
Einrichtungen sich unbemerkt überschreiben.

▸ Die Vorbelegung trifft den Regelfall: Dauerdiagnosen und Allergien sind fast immer relevant,
Akutdiagnosen selten. Damit kostet die Auswahl im Regelfall keinen Klick.

## Verworfen

**Liste gleich Auswahl (bisher)** — zwingt, unwichtige Einträge aus der zentralen Liste
herauszuhalten; die Liste wäre dann nicht mehr vollständig.
**Markierung nur im Primärsystem** — andere Einrichtungen sähen die Auswahl nicht; die Patient
Summary hinge davon ab, wer zuletzt geschrieben hat.
**Markierung über `$update-…-entry`** — möglich, aber es vermischt eine Relevanzentscheidung mit
einer fachlichen Änderung des Eintrags und erzeugt beim Abgleich unnötige Zustände
„in der ePA geändert".
**Eigene Relevanzliste neben den Listen** — ein zweiter Bestand, der mit den Listen abgeglichen
werden müsste.

## Offen

Wer markieren darf (Berufsgruppen), ob eine Markierung verfallen soll, ob Patientinnen und
Patienten selbst markieren oder ausblenden dürfen.
