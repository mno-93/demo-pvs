# 0055 — E-Rezept-Zulieferung nach den Diagrammen

**Datum:** 02.11.2026 · **Status:** angenommen · **ergänzt:** 0024, 0047, 0054

## Zusammenhang

Der Demo-Ersatz des E-Rezept-Fachdienstes stellt Verschreibung, Abgabe und Stornierungen in den
Medication Service (`erezept.ts`). Er folgte dem IG 1.3.5 und eigenen Annahmen, nicht den
Aktivitätsdiagrammen des Ballots 1.4.0:

- Eine Verschreibung mit eMP-Identifier erzeugte einen neuen eMP-Stand (Aktivitätsnachweis, neue
  Fassung, Chronologieeintrag) — ein Lesenachweis der Praxis wurde dadurch ungültig.
- Eine Verknüpfung, die nicht gelang, blieb ohne Spur.
- Das Löschen vor der Einlösung setzte alles auf `entered-in-error`, statt zu löschen.
- Eine Abgabe änderte nur die eine Medikationsinformation (Datum der Verordnung, Arzneimittel der
  Verordnung); mehrere Arzneimittel landeten in einem Eintrag.
- Das Storno einer Abgabe entfernte Ressourcen ohne Spur und ließ eine beim Austausch geänderte
  Dosierung im eMP stehen.
- Die Prozesskennung stand an Arzneimittel und Medikationsinformation als `identifier`; die
  Profile führen sie dort als Extension.

## Entscheidung

1. **Verschreibung** (V3): Verknüpfung über `basedOn` mit `isEMP`, ohne den eMP zu ändern;
   gelingt sie nicht, das Verarbeitungsereignis `LINKING_NOT_SUCCESSFUL` mit Zeitpunkt.
2. **Löschen vor Einlösung** (V4): Medikationsinformationen, Abgaben, Verschreibung und
   Arzneimittel, die niemand mehr braucht, werden gelöscht; der Planeintrag geht auf seine Fassung
   vor der Übernahme zurück.
3. **Abgabe** (V4, ADD-DISPENSATION-V1): je abgegebenem Arzneimittel eine Abgabe und eine
   Medikationsinformation mit dem abgegebenen Arzneimittel und dem Tag der Abgabe; ohne Austausch
   eine neue Fassung des verordneten Arzneimittels. „Link eMP element“: Aktivitätsnachweis am
   Planeintrag, Arzneimittel und Dosierung nur bei genau einem Arzneimittel.
4. **Storno der Abgabe** (V5, REMOVE-DISPENSATION-V2): Planeintrag auf die Fassung vor der Abgabe
   (mit Dosierung), Medikationsinformation zurück auf die Verschreibung, weitere gelöscht, Abgaben
   und abgegebene Arzneimittel gelöscht.
5. **Urheber** der Änderungen ist der Dienst: `agent.who.identifier` mit dem System
   `epa-fhir-data-service` und dem Wert `MEDICATIONSVC`, wie in den Beispielen des Basis-IG.
6. **Prozesskennung** an der Verordnung als `identifier`, an Arzneimittel, Abgabe und
   Medikationsinformation als Extension `rx-prescription-process-identifier-extension`. Die Suche
   `rx-prescription` der Common Query API wertet diese Extension aus. ▸ Der Ausdruck des
   Suchparameters im Ballot nennt die Extension ohne Endung und träfe nie (SPEZIFIKATION 5.14,
   Befund 9); die Demo sucht, wie der Parameter gemeint ist.

## Folgen

- Das PVS findet die Medikationsinformationen eines Rezepts über die Extension und zählt Abgaben
  über alle Medikationsinformationen einer Verordnung; „verordnet am“ kommt aus der Verordnung.
- Ein E-Rezept aus dem Plan ändert den Lesenachweis nicht mehr; erst die Abgabe tut es.
- ⚠ Nicht nachgebildet: `EPAMedicationDispenseUniqueIdentifier`, `RxOriginatorProcessIdentifier`,
  Verweise auf PractitionerRole und Organization statt Anzeigenamen bei Verordner und Apotheke.

## Verworfen

**Beim Anwendungsfall des IG 1.3.5 bleiben** (Status `entered-in-error` beim Löschen). Der Ballot
macht die Diagramme verbindlich; die Demo folgt dem Medication Service, den sie zeigt.
**Die Abgabe mehrerer Arzneimittel in einer Medikationsinformation führen.** Datum, Arzneimittel
und Dosierung einer Medikationsinformation wären dann nur für eines der Arzneimittel richtig.
