import { describe, expect, it } from 'vitest';
import type { Termin } from '../typen/termin.js';
import { besucheBilden, type Verlaufseintrag } from './verlauf.js';
import { aenderungenSeit, fassungsstandBilden, staendeVergleichen } from './aenderungen.js';

function eintrag(
  teil: Partial<Verlaufseintrag> & Pick<Verlaufseintrag, 'id' | 'zeitpunkt' | 'kuerzel'>,
): Verlaufseintrag {
  return {
    text: teil.id,
    zusatz: null,
    verfasser: 'Dr. med. Anna Brandt',
    ursprung: 'notiz',
    quelleId: null,
    bereich: null,
    bestand: 'lokal',
    epa: null,
    ...teil,
  };
}

const TERMIN: Termin = {
  id: 't1',
  patientId: 'p1',
  datum: '2026-09-09',
  uhrzeit: '08:40',
  dauerMinuten: 20,
  art: 'sprechstunde',
  status: 'wartend',
  anlass: 'Folgeverordnung',
};

describe('Besuche im Verlauf', () => {
  it('fasst einen Tag zu einem Block zusammen und gruppiert nach Art', () => {
    const besuche = besucheBilden(
      [
        eintrag({ id: 'n1', zeitpunkt: '2026-09-09T08:45:00', kuerzel: 'A' }),
        eintrag({
          id: 'd1',
          zeitpunkt: '2026-09-09T08:50:00',
          kuerzel: 'D',
          ursprung: 'diagnose',
          epa: 'in-epa',
        }),
        eintrag({
          id: 'k1',
          zeitpunkt: '2026-09-09T08:55:00',
          kuerzel: 'DK',
          ursprung: 'dokument',
          epa: 'aus-epa',
        }),
        eintrag({ id: 'l1', zeitpunkt: '2026-08-12T11:00:00', kuerzel: 'L', ursprung: 'labor' }),
      ],
      [TERMIN],
      '2026-09-09',
    );
    expect(besuche.map((b) => b.datum)).toEqual(['2026-09-09', '2026-08-12']);
    const heute = besuche[0]!;
    expect(heute.art).toBe('besuch');
    expect(heute.termin?.anlass).toBe('Folgeverordnung');
    expect(heute.gruppen.map((g) => g.titel)).toEqual(['Notizen', 'Diagnosen', 'Dokumente']);
    expect(heute.epa).toEqual({ aus: 1, in: 1 });
    // Ein Befund ohne Termin und ohne Notiz ist ein Eingang, kein Besuch.
    expect(besuche[1]!.art).toBe('eingang');
  });

  it('zeigt den heutigen Besuch, bevor etwas dokumentiert ist, künftige Termine nicht', () => {
    const besuche = besucheBilden(
      [],
      [TERMIN, { ...TERMIN, id: 't2', datum: '2026-09-16' }],
      '2026-09-09',
    );
    expect(besuche).toHaveLength(1);
    expect(besuche[0]!.gruppen).toEqual([]);
  });
});

describe('Neu seit dem letzten Aufruf', () => {
  it('meldet neue und geänderte Einträge anderer Einrichtungen, eigene nicht', () => {
    const vorher = fassungsstandBilden(
      [
        { schluessel: 'Condition/a', fassung: '1', vonAnderen: true },
        { schluessel: 'Condition/b', fassung: '1', vonAnderen: true },
        { schluessel: 'Condition/weg', fassung: '1', vonAnderen: true },
      ],
      '2026-09-09T08:00:00',
    );
    const a = aenderungenSeit(vorher, [
      { schluessel: 'Condition/a', fassung: '2', vonAnderen: true },
      { schluessel: 'Condition/b', fassung: '2', vonAnderen: false },
      { schluessel: 'Condition/neu', fassung: '1', vonAnderen: true },
      { schluessel: 'Condition/eigen', fassung: '1', vonAnderen: false },
    ]);
    expect([...a.geaendert]).toEqual(['Condition/a']);
    expect([...a.neu]).toEqual(['Condition/neu']);
    expect(a.entfallen).toBe(1);
  });

  it('meldet beim ersten Aufruf nichts', () => {
    const a = aenderungenSeit(null, [{ schluessel: 'X/1', fassung: '1', vonAnderen: true }]);
    expect(a.neu.size + a.geaendert.size).toBe(0);
  });
});

describe('Vergleich zweier Stände aus dem Aktensystem', () => {
  it('meldet neue und geänderte Einträge anderer Einrichtungen und entfallene mit Namen', () => {
    const e = (id: string, fassung: string, vonAnderen = true) => ({
      id,
      fassung,
      bezeichnung: `Mittel ${id}`,
      vonAnderen,
    });
    const a = staendeVergleichen(
      [e('a', '1'), e('b', '1'), e('c', '1')],
      [e('a', '1'), e('b', '2'), e('d', '1'), e('x', '1', false)],
    );
    expect([...a.neu]).toEqual(['d']);
    expect([...a.geaendert]).toEqual(['b']);
    expect(a.entfallen).toEqual(['Mittel c']);
  });
});
