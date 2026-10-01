# 0031 — ✦ Prozeduren und Implantate automatisch aus strukturierten Dokumenten

**Datum:** 01.10.2026 · **Status:** angenommen · **ergänzt:** 0021

## Zusammenhang

Die Patient Summary zeigte Prozeduren und Implantate immer als „Information nicht verfügbar"
(Quelle „keine"). Dabei enthält der strukturierte Entlassbrief eine Prozedur — die Kardioversion
(OPS 8-640) —, und die Ansicht „Inhalte aus Dokumenten" im PVS las sie bereits aus. Für Laborwerte
übernimmt der Dienst schon heute automatisch aus strukturierten Befunden. Die EPS verlangt beide
Abschnitte (1..1) mit Einträgen nach `procedure-eu-eps` bzw. `deviceUseStatement-eu-eps`.

## Entscheidung

1. Der Dienst der Patient Summary übernimmt **Prozeduren** (`Procedure`) und **Implantate**
   (`DeviceUseStatement` mit `Device`) automatisch aus allen sichtbaren strukturierten Dokumenten —
   nach demselben Muster wie die Laborwerte. Quelle: „strukturierte Dokumente · automatisch".
2. Jeder Eintrag trägt einen Verweis auf sein Quelldokument; derselbe Eintrag aus zwei Dokumenten
   (gleicher Code, gleiches Datum) erscheint einmal.
3. Unstrukturierte Dokumente (PDF, eArztbrief ohne Einträge) tragen nichts bei. „In Dokumenten
   suchen" bleibt deshalb auch neben automatisch übernommenen Einträgen.
4. Das gilt in beiden Betriebsarten der Patient Summary („geführt" und „nur automatisch"), weil es
   für beide Abschnitte keine geführte Quelle gibt.
5. Der strukturierte Entlassbrief des Startbestands führt zusätzlich ein Implantat (Zweikammer-
   Schrittmacher seit 2019); der PDF-Brief nennt Prozedur und Implantat im Text.

## Begründung

▸ Was strukturiert in der Akte liegt, soll die Übersicht ohne zusätzlichen Schritt erreichen — der
Kern des Quick Win „automatisch beginnen". Prozeduren und Implantate eignen sich dafür besonders:
Sie werden von der durchführenden Einrichtung ohnehin dokumentiert, und eine Relevanzauswahl wie bei
Diagnosen braucht es kaum.

▸ Der Unterschied zu Diagnosen und Allergien bleibt: Für sie gibt es zentrale, geführte Listen;
übernommene Dokumenteinträge wären dort Abzüge ohne ärztliche Verantwortung.

## Folgen

Mit Listen zeigt die Patient Summary für Frau Hoffmann sieben von acht Abschnitten, nur aus
automatischen Daten vier (Medikation, Laborwerte, Prozeduren, Implantate). Die Kardiologie-
Befunde (eArztbrief) bleiben ohne Beitrag — die Echokardiographie steht nur im Text.

⚠ Die übernommenen Ressourcen tragen ihre ursprünglichen Profile, nicht die der EPS; nicht gegen
die EPS validiert. ⚠ SNOMED CT 14106009 im Beispiel nicht gegen einen Terminologieserver geprüft.

## Verworfen

**Weiter „keine Quelle"** — unterschlägt, was strukturiert vorliegt, und verfälscht den Vergleich
zur automatisch gebildeten Patient Summary. **Prozeduren im PVS zusammenführen statt im Dienst** —
jede Praxis müsste jedes Dokument abrufen und zerlegen; die Übersicht entstünde in jedem System
anders. **Section-Eintrag als Verweis auf das Dokument (`DocumentReference`)** — von der EPS erlaubt
und für unstrukturierte Briefe denkbar, aber ohne strukturierten Inhalt nicht automatisch
zuordenbar; bleibt eine offene Frage (Spezifikation 7.6).
