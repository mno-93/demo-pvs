import { describe, expect, it } from 'vitest';
import { bewerte, suche, terminologieSuchen } from './suche.js';

const kodes = [
  { code: 'I10.90', bezeichnung: 'Essentielle Hypertonie, ohne Angabe einer hypertensiven Krise' },
  { code: 'E11.90', bezeichnung: 'Diabetes mellitus, Typ 2: Ohne Komplikationen' },
  { code: 'N39.0', bezeichnung: 'Harnwegsinfektion, Lokalisation nicht näher bezeichnet' },
];

describe('Katalogsuche', () => {
  it('setzt den Schlüsseltreffer vor den Bezeichnungstreffer', () => {
    expect(bewerte('I10.90', 'I10.90', 'irgendwas')).toBeGreaterThan(
      bewerte('I10.90', 'X99', 'I10.90 im Text'),
    );
  });

  it('findet über den Anfang des Schlüssels', () => {
    expect(
      suche(
        kodes,
        'I10',
        (e) => e.code,
        (e) => e.bezeichnung,
      )[0]?.code,
    ).toBe('I10.90');
  });

  it('findet über ein Wort der Bezeichnung', () => {
    expect(
      suche(
        kodes,
        'Harnwegs',
        (e) => e.code,
        (e) => e.bezeichnung,
      )[0]?.code,
    ).toBe('N39.0');
  });

  it('behandelt Umlaute und Großschreibung gleich', () => {
    const mitUmlaut = suche(
      kodes,
      'näher',
      (e) => e.code,
      (e) => e.bezeichnung,
    );
    const ohneUmlaut = suche(
      kodes,
      'NAEHER',
      (e) => e.code,
      (e) => e.bezeichnung,
    );
    expect(mitUmlaut).toEqual(ohneUmlaut);
    expect(mitUmlaut).toHaveLength(1);
  });

  it('liefert bei leerer Eingabe nichts', () => {
    expect(
      suche(
        kodes,
        '   ',
        (e) => e.code,
        (e) => e.bezeichnung,
      ),
    ).toEqual([]);
  });
});

describe('Terminologiesuche', () => {
  const eintraege = [
    {
      code: 'I10.90',
      sct: '59621000',
      begriff: 'Essentielle Hypertonie',
      synonyme: ['Bluthochdruck', 'Hochdruck'],
    },
    {
      code: 'E11.90',
      sct: '44054006',
      begriff: 'Diabetes mellitus Typ 2',
      synonyme: ['Zuckerkrankheit'],
    },
  ];
  const felder = (e: (typeof eintraege)[number]) => ({
    codes: [e.code, e.sct],
    bezeichnung: e.begriff,
    synonyme: e.synonyme,
  });

  it('findet über ein Synonym und nennt es', () => {
    const [treffer] = terminologieSuchen(eintraege, 'Bluthoch', felder);
    expect(treffer?.eintrag.code).toBe('I10.90');
    expect(treffer?.synonym).toBe(true);
    expect(treffer?.ueber).toBe('Bluthochdruck');
  });

  it('findet über den ICD-10-GM- und den SNOMED-CT-Code', () => {
    expect(terminologieSuchen(eintraege, 'E11', felder)[0]?.eintrag.begriff).toBe(
      'Diabetes mellitus Typ 2',
    );
    expect(terminologieSuchen(eintraege, '59621000', felder)[0]?.eintrag.code).toBe('I10.90');
  });

  it('zieht einen Treffer in der Bezeichnung einem Synonymtreffer vor', () => {
    const [treffer] = terminologieSuchen(eintraege, 'Diabetes', felder);
    expect(treffer?.synonym).toBe(false);
  });
});
