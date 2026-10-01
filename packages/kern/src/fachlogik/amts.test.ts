import { describe, expect, it } from 'vitest';
import {
  allergieFuerAmts,
  allergieTrifftZu,
  amtsPruefen,
  atcFuerSubstanz,
  schwersterBefund,
  type AmtsUmgebung,
  type DokumentierteAllergie,
} from './amts.js';
import { arzneimittel } from '../kataloge/arzneimittel.js';
import { allergieMuster } from '../testhilfe.js';
import { CODESYSTEM } from '../typen/kodierung.js';

function mittel(atc: string) {
  const gefunden = arzneimittel.find((a) => a.atc === atc);
  if (!gefunden) throw new Error(`Im Auszug nicht enthalten: ${atc}`);
  return gefunden;
}

function allergie(teil: Partial<DokumentierteAllergie> = {}): DokumentierteAllergie {
  return {
    substanz: 'Penicillin',
    snomed: '764146007',
    atc: ['J01C'],
    typ: 'Allergie',
    gewissheit: 'bestätigt',
    quelle: 'Krankenhausentlassbrief',
    ...teil,
  };
}

function umgebung(teil: Partial<AmtsUmgebung> = {}): AmtsUmgebung {
  return { allergien: [], egfr: null, egfrGrundlage: null, bestehendeAtc: [], ...teil };
}

describe('Allergieabgleich', () => {
  it('trifft über den ATC-Präfix die ganze Wirkstoffgruppe', () => {
    // J01C (Penicilline) muss J01CA04 (Amoxicillin) treffen.
    expect(allergieTrifftZu(mittel('J01CA04'), allergie())).toBe(true);
  });

  it('trifft über die im Katalog hinterlegte Allergiegruppe', () => {
    expect(
      allergieTrifftZu(mittel('J01CR02'), allergie({ substanz: 'Penicilline', atc: [] })),
    ).toBe(true);
  });

  it('trifft nicht bei einer anderen Wirkstoffgruppe', () => {
    expect(allergieTrifftZu(mittel('J01AA02'), allergie())).toBe(false);
  });

  it('trifft über den Wirkstoffnamen', () => {
    expect(allergieTrifftZu(mittel('N02BB02'), allergie({ substanz: 'Metamizol', atc: [] }))).toBe(
      true,
    );
  });
});

describe('Brücke von SNOMED CT zu ATC', () => {
  it('ordnet der Substanz Penicillin die Gruppe J01C zu', () => {
    expect(atcFuerSubstanz('764146007')).toEqual(['J01C']);
  });

  it('führt Acetylsalicylsäure unter beiden ATC-Codes', () => {
    expect(atcFuerSubstanz('387458008')).toEqual(['B01AC06', 'N02BA01']);
  });

  it('gibt einer Freitextangabe keine Zuordnung — ohne Code keine Prüfung', () => {
    expect(atcFuerSubstanz(null)).toEqual([]);
    const frei = allergieFuerAmts(
      allergieMuster({ snomed: null, substanz: 'Penicillin' }),
      'Praxis',
    );
    expect(allergieTrifftZu(mittel('J01CA04'), frei)).toBe(false);
  });

  it('erkennt eine SNOMED-kodierte Allergie des Praxissystems', () => {
    const kodiert = allergieFuerAmts(
      allergieMuster({
        snomed: { system: CODESYSTEM.snomed, code: '764146007', anzeige: 'Penicillin' },
      }),
      'Praxis',
    );
    expect(allergieTrifftZu(mittel('J01CA04'), kodiert)).toBe(true);
  });
});

describe('AMTS-Prüfung', () => {
  it('übergeht widerlegte und irrtümlich erfasste Allergien', () => {
    for (const gewissheit of ['widerlegt', 'irrtümlich']) {
      const befunde = amtsPruefen(
        mittel('J01CA04'),
        umgebung({ allergien: [allergie({ gewissheit })] }),
      );
      expect(befunde).toHaveLength(0);
    }
  });

  it('stuft eine gesicherte Allergie als kontraindiziert ein', () => {
    const befunde = amtsPruefen(mittel('J01CA04'), umgebung({ allergien: [allergie()] }));
    expect(befunde[0]?.schwere).toBe('kontraindiziert');
    expect(befunde[0]?.grundlage).toBe('Krankenhausentlassbrief');
  });

  it('stuft eine nicht gesicherte Unverträglichkeit als Warnung ein', () => {
    const befunde = amtsPruefen(
      mittel('J01CA04'),
      umgebung({ allergien: [allergie({ typ: 'Unverträglichkeit', gewissheit: 'unbestätigt' })] }),
    );
    expect(befunde[0]?.schwere).toBe('warnung');
  });

  it('warnt bei Metformin unterhalb der Prüfgrenze', () => {
    const befunde = amtsPruefen(
      mittel('A10BA02'),
      umgebung({ egfr: 38, egfrGrundlage: 'Laborbefund 12.08.2026' }),
    );
    expect(befunde).toHaveLength(1);
    expect(befunde[0]?.art).toBe('Nierenfunktion');
    expect(befunde[0]?.schwere).toBe('warnung');
    expect(befunde[0]?.text).toContain('38');
  });

  it('erklärt Metformin unterhalb der Kontraindikationsgrenze für kontraindiziert', () => {
    const befunde = amtsPruefen(mittel('A10BA02'), umgebung({ egfr: 24 }));
    expect(befunde[0]?.schwere).toBe('kontraindiziert');
  });

  it('meldet nichts, wenn die Nierenfunktion ausreicht', () => {
    expect(amtsPruefen(mittel('A10BA02'), umgebung({ egfr: 80 }))).toEqual([]);
  });

  it('weist auf einen fehlenden Nierenwert hin, statt ihn zu unterstellen', () => {
    const befunde = amtsPruefen(mittel('A10BA02'), umgebung({ egfr: null }));
    expect(befunde[0]?.schwere).toBe('hinweis');
    expect(befunde[0]?.grundlage).toBe('kein Laborwert verfügbar');
  });

  it('erkennt einen bereits geführten Wirkstoff', () => {
    const befunde = amtsPruefen(mittel('C09AA05'), umgebung({ bestehendeAtc: ['C09AA05'] }));
    expect(befunde.some((b) => b.art === 'Doppelverordnung')).toBe(true);
  });

  it('sortiert den schwersten Befund nach vorn', () => {
    const befunde = amtsPruefen(
      mittel('J01CA04'),
      umgebung({ allergien: [allergie()], bestehendeAtc: ['J01CA04'] }),
    );
    expect(befunde[0]?.schwere).toBe('kontraindiziert');
    expect(schwersterBefund(befunde)).toBe('kontraindiziert');
  });

  it('liefert ohne Befund auch keine Schwere', () => {
    expect(schwersterBefund([])).toBeNull();
  });
});
