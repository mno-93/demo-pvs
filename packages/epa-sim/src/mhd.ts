import type { SimAnwendung } from './schnittstelle.ts';
import { bytesAus, sha256Hex, uuidV7 } from './plattform.ts';
import { vollUrl, type Ressource } from '@demo-pvs/kern';
import { bestandFuer, type Dokument, type Kodewert } from './bestand.ts';
import { TELEMATIK_ID } from './schreibwege.ts';
import { AB_STUFE, abStufe, STUFE } from './betrieb.ts';
import {
  EPS_TYP,
  MHD_VORSCHAU,
  epaEpsBilden,
  epsAblegen,
  epsAbrufen,
  epsVerweis,
} from './epa-eps.ts';
import { imZeitraum, jetzt, kennungPasst, operationOutcome } from './fhir-hilfen.ts';

/**
 * MHD Service nach dem Implementation Guide `de.gematik.epa.mhd` 1.1.3 (Release ePA 3.1.3).
 *
 * - **Find Document References [ITI-67]** — `GET|POST /epa/mhd/api/v1/fhir/DocumentReference`,
 *   Suche über die Metadaten und Volltextsuche über `_content`; Antwort nach
 *   `EPADocumentSearchResultBundle`, Einträge nach `EPAMHDDocumentReference`.
 * - **Retrieve Document [ITI-68]** — `GET /epa/mhd/retrieve/v1/content/<entryUUID>.<Endung>`,
 *   das Dokument im MIME-Typ aus `content.attachment.contentType`, unverändert.
 *
 * Einstellen läuft über den XDS Document Service (ITI-41, SOAP, `xds.ts`); was dort eingestellt
 * wird, findet dieser Dienst unter der vergebenen entryUUID. Welche Dokumente sichtbar sind, hängt vom Ausbaustand ab: Im Release 3.1.3
 * liegen Laborbefunde als PDF vor, in der Vorschau auf ePA 3.2 als strukturierter
 * FHIR-Laborbefund (Fachkonzept dgLP, Stufe 1).
 *
 * **Vorschau auf ePA 3.2** (Ballot `de.gematik.epa.mhd` 1.2.0-ballot.1, ADR 0042): Die Suche nach
 * `type=http://loinc.org|60591-5` erzeugt die leere ePA European Patient Summary des
 * Aktensystems samt DocumentReference nach 1.2.0 (IG-MHD27048WTV, `epa-eps.ts`). Sie ist nicht
 * versioniert — mit `status=superseded` gibt es nie einen Treffer — und erscheint in keiner
 * anderen Suche. Alle übrigen Wege und Kennungen bleiben bei 1.1.3.
 */

export const MHD_BASIS = '/epa/mhd/api/v1/fhir';
export const MHD_ABRUF = '/epa/mhd/retrieve/v1/content';

const ENDUNG: Record<string, string> = {
  'application/fhir+json': 'json',
  'application/fhir+xml': 'xml',
  'application/xml': 'xml',
  'application/pdf': 'pdf',
};

/** Abgeleitete entryUUIDs je Dokumentkennung — SHA-256 in JavaScript ist nicht umsonst. */
const ABGELEITETE_UUIDS = new Map<string, string>();

