import { describe, expect, it } from 'vitest';
import { allergieAusFhir, dokumentinhaltLesen } from './dokumentinhalt.js';
import { laborbefundBauen } from './laborbefund.js';

const entlassbrief = {
  resourceType: 'Bundle',
  type: 'document',
  entry: [
    {
      resource: {
        resourceType: 'Composition',
        type: { coding: [{ system: 'http://loinc.org', code: '18842-5' }] },
      },
    },
    { resource: { resourceType: 'Condition', id: 'c1' } },
    {
      resource: {
        resourceType: 'AllergyIntolerance',
        id: 'a1',
        type: 'allergy',
        verificationStatus: { coding: [{ code: 'confirmed' }] },
        code: {
          coding: [
            { system: 'http://snomed.info/sct', code: '764146007' },
            { system: 'http://fhir.de/CodeSystem/bfarm/atc', code: 'J01C' },
          ],
          text: 'Penicillin',
        },
      },
    },
    { resource: { resourceType: 'Procedure', id: 'p1' } },
  ],
};

describe('Inhalte strukturierter Dokumente', () => {
  it('erkennt den Entlassbrief und zerlegt ihn clientseitig', () => {
    const inhalt = dokumentinhaltLesen(entlassbrief);
    expect(inhalt.art).toBe('Entlassbrief');
    expect(inhalt.diagnosen).toHaveLength(1);
    expect(inhalt.allergien).toHaveLength(1);
    expect(inhalt.prozeduren).toHaveLength(1);
  });

  it('erkennt den Laborbefund und liest seine Messwerte', () => {
    const bundle = laborbefundBauen({
      uuid: '3b1c9a52-5c4e-4f0b-9d47-2e8f61a0c7d3',
      auftragsnummer: 'L-1',
      kvnr: 'M555123402',
      patientName: { vorname: 'Meral', nachname: 'Yildiz' },
      geburtsdatum: '1969-06-25',
      labor: 'Labor',
      freigebendePerson: 'Dr. X',
      auftraggeber: 'Praxis',
      entnahme: '2026-07-02T08:30:00',
      freigabe: '2026-07-02T13:40:00',
      probenart: 'Serum',
      beurteilung: null,
      gruppen: [
        {
          bezeichnung: 'Schilddrüse',
          werte: [
            {
              loinc: '3016-3',
              bezeichnung: 'TSH',
              wert: 3.1,
              einheit: 'mU/l',
              ucum: 'm[IU]/L',
              referenzNiedrig: 0.4,
              referenzHoch: 4,
              referenzText: '0,4–4,0',
            },
          ],
        },
      ],
    });
    const inhalt = dokumentinhaltLesen(bundle);
    expect(inhalt.art).toBe('Laborbefund');
    expect(inhalt.beobachtungen).toHaveLength(1);
  });

  it('nennt ein Dokument ohne Composition unstrukturiert', () => {
    expect(dokumentinhaltLesen({ resourceType: 'Binary' }).art).toBe('unstrukturiert');
  });

  it('übernimmt die ATC-Kodierung, die der Entlassbrief selbst mitbringt', () => {
    const [ressource] = dokumentinhaltLesen(entlassbrief).allergien;
    const allergie = allergieAusFhir(ressource!, 'Entlassbrief');
    expect(allergie.atc).toEqual(['J01C']);
    expect(allergie.snomed).toBe('764146007');
    expect(allergie.gewissheit).toBe('bestätigt');
  });
});
