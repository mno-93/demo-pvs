# 0043 — ✦ Übergabestelle für Strukturierungsdienste: Kodierung, Konfidenz, drei Bänder

**Datum:** 20.10.2026 · **Status:** angenommen · **ergänzt:** 0032

## Zusammenhang

Ausbaustufe S5 des Aktenlotsen schlägt Einträge für die strukturierten Listen vor. Bisher sah
jeder Vorschlag gleich aus: eine Textzeile mit Fundstelle, dazu eine Schaltfläche „Bestätigen", die
nichts schreibt. Damit fehlte der Demo genau die Stelle, an der sich entscheidet, ob aus einem
erkannten Satz je ein Eintrag wird.

Diese Stelle wird absehbar wichtig. Öffentlich geförderte Vorhaben arbeiten daran, Volltext
medizinischer Dokumente mit Sprachmodellen nach FHIR zu überführen — mit Ontologieanbindung und
einem Maß für die Unsicherheit der Extraktion. Was solche Dienste nicht mitbringen können, ist ein
Ort, an den das Ergebnis gehört: ein Berechtigungsmodell, eine Herkunft, ein Mensch, der einsteht.

▸ **Das Spezifikationsobjekt ist deshalb nicht der Extraktor, sondern die Übergabestelle.** Nicht
_wie_ extrahiert wird, sondern **was ein Ergebnis mitbringen muss, damit eine Akte es annehmen
darf.** Das ist herstellerneutral und überlebt jeden Modellwechsel.

## Entscheidung

1. **Jeder Extraktionsvorschlag trägt eine Kodierung oder keine.** Trägt er keine, ist er kein
   Vorschlag für eine Liste. Eine strukturierte Liste kann keinen Freitext halten.
2. **Jeder Vorschlag trägt eine Konfidenz** (0 bis 1) mit benanntem Verfahren.
3. **Die Konfidenz entscheidet, was angeboten wird — nicht, ob geschrieben wird.** Geschrieben wird
   nie ohne einen Menschen. Drei Bänder:

   | Band           | Lage                                  | Oberfläche                                           |
   | -------------- | ------------------------------------- | ---------------------------------------------------- |
   | `uebernehmbar` | Kodierung vorhanden, Konfidenz ≥ 0,8  | Vorschlag mit Schaltfläche „In die Liste"            |
   | `zu-pruefen`   | Kodierung vorhanden, Konfidenz ≥ 0,5  | Vorschlag ohne Schaltfläche; führt ins Dokument      |
   | `nur-gemeldet` | keine Kodierung, oder Konfidenz < 0,5 | kein Listenvorschlag, nur ein Hinweis mit Fundstelle |

4. **Das Band steht am Eintrag**, mit Kodiersystem und Konfidenz. Der Kode selbst steht bei
   Diagnosen ohnehin im Text; das Band nennt deshalb das System.
5. **Die Kodierung kommt aus dem Quelltext oder aus einer veröffentlichten Werteliste.** Steht ein
   ICD- oder OPS-Kode im Brief, wird er übernommen. Steht nur eine Substanz im Klartext, wird sie
   gegen die Allergie-Werteliste des Zentralen Terminologieservers gesucht.
6. **Übernehmbar heißt kodiert _und_ mit Ziel.** Eine Prozedur kann einen OPS-Kode tragen und
   trotzdem nirgends hingehören — der ✦ Diagnose-Service führt Diagnosen und Allergien, keine
   Prozeduren. Solche Vorschläge zeigen statt der Schaltfläche den Zustand „keine Liste in der ePA".
7. **Die Übernahme schreibt wirklich** — über `$add-condition-entry` mit dem Lesenachweis der
   Liste, verantwortlich ist die angemeldete Person. Am Eintrag bleibt in der Herkunft sichtbar,
   dass er maschinell vorgeschlagen wurde und aus welcher Unterlage. Danach liest der Lotse neu;
   der übernommene Vorschlag verschwindet aus der Liste der offenen Vorschläge.

