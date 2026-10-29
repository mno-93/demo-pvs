import { describe, expect, it } from 'vitest';
import {
  ADRESSBUCH,
  BEFUND_HOFFMANN,
  BEFUND_HOFFMANN_MAERZ,
  BEFUND_YILDIZ,
  PRAXIS_STAMMDATEN,
} from '../beispiele.js';
import { arztbriefBauen } from '../fachlogik/arztbrief.js';
import { laborbefundBauen } from '../fachlogik/laborbefund.js';
import { allergieMuster, diagnoseMuster } from '../testhilfe.js';
import type { Diagnosesicherheit, KlinischerStatus } from '../typen/diagnose.js';
import type { AllergieStatus, Gewissheit } from '../typen/allergie.js';
import type { Impfung } from '../typen/impfung.js';
import type { Patient } from '../typen/person.js';
import type { Rezept } from '../typen/rezept.js';
import {
  allergieNachFhir,
  diagnoseNachFhir,
  impfungNachFhir,
  keineBekannteAllergieNachFhir,
  patientNachFhir,
  personNachFhir,
  praxisNachFhir,
} from './abbildung.js';
import { verordnungsdatensatzBauen } from './erezept.js';
import {
  medikationsaussageNachFhir,
  planeintragNachFhir,
  planmittelNachFhir,
} from './medikation.js';
import { dosierungAusText } from '../fachlogik/dosierung.js';
import { fhirPruefen } from './pruefung.js';
import type { Ressource } from './typen.js';

/**
 * Pflichtangaben und Invarianten der FHIR-Ausgaben — die Regeln greifen, und keine Ausgabe der
 * Demo verletzt sie. Was das nicht abdeckt, steht in DATENMODELL.md, Abschnitt 6.
 */

const KVNR = 'A123456780';
const TI_DIAGNOSE = 'https://gematik.de/fhir/ti/StructureDefinition/ti-condition-diagnosis';
const THO = 'http://terminology.hl7.org/CodeSystem/';

const PATIENTIN: Patient = {
  id: 'p1',
  nachname: 'Hoffmann',
  vorname: 'Renate',
  geburtsdatum: '1958-03-14',
  geschlecht: 'weiblich',
  anschrift: { strasse: 'Lindenweg', hausnummer: '3', plz: '26000', ort: 'Beispielstadt' },
  telefon: '0000 1',
  versicherung: {
    kvnr: KVNR,
    kostentraeger: 'Beispielkasse Nordwest',
    kostentraegerkennung: '109999901',
    versichertenart: 'Rentner:in',
    zuzahlungsbefreit: false,
    gueltigBis: '2030-12-31',
    zuletztEingelesen: null,
  },
  angelegtAm: '2026-08-30T08:30:00',
  hinweis: null,
};

function impfung(teil: Partial<Impfung> = {}): Impfung {
  return {
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
      verantwortlich: 'Dr. med. Petra Lang',
      dokumentId: null,
    },
    epaId: null,
    notiz: null,
    ...teil,
  };
}

const fehler = (r: unknown) => fhirPruefen(r as Ressource).filter((b) => b.schwere === 'fehler');
const regeln = (r: unknown) => fehler(r).map((b) => b.regel);

