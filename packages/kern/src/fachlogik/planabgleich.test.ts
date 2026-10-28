import { describe, expect, it } from 'vitest';
import type { PraxisplanEintrag, SpiegelEintrag } from '../typen/medikation.js';
import {
  automatischerAbgleich,
  epaStandVon,
  offeneUnterschiede,
  planAbgleichen,
  praxisGeaendert,
} from './planabgleich.js';

/** ADR 0046: Was beim Abgleich mit dem eMP automatisch geschieht und was eine Handlung braucht. */

const emp = (teil: Partial<SpiegelEintrag>): SpiegelEintrag => ({
  id: 'mr-1',
  bezeichnung: 'Ramipril 5 mg Tabletten',
  atc: 'C09AA05',
  dosierung: '1-0-0-0',
  grund: 'Hypertonie',
  status: 'aktiv',
  verantwortlich: 'Praxis am Stadtgarten',
  fassung: '1',
  ...teil,
});

const lokal = (teil: Partial<PraxisplanEintrag>): PraxisplanEintrag => ({
  id: 'pp-1',
  patientId: 'p-1',
  bezeichnung: 'Ramipril 5 mg Tabletten',
  atc: 'C09AA05',
  atcVersion: '2026',
  pzn: null,
  dosierung: '1-0-0-0',
  grund: 'Hypertonie',
  status: 'aktiv',
  verantwortlich: 'Dr. Demo',
  fassung: '1',
  angelegtAm: '2026-10-01T09:00:00',
  geaendertAm: '2026-10-01T09:00:00',
  rezeptIds: [],
  epaId: null,
  epaStand: null,
  ...teil,
});

const verknuepft = (teil: Partial<PraxisplanEintrag> = {}, stand = emp({})) =>
  lokal({ epaId: stand.id, epaStand: epaStandVon(stand), ...teil });

describe('Abgleich des Plans der Praxis mit dem eMP', () => {
  it('nimmt beim ersten Einlesen alle eMP-Einträge automatisch auf, fehlerhafte nicht', () => {
    const zeilen = planAbgleichen(
      [],
      [
        emp({}),
        emp({ id: 'mr-2', atc: 'B01AF02' }),
        emp({ id: 'mr-3', status: 'entered-in-error' }),
      ],
    );
    expect(zeilen.map((z) => z.lage)).toEqual(['nur-epa', 'nur-epa', 'nur-epa']);
    expect(automatischerAbgleich(zeilen).aufnehmen.map((e) => e.id)).toEqual(['mr-1', 'mr-2']);
  });

  it('übernimmt eine Änderung im eMP automatisch, wenn die Praxis nichts geändert hat', () => {
    const zeilen = planAbgleichen([verknuepft()], [emp({ fassung: '2', dosierung: '2-0-0-0' })]);
    expect(zeilen[0]!.lage).toBe('epa-geaendert');
    expect(automatischerAbgleich(zeilen).uebernehmen).toEqual([
      { lokalId: 'pp-1', epa: expect.objectContaining({ dosierung: '2-0-0-0' }) },
    ]);
  });

  it('überträgt eine Änderung der Praxis nie ohne Handlung', () => {
    const geaendert = verknuepft({ status: 'pausiert' });
    expect(praxisGeaendert(geaendert)).toBe(true);
    const zeilen = planAbgleichen([geaendert], [emp({})]);
    expect(zeilen[0]!.lage).toBe('praxis-geaendert');
    expect(automatischerAbgleich(zeilen)).toEqual({ aufnehmen: [], uebernehmen: [] });
    expect(offeneUnterschiede(zeilen)).toBe(1);
  });

  it('meldet, wenn beide Seiten geändert haben', () => {
    const zeilen = planAbgleichen(
      [verknuepft({ dosierung: '1-0-1-0' })],
      [emp({ fassung: '2', status: 'pausiert' })],
    );
    expect(zeilen[0]!.lage).toBe('beide-geaendert');
    expect(automatischerAbgleich(zeilen).uebernehmen).toEqual([]);
  });

  it('nimmt dasselbe Mittel nicht doppelt auf, sondern bietet die Verknüpfung an', () => {
    const zeilen = planAbgleichen([lokal({})], [emp({})]);
    expect(zeilen).toEqual([
      {
        lage: 'gleiches-mittel',
        lokal: expect.objectContaining({ id: 'pp-1' }),
        epa: expect.objectContaining({ id: 'mr-1' }),
      },
    ]);
    expect(automatischerAbgleich(zeilen).aufnehmen).toEqual([]);
  });

  it('führt Einträge nur der Praxis und verschwundene eMP-Einträge getrennt', () => {
    const zeilen = planAbgleichen(
      [
        lokal({ id: 'pp-2', atc: 'A10BA02' }),
        lokal({ id: 'pp-3', atc: 'N02BE01', status: 'abgesetzt' }),
        verknuepft({ id: 'pp-4', epaId: 'mr-weg' }),
      ],
      [],
    );
    expect(zeilen.map((z) => [z.lage, z.lokal?.id])).toEqual([
      ['nicht-in-epa', 'pp-4'],
      ['nur-praxis', 'pp-2'],
      ['nur-praxis', 'pp-3'],
    ]);
    // Der abgesetzte Eintrag gehört nicht mehr in den eMP.
    expect(offeneUnterschiede(zeilen)).toBe(1);
  });
});
