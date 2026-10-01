import { describe, expect, it } from 'vitest';
import {
  allergieNachFhir,
  diagnoseNachFhir,
  HERKUNFT_EXTENSION,
  ICD_EXTENSION,
  patientNachFhir,
  PROFIL,
} from './abbildung.js';
import { SNOMED_VERSION } from '../typen/kodierung.js';
import type { Diagnose } from '../typen/diagnose.js';
import type { Allergie } from '../typen/allergie.js';
import type { Patient } from '../typen/person.js';
import { allergieMuster, diagnoseMuster } from '../testhilfe.js';

const patient: Patient = {
  id: 'p1',
  nachname: 'Hoffmann',
  vorname: 'Renate',
  geburtsdatum: '1958-03-14',
  geschlecht: 'weiblich',
  anschrift: { strasse: 'Gartenweg', hausnummer: '4', plz: '28195', ort: 'Bremen' },
  telefon: '0421 000000',
  versicherung: {
    kvnr: 'A123456780',
    kostentraeger: 'Beispielkasse Nordwest',
    kostentraegerkennung: '109999999',
    versichertenart: 'Mitglied',
    zuzahlungsbefreit: false,
    gueltigBis: '2029-12-31',
    zuletztEingelesen: null,
  },
  angelegtAm: '2026-09-09T08:00:00',
  hinweis: null,
};

const diagnose: Diagnose = diagnoseMuster({
  code: 'I48.1',
  bezeichnung: 'Vorhofflimmern, persistierend',
  snomed: null,
  beginn: '2026-07-17',
  herkunft: {
    bestand: 'epa',
    quelle: 'Krankenhausentlassbrief Klinikum Sonnenschein',
    zeitpunkt: '2026-07-17T14:00:00',
    verantwortlich: 'Dr. med. Lea Wagner',
    dokumentId: 'kh-e-2026-07-17',
  },
});

const allergie: Allergie = allergieMuster();

