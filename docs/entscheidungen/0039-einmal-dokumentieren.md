# 0039 — Einmal dokumentieren: Domäne als Datenhaltung, FHIR an den Übergängen

**Datum:** 15.10.2026 · **Status:** angenommen · **ergänzt:** 0010, 0016, 0019, 0038

## Zusammenhang

Eine Diagnose geht in die Diagnosenliste der ePA, in den Arztbrief, in die Abrechnungsprüfung und
über die Liste in die Patient Summary. Jedes Ziel verlangt ein anderes Profil: TI Common, EU Core,
KBV. Zwei Stellen bauten FHIR in der Oberfläche selbst — das Arzneimittel des Medikationsplans gab
es in zwei abweichenden Fassungen. Die Stammdaten der Praxis standen an fünf Stellen.

## Entscheidung

1. **Die fachlichen Typen sind die einzige Datenhaltung.** Jede Angabe wird einmal erfasst.
   Einträge, die auch in der ePA stehen, tragen `epaId` und `epaFassung`.
2. **FHIR entsteht nur an den Übergängen und nur im Kern** (`fhir/abbildung.ts`,
   `fhir/medikation.ts`, `fachlogik/arztbrief.ts`, `fhir/erezept.ts`). Je Inhalt gibt es eine
   Abbildung; das Profil wählt der Aufrufer je Ziel.
3. **Pflichtangaben der Profile sind Pflichtparameter der Abbildung oder Pflicht in der
   Erfassung.** Unbekannte Pflichtwerte tragen `data-absent-reason`, Invarianten sichert die
   Abbildung und die Maske.
4. **Eine ausführbare Strukturprüfung** (`fhirPruefen`) läuft in jedem Testlauf über alle
   Abbildungen und alle Antworten des Simulators. Dieselben Ausgaben gehen mit
   `npm run fhir:validieren` an den HL7 FHIR Validator. Regeln und Grenzen:
   [DATENMODELL.md](../DATENMODELL.md).

## Verworfene Alternativen

- **FHIR-Ressourcen als lokale Datenhaltung.** Jedes Ziel braucht ein anderes Profil, die
  Abrechnung ist kein FHIR, und die Profile ändern sich je Release. Die Praxis müsste mehrere
  Fassungen derselben Diagnose pflegen.
- **Abbildungen in den Modulen der Oberfläche.** So ist es gewachsen — und die beiden Fassungen des
  Arzneimittels liefen auseinander.

## Folgen

▸ Neue Ziele, etwa der ambulante Brief nach EU-Vorgabe oder die Patient Summary nach EPS, brauchen
eine neue Profilangabe, keinen neuen Bestand.

▸ Die Medikation erfüllt den Grundsatz noch nicht: Der Plan der ePA ist ihre Quelle, lokal liegt
nur ein Spiegel. ✦ Vorschlag in DATENMODELL.md, Abschnitt 7.