/** entryUUID eines Dokuments — aus seiner Kennung abgeleitet, damit sie stabil bleibt. */
export function eintragsUuid(d: Dokument): string {
  if (d.entryUuid) return d.entryUuid;
  let uuid = ABGELEITETE_UUIDS.get(d.id);
  if (!uuid) {
    const h = sha256Hex(`entry:${d.id}`);
    uuid = `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
    ABGELEITETE_UUIDS.set(d.id, uuid);
  }
  return uuid;
}

/** codingScheme der XDS-Metadaten als URI: eine OID mit `urn:oid:`, eine URL unverändert. */
function alsUri(system: string): string {
  return /^\d+(\.\d+)+$/.test(system) ? `urn:oid:${system}` : system;
}

export function sichtbar(d: Dokument): boolean {
  // Eine Fassung, die ab einer Stufe strukturiert vorliegt, verschwindet dort als PDF.
  if (d.ersetztAb && abStufe(STUFE[d.ersetztAb])) return false;
  if (!d.nurIn) return true;
  return d.nurIn === 'release-3.1.3' ? !abStufe(1) : abStufe(STUFE[d.nurIn]);
}

/** Krankenhaus und Arztpraxis wie im Beispiel des IG; die übrigen ⚠ ohne Abgleich mit der Werteliste. */
const EINRICHTUNGSART = {
  krankenhaus: { code: 'KHS', system: '1.3.6.1.4.1.19376.3.276.1.5.2', anzeige: 'Krankenhaus' },
  praxis: { code: 'PRA', system: '1.3.6.1.4.1.19376.3.276.1.5.2', anzeige: 'Arztpraxis' },
  mvz: {
    code: 'MVZ',
    system: '1.3.6.1.4.1.19376.3.276.1.5.2',
    anzeige: 'Medizinisches Versorgungszentrum',
  },
} as const satisfies Record<string, Kodewert>;

/**
 * `context.facilityType` (1..1 im Profil): aus ITI-41 übernommen; im Startbestand ⚠ aus dem Namen
 * der fiktiven Einrichtung abgeleitet.
 */
function einrichtungsartVon(d: Dokument): Kodewert {
  if (d.einrichtungsart) return d.einrichtungsart;
  if (/klinik|krankenhaus/i.test(d.einrichtung)) return EINRICHTUNGSART.krankenhaus;
  if (/\bMVZ\b/.test(d.einrichtung)) return EINRICHTUNGSART.mvz;
  return EINRICHTUNGSART.praxis;
}

function alsDocumentReference(d: Dokument, kvnr: string): Ressource {
  const kodierung = (k: { code: string; system: string; anzeige: string }) => ({
    coding: [{ system: alsUri(k.system), code: k.code, display: k.anzeige }],
  });
  const uuid = eintragsUuid(d);
  return {
    resourceType: 'DocumentReference',
    id: uuid,
    meta: {
      lastUpdated: d.eingestellt ?? d.erstellt,
      profile: ['https://gematik.de/fhir/epa-mhd/StructureDefinition/epa-mhd-document-reference'],
    },
    masterIdentifier: { use: 'usual', system: 'urn:ietf:rfc:3986', value: d.uniqueId },
    identifier: [
      { use: 'official', system: 'urn:ietf:rfc:3986', value: `urn:uuid:${uuid}` },
      { use: 'usual', system: 'urn:ietf:rfc:3986', value: d.uniqueId },
    ],
    status: 'current',
    type: kodierung(d.typeCode),
    category: [kodierung(d.classCode)],
    subject: {
      type: 'Patient',
      identifier: { system: 'http://fhir.de/sid/gkv/kvid-10', value: kvnr },
    },
    date: d.eingestellt ?? d.erstellt,
    author: [
      { type: 'Practitioner', display: d.autor },
      {
        type: 'Organization',
        ...(d.einrichtungTelematikId
          ? { identifier: { system: TELEMATIK_ID, value: d.einrichtungTelematikId } }
          : {}),
        display: d.einrichtung,
      },
    ],
    description: d.titel,
    ...(d.vertraulichkeit ? { securityLabel: [kodierung(d.vertraulichkeit)] } : {}),
    content: [
      {
        attachment: {
          contentType: d.mimeType,
          language: 'de-DE',
          url: `${MHD_ABRUF}/${uuid}.${ENDUNG[d.mimeType] ?? 'bin'}`,
          size: d.groesseBytes,
          title: d.titel,
          creation: d.erstellt,
        },
        // Ohne registrierten formatCode bleibt das Element leer, statt einen Code zu erfinden.
        // ⚠ Das Profil verlangt es (1..1) — solche Dokumente gibt es nur in der Vorschau.
        ...(d.formatCode
          ? {
              format: {
                system: alsUri(d.formatCode.system),
                code: d.formatCode.code,
                display: d.formatCode.anzeige,
              },
            }
          : {}),
      },
    ],
    // Metadaten aus ITI-41: Einrichtungsart (1..1) und Fachrichtung.
    context: {
      facilityType: kodierung(einrichtungsartVon(d)),
      ...(d.fachrichtung ? { practiceSetting: kodierung(d.fachrichtung) } : {}),
    },
  };
}

/** Text eines Dokuments für die Volltextsuche — Titel, Autor, Einrichtung und Inhalt. */
function volltext(d: Dokument): string {
  return (
    [d.titel, d.autor, d.einrichtung, d.text ?? '', d.inhalt ? JSON.stringify(d.inhalt) : '']
      .join(' ')
      // Zeilenumbrüche im JSON stehen als „\n" da — sonst klebte das nächste Wort an einem „n".
      .replace(/\\[nrt]/g, ' ')
      .toLowerCase()
  );
}

/**
 * Ein Suchwort trifft am **Wortanfang**: „niere" findet „Niereninsuffizienz", „ASS" aber nicht
 * „Entlassbrief". ⚠ Wie die Volltextsuche des Aktensystems Wörter zerlegt, legt die
 * Spezifikation nicht fest; ein Teilwort-Treffer mitten im Wort wäre für Nutzende nicht
 * nachvollziehbar.
 */
function wortanfang(wort: string): RegExp {
  const maskiert = wort.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^\\p{L}\\p{N}])${maskiert}`, 'u');
}

