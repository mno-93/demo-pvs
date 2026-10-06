import type { FastifyInstance } from 'fastify';
import { bytesAus, sha256Hex } from './plattform.ts';
import type { Ressource } from '@demo-pvs/kern';
import { bestandFuer, type Dokument } from './bestand.ts';
import { AB_STUFE, abStufe, STUFE } from './betrieb.ts';
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
 * Einstellen läuft im Release über den XDS Document Service (ITI-41, SOAP) und ist nicht
 * nachgebildet. Welche Dokumente sichtbar sind, hängt vom Ausbaustand ab: Im Release 3.1.3
 * liegen Laborbefunde als PDF vor, in der Vorschau auf ePA 3.2 als strukturierter
 * FHIR-Laborbefund (Fachkonzept dgLP, Stufe 1).
 */

export const MHD_BASIS = '/epa/mhd/api/v1/fhir';
export const MHD_ABRUF = '/epa/mhd/retrieve/v1/content';

const ENDUNG: Record<string, string> = {
  'application/fhir+json': 'json',
  'application/fhir+xml': 'xml',
  'application/xml': 'xml',
  'application/pdf': 'pdf',
};

/** entryUUID eines Dokuments — aus seiner Kennung abgeleitet, damit sie stabil bleibt. */
export function eintragsUuid(d: Dokument): string {
  const h = sha256Hex(`entry:${d.id}`);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

export function sichtbar(d: Dokument): boolean {
  // Eine Fassung, die ab einer Stufe strukturiert vorliegt, verschwindet dort als PDF.
  if (d.ersetztAb && abStufe(STUFE[d.ersetztAb])) return false;
  if (!d.nurIn) return true;
  return d.nurIn === 'release-3.1.3' ? !abStufe(1) : abStufe(STUFE[d.nurIn]);
}

function alsDocumentReference(d: Dokument, kvnr: string): Ressource {
  const kodierung = (k: { code: string; system: string; anzeige: string }) => ({
    coding: [{ system: `urn:oid:${k.system}`, code: k.code, display: k.anzeige }],
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
      { type: 'Organization', display: d.einrichtung },
    ],
    description: d.titel,
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
                system: `urn:oid:${d.formatCode.system}`,
                code: d.formatCode.code,
                display: d.formatCode.anzeige,
              },
            }
          : {}),
      },
    ],
  };
}

/** Text eines Dokuments für die Volltextsuche — Titel, Autor, Einrichtung und Inhalt. */
function volltext(d: Dokument): string {
  return [d.titel, d.autor, d.einrichtung, d.text ?? '', d.inhalt ? JSON.stringify(d.inhalt) : '']
    .join(' ')
    .toLowerCase();
}

function codeAus(wert: string | undefined): string | undefined {
  return wert?.split('|').pop();
}

export function mhdEinhaengen(
  app: FastifyInstance,
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
    const klasse = codeAus(eins('category'));
    const begriff = eins('_content')?.toLowerCase().trim();
    // Volltextsuche erst ab Weiterentwicklung 1 (ADR 0034). Ein nicht unterstützter
    // Suchparameter wird abgelehnt, nicht stillschweigend übergangen.
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
    const kennung = eins('identifier');
    const treffer = bestandFuer(kvnr).dokumente.filter(
      (d) =>
        sichtbar(d) &&
        status.split(',').includes('current') &&
        (!typ || d.typeCode.code === typ) &&
        (!klasse || d.classCode.code === klasse) &&
        (!begriff || begriff.split(/\s+/).every((w) => volltext(d).includes(w))) &&
        // Abfrage „seit": `_lastUpdated` und `date` (SHALL in IG 1.1.3) — beide auf der Einstellung.
        imZeitraum(d.eingestellt ?? d.erstellt, q['_lastUpdated']) &&
        imZeitraum(d.eingestellt ?? d.erstellt, q['date']) &&
        (!kennung ||
          kennungPasst({ system: 'urn:ietf:rfc:3986', value: d.uniqueId }, kennung) ||
          kennungPasst(
            { system: 'urn:ietf:rfc:3986', value: `urn:uuid:${eintragsUuid(d)}` },
            kennung,
          )),
    );
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
          fullUrl: `${MHD_BASIS}/DocumentReference/${String(r.id)}`,
          resource: r,
          search: { mode: 'match' },
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
              { name: 'status', type: 'token' },
              { name: 'type', type: 'token' },
              { name: 'category', type: 'token' },
              { name: 'identifier', type: 'token' },
              { name: 'date', type: 'date' },
              { name: '_lastUpdated', type: 'date' },
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
    const d = bestandFuer(kvnr).dokumente.find((x) => sichtbar(x) && eintragsUuid(x) === uuid);
    if (!d) return antwort.code(404).send();
    const annehmen = String(anfrage.headers['accept'] ?? '*/*');
    if (!annehmen.includes('*/*') && !annehmen.includes(d.mimeType))
      return antwort.code(406).send();
    void antwort.header('content-type', d.mimeType);
    if (d.inhalt) return JSON.stringify(d.inhalt);
    return bytesAus(d.datei ?? '');
  });
}