describe('Strukturprüfung erkennt Verstöße', () => {
  it('con-5 und ait-2: kein klinischer Status bei irrtümlicher Eingabe', () => {
    const kodiert = (system: string, code: string) => ({
      coding: [{ system: THO + system, code }],
    });
    expect(
      regeln({
        resourceType: 'Condition',
        subject: { reference: 'P' },
        clinicalStatus: kodiert('condition-clinical', 'active'),
        verificationStatus: kodiert('condition-ver-status', 'entered-in-error'),
      }),
    ).toContain('con-5');
    expect(
      regeln({
        resourceType: 'AllergyIntolerance',
        patient: { reference: 'P' },
        clinicalStatus: kodiert('allergyintolerance-clinical', 'active'),
        verificationStatus: kodiert('allergyintolerance-verification', 'entered-in-error'),
      }),
    ).toContain('ait-2');
  });

  it('con-4: ein Ende nur mit inaktivem, behobenem oder remittiertem Status', () => {
    const zustand = (system: string, code: string) => ({
      coding: [{ system: THO + system, code }],
    });
    const diagnose = (teil: object) => ({
      resourceType: 'Condition',
      subject: { reference: 'P' },
      abatementDateTime: '2026-08-01',
      ...teil,
    });
    expect(
      regeln(diagnose({ clinicalStatus: zustand('condition-clinical', 'relapse') })),
    ).toContain('con-4');
    // Ohne Status — bei „entered-in-error" (con-5) — gilt die Regel ebenso.
    expect(
      regeln(diagnose({ verificationStatus: zustand('condition-ver-status', 'entered-in-error') })),
    ).toContain('con-4');
    expect(
      regeln(diagnose({ clinicalStatus: zustand('condition-clinical', 'resolved') })),
    ).not.toContain('con-4');
    // Der Ausdruck liest nur das HL7-Codesystem: ein „resolved“ aus einem anderen System zählt nicht.
    expect(
      regeln(diagnose({ clinicalStatus: { coding: [{ system: 'x', code: 'resolved' }] } })),
    ).toContain('con-4');
  });

  it('Pflicht der Basis und des Profils', () => {
    expect(
      regeln({
        resourceType: 'Immunization',
        status: 'completed',
        vaccineCode: { text: 'x' },
        patient: { reference: 'P' },
        occurrenceDateTime: '2025-10-14',
        protocolApplied: [{ series: '1' }],
      }),
    ).toEqual(['Pflicht R4']);
    // `code` ist in der Basis 0..1, im TI-Profil 1..1.
    expect(
      regeln({
        resourceType: 'Condition',
        meta: { profile: [TI_DIAGNOSE] },
        subject: { reference: 'P', identifier: { value: KVNR } },
      }),
    ).toEqual(['Pflicht ti-condition-diagnosis']);
  });

  it('ele-1, Zeitzone und Version der Kodierung im TI-Profil', () => {
    expect(regeln({ resourceType: 'Patient', name: [] })).toContain('ele-1');
    expect(
      regeln({
        resourceType: 'Encounter',
        status: 'finished',
        class: { code: 'AMB' },
        period: { start: '2026-09-09T11:00:00' },
      }),
    ).toContain('Zeitzone');
    expect(
      regeln({
        resourceType: 'Condition',
        meta: { profile: [TI_DIAGNOSE] },
        subject: { reference: 'P', identifier: { value: KVNR } },
        code: { coding: [{ system: 'http://snomed.info/sct', code: '1' }] },
      }),
    ).toContain('Kodierung');
    expect(
      regeln({
        resourceType: 'Condition',
        meta: { profile: [TI_DIAGNOSE] },
        subject: { reference: 'P' },
        code: { coding: [{ system: 'http://fhir.de/CodeSystem/bfarm/alpha-id', code: 'I1' }] },
      }),
    ).toContain('Kodierung');
  });

  it('Dokumentregeln: Kennung, Composition zuerst, alles erreichbar', () => {
    const dokument = (entry: unknown[]) => ({ resourceType: 'Bundle', type: 'document', entry });
    const komposition = {
      fullUrl: 'urn:uuid:c',
      resource: {
        resourceType: 'Composition',
        status: 'final',
        type: { text: 'x' },
        date: '2026-09-09',
        author: [{ reference: 'urn:uuid:fehlt' }],
        title: 'x',
        section: [{ title: 'x', text: { status: 'generated', div: '<div/>' } }],
      },
    };
    const lose = { fullUrl: 'urn:uuid:p', resource: { resourceType: 'Patient' } };
    const r = regeln(dokument([komposition, lose]));
    expect(r).toContain('bdl-9');
    expect(r).toContain('bdl-10');
    expect(r.filter((x) => x === 'Dokument')).toHaveLength(2);
    expect(regeln(dokument([lose, komposition]))).toContain('bdl-11');
  });
});

