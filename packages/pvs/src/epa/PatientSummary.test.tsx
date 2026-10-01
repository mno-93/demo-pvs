import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  LISTE_LEER,
  PS_ABSCHNITTE,
  PS_QUELLE_EXTENSION,
  PS_QUELLE_SYSTEM,
  allergieNachFhir,
  diagnoseNachFhir,
  type Ressource,
} from '@demo-pvs/kern';
import { App } from '../App.js';
import { startzustand } from '../daten/startdaten.js';
import { speicherStarten } from '../speicher/speicher.js';
import { epaFensterSchliessen } from './fenster.js';
import { klientZuruecksetzen } from './klient.js';
import {
  dauerhafteBefugnis,
  epaAttrappe,
  suchergebnis,
  type Attrappenantwort,
} from '../testhilfe/epa-attrappe.js';

/**
 * ✦ Patient Summary (ADR 0021): mit einem Klick aus dem Patientenkopf erreichbar, als Sicht
 * ohne eigene Eingabe; jeder Block führt dorthin, wo er gepflegt wird.
 */

const PS = '/epa/vorschlag/patient-summary/api/v1/fhir';

function öffne(pfad: string) {
  return render(
    <MemoryRouter initialEntries={[pfad]}>
      <App />
    </MemoryRouter>,
  );
}

/** Ein Patient-Summary-Bundle: eine Diagnose aus der Liste, „keine bekannten Allergien", Rest leer. */
function summaryBundle(kvnr: string) {
  const z = startzustand();
  const d = z.diagnosen.find((x) => x.patientId === 'p-krueger')!;
  const condition = { ...diagnoseNachFhir({ ...d, id: 'cond-1' }, kvnr), id: 'cond-1' };
  const a = z.allergien[0]!;
  const keineBekannte = {
    ...allergieNachFhir(
      {
        ...a,
        id: 'nka',
        substanz: 'Keine bekannte Allergie',
        snomed: {
          system: 'http://snomed.info/sct',
          code: '716186003',
          anzeige: 'No known allergy',
        },
        reaktionen: [],
      },
      kvnr,
    ),
    id: 'nka',
  };
  const eintraege: Partial<Record<string, Ressource>> = {
    '11450-4': condition,
    '48765-2': keineBekannte,
  };
  const quelle: Record<string, string> = {
    '11450-4': 'condition-list',
    '48765-2': 'allergy-list',
  };
  return {
    resourceType: 'Bundle',
    type: 'document',
    entry: [
      {
        resource: {
          resourceType: 'Composition',
          date: '2026-09-28T10:00:00',
          section: PS_ABSCHNITTE.map((s) => {
            const e = eintraege[s.loinc];
            return {
              extension: [
                {
                  url: PS_QUELLE_EXTENSION,
                  valueCoding: { system: PS_QUELLE_SYSTEM, code: quelle[s.loinc] ?? 'none' },
                },
              ],
              title: s.titel,
              code: { coding: [{ code: s.loinc }] },
              ...(e
                ? { entry: [{ reference: `${e.resourceType}/${String(e.id)}` }] }
                : { emptyReason: { coding: [{ system: LISTE_LEER, code: 'unavailable' }] } }),
            };
          }),
        },
      },
      { resource: condition },
      { resource: keineBekannte },
    ],
  };
}

function aktensystem(mitSummary: boolean) {
  const z = startzustand();
  const kvnr = z.patienten.find((p) => p.id === 'p-krueger')!.versicherung.kvnr;
  return epaAttrappe((a): Attrappenantwort | undefined => {
    if (a.pfad === `${PS}/metadata`) {
      return mitSummary
        ? { status: 200, inhalt: { resourceType: 'CapabilityStatement', status: 'draft' } }
        : undefined;
    }
    if (a.pfad === `${PS}/Patient/$summary`) return { status: 200, inhalt: summaryBundle(kvnr) };
    if (a.pfad.startsWith('/epa/mhd/api/v1/fhir/DocumentReference')) {
      return { status: 200, inhalt: suchergebnis([]) };
    }
    return undefined;
  });
}

describe('Patient Summary', () => {
  beforeEach(() => {
    klientZuruecksetzen();
    epaFensterSchliessen();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('ist aus dem Patientenkopf direkt erreichbar und unterscheidet die Leerangaben', async () => {
    aktensystem(true);
    speicherStarten({ ...startzustand(), epaBefugnisse: [dauerhafteBefugnis('p-krueger')] });
    öffne('/patient/p-krueger/karteikarte');

    fireEvent.click(await screen.findByRole('button', { name: 'Patient Summary' }));
    const dialog = screen.getByRole('dialog', { name: 'Elektronische Patientenakte' });
    const reiter = await within(dialog).findByRole('button', { name: 'Patient Summary' });
    expect(reiter.getAttribute('aria-current')).toBe('page');

    const allergien = await within(dialog).findByRole('region', {
      name: 'Allergien und Unverträglichkeiten',
    });
    expect(within(allergien).getByText('Keine bekannten Allergien')).toBeDefined();
    const impfungen = within(dialog).getByRole('region', { name: 'Impfungen' });
    expect(within(impfungen).getByText('Information nicht verfügbar')).toBeDefined();
    // Die Patient Summary hat keine Eingabe: kein Textfeld, kein Kästchen.
    expect(within(dialog).queryAllByRole('textbox')).toHaveLength(0);
    expect(within(dialog).queryAllByRole('checkbox')).toHaveLength(0);
  });

  it('führt aus einem Block in den Bereich, in dem er gepflegt wird', async () => {
    aktensystem(true);
    speicherStarten({ ...startzustand(), epaBefugnisse: [dauerhafteBefugnis('p-krueger')] });
    öffne('/patient/p-krueger/karteikarte');

    fireEvent.click(await screen.findByRole('button', { name: 'Patient Summary' }));
    const diagnosen = await screen.findByRole('region', { name: 'Diagnosen' });
    fireEvent.click(within(diagnosen).getByRole('button', { name: /Zur Diagnosenübersicht/ }));

    expect(screen.queryByRole('dialog')).toBeNull();
    // Im Splitscreen der Kartei, nicht mehr in der ePA.
    expect(
      await screen.findByRole('region', { name: 'Allergien und Unverträglichkeiten' }),
    ).toBeDefined();
    expect(screen.getByRole('link', { name: 'Diagnosen und Allergien' }).className).toContain(
      'aktiv',
    );
  });

  it('zeigt keinen Zugang, wenn das Aktensystem keine Patient Summary anbietet', async () => {
    const aufrufe = aktensystem(false);
    speicherStarten({ ...startzustand(), epaBefugnisse: [dauerhafteBefugnis('p-krueger')] });
    öffne('/patient/p-krueger/karteikarte');
    await vi.waitFor(() => expect(aufrufe.some((a) => a.pfad === `${PS}/metadata`)).toBe(true));
    expect(screen.queryByRole('button', { name: 'Patient Summary' })).toBeNull();
  });
});
