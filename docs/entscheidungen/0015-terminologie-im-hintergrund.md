# 0015 — Terminologie im Hintergrund: Kodierservice und nationale Wertelisten

**Datum:** 10.09.2026 · **Status:** angenommen

## Zusammenhang

Diagnosen und Allergien wurden bisher mit ICD-10-GM und einem Platzhalterauszug von Allergenen
erfasst. Die Patient Summary braucht SNOMED CT; das Informationsmodell der Patient Summary
(Arbeitsstand, nicht veröffentlicht) bindet die Substanz einer Allergie an
KBV_VS_AllergyIntolerance_Substance_SNOMED_CT und die Manifestationen an KBV_VS_AllergyIntolerance_Manifestation_SNOMED_CT.

## Entscheidung

- **Diagnosen:** Gesucht wird ein Begriff, auch über Synonyme. Ein Kodierservice-Auszug
  (38 Begriffe, nach dem Vorbild des zentralen Kodierservice in Österreich) hinterlegt ICD-10-GM
  und SNOMED CT in einem Schritt. Wo er nichts kennt, bleibt nur die ICD-10-GM — sichtbar als
  „ohne SNOMED CT". Altbestand lässt sich nachkodieren.
- **Allergien:** Die Substanz kommt aus der national abgestimmten Werteliste (197 Konzepte),
  die Manifestationen aus deren Werteliste (41), der Expositionsweg aus
  KBV_VS_Base_Route_of_Administration_SNOMED_CT (63). Alle Listen werden per Skript aus dem
  Informationsmodell übernommen, mit Herkunft im Kopf. Freitext ist zulässig, weil die
  Bindung extensible ist; die Maske sagt, was er kostet.
- **AMTS:** Eine gekennzeichnete Demo-Zuordnung verbindet 34 Substanzen mit ATC-Codes. Sie wird
  nie in eine FHIR-Ressource geschrieben, weil sie keine Übersetzung ist.
- **Felder:** Beide Masken folgen dem Informationsmodell, mit den Bezeichnungen seiner
  Spalte „Konzept". Unter jeder Maske steht eine aufklappbare FHIR-Vorschau (die
  Übersicht der erfassten Modellelemente steht seit 0020 in der Spezifikation) (Condition nach `ti-condition-diagnosis`,
  AllergyIntolerance nach `allergyIntolerance-eu-core`).

## Begründung

▸ Die Ärztin wählt einen Begriff, nicht zwei Codes. Nur so ist die Mehrfachkodierung ohne
Mehraufwand zu haben — die Voraussetzung dafür, dass die Patient Summary aus der ohnehin
stattfindenden Dokumentation entsteht.

⚠ Die Kodierservice-Zuordnungen sind nicht gegen einen Terminologieserver geprüft; fünf sind
als ungeprüft markiert. Ob KBV_VS_AllergyIntolerance_Substance_SNOMED_CT der national abgestimmten
Allergien-Werteliste entspricht, ist zu verifizieren.

**Nachtrag 01.10.2026.** Verifiziert: Beide Allergie-Wertelisten sind auf dem Zentralen
Terminologieserver veröffentlicht (1.0.0, Stand 21.07.2026) — Substanzen mit denselben 197
Codes, Manifestationen mit 37 statt der zuvor übernommenen 41. Die Demo übernimmt sie seither von
dort (`werkzeuge/wertelisten-vom-zts.mjs`), mit den Bezeichnungen der veröffentlichten Fassung;
frühere Bezeichnungen bleiben als Suchsynonyme. Expositionswege: KBV-Basisprofile; Schweregrade:
HL7 FHIR `condition-severity`.

## Verworfen

**Zwei Suchfelder (ICD und SNOMED)** — verdoppelt die Arbeit. **SNOMED CT sichtbar statt im
Hintergrund** — überfordert im Alltag; die Codes stehen deshalb klein neben dem Begriff.
