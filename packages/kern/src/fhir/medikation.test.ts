import { describe, expect, it } from 'vitest';
import { dosierungAusText, gerenderterText } from '../fachlogik/dosierung.js';
import { planeintragFortschreiben, planeintragNachFhir } from './medikation.js';

/** Fortschreiben eines eMP-Eintrags: Was die Praxis nicht ändert, bleibt (ADR 0052). */
describe('Planeintrag fortschreiben', () => {
  const fremd = {
    ...planeintragNachFhir({
      kvnr: 'A123456780',
      datum: '2026-07-18',
      dosierung: dosierungAusText('1-0-0-0'),
      grund: 'Blutdruck',
    }),
    // Eine Dosierung, die das Praxissystem nicht als Schema liest, und ein Grund der Klinik.
    dosageInstruction: [
      {
        timing: { repeat: { frequency: 3, period: 1, periodUnit: 'd' } },
        doseAndRate: [
          {
            doseQuantity: {
              value: 1,
              unit: 'Stück',
              system: 'https://fhir.kbv.de/CodeSystem/KBV_CS_SFHIR_BMP_DOSIEREINHEIT',
              code: '1',
            },
          },
        ],
      },
    ],
    reasonReference: [{ reference: 'Condition/grund-klinik', display: 'Hypertonie' }],
  };

  it('lässt Dosierung, Text und Grund der anderen Einrichtung unverändert', () => {
    const neu = planeintragFortschreiben(fremd, { dosierung: null, grund: 'Blutdruck' });
    expect(neu['dosageInstruction']).toEqual(fremd['dosageInstruction']);
    expect(gerenderterText(neu)).toBe(gerenderterText(fremd));
    expect(neu['reasonReference']).toEqual(fremd.reasonReference);
  });

  it('schreibt eine geänderte Dosierung samt neuem Text und ersetzt den Grund nur auf Wunsch', () => {
    const neu = planeintragFortschreiben(fremd, {
      dosierung: dosierungAusText('0-0-1-0'),
      grund: null,
      grundDiagnose: { id: 'd1', code: 'I10.90', bezeichnung: 'Essentielle Hypertonie' },
    });
    expect(gerenderterText(neu)).toBe('täglich: 0-0-1-0 Stück');
    expect(neu['reasonReference']).toEqual([
      { reference: 'Condition/grund-d1', display: 'Essentielle Hypertonie' },
    ]);
    const ohne = planeintragFortschreiben(fremd, {
      dosierung: null,
      grund: null,
      grundDiagnose: null,
    });
    expect(ohne['reasonReference']).toBeUndefined();
  });
});
