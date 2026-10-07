import { fireEvent, render, screen, within } from '@testing-library/react';
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

  it('führt vom Dokument zur Rückfrage beim Verfasser und notiert sie für den Termin', async () => {
    const brief = {
      resourceType: 'DocumentReference',
      id: 'eab-1',
      status: 'current',
      description: 'Befundbericht Kardiologie',
      date: '2026-06-03T10:30:00',
      author: [
        { type: 'Practitioner', display: 'Dr. med. Jonas Behrens' },
        { type: 'Organization', display: 'Kardiologische Praxis am Wall' },
      ],
      content: [
        {
          attachment: {
            contentType: 'application/pdf',
            url: '/epa/mhd/retrieve/v1/content/eab-1.pdf',
          },
        },
      ],
    };
    const aufrufe = epaAttrappe((a) => {
      if (a.pfad === `${LOTSE}/metadata`) return { status: 200, inhalt: {} };
      if (a.pfad === `${LOTSE}/beschriftung`) return { status: 200, inhalt: [] };
      if (a.pfad.startsWith('/epa/mhd/api/v1/fhir/DocumentReference'))
        return { status: 200, inhalt: suchergebnis([brief]) };
      if (a.pfad.startsWith('/epa/vorschlag/kontakt/api/v1/einrichtung'))
        return {
          status: 200,
          inhalt: {
            name: 'Kardiologische Praxis am Wall',
            telefon: '0000 5544-0',
            tiMessenger: true,
          },
        };
      return undefined;
    });
    öffne();

    fireEvent.click(await screen.findByText('Befundbericht Kardiologie'));
    fireEvent.click(await screen.findByRole('button', { name: 'Nachfragen' }));
    expect(screen.getByText(/Bezug: Befundbericht Kardiologie/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Stimmt das?' }));

    const anrufen = await screen.findByRole('link', { name: /Anrufen · 0000 5544-0/ });
    expect(anrufen.getAttribute('href')).toBe('tel:00005544-0');
    // Gesucht wird die Einrichtung aus den Metadaten — nicht die Person.
    expect(
      aufrufe.some((a) => a.pfad.includes(encodeURIComponent('Kardiologische Praxis am Wall'))),
    ).toBe(true);

    fireEvent.change(screen.getByLabelText('Ihre Frage'), {
      target: { value: 'Steht das Metformin richtig im Brief?' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Für den Termin notieren' }));

    fireEvent.click(screen.getByRole('button', { name: /Meine Fragen/ }));
    expect(screen.getByText('Steht das Metformin richtig im Brief?')).toBeTruthy();
    expect(
      screen.getByText(/an Kardiologische Praxis am Wall · Bezug: Befundbericht Kardiologie/),
    ).toBeTruthy();
  });

  it('bietet nach „Keine Bewertung“ den Weg zur Praxis und die Notiz für den Termin an', async () => {
    epaAttrappe((a) => {
      if (a.pfad === `${LOTSE}/metadata`) return { status: 200, inhalt: {} };
      if (a.pfad === `${LOTSE}/beschriftung`) return { status: 200, inhalt: [] };
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
    fireEvent.click(await screen.findByRole('button', { name: 'Für den Termin notieren' }));
    expect(screen.getByRole('button', { name: 'Für den Termin notiert' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Meine Fragen/ }));
    // Die Antwort bleibt verdeckt stehen; gesucht wird in der Fragenliste.
    const liste = screen.getByRole('list', { name: 'Meine Fragen' });
    expect(within(liste).getByText('Werde ich wieder gesund?')).toBeTruthy();
  });

  it('öffnet den Medikationsplan aus einer Antwort, obwohl er kein Dokument ist', async () => {
    const plan = {
      id: 'medikationsplan',
      titel: 'Medikationsplan (eMP)',
      datum: '2026-07-18',
      einrichtung: 'elektronische Patientenakte',
      zeilen: ['Apixaban 5 mg Filmtabletten — 1-0-1-0 — wegen Vorhofflimmern'],
    };
    epaAttrappe((a) => {
      if (a.pfad === `${LOTSE}/metadata`) return { status: 200, inhalt: {} };
      if (a.pfad === `${LOTSE}/beschriftung`) return { status: 200, inhalt: [] };
      if (a.pfad.startsWith('/epa/mhd/api/v1/fhir/DocumentReference'))
        return { status: 200, inhalt: suchergebnis([]) };
      if (a.pfad === `${LOTSE}/frage`) {
        const { frage } = a.koerper as { frage: string };
        return { status: 200, inhalt: lotseAntworten(frage, [plan], 'alltag') };
      }
      if (a.pfad === `${LOTSE}/quelle/medikationsplan`)
        return { status: 200, inhalt: { ...plan, quelleId: plan.id, nichtLesbar: null } };
      return undefined;
    });
    öffne();

    fireEvent.click(await screen.findByRole('button', { name: /Aktenlotse/ }));
    fireEvent.click(
      screen.getByRole('button', { name: 'Welche Medikamente nehme ich und wofür?' }),
    );
    fireEvent.click(await screen.findByRole('button', { name: /Medikationsplan \(eMP\)/ }));

    expect(await screen.findByText(/Stand 18\.07\.2026/)).toBeTruthy();
    const zeile = screen.getByText('Apixaban 5 mg Filmtabletten — 1-0-1-0 — wegen Vorhofflimmern');
    expect(zeile.className).toContain('markiert');
    expect(screen.queryByText(/nicht aus einem Dokument/)).toBeNull();

    // Zurück führt zur selben Antwort, nicht zur leeren Frage.
    fireEvent.click(screen.getByRole('button', { name: 'Zurück' }));
    expect(screen.getByRole('button', { name: /Medikationsplan \(eMP\)/ })).toBeTruthy();
  });
});
