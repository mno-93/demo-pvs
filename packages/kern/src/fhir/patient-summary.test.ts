import { describe, expect, it } from 'vitest';
import {
  LISTE_LEER,
  PS_ABSCHNITTE,
  PS_QUELLE_EXTENSION,
  PS_QUELLE_SYSTEM,
  PS_WEITERE_EXTENSION,
  istPsRelevant,
  patientSummaryLesen,
  psRelevanzSetzen,
} from './patient-summary.js';

const quelle = (code: string) => [
  { url: PS_QUELLE_EXTENSION, valueCoding: { system: PS_QUELLE_SYSTEM, code } },
];

function bundle(sections: unknown[], weitere: unknown[] = []) {
  return {
    resourceType: 'Bundle',
    type: 'document',
    entry: [
      {
        resource: {
          resourceType: 'Composition',
          date: '2026-09-28T10:00:00',
          author: [{ display: 'Patient-Summary-Dienst' }],
          section: sections,
        },
      },
      ...weitere.map((resource) => ({ resource })),
    ],
  };
}

describe('Patient Summary lesen', () => {
  it('ordnet Sections über den LOINC-Code den Abschnitten zu und löst Einträge auf', () => {
    const ps = patientSummaryLesen(
      bundle(
        [
          {
            extension: quelle('condition-list'),
            code: { coding: [{ code: '11450-4' }] },
            entry: [{ reference: 'Condition/c1' }],
          },
        ],
        [{ resourceType: 'Condition', id: 'c1' }],
      ),
    )!;
    const diagnosen = ps.abschnitte.find((a) => a.schluessel === 'diagnosen')!;
    expect(diagnosen.quelle).toBe('condition-list');
    expect(diagnosen.leer).toBeNull();
    expect(diagnosen.eintraege.map((e) => e.id)).toEqual(['c1']);
    expect(ps.abschnitte).toHaveLength(PS_ABSCHNITTE.length);
  });

  it('unterscheidet „nichts bekannt" von „nicht verfügbar"', () => {
    const ps = patientSummaryLesen(
      bundle([
        {
          code: { coding: [{ code: '48765-2' }] },
          emptyReason: { coding: [{ system: LISTE_LEER, code: 'nilknown' }] },
        },
        {
          code: { coding: [{ code: '11369-6' }] },
          emptyReason: { coding: [{ system: LISTE_LEER, code: 'unavailable' }] },
        },
      ]),
    )!;
    expect(ps.abschnitte.find((a) => a.schluessel === 'allergien')!.leer).toBe('nilknown');
    expect(ps.abschnitte.find((a) => a.schluessel === 'impfungen')!.leer).toBe('unavailable');
    // Fehlt eine Section ganz, ist die Information nicht verfügbar — ohne Quelle.
    const prozeduren = ps.abschnitte.find((a) => a.schluessel === 'prozeduren')!;
    expect(prozeduren.leer).toBe('unavailable');
    expect(prozeduren.quelle).toBe('none');
  });

  it('weist anderes als ein Bundle mit Composition zurück', () => {
    expect(patientSummaryLesen(null)).toBeNull();
    expect(patientSummaryLesen({ resourceType: 'Bundle', entry: [] })).toBeNull();
  });
});

describe('Relevanzmarkierung', () => {
  it('setzt und entfernt die Markierung, ohne andere Extensions zu berühren', () => {
    const r = {
      resourceType: 'Condition',
      id: 'c1',
      extension: [{ url: 'https://example.org/andere', valueString: 'x' }],
    };
    const an = psRelevanzSetzen(r, true);
    expect(istPsRelevant(an)).toBe(true);
    expect(an.extension).toHaveLength(2);
    const aus = psRelevanzSetzen(an, false);
    expect(istPsRelevant(aus)).toBe(false);
    expect(aus.extension).toEqual([{ url: 'https://example.org/andere', valueString: 'x' }]);
    expect(psRelevanzSetzen({ resourceType: 'Condition' }, false).extension).toBeUndefined();
  });

  it('liest die Zahl der nicht markierten Einträge je Abschnitt', () => {
    const ps = patientSummaryLesen(
      bundle([
        {
          extension: [...quelle('condition-list'), { url: PS_WEITERE_EXTENSION, valueInteger: 3 }],
          code: { coding: [{ code: '11450-4' }] },
          emptyReason: { coding: [{ system: LISTE_LEER, code: 'unavailable' }] },
        },
      ]),
    )!;
    const d = ps.abschnitte.find((a) => a.schluessel === 'diagnosen')!;
    expect(d.weitere).toBe(3);
    expect(d.eintraege).toHaveLength(0);
  });
});
