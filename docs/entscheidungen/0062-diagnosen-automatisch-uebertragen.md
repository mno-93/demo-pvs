# 0062 — ✦ Diagnosen automatisch übertragen: der Gegenentwurf zum geführten Abgleich

**Datum:** 13.11.2026 · **Status:** angenommen für die Demo, zur Diskussion · **Kennzeichnung:** ✦
Vorschlag, nicht spezifiziert · **ergänzt:** 0018, 0022, 0027, 0046

## Zusammenhang

Nach 0018 und 0022 entscheidet die Ärztin je Eintrag, ob eine Diagnose in der Diagnosenliste der ePA
geführt wird und ob sie in die Patient Summary gehört — vorbelegt für Dauerdiagnosen, im Splitscreen
gegen die Liste abgeglichen. Der naheliegende Gegenentwurf kommt ohne diese Entscheidung aus: Das
Praxissystem überträgt seine Diagnosen von selbst, die ePA wird zum gemeinsamen Bestand. Für die
Medikation führt die Demo einen solchen Abgleich bereits (0046).

Ob das trägt, lässt sich nur am selben Bestand vergleichen. Offen sind vor allem vier Fragen:
Was geschieht in einer Praxis, wenn eine andere Einrichtung einen gemeinsamen Eintrag ändert? Was
überträgt der erste Abgleich? Was steht in der Patient Summary, wenn niemand auswählt? Und woran
erkennt die Praxis später, was sie wann gesehen hat?

## Entscheidung

1. **Der Weg der Diagnosen in die ePA ist eine Einstellung des Praxissystems** mit drei Werten
   (Demo-Steuerung „Diagnosen in die ePA“):

   | Weg                              | In die ePA                                               | Aus der ePA                                                                             |
   | -------------------------------- | -------------------------------------------------------- | --------------------------------------------------------------------------------------- |
   | geführt (Standard)               | je Eintrag, vorbelegt (0018, 0022)                       | nur mit Handlung                                                                        |
   | automatisch, nur in die ePA      | von selbst; jede Einrichtung führt ihre eigenen Einträge | nur mit Handlung                                                                        |
   | automatisch, in beide Richtungen | von selbst; je Erkrankung ein Eintrag, der der ePA gilt  | von selbst: fremde Einträge, fremde Änderungen, Berichtigungen; Gleiches wird verknüpft |

   Dazu der **Umfang** der Übertragung: gegenwärtige Dauerdiagnosen oder alle Diagnosen.

2. **Geplant wird im Kern, ausgeführt im Praxissystem.** `kern/fachlogik/listenautomatik.ts` leitet
   aus dem bestehenden Abgleich (`listenabgleich.ts`) ab, was der gewählte Weg ohne Handlung tut.
   Das Praxissystem führt es aus, sobald die Kartei einer Person offen ist und die Listen geladen
   sind — auch wenn niemand die Diagnosen öffnet. Es nutzt nur die Operationen des ✦
   Diagnose-Service aus 0018; ein neuer Weg an der ePA entsteht nicht.

3. **Jeder automatische Schritt wird vermerkt** (`diagnosenautomatik` im Zustand): Zeitpunkt,
   Diagnose, Art des Schritts, Einrichtung und **wann er zum ersten Mal angezeigt wurde**. Das Band
   „Automatische Übertragung“ über den Diagnosen führt die Vermerke. Übertragen und angezeigt sind
   damit zwei Zustände. Automatische Schritte zählen nicht als Handlung der Praxis.

4. **Die Abrechnung zeigt die Folge.** „Diagnosen im Behandlungsfall“ nennt je Diagnose Status und
   Herkunft; was ohne Handlung kam oder sich änderte, ist gekennzeichnet. Schon erfasste Ziffern
   werden gegen den heutigen Diagnosebestand geprüft („Voraussetzung entfallen“).

5. **Die Demo-Steuerung spielt die andere Einrichtung:** „andere Einrichtung beendet
   Dauerdiagnose“ setzt einen Eintrag der Liste auf „behoben“ — mit neuer Fassung, Änderungseintrag
   und neuer Fassung der Liste.

6. **Dritter Weg der Patient Summary:** „Listen ohne Relevanzauswahl“ zeigt jeden gültigen Eintrag
   der Listen. So ist sichtbar, was die automatische Übertragung ohne Markierung in die Übersicht
   bringt.

