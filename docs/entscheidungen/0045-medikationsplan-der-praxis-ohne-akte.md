# 0045 — Medikationsplan der Praxis, wenn es keine Akte gibt

**Datum:** 28.10.2026 · **Status:** angenommen, erweitert durch 0046 (Plan der Praxis für alle, mit Abgleich) · **ergänzt:** 0009, 0012, 0023, 0024

## Zusammenhang

Der Medikationsplan des Praxissystems war bisher nur der Spiegel des eMP aus der ePA (ADR 0009,
0012). Für Frau Weber, deren Akte das Aktensystem nicht kennt (B12), gab es deshalb keinen Plan:
„Neuer Planeintrag" erschien nicht, E-Rezepte ließen sich ausstellen, landeten aber nirgends. Im
Praxisalltag führt die Hausarztpraxis den Plan auch für Menschen ohne ePA. Ohne diesen Fall wirkt
die Medikation, als hinge sie an der ePA, und der Aufwand mit und ohne eMP lässt sich nicht
vergleichen.

## Entscheidung

1. **Kennt das Aktensystem keine Akte** (Information Service 404 `noHealthRecord`), führt das
   Praxissystem einen **Medikationsplan der Praxis** — einen eigenen Bestand im Zustand
   (`praxisplan`), nicht einen Ersatz-eMP und nicht den Spiegel. Das Bestandsband sagt
   „Praxissystem", die Karte heißt „Medikationsplan der Praxis" (Architektur, Regel 3).
2. **Verordnen pflegt den Plan mit** (U23): „Auch in den Medikationsplan aufnehmen" legt beim
   Senden einen Eintrag an, „Rezept" am Planeintrag ordnet das Rezept dem Eintrag zu, „in den
   Plan" übernimmt ein vorhandenes Rezept mit Mittel, Dosierung und Grund. Die Zuordnung steht am
   Planeintrag (`rezeptIds`), nicht am Rezept — `empId` bleibt dem eMP-Identifier vorbehalten.
3. **Im Plan ist ein Rezept**, wenn es einem gültigen Eintrag (aktiv oder pausiert) zugeordnet ist
   oder ein gültiger Eintrag denselben ATC-Code trägt; so wird dasselbe Mittel nicht doppelt
   aufgenommen. Regel im Kern (`fachlogik/praxisplan.ts`) mit Tests.
4. **Gilt nur ohne Akte.** Bei Widerspruch gegen den Medikationsprozess (B11) und bei Störung
   (Spiegel, gelbes Band) bleibt das bisherige Verhalten; ob dort ein Plan der Praxis sinnvoll
   ist, ist gesondert zu entscheiden.
5. **Kein Ausdruck nach Vorlage des bundeseinheitlichen Medikationsplans.** Die Ansicht ist
   funktional: Mittel, Dosierung, Grund, Status, letzte Verordnung.

## Folgen

- Karteikarte und ✦ Arztbrief lesen den Plan der Praxis mit.
- Entsteht später eine Akte, werden die Einträge **nicht** stillschweigend in den eMP geschrieben.
  Eine einzelne Übernahme mit benannter Handlung (ADR 0008) ist noch nicht umgesetzt.
- Eine Abgabe erfährt die Praxis ohne Akte nicht; am Eintrag steht nur die letzte Verordnung.

## Verworfen

**Einträge ohne Akte als eMP-Einträge im Simulator anlegen** — es gäbe eine Akte, die es nicht
gibt; der Unterschied zwischen ePA und Praxissystem, um den es der Demo geht, verschwämme.
**Den Spiegel als lokalen Plan beschreibbar machen** — der Spiegel ist eine datierte Kopie der ePA
(ADR 0012); wer in ihn schreibt, hält ihn für aktuell.
**Zuordnung über `empId` am Rezept** — der Verordnungsdatensatz gäbe einen eMP-Identifier mit, den
es nicht gibt.
