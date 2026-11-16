import { describe, expect, it } from 'vitest';
import { imZeitraum } from './fhir-hilfen.ts';

describe('imZeitraum', () => {
  it('rechnet einen Wert mit Zone in deutsche Ortszeit um, statt die Zone abzuschneiden', () => {
    // 10:00 deutscher Sommerzeit ist 08:00 UTC.
    const zeitpunkt = '2026-09-09T10:00:00';
    expect(imZeitraum(zeitpunkt, 'gt2026-09-09T09:00:00Z')).toBe(false);
    expect(imZeitraum(zeitpunkt, 'gt2026-09-09T07:00:00Z')).toBe(true);
    expect(imZeitraum(zeitpunkt, 'gt2026-09-09T09:00:00+02:00')).toBe(true);
    // Ohne Zone und als Datum wie bisher.
    expect(imZeitraum(zeitpunkt, 'gt2026-09-09T09:00:00')).toBe(true);
    expect(imZeitraum(zeitpunkt, 'eq2026-09-09')).toBe(true);
  });

  it('liest auch den Zeitpunkt mit Zone, etwa aus einem Lesezeichen', () => {
    expect(imZeitraum('2026-09-09T10:00:00+02:00', 'lt2026-09-09T08:30:00Z')).toBe(true);
  });
});
