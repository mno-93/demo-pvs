import { describe, expect, it } from 'vitest';
import {
  STUECK,
  alsTabelle,
  automatischeKategorie,
  dosierungAlsText,
  dosierungAusFhir,
  dosierungAusText,
  dosierungNachFhir,
  dosierungPruefen,
  textErweiterungen,
  type Dosierung,
} from './dosierung.js';

const BMP = 'https://fhir.kbv.de/CodeSystem/KBV_CS_SFHIR_BMP_DOSIEREINHEIT';
const tropfen = { code: '6', anzeige: 'Tropfen' };

describe('Dosierung nach DosageDgMP', () => {
  it('bildet 1-0-1-0 wie das Beispiel des IG Medication Service ab', () => {
    expect(dosierungNachFhir(dosierungAusText('1-0-1-0'))).toEqual([
      {
        timing: { repeat: { frequency: 2, period: 1, periodUnit: 'd', when: ['MORN', 'EVE'] } },
        doseAndRate: [{ doseQuantity: { value: 1, unit: 'Stück', system: BMP, code: '1' } }],
      },
    ]);
  });

  it('teilt unterschiedliche Dosen auf je ein Element', () => {
    const d = dosierungAusText('1-0-0,5-0');
    expect(dosierungNachFhir(d)).toHaveLength(2);
    expect(dosierungAlsText(d)).toBe('täglich: 1-0-0,5-0 Stück');
  });

  it('erzeugt Texte aller angebotenen Schemata', () => {
    const faelle: [Dosierung, string][] = [
      [
        { schema: { art: 'freitext', text: 'nach Blutzucker' }, einheit: STUECK },
        'nach Blutzucker',
      ],
      [
        {
          schema: { art: 'tageszeiten', mengen: [1, 0, 0, 0] },
          einheit: STUECK,
          von: '2026-10-29',
          hinweis: 'nüchtern',
        },
        'ab dem 29.10.2026 täglich: 1-0-0-0 Stück. Hinweis: nüchtern',
      ],
      [
        {
          schema: {
            art: 'uhrzeiten',
            gaben: [
              { uhrzeit: '20:00', menge: 2 },
              { uhrzeit: '08:00', menge: 1 },
            ],
          },
          einheit: STUECK,
        },
        'täglich: 08:00 Uhr — je 1 Stück, 20:00 Uhr — je 2 Stück',
      ],
      [
        {
          schema: {
            art: 'wochentage',
            gaben: [
              { tag: 'thu', menge: 1 },
              { tag: 'mon', menge: 1 },
            ],
          },
          einheit: STUECK,
        },
        'montags — je 1 Stück; donnerstags — je 1 Stück',
      ],
      [
        { schema: { art: 'intervall', alle: 1, einheit: 'wk', menge: 1 }, einheit: STUECK },
        'wöchentlich: je 1 Stück',
      ],
      [
        {
          schema: {
            art: 'bedarf',
            menge: 20,
            anlass: 'Schmerzen',
            mindestabstandStunden: 6,
            hoechstensProTag: 80,
          },
          einheit: tropfen,
        },
        'bei Schmerzen: im Abstand von mindestens 6 Stunden je 20 Tropfen — nicht mehr als 80 Tropfen pro Tag',
      ],
      [
        { schema: { art: 'bedarf', menge: 1, mengeBis: 2 }, einheit: STUECK },
        'bei Bedarf: je 1 bis 2 Stück',
      ],
    ];
    for (const [d, text] of faelle) {
      expect(dosierungAlsText(d)).toBe(text);
      // Rückweg: dieselbe Dosierung, derselbe Text.
      expect(dosierungAlsText(dosierungAusFhir(dosierungNachFhir(d))!)).toBe(text);
    }
  });

  it('trägt Text und Generierungsmetadaten mit Version 2.0.0', () => {
    const ext = textErweiterungen(
      'MedicationRequest',
      dosierungNachFhir(dosierungAusText('0-0-1-0')),
    );
    expect(ext[0]).toEqual({
      url: 'http://hl7.org/fhir/5.0/StructureDefinition/extension-MedicationRequest.renderedDosageInstruction',
      valueMarkdown: 'täglich: 0-0-1-0 Stück',
    });
    expect(ext[1]!['extension']).toEqual([
      { url: 'algorithmVersion', valueString: '2.0.0' },
      { url: 'language', valueCode: 'de-DE' },
    ]);
  });

  it('bestimmt die Kategorie wie der Medication Service', () => {
    const k = (d: Dosierung) => automatischeKategorie(dosierungNachFhir(d));
    expect(k(dosierungAusText('1-0-1-0'))).toBe('daily');
    expect(k(dosierungAusText('1-0-0,5-0'))).toBeNull(); // zwei Elemente
    expect(k({ schema: { art: 'freitext', text: 'x' }, einheit: STUECK })).toBeNull();
    expect(
      k({ schema: { art: 'intervall', alle: 8, einheit: 'h', menge: 1 }, einheit: STUECK }),
    ).toBe('daily');
    expect(
      k({ schema: { art: 'intervall', alle: 1, einheit: 'wk', menge: 1 }, einheit: STUECK }),
    ).toBe('specific-days');
    expect(
      k({ schema: { art: 'wochentage', gaben: [{ tag: 'mon', menge: 1 }] }, einheit: STUECK }),
    ).toBe('specific-days');
    expect(k({ schema: { art: 'bedarf', menge: 1 }, einheit: STUECK })).toBe('as-needed');
  });

  it('zeigt einfache Tagesschemata als Tabelle, alles andere als Text', () => {
    expect(alsTabelle(dosierungNachFhir(dosierungAusText('1-0-0,5-0')))).toEqual([1, 0, 0.5, 0]);
    expect(
      alsTabelle(dosierungNachFhir({ ...dosierungAusText('1-0-0-0'), von: '2026-10-29' })),
    ).toBeNull();
    expect(alsTabelle([{ text: '1 Tablette' }])).toBeNull();
  });
});

describe('Prüfung bei der Eingabe', () => {
  it('meldet Verstöße mit der Invariante', () => {
    expect(
      dosierungPruefen({ schema: { art: 'freitext', text: '1-0-1-0' }, einheit: STUECK }),
    ).toEqual(['Viererschema nicht als Freitext (DosageFourSlotPatternInText)']);
    expect(dosierungPruefen(dosierungAusText('0,2-0-0-0'))[0]).toMatch(/AllowedFractions/);
    expect(dosierungPruefen(dosierungAusText('0-0-0-0'))).toEqual(['Keine Gabe angegeben']);
    expect(dosierungPruefen(dosierungAusText('1-0-0,5-0'))).toEqual([]);
    expect(
      dosierungPruefen({ ...dosierungAusText('1-0-0-0'), von: '2026-11-01', bis: '2026-10-01' }),
    ).toEqual(['Ende vor Beginn']);
  });
});
