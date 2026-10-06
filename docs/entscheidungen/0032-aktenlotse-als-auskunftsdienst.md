# 0032 — ✦ Aktenlotse: ein Auskunftsdienst ohne eigene Rechte

**Datum:** 05.10.2026 · **Status:** angenommen · **baut auf:** 0013, 0017, 0018, 0021, 0025

## Zusammenhang

Die ePA füllt sich schneller, als sie lesbar wird. Zwei Befunde stehen nebeneinander:

- Ein Jahr nach dem bundesweiten Start liegen rund 73 Millionen Akten und über 100 Millionen
  Dokumente vor; gut die Hälfte sind Befunde, Berichte und Arztbriefe — längere Fließtexte,
  überwiegend als PDF.
- Nach HLS-GER 2 haben 58,8 % der Bevölkerung eine eingeschränkte Gesundheitskompetenz, am
  geringsten bei Älteren, chronisch Kranken und Menschen mit Migrationserfahrung — also bei
  genau den Personen mit den meisten Dokumenten in ihrer Akte.

Die Demo bildet die **Volltextsuche** über `_content` bereits ab (ITI-67). Sie findet Dokumente.
Sie beantwortet keine Frage nach einem Verlauf über mehrere Befunde hinweg, und sie hilft niemandem
beim Verstehen des gefundenen Textes.

Zugleich stößt die Demo an eine Grenze, die keine Spezifikation auflöst: Was als PDF in der Akte
liegt, erreicht weder die Patient Summary noch eine strukturierte Liste. Für den eingescannten
Vorbefund und den eArztbrief mit der Echokardiographie gilt das heute schon (ADR 0031, Folgen).

## Entscheidung

1. Ein ✦ **Aktenlotse** als Dienst der Telematikinfrastruktur, ab dem neuen Ausbaustand
   **„Weiterentwicklung 4"** (`weiterentwicklung-4`, Stufe 4; seit ADR 0034). Basis `/epa/vorschlag/aktenlotse/api/v1`
   mit `metadata`, `frage`, `kontext` und `vorschlaege`. **Kein FHIR:** Der Dienst bildet keine
   Ressource ab, sondern gibt Auskunft über vorhandene.
2. **Vier Prinzipien tragen den Entwurf** und sind im Code umgesetzt, nicht nur beschrieben:
   - _Keine eigenen Rechte._ Der Dienst hängt an derselben Prüfkette wie jeder andere ePA-Weg
     (`wege.ts`) und liest nur die Akte aus `x-insurantid`, und dort nur, was im Ausbaustand
     sichtbar ist. Eine Auswertung über Akten hinweg gibt es nicht.
   - _Die Daten bleiben drin._ Auswertung im Dienst, kein Schreibweg, nichts wird gespeichert.
   - _Belegpflicht._ Jede Aussage trägt die Zeile, aus der sie stammt, samt Dokument. Die
     Antwortbildung in `kern/fachlogik/lotse.ts` kann keinen freien Text erzeugen.
   - _Keine Bewertung._ Keine Diagnose, keine Therapie, keine Triage, keine Prognose, kein Score.
3. **Umfangsangabe an jeder Antwort:** wie viele Quellen gelesen wurden und welche nicht, mit
   Grund. Der Startbestand führt dafür einen eingescannten Vorbefund ohne Textebene.
4. **Zwei Lesarten** derselben Antwort: `fach` wie im Dokument, `alltag` mit der Umschreibung
   hinter dem Fachbegriff. Der Fachbegriff bleibt stehen. Glossar als Katalogauszug in
   `kern/kataloge/alltagssprache.ts`, ⚠ nicht gegen eine Terminologie geprüft.
5. **Zwei Sichten, ein Dienst.** Die ✦ **Versichertensicht** unter `/versicherte` ist als **FdV**
   aufgebaut: Die Akte besteht aus Bereichen, Einstieg ist die Dokumentenliste (ITI-67, Inhalt über
   ITI-68), und der Lotse ist **ein Bereich unter anderen**, gekennzeichnet als neu. Seine
   Quellenangaben öffnen das Dokument im Bereich „Dokumente", nicht in einem eigenen Fenster.
   Die **Praxissicht** steht im Reiter der Patientenkartei, in aufklappbaren Abschnitten mit Zähler;
   offen ist, was Handlungsbedarf trägt. Ohne Befugnis zeigt sie nicht den Fehler der ePA, sondern
   die Schaltfläche „eGK einlesen". Dazu drei umschaltbare Berechtigungen: eigene Akte, Vertretung,
   Vertretung entzogen.
6. **Zweiter Zugangsweg im Simulator.** Versicherte kommen nicht über die Befugnis einer
   Einrichtung an ihre Akte. Der Simulator akzeptiert deshalb neben einer gültigen Befugnis den
   ✦ Versichertenzugang über die Kopfzeile `x-demo-versicherte`, geprüft gegen `x-insurantid`.
   ⚠ Demo-Ersatz für GesundheitsID und Vertretungsverwaltung, keine ePA-Schnittstelle.
7. **Der Standard-Ausbaustand bleibt die aktuelle Spezifikation** (`release-3.1.3`). Der Lotse ist
   ein Vorschlag; er erscheint erst, wenn die Demo-Steuerung auf Stufe 4 steht — Reiter,
   Kopfschaltfläche und Navigationspunkt zur Versichertensicht ebenso. Prüfungen, die ✦ Dienste
   brauchen, stellen den Ausbaustand seither ausdrücklich ein, statt sich auf einen Standard zu
   verlassen.
