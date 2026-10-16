#!/usr/bin/env node
/**
 * Prüft die FHIR-Ausgaben der Demo mit dem HL7 FHIR Validator — gegen die veröffentlichten
 * Pakete statt gegen die eigene Regelauswahl (`fhirPruefen`).
 *
 * Ablauf:
 * 1. Die Tests aus `werkzeuge/fhir-validator.json` laufen mit `FHIR_AUSGABE`. Jede Ressource, die
 *    `fhirPruefen` ohne Fehler prüft, landet als Datei in `ausgabe/fhir-validierung/ressourcen`
 *    (`werkzeuge/fhir-ausgabe-sichern.ts`).
 * 2. Der Validator prüft den Ordner gegen die Pakete der Konfiguration. Er lädt sie beim ersten
 *    Lauf in den Paket-Cache unter `~/.fhir/packages`.
 * 3. Das Skript liest den Bericht, nimmt die begründeten Ausnahmen heraus und endet mit Fehler,
 *    wenn ein Fehler bleibt. Ausnahmen ohne Treffer meldet es, ohne den Lauf scheitern zu lassen.
 * 4. Die Zusammenfassung steht in `zusammenfassung.json` und `zusammenfassung.md`. In GitHub
 *    Actions erscheint sie auf der Seite des Laufs, Fehler zusätzlich als Anmerkungen.
 *
 * Voraussetzungen: Java ab 17 — aus `JAVA_HOME`, sonst `java` im Pfad — und `validator_cli.jar`,
 * Pfad aus `FHIR_VALIDATOR_JAR`, sonst `~/.fhir/validator_cli.jar`.
 * Bezug: https://github.com/hapifhir/org.hl7.fhir.core/releases
 * Das Skript lädt nichts selbst herunter.
 *
 * Aufruf: npm run fhir:validieren
 */
import { spawnSync } from 'node:child_process';
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const konfiguration = JSON.parse(readFileSync('werkzeuge/fhir-validator.json', 'utf8'));
const ORDNER = join('ausgabe', 'fhir-validierung');
const RESSOURCEN = join(ORDNER, 'ressourcen');
const BERICHT = join(ORDNER, 'bericht.json');
/** Höchstzahl einzeln aufgeführter Fehler in Zusammenfassung und Anmerkungen. */
const MAX_EINZELN = 50;

function abbrechen(text, code = 2) {
  console.error(`\n${text}\n`);
  process.exit(code);
}

// 1. Voraussetzungen
const JAVA = process.env.JAVA_HOME ? join(process.env.JAVA_HOME, 'bin', 'java') : 'java';
const java = spawnSync(JAVA, ['-version'], { encoding: 'utf8' });
if (java.error || java.status !== 0) {
  abbrechen(
    `Keine Java-Laufzeit gefunden (${JAVA}). Der HL7 FHIR Validator braucht Java ab Version 17;\n` +
      'JAVA_HOME auf eine Installation setzen, etwa JAVA_HOME="$(brew --prefix openjdk@21)".\n' +
      'In der CI läuft die Prüfung im Job „FHIR-Validator“ (.github/workflows/demo.yml).',
  );
}
const jar = process.env.FHIR_VALIDATOR_JAR ?? join(homedir(), '.fhir', 'validator_cli.jar');
if (!existsSync(jar)) {
  abbrechen(
    `Validator nicht gefunden: ${jar}\n` +
      'validator_cli.jar von https://github.com/hapifhir/org.hl7.fhir.core/releases dort ablegen ' +
      'oder den Pfad in FHIR_VALIDATOR_JAR angeben.',
  );
}

// 2. Ausgaben der Tests ablegen
rmSync(ORDNER, { recursive: true, force: true });
mkdirSync(RESSOURCEN, { recursive: true });
const tests = spawnSync('npx', ['vitest', 'run', ...konfiguration.testdateien], {
  stdio: 'inherit',
  env: { ...process.env, FHIR_AUSGABE: RESSOURCEN },
});
if (tests.status !== 0) abbrechen('Die Tests sind fehlgeschlagen — erst sie, dann der Validator.');

// 3. Validator
const argumente = [
  '-jar',
  jar,
  RESSOURCEN,
  '-version',
  konfiguration.fhirVersion,
  ...konfiguration.pakete.flatMap((p) => ['-ig', p]),
  '-tx',
  konfiguration.terminologie,
  '-allow-example-urls',
  'true',
  ...konfiguration.erweiterungenErlaubt.flatMap((d) => ['-extension', d]),
  '-output',
  BERICHT,
];
console.log(`\n${JAVA} ${argumente.join(' ')}\n`);
const lauf = spawnSync(JAVA, argumente, { stdio: 'inherit' });
if (!existsSync(BERICHT))
  abbrechen(`Der Validator hat keinen Bericht geschrieben (Status ${lauf.status}).`);

// 4. Bericht auswerten
const bericht = JSON.parse(readFileSync(BERICHT, 'utf8'));
const ergebnisse =
  bericht.resourceType === 'Bundle' ? bericht.entry.map((e) => e.resource) : [bericht];
