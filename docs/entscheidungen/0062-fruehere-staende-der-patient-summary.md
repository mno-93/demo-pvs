# 0062 — Frühere Stände und Verlauf der Patient Summary aus den Quellen

**Datum:** 09.11.2026 · **Status:** angenommen · **ergänzt:** 0021, 0027, 0031

## Zusammenhang

Die ✦ Patient Summary ist eine Sicht: Der Dienst bildet sie bei jedem Abruf aus den Diensten der
ePA und speichert sie nicht (7.4). Damit ließ sich nicht sagen, wie sie zu einem früheren Zeitpunkt
aussah, und nicht, wer sie wann geändert hat — beides braucht, wer einer Übersicht vertrauen soll,
etwa nach einem Notfall oder wenn ein Eintrag plötzlich fehlt. Die gematik-EPS hat dieselbe Lücke:
Das Aktensystem erzeugt sie auf Anfrage, „weder gespeichert noch versioniert“ (7.6).

Provenance trugen bis dahin nur die Einträge aus Listen und Medikationsplan. Was der Dienst aus
Dokumenten übernimmt — Laborwerte, Prozeduren, Implantate —, nannte nur sein Quelldokument in einer
Extension.

Die Quellen tragen dagegen ihre Geschichte: Listen und eMP führen Chronologieeinträge mit den
gültigen Einträgen in ihrer damaligen Fassung, dazu ein Fassungsarchiv und Änderungseinträge,
Löschungen eingeschlossen. Der Medication Service liefert daraus schon heute einen früheren Plan
(`$medication-plan` zu einem Chronologieeintrag, IG-MED04510JHX). Dokumente werden nur eingestellt,
nie ersetzt oder gelöscht.

## Entscheidung

1. **Frühere Stände werden gebildet, nicht gespeichert.** `Patient/$summary?_at=<Zeitpunkt>` (✦,
   nach `_history?_at`) bildet die Patient Summary aus dem, was die Quellen damals führten: je
   Liste und eMP der Chronologieeintrag, der zum Zeitpunkt galt, mit den Einträgen in ihrer
   damaligen Fassung; die Medikationsliste über die Fassungen und Löschungen; Dokumente, die bis
   dahin eingestellt waren. `Composition.date` ist der Stand, `Bundle.timestamp` der Abruf.
2. **Verlauf aus denselben Quellen.** `Patient/$summary-log` (✦) nimmt jeden Zeitpunkt, an dem sich
   eine Quelle änderte, bildet die Abschnitte davor und danach und nennt nur, was sich in der Patient
   Summary änderte. Je Änderung eine Provenance: `recorded` (zugleich der Stand für `_at`), die
   Einrichtungen, die Quelle als `entity`, die Einträge als `target` und je Eintrag die Extension
   `ps-change` mit Abschnitt, Art (neu, geändert, entfallen) und Bezeichnung. Derselbe Eintrag aus
   einer anderen Quelle — ein jüngerer Laborwert, der Plan statt der Liste — gilt als geändert.
3. **Provenance auch für Einträge aus Dokumenten:** Quelle das Dokument (`entity.role = source`),
   Urheberin die einstellende Einrichtung, dazu der Dienst als `assembler`. Kein
   EPAActivityProvenance — den Eintrag hat niemand in einem Dienst geschrieben.
4. **Zugriffsregeln gelten beim Lesen.** Widersprüche, Ausbaustand und die Demo-Steuerung „Patient
   Summary aus“ wirken auf jeden Stand wie auf den heutigen.
5. **Im Praxissystem** „Verlauf“ in der Patient Summary; „Stand ansehen“ zeigt einen früheren Stand
   als „Stand vom …“, ohne Sprünge in die Quellen und ohne das Lesezeichen „seit dem letzten
   Aufruf“ zu verschieben.

## Verworfene Alternative

**Jede Fassung der Patient Summary speichern.** Der Dienst legte nach jeder Änderung einer Quelle
eine neue Fassung ab. Das belegte genau, was zu einem Zeitpunkt galt und abgerufen wurde — auch ein
Abruf des NCPeH. Dafür wäre die Patient Summary keine reine Sicht mehr: zwei Bestände, die
auseinanderlaufen können, eine Neuberechnung nach jeder Schreibung in jedem Dienst und die Frage,
wer eine gespeicherte Fassung verantwortet. Der gewählte Weg bleibt bei einem Bestand, braucht aber
lückenlose Geschichte in jeder Quelle (▸ unten).

## Folgen

- Früher und heute stimmen nur, solange jede Quelle ihre Geschichte vollständig führt. In der Demo
  tun das Listen, eMP und Dokumente; eine Quelle ohne Chronologie — etwa ein Dokument, das ersetzt
  oder gelöscht werden könnte — bräuchte dieselbe Mechanik.
- ▸ Was ein Empfänger zu einem Zeitpunkt tatsächlich gesehen hat, belegt der Verlauf nicht — er
  zeigt, was gegolten hat. Für einen Abruf aus dem Ausland bleibt die offene Frage aus 7.6.
- Der Startbestand setzt Markierungen teils direkt am Eintrag; gilt eine Fassung noch, ist deshalb
  die heutige Instanz maßgeblich, sonst die gesicherte.
