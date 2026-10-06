# 0036 — Grenze zur Bewertung als eigene Antwort; ein Stand für alle Ansichten

**Datum:** 06.10.2026 · **Status:** angenommen · **ergänzt:** 0017, 0032, 0035

## Zusammenhang

Prinzip 4 des ✦ Aktenlotsen — keine Bewertung — war bisher nur daran erkennbar, was er _nicht_
sagte. Eine Frage wie „Werde ich wieder gesund?" landete in der Stellensuche und gab Zeilen wieder,
in denen „wieder" vorkam. Das ist schlechter als eine Ablehnung: Es sieht aus wie eine Antwort.

Bei einer Durchsicht der Zustände nach Interaktionen fielen außerdem Widersprüche auf:

- „Befugnisse entziehen" entzog sie in der ePA, aber das Praxissystem zeigte weiter „ePA-Befugnis
  bis …", das ePA-Fenster „Zugriff besteht" und Daten von vorher — bis zufällig ein Aufruf mit 403
  zurückkam. Die Befugnisliste der Konfiguration blieb nach dem Einlesen einer eGK veraltet.
- Nach Widerspruch gegen den Medikationsprozess las der Lotse den Medikationsplan weiter — den der
  Medication Service mit 423 sperrt — und meldete ohne ihn jedes Mittel als „fehlt im Plan".
- Der Lotse in der Praxis las nach Umstellungen der Demo-Steuerung nicht neu; eine gesperrte Akte
  erschien in der Versichertensicht als „0 Dokumente".

## Entscheidung

1. **Bewertungsfragen sind eine eigene Absicht**, geprüft vor allen anderen. Die Antwort hat keine
   Absätze, sondern einen Hinweis und `grenze: 'bewertung'`. Die Oberfläche zeigt sie mit dem Marker
   „Keine Bewertung", liest sie vor und lässt die Umfangsangabe weg.
2. **Dringlich klingende Fragen** bekommen für Versicherte Notruf 112 und Bereitschaftsdienst
   116 117 vorangestellt — ohne Einstufung.
3. **Befugnisse entziehen = Ablauf der 90 Tage**, in ePA und Praxissystem zugleich; danach fragen
   alle Ansichten neu (`betriebsstandErhoehen`).
4. **Der Lotse folgt jeder Sperre der Quelle**: Ein gesperrter Medikationsplan wird nicht gelesen,
   als übergangen gezählt, und der Abgleich entfällt.
5. **Jede Umstellung liest auch der Lotse neu**; alte Antworten und geöffnete Unterlagen verfallen.
   Eine gesperrte Akte heißt in der Versichertensicht so wie im Praxissystem.

## Begründung

▸ Die Ablehnung ist die sichtbarste Form der Zweckbestimmung (8.7). Eine KI, die an der richtigen
Stelle Nein sagt, ist überzeugender als eine Verbotsliste in der Dokumentation.

▸ „Keine eigenen Rechte" heißt auch: keine Umwege. Was ein Fachdienst sperrt, darf ein Dienst, der
auf ihm aufsetzt, nicht trotzdem lesen — dieselbe Regel hat die Patient Summary schon.

▸ Die Demo-Steuerung ist Kulisse, aber was sie verstellt, muss in jeder Ansicht gleichzeitig
gelten. Sonst zeigt die Demo Widersprüche, die es im Wirkbetrieb nicht gäbe — und lenkt von denen
ab, die sie zeigen soll.

## Folgen

- ⚠ Die Erkennung ist eine Musterliste, kein Sprachverständnis. Sie lehnt im Zweifel eher zu oft ab
  („Ist mein Wert normal?").
- Nach dem Entziehen gibt es je offener Ansicht einen 403 im Aufrufprotokoll — gewollt: So erfährt
  das Praxissystem, was die ePA sagt.

## Verworfen

**Bewertungsfragen in der Stellensuche lassen** — die Stellensuche kann zu einer Bewertungsfrage nur
Zeilen liefern, die wie eine Antwort aussehen.

**Ablehnung als Fehler (4xx)** — sie ist eine reguläre Auskunft des Dienstes, kein Versagen; als
Fehler stünde sie rot da und wäre nicht vorlesbar.

**Nach Befugnisverlust nur das Praxissystem berichtigen, ohne neu zu fragen** — die Ansichten
zeigten weiter Daten, die die ePA nicht mehr herausgibt.
