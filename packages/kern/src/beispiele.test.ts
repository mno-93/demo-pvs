import { describe, expect, it } from 'vitest';
import { DEMO_HEUTE, demoJetzt } from './beispiele.js';
import { jetztAlsIsoOrtszeit } from './fachlogik/datum.js';

describe('Demo-Uhr', () => {
  it('führt den Demo-Tag', () => {
    const jetzt = demoJetzt();
    expect(jetztAlsIsoOrtszeit(jetzt).slice(0, 10)).toBe(DEMO_HEUTE);
  });
});
