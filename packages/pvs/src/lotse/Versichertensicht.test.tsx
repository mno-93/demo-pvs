import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { lotseAntworten } from '@demo-pvs/kern';
import { App } from '../App.js';
import { startzustand } from '../daten/startdaten.js';
import { speicherStarten } from '../speicher/speicher.js';
import { epaFensterSchliessen } from '../epa/fenster.js';
import { klientZuruecksetzen } from '../epa/klient.js';
import { epaAttrappe, suchergebnis } from '../testhilfe/epa-attrappe.js';

/**
 * ✦ Aktenlotse in der Versichertensicht: Die Grenze zur Bewertung ist eine eigene Antwort, kein
 * Fehler — und eine gesperrte Akte ist nicht leer.
 */

const LOTSE = '/epa/vorschlag/aktenlotse/api/v1';

function öffne() {
  return render(
    <MemoryRouter initialEntries={['/versicherte']}>
      <App />
    </MemoryRouter>,
  );
}

describe('Versichertensicht des Aktenlotsen', () => {
  beforeEach(() => {
    klientZuruecksetzen();
    epaFensterSchliessen();
    speicherStarten(startzustand());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('lehnt eine Bewertungsfrage sichtbar ab — mit Vorlesen, ohne Umfangsangabe', async () => {
    epaAttrappe((a) => {
      if (a.pfad === `${LOTSE}/metadata`) return { status: 200, inhalt: {} };
      if (a.pfad.startsWith('/epa/mhd/api/v1/fhir/DocumentReference'))
        return { status: 200, inhalt: suchergebnis([]) };
      if (a.pfad === `${LOTSE}/frage`) {
        const { frage } = a.koerper as { frage: string };
        return { status: 200, inhalt: lotseAntworten(frage, [], 'alltag') };
      }
      return undefined;
    });
    öffne();

    fireEvent.click(await screen.findByRole('button', { name: /Aktenlotse/ }));
    fireEvent.change(screen.getByLabelText('Frage an Ihre Unterlagen'), {
      target: { value: 'Werde ich wieder gesund?' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Fragen' }));

    expect(await screen.findByText('Keine Bewertung')).toBeTruthy();
    expect(screen.getByText(/Das wäre eine Bewertung/)).toBeTruthy();
    expect(screen.queryByText(/Unterlagen gelesen/)).toBeNull();
  });

  it('zeigt eine gesperrte Akte als gesperrt, nicht als leer', async () => {
    epaAttrappe((a) => {
      if (a.pfad === `${LOTSE}/metadata`) return { status: 200, inhalt: {} };
      if (a.pfad.startsWith('/epa/mhd/api/v1/fhir/DocumentReference'))
        return {
          status: 409,
          inhalt: {
            errorCode: 'statusMismatch',
            errorDetail: 'Die Akte ist vorübergehend nicht nutzbar (SUSPENDED).',
          },
        };
      return undefined;
    });
    öffne();

    expect(await screen.findByText('Die ePA ist vorübergehend gesperrt.')).toBeTruthy();
    expect(screen.queryByText('Keine Dokumente in der Akte.')).toBeNull();
  });
});