const DATEI = 'http://hl7.org/fhir/StructureDefinition/operationoutcome-file';
// Ausnahmen greifen über den Meldungstext (`muster`) oder über das Profil der geprüften Datei
// (`profil`) — Letzteres für ganze Artefakte, die bewusst noch nicht angeglichen sind.
const ausnahmen = konfiguration.ausnahmen.map((a) => ({
  ...a,
  muster: a.muster ? new RegExp(a.muster) : null,
  profil: a.profil ? new RegExp(a.profil) : null,
}));
function profileVon(datei) {
  try {
    return JSON.parse(readFileSync(datei, 'utf8')).meta?.profile ?? [];
  } catch {
    return [];
  }
}
const offen = [];
const ausgenommen = new Map();
let warnungen = 0;
for (const oo of ergebnisse) {
  const datei = (oo.extension ?? []).find((x) => x.url === DATEI)?.valueString ?? '?';
  const profile = profileVon(datei);
  for (const issue of oo.issue ?? []) {
    const text = issue.details?.text ?? issue.diagnostics ?? '';
    if (issue.severity === 'warning') warnungen += 1;
    if (issue.severity !== 'error' && issue.severity !== 'fatal') continue;
    const ausnahme = ausnahmen.find(
      (a) => a.muster?.test(text) || (a.profil && profile.some((pr) => a.profil.test(pr))),
    );
    if (ausnahme) {
      ausgenommen.set(ausnahme.grund, (ausgenommen.get(ausnahme.grund) ?? 0) + 1);
      continue;
    }
    const ort = (issue.expression ?? issue.location ?? [])[0] ?? '';
    offen.push({ datei: datei.split(/[\\/]/).pop(), ort, text });
  }
}

// Eine Ausnahme ohne Treffer kann entfallen, wenn der Ballot den Fehler behoben oder die Demo
// einen Umweg gefunden hat (ADR 0040). Sie lässt den Lauf nicht scheitern, wird aber gemeldet.
const ohneTreffer = konfiguration.ausnahmen
  .map((a) => a.grund)
  .filter((grund) => !ausgenommen.has(grund));

const zusammenfassung = {
  dateien: ergebnisse.length,
  fehler: offen.length,
  ausgenommen: Object.fromEntries(ausgenommen),
  ausnahmenOhneTreffer: ohneTreffer,
  warnungen,
};
writeFileSync(join(ORDNER, 'zusammenfassung.json'), JSON.stringify(zusammenfassung, null, 2));
const markdown = alsMarkdown();
writeFileSync(join(ORDNER, 'zusammenfassung.md'), markdown);

console.log(`\n${ergebnisse.length} Dateien geprüft · ${warnungen} Warnungen`);
for (const [grund, zahl] of ausgenommen) console.log(`ausgenommen (${zahl}): ${grund}`);
for (const grund of ohneTreffer) console.warn(`Ausnahme ohne Treffer, kann entfallen: ${grund}`);

// GitHub Actions: Zusammenfassung auf der Seite des Laufs, Fehler und überholte Ausnahmen als
// Anmerkungen. Die Werte stehen in Workflow-Befehlen, deshalb die Maskierung.
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, markdown);
if (process.env.GITHUB_ACTIONS === 'true') {
  const befehl = (s) => s.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
  for (const f of offen.slice(0, MAX_EINZELN)) {
    console.log(`::error title=FHIR-Validator::${befehl(`${f.datei} · ${f.ort}: ${f.text}`)}`);
  }
  for (const grund of ohneTreffer) {
    console.log(`::warning title=FHIR-Validator - Ausnahme ohne Treffer::${befehl(grund)}`);
  }
}

if (offen.length > 0) {
  const liste = offen.map((f) => `${f.datei} · ${f.ort}\n    ${f.text}`).join('\n');
  console.error(`\n${offen.length} Fehler:\n\n${liste}`);
  process.exit(1);
}
console.log('Keine Fehler.');

/** Zusammenfassung als Markdown — für die Seite des Laufs und `zusammenfassung.md`. */
function alsMarkdown() {
  const zelle = (s) => s.replace(/\|/g, '\\|').replace(/\n/g, ' ');
  const zeilen = [
    '## FHIR-Validator',
    '',
    `${ergebnisse.length} Dateien geprüft · ${
      offen.length === 0 ? '**keine Fehler**' : `**${offen.length} Fehler**`
    } · ${warnungen} Warnungen · Pakete: ${konfiguration.pakete.map((p) => `\`${p}\``).join(', ')}`,
    '',
  ];
  if (ausgenommen.size > 0) {
    zeilen.push('| Ausnahme (Grund) | Fehler |', '| --- | ---: |');
    for (const [grund, zahl] of ausgenommen) zeilen.push(`| ${zelle(grund)} | ${zahl} |`);
    zeilen.push('');
  }
  if (ohneTreffer.length > 0) {
    zeilen.push('**Ausnahmen ohne Treffer** — können entfallen (ADR 0040):', '');
    for (const grund of ohneTreffer) zeilen.push(`- ${zelle(grund)}`);
    zeilen.push('');
  }
  if (offen.length > 0) {
    const anzahl = Math.min(offen.length, MAX_EINZELN);
    zeilen.push(`**Fehler** (${anzahl} von ${offen.length}; alle im Artefakt „fhir-validierung“):`);
    zeilen.push('');
    for (const f of offen.slice(0, MAX_EINZELN)) {
      zeilen.push(`- \`${f.datei}\` · \`${f.ort}\` — ${zelle(f.text)}`);
    }
    zeilen.push('');
  }
  return `${zeilen.join('\n')}\n`;
}