function codeAus(wert: string | undefined): string | undefined {
  return wert?.split('|').pop();
}

/** Codesystem eines Token-Parameters, falls angegeben (`system|code`). */
function systemAus(wert: string | undefined): string | undefined {
  return wert?.includes('|') ? wert.split('|')[0] : undefined;
}

/** Token `code`, `system|code` oder `|code` gegen einen Kodewert; OIDs auch als `urn:oid:`. */
function tokenPasst(k: Kodewert | null | undefined, wert: string): boolean {
  if (!k) return false;
  const code = codeAus(wert);
  const system = systemAus(wert);
  if (code !== k.code) return false;
  if (system === undefined) return true;
  if (system === '') return !k.system;
  return system === k.system || system === alsUri(k.system);
}

/** FHIR-Suche nach Zeichenketten: Anfang, ohne Groß- und Kleinschreibung. */
const beginntMit = (text: string, wert: string) =>
  text.toLowerCase().startsWith(wert.toLowerCase());

/**
 * Vor- und Nachname aus dem Anzeigenamen des Autors — ⚠ Annahme der Demo: Titel vorn, Nachname
 * zuletzt. Ein Primärsystem bekäme die Namensteile aus `authorPerson` (XCN).
 */
function namensteile(anzeige: string): { vornamen: string[]; nachname: string } {
  const teile = anzeige
    .split(/\s+/)
    .filter((t) => t && !/^(Dr\.|med\.|Prof\.|dent\.|rer\.|nat\.|PD|Dipl\.-[\wäöü]+\.?)$/.test(t));
  return { vornamen: teile.slice(0, -1), nachname: teile[teile.length - 1] ?? '' };
}

/**
 * Suchparameter des Responders nach dem CapabilityStatement `epa-mhd-document-responder` 1.1.3,
 * je Dokument und Wert. Kommagetrennte Werte verknüpfen ODER, wiederholte Parameter UND (FHIR
 * Search). `event`, `period` und `related` kennt die Demo, aber kein Dokument trägt diese
 * Angaben — sie treffen nie.
 */
const SUCHE: Record<string, (d: Dokument, wert: string, kvnr: string) => boolean> = {
  _id: (d, w) => eintragsUuid(d) === w,
  _lastUpdated: (d, w) => imZeitraum(d.eingestellt ?? d.erstellt, w),
  date: (d, w) => imZeitraum(d.eingestellt ?? d.erstellt, w),
  creation: (d, w) => imZeitraum(d.erstellt, w),
  status: (_d, w) => w === 'current',
  type: (d, w) => tokenPasst(d.typeCode, w),
  category: (d, w) => tokenPasst(d.classCode, w),
  format: (d, w) => tokenPasst(d.formatCode, w),
  facility: (d, w) => tokenPasst(einrichtungsartVon(d), w),
  setting: (d, w) => tokenPasst(d.fachrichtung, w),
  'security-label': (d, w) => tokenPasst(d.vertraulichkeit, w),
  contenttype: (d, w) =>
    tokenPasst({ code: d.mimeType, system: 'urn:ietf:bcp:13', anzeige: d.mimeType }, w),
  language: (_d, w) => tokenPasst({ code: 'de-DE', system: 'urn:ietf:bcp:47', anzeige: '' }, w),
  identifier: (d, w) =>
    kennungPasst({ system: 'urn:ietf:rfc:3986', value: d.uniqueId }, w) ||
    kennungPasst({ system: 'urn:ietf:rfc:3986', value: `urn:uuid:${eintragsUuid(d)}` }, w),
  'patient.identifier': (_d, w, kvnr) =>
    kennungPasst({ system: 'http://fhir.de/sid/gkv/kvid-10', value: kvnr }, w),
  patient: (_d, w, kvnr) => w === `Patient/pat-${kvnr}` || w.endsWith(`/Patient/pat-${kvnr}`),
  title: (d, w) => beginntMit(d.titel, w),
  description: (d, w) => beginntMit(d.titel, w),
  'author.given': (d, w) => namensteile(d.autor).vornamen.some((v) => beginntMit(v, w)),
  'author.family': (d, w) => beginntMit(namensteile(d.autor).nachname, w),
  'author.organization.name': (d, w) => beginntMit(d.einrichtung, w),
  event: () => false,
  period: () => false,
  related: () => false,
};
/** FHIR-Steuerparameter, die die Demo hinnimmt, ohne dass sie das Ergebnis ändern. */
const STEUERUNG = new Set(['_format', '_pretty']);

