#!/usr/bin/env node
/**
 * Prüft, ob vertrauliche Inhalte ins Repository geraten sind.
 *
 * Zwei Arten von Mustern:
 * - eingebaute, die nichts über das Projekt verraten: lokale Pfade, Schlüssel und Token,
 *   Verweise auf Ordner außerhalb des Repositorys;
 * - projektbezogene, die selbst nicht ins Repository gehören. Sie kommen aus der Umgebungsvariable
 *   `VERTRAULICH_MUSTER` (im Workflow aus einer Repository-Variable) oder aus der Datei
 *   `.vertraulich-muster` im Wurzelverzeichnis, die Git ignoriert. Ein Muster je Zeile, als
 *   regulärer Ausdruck ohne Groß- und Kleinschreibung; Zeilen mit # sind Kommentare.
 *
 * Geprüft werden alle Dateien, die Git verfolgt oder die zum Commit vorgemerkt sind.
 * Aufruf: npm run pruefen:vertraulich
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

const EINGEBAUT = [
  ['lokaler Pfad', /\/Users\/[^/\s]+\/|[A-Z]:\\Users\\/],
  ['Ordner außerhalb des Repositorys', /\.\.\/\.\.\/\.\.\/|\b[0-9]_[A-Z][a-z]+(?:_[A-Za-z]+)*\//],
  ['privater Schlüssel', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ['Zugangstoken', /\b(?:ghp|gho|ghu|ghs|github_pat)_[A-Za-z0-9_]{20,}|\bsk-[A-Za-z0-9]{20,}/],
];

const AUSGENOMMEN = [/^package-lock\.json$/, /^werkzeuge\/vertraulich-pruefen\.mjs$/];

function projektmuster() {
  const text =
    process.env.VERTRAULICH_MUSTER ??
    (existsSync('.vertraulich-muster') ? readFileSync('.vertraulich-muster', 'utf8') : '');
  return text
    .split(/\r?\n/)
    .map((z) => z.trim())
    .filter((z) => z && !z.startsWith('#'))
    .map((z) => ['Projektmuster', new RegExp(z, 'i')]);
}

const dateien = execFileSync('git', ['ls-files', '--cached'], { encoding: 'utf8' })
  .split('\n')
  .filter((d) => d && !AUSGENOMMEN.some((a) => a.test(d)) && existsSync(d));

const muster = [...EINGEBAUT, ...projektmuster()];
const funde = [];
for (const datei of dateien) {
  let inhalt;
  try {
    inhalt = readFileSync(datei, 'utf8');
  } catch {
    continue;
  }
  if (inhalt.includes('\u0000')) continue;
  inhalt.split('\n').forEach((zeile, i) => {
    for (const [art, re] of muster) {
      // Projektmuster werden in der Ausgabe nicht wiederholt — auch das Protokoll ist öffentlich.
      if (re.test(zeile)) funde.push(`${datei}:${i + 1}  ${art}`);
    }
  });
}

const anzahlProjekt = muster.length - EINGEBAUT.length;
if (anzahlProjekt === 0) {
  console.warn(
    'Hinweis: keine Projektmuster gesetzt (VERTRAULICH_MUSTER oder .vertraulich-muster) — nur eingebaute Prüfung.',
  );
}
if (funde.length > 0) {
  console.error(`Vertrauliche Inhalte gefunden (${funde.length}):`);
  for (const f of funde) console.error(`  ${f}`);
  process.exit(1);
}
console.log(`Keine Funde in ${dateien.length} Dateien (${muster.length} Muster).`);
