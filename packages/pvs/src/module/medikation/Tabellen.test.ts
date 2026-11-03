import { describe, expect, it } from 'vitest';
import type { Planzeile } from './planabgleich.js';
import type { Listenzeile } from './stand.js';
import { planAktualisierbar } from './Tabellen.js';

const AKTIVITAET =
  'https://gematik.de/fhir/epa-medication/StructureDefinition/emp-medicationrequest-activity-extension';

function zeile(aussageStand: string, planStand: string, aufgenommen = false): Listenzeile {
  const planeintrag = {
    status: 'aktiv',
    dosierung: 'täglich: 1-0-1-0 Stück',
    eintrag: {
      resourceType: 'MedicationRequest',
      id: 'mr-1',
      meta: { lastUpdated: planStand },
      extension: aufgenommen
        ? [
            {
              url: AKTIVITAET,
              extension: [
                { url: 'reference', valueReference: { reference: 'MedicationStatement/ms-1' } },
              ],
            },
          ]
        : [],
    },
  } as unknown as Planzeile;
  return {
    aussage: {
      resourceType: 'MedicationStatement',
      id: 'ms-1',
      meta: { lastUpdated: aussageStand },
    },
    dosierung: 'täglich: 2-0-1-0 Stück',
    planeintrag,
  } as unknown as Listenzeile;
}

describe('Plan aktualisieren', () => {
  it('bietet einen jüngeren, noch nicht aufgenommenen Listeneintrag an', () => {
    expect(
      planAktualisierbar(zeile('2026-09-09T10:00:00+02:00', '2026-09-09T09:00:00+02:00')),
    ).toBe(true);
  });

  it('bietet einen schon aufgenommenen Listeneintrag nicht an', () => {
    expect(
      planAktualisierbar(zeile('2026-09-09T10:00:00+02:00', '2026-09-09T09:00:00+02:00', true)),
    ).toBe(false);
  });

  it('bietet einen Listeneintrag nicht an, der älter ist als der Planeintrag', () => {
    expect(
      planAktualisierbar(zeile('2026-09-09T09:00:00+02:00', '2026-09-09T10:00:00+02:00')),
    ).toBe(false);
  });
});
