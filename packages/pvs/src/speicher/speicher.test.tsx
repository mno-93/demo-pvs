import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { startzustand } from '../daten/startdaten.js';
import { ausfuehren, lesen, speicherStarten, useAuswahl, useZustand } from './speicher.js';
import { vorgaenge } from './vorgaenge.js';
import { leererEntwurf } from '../module/diagnosen/DiagnoseFormular.js';

/**
 * Regressionsschutz für den Zustandsspeicher.
 *
 * Eine frühere Fassung reichte die Auswahlfunktion ungefiltert an
 * `useSyncExternalStore` weiter. Eine Auswahl, die eine neue Liste erzeugt, lieferte
 * dann bei jedem Aufruf ein neues Objekt — React hielt das für eine Änderung und
 * rannte in eine Endlosschleife. Sichtbar wurde das erst zur Laufzeit.
 */

let renderZaehler = 0;

function AbleitendeAnsicht({ patientId }: { patientId: string }) {
  renderZaehler += 1;
  // Genau die Form, die zuvor die Schleife auslöste: eine neue Liste je Aufruf.
  const diagnosen = useZustand((z) => z.diagnosen.filter((d) => d.patientId === patientId));
  return <div data-testid="anzahl">{diagnosen.length}</div>;
}

function AbhaengigeAnsicht({ patientId }: { patientId: string }) {
  const diagnosen = useAuswahl(
    (z) => z.diagnosen.filter((d) => d.patientId === patientId),
    [patientId],
  );
  return <div data-testid="anzahl">{diagnosen.length}</div>;
}

describe('Zustandsspeicher', () => {
  beforeEach(() => {
    speicherStarten(startzustand());
    renderZaehler = 0;
  });

  it('rendert eine ableitende Auswahl ohne Schleife', () => {
    render(<AbleitendeAnsicht patientId="p-hoffmann" />);
    expect(screen.getByTestId('anzahl').textContent).toBe('4');
    expect(renderZaehler).toBeLessThan(5);
  });

  it('rechnet bei einer Zustandsänderung neu', () => {
    render(<AbleitendeAnsicht patientId="p-hoffmann" />);
    expect(screen.getByTestId('anzahl').textContent).toBe('4');
    act(() =>
      ausfuehren(
        vorgaenge.diagnoseAnlegen({
          ...leererEntwurf('p-hoffmann', '2026-09-09', 'Dr. med. Anna Brandt'),
          code: 'J06.9',
          bezeichnung: 'Akute Infektion der oberen Atemwege',
        }),
      ),
    );
    expect(screen.getByTestId('anzahl').textContent).toBe('5');
  });

  it('rechnet bei einer Änderung der Abhängigkeit neu', () => {
    const { rerender } = render(<AbhaengigeAnsicht patientId="p-hoffmann" />);
    expect(screen.getByTestId('anzahl').textContent).toBe('4');
    rerender(<AbhaengigeAnsicht patientId="p-krueger" />);
    expect(screen.getByTestId('anzahl').textContent).toBe('2');
  });

  it('zählt nur fachliche Vorgänge als Handlung', () => {
    // Eine Befugnis ist die Folge des Einlesens, keine eigene Handlung.
    ausfuehren(
      vorgaenge.befugnisErhalten(
        'p-hoffmann',
        '2026-12-08T10:00:00+01:00',
        '2026-09-09T08:00:00+02:00',
      ),
    );
    expect(lesen().handlungen).toBe(0);
    ausfuehren(vorgaenge.karteneintragAnlegen('p-hoffmann', 'A', 'Testeintrag'));
    expect(lesen().handlungen).toBe(1);
    expect(lesen().protokoll[0]?.beschreibung).toContain('Karteieintrag');
  });
});
