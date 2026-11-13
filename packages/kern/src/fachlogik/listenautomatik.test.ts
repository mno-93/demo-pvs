import { describe, expect, it } from 'vitest';
import { diagnosenAbgleichen } from './listenabgleich.js';
import { diagnosenAutomatikPlanen, imUmfang } from './listenautomatik.js';
import { diagnoseMuster } from '../testhilfe.js';
import { CODESYSTEM } from '../typen/kodierung.js';

const sct = (code: string) => ({ system: CODESYSTEM.snomed, code, anzeige: code });
const dauer = (teil: Parameters<typeof diagnoseMuster>[0]) =>
  diagnoseMuster({ art: 'dauer', klinischerStatus: 'aktiv', ...teil });

describe('✦ Automatische Übertragung der Diagnosen (ADR 0063)', () => {
  it('tut im geführten Weg nichts von selbst', () => {
    const zeilen = diagnosenAbgleichen([dauer({ id: 'l1', snomed: sct('1') })], []);
    expect(diagnosenAutomatikPlanen(zeilen, 'gefuehrt', 'alle')).toEqual([]);
  });

  it('überträgt nach dem Umfang: Dauerdiagnosen oder alle, nie Irrtümliches', () => {
    const akut = diagnoseMuster({ id: 'a', art: 'akut', klinischerStatus: 'aktiv' });
    const behoben = diagnoseMuster({ id: 'b', art: 'dauer', klinischerStatus: 'behoben' });
    const irrtum = dauer({ id: 'i', diagnosesicherheit: 'irrtümlich' });
    expect(imUmfang(akut, 'dauer')).toBe(false);
    expect(imUmfang(akut, 'alle')).toBe(true);
    expect(imUmfang(behoben, 'dauer')).toBe(false);
    expect(imUmfang(behoben, 'alle')).toBe(true);
    expect(imUmfang(irrtum, 'alle')).toBe(false);

    const zeilen = diagnosenAbgleichen(
      [dauer({ id: 'd', snomed: sct('1') }), { ...akut, snomed: sct('2') }],
      [],
    );
    expect(diagnosenAutomatikPlanen(zeilen, 'hochladen', 'dauer').map((s) => s.lokal?.id)).toEqual([
      'd',
    ]);
    expect(diagnosenAutomatikPlanen(zeilen, 'hochladen', 'alle')).toHaveLength(2);
  });

  it('nur in die ePA: eigener Eintrag auch neben dem gleichen einer anderen Einrichtung', () => {
    const zeilen = diagnosenAbgleichen(
      [dauer({ id: 'l1', code: 'E11.90', snomed: sct('44054006') })],
      [dauer({ id: 'e1', epaId: 'e1', epaFassung: '1', code: 'E11.74', snomed: sct('44054006') })],
    );
    const [schritt] = diagnosenAutomatikPlanen(zeilen, 'hochladen', 'dauer');
    expect(schritt).toMatchObject({ art: 'in-die-epa', epa: null });
  });

  it('nur in die ePA: übernimmt nichts aus der ePA', () => {
    const zeilen = diagnosenAbgleichen(
      [dauer({ id: 'l1', epaId: 'e1', epaFassung: '1' })],
      [
        dauer({ id: 'e1', epaId: 'e1', epaFassung: '2', klinischerStatus: 'behoben' }),
        dauer({ id: 'e2', epaId: 'e2', epaFassung: '1', snomed: sct('9') }),
      ],
    );
    expect(diagnosenAutomatikPlanen(zeilen, 'hochladen', 'alle')).toEqual([]);
  });

  it('beidseitig: verknüpft, übernimmt Fremdes und fremde Änderungen', () => {
    const zeilen = diagnosenAbgleichen(
      [
        dauer({ id: 'l1', epaId: 'e1', epaFassung: '1' }),
        dauer({ id: 'l2', snomed: sct('44054006') }),
        dauer({ id: 'l3', epaId: 'e4', epaFassung: '1' }),
      ],
      [
        dauer({ id: 'e1', epaId: 'e1', epaFassung: '2', klinischerStatus: 'behoben' }),
        dauer({ id: 'e2', epaId: 'e2', epaFassung: '1', snomed: sct('44054006') }),
        dauer({ id: 'e3', epaId: 'e3', epaFassung: '1', snomed: sct('9') }),
        dauer({ id: 'e4', epaId: 'e4', epaFassung: '2', diagnosesicherheit: 'irrtümlich' }),
      ],
    );
    const arten = diagnosenAutomatikPlanen(zeilen, 'beidseitig', 'dauer')
      .map((s) => `${s.art}:${s.lokal?.id ?? '-'}:${s.epa?.id ?? '-'}`)
      .sort();
    expect(arten).toEqual([
      'berichtigt:l3:e4',
      'epa-stand:l1:e1',
      'in-die-praxis:-:e3',
      'verknuepfen:l2:e2',
    ]);
  });

  it('beidseitig: übernimmt eine Berichtigung nur einmal', () => {
    const zeilen = diagnosenAbgleichen(
      [dauer({ id: 'l1', epaId: 'e1', epaFassung: '2', diagnosesicherheit: 'irrtümlich' })],
      [dauer({ id: 'e1', epaId: 'e1', epaFassung: '2', diagnosesicherheit: 'irrtümlich' })],
    );
    expect(diagnosenAutomatikPlanen(zeilen, 'beidseitig', 'alle')).toEqual([]);
  });

  it('übernimmt zuerst und schreibt danach', () => {
    const zeilen = diagnosenAbgleichen(
      [dauer({ id: 'l1', snomed: sct('1') })],
      [dauer({ id: 'e2', epaId: 'e2', epaFassung: '1', snomed: sct('2') })],
    );
    expect(diagnosenAutomatikPlanen(zeilen, 'beidseitig', 'dauer').map((s) => s.art)).toEqual([
      'in-die-praxis',
      'in-die-epa',
    ]);
  });
});
