/* global WebSocket -- in Node ab Version 22 eingebaut */
// Fotografiert eine HTML-Seite mit Chrome ohne Oberfläche — Ausgangsbild für einen erfundenen Scan.
// Aufruf: node werkzeuge/scans/seite-fotografieren.mjs <seite.html> <breite> <hoehe> <ausgabe.png>
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const [seite, breite, hoehe, ausgabe] = process.argv.slice(2);
const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const profil = fs.mkdtempSync(path.join(os.tmpdir(), 'scan-'));
const chrome = spawn(
  CHROME,
  ['--headless=new', '--remote-debugging-port=9399', `--user-data-dir=${profil}`, 'about:blank'],
  { stdio: 'ignore' },
);
await new Promise((r) => setTimeout(r, 5000));
const ziel = (await (await fetch('http://127.0.0.1:9399/json')).json()).find(
  (t) => t.type === 'page',
);
const ws = new WebSocket(ziel.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r));
let id = 0;
const offen = new Map();
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data);
  if (m.id && offen.has(m.id)) {
    offen.get(m.id)(m);
    offen.delete(m.id);
  }
});
const rufe = (method, params = {}) =>
  new Promise((r) => {
    const i = ++id;
    offen.set(i, r);
    ws.send(JSON.stringify({ id: i, method, params }));
  });
await rufe('Emulation.setDeviceMetricsOverride', {
  width: Number(breite),
  height: Number(hoehe),
  deviceScaleFactor: 1.25,
  mobile: false,
});
await rufe('Page.navigate', { url: `file://${path.resolve(seite)}` });
await new Promise((r) => setTimeout(r, 1500));
const bild = await rufe('Page.captureScreenshot', { format: 'png' });
fs.writeFileSync(ausgabe, Buffer.from(bild.result.data, 'base64'));
ws.close();
chrome.kill();
console.log('fotografiert', ausgabe);
