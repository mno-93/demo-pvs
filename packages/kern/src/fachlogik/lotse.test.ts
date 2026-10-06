import { describe, expect, it } from 'vitest';
import {
  absichtErkennen,
  lotseAntworten,
  medikationAbgleichen,
  medikationszeilenZerlegen,
  vorschlaegeAusText,
  type Lotsenquelle,
} from './lotse.js';

const ENTLASSBRIEF: Lotsenquelle = {
  id: 'kh-e',
  titel: 'Entlassbrief stationäre Behandlung',
  datum: '2026-07-17',
  einrichtung: 'Klinikum Sonnenschein',
  zeilen: [
    'Stationärer Aufenthalt 12.07.2026 bis 18.07.2026',
    '',
    'Diagnosen',
    '   I48.1 Vorhofflimmern, persistierend (Erstdiagnose)',
    '   E11.74 Diabetes mellitus Typ 2 mit multiplen Komplikationen',
    '',
    'Allergien und Unverträglichkeiten',
    '   Penicillin: makulopapulöses Exanthem unter Ampicillin i. v.',
    '',
    'Prozeduren',
    '   18.07.2026 Elektrische Kardioversion (OPS 8-640)',
    '',
    'Entlassmedikation',
    '   Apixaban 5 mg 1-0-1, Metformin 1000 mg 1-0-1',
  ],
};

const LABOR_MAERZ: Lotsenquelle = {
  id: 'labor-03',
  titel: 'Laborgesamtbefund',
  datum: '2026-03-18',
  einrichtung: 'MVZ Labor Oldenburg',
  zeilen: ['Kreatinin im Serum: 1,18 mg/dl', 'eGFR nach CKD-EPI: 46 ml/min/1,73 m²'],
};

const LABOR_AUGUST: Lotsenquelle = {
  id: 'labor-08',
  titel: 'Laborgesamtbefund',
  datum: '2026-08-12',
  einrichtung: 'Laborgemeinschaft Nordwest',
  zeilen: ['Kreatinin im Serum: 1,42 mg/dl', 'eGFR nach CKD-EPI: 38 ml/min/1,73 m²'],
};

const PLAN: Lotsenquelle = {
  id: 'medikationsplan',
  titel: 'Medikationsplan (eMP)',
  datum: '2026-08-12',
  einrichtung: 'elektronische Patientenakte',
  zeilen: [
    'Apixaban 5 mg Filmtabletten — 1-0-1-0 — wegen Vorhofflimmern',
    'Ramipril 5 mg Tabletten — 1-0-0-0 — wegen Arterielle Hypertonie',
  ],
};

const SCAN: Lotsenquelle = {
  id: 'scan-1',
  titel: 'Eingescanntes Schreiben',
  datum: '2024-02-01',
  einrichtung: 'Hausarztpraxis Dr. Kolbe',
  zeilen: [],
  nichtLesbar: 'Scan ohne Textebene',
};

const ALLE = [ENTLASSBRIEF, LABOR_MAERZ, LABOR_AUGUST, PLAN, SCAN];

describe('Absicht erkennen', () => {
  it('ordnet die Frage nach dem Verlauf dem Laborverlauf zu', () => {
    expect(absichtErkennen('Wie haben sich die Nierenwerte entwickelt?')).toBe('laborverlauf');
  });

  it('erkennt die Frage nach dem Krankenhausaufenthalt', () => {
    expect(absichtErkennen('Was stand im Brief vom Krankenhaus?')).toBe('krankenhaus');
  });

  it('fällt auf die Stellensuche zurück, statt zu raten', () => {
    expect(absichtErkennen('Wie geht es meinem Hund?')).toBe('stellensuche');
  });
});

describe('Antwort auf den Laborverlauf', () => {
  const antwort = lotseAntworten('Wie haben sich die Nierenwerte entwickelt?', ALLE);

  it('antwortet in ganzen Sätzen statt in Stichpunkten', () => {
    const text = antwort.absaetze[0]?.text ?? '';
    expect(text).toContain('Dazu liegen zwei Befunde vor, aus März 2026 und August 2026.');
    expect(text).toContain(
      'eGFR nach CKD-EPI lag am 18.03.2026 bei 46 ml/min/1,73 m² und am 12.08.2026 bei 38 ml/min/1,73 m².',
    );
  });

  it('nennt die Unterlagen, in denen es nachzulesen ist', () => {
    expect(antwort.absaetze[0]?.quellen.map((q) => q.quelleId)).toEqual(['labor-03', 'labor-08']);
  });

  it('gibt kein Zitat aus, sondern nur den Verweis', () => {
    for (const absatz of antwort.absaetze) {
      expect(absatz.quellen.length).toBeGreaterThan(0);
      for (const q of absatz.quellen) expect(q).not.toHaveProperty('zeile');
    }
  });

  it('nennt die nicht lesbare Quelle in der Umfangsangabe', () => {
    expect(antwort.umfang.gesamt).toBe(5);
    expect(antwort.umfang.gelesen).toBe(4);
    expect(antwort.umfang.uebergangen).toEqual([
      { titel: 'Eingescanntes Schreiben', grund: 'Scan ohne Textebene' },
    ]);
  });
});

