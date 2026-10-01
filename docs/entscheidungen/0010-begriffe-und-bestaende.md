# 0010 — Feste Begriffe und sichtbare Bestände

**Datum:** 09.09.2026 · **Status:** angenommen

## Zusammenhang

Eine Durchsicht der Oberfläche brachte drei Unstimmigkeiten zutage, die alle dasselbe
Problem erzeugen: Man weiß nicht sicher, worüber gerade gesprochen wird.

1. Der Gegenstand des Projekts hieß an einer Stelle „PKA", an anderer „Patientenkurzakte".
2. Die elektronische Patientenakte hieß meist nur „Akte" — 37 Fundstellen.
3. **Am schwersten:** Der lokale Bereich des Praxissystems hieß `Patientenakte`. Damit
   bezeichnete dasselbe Wort den lokalen Bestand und die ePA.

## Entscheidung

| Gegenstand                         | Begriff                      | Nicht mehr                            |
| ---------------------------------- | ---------------------------- | ------------------------------------- |
| Der Gegenstand des Projekts        | **Patient Summary**          | PKA, Patientenkurzakte                |
| Die elektronische Patientenakte    | **ePA**                      | Akte, Aktensystem (in der Oberfläche) |
| Der lokale Bereich im Praxissystem | **Patientenkartei**          | Patientenakte                         |
| Die beiden Datenbestände           | **Praxissystem** und **ePA** | lokal/zentral wechselnd               |

Die Begriffe gelten auch im Quelltext: `summaryRelevant` statt `pkaRelevant`,
`EpaAnsicht` statt `EpaAkte`, `Bestand = 'lokal' | 'epa'` statt `'akte'`.

Zusätzlich trägt **jeder Bereich ein Bestandsband** im Kopf, das benennt, worin gearbeitet
wird — Praxissystem, ePA oder beides. Die Farbe ist eine Zugabe; die Aussage steht immer
als Wort daneben.

## Begründung

Eine Demo, die zwei Bestände auseinanderhalten soll, darf sie nicht gleich nennen. Der
Punkt ist nicht Ordnungsliebe: Wer in einem Termin fragt „liegt das jetzt in der Akte?",
meint möglicherweise beides, und niemand merkt es. Die Namenskollision `Patientenakte`
gegen `elektronische Patientenakte` war der schlimmste Fall — sie machte die zentrale
Aussage der Anwendung unscharf.

## Verworfen

**„Akte" als Kurzform beibehalten** — kürzer und im Sprachgebrauch verbreitet, aber
mehrdeutig genau dort, wo Eindeutigkeit gebraucht wird.
**Den lokalen Bereich unbenannt lassen** — hätte die Kollision verdeckt statt aufgelöst.

## Nachtrag (ADR 0018)

Das Feld `summaryRelevant` ist entfallen. An seine Stelle tritt die Verknüpfung mit der
Liste der ePA (`epaId`, `epaFassung`): Was für die Patient Summary gedacht ist, steht in der
Diagnosenliste oder der Allergienliste — nicht in einer Markierung des Praxissystems.
