# 0028 — Verlauf der Karteikarte nach Besuchen

**Datum:** 30.09.2026 · **Status:** angenommen · **baut auf:** 0020

## Zusammenhang

Die Karteikarte zeigte jeden Eintrag als eigenen Block. An einem Tag mit Notiz, Diagnose,
Rezept und Dokument ergaben sich vier Blöcke ohne erkennbaren Zusammenhang.

## Entscheidung

1. Der Verlauf fasst **je Kalendertag einen Block** zusammen. Ein Tag mit Termin oder eigener
   Notiz ist ein **Besuch**, ein Tag nur mit Befunden oder Einträgen anderer Einrichtungen ein
   **Eingang**.
2. Im Block stehen die Einträge nach Art gruppiert: Notizen, Diagnosen, Allergien, Impfungen,
   Medikationsplan, Rezepte, Labor, Dokumente. Der Kopf nennt Datum, Termin, dokumentierende
   Personen und wie viele Einträge aus der ePA kamen oder in sie gingen.
3. Ein **Termin von heute** erscheint als Block, bevor etwas dokumentiert ist. Was während des
   Besuchs entsteht — Notiz, strukturierter Eintrag, Dokument, Rezept —, erscheint in diesem
   Block.
4. Die Filter wirken innerhalb der Blöcke; ein Block ohne passenden Eintrag entfällt.

## Begründung

▸ So denkt eine Praxis: in Kontakten, nicht in Datensätzen. Der Block zeigt, was bei einem Besuch
entschieden wurde, und macht strukturierte Einträge und Notizen zu einem Verlaufseintrag, ohne
dass jemand ihn zusammenschreiben muss.

## Verworfen

**Besuch als eigener Datensatz, den die Praxis eröffnet und schließt** — genauer bei mehreren
Kontakten am Tag, aber ein zusätzlicher Schritt. Solange die Demo keinen Behandlungsfall kennt,
genügt der Tag.
