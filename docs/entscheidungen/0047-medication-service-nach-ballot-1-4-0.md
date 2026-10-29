# 0047 — Medication Service nach dem Ballot 1.4.0, strukturierte Dosierung

**Datum:** 29.10.2026 · **Status:** angenommen · **ergänzt:** 0013, 0042, 0046

## Zusammenhang

Die gematik hat den IG ePA Medication Service `de.gematik.epa.medication` 1.4.0-ballot.1
veröffentlicht. Die Profile liegen jetzt in `de.gematik.epa` 1.4.0-ballot.1, die Dosierung folgt
`DosageDgMP` aus `de.fhir.medication` 2.0.0-ballot. Auf gemspec liegt eine neu ausgegebene Fassung
vom 16.10.2026. Sie trägt dieselbe Versionsnummer wie das Simplifier-Paket vom Vortag; Differentials
und Operationen sind gleich, nur die Snapshots wurden neu erzeugt.

Die Demo bildete den Medication Service nach 1.3.5 ab und hatte den Ballot nur abgeglichen
(SPEZIFIKATION 5.12). Gegen den Ballot verletzte sie fünf Regeln mit Fehlerschwere:

- Die Dosierung stand als Freitext „1-0-0-0" im Plan. Das verbietet `DosageFourSlotPatternInText`.
- Der erzeugte Dosierungstext fehlte (`DosageStructuredRequiresGeneratedText`). Der Dienst erzeugt
  ihn nach und lehnt bei Abweichung ab (`SVC_DOSAGE_INVALID_RENDERED_INSTRUCTION`).
- Der Grund stand in `reasonCode`. Das Element ist im Ballot gestrichen.
- Die Query API des Dienstes gibt es im Ballot nicht mehr; sie ist in die Common Query API gewandert.
- `EMPMedicationRequest` leitet jetzt von TI Common `ti-medication-request-dgmp` ab.

Strukturierte Dosierung mit erzeugtem Text war schon in 1.3.5 vorgesehen (`de.fhir.medication`
1.0.7). Das Freitext-Viererschema der Demo war also schon gegen das Release eine Abkürzung.

## Entscheidung

1. **Der Medication Service folgt dem Ballot 1.4.0 in allen Ausbaustufen** — anders als MHD und
   ePS (ADR 0042), die ihre Ballot-Wege erst ab Weiterentwicklung 1 zeigen. Die Demo soll zeigen,
   wie ein Primärsystem den digital gestützten Medikationsprozess nach dem aktuellen Stand bedient.
   Zwei Fassungen von Planeintrag, Grund und Dosierung nebeneinander würden diese Aussage verwischen.
2. **Die Dosierung wird als Schema erfasst**, in den Schemata des Medication IG DE: Tageszeiten,
   Uhrzeiten, Wochentage, Intervall, Bedarf, Freitext. Dazu kommen Zeitraum und Hinweis. Daraus
   entstehen `DosageDgMP` und der Text nach dem Algorithmus von HL7 Deutschland. Der Kern bildet den
   Algorithmus nach (`fachlogik/dosierungstext.ts`); Praxissystem und Simulator rechnen mit
   derselben Funktion.
3. **Die Referenzimplementierung ist das Prüforakel.** Die Testfälle des Kerns wurden mit dem
   Python-Skript von HL7 Deutschland erzeugt (Version und Commit in der Falldatei). Eine Abweichung
   lässt die Tests scheitern.
4. **Der Behandlungsgrund wird zweigeteilt:** die Diagnose der Praxis als `EMPReasonCondition` über
   `reasonCondition`, der Text für Patient:innen in `reasonPatientInstruction`.
5. **Der Simulator prüft wie der Dienst:** Text neu erzeugen und vergleichen, nur de-DE mit
   Version 2.0.0, Kategorie bestimmen, Gründe anlegen, Status des Arzneimittels, `MEDSVC_ALREADY_LINKED`,
   Austausch des Arzneimittels, Dosierungsübernahme bei `$link-emp`, neuer Datumsbezug von
   `$medication-list`.
6. **Das Praxissystem zeigt den Plan nach Status und Kategorie gruppiert**, einfache Tagesschemata
   als Tabelle morgens-mittags-abends-nachts, alles andere als erzeugten Text.
7. **Nachgezogen am selben Tag** (SPEZIFIKATION 5.14): ein Fassungsarchiv je Ablage, gespeist aus
   den versionierten Verweisen der Änderungseinträge. Darauf bauen `_history` der Common Query
   API, der Stand zum Bezugszeitpunkt in `$medication-plan` und die Rücksetzlogik von
   `$unlink-emp` und `$cancel-eml-entry`. Die Query API des Dienstes entfällt zugunsten der Common
   Query API; die Einstellung der Zwischenüberschriften steuert die Gruppierung im Praxissystem.

## Verworfene Alternativen

- **Ballot nur in der Vorschau wie ADR 0042.** Release 3.1.3 bliebe bei 1.3.5, ab Weiterentwicklung
  1 gälte 1.4.0. Das hieße zwei Planeinträge, zwei Gründe, zwei Lesewege im PVS und im Simulator —
  für einen Unterschied, den die Demo nicht zeigen will.
- **Freitext beibehalten und nur den Text mitschicken.** Für ein Viererschema verbietet das Profil
  den Freitext. Außerdem fiele genau das weg, was die Dosierung zum Vorbild für die Patient Summary
  macht: ein Eintrag, dessen Text überall gleich lautet, weil ihn jedes System aus derselben
  Struktur erzeugt.
- **Den Text im Simulator erzeugen statt im Praxissystem.** Der IG verlangt die Erzeugung beim
  erfassenden System; der Dienst prüft nur nach.
- **Die Algorithmusversion als `2.0.0-rc.2` angeben.** Der Dienst nimmt nur `2.0.0` an. Die Demo
  setzt `2.0.0` und bildet den jüngsten veröffentlichten Stand nach; die Lücke steht als Befund in
  SPEZIFIKATION 5.14.
