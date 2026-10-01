import { describe, expect, it } from 'vitest';
import {
  abgleichZaehlen,
  dokumenteAbgleichen,
  uuidAlsOid,
  type EpaDokument,
} from './dokumentabgleich.js';
import { laborbefundBauen } from './laborbefund.js';
import type { LokalesDokument } from '../typen/dokument.js';

function akte(id: string, titel: string, datum: string): EpaDokument {
  return {
    id,
    titel,
    art: 'Arztbrief',
    datum,
    einrichtung: 'Klinikum Sonnenschein',
    autor: 'Dr. Wagner',
  };
}

function lokal(teil: Partial<LokalesDokument> & { id: string }): LokalesDokument {
  return {
    patientId: 'p1',
    titel: 'Dokument',
    art: 'Arztbrief',
    ursprung: 'akte',
    datum: '2026-07-17',
    epaId: null,
    einrichtung: 'Klinikum Sonnenschein',
    autor: 'Dr. Wagner',
    dateiname: 'dokument.json',
    inhaltstyp: 'application/fhir+json',
    groesseBytes: 1024,
    gespeichertAm: '2026-09-09T09:00:00',
    gespeichertVon: 'Dr. med. Anna Brandt',
    inhalt: null,
    notiz: null,
    ...teil,
  };
}

describe('Dokumentenabgleich', () => {
  it('kennzeichnet ein Dokument, das nur in der Akte liegt', () => {
    const zeilen = dokumenteAbgleichen([akte('a1', 'Entlassbrief', '2026-07-17')], []);
    expect(zeilen).toHaveLength(1);
    expect(zeilen[0]?.status).toBe('nur-in-epa');
    expect(zeilen[0]?.lokal).toBeNull();
  });

  it('erkennt ein heruntergeladenes Dokument über die Aktenkennung', () => {
    const zeilen = dokumenteAbgleichen(
      [akte('a1', 'Entlassbrief', '2026-07-17')],
      [lokal({ id: 'l1', epaId: 'a1', ursprung: 'akte' })],
    );
    expect(zeilen[0]?.status).toBe('in-beiden');
    expect(zeilen[0]?.lokal?.id).toBe('l1');
  });

  it('unterscheidet ein hier erzeugtes und eingestelltes Dokument vom heruntergeladenen', () => {
    const zeilen = dokumenteAbgleichen(
      [akte('a1', 'Bescheinigung', '2026-09-09')],
      [lokal({ id: 'l1', epaId: 'a1', ursprung: 'praxis' })],
    );
    expect(zeilen[0]?.status).toBe('lokal-eingestellt');
  });

  it('führt lokale Dokumente ohne Gegenstück in der Akte mit auf', () => {
    const zeilen = dokumenteAbgleichen(
      [],
      [lokal({ id: 'l1', ursprung: 'praxis', titel: 'Scan Vorbefund' })],
    );
    expect(zeilen).toHaveLength(1);
    expect(zeilen[0]?.status).toBe('nur-lokal');
    expect(zeilen[0]?.epaDokument).toBeNull();
  });

  it('zählt eine gemischte Lage richtig', () => {
    const zeilen = dokumenteAbgleichen(
      [akte('a1', 'Entlassbrief', '2026-07-17'), akte('a2', 'Laborbefund', '2026-08-12')],
      [lokal({ id: 'l1', epaId: 'a1' }), lokal({ id: 'l2', ursprung: 'praxis', titel: 'Scan' })],
    );
    expect(abgleichZaehlen(zeilen)).toEqual({
      gesamt: 3,
      nurInEpa: 1,
      lokalVorhanden: 1,
      nurLokal: 1,
    });
  });

  it('sortiert das jüngste Dokument nach oben', () => {
    const zeilen = dokumenteAbgleichen(
      [akte('a1', 'Alt', '2024-01-01'), akte('a2', 'Neu', '2026-08-12')],
      [],
    );
    expect(zeilen.map((z) => z.titel)).toEqual(['Neu', 'Alt']);
  });

  it('erkennt einen vom Labor übermittelten Befund in der ePA an der Dokumentkennung', () => {
    const uuid = '3b1c9a52-5c4e-4f0b-9d47-2e8f61a0c7d3';
    const befund = laborbefundBauen({
      uuid,
      auftragsnummer: 'L-1',
      kvnr: 'M555123402',
      patientName: { vorname: 'Meral', nachname: 'Yildiz' },
      geburtsdatum: '1969-06-25',
      labor: 'Labor',
      freigebendePerson: 'Dr. X',
      auftraggeber: 'Praxis',
      entnahme: '2026-07-02T08:30:00',
      freigabe: '2026-07-02T13:40:00',
      probenart: 'Serum',
      beurteilung: null,
      gruppen: [],
    });
    const zeilen = dokumenteAbgleichen(
      [{ ...akte('a9', 'Laborbefund', '2026-07-02'), uniqueId: uuidAlsOid(uuid) }],
      [lokal({ id: 'l9', ursprung: 'labor', epaId: null, inhalt: befund })],
    );
    expect(zeilen).toHaveLength(1);
    expect(zeilen[0]?.status).toBe('in-beiden');
    expect(zeilen[0]?.erkanntUeber).toBe('dokumentkennung');
  });

  it('bildet eine UUID nach X.667 auf eine OID unter 2.25 ab', () => {
    expect(uuidAlsOid('00000000-0000-0000-0000-000000000001')).toBe('urn:oid:2.25.1');
  });
});
