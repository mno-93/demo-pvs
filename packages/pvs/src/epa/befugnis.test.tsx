import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App.js';
import { startzustand } from '../daten/startdaten.js';
import { lesen, speicherStarten } from '../speicher/speicher.js';
import { epaFensterSchliessen } from './fenster.js';
import { klientZuruecksetzen } from './klient.js';
import { befugnisseAblaufenLassen } from './befugnis.js';
import { dauerhafteBefugnis, epaAttrappe } from '../testhilfe/epa-attrappe.js';

/**
 * Befugnis über den Behandlungskontext (ADR 0017): Die ePA gibt Daten nur heraus, wenn die
 * Praxis die eGK eingelesen hat — 90 Tage lang. Das Praxissystem führt nur, was die ePA ihm
 * dazu geantwortet hat.
 */

function öffne(pfad: string) {
  return render(
    <MemoryRouter initialEntries={[pfad]}>
      <App />
    </MemoryRouter>,
  );
}

function base64urlLesen(teil: string): string {
  return atob(teil.replace(/-/g, '+').replace(/_/g, '/'));
}

describe('eGK einlesen', () => {
  beforeEach(() => {
    klientZuruecksetzen();
    epaFensterSchliessen();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('registriert die Befugnis mit dem Prüfungsnachweis und merkt sich ihr Ende', async () => {
    const aufrufe = epaAttrappe((a) =>
      a.pfad === '/epa/basic/api/v1/ps/entitlements'
        ? { status: 201, inhalt: { validTo: '2026-12-08T10:00:00+01:00' } }
        : undefined,
    );
    speicherStarten(startzustand());
    öffne('/patient/p-hoffmann/stammdaten');
    expect(screen.getAllByText('keine ePA-Befugnis').length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole('button', { name: 'Karte einlesen' }));
    expect((await screen.findAllByText('ePA-Befugnis bis 08.12.2026')).length).toBeGreaterThan(0);

    const aufruf = aufrufe.find((a) => a.pfad.endsWith('/entitlements'))!;
    expect(aufruf.methode).toBe('POST');
    expect(aufruf.kopf['x-insurantid']).toBe('A123456780');
    const jwt = (aufruf.koerper as { jwt: string }).jwt;
    const nutzlast = JSON.parse(base64urlLesen(jwt.split('.')[1]!)) as { auditEvidence: string };
    const nachweis = JSON.parse(atob(nutzlast.auditEvidence)) as { kvnr: string };
    expect(nachweis.kvnr).toBe('A123456780');

    const z = lesen();
    expect(z.epaBefugnisse.find((b) => b.patientId === 'p-hoffmann')?.gueltigBis).toBe(
      '2026-12-08T10:00:00+01:00',
    );
    expect(
      z.patienten.find((p) => p.id === 'p-hoffmann')?.versicherung.zuletztEingelesen,
    ).not.toBeNull();
    // Einlesen ist eine Handlung; die Befugnis ist ihre Folge und zählt nicht eigens.
    expect(z.handlungen).toBe(1);
  });

  it('meldet, wenn die ePA die Befugnis nicht erteilt', async () => {
    epaAttrappe((a) =>
      a.pfad.endsWith('/entitlements')
        ? {
            status: 404,
            inhalt: {
              errorCode: 'noHealthRecord',
              errorDetail: 'Für A123456780 besteht keine Akte.',
            },
          }
        : undefined,
    );
    speicherStarten(startzustand());
    öffne('/patient/p-hoffmann/stammdaten');
    fireEvent.click(screen.getByRole('button', { name: 'Karte einlesen' }));
    expect(await screen.findByText(/Für diese Person besteht keine ePA/)).toBeDefined();
    expect(lesen().epaBefugnisse.some((b) => b.patientId === 'p-hoffmann')).toBe(false);
  });
});

describe('ePA ohne Befugnis', () => {
  beforeEach(() => {
    klientZuruecksetzen();
    epaFensterSchliessen();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('berichtigt den eigenen Stand, wenn die ePA notEntitled meldet, und bietet das Einlesen an', async () => {
    epaAttrappe((a) =>
      a.pfad.startsWith('/epa/')
        ? {
            status: 403,
            inhalt: { errorCode: 'notEntitled', errorDetail: 'Keine gültige Befugnis.' },
          }
        : undefined,
    );
    speicherStarten({ ...startzustand(), epaBefugnisse: [dauerhafteBefugnis('p-yildiz')] });
    öffne('/patient/p-yildiz/karteikarte');
    fireEvent.click(screen.getByRole('button', { name: /ePA öffnen/ }));
    const dialog = screen.getByRole('dialog', { name: 'Elektronische Patientenakte' });

    expect(
      await within(dialog).findByText('Keine Befugnis für die ePA dieser Person.'),
    ).toBeDefined();
    expect(within(dialog).getByRole('button', { name: 'eGK einlesen' })).toBeDefined();
    expect(lesen().epaBefugnisse.some((b) => b.patientId === 'p-yildiz')).toBe(false);
  });

  it('fragt Medikation und Listen ohne bekannte Befugnis gar nicht erst ab', () => {
    const aufrufe = epaAttrappe(() => undefined);
    speicherStarten(startzustand());
    öffne('/patient/p-hoffmann/medikation');
    expect(screen.getByText('Keine Befugnis für die ePA dieser Person.')).toBeDefined();
    // Keine Abfrage einer Akte (x-insurantid); die Fähigkeiten des Aktensystems sind aktenfrei.
    expect(
      aufrufe.filter((a) => a.pfad.startsWith('/epa/') && a.kopf['x-insurantid']),
    ).toHaveLength(0);
  });
});

describe('Befugnisse ablaufen lassen (Demo-Steuerung)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('entzieht sie in der ePA und vergisst sie im Praxissystem — wie nach 90 Tagen', async () => {
    const aufrufe = epaAttrappe((a) =>
      a.pfad === '/verwaltung/befugnisse/entziehen'
        ? { status: 200, inhalt: { entzogen: 1 } }
        : undefined,
    );
    speicherStarten({
      ...startzustand(),
      epaBefugnisse: [dauerhafteBefugnis('p-hoffmann')],
    });

    expect(await befugnisseAblaufenLassen()).toBe(1);
    expect(aufrufe.some((a) => a.pfad === '/verwaltung/befugnisse/entziehen')).toBe(true);
    expect(lesen().epaBefugnisse).toEqual([]);
  });
});
