import { kind, kinder, nachfahren, xmlLesen, xmlMaskieren, type XmlElement } from './xml.js';

/**
 * Einstellen in die ePA: **Provide & Register Document Set-b [ITI-41]** am XDS Document Service.
 *
 * Grundlagen:
 * - Konzept ePA 3.1.3 (`ePA-Basic`, Branch ePA-3.1.3, Commit 3186ad2), XDS Document Service:
 *   Das Primärsystem ist „Document Source" und stellt über ITI-41 ein; der MHD Service ist nur
 *   lesend. Die Kategorie ergibt sich aus Metadaten und Sektorenrolle.
 * - WSDL `XDSDocumentService.wsdl` (`ePA-XDS-Document`, Branch ePA-3.1.3, Commit c88635c):
 *   Endpunkt `/epa/xds-document/api/I_Document_Management`, SOAP 1.2, Aktion
 *   `urn:ihe:iti:2007:ProvideAndRegisterDocumentSet-b`, WS-Addressing.
 * - IHE ITI TF-3, Abschnitt 4.2 (profiles.ihe.net): ebRIM-Abbildung von SubmissionSet und
 *   DocumentEntry, Klassifikationsschemata und Kennungen als UUID.
 *
 * Bewusste Vereinfachungen, je mit ⚠:
 * - Das Dokument steht **inline als base64** im Element `Document`. ITI-41 verlangt MTOM/XOP;
 *   eine Multipart-Nachricht bringt der Demo keinen Erkenntnisgewinn.
 * - Zuweisende Stellen in `patientId` (KVNR, OID 1.2.276.0.76.4.8) und `authorInstitution`
 *   (Telematik-ID, OID 1.2.276.0.76.4.188) sind nicht gegen die gematik-Spezifikation geprüft.
 * - `healthcareFacilityTypeCode`, `practiceSettingCode`, `confidentialityCode` und
 *   `contentTypeCode` folgen den Wertelisten von IHE Deutschland, nicht gegen die Kataloge
 *   geprüft. Belegt sind nur `classCode`, `typeCode` und `formatCode` — in den
 *   Implementation Guides des XDS Document Service.
 */

export const XDS_DOKUMENTENDIENST = '/epa/xds-document/api/I_Document_Management';
export const ITI41_AKTION = 'urn:ihe:iti:2007:ProvideAndRegisterDocumentSet-b';
export const ITI41_ANTWORT = 'urn:ihe:iti:2007:ProvideAndRegisterDocumentSet-bResponse';
/** SOAP 1.2 trägt die Aktion im Inhaltstyp. */
export const ITI41_INHALTSTYP = `application/soap+xml; charset=utf-8; action="${ITI41_AKTION}"`;

const NS = {
  soap: 'http://www.w3.org/2003/05/soap-envelope',
  wsa: 'http://www.w3.org/2005/08/addressing',
  xdsb: 'urn:ihe:iti:xds-b:2007',
  lcm: 'urn:oasis:names:tc:ebxml-regrep:xsd:lcm:3.0',
  rim: 'urn:oasis:names:tc:ebxml-regrep:xsd:rim:3.0',
  rs: 'urn:oasis:names:tc:ebxml-regrep:xsd:rs:3.0',
} as const;