/**
 * Vorschau ePA 3.2: Die Suche erzeugt die ePS und ihre DocumentReference (IG-MHD27048WTV) — neue
 * Kennungen bei jeder Suche, keine frühere Fassung.
 */
function epsSuchergebnis(kvnr: string, aktuell: boolean) {
  const treffer: Ressource[] = [];
  if (aktuell) {
    const entryUuid = uuidV7();
    epsAblegen(kvnr, entryUuid, epaEpsBilden(kvnr));
    treffer.push(epsVerweis(kvnr, entryUuid, uuidV7(), jetzt(), `${MHD_ABRUF}/${entryUuid}.json`));
  }
  return {
    resourceType: 'Bundle',
    meta: { lastUpdated: jetzt(), profile: [MHD_VORSCHAU.suchergebnis] },
    type: 'searchset',
    total: treffer.length,
    entry: treffer.map((r) => ({
      fullUrl: vollUrl(r),
      resource: r,
      search: { mode: 'match', score: 1 },
    })),
  };
}

export function mhdEinhaengen(
  app: SimAnwendung,
  kvnrAus: (anfrage: { headers: Record<string, unknown> }) => string,
) {
  /** ITI-67 Find Document References — GET mit Suchparametern oder POST als Formular. */
  const suchen = async (
    anfrage: {
      headers: Record<string, unknown>;
      query: unknown;
      body?: unknown;
    },
    antwort: { code: (c: number) => { send: (x: unknown) => unknown } },
  ) => {
    const kvnr = kvnrAus(anfrage);
    const q = {
      ...(anfrage.query as Record<string, string | string[] | undefined>),
      ...((typeof anfrage.body === 'object' && anfrage.body) || {}),
    } as Record<string, string | string[] | undefined>;
    const eins = (n: string) => ([] as string[]).concat(q[n] ?? [])[0];
    const status = eins('status') ?? 'current';
    const typ = codeAus(eins('type'));
    const typSystem = systemAus(eins('type'));
    if (
      typ === EPS_TYP &&
      (!typSystem || typSystem === 'http://loinc.org') &&
      abStufe(AB_STUFE.epaEps)
    ) {
      return epsSuchergebnis(kvnr, status.split(',').includes('current'));
    }
    // Ein Parameter, den der Dienst nicht kennt, wird abgelehnt — nicht übergangen, sonst kämen
    // alle Dokumente zurück.
    const unbekannt = Object.keys(q).filter(
      (n) => !SUCHE[n] && n !== '_content' && !STEUERUNG.has(n),
    );
    if (unbekannt.length > 0) {
      return antwort
        .code(400)
        .send(
          operationOutcome(
            'error',
            'not-supported',
            `Unbekannter Suchparameter: ${unbekannt.join(', ')}. Unterstützt: ${[
              ...Object.keys(SUCHE),
              ...(abStufe(AB_STUFE.volltextsuche) ? ['_content'] : []),
            ].join(', ')}.`,
          ),
        );
    }
    const begriff = eins('_content')?.toLowerCase().trim();
    // Volltextsuche erst ab Weiterentwicklung 1 (ADR 0034).
    if (begriff !== undefined && !abStufe(AB_STUFE.volltextsuche)) {
      return antwort
        .code(400)
        .send(
          operationOutcome(
            'error',
            'not-supported',
            'Suchparameter _content wird in diesem Ausbaustand nicht unterstützt.',
          ),
        );
    }
    // Wiederholte Parameter: UND; Werte mit Komma: ODER. Datumswerte mit Komma gibt es nicht.
    const bedingungen = Object.entries(q)
      .filter(([n]) => SUCHE[n])
      .flatMap(([n, werte]) =>
        ([] as string[]).concat(werte ?? []).map((w) => ({
          pruefen: SUCHE[n]!,
          werte: ['date', '_lastUpdated', 'creation'].includes(n) ? [w] : w.split(','),
        })),
      );
    // Je Suchwort ein Ausdruck, je Dokument ein Text — nicht je Paar.
    const woerter = (begriff ?? '').split(/\s+/).filter(Boolean).map(wortanfang);
    const treffer = bestandFuer(kvnr).dokumente.filter((d) => {
      if (!sichtbar(d)) return false;
      // Ohne `status` gilt jeder Status; die Demo führt nur aktuelle Fassungen.
      if (!bedingungen.every((b) => b.werte.some((w) => b.pruefen(d, w, kvnr)))) return false;
      if (woerter.length === 0) return true;
      const text = volltext(d);
      return woerter.every((m) => m.test(text));
    });
    return {
      resourceType: 'Bundle',
      meta: {
        lastUpdated: jetzt(),
        profile: [
          'https://gematik.de/fhir/epa-mhd/StructureDefinition/epa-document-search-result-bundle',
        ],
      },
      type: 'searchset',
      total: treffer.length,
      entry: treffer.map((d) => {
        const r = alsDocumentReference(d, kvnr);
        return {
          // Absolut, wie FHIR es für `fullUrl` verlangt; der Abruf läuft über `attachment.url`.
          fullUrl: vollUrl(r),
          resource: r,
          // Das Profil verlangt einen Score (1..1); ohne Rangfolge gilt jeder Treffer gleich.
          search: { mode: 'match', score: 1 },
        };
      }),
    };
  };
  /**
   * CapabilityStatement des Dokumentendienstes: welche Suchparameter er kennt. Das
   * Primärsystem bietet die Volltextsuche nur an, wenn `_content` darin steht.
   */
  app.get(`${MHD_BASIS}/metadata`, async () => ({
    resourceType: 'CapabilityStatement',
    status: 'active',
    kind: 'instance',
    fhirVersion: '4.0.1',
    format: ['application/fhir+json'],
    rest: [
      {
        mode: 'server',
        resource: [
          {
            type: 'DocumentReference',
            interaction: [{ code: 'read' }, { code: 'search-type' }],
            searchParam: [
              ...Object.keys(SUCHE).map((name) => ({
                name,
                type: ['_lastUpdated', 'date', 'creation', 'period'].includes(name)
                  ? 'date'
                  : ['patient', 'related'].includes(name)
                    ? 'reference'
                    : /^(title|description|author\.)/.test(name)
                      ? 'string'
                      : 'token',
              })),
              ...(abStufe(AB_STUFE.volltextsuche) ? [{ name: '_content', type: 'string' }] : []),
            ],
          },
        ],
      },
    ],
  }));
  app.get(`${MHD_BASIS}/DocumentReference`, suchen);
  app.post(`${MHD_BASIS}/DocumentReference/_search`, suchen);

  app.get(`${MHD_BASIS}/DocumentReference/:id`, async (anfrage, antwort) => {
    const kvnr = kvnrAus(anfrage);
    const d = bestandFuer(kvnr).dokumente.find(
      (x) => sichtbar(x) && eintragsUuid(x) === (anfrage.params as { id: string }).id,
    );
    return d
      ? alsDocumentReference(d, kvnr)
      : antwort.code(404).send(operationOutcome('error', 'not-found', 'Nicht gefunden.'));
  });

  /** ITI-68 Retrieve Document. Nicht vorhanden und verborgen sind nicht unterscheidbar: 404. */
  app.get(`${MHD_ABRUF}/:datei`, async (anfrage, antwort) => {
    const kvnr = kvnrAus(anfrage);
    const { datei } = anfrage.params as { datei: string };
    const uuid = datei.replace(/\.[a-z]+$/, '');
    const annehmen = String(anfrage.headers['accept'] ?? '*/*');
    // Eine erzeugte ePS liegt nicht im Bestand, sondern in der Ablage der letzten Suchen.
    const eps = abStufe(AB_STUFE.epaEps) ? epsAbrufen(kvnr, uuid) : undefined;
    if (eps) {
      if (!annehmen.includes('*/*') && !annehmen.includes('application/fhir+json'))
        return antwort.code(406).send();
      void antwort.header('content-type', 'application/fhir+json');
      return JSON.stringify(eps);
    }
    const d = bestandFuer(kvnr).dokumente.find((x) => sichtbar(x) && eintragsUuid(x) === uuid);
    if (!d) return antwort.code(404).send();
    if (!annehmen.includes('*/*') && !annehmen.includes(d.mimeType))
      return antwort.code(406).send();
    void antwort.header('content-type', d.mimeType);
    if (d.inhalt) return JSON.stringify(d.inhalt);
    return bytesAus(d.datei ?? '');
  });
}
