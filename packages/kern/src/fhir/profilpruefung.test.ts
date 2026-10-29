import { describe, expect, it } from 'vitest';
import { dosierungAusText } from '../fachlogik/dosierung.js';
import { BEISPIEL_DIAGNOSE } from './profilpruefung.testdaten.js';
import { planGrundNachFhir, planeintragNachFhir, planmittelNachFhir } from './medikation.js';
import { PROFILREGELN_PAKETE, profilPruefen } from './profilpruefung.js';

const MS = 'https://gematik.de/fhir/epa-medication/StructureDefinition/';

describe('Profilprüfung mit den Regeln der Medikationsprofile', () => {
  it('nennt die Pakete, aus denen die Regeln stammen', () => {
    expect(PROFILREGELN_PAKETE).toContain('de.gematik.epa#1.4.0-ballot.1');
    expect(PROFILREGELN_PAKETE).toContain('de.fhir.medication#2.0.0-ballot');
  });

  it('lässt durch, was das Praxissystem an den Dienst schickt', () => {
    const mittel = planmittelNachFhir({
      bezeichnung: 'Ramipril 5 mg',
      atc: 'C09AA05',
      atcVersion: '2026',
    });
    const eintrag = planeintragNachFhir({
      kvnr: 'A123456780',
      datum: '2026-10-29',
      dosierung: dosierungAusText('1-0-0,5-0'),
      grund: 'Blutdruck',
      grundDiagnose: BEISPIEL_DIAGNOSE,
      mittel: { reference: `Medication/${String(mittel.id)}` },
    });
    expect(profilPruefen(eintrag, `${MS}emp-medication-request|1.4.0`)).toEqual([]);
    expect(profilPruefen(mittel, `${MS}emp-medication`)).toEqual([]);
    expect(
      profilPruefen(
        planGrundNachFhir(BEISPIEL_DIAGNOSE, 'A123456780'),
        `${MS}emp-reason-condition`,
      ),
    ).toEqual([]);
  });

  it('meldet Verstöße mit dem Schlüssel der Regel', () => {
    const regeln = (r: Record<string, unknown>) =>
      profilPruefen({ resourceType: 'MedicationRequest', ...r }, `${MS}emp-medication-request`).map(
        (b) => b.regel,
      );
    const basis = {
      status: 'active',
      intent: 'plan',
      medicationReference: { reference: 'Medication/x' },
      subject: { identifier: { system: 'http://fhir.de/sid/gkv/kvid-10', value: 'A123456780' } },
      authoredOn: '2026-10-29',
    };
    expect(regeln({ ...basis, dosageInstruction: [{ text: '1-0-1-0' }] })).toContain(
      'DosageFourSlotPatternInText',
    );
    expect(regeln({ ...basis, reasonCode: [{ text: 'Hypertonie' }] })).toContain('Kardinalität');
    expect(regeln({ ...basis, intent: 'order' })).toContain('Muster');
    expect(regeln({ ...basis, status: 'draft' })).toContain('Werteliste');
    expect(
      regeln({
        ...basis,
        dosageInstruction: [
          {
            timing: { repeat: { when: ['MORN'] } },
            doseAndRate: [{ doseQuantity: { value: 0.2, unit: 'Stück' } }],
          },
        ],
      }),
    ).toContain('DosageDoseQuantityAllowedFractions');
  });
});
