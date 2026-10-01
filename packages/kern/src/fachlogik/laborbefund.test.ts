import { describe, expect, it } from 'vitest';
import {
  befundkopfLesen,
  bewertungFuer,
  istLaborbefund,
  laborbefundBauen,
  laborbefundeAusDokumenten,
  laborwerteAusBefund,
  laborwerteAusDokumenten,
  type Befundangabe,
} from './laborbefund.js';
import { lokaleHerkunft } from '../testhilfe.js';

const angabe: Befundangabe = {
  uuid: 'f81d4fae-7dec-11d0-a765-00a0c91e6bf6',
  auftragsnummer: 'L-2026-08-12-0047',
  kvnr: 'A123456780',
  patientName: { vorname: 'Renate', nachname: 'Hoffmann' },
  geburtsdatum: '1958-03-14',
  labor: 'Laborgemeinschaft Nordwest',
  freigebendePerson: 'Dr. rer. nat. Kai Petersen',
  auftraggeber: 'Hausarztpraxis am Stadtgarten',
  entnahme: '2026-08-12T08:10:00',
  freigabe: '2026-08-12T11:00:00',
  probenart: 'Serum',
  beurteilung: 'Eingeschränkte Nierenfunktion.',
  gruppen: [
    {
      bezeichnung: 'Nierenfunktion',
      werte: [
        {
          loinc: '2160-0',
          bezeichnung: 'Kreatinin',
          wert: 1.42,
          einheit: 'mg/dl',
          ucum: 'mg/dL',
          referenzNiedrig: 0.51,
          referenzHoch: 0.95,
          referenzText: '0,51–0,95',
        },
        {
          loinc: '62238-1',
          bezeichnung: 'eGFR',
          wert: 38,
          einheit: 'ml/min/1,73 m²',
          ucum: 'mL/min/{1.73_m2}',
          referenzNiedrig: 90,
          referenzHoch: null,
          referenzText: '> 90',
        },
      ],
    },
    {
      bezeichnung: 'Elektrolyte',
      werte: [
        {
          loinc: '2823-3',
          bezeichnung: 'Kalium',
          wert: 4.2,
          einheit: 'mmol/l',
          ucum: 'mmol/L',
          referenzNiedrig: 3.5,
          referenzHoch: 5.1,
          referenzText: '3,5–5,1',
        },
      ],
    },
  ],
};

function ressourcen(bundle: unknown) {
  return (bundle as { entry: { resource: Record<string, unknown> }[] }).entry.map(
    (e) => e.resource,
  );
}

describe('Laborbefund nach dgLP', () => {
  const bundle = laborbefundBauen(angabe);

  it('ist ein Dokument-Bundle mit dem dgLP-Profil', () => {
    expect(bundle['type']).toBe('document');
    expect(JSON.stringify(bundle['meta'])).toContain('bundle-dglp');
  });

  it('trägt Composition, DiagnosticReport, Patient und genau einen Auftrag', () => {
    const typen = ressourcen(bundle).map((r) => r['resourceType']);
    expect(typen[0]).toBe('Composition');
    expect(typen.filter((t) => t === 'DiagnosticReport')).toHaveLength(1);
    expect(typen.filter((t) => t === 'Patient')).toHaveLength(1);
    expect(typen.filter((t) => t === 'ServiceRequest')).toHaveLength(1);
  });

  it('kennzeichnet die Composition mit SNOMED CT und LOINC als Laborbefund', () => {
    const komposition = ressourcen(bundle)[0]!;
    const codes = (komposition['type'] as { coding: { code: string }[] }).coding.map((c) => c.code);
    expect(codes).toEqual(['4241000179101', '11502-2']);
    expect(komposition['title']).toBe('Laboratory Report');
  });

  it('verlangt eine rechtliche Freigabe', () => {
    const komposition = ressourcen(bundle)[0]!;
    expect((komposition['attester'] as { mode: string }[])[0]?.mode).toBe('legal');
  });

  it('führt die Ergebnisse als Gruppen mit Einzeluntersuchungen', () => {
    const bericht = ressourcen(bundle).find((r) => r['resourceType'] === 'DiagnosticReport')!;
    expect((bericht['result'] as unknown[]).length).toBe(2);
    const gruppe = ressourcen(bundle).find((r) => r['id'] === 'grp-f81d4fae-0')!;
    expect((gruppe['hasMember'] as unknown[]).length).toBe(2);
  });

  it('trägt beide Kennungen des DiagnosticReport', () => {
    const bericht = ressourcen(bundle).find((r) => r['resourceType'] === 'DiagnosticReport')!;
    const codes = (bericht['identifier'] as { type: { coding: { code: string }[] } }[]).map(
      (i) => i.type.coding[0]?.code,
    );
    expect(codes).toEqual(['AL', 'RI']);
  });

  it('wird als Laborbefund erkannt und liefert seinen Kopf', () => {
    expect(istLaborbefund(bundle)).toBe(true);
    const kopf = befundkopfLesen(bundle);
    expect(kopf?.uuid).toBe(angabe.uuid);
    expect(kopf?.auftragsnummer).toBe('L-2026-08-12-0047');
    expect(kopf?.freigebendePerson).toBe('Dr. rer. nat. Kai Petersen');
  });

  it('liefert Laborwerte ausschließlich aus dem Befund, mit Bewertung', () => {
    const werte = laborwerteAusBefund(bundle, 'p1', lokaleHerkunft);
    expect(werte).toHaveLength(3);
    const egfr = werte.find((w) => w.loinc === '62238-1');
    expect(egfr?.wert).toBe('38');
    expect(egfr?.bewertung).toBe('niedrig');
    expect(werte.find((w) => w.loinc === '2160-0')?.bewertung).toBe('hoch');
  });

  it('erkennt ein anderes Dokument nicht als Laborbefund', () => {
    const fremd = {
      resourceType: 'Bundle',
      entry: [
        { resource: { resourceType: 'Composition', type: { coding: [{ code: '18842-5' }] } } },
      ],
    };
    expect(istLaborbefund(fremd)).toBe(false);
    expect(laborwerteAusBefund(fremd, 'p1', lokaleHerkunft)).toEqual([]);
  });
});

