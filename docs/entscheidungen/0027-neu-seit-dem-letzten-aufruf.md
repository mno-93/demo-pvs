# 0027 — „Neu seit dem letzten Aufruf" für Patient Summary und Listen

**Datum:** 30.09.2026 · **Status:** angenommen · **baut auf:** 0021, 0026

## Zusammenhang

Wer eine Akte wieder öffnet, will wissen, was sich seitdem geändert hat — besonders, was andere
Einrichtungen eingetragen haben. Die ePA benachrichtigt Leistungserbringer nicht; Push-Nachrichten sind nach dem Konzept 3.1.3 nur für Versicherte über das ePA-FdV vorgesehen. Sie liefert aber
je Eintrag eine Kennung, eine Fassung (`meta.versionId`) und über die Änderungseinträge
(Provenance) die Einrichtung der letzten Änderung.

## Entscheidung

1. Das PVS merkt sich **je Person und Sicht** — Patient Summary, Diagnosenliste, Allergienliste,
   Impfliste — den **Fassungsstand**: Kennung und Fassung jedes Eintrags und den Zeitpunkt des
   Aufrufs. Beim nächsten Aufruf vergleicht es die Antwort der ePA mit diesem Stand.
2. Gemeldet werden nur Änderungen **anderer Einrichtungen**: neue Einträge, neue Fassungen,
   entfallene Einträge. Eigene Schreibungen zählen nicht.
3. Die Sicht zeigt ein Band „Seit dem letzten Aufruf am …: n neu · n geändert" und am Eintrag die
   Marke **neu** oder **geändert**. Der Vergleich gilt für die Dauer der Ansicht; danach ist der
   neue Stand der gesehene.
4. Beim ersten Aufruf gibt es keinen Vergleich und kein Band.
5. Die Demo-Steuerung kann eine **andere Einrichtung eintragen lassen**, damit sich das vorführen
   lässt.

## Begründung

▸ Der Vergleich braucht nichts, was die ePA nicht schon liefert. Er funktioniert für die
Patient Summary genauso wie für jede Liste, weil die Patient Summary aus Einträgen der Listen und
Dienste besteht und deren Kennungen und Fassungen mitträgt.

▸ Nur fremde Änderungen zu melden trifft die Frage, die sich beim Öffnen stellt: Was weiß ich
noch nicht?

## Folgen

Der Stand liegt im Praxissystem, nicht in der ePA. Ein anderes Primärsystem derselben Einrichtung
oder ein Arbeitsplatz ohne diesen Stand sieht beim ersten Aufruf kein Band. Entfallene Einträge
lassen sich nur zählen, weil die ePA sie nicht mehr liefert.

✦ Serverseitige Wege, die den Vergleich vereinfachen würden, sind nicht spezifiziert und stehen in
der Spezifikation (Abschnitt 7.7): ein Parameter „seit" an den Listenoperationen, eine Operation
„Änderungen seit" auf Grundlage der Änderungseinträge oder eine Benachrichtigung für
Leistungserbringer.

## Verworfen

**Vergleich über den Zeitpunkt der letzten Änderung** — scheitert an abweichenden Uhren und
erkennt entfallene Einträge nicht. **Stand in der ePA ablegen** — wäre eine neue, nicht
spezifizierte Schreibung für eine Anzeigefrage des Primärsystems.
