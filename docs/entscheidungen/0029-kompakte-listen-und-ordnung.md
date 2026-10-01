# 0029 — Kompakte Listen und ihre Ordnung

**Datum:** 30.09.2026 · **Status:** angenommen · **baut auf:** 0018, 0022

## Zusammenhang

Im Splitscreen „Diagnosen und Allergien" zeigte jeder Eintrag alle Angaben zugleich: Codes,
Status, Zeitraum, Notiz, Herkunftszeile, Schalter und Knöpfe. Bei mehr als einer Handvoll
Einträgen war die Liste kaum zu überblicken. Geordnet war sie nach „gegenwärtig vor vergangen",
dann alphabetisch — neue Einträge anderer Einrichtungen standen irgendwo.

## Entscheidung

1. **Jeder Eintrag ist eine kompakte Zeile:** Bezeichnung, darunter ICD-10-GM, Dauer oder Akut und
   Zeitraum (Diagnosen) bzw. Typ, Gewissheit und Kritikalität (Allergien). Sichtbar bleiben, was
   ohne Aufklappen zählt: Marke **neu**, Schalter ★ „Patient Summary", Zustand des Abgleichs und
   die Handlungen dazwischen.
2. **Ein Klick auf die Bezeichnung klappt die Zeile auf** — auf beiden Seiten des Splitscreens
   zugleich: SNOMED CT, klinischer Status, Sicherheit, Notiz, Herkunftszeile, „bearbeiten",
   „berichtigen …". „alle aufklappen" öffnet die ganze Liste.
3. **Voreingestellt ist das Datum der Einstellung, der jüngste Eintrag zuerst.** Eingestellt ist
   ein Eintrag der ePA, wenn er in die Liste kam (erster Änderungseintrag); ein Eintrag nur der
   Praxis, wenn er dokumentiert wurde. Das Datum steht in der Mitte jeder Zeile.
4. **Die Praxis kann umstellen:** älteste zuerst, nach Beginn, nach Bezeichnung oder eine
   **eigene Reihenfolge** — durch Ziehen der Zeile oder mit ↑ ↓. Neue Einträge erscheinen bei
   eigener Reihenfolge oben, damit sie nicht am Ende verschwinden.
5. Die Ordnung gilt je Person und Liste, im Splitscreen wie in der Lesesicht des ePA-Fensters.
   Sie ist eine Ansicht des Praxissystems: Sie geht nicht in die ePA und zählt nicht als Handlung.
   Ein Eintrag behält seinen Platz, wenn er aus der Praxis in die ePA geht — die Ordnung kennt ihn
   unter beiden Kennungen.

## Begründung

▸ Die Liste wird gelesen, bevor sie bearbeitet wird. Kompakte Zeilen zeigen den Bestand auf einen
Blick; wer abgleicht, klappt auf. Das Einstelldatum beantwortet die Frage, die beim Öffnen zuerst
kommt: Was ist zuletzt hinzugekommen?

▸ Eine eigene Reihenfolge bleibt lokal, weil jede Einrichtung anders gewichtet. Was für alle gilt,
drückt die Relevanzmarkierung aus (ADR 0022).

## Verworfen

**Reihenfolge in die ePA schreiben** — eine zusätzliche, nicht spezifizierte Schreibung für eine
Anzeigefrage; mehrere Einrichtungen würden sich gegenseitig umsortieren. **Nur `<details>` je
Seite** — links und rechts klappten getrennt auf, der Abgleich einer Zeile wäre auseinandergerissen.