describe('Antwort auf den Entlassbrief', () => {
  it('beginnt mit dem Zeitraum des Aufenthalts', () => {
    const antwort = lotseAntworten('Was stand im Brief vom Krankenhaus?', ALLE);
    expect(antwort.absaetze[0]?.text).toBe(
      'Sie waren vom 12.07.2026 bis zum 18.07.2026 im Klinikum Sonnenschein.',
    );
  });

  it('zählt die Diagnosen aus und lässt den Kode weg', () => {
    const antwort = lotseAntworten('Was stand im Brief vom Krankenhaus?', ALLE);
    const text = antwort.absaetze.map((a) => a.text).join(' ');
    expect(text).toContain('Festgehalten sind zwei Diagnosen:');
    expect(text).not.toContain('I48.1');
  });

  it('nennt die Prozedur als Satz mit Datum', () => {
    const antwort = lotseAntworten('Was stand im Brief vom Krankenhaus?', ALLE);
    expect(antwort.absaetze.map((a) => a.text)).toContain(
      'Am 18.07.2026 wurde Elektrische Kardioversion durchgeführt.',
    );
  });

  it('schreibt in der Lesart „alltag" die Umschreibung dazu', () => {
    const antwort = lotseAntworten('Was stand im Brief vom Krankenhaus?', ALLE, 'alltag');
    const text = antwort.absaetze.map((a) => a.text).join(' ');
    expect(text).toContain('(anhaltender unregelmäßiger Herzschlag)');
  });

  it('führt die erläuterten Begriffe aus der Quelle mit', () => {
    const antwort = lotseAntworten('Was stand im Brief vom Krankenhaus?', ALLE, 'alltag');
    expect(antwort.begriffe.map((b) => b.fach)).toContain('Elektrische Kardioversion');
  });
});

describe('Antwort zu Unverträglichkeiten', () => {
  it('lässt den Punkt einer Abkürzung stehen und streicht nur den Satzpunkt', () => {
    const antwort = lotseAntworten('Was vertrage ich nicht?', [
      { ...ENTLASSBRIEF, zeilen: ['Allergien und Unverträglichkeiten', '   Iod: Übelkeit.'] },
    ]);
    expect(antwort.absaetze[0]?.text).toContain('Auf Iod ist Übelkeit vermerkt.');
  });

  it('bildet aus „Substanz: Reaktion" einen Satz', () => {
    const antwort = lotseAntworten('Was vertrage ich nicht?', ALLE);
    expect(antwort.absaetze[0]?.text).toBe(
      'In den Unterlagen ist eine Unverträglichkeit festgehalten. ' +
        'Auf Penicillin ist makulopapulöses Exanthem unter Ampicillin i. v. vermerkt.',
    );
  });
});

describe('Antwort zur Medikation', () => {
  it('nimmt den Medikationsplan als geführte Quelle und nennt den Grund', () => {
    const antwort = lotseAntworten('Welche Medikamente nehme ich und wofür?', ALLE);
    expect(antwort.absaetze[0]?.quellen[0]?.quelleId).toBe('medikationsplan');
    expect(antwort.absaetze[0]?.text).toBe(
      'Im Medikationsplan stehen zwei Mittel. Apixaban 5 mg Filmtabletten, 1-0-1-0, wegen ' +
        'Vorhofflimmern und Ramipril 5 mg Tabletten, 1-0-0-0, wegen Arterielle Hypertonie.',
    );
  });

  it('greift ohne Plan auf den Entlassbrief zurück', () => {
    const antwort = lotseAntworten('Welche Medikamente nehme ich?', [ENTLASSBRIEF]);
    expect(antwort.absaetze[0]?.text).toContain('Im Entlassbrief sind zwei Medikamente aufgeführt');
  });
});