describe('Abbildung nach FHIR', () => {
  it('bildet den Patienten mit KVNR als Identifier ab', () => {
    const r = patientNachFhir(patient);
    expect(r.resourceType).toBe('Patient');
    expect(r['birthDate']).toBe('1958-03-14');
    expect(JSON.stringify(r)).toContain('A123456780');
    expect(r['gender']).toBe('female');
  });

  it('bildet die Dauerdiagnose als problem-list-item ab', () => {
    const r = diagnoseNachFhir(diagnose);
    expect(r.resourceType).toBe('Condition');
    expect(JSON.stringify(r['category'])).toContain('problem-list-item');
    expect(JSON.stringify(r['clinicalStatus'])).toContain('active');
    expect(JSON.stringify(r['verificationStatus'])).toContain('confirmed');
  });

  it('bildet die Akutdiagnose als encounter-diagnosis ab', () => {
    const r = diagnoseNachFhir({ ...diagnose, art: 'akut' });
    expect(JSON.stringify(r['category'])).toContain('encounter-diagnosis');
  });

  it('bildet die Diagnosesicherheit des Modells ab, nicht das Zusatzkennzeichen', () => {
    // Das Zusatzkennzeichen ist Abrechnungsangabe; maßgeblich ist das Modellfeld.
    const r = diagnoseNachFhir({
      ...diagnose,
      zusatzkennzeichen: 'G',
      diagnosesicherheit: 'differential',
    });
    expect(JSON.stringify(r['verificationStatus'])).toContain('differential');
  });

  it('führt das Zusatzkennzeichen als Extension an der ICD-10-GM-Kodierung', () => {
    const r = diagnoseNachFhir({ ...diagnose, zusatzkennzeichen: 'V', seitenlokalisation: 'L' });
    const icd = (
      r['code'] as { coding: { extension?: { url: string; valueCoding: { code: string } }[] }[] }
    ).coding[0];
    const nachUrl = Object.fromEntries(
      (icd?.extension ?? []).map((e) => [e.url, e.valueCoding.code]),
    );
    expect(nachUrl[ICD_EXTENSION.diagnosesicherheit]).toBe('V');
    expect(nachUrl[ICD_EXTENSION.seitenlokalisation]).toBe('L');
  });

  it('bildet die sechs klinischen Status des Modells ab', () => {
    const r = diagnoseNachFhir({ ...diagnose, klinischerStatus: 'rezidiv' });
    expect(JSON.stringify(r['clinicalStatus'])).toContain('"relapse"');
    const w = diagnoseNachFhir({ ...diagnose, klinischerStatus: 'wiederauftreten' });
    expect(JSON.stringify(w['clinicalStatus'])).toContain('"recurrence"');
  });

  it('folgt dem TI-Common-Entwurf: Profil, KVNR am Subjekt, Feststellungsdatum', () => {
    const r = diagnoseNachFhir({ ...diagnose, festgestelltAm: '2026-07-16' }, 'A123456780');
    expect(r.meta?.profile).toEqual([PROFIL.diagnose]);
    expect(JSON.stringify(r['subject'])).toContain('A123456780');
    expect(JSON.stringify(r.extension)).toContain('condition-assertedDate');
  });

  it('hinterlegt ICD-10-GM und SNOMED CT nebeneinander', () => {
    const r = diagnoseNachFhir({
      ...diagnose,
      snomed: {
        system: 'http://snomed.info/sct',
        code: '440028005',
        anzeige: 'Vorhofflimmern, persistierend',
      },
    });
    const kodierungen = (r['code'] as { coding: { system: string; version?: string }[] }).coding;
    expect(kodierungen.map((k) => k.system)).toEqual([
      'http://fhir.de/CodeSystem/bfarm/icd-10-gm',
      'http://snomed.info/sct',
    ]);
    // ti-condition-diagnosis verlangt die Version an der SNOMED-CT-Kodierung.
    expect(kodierungen[1]?.version).toBe(SNOMED_VERSION);
  });

  it('bildet den Schweregrad als SNOMED-CT-Konzept ab', () => {
    const r = diagnoseNachFhir({
      ...diagnose,
      schweregrad: { system: 'http://snomed.info/sct', code: '24484000', anzeige: 'schwer' },
    });
    expect(JSON.stringify(r['severity'])).toContain('24484000');
  });

  it('setzt die Herkunfts-Extension nur bei einem Quelldokument', () => {
    expect(diagnoseNachFhir({ ...diagnose, festgestelltAm: null }).extension?.[0]?.url).toBe(
      HERKUNFT_EXTENSION,
    );
    expect(allergieNachFhir(allergie).extension).toBeUndefined();
  });

  it('bildet Typ, Kategorie und Kritikalität der Allergie ab', () => {
    const r = allergieNachFhir(allergie);
    expect(r['type']).toBe('allergy');
    expect(r['category']).toEqual(['medication']);
    expect(r['criticality']).toBe('high');
  });

  it('bildet Reaktionen mit kodierter Manifestation und Schweregrad ab', () => {
    const r = allergieNachFhir(allergie);
    const reaktion = (
      r['reaction'] as { manifestation: { coding: { code: string }[] }[]; severity: string }[]
    )[0];
    expect(reaktion?.manifestation[0]?.coding[0]?.code).toBe('247471006');
    expect(reaktion?.severity).toBe('moderate');
  });

  it('kodiert die Substanz nur mit SNOMED CT — die AMTS-Zuordnung bleibt draußen', () => {
    const r = allergieNachFhir(allergie);
    const kodierungen = (r['code'] as { coding: { system: string }[] }).coding;
    expect(kodierungen.map((k) => k.system)).toEqual(['http://snomed.info/sct']);
  });

  it('führt die Bezeichnung auch ohne Code', () => {
    const r = allergieNachFhir({ ...allergie, snomed: null, substanz: 'Nickel' });
    expect((r['code'] as { coding?: unknown[] }).coding).toBeUndefined();
    expect((r['code'] as { text?: string }).text).toBe('Nickel');
  });

  it('bildet den klinisch relevanten Zeitraum als onsetPeriod ab', () => {
    const r = allergieNachFhir({ ...allergie, beginn: '2019-04-01', ende: '2024-01-01' });
    expect(r['onsetPeriod']).toEqual({ start: '2019-04-01', end: '2024-01-01' });
  });

  it('bildet den Expositionsweg als SNOMED-CT-Konzept ab', () => {
    const r = allergieNachFhir({
      ...allergie,
      reaktionen: [
        {
          manifestationen: [
            { system: 'http://snomed.info/sct', code: '126485001', anzeige: 'Urtikaria' },
          ],
          schweregrad: 'leicht',
          datum: '2019-04-08',
          expositionsweg: {
            system: 'http://snomed.info/sct',
            code: '26643006',
            anzeige: 'Oraler Verabreichungsweg',
          },
        },
      ],
    });
    expect(JSON.stringify(r['reaction'])).toContain('26643006');
  });
});

describe('Impfung', () => {
  it('bildet nach immunization-eu-core ab und liest verlustfrei zurück', async () => {
    const { impfungNachFhir } = await import('./abbildung.js');
    const { impfungAusFhir } = await import('./lesen.js');
    const herkunft = {
      bestand: 'lokal' as const,
      quelle: 'Hausarztpraxis',
      zeitpunkt: '2026-09-09T09:00:00',
      verantwortlich: 'Dr. med. Anna Brandt',
      dokumentId: null,
    };
    const r = impfungNachFhir(
      {
        id: 'i1',
        patientId: 'p1',
        impfstoff: {
          bezeichnung: 'Influenza-Impfstoff',
          atc: 'J07BB02',
          atcVersion: '2026',
          pzn: '90900102',
        },
        zielkrankheiten: [
          { system: 'http://snomed.info/sct', code: '6142004', anzeige: 'Influenza' },
        ],
        datum: '2026-09-09',
        dosis: 1,
        charge: 'AB123',
        geimpftVon: 'Dr. med. Anna Brandt',
        status: 'erfolgt',
        herkunft,
        epaId: null,
        notiz: null,
      },
      'A123456780',
    );
    expect(r.meta?.profile).toEqual([
      'http://hl7.eu/fhir/base/StructureDefinition/immunization-eu-core',
    ]);
    const ziel = (
      r['protocolApplied'] as { targetDisease: { coding: { version?: string }[] }[] }[]
    )[0]!;
    expect(ziel.targetDisease[0]!.coding[0]!.version).toBeDefined();
    const zurueck = impfungAusFhir(r, 'p1', herkunft);
    expect(zurueck.impfstoff.atc).toBe('J07BB02');
    expect(zurueck.zielkrankheiten[0]!.code).toBe('6142004');
    expect(zurueck.dosis).toBe(1);
    expect(zurueck.charge).toBe('AB123');
  });
});
