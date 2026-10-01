#!/usr/bin/env node
/**
 * Übernimmt die im XDS Document Service registrierten Dokumenttypen nach daten/kataloge/.
 *
 * Quelle: das öffentliche Repository gematik/ePA-XDS-Document (Branch des Release), Verzeichnis
 * src/implementation_guides/ — je registriertem Dokumenttyp eine JSON-Datei mit classCode,
 * typeCode und formatCode. Pfad zum lokalen Klon in `EPA_XDS_REPO`. Das Repository wird nur
 * gelesen; Branch und Commit stehen im Kopf der erzeugten Datei.
 *
 * Zweck: Das Demo-PVS soll bei jedem Dokument sagen können, ob es im freigegebenen Release
 * registriert ist oder einen Vorgriff auf ein späteres Release darstellt — ohne dass
 * formatCodes erfunden werden.
 *
 * Aufruf: node werkzeuge/formatcodes-aus-xds.mjs
 */
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const REPO = process.env.EPA_XDS_REPO;
if (!REPO) {
  console.error('EPA_XDS_REPO ist nicht gesetzt — Pfad zum Klon von gematik/ePA-XDS-Document.');
  process.exit(1);
}
const VERZEICHNIS = join(REPO, 'src', 'implementation_guides');
const ZIEL = 'daten/kataloge/dokumenttypen-epa.json';

const git = (...a) => {
  try {
    return execFileSync('git', ['-C', REPO, ...a], { encoding: 'utf8' }).trim();
  } catch {
    return 'unbekannt';
  }
};

function wert(metadaten, name) {
  const eintrag = metadaten.find((m) => m.name === name);
  const v = Array.isArray(eintrag?.value) ? eintrag.value[0] : eintrag?.value;
  return v
    ? { code: v.code ?? null, system: v.codeSystem ?? null, anzeige: v.displayName ?? null }
    : null;
}

const eintraege = [];
for (const datei of readdirSync(VERZEICHNIS).filter(
  (d) => d.startsWith('ig-') && d.endsWith('.json'),
)) {
  const ig = JSON.parse(readFileSync(join(VERZEICHNIS, datei), 'utf8'));
  for (const element of ig.elements ?? []) {
    const m = element.metadata ?? [];
    const format = wert(m, 'documentEntry.formatCode');
    if (!format?.code) continue;
    const mime = m.find((x) => x.name === 'documentEntry.mimeType')?.value;
    eintraege.push({
      datei,
      bezeichnung: ig.name ?? element.name,
      element: element.name,
      formatCode: format.code,
      formatSystem: format.system,
      formatAnzeige: format.anzeige,
      mimeTypes: (Array.isArray(mime) ? mime.flat() : mime ? [mime] : []).filter(
        (x) => typeof x === 'string',
      ),
      classCode: wert(m, 'documentEntry.classCode'),
      typeCode: wert(m, 'documentEntry.typeCode'),
    });
  }
}

const inhalt = {
  _katalog: 'Registrierte Dokumenttypen des XDS Document Service',
  _art: 'aus ePA-XDS-Document übernommen',
  _hinweis:
    'Automatisch übernommen, nicht von Hand ändern. Ein Dokumenttyp, der hier fehlt, ist im Release nicht registriert — ' +
    'etwa der strukturierte Krankenhausentlassbrief und der Laborbefund nach dgLP.',
  _stand: {
    repository: 'gematik/ePA-XDS-Document',
    branch: git('rev-parse', '--abbrev-ref', 'HEAD'),
    commit: git('rev-parse', '--short', 'HEAD'),
    commitDatum: git('log', '-1', '--format=%ad', '--date=short'),
    quelle: 'src/implementation_guides/',
  },
  eintraege: eintraege.sort((a, b) => a.formatCode.localeCompare(b.formatCode)),
};
writeFileSync(ZIEL, JSON.stringify(inhalt, null, 2) + '\n', 'utf8');
console.info(
  `${ZIEL} — ${eintraege.length} registrierte Dokumenttypen (${inhalt._stand.branch} @ ${inhalt._stand.commit})`,
);