describe('Grenzen der Antwort', () => {
  it('sagt es, wenn nichts belegbar ist, statt etwas zu bilden', () => {
    const antwort = lotseAntworten('Wie hoch ist mein Blutdruck?', [LABOR_MAERZ]);
    expect(antwort.absaetze).toEqual([]);
    expect(antwort.hinweis).toMatch(/nichts, was sich belegen lässt/);
  });

  it('kennzeichnet die Stellensuche als solche', () => {
    const antwort = lotseAntworten('Kardioversion', ALLE);
    expect(antwort.hinweis).toMatch(/nicht bekannt/);
  });

  it('wertet Quellen ohne Text nicht aus', () => {
    const antwort = lotseAntworten('Was stand im Brief vom Krankenhaus?', [SCAN]);
    expect(antwort.umfang.gelesen).toBe(0);
    expect(antwort.absaetze).toEqual([]);
  });
});

describe('Medikationszeilen zerlegen', () => {
  it('trennt mehrere Mittel einer Zeile am Komma', () => {
    expect(medikationszeilenZerlegen(['Apixaban 5 mg 1-0-1, Metformin 1000 mg 1-0-1'])).toEqual([
      'Apixaban 5 mg 1-0-1',
      'Metformin 1000 mg 1-0-1',
    ]);
  });

  it('trennt nicht im Zahlwert einer Stärke', () => {
    expect(
      medikationszeilenZerlegen(['Bisoprolol 2,5 mg 1-0-0, Atorvastatin 40 mg 0-0-1']),
    ).toEqual(['Bisoprolol 2,5 mg 1-0-0', 'Atorvastatin 40 mg 0-0-1']);
  });

  it('entfernt ein Komma am Zeilenende', () => {
    expect(medikationszeilenZerlegen(['Ramipril 5 mg 1-0-0,'])).toEqual(['Ramipril 5 mg 1-0-0']);
  });

  it('gibt bei leerer Eingabe nichts zurück', () => {
    expect(medikationszeilenZerlegen([])).toEqual([]);
  });
});

describe('Abgleich zwischen Dokument und Plan', () => {
  const stelle = { quelleId: 'kh-e', titel: '', datum: '', einrichtung: '', zeile: '' };
  const ausBrief = [
    { zeile: 'Apixaban 5 mg 1-0-1', fundstelle: stelle },
    { zeile: 'Metformin 1000 mg 1-0-1', fundstelle: stelle },
  ];

  it('findet das Mittel, das im Plan fehlt', () => {
    const abweichungen = medikationAbgleichen(ausBrief, ['Apixaban 5 mg Filmtabletten']);
    expect(abweichungen).toHaveLength(1);
    expect(abweichungen[0]?.art).toBe('fehlt-im-plan');
    expect(abweichungen[0]?.bezeichnung).toContain('Metformin');
  });

  it('findet das Mittel, das nur im Plan steht', () => {
    const abweichungen = medikationAbgleichen(ausBrief, [
      'Apixaban 5 mg Filmtabletten',
      'Metformin 1000 mg Filmtabletten',
      'Torasemid 10 mg Tabletten',
    ]);
    expect(abweichungen.map((a) => a.art)).toEqual(['nur-im-plan']);
    expect(abweichungen[0]?.bezeichnung).toContain('Torasemid');
  });

  it('meldet nichts, wenn beide Bestände übereinstimmen', () => {
    expect(
      medikationAbgleichen(ausBrief, [
        'Apixaban 5 mg Filmtabletten',
        'Metformin 1000 mg Filmtabletten',
      ]),
    ).toEqual([]);
  });
});

describe('Vorschläge aus unstrukturiertem Text', () => {
  it('schlägt Diagnosen mit ihrem Kode vor', () => {
    const diagnosen = vorschlaegeAusText(ENTLASSBRIEF).filter((v) => v.liste === 'diagnosen');
    expect(diagnosen.map((d) => d.text)).toEqual([
      'I48.1 Vorhofflimmern, persistierend (Erstdiagnose)',
      'E11.74 Diabetes mellitus Typ 2 mit multiplen Komplikationen',
    ]);
  });

  it('schlägt die Prozedur mit OPS-Kode vor', () => {
    const prozeduren = vorschlaegeAusText(ENTLASSBRIEF).filter((v) => v.liste === 'prozeduren');
    expect(prozeduren[0]?.text).toContain('Elektrische Kardioversion');
  });

  it('belegt jeden Vorschlag mit seiner Fundstelle — dort zählt die Zeile', () => {
    for (const v of vorschlaegeAusText(ENTLASSBRIEF)) {
      expect(v.fundstelle.quelleId).toBe('kh-e');
      expect(v.fundstelle.zeile).toBeTruthy();
    }
  });
});
