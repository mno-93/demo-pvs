#!/usr/bin/env node
/**
 * Baut die gehostete Fassung mit dem Simulator im Browser (ADR 0025) — auf jedem Betriebssystem.
 *
 * Aufruf: `npm run build:gehostet` oder mit Unterpfad `npm run build:gehostet -- --basis demo-pvs`.
 * Ohne `--basis` gilt die Umgebungsvariable `BASIS` (so setzt sie der Workflow), sonst `/`.
 * Der Unterpfad darf mit oder ohne Schrägstriche stehen; das Skript macht `/demo-pvs/` daraus.
 *
 * Bisher stand das als `VITE_SIMULATOR=browser npm run build && cp …` in package.json; unter
 * Windows führt npm Skripte mit cmd.exe aus, das weder diese Zuweisung noch `cp` kennt.
 */
import { spawnSync } from 'node:child_process';
import { copyFileSync } from 'node:fs';

const argumente = process.argv.slice(2);
const stelle = argumente.indexOf('--basis');
const angabe = stelle >= 0 ? argumente[stelle + 1] : process.env['BASIS'];
if (stelle >= 0 && !angabe) {
  console.error('--basis braucht einen Wert, etwa --basis demo-pvs');
  process.exit(2);
}
// Git Bash schreibt „/demo-pvs/“ als Argument in einen Windows-Pfad um („C:/Program Files/Git/…“).
if (angabe && /^[A-Za-z]:|\\/.test(angabe)) {
  console.error(
    `Der Unterpfad „${angabe}“ sieht wie ein Dateipfad aus. Ohne Schrägstriche angeben: --basis demo-pvs`,
  );
  process.exit(2);
}
const name = (angabe ?? '').replace(/^\/+|\/+$/g, '');
const basis = name ? `/${name}/` : undefined;

const umgebung = { ...process.env, VITE_SIMULATOR: 'browser', ...(basis ? { BASIS: basis } : {}) };
const bau = spawnSync('npm', ['run', 'build'], {
  stdio: 'inherit',
  env: umgebung,
  shell: process.platform === 'win32',
});
if (bau.status !== 0) process.exit(bau.status ?? 1);

// GitHub Pages liefert für unbekannte Pfade 404.html aus: dieselbe Seite, damit tiefe Adressen laden.
copyFileSync('packages/pvs/dist/index.html', 'packages/pvs/dist/404.html');
console.info(`Gehostete Fassung gebaut (Unterpfad ${basis ?? '/'}): packages/pvs/dist`);
