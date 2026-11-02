import { describe, expect, it } from 'vitest';
import {
  HERKUNFT_EXTENSION,
  allergieNachFhir,
  diagnoseNachFhir,
  impfungNachFhir,
} from './abbildung.js';
import {
  allergieAusFhirRessource,
  chronikLesen,
  diagnoseAusFhir,
  impfungAusFhir,
  istBerichtigt,
} from './lesen.js';
import { allergieMuster, diagnoseMuster } from '../testhilfe.js';
import { CODESYSTEM } from '../typen/kodierung.js';

describe('Rückabbildung aus FHIR', () => {
  it('liest eine Diagnose verlustfrei zurück', () => {
    const d = diagnoseMuster({
      zusatzkennzeichen: 'V',
      seitenlokalisation: 'L',
      diagnosesicherheit: 'vorläufig',
      klinischerStatus: 'remission',
      schweregrad: { system: CODESYSTEM.snomed, code: '24484000', anzeige: 'Schwer' },
      koerperstelle: 'linkes Knie',
      ende: '2026-08-01',
      festgestelltAm: '2009-02-04',
      notiz: 'Test',
    });
    const zurueck = diagnoseAusFhir(
      { ...diagnoseNachFhir(d, 'A123456780'), meta: { versionId: '3' } },
      d.patientId,
      d.herkunft,
    );
    expect(zurueck).toEqual({ ...d, epaId: d.id, epaFassung: '3' });
  });

  it('liest eine Allergie mit Reaktionen verlustfrei zurück', () => {
    const a = allergieMuster({
      snomed: { system: CODESYSTEM.snomed, code: '764146007', anzeige: 'Penicillin' },
      klinischerStatus: 'behoben',
      beginn: '2019-04-01',
      ende: '2024-01-01',
      feststellendePerson: 'Dr. X',
      notiz: 'Hinweis',
    });
    const zurueck = allergieAusFhirRessource(
      allergieNachFhir(a, 'A123456780'),
      a.patientId,
      a.herkunft,
    );
    expect(zurueck).toEqual({ ...a, epaId: a.id, epaFassung: '1' });
  });

  it('erkennt einen berichtigten Eintrag', () => {
    expect(
      istBerichtigt({
        resourceType: 'Condition',
        verificationStatus: { coding: [{ code: 'entered-in-error' }] },
      }),
    ).toBe(true);
    expect(
      istBerichtigt({
        resourceType: 'Condition',
        verificationStatus: { coding: [{ code: 'confirmed' }] },
      }),
    ).toBe(false);
  });
});

describe('Chronik eines ePA-Eintrags', () => {
  const eintrag = { resourceType: 'Condition', id: 'c1', meta: { versionId: '2' } };
  const prov = (id: string, taetigkeit: string, zeit: string, wer: string, fassung: number) => ({
    resourceType: 'Provenance',
    id,
    target: [{ reference: `Condition/c1/_history/${fassung}` }],
    recorded: zeit,
    activity: { coding: [{ code: taetigkeit }] },
    agent: [{ who: { display: wer, identifier: { value: wer.toUpperCase() } } }],
  });

  it('nennt anlegende und zuletzt ändernde Einrichtung', () => {
    const chronik = chronikLesen(eintrag, [
      prov('p2', 'UPDATE', '2026-09-09T10:00:00', 'Praxis', 2),
      prov('p1', 'CREATE', '2026-07-17T14:00:00', 'Klinikum', 1),
    ]);
    expect(chronik.angelegtVon).toBe('Klinikum');
    expect(chronik.zuletztVon).toBe('Praxis');
    expect(chronik.aenderungen).toBe(1);
    expect(chronik.angelegtVonTelematikId).toBe('KLINIKUM');
  });

  it('beachtet nur die Provenance des eigenen Eintrags', () => {
    const fremd = {
      ...prov('p9', 'CREATE', '2026-01-01T00:00:00', 'Andere', 1),
      target: [{ reference: 'Condition/c9/_history/1' }],
    };
    expect(chronikLesen(eintrag, [fremd]).angelegtVon).toBe('unbekannt');
  });

  it('zählt Chronologieeinträge der Liste nicht als Änderung des Eintrags', () => {
    const chronologie = {
      ...prov('ch', 'UPDATE', '2026-09-27T20:00:00', 'Praxis', 1),
      extension: [{ url: 'https://example.org/is-condition-list-chronology', valueBoolean: true }],
    };
    const chronik = chronikLesen(eintrag, [
      prov('p1', 'CREATE', '2026-07-17T14:00:00', 'Klinikum', 1),
      chronologie,
    ]);
    expect(chronik.zuletztVon).toBe('Klinikum');
    expect(chronik.aenderungen).toBe(0);
  });

  it('liest erstellende Person und Quelldokument für die Herkunftszeile', () => {
    const mitQuelle = {
      ...eintrag,
      recorder: { display: 'Dr. med. Lea Wagner' },
      extension: [
        {
          url: HERKUNFT_EXTENSION,
          valueReference: {
            reference: 'DocumentReference/kh-e-1',
            display: 'Entlassbrief, Klinikum',
          },
        },
      ],
    };
    const chronik = chronikLesen(mitQuelle, []);
    expect(chronik.erstelltDurch).toBe('Dr. med. Lea Wagner');
    expect(chronik.quelldokument).toEqual({ id: 'kh-e-1', anzeige: 'Entlassbrief, Klinikum' });
    expect(chronikLesen(eintrag, []).quelldokument).toBeNull();
  });
});

