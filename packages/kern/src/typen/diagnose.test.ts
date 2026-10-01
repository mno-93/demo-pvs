import { describe, expect, it } from 'vitest';
import {
  istGegenwaertig,
  sicherheitAusZusatzkennzeichen,
  statusAusZusatzkennzeichen,
} from './diagnose.js';

describe('Vorbelegung aus dem Zusatzkennzeichen', () => {
  it('leitet die Diagnosesicherheit des Modells ab', () => {
    expect(sicherheitAusZusatzkennzeichen('G')).toBe('gesichert');
    expect(sicherheitAusZusatzkennzeichen('V')).toBe('vorläufig');
    expect(sicherheitAusZusatzkennzeichen('A')).toBe('ausgeschlossen');
  });

  it('behandelt „Zustand nach" als gesichert und behoben', () => {
    expect(sicherheitAusZusatzkennzeichen('Z')).toBe('gesichert');
    expect(statusAusZusatzkennzeichen('Z')).toBe('behoben');
    expect(statusAusZusatzkennzeichen('G')).toBe('aktiv');
  });
});

describe('Klinischer Status', () => {
  it('zählt Wiederauftreten und Rezidiv zu den gegenwärtigen Erkrankungen', () => {
    expect(istGegenwaertig('aktiv')).toBe(true);
    expect(istGegenwaertig('wiederauftreten')).toBe(true);
    expect(istGegenwaertig('rezidiv')).toBe(true);
    expect(istGegenwaertig('remission')).toBe(false);
    expect(istGegenwaertig('behoben')).toBe(false);
  });
});
