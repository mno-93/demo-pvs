import { describe, expect, it } from 'vitest';
import { DEMO_HEUTE, demoJetzt, ortszeitDeutschland } from './uhr.js';

describe('Demo-Uhr', () => {
  it('führt den Demo-Tag', () => {
    const jetzt = demoJetzt();
    expect(ortszeitDeutschland(jetzt).slice(0, 10)).toBe(DEMO_HEUTE);
  });
});
