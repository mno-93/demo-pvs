import { describe, expect, it } from 'vitest';
import faelle from './dosierungstext.faelle.json' with { type: 'json' };
import { DosierungstextFehler, dosierungstext, dosierungstextAus } from './dosierungstext.js';

/**
 * Die erwarteten Texte und Meldungen stammen aus der Referenzimplementierung von HL7
 * Deutschland (Version und Commit in der Falldatei), erzeugt über dieselben Eingaben.
 */
describe(`Dosierungstext nach Algorithmus ${faelle.version}`, () => {
  for (const f of faelle.faelle as {
    name: string;
    dosage: unknown[];
    text?: string;
    fehler?: string;
  }[]) {
    it(f.name, () => {
      if (f.fehler !== undefined) {
        expect(() => dosierungstextAus(f.dosage)).toThrow(new DosierungstextFehler(f.fehler));
      } else {
        expect(dosierungstextAus(f.dosage)).toBe(f.text);
      }
    });
  }

  it('liest die Dosierung nach Ressourcentyp', () => {
    const dosierung = [{ text: 'nach Plan' }];
    expect(dosierungstext({ resourceType: 'MedicationStatement', dosage: dosierung })).toBe(
      'nach Plan',
    );
    expect(() => dosierungstext({ resourceType: 'Observation' })).toThrow(
      'Unsupported resource type: Observation',
    );
  });
});