/** Klassifikationsschemata und Kennungen nach IHE ITI TF-3, 4.2.5. */
export const XDS_SCHEMA = {
  dokumentObjekttyp: 'urn:uuid:7edca82f-054d-47f2-a032-9b2a5b5186c1',
  autor: 'urn:uuid:93606bcf-9494-43ec-9b4e-a7748d1a838d',
  classCode: 'urn:uuid:41a5887f-8865-4c09-adf7-e362475b143a',
  confidentialityCode: 'urn:uuid:f4f85eac-e6cb-4883-b524-f2705394840f',
  formatCode: 'urn:uuid:a09d5840-386c-46f2-b5ad-9c3699a4309d',
  healthcareFacilityTypeCode: 'urn:uuid:f33fb8ac-18af-42cc-ae0e-ed0b0bdb91e1',
  practiceSettingCode: 'urn:uuid:cccf5598-8b07-4b77-a05e-ae952c785ead',
  typeCode: 'urn:uuid:f0306f51-975f-434e-a61c-c59651d33983',
  eventCodeList: 'urn:uuid:2c6b8cb7-8b2a-4051-b291-b1ae6a575ef4',
  dokumentPatientId: 'urn:uuid:58a6f841-87b3-4a3e-92fd-a8ffeff98427',
  dokumentUniqueId: 'urn:uuid:2e82c1f6-a085-4c72-9da3-8640a32e42ab',
  einreichung: 'urn:uuid:a54d6aa5-d40d-43f9-88c5-b4633d873bdd',
  einreichungAutor: 'urn:uuid:a7058bb9-b4e4-4307-ba5b-e3f0ab85e12d',
  contentTypeCode: 'urn:uuid:aa543740-bdda-424e-8c96-df4873be8500',
  einreichungPatientId: 'urn:uuid:6b5aea1a-874d-4603-a4bc-96a0a7b38446',
  einreichungSourceId: 'urn:uuid:554ac39e-e3fe-47fe-b233-965d2a147832',
  einreichungUniqueId: 'urn:uuid:96fdda7c-d067-4183-912e-bf5ee74998a8',
} as const;

const HAT_MITGLIED = 'urn:oasis:names:tc:ebxml-regrep:AssociationType:HasMember';
const ERFOLG = 'urn:oasis:names:tc:ebxml-regrep:ResponseStatusType:Success';
const FEHLSCHLAG = 'urn:oasis:names:tc:ebxml-regrep:ResponseStatusType:Failure';

/** ⚠ Zuweisende Stellen — siehe Kopf. */
const OID_KVNR = '1.2.276.0.76.4.8';
const OID_TELEMATIK_ID = '1.2.276.0.76.4.188';

export interface XdsCode {
  code: string;
  /** codingScheme — meist eine OID. */
  system: string;
  anzeige: string;
}

/** Metadaten eines Dokuments, wie das Primärsystem sie setzt. */
export interface XdsDokumentangabe {
  /** entryUUID ohne Präfix; unter ihr findet der MHD Service das Dokument (`DocumentReference.id`). */
  entryUuid: string;
  /** uniqueId als OID, etwa `2.25.…`. */
  uniqueId: string;
  titel: string;
  mimeType: string;
  /** ISO-Zeitpunkt der Erstellung. */
  erstellt: string;
  classCode: XdsCode;
  typeCode: XdsCode;
  formatCode: XdsCode;
  /** Inhalt als base64. */
  inhaltBase64: string;
}

export interface XdsEinreichung {
  kvnr: string;
  /** uniqueId des SubmissionSet als OID. */
  uniqueId: string;
  /** sourceId — OID des einstellenden Systems. */
  quelle: string;
  /** ISO-Zeitpunkt. */
  zeitpunkt: string;
  autor: { person: string; einrichtung: string; telematikId: string };
  dokumente: XdsDokumentangabe[];
}

/** ⚠ Wertelisten von IHE Deutschland, nicht gegen die Kataloge geprüft. */
export const XDS_PRAXIS = {
  einrichtungsart: { code: 'PRA', system: '1.3.6.1.4.1.19376.3.276.1.5.2', anzeige: 'Arztpraxis' },
  fachrichtung: {
    code: 'ALLG',
    system: '1.3.6.1.4.1.19376.3.276.1.5.4',
    anzeige: 'Allgemeinmedizin',
  },
  vertraulichkeit: { code: 'N', system: '2.16.840.1.113883.5.25', anzeige: 'normal' },
  anlass: { code: 'E100', system: '1.3.6.1.4.1.19376.3.276.1.5.12', anzeige: 'Ambulanter Kontakt' },
} as const satisfies Record<string, XdsCode>;

/** Zeitpunkt im DTM-Format der XDS-Metadaten: `JJJJMMTThhmmss`, UTC. */
export function xdsZeit(iso: string): string {
  const d = new Date(
    iso.length === 10
      ? `${iso}T00:00:00Z`
      : iso.endsWith('Z') || /[+-]\d\d:\d\d$/.test(iso)
        ? iso
        : `${iso}Z`,
  );
  return d.toISOString().replace(/[-:T]/g, '').slice(0, 14);
}

const m = xmlMaskieren;

