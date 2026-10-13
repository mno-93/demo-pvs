import { describe, expect, it } from 'vitest';
import { ADRESSBUCH } from '../beispiele.js';
import { allergieMuster, diagnoseMuster } from '../testhilfe.js';
import type { Patient } from '../typen/person.js';
import { arztbriefBauen, ARZTBRIEF_ABSCHNITT, type Arztbriefangabe } from './arztbrief.js';
import { briefAusFhir } from './briefansicht.js';
import { briefTextzeilen } from './pdf.js';

const PATIENTIN: Patient = {
  id: 'p1',
  nachname: 'Hoffmann',
  vorname: 'Renate',
  geburtsdatum: '1958-03-14',
  geschlecht: 'weiblich',
  anschrift: { strasse: 'Lindenweg', hausnummer: '3', plz: '26000', ort: 'Beispielstadt' },
  telefon: '0000 1',
  versicherung: {
    kvnr: 'A123456780',
    kostentraeger: 'Demo-Kasse',
    kostentraegerkennung: '000000000',
    versichertenart: 'Rentner:in',
    zuzahlungsbefreit: false,
    gueltigBis: '2030-12-31',
    zuletztEingelesen: null,
  },
  angelegtAm: '2026-08-30T08:30:00',
  hinweis: null,
};

function angabe(teil: Partial<Arztbriefangabe> = {}): Arztbriefangabe {
  return {
    dokumentId: '00000000-0000-4000-8000-000000000001',
    zeitpunkt: '2026-09-09T11:00:00',
    patient: PATIENTIN,
    verfasser: { name: 'Dr. med. Anna Brandt', lanr: '999999901' },
    einrichtung: {
      name: 'Hausarztpraxis am Stadtgarten',
      telematikId: 'DEMO-PRAXIS-STADTGARTEN',
      anschrift: ['Am Stadtgarten 4', '26000 Beispielstadt'],
      telefon: '0000 3030-0',
    },
    empfaenger: ADRESSBUCH[0]!,
    anlass: 'Bitte um Mitbeurteilung bei Belastungsdyspnoe.',
    diagnosen: [diagnoseMuster({ patientId: 'p1' })],
    allergien: [allergieMuster({ patientId: 'p1' })],
    befunde: ['RR 138/84 mmHg, Puls 72/min'],
    beurteilung: 'Klinisch stabil.\n\nEchokardiographie erbeten.',
    medikation: [
      { bezeichnung: 'Ramipril 5 mg', dosierung: '1-0-0-0', grund: 'Hypertonie', atc: 'C09AA05' },
    ],
    empfehlungen: '',
    ...teil,
  };
}

