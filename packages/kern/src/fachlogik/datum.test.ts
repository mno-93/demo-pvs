import { describe, expect, it } from 'vitest';
import {
  alterInJahren,
  deutscherZeitpunkt,
  deutschesDatum,
  gleichesQuartal,
  quartalVon,
} from './datum.js';

describe('Quartalsrechnung', () => {
  it('ordnet Monate den richtigen Quartalen zu', () => {
    expect(quartalVon('2026-01-15')).toEqual({ jahr: 2026, quartal: 1 });
    expect(quartalVon('2026-03-31')).toEqual({ jahr: 2026, quartal: 1 });
    expect(quartalVon('2026-04-01')).toEqual({ jahr: 2026, quartal: 2 });
    expect(quartalVon('2026-12-31')).toEqual({ jahr: 2026, quartal: 4 });
  });

  it('erkennt den Quartalswechsel als Fallgrenze', () => {
    expect(gleichesQuartal('2026-03-31', '2026-04-01')).toBe(false);
    expect(gleichesQuartal('2026-04-01', '2026-06-30')).toBe(true);
  });

  it('weist unbrauchbare Datumsangaben zurück', () => {
    expect(() => quartalVon('unsinn')).toThrow();
    expect(() => quartalVon('2026-13-01')).toThrow();
  });
});

describe('Alter', () => {
  it('zählt vollendete Jahre', () => {
    expect(alterInJahren('1958-03-14', '2026-03-13')).toBe(67);
    expect(alterInJahren('1958-03-14', '2026-03-14')).toBe(68);
  });
});

describe('Darstellung', () => {
  it('setzt ISO-Datumsangaben deutsch', () => {
    expect(deutschesDatum('2026-08-30')).toBe('30.08.2026');
    expect(deutschesDatum(null)).toBe('');
  });

  it('setzt Zeitpunkte ohne Zone deutsch, mit Uhrzeit auf die Minute', () => {
    expect(deutscherZeitpunkt('2026-09-09T14:45:30')).toBe('09.09.2026, 14:45 Uhr');
    expect(deutscherZeitpunkt('2026-09-09')).toBe('09.09.2026');
  });
});
