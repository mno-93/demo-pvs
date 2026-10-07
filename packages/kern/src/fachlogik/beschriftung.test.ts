import { describe, expect, it } from 'vitest';
import { beschriftungPruefen } from './beschriftung.js';

const SONO = [
  'Sonographie des Abdomens vom 14.09.2023 — Frau Renate Hoffmann, geb. 14.03.1958',
  '',
  'Befund',
];

describe('Beschriftung prüfen', () => {
  it('erkennt den Scannernamen als Titel und das Hochladedatum als Dokumentdatum', () => {
    const b = beschriftungPruefen(
      {
        titel: 'Scan_20230914_0007',
        autor: 'Dr. med. Petra Lang',
        einrichtung: 'Praxis Dr. Lang',
        datum: '2025-02-03T11:12:00',
      },
      SONO,
    );
    expect(b.unklar).toBe(true);
    expect(b.lautInhalt).toBe('Sonographie des Abdomens vom 14.09.2023');
    expect(b.datumLautInhalt).toBe('2023-09-14');
    expect(b.beleg).toBe(SONO[0]);
    expect(b.gruende).toEqual([
      'Der Titel „Scan_20230914_0007“ sagt nichts über den Inhalt',
      'Das Datum der Metadaten (03.02.2025) passt nicht zum Dokument (14.09.2023)',
    ]);
  });

  it('nimmt das Geburtsdatum nicht für das Dokumentdatum', () => {
    const b = beschriftungPruefen(
      {
        titel: 'Entlassbrief stationäre Behandlung',
        autor: 'Dr. med. Lea Wagner',
        einrichtung: 'Klinikum Sonnenschein',
        datum: '2026-07-17',
      },
      ['Frau Renate Hoffmann, geb. 14.03.1958 — stationärer Aufenthalt 12.07.2026 bis 18.07.2026'],
    );
    expect(b.unklar).toBe(false);
    expect(b.datumLautInhalt).toBe('2026-07-12');
  });

  it('meldet Abkürzung, falsche Klasse und Platzhalter', () => {
    const augen = beschriftungPruefen(
      {
        titel: 'Befund',
        autor: 'Dr. Z.',
        einrichtung: 'AGP am Markt',
        datum: '2024-11-05',
        klasse: 'Administratives Dokument',
      },
      ['Diabetisches Netzhaut-Screening vom 05.11.2024 — Frau Renate Hoffmann, geb. 14.03.1958'],
    );
    expect(augen.gruende).toEqual([
      'Der Titel „Befund“ sagt nichts über den Inhalt',
      'Die Einrichtung steht nur als Abkürzung da („AGP“)',
      'Die Dokumentklasse „Administratives Dokument“ passt nicht zum Inhalt',
    ]);

    const anlage = beschriftungPruefen(
      {
        titel: 'Anlage 1',
        autor: 'Anwender 3',
        einrichtung: 'Praxis',
        datum: '2026-01-01T00:00:00',
      },
      [],
    );
    expect(anlage.gruende).toEqual([
      'Der Titel „Anlage 1“ sagt nichts über den Inhalt',
      'Verfasser und Einrichtung sind nicht erkennbar',
      'Das Datum 01.01.2026 wirkt wie ein Platzhalter',
    ]);
    expect(anlage.lautInhalt).toBeNull();
  });

  it('hält geläufige Abkürzungen wie MVZ nicht für rätselhaft', () => {
    expect(
      beschriftungPruefen(
        {
          titel: 'Laborgesamtbefund',
          autor: 'Dr. med. Hanna Voss',
          einrichtung: 'MVZ Labor Oldenburg',
          datum: '2026-03-18',
        },
        [],
      ).unklar,
    ).toBe(false);
  });

  it('lässt ordentlich beschriftete Dokumente in Ruhe', () => {
    for (const titel of [
      'Befundbericht Kardiologie',
      'Laborgesamtbefund',
      'Vorbefund Kardiologie (eingescannt)',
    ]) {
      expect(
        beschriftungPruefen(
          {
            titel,
            autor: 'Dr. med. Jonas Behrens',
            einrichtung: 'Kardiologische Praxis am Wall',
            datum: '2026-06-03',
          },
          [],
        ).unklar,
        titel,
      ).toBe(false);
    }
  });
});
