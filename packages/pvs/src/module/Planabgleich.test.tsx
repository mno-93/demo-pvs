import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Ressource } from '@demo-pvs/kern';
import { App } from '../App.js';
import { startzustand } from '../daten/startdaten.js';
import { ausfuehren, lesen, speicherStarten } from '../speicher/speicher.js';
import { vorgaenge } from '../speicher/vorgaenge.js';
import { epaFensterSchliessen } from '../epa/fenster.js';
import { klientZuruecksetzen } from '../epa/klient.js';
import { epaAttrappe, suchergebnis, type Aufzeichnung } from '../testhilfe/epa-attrappe.js';

/**
 * Medikationsplan der Praxis mit Abgleich (ADR 0046): Frau Hoffmann hat eine Akte, die eGK ist
 * noch nicht eingelesen. Die Praxis führt ihren Plan trotzdem; mit der Befugnis kommt der
 * Abgleich — Eindeutiges automatisch, Eigenes nur auf Knopfdruck.
 */

const MS = '/epa/medication/api/v1/fhir';
const EMP = 'https://gematik.de/fhir/epa-medication/StructureDefinition/';

function öffne(pfad: string) {
  return render(
    <MemoryRouter initialEntries={[pfad]}>
      <App />
    </MemoryRouter>,
  );
}

function planKarte(): HTMLElement {
  return screen.getByText('Medikationsplan der Praxis').closest('section')!;
}

function zeile(text: RegExp): HTMLElement {
  return within(planKarte()).getByText(text).closest('tr')!;
}

/** eMP mit Apixaban; `$add-emp-entry` und `$update-emp-entry` schreiben in denselben Stand. */
function aktensystem() {
  let chronik = 1;
  const mittel: Ressource[] = [
    { resourceType: 'Medication', id: 'm-apix', code: { text: 'Apixaban 5 mg Filmtabletten' } },
  ];
  const eintraege: Ressource[] = [
    {
      resourceType: 'MedicationRequest',
      id: 'emp-apix',
      meta: { versionId: '1' },
      status: 'active',
      intent: 'plan',
      medicationReference: { reference: 'Medication/m-apix' },
      dosageInstruction: [{ text: '1-0-1-0' }],
    },
  ];
  const chronologie = (): Ressource => ({
    resourceType: 'Provenance',
    id: `chron-${chronik}`,
    extension: [{ url: `${EMP}is-emp-chronology-extension`, valueBoolean: true }],
    target: eintraege.map((e) => ({
      reference: `MedicationRequest/${String(e.id)}/_history/${e.meta?.versionId ?? '1'}`,
    })),
    recorded: '2026-09-09T10:00:00',
    agent: [{ who: { display: 'Hausarztpraxis am Stadtgarten' } }],
  });
  const geschrieben = (e: Ressource) => ({
    status: 200,
    inhalt: {
      resourceType: 'Parameters',
      parameter: [
        { name: 'empEntry', resource: e },
        { name: 'relatedChronology', resource: chronologie() },
      ],
    },
  });
  return epaAttrappe((a: Aufzeichnung) => {
    if (a.pfad === `${MS}/$medication-list`) return { status: 200, inhalt: suchergebnis([]) };
    if (a.pfad === `${MS}/$medication-plan`)
      return {
        status: 200,
        inhalt: {
          resourceType: 'Bundle',
          meta: { lastUpdated: '2026-09-09T10:00:00.000' },
          type: 'collection',
          entry: [chronologie(), ...eintraege, ...mittel].map((resource) => ({ resource })),
        },
      };
    const parameter = (a.koerper as { parameter?: { name: string; resource?: Ressource }[] })
      ?.parameter;
    if (a.pfad === `${MS}/$add-emp-entry`) {
      chronik += 1;
      const m = parameter?.find((p) => p.name === 'medication')?.resource;
      const neu: Ressource = {
        ...parameter!.find((p) => p.resource?.resourceType === 'MedicationRequest')!.resource!,
        id: `emp-${chronik}`,
        meta: { versionId: '1' },
        status: 'active',
        medicationReference: { reference: `Medication/m-${chronik}` },
      };
      mittel.push({ ...(m ?? { resourceType: 'Medication' }), id: `m-${chronik}` });
      eintraege.push(neu);
      return geschrieben(neu);
    }
    if (a.pfad === `${MS}/$update-emp-entry`) {
      chronik += 1;
      const geaendert = parameter!.find(
        (p) => p.resource?.resourceType === 'MedicationRequest',
      )!.resource!;
      const i = eintraege.findIndex((e) => e.id === geaendert.id);
      const fassung = String(Number(eintraege[i]!.meta?.versionId ?? '1') + 1);
      eintraege[i] = { ...geaendert, meta: { versionId: fassung } };
      return geschrieben(eintraege[i]!);
    }
    return undefined;
  });
}