function slot(name: string, ...werte: string[]): string {
  return `<rim:Slot name="${m(name)}"><rim:ValueList>${werte.map((w) => `<rim:Value>${m(w)}</rim:Value>`).join('')}</rim:ValueList></rim:Slot>`;
}

function klassifikation(schema: string, objekt: string, c: XdsCode, nr: string): string {
  return `<rim:Classification id="${nr}" classificationScheme="${schema}" classifiedObject="${objekt}" nodeRepresentation="${m(c.code)}">${slot('codingScheme', c.system)}<rim:Name><rim:LocalizedString value="${m(c.anzeige)}"/></rim:Name></rim:Classification>`;
}

function kennung(schema: string, objekt: string, wert: string, name: string, nr: string): string {
  return `<rim:ExternalIdentifier id="${nr}" identificationScheme="${schema}" registryObject="${objekt}" value="${m(wert)}"><rim:Name><rim:LocalizedString value="${name}"/></rim:Name></rim:ExternalIdentifier>`;
}

function autorKlassifikation(
  schema: string,
  objekt: string,
  a: XdsEinreichung['autor'],
  nr: string,
): string {
  return `<rim:Classification id="${nr}" classificationScheme="${schema}" classifiedObject="${objekt}" nodeRepresentation="">${slot('authorPerson', `^${a.person}`)}${slot('authorInstitution', `${a.einrichtung}^^^^^&${OID_TELEMATIK_ID}&ISO^^^^${a.telematikId}`)}</rim:Classification>`;
}

/** Baut die SOAP-Nachricht für ITI-41. */
export function provideAndRegisterErzeugen(e: XdsEinreichung, nachrichtId: string): string {
  const pid = `${e.kvnr}^^^&${OID_KVNR}&ISO`;
  let nr = 0;
  const id = () => `cl${++nr}`;
  const dokumente = e.dokumente.map((d) => {
    const eo = `urn:uuid:${d.entryUuid}`;
    return `<rim:ExtrinsicObject id="${eo}" mimeType="${m(d.mimeType)}" objectType="${XDS_SCHEMA.dokumentObjekttyp}">${slot('creationTime', xdsZeit(d.erstellt))}${slot('languageCode', 'de-DE')}${slot('sourcePatientId', pid)}<rim:Name><rim:LocalizedString value="${m(d.titel)}"/></rim:Name>${autorKlassifikation(XDS_SCHEMA.autor, eo, e.autor, id())}${klassifikation(XDS_SCHEMA.classCode, eo, d.classCode, id())}${klassifikation(XDS_SCHEMA.confidentialityCode, eo, XDS_PRAXIS.vertraulichkeit, id())}${klassifikation(XDS_SCHEMA.formatCode, eo, d.formatCode, id())}${klassifikation(XDS_SCHEMA.healthcareFacilityTypeCode, eo, XDS_PRAXIS.einrichtungsart, id())}${klassifikation(XDS_SCHEMA.practiceSettingCode, eo, XDS_PRAXIS.fachrichtung, id())}${klassifikation(XDS_SCHEMA.typeCode, eo, d.typeCode, id())}${kennung(XDS_SCHEMA.dokumentPatientId, eo, pid, 'XDSDocumentEntry.patientId', id())}${kennung(XDS_SCHEMA.dokumentUniqueId, eo, d.uniqueId, 'XDSDocumentEntry.uniqueId', id())}</rim:ExtrinsicObject>`;
  });
  const ss = 'SubmissionSet01';
  const einreichung = `<rim:RegistryPackage id="${ss}">${slot('submissionTime', xdsZeit(e.zeitpunkt))}${autorKlassifikation(XDS_SCHEMA.einreichungAutor, ss, e.autor, id())}${klassifikation(XDS_SCHEMA.contentTypeCode, ss, XDS_PRAXIS.anlass, id())}${kennung(XDS_SCHEMA.einreichungUniqueId, ss, e.uniqueId, 'XDSSubmissionSet.uniqueId', id())}${kennung(XDS_SCHEMA.einreichungSourceId, ss, e.quelle, 'XDSSubmissionSet.sourceId', id())}${kennung(XDS_SCHEMA.einreichungPatientId, ss, pid, 'XDSSubmissionSet.patientId', id())}</rim:RegistryPackage><rim:Classification id="${id()}" classifiedObject="${ss}" classificationNode="${XDS_SCHEMA.einreichung}"/>`;
  const verbindungen = e.dokumente.map(
    (d, i) =>
      `<rim:Association id="as${i + 1}" associationType="${HAT_MITGLIED}" sourceObject="${ss}" targetObject="urn:uuid:${d.entryUuid}">${slot('SubmissionSetStatus', 'Original')}</rim:Association>`,
  );
  const inhalte = e.dokumente.map(
    (d) => `<xdsb:Document id="urn:uuid:${d.entryUuid}">${d.inhaltBase64}</xdsb:Document>`,
  );
  return `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="${NS.soap}" xmlns:wsa="${NS.wsa}"><soap:Header><wsa:Action soap:mustUnderstand="1">${ITI41_AKTION}</wsa:Action><wsa:MessageID>urn:uuid:${nachrichtId}</wsa:MessageID><wsa:To>${XDS_DOKUMENTENDIENST}</wsa:To></soap:Header><soap:Body><xdsb:ProvideAndRegisterDocumentSetRequest xmlns:xdsb="${NS.xdsb}" xmlns:lcm="${NS.lcm}" xmlns:rim="${NS.rim}"><lcm:SubmitObjectsRequest><rim:RegistryObjectList>${einreichung}${dokumente.join('')}${verbindungen.join('')}</rim:RegistryObjectList></lcm:SubmitObjectsRequest>${inhalte.join('')}</xdsb:ProvideAndRegisterDocumentSetRequest></soap:Body></soap:Envelope>`;
}

