import { describe, expect, it } from 'vitest';
import type { Rezept } from '../typen/rezept.js';
import {
  EMP_IDENTIFIER_SYSTEM,
  REZEPT_ID_SYSTEM,
  dosierungStrukturiert,
  reichweiteTage,
  verordnungsdatensatzBauen,
} from './erezept.js';

const REZEPT: Rezept = {
  id: 'r1',
  patientId: 'p1',
  arzneimittel: {
    bezeichnung: 'Ramipril 5 mg Tabletten',
    pzn: '90900010',
    atc: 'C09AA05',
    atcVersion: '2026',
  },
  dosierung: '1-0-0-0',
  packungen: 1,
  normgroesse: 'N3',
  empId: 'emp-h-med-3',
  grund: null,
  status: 'vorbereitet',
  freigabe: 'freigegeben',
  hinweis: null,
  erstelltAm: '2026-09-29T09:00:00',
  vorbereitetVon: 'Sabine Rothe',
  rezeptId: null,
  accessCode: null,
  signiertVon: null,
  gesendetAm: null,
  geloeschtAm: null,
};

describe('E-Rezept', () => {
  it('bildet das Viererschema als Tageszeiten ab und behält den Text', () => {
    const d = dosierungStrukturiert('1-0-1-0');
    expect(d).toHaveLength(2);
    expect(d[0]).toMatchObject({ text: '1-0-1-0', timing: { repeat: { when: ['MORN'] } } });
    expect(d[1]).toMatchObject({ timing: { repeat: { when: ['EVE'] } } });
    expect(dosierungStrukturiert('bei Bedarf 1 Hub')).toEqual([{ text: 'bei Bedarf 1 Hub' }]);
  });

  it('rechnet die Reichweite nur bei Viererschema', () => {
    expect(reichweiteTage('1-0-1-0', 1, 'N3')).toBe(50);
    expect(reichweiteTage('0,5-0-0-0', 2, 'N1')).toBe(80);
    expect(reichweiteTage('bei Bedarf', 1, 'N1')).toBeNull();
  });

  it('trägt Rezept-ID und eMP-Identifier im Datensatz', () => {
    const bundle = verordnungsdatensatzBauen(REZEPT, {
      kvnr: 'A123456780',
      vorname: 'Renate',
      nachname: 'Hoffmann',
      geburtsdatum: '1958-03-14',
      kostentraeger: 'Beispielkasse Nordwest',
      kostentraegerkennung: '109999901',
      arzt: { name: 'Dr. med. Anna Brandt', lanr: '999999901' },
      praxis: { name: 'Hausarztpraxis am Stadtgarten', telematikId: 'DEMO-PRAXIS' },
      rezeptId: '160.000.000.000.001.53',
      authoredOn: '2026-09-29',
    });
    expect(bundle['identifier']).toEqual({
      system: REZEPT_ID_SYSTEM,
      value: '160.000.000.000.001.53',
    });
    const verordnung = (bundle['entry'] as { resource: Record<string, unknown> }[])
      .map((e) => e.resource)
      .find((r) => r['resourceType'] === 'MedicationRequest')!;
    expect(verordnung['basedOn']).toEqual([
      { identifier: { system: EMP_IDENTIFIER_SYSTEM, value: 'emp-h-med-3' } },
    ]);
  });
});
