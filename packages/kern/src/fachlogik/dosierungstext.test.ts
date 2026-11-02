import { describe, expect, it } from 'vitest';
import faelle from './dosierungstext.faelle.json' with { type: 'json' };
import { jsonMitSchreibweise } from '../fhir/schreibweise.js';
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

describe('Schreibweise von Dezimalzahlen', () => {
  const dosierung = `[{"timing":{"repeat":{"frequency":1,"period":1,"periodUnit":"d","when":["MORN"]}},"doseAndRate":[{"doseQuantity":{"value":1.0,"unit":"Stück","system":"https://fhir.kbv.de/CodeSystem/KBV_CS_SFHIR_BMP_DOSIEREINHEIT","code":"1"}}]}]`;

  it('schreibt 1.0 als „1,0“ wie die Referenz, wenn die Schreibweise mitgelesen wurde', () => {
    expect(dosierungstextAus(jsonMitSchreibweise(dosierung))).toBe('täglich: 1,0-0-0-0 Stück');
    expect(dosierungstextAus(JSON.parse(dosierung))).toBe('täglich: 1-0-0-0 Stück');
  });
});