/* ---------- Lesen auf der Seite des Aktensystems ---------- */

export interface GelesenesDokument extends Omit<XdsDokumentangabe, 'inhaltBase64'> {
  inhaltBase64: string | null;
  patientId: string;
  autorPerson: string;
  autorEinrichtung: string;
  autorTelematikId: string;
}

export interface GeleseneEinreichung {
  aktion: string;
  patientId: string;
  dokumente: GelesenesDokument[];
}

function slotWert(e: XmlElement, name: string): string {
  const s = kinder(e, 'Slot').find((x) => x.attribute['name'] === name);
  return (s && nachfahren(s, 'Value')[0]?.text.trim()) ?? '';
}

function klasse(e: XmlElement, schema: string): XmlElement | undefined {
  return kinder(e, 'Classification').find((c) => c.attribute['classificationScheme'] === schema);
}

function codeAus(e: XmlElement, schema: string): XdsCode | null {
  const c = klasse(e, schema);
  if (!c) return null;
  return {
    code: c.attribute['nodeRepresentation'] ?? '',
    system: slotWert(c, 'codingScheme'),
    anzeige: nachfahren(c, 'LocalizedString')[0]?.attribute['value'] ?? '',
  };
}

function kennungAus(e: XmlElement, schema: string): string {
  return (
    kinder(e, 'ExternalIdentifier').find((x) => x.attribute['identificationScheme'] === schema)
      ?.attribute['value'] ?? ''
  );
}

/** Zeitpunkt aus dem DTM-Format zurück nach ISO (UTC). */
function isoAus(dtm: string): string {
  if (!/^\d{8,14}$/.test(dtm)) return '';
  const t = dtm.padEnd(14, '0');
  return `${t.slice(0, 4)}-${t.slice(4, 6)}-${t.slice(6, 8)}T${t.slice(8, 10)}:${t.slice(10, 12)}:${t.slice(12, 14)}Z`;
}

