# 0056 — Profilprüfung nur im Simulator, jede Regel ausgewertet

**Datum:** 02.11.2026 · **Status:** angenommen · **ergänzt:** 0025, 0048

## Zusammenhang

ADR 0048 lässt die Profilregeln des Medication Service von FHIRPath.js auswerten. Drei Dinge
liefen anders als beschrieben:

- **Größe.** Der Kern exportierte die Profilprüfung im Sammelmodul, `package.json` erklärte keine
  `sideEffects`, und `manualChunks` legte alle `node_modules` in ein Paket. So lud das Praxissystem
  FHIRPath.js mit `ucum-lhc`, `antlr4`, `date-fns` und `decimal.js` beim Start mit — rund 1 167 kB
  (gepackt rund 225 kB), nicht „rund 100 kB (gepackt 14 kB)“, wie ADR 0048 schätzte. Das
  Praxissystem ruft die Prüfung gar nicht auf.
- **Stillschweigend übergangene Regeln.** 22 Regeln — 64 der 158 Invarianten in den fünf Profilen —
  nennen `%resource` oder `%rootResource`: 20 der 40 von `DosageDgMP` und `TimingDgMP`, dazu `ref-1` und
  `dom-3`. FHIRPath.js setzt diese Variablen nicht selbst; die Auswertung warf, die Prüfung fing
  den Fehler und machte keine Aussage. Der Simulator bildete zwei Dosierungsregeln zusätzlich von
  Hand nach (Viererschema als Freitext, fehlende Metadaten des Dosierungstexts).
- **Laufzeit und Konsole.** Jeder Ausdruck wurde bei jeder Schreibung neu übersetzt, und `trace()`
  in den Regeln der Pakete schrieb bei jeder Prüfung `TRACE:` in die Konsole.

## Entscheidung

1. **Eigener Einstiegspunkt.** Die Profilprüfung steht nicht mehr im Sammelmodul des Kerns, sondern
   unter `@demo-pvs/kern/profilpruefung`; der Kern erklärt `"sideEffects": false`. `manualChunks`
   legt nur React und Router in `bibliotheken`; FHIRPath.js und die Regeln landen im Paket des
   Simulators.
2. **Die Oberfläche wartet nicht auf den Simulator.** Gehostet lädt das Praxissystem das Paket des
   Simulators beim Start nach, zeigt die Oberfläche aber sofort; erst Anfragen an den Simulator
   warten, bis es da ist.
3. **`%resource` und `%rootResource`** sind die geprüfte Ressource. ⚠ Für enthaltene Ressourcen
   wäre `%resource` die enthaltene; die Demo prüft keine, weil sie keine schickt.
4. **Je Element mit `select()`**, nicht mit `all()`: Ein leeres Ergebnis macht keine Aussage. Sonst
   schlüge `ref-1` bei jedem Verweis an, der nur einen `identifier` trägt (`reference` fehlt, der
   Ausdruck ergibt leer). So verweisen aber 40 Beispiele des IG `de.gematik.epa.medication`
   1.4.0-ballot.1 auf die Person, und R5 hat `ref-1` um `reference.exists() implies …` ergänzt.
5. **Jeder Ausdruck wird einmal übersetzt** (`fhirpath.compile`) und wiederverwendet; eine leere
   `traceFn` hält die Konsole frei.
6. **Nichts stillschweigend.** `nichtAuswertbar()` führt die Ausdrücke, deren Auswertung scheiterte.
   Die Tests übersetzen jeden Ausdruck, werten jede Regel jedes Profils aus und prüfen die Liste
   nach der Selbstprüfung des Startbestands. ⚠ Bekannt: `tim-10` (Timing, R4) prüft `when in (…)`;
   bei mehreren `when` wertet FHIRPath.js das nicht aus, die Regel bleibt ohne Aussage.
7. Die Nachbildungen von Hand im Simulator entfallen; die Regeln aus den Paketen greifen jetzt
   selbst.

## Folgen

- Gepackte Größen: Gehostet erscheint die Oberfläche nach 273 kB statt nach 650 kB (bisher
  wartete sie auf Start- und Simulatorpaket); das Paket des Simulators (377 kB statt 129 kB) lädt
  daneben. Lokal enthält das Startpaket (262 kB) kein FHIRPath.js mehr.
- Eine Eingabe, die gegen eine der bisher übergangenen Regeln verstößt, weist der Simulator jetzt
  mit 422 `MEDSVC_NO_VALID_STRUCTURE` und dem Schlüssel der Regel ab. Startbestand und Ausgaben des
  Kerns erfüllen sie (Tests).
- Wer die Profilprüfung braucht, importiert sie ausdrücklich; das Sammelmodul des Kerns bleibt
  frei von Laufzeitabhängigkeiten.

## Verworfen

**Ein leeres Ergebnis als Verstoß werten.** Dann wiese die Demo jeden Verweis nur mit `identifier`
ab, wie ihn die Beispiele des IG nutzen, und bräuchte für `ref-1` eine Sonderregel. Ein übersehener
Verstoß ist in der Demo der kleinere Fehler als eine abgewiesene gültige Eingabe. **Die Prüfung
auch im Praxissystem vor dem Senden laufen lassen.** Das kostete jede Praxis das große Paket für
eine Prüfung, die der Dienst ohnehin vornimmt; das Praxissystem prüft die Dosierung schon bei der
Eingabe mit eigenen, kleinen Regeln (`dosierungPruefen`).
