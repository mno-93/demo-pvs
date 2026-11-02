# 0053 — Zurück aus FHIR: unbekannt statt Vorbelegung

**Datum:** 02.11.2026 · **Status:** angenommen · **ergänzt:** 0039, 0052

## Zusammenhang

`kern/fhir/lesen.ts` bildet Einträge der ePA auf die Domänentypen ab. Was eine Ressource nicht
trug, bekam den Wert, den die Erfassung vorbelegt: Zusatzkennzeichen „G“, Diagnosesicherheit
„gesichert“, klinischer Status „aktiv“. Eine ausgeschlossene Diagnose ohne ICD-Kennzeichen erschien
so als gesicherte, aktive Diagnose — und zählte, in die Praxis übernommen, für den
Chronikerzuschlag. Eine Impfung mit `status = not-done` (Modifier) wurde als erfolgt gelesen: Die
Impfübersicht zählte sie, „in die Praxis“ übernahm sie als erfolgt. Datumsangaben wurden auf zehn
Zeichen gekürzt; `2026-09-08T23:30:00Z` wurde der 08.09., in Deutschland ist es der 09.09.

## Entscheidung

1. **Ableiten, wo eine andere Angabe es ergibt:** Ohne ICD-Kennzeichen folgt es aus
   Diagnosesicherheit und klinischem Status (Umkehrung der Kopplung `icd-4` bis `icd-7` der
   Deutschen Basisprofile: ausgeschlossen → A; vorläufig, Differential, unbestätigt → V; gesichert
   und behoben, inaktiv oder in Remission → Z; gesichert → G). Ohne Diagnosesicherheit folgt sie
   aus dem Kennzeichen.
2. **Sonst unbekannt:** `zusatzkennzeichen`, `diagnosesicherheit` und `klinischerStatus` einer
   Diagnose dürfen `null` sein. Die Oberfläche zeigt „Status unbekannt“ bzw. „Diagnosesicherheit
   unbekannt“; das Formular verlangt eine Wahl, bevor es speichert; die Abbildung lässt die Angabe
   weg. Ohne ICD-Code kein ICD-Coding; der Chronikerzuschlag zählt nur Diagnosen mit Code.
3. **Impfung „nicht erfolgt“** als eigener Status (`not-done` hin und zurück); sie zählt nicht als
   Impfschutz und zeigt den Marker „nicht erfolgt“. Ohne ATC-Code kein ATC-Coding.
4. **Datum in deutscher Zeit:** Ein Zeitpunkt mit Zone wird über die Demo-Uhr des Kerns
   (`ortszeitDeutschland`) zum Tag in Deutschland.
5. **Ausnahme mit Absicht:** Eine Allergie ohne klinischen Status gilt weiter als aktiv — für die
   AMTS-Prüfung die vorsichtige Seite; die Kritikalität „Risiko nicht einschätzbar“ ist selbst der
   Code für „unbekannt“ (`unable-to-assess`).

## Folgen

- Die Typen `Diagnose` und `Impfung` sind weiter; eigene Einträge der Praxis tragen die Werte wie
  bisher, `null` entsteht nur beim Lesen aus der ePA.
- Anzeigen nutzen `diagnosecode`, `klinischerStatusText` und `diagnosesicherheitText` aus dem Kern.

## Verworfen

**Bei der Vorbelegung bleiben und den Eintrag markieren.** Der Wert sähe aus wie eine Angabe, und
jede Stelle, die ihn liest — Abrechnung, Brief, Patient Summary —, müsste die Markierung kennen.
**Einträge mit fehlenden Pflichtangaben gar nicht anzeigen.** Die Praxis sähe nicht, was in der ePA
steht.