8. **Die Antwort steht in zusammenhängenden Sätzen**, nicht in Zitaten. Die Quellenangabe steht
   einmal je Unterlage und führt über `…/quelle/{id}` zum Nachlesen. Quellen sind die sichtbaren
   Dokumente und der Medikationsplan — der Grund einer Verordnung steht nur dort.

## Begründung

▸ **Die Prinzipien sind die Idee, nicht das Kleingedruckte.** Eine zentrale KI auf Gesundheitsdaten
scheitert nicht an der Sprachleistung, sondern an der Frage, was sie sehen darf. Prinzip 1 beantwortet
sie konstruktiv statt vertraglich: Der Dienst bekommt Quellen übergeben und ermittelt selbst keine.

▸ **Prinzip 4 ist die Zweckbestimmung**, und die entscheidet über die regulatorische Einordnung.
Ein Dienst, der findet und umformuliert, aber nicht bewertet, bleibt auf der anderen Seite der
Medizinproduktegrenze. Deshalb steht die Liste der Dinge, die er nicht tut, in `metadata`.

▸ **Der Lotse tritt nicht an die Stelle der Akte.** Deshalb ist er im FdV ein Bereich neben der
Dokumentenliste und nicht die Anwendung selbst, und deshalb führen seine Quellenangaben dorthin. Wer
eine Antwort bekommt, soll zwei Klicks später im Dokument stehen — nicht in einer zweiten Welt, die
der Lotse sich gebaut hat.

▸ **Vier Dinge auf einmal sind drei zu viel.** Kontext, Auffälligkeiten, Antwort und Vorschläge
nebeneinander ergaben eine Wand, die in einer Sprechstunde niemand liest. Die Abschnitte tragen ihren
Zähler im Kopf: Er sagt ohne Aufklappen, ob sich das Öffnen lohnt.

▸ **Sätze statt Zitate.** Eine Antwort, unter der jeder Satz sein Zitat trägt, liest sich wie ein
Fußnotenapparat — und niemand liest sie. Der Lotse formuliert deshalb und verweist; wer prüfen will,
öffnet die Unterlage. Die Belegbarkeit geht dabei nicht verloren: Ein Absatz ohne Quelle kann nicht
entstehen, und die Quelle ist einen Klick entfernt.

▸ **Die Umfangsangabe ist keine Fußnote.** Die Belegpflicht fängt erfundene Aussagen ab; sie fängt
nicht ab, dass eine Antwort einen relevanten Befund nicht nennt und trotzdem vollständig wirkt.
Auslassung ist das größere Risiko als Erfindung.

▸ **Regelbasiert statt mit Sprachmodell.** Geprüft werden soll der Umgang — Belegführung,
Umfangsangabe, Rechteerbung, Grenze zur Bewertung —, nicht die Sprachleistung. Ein echter Dienst
bediente dieselbe Schnittstelle mit einem Modell, das innerhalb der TI läuft. Die Demo bliebe
davon unberührt.

## Folgen

Für Frau Hoffmann beantwortet der Lotse den Verlauf der Nierenfunktion über zwei Laborbefunde
(eGFR 46 → 38) mit je zwei Belegen und meldet „6 von 7 Unterlagen gelesen" (seit ADR 0033; vorher 4 von 5), weil der eingescannte
Vorbefund keine Textebene hat. Der Abgleich zwischen Entlassbrief und Medikationsplan findet genau
eine Abweichung: Metformin steht im Brief und nicht im Plan — die Lücke, die der Startbestand
bewusst führt. Aus dem eArztbrief der Kardiologie schlägt er die Echokardiographie als Prozedur
vor; sie erreicht die Patient Summary bis heute nicht.

⚠ Der Lotse ist **nicht spezifiziert** und bildet keinen Weg der ePA nach. ⚠ Das Glossar ist ein
Auszug. ⚠ Die Erkennung der Frage ist eine kurze, geschlossene Liste; was sie nicht trifft,
beantwortet der Dienst als Stellensuche und sagt das auch.

## Verworfen

**Den Lotsen in die Volltextsuche einbauen** — die Suche ist spezifiziert (ITI-67), ein
Auskunftsdienst ist es nicht. Beides zu mischen verwischte genau die Grenze, auf die es ankommt.

**Die Belegzeile unter jedem Satz** — die erste Fassung tat das. Sie war prüfbar und unlesbar: Im
Gespräch las niemand die Antwort, sondern alle die Zitate. Der Dokumentverweis mit einem Weg zum
Öffnen hält beides — Lesefluss und Nachprüfbarkeit.

**Die Versichertensicht als eigenes Paket** — sauberer getrennt, aber im Pitch und im Gespräch wird
der Entwurf erst nebeneinander verständlich: derselbe Dienst, dieselben Quellen, andere Sprache.

**Die Versichertensicht als reine Lotsen-Oberfläche** — die erste Fassung war das, und sie stellte
den Lotsen über die Akte. Eine versicherte Person öffnet ihre ePA nicht, um mit einem Dienst zu
sprechen, sondern um ihre Unterlagen zu sehen. Der Lotse ist eine Hilfe dabei, kein Ersatz dafür.

**Den Fehler der ePA stehen lassen, wenn die Befugnis fehlt** — technisch richtig und praktisch
nutzlos: Wer `notEntitled` liest, braucht keine Diagnose, sondern die Karte.

**Vorschläge selbsttätig in die Listen schreiben** — widerspricht Prinzip 4 und der Festlegung, dass
die Listen ärztlich verantwortet sind (ADR 0018). Vorschläge bleiben Vorschläge; bestätigen muss sie
ein Mensch, und die Herkunft bleibt am Eintrag sichtbar.