## Begründung

▸ **Das dritte Band ist das wichtigste und wird am leichtesten vergessen.** Ohne es läuft eine Liste
mit Halbsicherem voll, und die Grenze der Extraktion verschwindet. Mit ihm ist sie sichtbar: Der
Befund steht da, er ist auffindbar, und er wird trotzdem nicht angeboten. Das ist die Entsprechung
der Umfangsangabe auf der Schreibseite — die gefährlichste Antwort ist die, die vollständig wirkt,
und der gefährlichste Vorschlag ist der, der eintragbar aussieht.

▸ **Ohne Kodierung kein Eintrag — und das trifft eine Infrastrukturfrage.** Dass die Allergien des
Entlassbriefs überhaupt kodierbar sind, liegt an einer veröffentlichten Werteliste. Die
Echokardiographie des eArztbriefs bleibt unkodiert und damit außen vor. Ein Strukturierungsdienst
hängt deshalb an derselben Voraussetzung wie jeder Kodierdienst: an einem erreichbaren
Terminologiedienst. ⚠ Ob der Zentrale Terminologieserver als Laufzeitdienst gedacht ist oder nur
als Referenzquelle für Spezifikationen, ist nicht geprüft.

▸ **Bestand ist nicht Auswahl.** Der Vorschlag hebt, was im Dokument steht. Er trifft keine Aussage
darüber, ob der Eintrag in die Patient Summary gehört — dafür gibt es die Relevanzmarkierung, und
die bleibt ärztlich (ADR 0018, 0022). Ohne diese Unterscheidung wäre ein Strukturierungsdienst eine
automatische Befüllung in neuem Gewand.

## Folgen

Für Frau Hoffmann entstehen aus den sichtbaren Unterlagen Vorschläge in allen drei Bändern: ICD-
kodierte Diagnosen und OPS-kodierte Prozeduren als übernehmbar, die beiden Unverträglichkeiten über
die SNOMED-CT-Werteliste als zu prüfen, die Echokardiographie-Befunde ohne Kode als nur gemeldet.

⚠ Die Extraktion bleibt **regelbasiert**, und die Konfidenz ist **abgeleitet, nicht gemessen**: Ein
ausgeschriebener Kode zählt mehr als ein über eine Werteliste gefundener, dieser mehr als bloße
Texterkennung. Geprüft werden soll die **Übergabe**, nicht die Erkennung — dieselbe Trennung wie
beim Auskunftsdienst, und der Grund, warum die Demo ohne Sprachmodell etwas aussagt.

▸ **Die Kette ist damit geschlossen:** Vorschlag → Übernahme → Diagnosenliste → Patient Summary.
Die Echokardiographie des eArztbriefs, die bisher nirgends ankam, steht nach einem Klick in der
Liste — sofern sie kodiert ist. Ist sie es nicht, wird sie gemeldet und bleibt draußen, und genau
das ist die Aussage.

⚠ Vorschläge der Allergienliste bleiben im Band „zu prüfen" und werden deshalb nicht übernommen,
obwohl eine Liste dafür bestünde. Das ist beabsichtigt: Eine über eine Werteliste gefundene
Substanz ist nicht dasselbe wie ein im Dokument ausgeschriebener Kode.

## Verworfen

**Die Konfidenz über das Schreiben entscheiden lassen** — ein Schwellwert, ab dem automatisch
eingetragen wird, wäre die bequeme Lösung und genau der Bruch mit Prinzip 4. Die Verantwortung
bekäme keinen Namen.

**Vorschläge ohne Kodierung unterschlagen** — dann sähe die Liste sauber aus, und niemand wüsste,
dass im Dokument etwas steht, das nirgends ankommt. Melden ohne Anbieten ist die ehrlichere Form.

**Den Kode im Band wiederholen** — er steht bei Diagnosen schon im Text; die Wiederholung machte
die Zeile länger und sagte nichts. Das System ist die Angabe, die fehlt.
