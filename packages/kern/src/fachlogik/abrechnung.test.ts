import { describe, expect, it } from 'vitest';
import {
  abrechnungsdiagnosen,
  istAnsetzbar,
  pruefeErfasste,
  pruefeLeistung,
  type Pruefumgebung,
} from './abrechnung.js';
import type { Diagnose } from '../typen/diagnose.js';
import { diagnoseMuster } from '../testhilfe.js';
import type { Leistungsziffer } from '../typen/leistung.js';

function ziffer(z: string, datum = '2026-09-09'): Leistungsziffer {
  return {
    id: `l-${z}-${datum}`,
    patientId: 'p1',
    fallId: 'f1',
    ziffer: z,
    bezeichnung: z,
    datum,
    anzahl: 1,
    erfasstVon: 'Test',
  };
}

function dauerdiagnose(): Diagnose {
  return diagnoseMuster({ fallId: 'f1', beginn: '2019-05-02' });
}

function umgebung(teil: Partial<Pruefumgebung> = {}): Pruefumgebung {
  return { bestehende: [], diagnosen: [], datum: '2026-09-09', ...teil };
}

describe('Abrechnungsprüfung', () => {
  it('lässt die Versichertenpauschale nur einmal je Fall zu', () => {
    expect(istAnsetzbar('03000', umgebung())).toBe(true);
    expect(istAnsetzbar('03000', umgebung({ bestehende: [ziffer('03000')] }))).toBe(false);
  });

  it('verlangt für den Chronikerzuschlag Grundpauschale und Dauerdiagnose', () => {
    expect(istAnsetzbar('03220', umgebung({ bestehende: [ziffer('03000')] }))).toBe(false);
    expect(
      istAnsetzbar(
        '03220',
        umgebung({ bestehende: [ziffer('03000')], diagnosen: [dauerdiagnose()] }),
      ),
    ).toBe(true);
  });

  it('erkennt eine Akutdiagnose nicht als Chronikergrundlage', () => {
    const akut = { ...dauerdiagnose(), art: 'akut' as const };
    expect(
      istAnsetzbar('03220', umgebung({ bestehende: [ziffer('03000')], diagnosen: [akut] })),
    ).toBe(false);
  });

  it('lässt 03221 nur zusätzlich zu 03220 zu', () => {
    const basis = { bestehende: [ziffer('03000')], diagnosen: [dauerdiagnose()] };
    expect(istAnsetzbar('03221', umgebung(basis))).toBe(false);
    expect(
      istAnsetzbar('03221', umgebung({ ...basis, bestehende: [ziffer('03000'), ziffer('03220')] })),
    ).toBe(true);
  });

  it('schließt Besuch und dringenden Besuch am selben Tag aus', () => {
    expect(istAnsetzbar('01411', umgebung({ bestehende: [ziffer('01410', '2026-09-09')] }))).toBe(
      false,
    );
    expect(istAnsetzbar('01411', umgebung({ bestehende: [ziffer('01410', '2026-09-08')] }))).toBe(
      true,
    );
  });

  it('gibt beim Gespräch einen Hinweis, ohne zu blockieren', () => {
    const meldungen = pruefeLeistung('03230', umgebung());
    expect(meldungen).toHaveLength(1);
    expect(meldungen[0]?.art).toBe('hinweis');
    expect(istAnsetzbar('03230', umgebung())).toBe(true);
  });
});

describe('Prüfung der erfassten Ziffern gegen den heutigen Diagnosebestand', () => {
  const erfasst = [ziffer('03000'), ziffer('03220')];

  it('meldet nichts, solange die Voraussetzung besteht', () => {
    expect(pruefeErfasste(erfasst, [dauerdiagnose()]).size).toBe(0);
  });

  it('meldet den Chronikerzuschlag, wenn die Dauerdiagnose beendet wurde', () => {
    const beendet = { ...dauerdiagnose(), klinischerStatus: 'behoben' as const };
    const meldungen = pruefeErfasste(erfasst, [beendet]);
    expect([...meldungen.keys()]).toEqual(['l-03220-2026-09-09']);
    expect(meldungen.get('l-03220-2026-09-09')?.[0]?.text).toContain('Dauerdiagnose');
  });
});

describe('Diagnosen im Behandlungsfall', () => {
  it('führt Dokumentiertes des Falls und jede gegenwärtige Dauerdiagnose, nie Irrtümliches', () => {
    const dauerFrueher = diagnoseMuster({ id: 'd1', fallId: 'alt', art: 'dauer' });
    const akutImFall = diagnoseMuster({ id: 'd2', fallId: 'f1', art: 'akut' });
    const akutFrueher = diagnoseMuster({ id: 'd3', fallId: 'alt', art: 'akut' });
    const irrtum = diagnoseMuster({ id: 'd4', fallId: 'f1', diagnosesicherheit: 'irrtümlich' });
    const behobenFrueher = diagnoseMuster({
      id: 'd5',
      fallId: 'alt',
      art: 'dauer',
      klinischerStatus: 'behoben',
    });
    expect(
      abrechnungsdiagnosen(
        [dauerFrueher, akutImFall, akutFrueher, irrtum, behobenFrueher],
        'f1',
      ).map((d) => d.id),
    ).toEqual(['d1', 'd2']);
  });
});
