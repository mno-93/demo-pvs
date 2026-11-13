#!/usr/bin/env node
/**
 * Baut Vorschauen einzelner Branches in die gehostete Fassung ein (ADR 0025, Nachtrag).
 *
 * GitHub Pages kennt je Repository eine Seite. Damit ein Diskussionsstand neben der Demo von main
 * erreichbar ist, liegt er unter `<basis>vorschau/<branch>/` in derselben Seite:
 *
 *   node werkzeuge/vorschau-einbauen.mjs --ziel packages/pvs/dist --basis /demo-pvs/ \
 *     --vorschau <branch>=<Ordner mit dem gebauten Branch> [--vorschau …]
 *
 * Der Branch muss mit `BASIS=<basis>vorschau/<branch>/` gebaut sein. Das Skript kopiert ihn an
 * seinen Ort, schreibt die Übersicht `vorschau/index.html` und ersetzt `404.html` durch eine
 * Weiche: Pages liefert für jede unbekannte Adresse die eine `404.html` der Seite aus. Die Kopie
 * der Startseite von main ließe eine tiefe Adresse der Vorschau in der Demo von main enden; die
 * Weiche lädt stattdessen die Startseite des Teils, zu dem die Adresse gehört. Ohne `--vorschau`
 * bleibt alles, wie `gehostet-bauen.mjs` es hinterlassen hat.
 */
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const argumente = process.argv.slice(2);
function wert(name) {
  const i = argumente.indexOf(name);
  return i >= 0 ? argumente[i + 1] : undefined;
}
const ziel = wert('--ziel');
const basis = `/${(wert('--basis') ?? '').replace(/^\/+|\/+$/g, '')}/`.replace(/^\/\/$/, '/');
const vorschauen = argumente
  .map((a, i) => (a === '--vorschau' ? argumente[i + 1] : null))
  .filter((a) => a !== null)
  .map((a) => {
    const trenner = String(a).indexOf('=');
    return { name: String(a).slice(0, trenner), ordner: String(a).slice(trenner + 1) };
  });

if (!ziel || !existsSync(join(ziel, 'index.html'))) {
  console.error('--ziel muss der Ordner der gebauten Demo sein (mit index.html).');
  process.exit(2);
}
for (const v of vorschauen) {
  // Der Name wird Teil einer Adresse und eines Dateipfads.
  if (!/^[a-z0-9][a-z0-9._-]*$/i.test(v.name)) {
    console.error(
      `Der Branchname „${v.name}“ taugt nicht als Unterpfad (Buchstaben, Ziffern, . _ -).`,
    );
    process.exit(2);
  }
  if (!existsSync(join(v.ordner, 'index.html'))) {
    console.error(`Für „${v.name}“ fehlt der gebaute Stand: ${v.ordner}/index.html`);
    process.exit(2);
  }
}
if (vorschauen.length === 0) {
  console.info('Keine Vorschau — die gehostete Fassung bleibt unverändert.');
  process.exit(0);
}

rmSync(join(ziel, 'vorschau'), { recursive: true, force: true });
for (const v of vorschauen) {
  const ort = join(ziel, 'vorschau', v.name);
  mkdirSync(ort, { recursive: true });
  cpSync(v.ordner, ort, { recursive: true });
  // Die 404.html des Branchs greift unter Pages nie; die Weiche unten vertritt sie.
  rmSync(join(ort, '404.html'), { force: true });
}

const kopf = `<!doctype html>
<html lang="de">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="robots" content="noindex, nofollow" />`;

writeFileSync(
  join(ziel, 'vorschau', 'index.html'),
  `${kopf}
    <title>Demo-PVS — Vorschauen</title>
    <style>
      body { font: 16px/1.5 system-ui, sans-serif; max-width: 42rem; margin: 3rem auto; padding: 0 1rem; }
      li { margin: 0.4rem 0; }
    </style>
  </head>
  <body>
    <h1>Demo-PVS — Vorschauen</h1>
    <p>Stände einzelner Branches zur Diskussion — fiktives System, fiktive Daten. Sie können von der <a href="${basis}">Demo</a> abweichen und wieder entfallen.</p>
    <ul>
${vorschauen.map((v) => `      <li><a href="${basis}vorschau/${v.name}/">${v.name}</a></li>`).join('\n')}
    </ul>
  </body>
</html>
`,
);

// Die Weiche schreibt die Startseite des passenden Teils an die Stelle der Fehlerseite. Die
// Adresse bleibt, wie sie ist; die Demo liest sie beim Start wie bei jedem anderen Aufruf.
const teile = vorschauen.map((v) => `${basis}vorschau/${v.name}/`);
writeFileSync(
  join(ziel, '404.html'),
  `${kopf}
    <title>Demo-PVS</title>
    <script>
      (function () {
        var teile = ${JSON.stringify(teile)};
        var start = ${JSON.stringify(basis)};
        for (var i = 0; i < teile.length; i += 1) {
          if (location.pathname.indexOf(teile[i]) === 0) start = teile[i];
        }
        fetch(start + 'index.html', { cache: 'no-cache' })
          .then(function (antwort) {
            if (!antwort.ok) throw new Error(String(antwort.status));
            return antwort.text();
          })
          .then(function (seite) {
            document.open();
            document.write(seite);
            document.close();
          })
          .catch(function () {
            location.replace(start);
          });
      })();
    </script>
  </head>
  <body></body>
</html>
`,
);

console.info(
  `Vorschau eingebaut: ${vorschauen.map((v) => `${basis}vorschau/${v.name}/`).join(', ')} — Übersicht ${basis}vorschau/`,
);
