import type { Allergie } from './typen/allergie.js';
import type { Diagnose } from './typen/diagnose.js';
import type { Herkunft } from './typen/herkunft.js';
import { CODESYSTEM } from './typen/kodierung.js';

/**
 * Gemeinsame Muster für Tests. Jeder Test überschreibt nur, worauf es ihm ankommt.
 *
 * Vorher baute jede Testdatei ihre Diagnose selbst — bei der Anpassung an das
 * Informationsmodell brachen deshalb drei Dateien auf einmal. Ein Muster an einer Stelle
 * hält neue Pflichtfelder an einer Stelle fest.
 */

export const lokaleHerkunft: Herkunft = {
  bestand: 'lokal',
  quelle: 'Hausarztpraxis am Stadtgarten',
  zeitpunkt: '2026-09-01T09:00:00',
  verantwortlich: 'Dr. med. Anna Brandt',
  dokumentId: null,
};

export function diagnoseMuster(teil: Partial<Diagnose> = {}): Diagnose {
  return {
    id: 'd1',
    patientId: 'p1',
    fallId: null,
    code: 'I10.90',
    bezeichnung: 'Essentielle Hypertonie',
    snomed: { system: CODESYSTEM.snomed, code: '59621000', anzeige: 'Essentielle Hypertonie' },
    alphaId: null,
    zusatzkennzeichen: 'G',
    seitenlokalisation: null,
    diagnosesicherheit: 'gesichert',
    art: 'dauer',
    klinischerStatus: 'aktiv',
    schweregrad: null,
    koerperstelle: null,
    beginn: '2009-02-03',
    ende: null,
    festgestelltAm: '2009-02-03',
    dokumentiertAm: '2026-09-01',
    feststellendePerson: 'Dr. med. Anna Brandt',
    notiz: null,
    herkunft: lokaleHerkunft,
    epaId: null,
    epaFassung: null,
    ...teil,
  };
}

export function allergieMuster(teil: Partial<Allergie> = {}): Allergie {
  return {
    id: 'a1',
    patientId: 'p1',
    substanz: 'Penicillin',
    snomed: { system: CODESYSTEM.snomed, code: '764146007', anzeige: 'Penicillin' },
    typ: 'Allergie',
    kategorien: ['Medikation'],
    gewissheit: 'bestätigt',
    kritikalitaet: 'hohes Risiko',
    reaktionen: [
      {
        manifestationen: [
          { system: CODESYSTEM.snomed, code: '247471006', anzeige: 'Makulopapulöses Exanthem' },
        ],
        schweregrad: 'mittelschwer',
        datum: null,
        expositionsweg: null,
      },
    ],
    klinischerStatus: 'aktiv',
    beginn: '2026-07-17',
    ende: null,
    dokumentiertAm: '2026-07-17',
    feststellendePerson: null,
    notiz: null,
    herkunft: { ...lokaleHerkunft, zeitpunkt: '2026-09-02T09:00:00' },
    epaId: null,
    epaFassung: null,
    ...teil,
  };
}
