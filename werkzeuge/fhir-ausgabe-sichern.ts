/**
 * Legt beim Testlauf jede FHIR-Ausgabe als Datei ab, die `fhirPruefen` ohne Fehler prüft — als
 * Eingabe für den HL7 FHIR Validator (`npm run fhir:validieren`). Ohne die Umgebungsvariable
 * `FHIR_AUSGABE` tut diese Datei nichts.
 *
 * Ressourcen mit Fehlern bleiben draußen: Das sind die absichtlich fehlerhaften Beispiele der
 * Prüfregeln. Der Validator soll bestätigen, was die eigene Prüfung für richtig hält.
 */
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ziel = process.env['FHIR_AUSGABE'];

if (ziel) {
  mkdirSync(ziel, { recursive: true });
  type Ressource = { resourceType: string };
  type Befund = { schwere: string };
  const sichern = (r: Ressource, befunde: readonly Befund[]) => {
    if (befunde.some((b) => b.schwere === 'fehler')) return;
    const text = JSON.stringify(r, null, 2);
    // Gleicher Inhalt, gleicher Name: Mehrfach geprüfte Ressourcen landen nur einmal im Ordner.
    const kennung = createHash('sha256').update(text).digest('hex').slice(0, 12);
    writeFileSync(join(ziel, `${r.resourceType}-${kennung}.json`), text);
  };
  // Die Kern-Tests prüfen mit dem Quelltext, Simulator-Tests mit dem gebauten Paket — zwei
  // Modulinstanzen, beide melden.
  const quelle = await import('../packages/kern/src/fhir/pruefung.ts');
  quelle.pruefungBeobachten(sichern);
  const paket = await import('@demo-pvs/kern');
  paket.pruefungBeobachten(sichern);
}
