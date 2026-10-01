import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Ressource } from '@demo-pvs/kern';
import { App } from '../App.js';
import { startzustand } from '../daten/startdaten.js';
import { lesen, speicherStarten } from '../speicher/speicher.js';
import { epaFensterSchliessen } from '../epa/fenster.js';
import { klientZuruecksetzen } from '../epa/klient.js';
import {
  KLINIKUM,
  dauerhafteBefugnis,
  epaAttrappe,
  provenance,
  suchergebnis,
} from '../testhilfe/epa-attrappe.js';

/**
 * Abfrage „seit dem letzten Aufruf" nach den veröffentlichten IGs (ADR 0030): Chronologie des
 * Medikationsplans nach `recorded`, früherer Planstand, `$medication-list` mit `date`;
 * Dokumentsuche mit `_lastUpdated`.
 */

const MS = '/epa/medication/api/v1/fhir';
const MHD = '/epa/mhd/api/v1/fhir';
const EMP = 'https://gematik.de/fhir/epa-medication/StructureDefinition/';
const KARDIOLOGIE = {
  telematikId: 'DEMO-KARDIOLOGIE-AM-WALL',
  anzeige: 'Kardiologische Praxis am Wall',
};
const LESEZEICHEN = '2026-09-09T08:00:00.000';

function öffne(pfad: string) {
  return render(
    <MemoryRouter initialEntries={[pfad]}>
      <App />
    </MemoryRouter>,
  );
}

function chronologie(
  id: string,
  ziele: Ressource[],
  wer = KLINIKUM,
  recorded = '2026-07-18T16:05:00',
): Ressource {
  return {
    ...provenance(ziele[0]!, wer, recorded),
    id,
    extension: [{ url: `${EMP}is-emp-chronology-extension`, valueBoolean: true }],
    target: ziele.map((z) => ({
      reference: `MedicationRequest/${String(z.id)}/_history/${z.meta?.versionId ?? '1'}`,
    })),
  };
}

function eintrag(id: string, fassung: string, mittel: string): Ressource {
  return {
    resourceType: 'MedicationRequest',
    id,
    meta: { versionId: fassung },
    status: 'active',
    intent: 'plan',
    medicationReference: { reference: `Medication/${mittel}` },
    dosageInstruction: [{ text: '1-0-0-0' }],
  };
}
function mittel(id: string, text: string): Ressource {
  return { resourceType: 'Medication', id, code: { text } };
}

function plan(chron: Ressource, eintraege: Ressource[], dazu: Ressource[]) {
  return {
    resourceType: 'Bundle',
    meta: { lastUpdated: '2026-09-09T10:00:00.000' },
    type: 'collection',
    entry: [chron, ...eintraege, ...dazu].map((resource) => ({ resource })),
  };
}

