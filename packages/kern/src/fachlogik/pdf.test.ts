import { describe, expect, it } from 'vitest';
import { briefPdfErzeugen, briefTextzeilen, type Briefvorlage } from './pdf.js';

const brief = (absaetze: number): Briefvorlage => ({
  absender: ['Klinikum Beispiel', 'Klinik für Innere Medizin'],
  empfaenger: ['Praxis Muster', 'Musterweg 1'],
  ortDatum: 'Beispielstadt, 17.07.2026',
  betreff: 'Stationärer Aufenthalt 12.07.2026 bis 18.07.2026',
  bausteine: [
    { art: 'ueberschrift', text: 'Diagnosen' },
    { art: 'zeile', text: 'I48.1 Vorhofflimmern, persistierend' },
    { art: 'leer' },
    { art: 'ueberschrift', text: 'Verlauf' },
    ...Array.from({ length: absaetze }, () => ({
      art: 'absatz' as const,
      text: 'Nach Ausschluss intrakardialer Thromben erfolgte die Kardioversion, die primär erfolgreich war. '.repeat(
        3,
      ),
    })),
  ],
  fusszeile: 'Klinikum Beispiel',
});

describe('Brief als PDF', () => {
  it('trägt Kopf, Abschnitte und Seitenzahl in der Textebene', () => {
    const pdf = briefPdfErzeugen(brief(1));
    expect(pdf.startsWith('%PDF-1.4')).toBe(true);
    expect(pdf).toContain('(Klinikum Beispiel) Tj');
    expect(pdf).toContain('/Helvetica-Bold');
    expect(pdf).toContain('(Seite 1 von 1) Tj');
    // Umlaute in WinAnsi, oktal maskiert.
    expect(pdf).toContain('(Station\\344rer');
  });

  it('bricht lange Briefe auf mehrere Seiten um', () => {
    const pdf = briefPdfErzeugen(brief(40));
    const seiten = Number(/\/Count (\d+)/.exec(pdf)?.[1]);
    expect(seiten).toBeGreaterThan(1);
    expect(pdf).toContain(`(Seite ${seiten} von ${seiten}) Tj`);
  });

  it('liefert die Textzeilen so, wie Suche und Lotse sie lesen', () => {
    const zeilen = briefTextzeilen(brief(1));
    expect(zeilen[0]).toBe('Stationärer Aufenthalt 12.07.2026 bis 18.07.2026');
    expect(zeilen).toContain('Diagnosen');
    expect(zeilen).toContain('   I48.1 Vorhofflimmern, persistierend');
    // Ein Abschnitt endet an der Leerzeile.
    expect(zeilen[zeilen.indexOf('Diagnosen') + 2]).toBe('');
  });
});
