# 0054 — Medication Service nach den Aktivitätsdiagrammen

**Datum:** 02.11.2026 · **Status:** angenommen · **ergänzt:** 0047, 0048

## Zusammenhang

Der IG `de.gematik.epa.medication` 1.4.0-ballot.1 macht die Geschäftslogik der Operationen mit
„MUSS … gemäß dem Aktivitätsdiagramm“ verbindlich. Der Simulator folgte den Diagrammen nur zum
Teil; ein Primärsystem, das gegen die Demo gebaut ist, liefe gegen einen ballotkonformen Dienst
anders:

- `$add-emp-entry` mit Verweis auf das Arzneimittel eines eML-Eintrags verknüpfte nicht selbst;
  das PVS rief danach `$link-emp` auf, und das überschrieb die gerade gesetzte Dosierung mit der
  des Listeneintrags.
- `$update-emp-entry` überschrieb Felder, bevor es das neue Arzneimittel prüfte, und antwortete bei
  einer Ablehnung 422 mit halb geändertem Eintrag. Ein fehlerhafter Eintrag bekam eine neue Fassung;
  das Diagramm löscht ihn.
- Jede Schreibung legte einen Chronologieeintrag an, auch ohne Änderung der Liste; Prüfungen der
  Struktur kamen nach dem Lesenachweis statt davor.
- `$link-emp` lehnte die erneute Verknüpfung mit demselben Eintrag ab und ließ die Verordnung ohne
  logischen Verweis; `$batch-emp` hielt sich an die Reihenfolge des Bundles.

## Entscheidung

1. **Reihenfolge wie im Diagramm:** Header (431/422/403), Person in der Eingabe gegen
   `x-insurantid` (403 `SVC_IDENTITY_MISMATCH`), Struktur (422), Status und Dosierungstext (400),
   dann der Lesenachweis (409), dann die Prüfungen am Bestand — und erst danach die erste Änderung.
2. **`$add-emp-entry` verknüpft selbst**, wenn der Eintrag auf das Arzneimittel eines eML-Eintrags
   verweist („link eMP element“): `basedOn` mit `isEMP`, Aktivitätsnachweis mit `addedOn`,
   logischer Verweis der Verordnung — ohne die Dosierung des Listeneintrags zu übernehmen. Kennung
   und MedicationPlanIdentifier sind derselbe UUID-Wert (IG-MED17706LL3). Das PVS ruft kein
   `$link-emp` mehr hinterher.
3. **`$update-emp-entry`:** alles aus der Eingabe außer `subject`, `medicationReference`,
   `reasonReference`, `originMedication`, Aktivitäten und Kennung; ohne Änderung keine neue Fassung;
   neue Gründe ersetzen die alten, ohne Gründe und Verweis entfallen sie; der Status der Arzneimittel
   (`medicationReference` und `originMedication`) folgt dem Eintrag als neue Fassung; ein
   ausgetauschtes Arzneimittel wird gelöscht, wenn es niemand mehr braucht.
4. **Fehlerhaft heißt gelöscht** — nach dem Diagramm IG-MED-BL-UPDATE-EMP-ENTRY-V3: verknüpfte
   eML-Einträge werden gelöst (je ein Änderungseintrag), der Eintrag wird gelöscht (Änderungseintrag
   DELETE), die Antwort trägt keinen `empEntry`. ▸ Der Fließtext derselben Seite sagt das Gegenteil
   („nicht durch Löschen, sondern durch Setzen eines geeigneten Statuswertes“); die Demo folgt dem
   verbindlich gemachten Diagramm und nennt den Widerspruch als Befund am Ballot (SPEZIFIKATION 5.14).
   Im Plan der Praxis bleibt der Eintrag als fehlerhaft stehen.
5. **Chronologie nur bei Änderung** der Menge gültiger Einträge mit ihren Fassungen; sonst gilt
   der bisherige Chronologieeintrag weiter. Eine leere Liste nennt ihr Ziel mit
   `data-absent-reason`, die Tätigkeit ist immer UPDATE. Die Demo-Steuerung „Andere Einrichtung
   ändert zwischendurch“ ändert deshalb tatsächlich etwas (eine Notiz am ersten Eintrag).
6. **`$link-emp`** ist mit demselben Eintrag idempotent, setzt den logischen Verweis der Verordnung
   und gibt sie als `prescription` zurück; Arzneimittel und Dosierung übernimmt der Eintrag nur ohne
   späteren eML-Eintrag, das Arzneimittel nicht bei einer Kombipackung. `$unlink-emp` prüft den
   Status des eMP-Eintrags nicht. `$cancel-eml-entry` legt für das Zurücksetzen des eMP-Eintrags
   einen eigenen Änderungseintrag an. `$batch-emp`: erst alle Anlagen, dann alle Änderungen, dann
   der Abschluss; genau ein `$emp-commit`, an beliebiger Stelle.

## Folgen

- „In den Plan“ und „Rezept … auch in den Medikationsplan“ brauchen einen Aufruf weniger.
- Das Aufrufprotokoll zeigt nach „fehlerhaft“ eine Antwort ohne Planeintrag; der Abgleich führt den
  Eintrag als „nicht mehr in der ePA“.
- ⚠ Nicht nachgebildet: `EPAMedicationUniqueIdentifier` (Hash), die Strukturprüfung des ganzen
  Parameters-Profils über die Pflichtparameter hinaus.

## Verworfen

**Dem Fließtext folgen** (fehlerhaft als Status). Der IG verpflichtet auf das Diagramm; ein
Primärsystem, das sich nach der Demo richtet, erwartete sonst einen Eintrag, den der Dienst nicht
liefert.
**Die Abweichungen nur dokumentieren.** Die Demo zeigt, wie ein Primärsystem mit dem Dienst
arbeitet; eine andere Geschäftslogik führt zu anderem Verhalten im PVS.
