import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App.js';
import { startzustand } from '../daten/startdaten.js';
import { lesen, speicherStarten } from '../speicher/speicher.js';
import { epaFensterSchliessen } from '../epa/fenster.js';
import { klientZuruecksetzen } from '../epa/klient.js';
import { epaAttrappe } from '../testhilfe/epa-attrappe.js';

/**
 * Erfassung nach dem Informationsmodell: SNOMED CT im Hintergrund, Laborwerte nur aus Befunden.
 */

function öffne(pfad: string) {
  return render(
    <MemoryRouter initialEntries={[pfad]}>
      <App />
    </MemoryRouter>,
  );
}

describe('Diagnoseerfassung mit Kodierservice', () => {
  beforeEach(() => {
    speicherStarten(startzustand());
    epaFensterSchliessen();
    klientZuruecksetzen();
    // Kein Aktensystem im Test: Jeder Zugriff wird beantwortet, als gäbe es den Weg nicht.
    epaAttrappe(() => undefined);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('findet über ein Synonym und hinterlegt ICD-10-GM und SNOMED CT zugleich', () => {
    öffne('/patient/p-krueger/diagnosen');
    fireEvent.change(screen.getByRole('combobox', { name: /Diagnose suchen/ }), {
      target: { value: 'Bluthochdruck' },
    });
    const liste = screen.getByRole('listbox');
    const treffer = within(liste).getAllByRole('option')[0]!;
    expect(treffer.textContent).toContain('ICD-10-GM I10.90');
    expect(treffer.textContent).toContain('SNOMED CT 59621000');
    expect(treffer.textContent).toContain('gefunden über „Bluthochdruck"');

    fireEvent.click(treffer);
    fireEvent.click(screen.getByRole('button', { name: 'Diagnose speichern' }));

    const neu = lesen().diagnosen.find((d) => d.patientId === 'p-krueger' && d.code === 'I10.90');
    expect(neu?.snomed?.code).toBe('59621000');
    expect(neu?.diagnosesicherheit).toBe('gesichert');
    expect(neu?.dokumentiertAm).toBe(lesen().heute);
  });

  it('belegt Diagnosesicherheit und Status aus dem Zusatzkennzeichen vor', () => {
    öffne('/patient/p-krueger/diagnosen');
    fireEvent.change(screen.getByRole('combobox', { name: /Diagnose suchen/ }), {
      target: { value: 'Migräne' },
    });
    fireEvent.click(within(screen.getByRole('listbox')).getAllByRole('option')[0]!);
    fireEvent.change(screen.getByLabelText('ICD-Diagnosesicherheit'), { target: { value: 'Z' } });
    expect((screen.getByLabelText('Diagnosesicherheit') as HTMLSelectElement).value).toBe(
      'gesichert',
    );
    expect((screen.getByLabelText('Klinischer Status') as HTMLSelectElement).value).toBe('behoben');
  });
});

describe('Allergieerfassung mit der nationalen Werteliste', () => {
  beforeEach(() => {
    speicherStarten(startzustand());
    epaFensterSchliessen();
    klientZuruecksetzen();
    // Kein Aktensystem im Test: Jeder Zugriff wird beantwortet, als gäbe es den Weg nicht.
    epaAttrappe(() => undefined);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('kodiert die Substanz mit SNOMED CT und zeigt die AMTS-Zuordnung', () => {
    öffne('/patient/p-krueger/diagnosen');
    fireEvent.click(screen.getByRole('button', { name: 'Allergie' }));
    fireEvent.change(screen.getByRole('combobox', { name: /Auslösende Substanz/ }), {
      target: { value: 'Penicillin' },
    });
    const treffer = within(screen.getByRole('listbox')).getAllByRole('option')[0]!;
    expect(treffer.textContent).toContain('SNOMED CT 764146007');
    expect(treffer.textContent).toContain('AMTS: ATC J01C');
    fireEvent.click(treffer);
    expect(screen.getByText(/über ATC/)).toBeDefined();
  });

  it('lässt Freitext zu, sagt aber, was er kostet', () => {
    öffne('/patient/p-krueger/diagnosen');
    fireEvent.click(screen.getByRole('button', { name: 'Allergie' }));
    fireEvent.change(screen.getByRole('combobox', { name: /Auslösende Substanz/ }), {
      target: { value: 'Pflasterkleber' },
    });
    fireEvent.click(screen.getByRole('button', { name: /als Freitext übernehmen/ }));
    expect(screen.getByText('Freitext — nicht kodiert')).toBeDefined();
    expect(screen.getByText('nicht möglich ohne Code')).toBeDefined();
  });

  it('verlangt je Reaktion mindestens eine Manifestation', () => {
    öffne('/patient/p-krueger/diagnosen');
    fireEvent.click(screen.getByRole('button', { name: 'Allergie' }));
    fireEvent.change(screen.getByRole('combobox', { name: /Auslösende Substanz/ }), {
      target: { value: 'Erdnuss' },
    });
    fireEvent.click(within(screen.getByRole('listbox')).getAllByRole('option')[0]!);
    fireEvent.click(screen.getByRole('button', { name: 'Reaktion hinzufügen' }));
    expect(
      (screen.getByRole('button', { name: 'Allergie speichern' }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });
});

describe('Laborbefunde', () => {
  beforeEach(() => {
    speicherStarten(startzustand());
    epaFensterSchliessen();
    klientZuruecksetzen();
    // Kein Aktensystem im Test: Jeder Zugriff wird beantwortet, als gäbe es den Weg nicht.
    epaAttrappe(() => undefined);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('zeigt Werte nur im Befund und bietet keine Erfassung an', () => {
    öffne('/patient/p-yildiz/labor');
    expect(screen.getAllByText('TSH basal').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Laborgemeinschaft Nordwest').length).toBeGreaterThan(0);
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.queryByRole('spinbutton')).toBeNull();
  });

  it('verweist ohne Befund in der Praxis auf die ePA', () => {
    öffne('/patient/p-hoffmann/labor');
    fireEvent.click(screen.getByRole('button', { name: 'Laborbefunde in der ePA' }));
    const dialog = screen.getByRole('dialog', { name: 'Elektronische Patientenakte' });
    expect(within(dialog).getByRole('button', { name: 'Laborbefunde' }).className).toContain(
      'aktiv',
    );
  });
});
