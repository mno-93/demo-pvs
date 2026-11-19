#!/usr/bin/env node
/**
 * Übernimmt die im XDS Document Service registrierten Dokumenttypen nach daten/kataloge/.
 *
 * Quelle: das öffentliche Repository gematik/ePA-XDS-Document (Branch des Release), Verzeichnis
 * src/implementation_guides/ — je registriertem Dokumenttyp eine JSON-Datei mit classCode,
 * typeCode und formatCode. Pfad zum lokalen Klon in `EPA_XDS_REPO`; mit `EPA_XDS_REF` (etwa
 * `origin/ePA-3.1.3`) liest das Skript diesen Stand über `git show`, ohne den Branch zu wechseln.
 * Das Repository wird nur gelesen; Branch und Commit stehen im Kopf der erzeugten Datei.
 *
 * Ein Implementation Guide kann je Element mehrere classCodes und typeCodes nennen, einzelne mit
 * `deprecatedFrom` oder `inactiveFrom`. Übernommen werden alle (`classCodes`, `typeCodes`); als
 * `classCode`/`typeCode` gilt der erste nicht abgekündigte — mit ihm stellt die Demo ein.
 *
 * Zweck: Das Demo-PVS soll bei jedem Dokument sagen können, ob es im freigegebenen Release
 * registriert ist oder einen Vorgriff auf ein späteres Release darstellt — ohne dass
 * formatCodes erfunden werden. Mit `gueltigAb` und `nurLesbarAb` weiß der Simulator auch, ob
 * ein registrierter Typ heute noch eingestellt werden darf.
 *
 * Aufruf: EPA_XDS_REPO=<Klon> [EPA_XDS_REF=origin/ePA-3.1.3] node werkzeuge/formatcodes-aus-xds.mjs
 */
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const REPO = process.env.EPA_XDS_REPO;
if (!REPO) {
  console.error('EPA_XDS_REPO ist nicht gesetzt — Pfad zum Klon von gematik/ePA-XDS-Document.');
  process.exit(1);
}
const REF = process.env.EPA_XDS_REF ?? null;
const VERZEICHNIS = 'src/implementation_guides';
const ZIEL = 'daten/kataloge/dokumenttypen-epa.json';

const git = (...a) => {
  try {
    return execFileSync('git', ['-C', REPO, ...a], { encoding: 'utf8' }).trim();
  } catch {
    return 'unbekannt';
  }
};

/** Dateien der Implementation Guides — aus dem Arbeitsverzeichnis oder aus `EPA_XDS_REF`. */
const dateien = REF
  ? git('ls-tree', '--name-only', `${REF}:${VERZEICHNIS}`).split(/\r?\n/)
  : readdirSync(join(REPO, VERZEICHNIS));
const lesen = (datei) =>
  REF
    ? execFileSync('git', ['-C', REPO, 'show', `${REF}:${VERZEICHNIS}/${datei}`], {
        encoding: 'utf8',
      })
    : readFileSync(join(REPO, VERZEICHNIS, datei), 'utf8');

/** Alle Werte eines Metadatums, mit Abkündigung. */
function werte(metadaten, name) {
  const eintrag = metadaten.find((m) => m.name === name);
  const liste = Array.isArray(eintrag?.value)
    ? eintrag.value
    : eintrag?.value
      ? [eintrag.value]
      : [];
  return liste
    .filter((v) => v && typeof v === 'object' && v.code)
    .map((v) => ({
      code: v.code,
      system: v.codeSystem ?? null,
      anzeige: v.displayName ?? null,
      abgekuendigtAb: v.deprecatedFrom ?? null,
      inaktivAb: v.inactiveFrom ?? null,
    }));
}

/** Der Wert, mit dem eingestellt wird: der erste nicht abgekündigte, sonst der erste. */
function bevorzugt(liste) {
  const v = liste.find((x) => !x.abgekuendigtAb && !x.inaktivAb) ?? liste[0];
  return v ? { code: v.code, system: v.system, anzeige: v.anzeige } : null;
}

const eintraege = [];
for (const datei of dateien.filter((d) => d.startsWith('ig-') && d.endsWith('.json'))) {
  const ig = JSON.parse(lesen(datei));
  for (const element of ig.elements ?? []) {
    const m = element.metadata ?? [];
    const format = bevorzugt(werte(m, 'documentEntry.formatCode'));
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
      classCode: bevorzugt(werte(m, 'documentEntry.classCode')),
      typeCode: bevorzugt(werte(m, 'documentEntry.typeCode')),
      classCodes: werte(m, 'documentEntry.classCode'),
      typeCodes: werte(m, 'documentEntry.typeCode'),
      // Gültigkeit nach README der Implementation Guides: vor `validFromDate` und ab
      // `clientReadOnlyFromDate` lehnt das Aktensystem das Einstellen ab.
      gueltigAb: ig.validFromDate ?? null,
      nurLesbarAb: ig.clientReadOnlyFromDate ?? null,
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
    branch: REF ? REF.replace(/^origin\//, '') : git('rev-parse', '--abbrev-ref', 'HEAD'),
    commit: git('rev-parse', '--short', REF ?? 'HEAD'),
    commitDatum: git('log', '-1', '--format=%ad', '--date=short', REF ?? 'HEAD'),
    quelle: 'src/implementation_guides/',
  },
  eintraege: eintraege.sort((a, b) => a.formatCode.localeCompare(b.formatCode)),
};
writeFileSync(ZIEL, JSON.stringify(inhalt, null, 2) + '\n', 'utf8');
console.info(
  `${ZIEL} — ${eintraege.length} registrierte Dokumenttypen (${inhalt._stand.branch} @ ${inhalt._stand.commit})`,
);
