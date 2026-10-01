# 0030 — Abfrage „seit dem letzten Aufruf" nach Spezifikation für Dokumente und Medikation

**Datum:** 01.10.2026 · **Status:** angenommen · **ergänzt:** 0027

## Zusammenhang

ADR 0027 ermittelt „neu seit dem letzten Aufruf" im Primärsystem: Es merkt sich Kennung und
Fassung jedes Eintrags und vergleicht beim nächsten Aufruf. Für Dokumente und Medikation sehen die
veröffentlichten Implementation Guides aber schon Abfragen vor, die genau das liefern — verbindlich
(SHALL in den CapabilityStatements): `_lastUpdated` an der Dokumentsuche (MHD 1.1.3), an allen
Ressourcen des Medication Service die Suche nach `_lastUpdated`, Chronologieeinträge des
Medikationsplans nach `recorded` und `agent-identifier`, `$medication-plan` zu einem früheren
Chronologieeintrag und `$medication-list` mit `date` (Medication 1.3.5).

## Entscheidung

1. **Medikationsplan:** Beim Öffnen fragt das PVS die Chronologieeinträge seit dem Lesezeichen ab
   (`Provenance?is-emp-chronology=true&recorded=gt…`). Stammt einer von einer anderen Einrichtung,
   lädt es den Plan zum Chronologieeintrag des letzten Aufrufs und vergleicht ihn mit dem aktuellen:
   neue und geänderte Einträge mit Marke, **entfallene mit Namen**.
2. **Medikationsliste:** `$medication-list?date=gt…` liefert die neuen Einträge; gemeldet werden die
   anderer Einrichtungen.
3. **Dokumente:** `DocumentReference?_lastUpdated=gt…` liefert die seitdem eingestellten Dokumente;
   gemeldet werden die anderer Einrichtungen.
4. **Lesezeichen** ist der Zeitpunkt des Aktensystems aus der letzten Antwort
   (`Bundle.meta.lastUpdated`), beim Plan dazu der Chronologieeintrag. Das PVS merkt es je Person
   und Bestand; es gilt ab dem nächsten Öffnen und zählt nicht als Handlung.
5. Der Simulator liefert die Parameter und den Zeitpunkt in jeder Antwort; seine Uhr führt
   Millisekunden und steigt streng, damit ein Lesezeichen nie mit einer späteren Änderung
   zusammenfällt.
6. Patient Summary und ✦ Listen bleiben beim Vergleich im Primärsystem (ADR 0027) — für sie ist
   keine Abfrage spezifiziert.

## Begründung

▸ Die Demo soll zeigen, was heute schon geht, und den Vorschlag davon abgrenzen. Am selben
Bildschirm stehen jetzt zwei Wege: spezifiziert für Medikation und Dokumente, ✦ für Listen und
Patient Summary. Der spezifizierte Weg kann mehr: Er nennt entfallene Planeinträge mit Namen und
braucht keinen gemerkten Stand je Eintrag.

## Folgen

Für die Vorführung trägt „andere Einrichtung trägt ein" jetzt in allen Ausbauständen ein: einen
Kontrollbefund der Kardiologie, einen neuen Planeintrag mit Verordnung und eine geänderte Dosierung,
ab Weiterentwicklung 1 zusätzlich Diagnose, ab 2 Impfung.

## Verworfen

**Alles über den Vergleich im Primärsystem** (Stand bis 30.09.2026) — verdeckt, dass Dokumente und
Medikation die Abfrage schon haben. **`_history` je Ressource** — liefert Fassungen einzelner
Einträge, aber nicht, welche Einträge neu sind; die Chronologie beantwortet die Frage in einem Aufruf.
