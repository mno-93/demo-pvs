import { describe, expect, it } from 'vitest';
import { allergienAbgleichen, diagnosenAbgleichen, listenZaehlen } from './listenabgleich.js';
import { allergieMuster, diagnoseMuster } from '../testhilfe.js';
import { CODESYSTEM } from '../typen/kodierung.js';

const sct = (code: string, anzeige = code) => ({ system: CODESYSTEM.snomed, code, anzeige });

describe('Abgleich der Diagnosen mit der Diagnosenliste der ePA', () => {
  it('ordnet verknüpfte Einträge zu und erkennt eine Änderung in der ePA an der Fassung', () => {
    const lokal = diagnoseMuster({ id: 'l1', epaId: 'e1', epaFassung: '1' });
    const epa = diagnoseMuster({ id: 'e1', epaId: 'e1', epaFassung: '2' });
    const [zeile] = diagnosenAbgleichen([lokal], [epa]);
    expect(zeile?.status).toBe('epa-geaendert');
  });

  it('meldet eine lokale Änderung, solange die ePA auf demselben Stand ist', () => {
    const lokal = diagnoseMuster({
      id: 'l1',
      epaId: 'e1',
      epaFassung: '1',
      klinischerStatus: 'behoben',
    });
    const epa = diagnoseMuster({ id: 'e1', epaId: 'e1', epaFassung: '1' });
    expect(diagnosenAbgleichen([lokal], [epa])[0]?.status).toBe('lokal-geaendert');
  });

  it('findet dieselbe Erkrankung über SNOMED CT auch bei anderer ICD-10-GM', () => {
    const lokal = diagnoseMuster({ id: 'l1', code: 'E11.90', snomed: sct('44054006') });
    const epa = diagnoseMuster({ id: 'e1', epaId: 'e1', code: 'E11.74', snomed: sct('44054006') });
    const [zeile] = diagnosenAbgleichen([lokal], [epa]);
    expect(zeile?.status).toBe('ungekoppelt');
    expect(zeile?.hinweis).toContain('E11.90');
    expect(zeile?.hinweis).toContain('E11.74');
  });

  it('führt Einträge nur lokal und nur in der ePA getrennt und zählt sie', () => {
    const zeilen = diagnosenAbgleichen(
      [diagnoseMuster({ id: 'l1', snomed: sct('1') })],
      [diagnoseMuster({ id: 'e1', epaId: 'e1', snomed: sct('2') })],
    );
    expect(zeilen.map((z) => z.status).sort()).toEqual(['nur-epa', 'nur-lokal']);
    expect(listenZaehlen(zeilen)).toEqual({ abgeglichen: 0, offen: 0, nurLokal: 1, nurEpa: 1 });
  });

  it('blendet berichtigte ePA-Einträge ohne Verknüpfung aus', () => {
    const epa = diagnoseMuster({ id: 'e1', epaId: 'e1', diagnosesicherheit: 'irrtümlich' });
    expect(diagnosenAbgleichen([], [epa])).toHaveLength(0);
  });
});

describe('Abgleich der Allergien mit der Allergienliste der ePA', () => {
  it('weist auf eine verwandte Substanz derselben Wirkstoffgruppe hin', () => {
    const lokal = allergieMuster({
      id: 'l1',
      substanz: 'Amoxicillin',
      snomed: sct('372687004', 'Amoxicillin'),
      gewissheit: 'unbestätigt',
    });
    const epa = allergieMuster({
      id: 'e1',
      epaId: 'e1',
      substanz: 'Penicillin',
      snomed: sct('764146007', 'Penicillin'),
    });
    const zeilen = allergienAbgleichen([lokal], [epa]);
    expect(zeilen).toHaveLength(2);
    const amoxicillin = zeilen.find((z) => z.lokal?.id === 'l1');
    expect(amoxicillin?.hinweis).toContain('Penicillin in der ePA');
  });

  it('gleicht eine Freitextallergie über die Bezeichnung ab', () => {
    const lokal = allergieMuster({ id: 'l1', substanz: 'Pflasterkleber', snomed: null });
    const epa = allergieMuster({
      id: 'e1',
      epaId: 'e1',
      substanz: 'pflasterkleber ',
      snomed: null,
    });
    expect(allergienAbgleichen([lokal], [epa])[0]?.status).toBe('ungekoppelt');
  });
});