describe('Rückabbildung: unbekannt statt Vorbelegung (ADR 0053)', () => {
  const herkunft = diagnoseMuster({}).herkunft;
  const icd = { system: CODESYSTEM.icd10gm, code: 'J45.9', display: 'Asthma bronchiale' };

  it('leitet das Zusatzkennzeichen aus der Diagnosesicherheit ab — ausgeschlossen ist A', () => {
    const d = diagnoseAusFhir(
      {
        resourceType: 'Condition',
        id: 'c1',
        verificationStatus: { coding: [{ code: 'refuted' }] },
        category: [{ coding: [{ code: 'problem-list-item' }] }],
        code: { coding: [icd] },
      },
      'p1',
      herkunft,
    );
    expect(d.zusatzkennzeichen).toBe('A');
    expect(d.diagnosesicherheit).toBe('ausgeschlossen');
    expect(d.klinischerStatus).toBeNull();
  });

  it('lässt fehlende Angaben unbekannt und schreibt sie nicht zurück', () => {
    const d = diagnoseAusFhir(
      { resourceType: 'Condition', id: 'c2', code: { coding: [icd], text: 'Asthma' } },
      'p1',
      herkunft,
    );
    expect(d).toMatchObject({
      zusatzkennzeichen: null,
      diagnosesicherheit: null,
      klinischerStatus: null,
    });
    const fhir = diagnoseNachFhir(d, 'A123456780');
    expect(fhir['clinicalStatus']).toBeUndefined();
    expect(fhir['verificationStatus']).toBeUndefined();
    const coding = (fhir['code'] as { coding: { extension?: unknown[] }[] }).coding[0]!;
    expect(coding.extension).toBeUndefined();
  });

  it('nennt den Tag eines Zeitpunkts in deutscher Zeit', () => {
    const d = diagnoseAusFhir(
      {
        resourceType: 'Condition',
        id: 'c3',
        clinicalStatus: { coding: [{ code: 'active' }] },
        verificationStatus: { coding: [{ code: 'confirmed' }] },
        code: { coding: [icd] },
        onsetDateTime: '2026-09-08T23:30:00Z',
      },
      'p1',
      herkunft,
    );
    expect(d.beginn).toBe('2026-09-09');
    expect(d.zusatzkennzeichen).toBe('G');
  });

  it('liest eine nicht erfolgte Impfung als „nicht erfolgt“ und schreibt not-done', () => {
    const i = impfungAusFhir(
      {
        resourceType: 'Immunization',
        id: 'i1',
        status: 'not-done',
        vaccineCode: { text: 'Influenza' },
        occurrenceDateTime: '2025-10-14',
      },
      'p1',
      herkunft,
    );
    expect(i.status).toBe('nicht-erfolgt');
    const fhir = impfungNachFhir(i, 'A123456780');
    expect(fhir['status']).toBe('not-done');
    // Ohne ATC-Code kein ATC-Coding mit leerem Code.
    expect((fhir['vaccineCode'] as { coding: unknown[] }).coding).toEqual([]);
  });
});
