import type { FastifyInstance } from 'fastify';
import {
  ARZTBRIEF_XDS,
  DEMO_HEUTE,
  dokumenttypen,
  ITI41_AKTION,
  XDS_DOKUMENTENDIENST,
  briefAusFhir,
  briefTextzeilen,
  kvnrAusPatientId,
  nachrichtIdLesen,
  provideAndRegisterLesen,
  registryResponseErzeugen,
  type GeleseneEinreichung,
  type XdsFehler,
} from '@demo-pvs/kern';
import { bestandFuer, type Dokument } from './bestand.ts';
import { AB_STUFE, abStufe } from './betrieb.ts';
import { jetzt, neueId } from './fhir-hilfen.ts';
import { base64ZuText } from './plattform.ts';

/**
 * XDS Document Service — **Provide & Register Document Set-b [ITI-41]**.
 *
 * Grundlage: WSDL `XDSDocumentService.wsdl` (ePA-XDS-Document, Branch ePA-3.1.3, Commit
 * c88635c) und Konzept ePA 3.1.3 (ePA-Basic, Commit 3186ad2). Einstellen geht in der ePA nur
 * hier; der MHD Service ist lesend. Was eingestellt ist, findet der MHD Service sofort — unter
 * der entryUUID, die das Primärsystem vergeben hat.
 *
 * Geprüft wird, was die Demo belegen kann:
 * - die Aktion (`urn:ihe:iti:2007:ProvideAndRegisterDocumentSet-b`);
 * - die Patientenkennung gegen die adressierte Akte (`x-insurantid`) →
 *   `XDSPatientIdDoesNotMatch`;
 * - Inhalt je DocumentEntry → `XDSMissingDocument`;
 * - `classCode`, `typeCode`, `formatCode` vorhanden; der formatCode bekannt →
 *   `XDSRegistryMetadataError`. Bekannt sind PDF/A-1 für unstrukturierte Dokumente, die
 *   registrierten Dokumenttypen aus den Implementation Guides (Katalog `dokumenttypen`, mit
 *   passendem mimeType und innerhalb von `validFromDate` und `clientReadOnlyFromDate` — so
 *   beschreibt es der README der Implementation Guides) und, ab „Weiterentwicklung 2", der ✦
 *   formatCode des strukturierten Arztbriefs der Demo. Der CDA-eArztbrief (`ig-eab.json`) ist
 *   seit dem 01.04.2026 nur noch lesbar;
 * - eine uniqueId nur einmal je Akte.
 *
 * ⚠ Nicht nachgebildet: MTOM/XOP (das Dokument kommt inline), Prüfung gegen die Legal Policy
 * je Kategorie, Hash und Größe, SOAP-Faults bei Fehlern der Prüfkette (sie antwortet wie auf
 * allen ePA-Wegen mit JSON-Fehlercodes).
 */

const PDF_A1 = 'urn:ihe-d:spec:PDF_A1:2005';

const deutsch = (iso: string) => iso.split('-').reverse().join('.');

/** Prüft einen formatCode gegen die registrierten Dokumenttypen. `null`: nicht registriert. */
function registriert(format: string, mimeType: string, titel: string): XdsFehler | 'ok' | null {
  const typ = dokumenttypen.find((t) => t.formatCode === format);
  if (!typ) return null;
  if (typ.gueltigAb && typ.gueltigAb > DEMO_HEUTE)
    return {
      code: 'XDSRegistryMetadataError',
      text: `${titel}: Einstellen erst ab ${deutsch(typ.gueltigAb)} (${typ.datei}, validFromDate).`,
    };
  if (typ.nurLesbarAb && typ.nurLesbarAb <= DEMO_HEUTE)
    return {
      code: 'XDSRegistryMetadataError',
      text: `${titel}: Dieser Dokumenttyp ist seit ${deutsch(typ.nurLesbarAb)} nur noch lesbar (${typ.datei}, clientReadOnlyFromDate).`,
    };
  if (typ.mimeTypes.length > 0 && !typ.mimeTypes.includes(mimeType))
    return {
      code: 'XDSRegistryMetadataError',
      text: `${titel}: mimeType passt nicht zum formatCode.`,
    };
  return 'ok';
}

