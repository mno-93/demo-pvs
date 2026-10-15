import { describe, expect, it } from 'vitest';
import {
  ITI41_AKTION,
  XDS_SCHEMA,
  provideAndRegisterErzeugen,
  provideAndRegisterLesen,
  registryResponseErzeugen,
  registryResponseLesen,
  xdsZeit,
  type XdsEinreichung,
} from './xds.js';
import { xmlLesen } from './xml.js';

const EINREICHUNG: XdsEinreichung = {
  kvnr: 'A123456780',
  uniqueId: '2.25.1',
  quelle: '2.25.2',
  zeitpunkt: '2026-09-09T11:00:00Z',
  autor: {
    person: 'Dr. med. Anna Brandt',
    einrichtung: 'Hausarztpraxis am Stadtgarten',
    telematikId: '1-DEMO-PRAXIS-STADTGARTEN',
  },
  dokumente: [
    {
      entryUuid: '11111111-2222-4333-8444-555555555555',
      uniqueId: '2.25.3',
      titel: 'Arztbrief an Kardiologie <Wall> & Co',
      mimeType: 'application/fhir+json',
      erstellt: '2026-09-09T11:00:00Z',
      classCode: { code: 'BRI', system: '1.3.6.1.4.1.19376.3.276.1.5.8', anzeige: 'Brief' },
      typeCode: { code: 'BERI', system: '1.3.6.1.4.1.19376.3.276.1.5.9', anzeige: 'Arztberichte' },
      formatCode: { code: 'urn:x', system: 'urn:y', anzeige: 'Format' },
      inhaltBase64: btoa('{"resourceType":"Bundle"}'),
    },
  ],
};

describe('ITI-41 Provide & Register Document Set-b', () => {
  it('ist wohlgeformtes XML mit WS-Addressing-Aktion', () => {
    const xml = provideAndRegisterErzeugen(EINREICHUNG, 'abc');
    expect(() => xmlLesen(xml)).not.toThrow();
    expect(xml).toContain(`<wsa:Action soap:mustUnderstand="1">${ITI41_AKTION}</wsa:Action>`);
    expect(xml).toContain(XDS_SCHEMA.einreichung);
    expect(xml).toContain('urn:oasis:names:tc:ebxml-regrep:AssociationType:HasMember');
  });

  it('liest zurück, was es schreibt — Metadaten, Autor, Inhalt', () => {
    const gelesen = provideAndRegisterLesen(provideAndRegisterErzeugen(EINREICHUNG, 'abc'));
    expect(gelesen.aktion).toBe(ITI41_AKTION);
    expect(gelesen.patientId).toBe('A123456780^^^&1.2.276.0.76.4.8&ISO');
    const d = gelesen.dokumente[0]!;
    expect(d.entryUuid).toBe('11111111-2222-4333-8444-555555555555');
    expect(d.titel).toBe('Arztbrief an Kardiologie <Wall> & Co');
    expect(d.classCode.code).toBe('BRI');
    expect(d.typeCode.system).toBe('1.3.6.1.4.1.19376.3.276.1.5.9');
    expect(d.formatCode.code).toBe('urn:x');
    expect(d.erstellt).toBe('2026-09-09T11:00:00Z');
    expect(d.autorPerson).toBe('Dr. med. Anna Brandt');
    expect(d.autorEinrichtung).toBe('Hausarztpraxis am Stadtgarten');
    expect(d.autorTelematikId).toBe('1-DEMO-PRAXIS-STADTGARTEN');
    expect(atob(d.inhaltBase64!)).toBe('{"resourceType":"Bundle"}');
  });

  it('schreibt Zeitpunkte im DTM-Format in UTC', () => {
    expect(xdsZeit('2026-09-09T11:00:00Z')).toBe('20260909110000');
  });

  it('meldet Erfolg und Fehler in der RegistryResponse', () => {
    expect(registryResponseLesen(registryResponseErzeugen([], 'urn:uuid:abc')).erfolg).toBe(true);
    const fehler = registryResponseLesen(
      registryResponseErzeugen(
        [{ code: 'XDSRegistryMetadataError', text: 'formatCode unbekannt' }],
        'x',
      ),
    );
    expect(fehler.erfolg).toBe(false);
    expect(fehler.fehler).toEqual([
      { code: 'XDSRegistryMetadataError', text: 'formatCode unbekannt' },
    ]);
  });

  it('lehnt nicht wohlgeformtes XML ab', () => {
    expect(() => xmlLesen('<a><b></a>')).toThrow();
  });
});
