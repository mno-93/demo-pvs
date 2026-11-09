import { describe, expect, it } from 'vitest';
import { erfuellt } from './finden.js';
import type { Schritt } from './szenario.js';

/** Wann ein Eingabeschritt erfüllt ist — streng genug für den Pfad, großzügig für Menschen. */
function feld(wert: string): HTMLInputElement {
  const e = document.createElement('input');
  e.value = wert;
  return e;
}

const ziel = { rolle: 'textbox', name: 'x' };

describe('Eingabeschritte', () => {
  it('nehmen den Begriff gleich ob groß oder klein geschrieben', () => {
    const s: Schritt = { ziel, handlung: { art: 'eingeben', wert: 'Migräne' }, kurz: 'x' };
    expect(erfuellt(s, feld('migräne'))).toBe(true);
    expect(erfuellt(s, feld(' Migräne '))).toBe(true);
    expect(erfuellt(s, feld('Migr'))).toBe(false);
  });

  it('nehmen als Freitext jeden Text, aber kein leeres Feld', () => {
    const s: Schritt = {
      ziel,
      handlung: { art: 'eingeben', wert: 'Vorschlag', frei: true },
      kurz: 'x',
    };
    expect(erfuellt(s, feld('Etwas ganz anderes.'))).toBe(true);
    expect(erfuellt(s, feld('   '))).toBe(false);
  });
});
