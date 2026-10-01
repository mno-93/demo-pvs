#!/usr/bin/env node
/**
 * Startet Praxisverwaltung und ePA-Simulator nebeneinander.
 *
 * npm führt Workspace-Skripte nacheinander aus; für zwei dauerhaft laufende Dienste
 * taugt das nicht. Statt dafür eine Abhängigkeit aufzunehmen, übernimmt dieses Skript
 * das Starten, kennzeichnet die Ausgaben mit einem Präfix und beendet beide gemeinsam.
 */
import { spawn } from 'node:child_process';

const dienste = [
  { name: 'pvs', paket: '@demo-pvs/pvs' },
  { name: 'epa', paket: '@demo-pvs/epa-sim' },
];

const kinder = dienste.map(({ name, paket }) => {
  const kind = spawn('npm', ['run', 'dev', '--workspace', paket], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: process.env,
  });
  const ausgeben = (strom) => {
    strom.setEncoding('utf8');
    strom.on('data', (text) => {
      for (const zeile of text.split('\n')) {
        if (zeile.trim()) console.info(`[${name}] ${zeile}`);
      }
    });
  };
  ausgeben(kind.stdout);
  ausgeben(kind.stderr);
  kind.on('exit', (code) => {
    if (code !== 0 && code !== null) console.error(`[${name}] beendet mit Code ${code}`);
  });
  return kind;
});

const beenden = () => {
  for (const kind of kinder) kind.kill('SIGTERM');
  process.exit(0);
};
process.on('SIGINT', beenden);
process.on('SIGTERM', beenden);

console.info('Praxisverwaltung: http://localhost:5173 - ePA-Simulator: http://localhost:8787');
console.info('Beenden mit Strg+C.');
