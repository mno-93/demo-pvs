import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { impfungNachFhir, type Ressource } from '@demo-pvs/kern';
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

/** ✦ Impfliste (ADR 0026) und Verlauf je Besuch. */

const B = '/epa/vorschlag/immunization/api/v1/fhir';

function öffne(pfad: string) {
  return render(
    <MemoryRouter initialEntries={[pfad]}>
      <App />
    </MemoryRouter>,
  );
}

function impflisteAttrappe(eintraege: Ressource[]) {
  const chronologie = {
    resourceType: 'Provenance',
    id: 'chron-imm-1',
    extension: [
      {
        url: 'https://example.org/demo-pvs/fhir/StructureDefinition/is-immunization-list-chronology',
        valueBoolean: true,
      },
    ],
    recorded: '2025-10-21T10:05:00',
    target: [],
  };
  return epaAttrappe((a) => {
    if (a.pfad === `${B}/metadata`)
      return { status: 200, inhalt: { resourceType: 'CapabilityStatement' } };
    if (a.pfad === `${B}/$immunization-list`) {
      return {
        status: 200,
        inhalt: suchergebnis(eintraege, [
          chronologie,
          ...eintraege.map((e) => provenance(e, KLINIKUM, '2025-10-21T10:00:00')),
        ]),
      };
    }
    if (a.pfad === `${B}/$add-immunization-entry`) {
      return {
        status: 200,
        inhalt: {
          resourceType: 'Parameters',
          parameter: [
            { name: 'entry', resource: { resourceType: 'Immunization', id: 'imm-neu' } },
            {
              name: 'relatedChronology',
              resource: { resourceType: 'Provenance', id: 'chron-imm-2' },
            },
          ],
        },
      };
    }
    return undefined;
  });
}

describe('Impfungen', () => {
  beforeEach(() => {
    klientZuruecksetzen();
    epaFensterSchliessen();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('stellt eine Impfung der Praxis mit Lesenachweis in die Impfliste und verknüpft sie', async () => {
    const aufrufe = impflisteAttrappe([]);
    speicherStarten({ ...startzustand(), epaBefugnisse: [dauerhafteBefugnis('p-yildiz')] });
    öffne('/patient/p-yildiz/impfungen');
    fireEvent.click(await screen.findByRole('button', { name: 'in die ePA ➜' }));
    await screen.findByText('In die Impfliste der ePA gestellt.');
    const anlage = aufrufe.find((a) => a.pfad.endsWith('$add-immunization-entry'))!;
    const parameter = (
      anlage.koerper as { parameter: { name: string; valueId?: string; resource?: Ressource }[] }
    ).parameter;
    expect(parameter.find((p) => p.name === 'acknowledgedChronologyId')?.valueId).toBe(
      'chron-imm-1',
    );
    const r = parameter.find((p) => p.name === 'immunizationEntry')!.resource!;
    expect(r.meta?.profile).toEqual([
      'http://hl7.eu/fhir/base/StructureDefinition/immunization-eu-core',
    ]);
    await waitFor(() =>
      expect(lesen().impfungen.find((i) => i.id === 'impf-y-1')?.epaId).toBe('imm-neu'),
    );
  });

  it('übernimmt eine Impfung aus der Impfliste in die Praxis', async () => {
    const aus = impfungNachFhir(
      {
        id: 'imm-1',
        patientId: 'x',
        impfstoff: {
          bezeichnung: 'Pneumokokken-Konjugatimpfstoff',
          atc: 'J07AL02',
          atcVersion: '2026',
          pzn: null,
        },
        zielkrankheiten: [
          { system: 'http://snomed.info/sct', code: '16814004', anzeige: 'Pneumokokken-Infektion' },
        ],
        datum: '2024-10-08',
        dosis: null,
        charge: null,
        geimpftVon: 'Dr. med. Petra Lang',
        status: 'erfolgt',
        herkunft: {
          bestand: 'epa',
          quelle: '',
          zeitpunkt: '2024-10-08T10:00:00',
          verantwortlich: 'x',
          dokumentId: null,
        },
        epaId: null,
        notiz: null,
      },
      'M555123402',
    );
    impflisteAttrappe([{ ...aus, meta: { versionId: '1' } }]);
    speicherStarten({ ...startzustand(), epaBefugnisse: [dauerhafteBefugnis('p-yildiz')] });
    öffne('/patient/p-yildiz/impfungen');
    fireEvent.click(await screen.findByRole('button', { name: '⬅ in die Praxis' }));
    expect(lesen().impfungen.some((i) => i.epaId === 'imm-1')).toBe(true);
  });
});

describe('Verlauf je Besuch', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sammelt Notiz und Impfung des heutigen Besuchs in einem Block', async () => {
    epaAttrappe(() => undefined);
    const z = startzustand();
    speicherStarten({
      ...z,
      impfungen: [
        {
          ...z.impfungen[0]!,
          id: 'impf-heute',
          patientId: 'p-hoffmann',
          datum: z.heute,
          herkunft: { ...z.impfungen[0]!.herkunft, zeitpunkt: `${z.heute}T09:10:00` },
        },
      ],
    });
    öffne('/patient/p-hoffmann/karteikarte');
    const heute = await screen.findByRole('region', { name: /Besuch am 09.09.2026/ });
    expect(heute.textContent).toContain('heutiger Besuch');
    expect(heute.textContent).toContain('Folgeverordnung');
    expect(heute.textContent).toContain('Influenza-Impfstoff');
    fireEvent.change(screen.getByLabelText('Text'), {
      target: { value: 'Impfung gut vertragen.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Notiz speichern' }));
    expect(
      (await screen.findByRole('region', { name: /Besuch am 09.09.2026/ })).textContent,
    ).toContain('Impfung gut vertragen.');
  });
});
