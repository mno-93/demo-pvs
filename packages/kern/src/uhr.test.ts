import { afterEach, describe, expect, it } from 'vitest';
import {
  DEMO_HEUTE,
  demoJetzt,
  demoUhrNeuStellen,
  demoZeitpunkt,
  ortszeitDeutschland,
} from './uhr.js';

afterEach(() => demoUhrNeuStellen());

describe('Ortszeit in Deutschland', () => {
  it('gibt die deutsche Uhrzeit wieder, gleich in welcher Zone der Rechner läuft', () => {
    expect(ortszeitDeutschland(new Date('2026-09-09T12:45:30Z'))).toBe('2026-09-09T14:45:30');
    expect(ortszeitDeutschland(new Date('2026-01-05T06:03:09Z'))).toBe('2026-01-05T07:03:09');
  });

  it('führt Mitternacht als 00, nicht als 24', () => {
    expect(ortszeitDeutschland(new Date('2026-01-04T23:00:00Z'))).toBe('2026-01-05T00:00:00');
  });
});

describe('Demo-Uhr', () => {
  it('führt den Demo-Tag mit der deutschen Uhrzeit', () => {
    demoUhrNeuStellen(() => Date.parse('2026-11-02T13:15:20.250Z'));
    expect(demoZeitpunkt()).toBe(`${DEMO_HEUTE}T14:15:20.250`);
    expect(ortszeitDeutschland(demoJetzt()).slice(0, 10)).toBe(DEMO_HEUTE);
  });

  it('steigt streng, auch bei vielen Aufrufen in derselben Millisekunde', () => {
    demoUhrNeuStellen(() => Date.parse('2026-11-02T13:15:20.250Z'));
    const werte = Array.from({ length: 50 }, () => demoZeitpunkt());
    for (let i = 1; i < werte.length; i++) expect(werte[i]! > werte[i - 1]!).toBe(true);
  });

  it('geht über Mitternacht auf den nächsten Tag weiter', () => {
    let echt = Date.parse('2026-11-02T22:59:59.900Z'); // 23:59:59,900 in Deutschland
    demoUhrNeuStellen(() => echt);
    const vorher = demoZeitpunkt();
    echt += 200;
    const nachher = demoZeitpunkt();
    expect(vorher).toBe(`${DEMO_HEUTE}T23:59:59.900`);
    expect(nachher).toBe('2026-09-10T00:00:00.100');
    expect(nachher > vorher).toBe(true);
  });

  it('springt in der Nacht der Zeitumstellung nicht zurück', () => {
    let echt = Date.parse('2026-10-25T00:30:00Z'); // 02:30 Sommerzeit
    demoUhrNeuStellen(() => echt);
    const vorher = demoZeitpunkt();
    echt = Date.parse('2026-10-25T01:10:00Z'); // 02:10 Winterzeit
    const nachher = demoZeitpunkt();
    expect(nachher > vorher).toBe(true);
  });
});