describe('Bewertung gegen den Referenzbereich', () => {
  it('ordnet hoch, niedrig und normal zu', () => {
    expect(bewertungFuer({ wert: 1.42, referenzNiedrig: 0.51, referenzHoch: 0.95 })).toBe('hoch');
    expect(bewertungFuer({ wert: 38, referenzNiedrig: 90, referenzHoch: null })).toBe('niedrig');
    expect(bewertungFuer({ wert: 4.2, referenzNiedrig: 3.5, referenzHoch: 5.1 })).toBe('normal');
  });
});

describe('Laborbefunde der Dokumentenablage', () => {
  const befundDokument = {
    id: 'dok-l1',
    patientId: 'p1',
    titel: 'Laborgesamtbefund',
    art: 'Laborbefund' as const,
    ursprung: 'labor' as const,
    datum: '2026-08-12',
    epaId: null,
    einrichtung: 'Laborgemeinschaft Nordwest',
    autor: 'Dr. rer. nat. Kai Petersen',
    dateiname: 'befund.json',
    inhaltstyp: 'application/fhir+json',
    groesseBytes: 1,
    gespeichertAm: '2026-08-12T11:05:00',
    gespeichertVon: 'Praxissystem',
    inhalt: laborbefundBauen(angabe),
    notiz: null,
  };
  const scan = { ...befundDokument, id: 'dok-s1', art: 'Scan' as const, inhalt: null };

  it('liest nur Dokumente, die Laborbefunde sind', () => {
    const befunde = laborbefundeAusDokumenten([scan, befundDokument]);
    expect(befunde).toHaveLength(1);
    expect(befunde[0]?.kopf.labor).toBe('Laborgemeinschaft Nordwest');
  });

  it('gibt jedem Wert den Befund als Herkunft mit', () => {
    const werte = laborwerteAusDokumenten([befundDokument]);
    expect(werte).toHaveLength(3);
    expect(werte.every((w) => w.herkunft.dokumentId === 'dok-l1')).toBe(true);
    expect(werte[0]?.herkunft.verantwortlich).toBe('Dr. rer. nat. Kai Petersen');
  });

  it('hält die Untersuchungsgruppen des Befunds in ihrer Reihenfolge', () => {
    const [befund] = laborbefundeAusDokumenten([befundDokument]);
    expect(befund?.gruppen.map((g) => g.bezeichnung)).toEqual(['Nierenfunktion', 'Elektrolyte']);
    expect(befund?.gruppen[0]?.werte.map((w) => w.loinc)).toEqual(['2160-0', '62238-1']);
  });
});
