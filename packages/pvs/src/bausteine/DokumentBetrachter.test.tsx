import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DokumentBetrachter } from './DokumentBetrachter.js';

const absatz = (t: string) => ({
  div: `<div xmlns="http://www.w3.org/1999/xhtml"><p>${t}</p></div>`,
});

const brief = {
  resourceType: 'Bundle',
  type: 'document',
  entry: [
    {
      resource: {
        resourceType: 'Composition',
        id: 'c',
        type: { coding: [{ system: 'http://loinc.org', code: '34105-7' }] },
        title: 'Entlassbrief stationäre Behandlung',
        date: '2026-07-17T14:00:00',
        author: [{ display: 'Dr. med. Lea Wagner' }],
        section: [
          { title: 'Diagnosen', text: absatz('I48.1 Vorhofflimmern, persistierend') },
          { title: 'Entlassmedikation', text: absatz('Metformin 1000 mg Filmtabletten 1-0-1-0') },
        ],
      },
    },
  ],
};

describe('Dokument ansehen', () => {
  it('bietet einen strukturierten Brief auch als PDF-Ansicht an', () => {
    render(<DokumentBetrachter inhalt={brief} patientId="p" dokumentId="d" bestand="epa" />);
    expect(screen.getByRole('button', { name: 'Strukturiert' }).getAttribute('aria-pressed')).toBe(
      'true',
    );
    fireEvent.click(screen.getByRole('button', { name: 'PDF-Ansicht' }));
    expect(screen.getByRole('button', { name: 'PDF-Ansicht' }).getAttribute('aria-pressed')).toBe(
      'true',
    );
  });

  it('öffnet mit markierten Stellen in der Seitenansicht', () => {
    const { container } = render(
      <DokumentBetrachter
        inhalt={brief}
        patientId="p"
        dokumentId="d"
        bestand="epa"
        markieren={['Metformin 1000 mg Filmtabletten 1-0-1-0']}
      />,
    );
    expect(screen.getByText('Stellen zur Antwort markiert')).toBeDefined();
    const markiert = container.querySelectorAll('.seiten-markierung');
    expect(markiert.length).toBe(1);
    expect(markiert[0]!.nextElementSibling?.textContent).toBe(
      'Metformin 1000 mg Filmtabletten 1-0-1-0',
    );
  });
});
