import { describe, expect, it } from 'vitest';
import { verlaufBilden, type Verlaufsquellen } from './verlauf.js';
import type { Diagnose } from '../typen/diagnose.js';
import type { Allergie } from '../typen/allergie.js';
import type { Laborwert } from '../typen/labor.js';
import type { Herkunft } from '../typen/herkunft.js';
import { allergieMuster, diagnoseMuster } from '../testhilfe.js';

const lokal: Herkunft = {
  bestand: 'lokal',
  quelle: 'Praxis',
  zeitpunkt: '2026-09-01T09:00:00',
  verantwortlich: 'Dr. med. Anna Brandt',
  dokumentId: null,
};

function diagnose(teil: Partial<Diagnose> = {}): Diagnose {
  return diagnoseMuster({ snomed: null, ...teil });
}

function allergie(): Allergie {
  return allergieMuster({ reaktionen: [] });
}

function labor(id: string, bezeichnung: string, bewertung: Laborwert['bewertung']): Laborwert {
  return {
    id,
    patientId: 'p1',
    loinc: '2160-0',
    bezeichnung,
    wert: '1,42',
    einheit: 'mg/dl',
    referenz: '0,51-0,95',
    bewertung,
    erhobenAm: '2026-08-12',
    herkunft: { ...lokal, zeitpunkt: '2026-08-12T11:00:00', dokumentId: 'dok-labor-1' },
  };
}

function quellen(teil: Partial<Verlaufsquellen> = {}): Verlaufsquellen {
  return { notizen: [], diagnosen: [], allergien: [], laborwerte: [], medikation: [], ...teil };
}

describe('Verlauf der Karteikarte', () => {
  it('leitet die Diagnose aus dem Bestand ab statt aus einem mitgeschriebenen Text', () => {
    const verlauf = verlaufBilden(quellen({ diagnosen: [diagnose()] }));
    expect(verlauf).toHaveLength(1);
    expect(verlauf[0]?.ursprung).toBe('diagnose');
    expect(verlauf[0]?.quelleId).toBe('d1');
    expect(verlauf[0]?.bereich).toBe('diagnosen');
    expect(verlauf[0]?.text).toContain('I10.90 G');
  });

  it('bildet eine Änderung an der Diagnose unmittelbar ab', () => {
    const vorher = verlaufBilden(quellen({ diagnosen: [diagnose()] }));
    const nachher = verlaufBilden(
      quellen({
        diagnosen: [diagnose({ zusatzkennzeichen: 'V', bezeichnung: 'Verdacht auf Hypertonie' })],
      }),
    );
    expect(vorher[0]?.text).not.toBe(nachher[0]?.text);
    expect(nachher[0]?.text).toContain('I10.90 V');
  });

  it('zeigt die SNOMED-CT-Kodierung im Zusatz, wenn sie vorliegt', () => {
    const verlauf = verlaufBilden(
      quellen({
        diagnosen: [
          diagnose({
            snomed: {
              system: 'http://snomed.info/sct',
              code: '59621000',
              anzeige: 'Essentielle Hypertonie',
            },
          }),
        ],
      }),
    );
    expect(verlauf[0]?.zusatz).toContain('SNOMED CT 59621000');
  });

  it('nennt im Zusatz, dass die Diagnose in der Liste der ePA geführt wird', () => {
    const ohne = verlaufBilden(quellen({ diagnosen: [diagnose()] }));
    const mit = verlaufBilden(
      quellen({ diagnosen: [diagnose({ epaId: 'cond-1', epaFassung: '1' })] }),
    );
    expect(ohne[0]?.zusatz).not.toContain('Diagnosenliste der ePA');
    expect(mit[0]?.zusatz).toContain('in der Diagnosenliste der ePA');
  });

  it('kennzeichnet die Allergie mit eigenem Kürzel', () => {
    const verlauf = verlaufBilden(quellen({ allergien: [allergie()] }));
    expect(verlauf[0]?.kuerzel).toBe('AL');
    expect(verlauf[0]?.text).toBe('Allergie gegen Penicillin');
  });

  it('fasst Laborwerte einer Abnahme zu einem Eintrag zusammen', () => {
    const verlauf = verlaufBilden(
      quellen({
        laborwerte: [labor('l1', 'Kreatinin', 'hoch'), labor('l2', 'Kalium', 'normal')],
      }),
    );
    expect(verlauf).toHaveLength(1);
    expect(verlauf[0]?.zusatz).toContain('1 von 2');
    // Der Sprung führt zum Befund, nicht zu einer Erfassungsmaske — die gibt es nicht.
    expect(verlauf[0]?.bereich).toBe('labor');
    expect(verlauf[0]?.quelleId).toBe('dok-labor-1');
  });

  it('führt die Medikation als Bestand der ePA', () => {
    const verlauf = verlaufBilden(
      quellen({
        medikation: [
          {
            id: 'emp-1',
            bezeichnung: 'Ramipril 5 mg',
            dosierung: '1-0-0-0',
            zeitpunkt: '2026-09-03T10:00:00',
            verantwortlich: 'Dr. med. Anna Brandt',
            status: 'aktiv',
          },
        ],
      }),
    );
    expect(verlauf[0]?.bestand).toBe('epa');
    expect(verlauf[0]?.bereich).toBe('medikation');
  });

  it('sortiert den jüngsten Eintrag nach oben, quellenübergreifend', () => {
    const verlauf = verlaufBilden(
      quellen({
        diagnosen: [diagnose()],
        allergien: [allergie()],
        notizen: [
          {
            id: 'n1',
            patientId: 'p1',
            fallId: null,
            zeitpunkt: '2026-09-05T08:00:00',
            kuerzel: 'A',
            text: 'Erstvorstellung',
            verfasser: 'Dr. med. Anna Brandt',
          },
        ],
      }),
    );
    expect(verlauf.map((v) => v.ursprung)).toEqual(['notiz', 'allergie', 'diagnose']);
  });

  it('lässt freie Notizen unverändert durch', () => {
    const verlauf = verlaufBilden(
      quellen({
        notizen: [
          {
            id: 'n1',
            patientId: 'p1',
            fallId: null,
            zeitpunkt: '2026-09-05T08:00:00',
            kuerzel: 'B',
            text: 'RR 138/84 mmHg',
            verfasser: 'Dr. med. Anna Brandt',
          },
        ],
      }),
    );
    expect(verlauf[0]?.ursprung).toBe('notiz');
    expect(verlauf[0]?.quelleId).toBeNull();
    expect(verlauf[0]?.text).toBe('RR 138/84 mmHg');
  });
});