/** Liest eine ITI-41-Nachricht. Wirft, wenn sie kein ProvideAndRegisterDocumentSetRequest ist. */
export function provideAndRegisterLesen(xml: string): GeleseneEinreichung {
  const umschlag = xmlLesen(xml);
  if (umschlag.lokal !== 'Envelope') throw new Error('Kein SOAP-Umschlag.');
  const aktion = nachfahren(umschlag, 'Action')[0]?.text.trim() ?? '';
  const anfrage = nachfahren(umschlag, 'ProvideAndRegisterDocumentSetRequest')[0];
  if (!anfrage) throw new Error('Kein ProvideAndRegisterDocumentSetRequest im Körper.');
  const liste = nachfahren(anfrage, 'RegistryObjectList')[0];
  const paket = liste && kind(liste, 'RegistryPackage');
  const inhalte = new Map(
    kinder(anfrage, 'Document').map((d) => [d.attribute['id'] ?? '', d.text.replace(/\s+/g, '')]),
  );
  const dokumente = (liste ? kinder(liste, 'ExtrinsicObject') : []).map((eo): GelesenesDokument => {
    const id = eo.attribute['id'] ?? '';
    const autor = klasse(eo, XDS_SCHEMA.autor);
    const einrichtung = autor ? slotWert(autor, 'authorInstitution') : '';
    const teile = einrichtung.split('^');
    return {
      entryUuid: id.replace(/^urn:uuid:/, ''),
      uniqueId: kennungAus(eo, XDS_SCHEMA.dokumentUniqueId),
      patientId: kennungAus(eo, XDS_SCHEMA.dokumentPatientId),
      titel: (() => {
        const name = kind(eo, 'Name');
        return (name && kind(name, 'LocalizedString')?.attribute['value']) ?? '';
      })(),
      mimeType: eo.attribute['mimeType'] ?? '',
      erstellt: isoAus(slotWert(eo, 'creationTime')),
      classCode: codeAus(eo, XDS_SCHEMA.classCode) ?? { code: '', system: '', anzeige: '' },
      typeCode: codeAus(eo, XDS_SCHEMA.typeCode) ?? { code: '', system: '', anzeige: '' },
      formatCode: codeAus(eo, XDS_SCHEMA.formatCode) ?? { code: '', system: '', anzeige: '' },
      autorPerson: autor
        ? slotWert(autor, 'authorPerson').replace(/^\^/, '').split('^').filter(Boolean).join(' ')
        : '',
      autorEinrichtung: teile[0] ?? '',
      autorTelematikId: teile[9] ?? '',
      inhaltBase64: inhalte.get(id) ?? null,
    };
  });
  return {
    aktion,
    patientId: paket ? kennungAus(paket, XDS_SCHEMA.einreichungPatientId) : '',
    dokumente,
  };
}

/** KVNR aus einer patientId im CX-Format. */
export function kvnrAusPatientId(pid: string): string {
  return pid.split('^')[0] ?? '';
}

/* ---------- Antwort: RegistryResponse ---------- */

export interface XdsFehler {
  /** Fehlercode nach IHE ITI TF-3, etwa `XDSRegistryMetadataError`. */
  code: string;
  text: string;
}

export function registryResponseErzeugen(fehler: readonly XdsFehler[], bezug: string): string {
  const status = fehler.length === 0 ? ERFOLG : FEHLSCHLAG;
  const liste =
    fehler.length === 0
      ? ''
      : `<rs:RegistryErrorList>${fehler
          .map(
            (f) =>
              `<rs:RegistryError errorCode="${m(f.code)}" codeContext="${m(f.text)}" severity="urn:oasis:names:tc:ebxml-regrep:ErrorSeverityType:Error"/>`,
          )
          .join('')}</rs:RegistryErrorList>`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="${NS.soap}" xmlns:wsa="${NS.wsa}"><soap:Header><wsa:Action>${ITI41_ANTWORT}</wsa:Action><wsa:RelatesTo>${m(bezug)}</wsa:RelatesTo></soap:Header><soap:Body><rs:RegistryResponse xmlns:rs="${NS.rs}" status="${status}">${liste}</rs:RegistryResponse></soap:Body></soap:Envelope>`;
}

export interface GeleseneAntwort {
  erfolg: boolean;
  fehler: XdsFehler[];
}

export function registryResponseLesen(xml: string): GeleseneAntwort {
  const antwort = nachfahren(xmlLesen(xml), 'RegistryResponse')[0];
  if (!antwort) throw new Error('Keine RegistryResponse.');
  return {
    erfolg: antwort.attribute['status'] === ERFOLG,
    fehler: nachfahren(antwort, 'RegistryError').map((f) => ({
      code: f.attribute['errorCode'] ?? '',
      text: f.attribute['codeContext'] ?? '',
    })),
  };
}

/** Kennung der Nachricht aus dem WS-Addressing-Kopf. */
export function nachrichtIdLesen(xml: string): string {
  return nachfahren(xmlLesen(xml), 'MessageID')[0]?.text.trim() ?? '';
}
