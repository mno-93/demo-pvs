import { describe, expect, it } from 'vitest';
import { istGueltigeKvnr, kvnrBilden, pruefzifferFuer } from './kvnr.js';

describe('Krankenversichertennummer', () => {
  it('erzeugt Nummern, die die eigene Prüfung bestehen', () => {
    for (const [buchstabe, ziffern] of [
      ['A', '12345678'],
      ['X', '11048529'],
      ['Z', '00000001'],
    ] as const) {
      expect(istGueltigeKvnr(kvnrBilden(buchstabe, ziffern))).toBe(true);
    }
  });

  it('erkennt eine verfälschte Prüfziffer', () => {
    const gueltig = kvnrBilden('A', '12345678');
    const falschePruefziffer = (Number(gueltig.slice(9)) + 1) % 10;
    expect(istGueltigeKvnr(gueltig.slice(0, 9) + falschePruefziffer)).toBe(false);
  });

  it('weist falsch gebaute Nummern zurück', () => {
    expect(istGueltigeKvnr('123456789')).toBe(false);
    expect(istGueltigeKvnr('A1234567')).toBe(false);
    expect(istGueltigeKvnr('a123456780')).toBe(false);
  });

  it('lehnt unbrauchbare Eingaben ab', () => {
    expect(() => pruefzifferFuer('1', '12345678')).toThrow();
    expect(() => pruefzifferFuer('A', '123')).toThrow();
  });
});
