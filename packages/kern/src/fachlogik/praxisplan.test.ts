import { describe, expect, it } from 'vitest';
import type { PraxisplanEintrag } from '../typen/medikation.js';
import type { Rezept } from '../typen/rezept.js';
import {
  imGueltigenPlan,
  letzteVerordnung,
  planangabeAusRezept,
  planeintragZumRezept,
} from './praxisplan.js';

const eintrag = (teil: Partial<PraxisplanEintrag>): PraxisplanEintrag => ({
  id: 'pp-1',
  patientId: 'p-weber',
  bezeichnung: 'Salbutamol 0,1 mg/Hub Druckgasinhalation',
  atc: 'R03AC02',
  atcVersion: '2026',
  pzn: '90900010',
  dosierung: 'bei Bedarf',
  grund: 'Asthma bronchiale',
  status: 'aktiv',
  verantwortlich: 'Dr. Demo',
  fassung: '1',
  angelegtAm: '2026-10-28T09:00:00',
  geaendertAm: '2026-10-28T09:00:00',
  rezeptIds: [],
  ...teil,
});

const rezept = (teil: Partial<Rezept>): Rezept => ({
  id: 'rz-1',
  patientId: 'p-weber',
  arzneimittel: {
    bezeichnung: 'Ramipril 5 mg',
    pzn: '90900020',
    atc: 'C09AA05',
    atcVersion: '2026',
  },
  dosierung: '1-0-0-0',
  packungen: 1,
  normgroesse: 'N3',
  empId: null,
  grund: 'Hypertonie',
  status: 'gesendet',
  freigabe: 'freigegeben',
  hinweis: null,
  erstelltAm: '2026-10-28T09:00:00',
  vorbereitetVon: 'Dr. Demo',
  rezeptId: '160.000.000.000.001.01',
  accessCode: 'x',
  signiertVon: 'Dr. Demo',
  gesendetAm: '2026-10-28T09:05:00',
  geloeschtAm: null,
  ...teil,
});

describe('Medikationsplan der Praxis', () => {
  it('zählt aktive und pausierte Einträge zum gültigen Plan', () => {
    expect(imGueltigenPlan({ status: 'aktiv' })).toBe(true);
    expect(imGueltigenPlan({ status: 'pausiert' })).toBe(true);
    expect(imGueltigenPlan({ status: 'abgesetzt' })).toBe(false);
    expect(imGueltigenPlan({ status: 'entered-in-error' })).toBe(false);
  });

  it('ordnet ein Rezept über seine Kennung dem Planeintrag zu', () => {
    const plan = [eintrag({ rezeptIds: ['rz-1'] })];
    expect(planeintragZumRezept(rezept({}), plan)?.id).toBe('pp-1');
  });

  it('ordnet ein Rezept über denselben Wirkstoff zu, damit es nicht doppelt aufgenommen wird', () => {
    const plan = [eintrag({ atc: 'C09AA05' })];
    expect(planeintragZumRezept(rezept({ id: 'rz-2' }), plan)?.id).toBe('pp-1');
  });

  it('übergeht abgesetzte Einträge — das Mittel kann wieder aufgenommen werden', () => {
    const plan = [eintrag({ atc: 'C09AA05', rezeptIds: ['rz-1'], status: 'abgesetzt' })];
    expect(planeintragZumRezept(rezept({}), plan)).toBeNull();
  });

  it('findet die jüngste gesendete Verordnung eines Eintrags', () => {
    const rezepte = [
      rezept({ id: 'rz-1', gesendetAm: '2026-07-01T08:00:00' }),
      rezept({ id: 'rz-2', gesendetAm: '2026-10-01T08:00:00' }),
      rezept({ id: 'rz-3', status: 'vorbereitet', gesendetAm: null }),
    ];
    const e = eintrag({ rezeptIds: ['rz-1', 'rz-2', 'rz-3'] });
    expect(letzteVerordnung(e, rezepte)?.id).toBe('rz-2');
    expect(letzteVerordnung(eintrag({}), rezepte)).toBeNull();
  });

  it('übernimmt Mittel, Dosierung und Grund aus dem Rezept', () => {
    expect(planangabeAusRezept(rezept({}))).toEqual({
      bezeichnung: 'Ramipril 5 mg',
      atc: 'C09AA05',
      atcVersion: '2026',
      pzn: '90900020',
      dosierung: '1-0-0-0',
      grund: 'Hypertonie',
    });
  });
});
