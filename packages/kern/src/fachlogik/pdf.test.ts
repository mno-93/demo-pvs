import { describe, expect, it } from 'vitest';
import {
  briefPdfErzeugen,
  briefTextzeilen,
  pdfErzeugen,
  pdfSeitenLesen,
  type Briefvorlage,
} from './pdf.js';

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

describe('PDF-Seiten lesen', () => {
  it('liest einen Brief seitengetreu zurück: Text, Schrift, Lage', () => {
    const seiten = pdfSeitenLesen(briefPdfErzeugen(brief(40)))!;
    expect(seiten.length).toBeGreaterThan(1);
    const texte = seiten[0]!.elemente.filter((e) => e.art === 'text');
    const kopf = texte.find((e) => e.text === 'Klinikum Beispiel')!;
    expect(kopf).toMatchObject({ fett: true, groesse: 13, x: 64 });
    // Umlaute kommen aus WinAnsi zurück.
    expect(texte.some((e) => e.text.includes('Stationärer Aufenthalt'))).toBe(true);
    expect(seiten[0]!.elemente.some((e) => e.art === 'linie')).toBe(true);
  });

  it('liest auch das einfache Befund-PDF mit relativen Zeilenschritten', () => {
    const seiten = pdfSeitenLesen(pdfErzeugen('Befund', ['Zeile eins', 'Zeile zwei']))!;
    const texte = seiten[0]!.elemente.filter((e) => e.art === 'text');
    expect(texte.map((t) => t.text)).toEqual(['Befund', 'Zeile eins', 'Zeile zwei']);
    expect(texte[2]!.y).toBeLessThan(texte[1]!.y);
  });

  it('lehnt Dateien ab, die es nicht lesen kann', () => {
    expect(pdfSeitenLesen('kein PDF')).toBeNull();
  });
});
