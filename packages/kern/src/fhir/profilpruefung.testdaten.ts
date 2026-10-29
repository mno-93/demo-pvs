import type { Diagnose } from '../typen/diagnose.js';

/** Eine Diagnose der Praxis als Behandlungsgrund — nur für Tests. */
export const BEISPIEL_DIAGNOSE: Diagnose = {
  id: 'diag-test',
  patientId: 'p-test',
  fallId: null,
  code: 'I10.90',
  bezeichnung: 'Essentielle Hypertonie, ohne Angabe einer hypertensiven Krise',
  snomed: null,
  alphaId: null,
  zusatzkennzeichen: 'G',
  seitenlokalisation: null,
  diagnosesicherheit: 'gesichert',
  art: 'dauer',
  klinischerStatus: 'aktiv',
  schweregrad: null,
  koerperstelle: null,
  beginn: '2026-01-01',
  ende: null,
  festgestelltAm: null,
  dokumentiertAm: '2026-01-01',
  feststellendePerson: null,
  notiz: null,
  herkunft: {
    bestand: 'lokal',
    quelle: 'Praxis',
    zeitpunkt: '2026-01-01T09:00:00',
    verantwortlich: 'Dr. Demo',
    dokumentId: null,
  },
  epaId: null,
  epaFassung: null,
};
