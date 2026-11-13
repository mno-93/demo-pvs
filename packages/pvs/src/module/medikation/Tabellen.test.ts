import { describe, expect, it } from 'vitest';
import type { Planzeile } from './planabgleich.js';
import type { Listenzeile } from './stand.js';
import { planAktualisierbar } from './Tabellen.js';

const AKTIVITAET =
  'https://gematik.de/fhir/epa-medication/StructureDefinition/emp-medicationrequest-activity-extension';

function zeile(
  aussageStand: string,
  planStand: string,
  aufgenommen = false,
  { planText = 'täglich: 1-0-1-0 Stück', listenText = 'täglich: 2-0-1-0 Stück', spaeter = '' } = {},
): Listenzeile {
  const planeintrag = {
    status: 'aktiv',
    dosierung: planText,
    eintrag: {
      resourceType: 'MedicationRequest',
      id: 'mr-1',
      meta: { lastUpdated: planStand },
      extension: [
        ...(aufgenommen
          ? [
              {
                url: AKTIVITAET,
                extension: [
                  { url: 'reference', valueReference: { reference: 'MedicationStatement/ms-1' } },
                ],
              },
            ]
          : []),
        ...(spaeter
          ? [
              {
                url: AKTIVITAET,
                extension: [
                  { url: 'reference', valueReference: { reference: 'MedicationStatement/ms-2' } },
                  { url: 'addedOn', valueDateTime: spaeter },
                ],
              },
            ]
          : []),
      ],
    },
  } as unknown as Planzeile;
  return {
    aussage: {
      resourceType: 'MedicationStatement',
      id: 'ms-1',
      meta: { lastUpdated: aussageStand },
    },
    dosierung: listenText,
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

  it('bietet ihn bei gleichem Zeitstempel an — etwa nach dem Storno einer Abgabe', () => {
    expect(
      planAktualisierbar(zeile('2026-09-09T10:00:00+02:00', '2026-09-09T10:00:00+02:00')),
    ).toBe(true);
  });

  it('bietet ihn nicht an, wenn der Eintrag danach einen anderen Listeneintrag aufnahm (V2)', () => {
    expect(
      planAktualisierbar(
        zeile('2026-09-09T10:00:00+02:00', '2026-09-09T09:00:00+02:00', false, {
          spaeter: '2026-09-09T11:00:00+02:00',
        }),
      ),
    ).toBe(false);
  });

  it('vergleicht das Schema, nicht den Text: Freitext „1-0-0-0“ gleicht dem strukturierten', () => {
    expect(
      planAktualisierbar(
        zeile('2026-09-09T10:00:00+02:00', '2026-09-09T09:00:00+02:00', false, {
          planText: '1-0-0-0',
          listenText: '1-0-0-0 Stück',
        }),
      ),
    ).toBe(false);
  });

  it('entscheidet ohne Zeitstempel nach der Bedingung des Dienstes', () => {
    expect(planAktualisierbar(zeile('', ''))).toBe(true);
  });
});
