import { beforeEach, describe, expect, it } from 'vitest';
import { befugnisende, befugnisErteilen, befugnisseLeeren, gueltigeBefugnis } from './befugnis.ts';

/**
 * Befugnismanagement nach Konzept 3.1.3 und OpenAPI `I_Entitlement_Management` 1.8.0.
 */
describe('Ende einer Befugnis', () => {
  it('rechnet wie die Beispiele der OpenAPI: Tag des Erteilens plus Dauer minus eins, Tagesende', () => {
    expect(befugnisende(new Date('2025-01-01T10:00:00Z'), 3)).toBe('2025-01-03T23:59:59+01:00');
    expect(befugnisende(new Date('2025-07-01T10:00:00Z'), 3)).toBe('2025-07-03T23:59:59+02:00');
  });

  it('gibt einer Arztpraxis 90 Tage', () => {
    expect(befugnisende(new Date('2026-07-14T09:02:00+02:00'), 90)).toBe(
      '2026-10-11T23:59:59+02:00',
    );
  });
});

describe('Erteilen', () => {
  beforeEach(() => befugnisseLeeren());

  it('behält eine bestehende Befugnis mit späterem Ende', () => {
    const lang = befugnisErteilen(
      'X1',
      'DEMO-PRAXIS-STADTGARTEN',
      new Date('2099-01-10T10:00:00Z'),
      'eGK',
    );
    const kurz = befugnisErteilen(
      'X1',
      'DEMO-PRAXIS-STADTGARTEN',
      new Date('2099-01-01T10:00:00Z'),
      'eGK',
    );
    expect(kurz).toBe(lang);
  });

  it('gibt der Apotheke nur drei Tage', () => {
    const b = befugnisErteilen(
      'X1',
      'DEMO-APOTHEKE-STADTGARTEN',
      new Date('2099-03-01T10:00:00Z'),
      'eGK',
    );
    expect(b.gueltigBis).toBe('2099-03-03T23:59:59+01:00');
  });

  it('kennt abgelaufene Befugnisse nicht mehr', () => {
    befugnisErteilen(
      'X1',
      'DEMO-PRAXIS-STADTGARTEN',
      new Date('2020-01-01T10:00:00Z'),
      'Startbestand',
    );
    expect(gueltigeBefugnis('X1', 'DEMO-PRAXIS-STADTGARTEN')).toBeNull();
  });
});