describe('Abfrage „seit" im Medikationsplan', () => {
  beforeEach(() => {
    klientZuruecksetzen();
    epaFensterSchliessen();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('meldet neue, geänderte und entfallene Planeinträge anderer Einrichtungen', async () => {
    const bisoV1 = eintrag('emp-b', '1', 'mb');
    const bisoV2 = eintrag('emp-b', '2', 'mb');
    const ator = eintrag('emp-a', '1', 'ma');
    const tora = eintrag('emp-t', '1', 'mt');
    const mittelAlle = [
      mittel('mb', 'Bisoprolol 2,5 mg'),
      mittel('ma', 'Atorvastatin 40 mg'),
      mittel('mt', 'Torasemid 10 mg'),
    ];
    const alt = chronologie('chron-alt', [bisoV1, ator]);
    const neu = chronologie('chron-neu', [bisoV2, tora], KARDIOLOGIE, '2026-09-09T09:30:00');
    const aenderungen = [
      provenance(bisoV2, KARDIOLOGIE, '2026-09-09T09:30:00', 'UPDATE'),
      provenance(tora, KARDIOLOGIE, '2026-09-09T09:30:00'),
      provenance(bisoV1, KLINIKUM, '2026-07-18T16:00:00'),
      provenance(ator, KLINIKUM, '2026-07-18T16:00:00'),
    ];
    const aufrufe = epaAttrappe((a) => {
      if (a.pfad === `${MS}/$medication-list`) return { status: 200, inhalt: suchergebnis([]) };
      if (a.pfad.startsWith(`${MS}/$medication-list?date=gt`))
        return { status: 200, inhalt: suchergebnis([]) };
      if (a.pfad === `${MS}/$medication-plan`)
        return { status: 200, inhalt: plan(neu, [bisoV2, tora], [...mittelAlle, ...aenderungen]) };
      if (a.pfad === `${MS}/$medication-plan?provenance=chron-alt`)
        return { status: 200, inhalt: plan(alt, [bisoV1, ator], [...mittelAlle, ...aenderungen]) };
      if (a.pfad.startsWith(`${MS}/Provenance?is-emp-chronology=true&recorded=gt`))
        return { status: 200, inhalt: suchergebnis([neu]) };
      return undefined;
    });
    speicherStarten({
      ...startzustand(),
      epaBefugnisse: [dauerhafteBefugnis('p-hoffmann')],
      epaLesezeichen: [
        {
          patientId: 'p-hoffmann',
          bestand: 'medikation',
          zeitpunkt: LESEZEICHEN,
          chronologie: 'chron-alt',
        },
      ],
    });
    öffne('/patient/p-hoffmann/medikation');

    const band = await screen.findByText(/Seit dem letzten Aufruf am 09\.09\.2026, 08:00 Uhr/);
    const text = band.closest('.seit-band')!.textContent ?? '';
    expect(text).toContain('1 neu');
    expect(text).toContain('1 geändert');
    expect(text).toContain('entfallen: Atorvastatin 40 mg');
    expect(text).toContain('Kardiologische Praxis am Wall');
    const plan_ = band.closest('section') as HTMLElement;
    expect(within(plan_).getAllByText('neu')).toHaveLength(1);
    expect(within(plan_).getAllByText('geändert')).toHaveLength(1);
    // Die spezifizierten Wege — und danach ein neues Lesezeichen mit dem Zeitpunkt des Aktensystems.
    expect(
      aufrufe.some((a) => a.pfad.includes(`recorded=gt${encodeURIComponent(LESEZEICHEN)}`)),
    ).toBe(true);
    expect(aufrufe.some((a) => a.pfad.endsWith('$medication-plan?provenance=chron-alt'))).toBe(
      true,
    );
    const gemerkt = lesen().epaLesezeichen.find((l) => l.bestand === 'medikation');
    expect(gemerkt).toEqual({
      patientId: 'p-hoffmann',
      bestand: 'medikation',
      zeitpunkt: '2026-09-09T10:00:00.000',
      chronologie: 'chron-neu',
    });
    expect(lesen().handlungen).toBe(0);
  });

  it('zeigt beim ersten Aufruf kein Band und fragt nicht nach Änderungen', async () => {
    const ator = eintrag('emp-a', '1', 'ma');
    const aufrufe = epaAttrappe((a) => {
      if (a.pfad === `${MS}/$medication-list`) return { status: 200, inhalt: suchergebnis([]) };
      if (a.pfad === `${MS}/$medication-plan`)
        return {
          status: 200,
          inhalt: plan(
            chronologie('chron-1', [ator]),
            [ator],
            [mittel('ma', 'Atorvastatin 40 mg')],
          ),
        };
      return undefined;
    });
    speicherStarten({ ...startzustand(), epaBefugnisse: [dauerhafteBefugnis('p-hoffmann')] });
    öffne('/patient/p-hoffmann/medikation');
    await screen.findByText('Atorvastatin 40 mg');
    expect(screen.queryByText(/Seit dem letzten Aufruf/)).toBeNull();
    expect(aufrufe.some((a) => a.pfad.includes('Provenance?'))).toBe(false);
    expect(lesen().epaLesezeichen).toHaveLength(1);
  });
});

describe('Abfrage „seit" in der Dokumentenablage', () => {
  beforeEach(() => {
    klientZuruecksetzen();
    epaFensterSchliessen();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('markiert Dokumente, die andere Einrichtungen seitdem eingestellt haben', async () => {
    const dokument: Ressource = {
      resourceType: 'DocumentReference',
      id: 'dok-neu',
      status: 'current',
      date: '2026-09-09T09:30:00.000',
      author: [{ display: 'Dr. med. Jonas Behrens' }, { display: KARDIOLOGIE.anzeige }],
      description: 'Befundbericht Kardiologie, Kontrolle',
      content: [{ attachment: { contentType: 'application/xml', title: 'Kontrolle' } }],
    };
    const aufrufe = epaAttrappe((a) => {
      if (a.pfad === `${MHD}/DocumentReference?status=current`)
        return {
          status: 200,
          inhalt: { ...suchergebnis([dokument]), meta: { lastUpdated: '2026-09-09T10:00:00.000' } },
        };
      if (a.pfad.includes('_lastUpdated=gt'))
        return { status: 200, inhalt: suchergebnis([dokument]) };
      return undefined;
    });
    speicherStarten({
      ...startzustand(),
      epaBefugnisse: [dauerhafteBefugnis('p-hoffmann')],
      epaLesezeichen: [
        {
          patientId: 'p-hoffmann',
          bestand: 'dokumente',
          zeitpunkt: LESEZEICHEN,
          chronologie: null,
        },
      ],
    });
    öffne('/patient/p-hoffmann/dokumente');
    const band = await screen.findByText(/Seit dem letzten Aufruf/);
    expect(band.closest('.seit-band')!.textContent).toContain('1 Dokument neu');
    expect(screen.getByText('neu')).toBeDefined();
    expect(
      aufrufe.some((a) => a.pfad.includes(`_lastUpdated=gt${encodeURIComponent(LESEZEICHEN)}`)),
    ).toBe(true);
    expect(lesen().epaLesezeichen.find((l) => l.bestand === 'dokumente')?.zeitpunkt).toBe(
      '2026-09-09T10:00:00.000',
    );
  });
});