function befugnisErteilen() {
  act(() =>
    ausfuehren(
      vorgaenge.befugnisErhalten('p-hoffmann', '2099-01-01T00:00:00+01:00', '2026-09-09T08:00:00'),
    ),
  );
}

describe('Medikationsplan der Praxis mit Abgleich', () => {
  beforeEach(() => {
    klientZuruecksetzen();
    epaFensterSchliessen();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('führt den Plan vor dem Einlesen lokal und gleicht danach ab', async () => {
    const aufrufe = aktensystem();
    speicherStarten(startzustand());
    öffne('/patient/p-hoffmann/medikation');

    // Ohne Befugnis: der Plan der Praxis, nicht abgeglichen — und trotzdem ergänzbar.
    expect(await screen.findByText(/noch nie mit der ePA abgeglichen/)).toBeDefined();
    expect(screen.getByText('Ohne Zugriff auf die ePA.')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'neuer Planeintrag' }));
    fireEvent.change(screen.getByRole('combobox', { name: 'Arzneimittel suchen' }), {
      target: { value: 'Ramipril 5' },
    });
    fireEvent.click(screen.getByRole('option', { name: /Ramipril 5 mg Tabletten/ }));
    fireEvent.click(screen.getByRole('button', { name: 'In den Plan aufnehmen' }));
    expect(lesen().praxisplan).toMatchObject([
      { bezeichnung: 'Ramipril 5 mg Tabletten', epaId: null },
    ]);
    expect(within(zeile(/Ramipril/)).getByText('nur Praxis')).toBeDefined();
    expect(aufrufe.some((a) => a.pfad.endsWith('$add-emp-entry'))).toBe(false);

    // Mit der Befugnis: Apixaban kommt eindeutig aus dem eMP, Ramipril wartet auf die Ärztin.
    befugnisErteilen();
    await waitFor(() =>
      expect(within(planKarte()).getByText('Apixaban 5 mg Filmtabletten')).toBeDefined(),
    );
    expect(within(zeile(/Apixaban/)).getByText('abgeglichen')).toBeDefined();
    expect(screen.getByText(/1 Unterschied offen/)).toBeDefined();
    expect(aufrufe.some((a) => a.pfad.endsWith('$add-emp-entry'))).toBe(false);

    fireEvent.click(within(zeile(/Ramipril/)).getByRole('button', { name: 'in die ePA →' }));
    await waitFor(() => expect(within(zeile(/Ramipril/)).getByText('abgeglichen')).toBeDefined());
    expect(aufrufe.filter((a) => a.pfad.endsWith('$add-emp-entry'))).toHaveLength(1);
    // Kein zweiter Eintrag: Der neue eMP-Eintrag ist mit dem der Praxis verknüpft.
    expect(lesen().praxisplan.filter((e) => e.atc === 'C09AA05')).toHaveLength(1);
    expect(lesen().praxisplan.every((e) => e.epaId)).toBe(true);
  });

  it('überträgt eine Änderung ohne Zugriff erst auf Knopfdruck', async () => {
    const aufrufe = aktensystem();
    speicherStarten({
      ...startzustand(),
      epaBefugnisse: [
        {
          patientId: 'p-hoffmann',
          gueltigBis: '2099-01-01T00:00:00+01:00',
          erteiltAm: '2026-09-09T08:00:00',
        },
      ],
    });
    öffne('/patient/p-hoffmann/medikation');
    await waitFor(() => expect(within(zeile(/Apixaban/)).getByText('abgeglichen')).toBeDefined());

    // Befugnis weg: pausieren wirkt nur im Plan der Praxis.
    act(() => ausfuehren(vorgaenge.befugnisVerloren('p-hoffmann')));
    await screen.findByText(/Nicht abgeglichen/);
    fireEvent.click(within(zeile(/Apixaban/)).getByRole('button', { name: 'pausieren' }));
    expect(within(zeile(/Apixaban/)).getByText('lokal geändert')).toBeDefined();
    expect(aufrufe.some((a) => a.pfad.endsWith('$update-emp-entry'))).toBe(false);

    befugnisErteilen();
    const knopf = await within(planKarte()).findByRole('button', { name: 'Änderung in die ePA →' });
    expect(within(zeile(/Apixaban/)).getByText(/ePA: 1-0-1-0/)).toBeDefined();
    fireEvent.click(knopf);
    await waitFor(() => expect(within(zeile(/Apixaban/)).getByText('abgeglichen')).toBeDefined());
    const update = aufrufe.find((a) => a.pfad.endsWith('$update-emp-entry'))!;
    expect(JSON.stringify(update.koerper)).toContain('on-hold');
    expect(lesen().praxisplan[0]).toMatchObject({
      status: 'pausiert',
      epaStand: { status: 'pausiert', fassung: '2' },
    });
  });
});