function pruefen(e: GeleseneEinreichung, kvnr: string): XdsFehler[] {
  const fehler: XdsFehler[] = [];
  if (e.aktion !== ITI41_AKTION)
    fehler.push({ code: 'XDSRepositoryError', text: `Unerwartete Aktion „${e.aktion}".` });
  if (kvnrAusPatientId(e.patientId) !== kvnr)
    fehler.push({
      code: 'XDSPatientIdDoesNotMatch',
      text: 'Die patientId des SubmissionSet passt nicht zur adressierten Akte.',
    });
  if (e.dokumente.length === 0)
    fehler.push({
      code: 'XDSRegistryMetadataError',
      text: 'Die Einreichung enthält kein Dokument.',
    });
  const bestand = bestandFuer(kvnr).dokumente;
  for (const d of e.dokumente) {
    if (kvnrAusPatientId(d.patientId) !== kvnr)
      fehler.push({
        code: 'XDSPatientIdDoesNotMatch',
        text: `${d.titel}: patientId passt nicht zur Akte.`,
      });
    if (!d.inhaltBase64)
      fehler.push({ code: 'XDSMissingDocument', text: `${d.titel}: Inhalt fehlt.` });
    if (!d.classCode.code || !d.typeCode.code || !d.formatCode.code)
      fehler.push({
        code: 'XDSRegistryMetadataError',
        text: `${d.titel}: classCode, typeCode und formatCode sind Pflicht.`,
      });
    const format = d.formatCode.code;
    const ig = format ? registriert(format, d.mimeType, d.titel) : 'ok';
    if (ig && ig !== 'ok') fehler.push(ig);
    else if (ig === 'ok') {
      /* registriert und gültig */
    } else if (format === ARZTBRIEF_XDS.formatCode.code) {
      if (!abStufe(AB_STUFE.strukturierteBriefe))
        fehler.push({
          code: 'XDSRegistryMetadataError',
          text: 'Für diesen formatCode gibt es im Release 3.1.3 keinen Implementation Guide.',
        });
      else if (d.mimeType !== 'application/fhir+json')
        fehler.push({
          code: 'XDSRegistryMetadataError',
          text: `${d.titel}: mimeType passt nicht zum formatCode.`,
        });
    } else if (format === PDF_A1) {
      if (d.mimeType !== 'application/pdf')
        fehler.push({
          code: 'XDSRegistryMetadataError',
          text: `${d.titel}: mimeType passt nicht zum formatCode.`,
        });
    } else if (format)
      fehler.push({
        code: 'XDSRegistryMetadataError',
        text: `${d.titel}: formatCode „${format}" ist unbekannt.`,
      });
    if (bestand.some((x) => x.uniqueId === `urn:oid:${d.uniqueId}`))
      fehler.push({
        code: 'XDSRegistryMetadataError',
        text: `${d.titel}: uniqueId ist bereits vergeben.`,
      });
  }
  return fehler;
}

/** Die XDS-Metadaten tragen UTC; der Bestand der Demo führt Ortszeit ohne Zone (`jetzt()`). */
function ortszeit(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const z = (w: number) => String(w).padStart(2, '0');
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}T${z(d.getHours())}:${z(d.getMinutes())}:${z(d.getSeconds())}`;
}

function alsDokument(d: GeleseneEinreichung['dokumente'][number]): Dokument {
  const roh = atob(d.inhaltBase64 ?? '');
  const json = d.mimeType === 'application/fhir+json';
  const inhalt = json
    ? (JSON.parse(base64ZuText(d.inhaltBase64 ?? '')) as Record<string, unknown>)
    : null;
  const vorlage = inhalt ? briefAusFhir(inhalt) : null;
  const zeilen = vorlage ? briefTextzeilen(vorlage) : undefined;
  return {
    id: neueId('xds'),
    entryUuid: d.entryUuid,
    uniqueId: `urn:oid:${d.uniqueId}`,
    titel: d.titel,
    classCode: d.classCode,
    typeCode: d.typeCode,
    formatCode: d.formatCode,
    mimeType: d.mimeType,
    ordner: null,
    erstellt: ortszeit(d.erstellt),
    eingestellt: jetzt(),
    autor: d.autorPerson,
    einrichtung: d.autorEinrichtung,
    groesseBytes: roh.length,
    inhalt,
    ...(json ? {} : { datei: roh }),
    ...(zeilen ? { text: zeilen.join(' '), textzeilen: zeilen } : {}),
  };
}

export function xdsEinhaengen(
  app: FastifyInstance,
  kvnrAus: (anfrage: { headers: Record<string, unknown> }) => string,
): void {
  app.post(XDS_DOKUMENTENDIENST, async (anfrage, antwort) => {
    const typ = String(anfrage.headers['content-type'] ?? '');
    const koerper = typeof anfrage.body === 'string' ? anfrage.body : '';
    if (!typ.startsWith('application/soap+xml') || !koerper) {
      return antwort.code(415).send({
        errorCode: 'malformedRequest',
        errorDetail: 'Erwartet wird eine SOAP-1.2-Nachricht (application/soap+xml).',
      });
    }
    const kvnr = kvnrAus(anfrage);
    let bezug = '';
    let fehler: XdsFehler[];
    let einreichung: GeleseneEinreichung | null = null;
    try {
      bezug = nachrichtIdLesen(koerper);
      einreichung = provideAndRegisterLesen(koerper);
      fehler = pruefen(einreichung, kvnr);
    } catch (f) {
      fehler = [
        {
          code: 'XDSRepositoryError',
          text: f instanceof Error ? f.message : 'Nachricht nicht lesbar.',
        },
      ];
    }
    if (fehler.length === 0 && einreichung) {
      // Alles oder nichts: ein SubmissionSet wird ganz oder gar nicht registriert.
      bestandFuer(kvnr).dokumente.push(...einreichung.dokumente.map(alsDokument));
    }
    void antwort.header('content-type', 'application/soap+xml; charset=utf-8');
    return antwort.code(200).send(registryResponseErzeugen(fehler, bezug));
  });
}
