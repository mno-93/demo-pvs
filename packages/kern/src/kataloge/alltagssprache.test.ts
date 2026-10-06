import { describe, expect, it } from 'vitest';
import { begriffeIn, mitAlltagssprache } from './alltagssprache.js';

describe('Umschreibung in Alltagssprache', () => {
  it('setzt die Umschreibung hinter den Fachbegriff, ohne ihn zu ersetzen', () => {
    expect(mitAlltagssprache('Verdacht auf Vorhofflimmern')).toBe(
      'Verdacht auf Vorhofflimmern (unregelmäßiger Herzschlag)',
    );
  });

  it('bricht kein Wort auf, in dem ein Begriff nur steckt', () => {
    // „stationär" steht im Glossar; „Stationärer Aufenthalt" ebenfalls und ist länger.
    expect(mitAlltagssprache('Stationärer Aufenthalt 12.07.2026')).toBe(
      'Stationärer Aufenthalt (Aufenthalt mit Übernachtung im Krankenhaus) 12.07.2026',
    );
  });

  it('erläutert eine gebeugte Form nicht als ganzes Wort', () => {
    expect(mitAlltagssprache('Allergien und Unverträglichkeiten')).toBe(
      'Allergien und Unverträglichkeiten',
    );
  });

  it('erläutert den längeren Begriff und nicht zusätzlich den darin enthaltenen', () => {
    const text = mitAlltagssprache('18.07.2026 Elektrische Kardioversion (OPS 8-640)');
    expect(text).toBe(
      '18.07.2026 Elektrische Kardioversion (Stromstoß, der den Herzrhythmus ordnet) (OPS 8-640)',
    );
    expect(text).not.toContain('Behandlung, die den Herzrhythmus ordnet');
  });

  it('lässt Text ohne bekannte Begriffe unverändert', () => {
    expect(mitAlltagssprache('Kontrolle in sechs Monaten')).toBe('Kontrolle in sechs Monaten');
  });
});

describe('Begriffsliste', () => {
  it('nennt den längeren Begriff und unterdrückt den enthaltenen', () => {
    const begriffe = begriffeIn('Elektrische Kardioversion am 18.07.2026').map((b) => b.fach);
    expect(begriffe).toContain('Elektrische Kardioversion');
    expect(begriffe).not.toContain('Kardioversion');
  });

  it('findet nichts in einem Text ohne Fachbegriffe', () => {
    expect(begriffeIn('Kontrolle in sechs Monaten')).toEqual([]);
  });
});