let n = 0;
const fest = () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`;

const ressourcen = (b: Record<string, unknown>) =>
  b['entry'] as { fullUrl: string; resource: Record<string, unknown> }[];

describe('Arztbrief als FHIR-Dokument', () => {
  it('ist ein Dokument, dessen Verweise alle innerhalb des Bundles aufgelöst werden', () => {
    const b = arztbriefBauen(angabe(), fest);
    expect(b['type']).toBe('document');
    const e = ressourcen(b);
    expect(e[0]!.resource['resourceType']).toBe('Composition');
    const urls = new Set(e.map((x) => x.fullUrl));
    const verweise = JSON.stringify(b)
      .match(/"reference":"([^"]+)"/g)!
      .map((r) => r.slice(13, -1));
    for (const v of verweise.filter((x) => x.startsWith('urn:uuid:')))
      expect(urls.has(v)).toBe(true);
    // Keine lokalen Kennungen aus dem Praxissystem im Dokument.
    expect(e.every((x) => x.resource['id'] === undefined)).toBe(true);
  });

  it('trägt Diagnosen, Allergien und Medikation als Einträge mit den Abbildungen der ePA-Listen', () => {
    const b = arztbriefBauen(angabe(), fest);
    const typen = ressourcen(b).map((x) => x.resource['resourceType']);
    expect(typen).toContain('Condition');
    expect(typen).toContain('AllergyIntolerance');
    expect(typen).toContain('MedicationStatement');
    const diagnose = ressourcen(b).find((x) => x.resource['resourceType'] === 'Condition')!;
    expect((diagnose.resource['meta'] as { profile: string[] }).profile[0]).toContain(
      'ti-condition-diagnosis',
    );
  });

  it('führt Allergien auch ohne Einträge — mit Leergrund statt ohne Abschnitt', () => {
    const b = arztbriefBauen(angabe({ allergien: [] }), fest);
    const komposition = ressourcen(b)[0]!.resource;
    const abschnitt = (komposition['section'] as { title: string; emptyReason?: unknown }[]).find(
      (s) => s.title === ARZTBRIEF_ABSCHNITT.allergien.titel,
    );
    expect(abschnitt?.emptyReason).toBeTruthy();
  });

  it('lässt leere Freitextabschnitte weg', () => {
    const b = arztbriefBauen(angabe(), fest);
    const titel = (ressourcen(b)[0]!.resource['section'] as { title: string }[]).map(
      (s) => s.title,
    );
    expect(titel).toEqual([
      'Fragestellung',
      'Diagnosen',
      'Allergien und Unverträglichkeiten',
      'Befunde',
      'Beurteilung',
      'Medikation',
    ]);
  });

  it('ergibt eine Briefansicht an den Empfänger, mit Patientin im Betreff', () => {
    const vorlage = briefAusFhir(arztbriefBauen(angabe(), fest))!;
    expect(vorlage.empfaenger).toEqual([
      'Kardiologische Praxis am Wall',
      'Herrn Dr. med. Jonas Behrens',
      'Am Wall 7',
      '26000 Beispielstadt',
    ]);
    expect(vorlage.betreff).toBe('Arztbrief — Renate Hoffmann, geb. 14.03.1958');
    expect(vorlage.absender[0]).toBe('Hausarztpraxis am Stadtgarten');
    const zeilen = briefTextzeilen(vorlage).map((z) => z.trim());
    expect(zeilen).toContain('I10.90 G Essentielle Hypertonie');
    expect(zeilen).toContain('Ramipril 5 mg — 1-0-0-0 — Grund: Hypertonie');
    expect(zeilen).toContain('Echokardiographie erbeten.');
  });

  it('führt Anamnese und Impfungen als eigene Abschnitte, Impfungen als Immunization', () => {
    const b = arztbriefBauen(
      angabe({
        anamnese: ['30.08.2026: Erstvorstellung nach Umzug.'],
        impfungen: [
          {
            id: 'i1',
            patientId: 'p1',
            impfstoff: {
              bezeichnung: 'Influenza-Impfstoff',
              atc: 'J07BB02',
              atcVersion: '2026',
              pzn: null,
            },
            zielkrankheiten: [],
            datum: '2025-10-14',
            dosis: null,
            charge: null,
            geimpftVon: 'Hausarztpraxis Nordstadt',
            status: 'erfolgt',
            herkunft: {
              bestand: 'lokal',
              quelle: 'Praxis',
              zeitpunkt: '2025-10-14T09:00:00',
              verantwortlich: 'x',
              dokumentId: null,
            },
            epaId: null,
            notiz: null,
          },
        ],
      }),
      fest,
    );
    const titel = (ressourcen(b)[0]!.resource['section'] as { title: string }[]).map(
      (x) => x.title,
    );
    expect(titel).toContain('Anamnese');
    expect(titel.at(-1)).toBe('Impfungen');
    expect(ressourcen(b).some((x) => x.resource['resourceType'] === 'Immunization')).toBe(true);
    expect(briefTextzeilen(briefAusFhir(b)!).map((z) => z.trim())).toContain(
      '14.10.2025 Influenza-Impfstoff — Hausarztpraxis Nordstadt',
    );
  });
});