describe('Ausgaben der Demo sind ohne Fehler', () => {
  it('Diagnose — jede Diagnosesicherheit und jeder Status, mit Ende und Alpha-ID', () => {
    const sicherheiten: Diagnosesicherheit[] = [
      'gesichert',
      'vorläufig',
      'differential',
      'unbestätigt',
      'ausgeschlossen',
      'irrtümlich',
    ];
    const status: KlinischerStatus[] = [
      'aktiv',
      'wiederauftreten',
      'rezidiv',
      'inaktiv',
      'remission',
      'behoben',
    ];
    for (const s of sicherheiten) {
      for (const k of status) {
        const r = diagnoseNachFhir(
          diagnoseMuster({
            diagnosesicherheit: s,
            klinischerStatus: k,
            ende: '2026-08-01',
            alphaId: 'I23456',
          }),
          KVNR,
        );
        expect(fehler(r), `${s}, ${k}`).toEqual([]);
      }
    }
  });

  it('Allergie — jede Gewissheit, ohne Kategorie, Reaktion ohne Manifestation', () => {
    const gewissheiten: Gewissheit[] = ['bestätigt', 'unbestätigt', 'widerlegt', 'irrtümlich'];
    const status: AllergieStatus[] = ['aktiv', 'inaktiv', 'behoben'];
    for (const g of gewissheiten) {
      for (const k of status) {
        const r = allergieNachFhir(
          allergieMuster({ gewissheit: g, klinischerStatus: k, ende: '2024-01-01' }),
          KVNR,
        );
        expect(fehler(r), `${g}, ${k}`).toEqual([]);
      }
    }
    const ohne = allergieNachFhir(
      allergieMuster({
        kategorien: [],
        reaktionen: [{ manifestationen: [], schweregrad: null, datum: null, expositionsweg: null }],
      }),
      KVNR,
    );
    expect(fehler(ohne)).toEqual([]);
    expect(ohne['reaction']).toBeUndefined();
  });

  it('Impfung — mit und ohne Dosis und Zielkrankheit', () => {
    expect(fehler(impfungNachFhir(impfung(), KVNR))).toEqual([]);
    expect(
      fehler(
        impfungNachFhir(
          impfung({
            dosis: 2,
            zielkrankheiten: [
              { system: 'http://snomed.info/sct', code: '6142004', anzeige: 'Influenza' },
            ],
          }),
          KVNR,
        ),
      ),
    ).toEqual([]);
    // Unbekannte Dosis: Pflichtelement mit Fehlgrund statt weggelassen.
    const p = (
      impfungNachFhir(impfung(), KVNR)['protocolApplied'] as Record<string, unknown>[]
    )[0]!;
    expect(p['_doseNumberPositiveInt']).toEqual({
      extension: [
        { url: 'http://hl7.org/fhir/StructureDefinition/data-absent-reason', valueCode: 'unknown' },
      ],
    });
  });

  it('Stammdaten: Patient, Praxis, Person, „keine bekannte Allergie"', () => {
    expect(fehler(patientNachFhir(PATIENTIN))).toEqual([]);
    expect(fehler(praxisNachFhir(PRAXIS_STAMMDATEN))).toEqual([]);
    expect(fehler(personNachFhir('Dr. med. Anna Brandt', '999999901'))).toEqual([]);
    expect(
      fehler(keineBekannteAllergieNachFhir(KVNR, 'Dr. med. Anna Brandt', '2026-09-09')),
    ).toEqual([]);
  });

  it('Medikation — Arzneimittel, Aussage; der Planeintrag bekommt sein Arzneimittel vom Dienst', () => {
    expect(
      fehler(
        planmittelNachFhir({
          bezeichnung: 'Ramipril 5 mg',
          atc: 'C09AA05',
          atcVersion: '2026',
          pzn: '1',
        }),
      ),
    ).toEqual([]);
    const aussage = (seit: string | null) =>
      medikationsaussageNachFhir(
        { bezeichnung: 'Ramipril 5 mg', atc: 'C09AA05', dosierung: '1-0-0-0', grund: null },
        { subject: { reference: 'urn:uuid:p' }, datum: '2026-09-09', seit },
      );
    expect(fehler(aussage(null))).toEqual([]);
    expect(fehler(aussage('2026-01-01'))).toEqual([]);
    // $add-emp-entry: Arzneimittel als eigener Parameter, medicationReference setzt der Dienst.
    expect(
      regeln(
        planeintragNachFhir({
          kvnr: KVNR,
          datum: '2026-09-09',
          dosierung: dosierungAusText('1-0-0-0'),
          grund: null,
        }),
      ),
    ).toEqual(['Pflicht R4']);
  });

  it('Arztbrief als Dokument — vollständig, alles erreichbar, Zeitpunkte mit Zone', () => {
    const brief = arztbriefBauen({
      dokumentId: '00000000-0000-4000-8000-000000000001',
      zeitpunkt: '2026-09-09T11:00:00',
      patient: PATIENTIN,
      verfasser: { name: 'Dr. med. Anna Brandt', lanr: '999999901' },
      einrichtung: PRAXIS_STAMMDATEN,
      empfaenger: ADRESSBUCH[0]!,
      anlass: 'Bitte um Mitbeurteilung.',
      anamnese: ['30.08.2026: Erstvorstellung nach Umzug.'],
      diagnosen: [diagnoseMuster({ patientId: 'p1' })],
      allergien: [allergieMuster({ patientId: 'p1' })],
      befunde: ['RR 138/84 mmHg'],
      beurteilung: 'Klinisch stabil.',
      medikation: [
        { bezeichnung: 'Ramipril 5 mg', atc: 'C09AA05', dosierung: '1-0-0-0', grund: 'Hypertonie' },
      ],
      empfehlungen: 'Kontrolle in drei Monaten.',
      impfungen: [impfung()],
    });
    expect(fehler(brief)).toEqual([]);
    expect(brief['timestamp']).toBe('2026-09-09T11:00:00+02:00');
  });

  it('Laborbefunde und E-Rezept', () => {
    for (const b of [BEFUND_HOFFMANN, BEFUND_HOFFMANN_MAERZ, BEFUND_YILDIZ]) {
      expect(fehler(laborbefundBauen(b))).toEqual([]);
    }
    const rezept: Rezept = {
      id: 'r1',
      patientId: 'p1',
      arzneimittel: {
        bezeichnung: 'Ramipril 5 mg',
        pzn: '90900010',
        atc: 'C09AA05',
        atcVersion: '2026',
      },
      dosierung: '1-0-0-0',
      packungen: 1,
      normgroesse: 'N3',
      empId: null,
      grund: null,
      status: 'vorbereitet',
      freigabe: 'freigegeben',
      hinweis: null,
      erstelltAm: '2026-09-29T09:00:00',
      vorbereitetVon: 'Sabine Rothe',
      rezeptId: null,
      accessCode: null,
      signiertVon: null,
      gesendetAm: null,
      geloeschtAm: null,
    };
    expect(
      fehler(
        verordnungsdatensatzBauen(rezept, {
          patient: PATIENTIN,
          arzt: { name: 'Dr. med. Anna Brandt', lanr: '999999901' },
          praxis: PRAXIS_STAMMDATEN,
          rezeptId: '160.000.000.000.001.53',
          authoredOn: '2026-09-29',
        }),
      ),
    ).toEqual([]);
  });
});