7. **Im automatischen Weg ist das Kästchen der Erfassungsmaske gesperrt** und nennt den Grund.

## Was die Demo damit zeigt

▸ Bewertung, zur Diskussion gestellt.

- **Nur in die ePA** erzeugt keine Konflikte, aber Doppeleinträge: Dieselbe Erkrankung steht je
  Einrichtung einmal in der Liste, mit unterschiedlicher ICD-10-GM-Tiefe (Frau Hoffmann: E11.74 vom
  Klinikum, E11.90 von der Praxis).
- **In beide Richtungen** erzeugt keine Doppeleinträge, aber fremde Wirkung: Beendet eine andere
  Einrichtung eine Diagnose, ist sie in der Praxis beendet. Die Abrechnungsangaben der Praxis —
  ICD-10-GM, Zusatzkennzeichen, Seite — bleiben, wie sie waren, und passen dann nicht mehr zum
  Status („G“ bei „behoben“).
- **Die Dauerdiagnose ist eine Angabe der Einrichtung.** Sie sagt, dass die Erkrankung dort
  fortlaufend behandelt wird. Ein automatischer Abgleich macht daraus eine Aussage über die Person —
  und aus der Aussage einer anderen Einrichtung eine Diagnose im eigenen Behandlungsfall.
- **Der erste Abgleich überträgt den Bestand ungeprüft**, mit dem Datum der Übertragung.
- **Ohne Vermerk ist nicht belegbar, was die Praxis wann gesehen hat.** Im geführten Weg entsteht
  dieser Beleg nebenbei, weil jede Übernahme eine Handlung ist; im automatischen muss ihn das
  Praxissystem eigens führen.

## Grenzen

- Nur Diagnosen. Allergien und Impfungen bleiben im geführten Weg.
- Der Simulator führt **eine** Liste je Akte. „Nur in die ePA“ zeigt die Doppeleinträge in dieser
  Liste; eine nach Einrichtungen getrennte Ablage bildet er nicht nach.
- Der Vermerk hält fest, wann die Diagnosen geöffnet wurden — nicht, welchen Stand der Liste eine
  einzelne Handlung zugrunde gelegt hat. ⚠ Die Listen der Demo liefern nur den aktuellen Stand;
  einen früheren Stand zu einem Chronologieeintrag, wie ihn `$medication-plan` kennt, gibt es
  für sie nicht.
- Die Abrechnungsprüfung ist stark vereinfacht (`kern/fachlogik/abrechnung.ts`). Sie trägt die
  Vorführung, nicht den Beleg einer Abrechnungsregel.
- ⚠ Welche rechtlichen Anforderungen an das Einstellen ohne ärztliche Handlung bestehen, ist nicht
  geprüft und nicht Gegenstand der Demo.

## Verworfen

**Automatik im Simulator** — die ePA zöge die Diagnosen selbst. Dafür gibt es keine Schnittstelle;
es wäre ein erfundener Weg. Die Übertragung ist Verhalten des Praxissystems gegen den vorhandenen
Dienst.

**Den geführten Weg ersetzen** — der Vergleich am selben Bestand ist der Zweck. Standard bleibt
„geführt“.

**Automatische Schritte als Handlungen zählen** — der Handlungszähler misst, was die Praxis tut.
Gerade dass hier nichts gezählt wird, ist die Aussage; der Vermerk hält fest, was geschah.

**Fremde Änderungen automatisch übernehmen, aber die Abrechnungsangaben mitziehen** — das
Zusatzkennzeichen einer anderen Einrichtung in die eigene Abrechnung zu schreiben, wäre eine
zweite fremde Wirkung. Die Demo lässt die Angaben der Praxis stehen und zeigt den Widerspruch.

## Vorbild und Abgrenzung

Die österreichische e-Diagnose trennt eine „Gesamtansicht“ aller Einträge von einer ärztlich
geführten „Summary-Liste“; Einträge werden dort nur angelegt, nie geändert, und jede Fassung der
Liste bleibt abrufbar (Entwurf des Leitfadens, siehe [QUELLEN.md](../QUELLEN.md)). ▸ Das ist der
geführte Weg mit vollständigem Bestand — keine automatische Übertragung aus den Primärsystemen.
