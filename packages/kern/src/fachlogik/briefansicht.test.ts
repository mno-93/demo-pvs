import { describe, expect, it } from 'vitest';
import { briefAusFhir, pdfAnsichtFuer } from './briefansicht.js';
import { pdfSeitenLesen } from './pdf.js';

const bundle = {
  resourceType: 'Bundle',
  type: 'document',
  entry: [
    {
      resource: {
        resourceType: 'Composition',
        id: 'c',
        title: 'Entlassbrief stationäre Behandlung',
        date: '2026-07-17T14:00:00',
        author: [{ reference: 'Practitioner/p', display: 'Dr. med. Lea Wagner' }],
        custodian: { reference: 'Organization/o' },
        encounter: { reference: 'Encounter/e' },
        section: [
          {
            title: 'Diagnosen',
            text: {
              div: '<div xmlns="http://www.w3.org/1999/xhtml"><p>I48.1 Vorhofflimmern</p></div>',
            },
            entry: [{ reference: 'Condition/x' }],
          },
          {
            title: 'Verlauf',
            text: {
              div: '<div xmlns="http://www.w3.org/1999/xhtml"><p>Kardioversion &amp; Kontrolle.</p></div>',
            },
          },
        ],
      },
    },
    { resource: { resourceType: 'Organization', id: 'o', name: 'Klinikum Sonnenschein' } },
    { resource: { resourceType: 'Practitioner', id: 'p' } },
    {
      resource: {
        resourceType: 'Encounter',
        id: 'e',
        period: { start: '2026-07-12T09:00:00', end: '2026-07-18T10:00:00' },
      },
    },
    {
      resource: {
        resourceType: 'Patient',
        id: 'pat',
        name: [{ family: 'Hoffmann', given: ['Renate'] }],
        birthDate: '1958-03-14',
      },
    },
  ],
};

describe('Druckansicht strukturierter Briefe', () => {
  it('baut aus Composition und Erzähltext einen Brief', () => {
    const b = briefAusFhir(bundle)!;
    expect(b.absender[0]).toBe('Klinikum Sonnenschein');
    expect(b.empfaenger).toEqual(['Renate Hoffmann', 'geb. 14.03.1958']);
    expect(b.betreff).toContain('stationärer Aufenthalt 12.07.2026 bis 18.07.2026');
    expect(b.bausteine).toContainEqual({ art: 'zeile', text: 'I48.1 Vorhofflimmern' });
    expect(b.bausteine).toContainEqual({ art: 'absatz', text: 'Kardioversion & Kontrolle.' });
  });

  it('liefert das PDF dazu', () => {
    const seiten = pdfSeitenLesen(pdfAnsichtFuer(bundle)!)!;
    const texte = seiten.flatMap((s) => s.elemente).filter((e) => e.art === 'text');
    expect(texte.some((t) => t.text.includes('Vorhofflimmern'))).toBe(true);
  });

  it('bildet für ein Dokument ohne Abschnitte keinen Brief', () => {
    expect(briefAusFhir({ resourceType: 'Bundle', entry: [] })).toBeNull();
  });
});
