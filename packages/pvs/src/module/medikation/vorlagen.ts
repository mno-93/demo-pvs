import {
  CODESYSTEM,
  arzneimittel,
  dosierungAusFhir,
  imGueltigenPlan,
  type ArzneimittelEintrag,
  type PraxisplanEintrag,
} from '@demo-pvs/kern';
import { codeVon, textVon } from '../../epa/epa-bestand.js';
import { DOSIERUNG_VORGABE } from './DosierungEingabe.js';
import { referenz, type Planzeile } from './planabgleich.js';
import type { Rezeptvorlage } from './RezeptUi.js';
import {
  empKennung,
  type Ansichtszeile,
  type Listenzeile,
  type Medikationsstand,
} from './stand.js';

const PZN = CODESYSTEM.pzn;

/**
 * Vorlagen für ein E-Rezept: aus einem Eintrag des Plans der Praxis, des eMP oder der Liste und
 * neu aus dem Katalog. Ohne Oberfläche; das Modul zeigt die Vorlage im Formular.
 */

export function vorlageAusPraxisplan(e: PraxisplanEintrag): Rezeptvorlage {
  return {
    arzneimittel: {
      bezeichnung: e.bezeichnung,
      pzn: e.pzn ?? arzneimittel.find((m) => m.atc === e.atc)?.pzn ?? '',
      atc: e.atc,
      atcVersion: e.atcVersion,
    },
    dosierung: e.dosierung,
    dosis: e.dosis ?? null,
    empId: null,
    praxisplanId: e.id,
    grund: e.grund,
    herkunft: 'plan',
    imPlan: true,
    katalog: arzneimittel.find((m) => m.atc === e.atc) ?? null,
  };
}

export function vorlageAusPlan(z: Planzeile, stand: Medikationsstand | null): Rezeptvorlage {
  const katalog =
    arzneimittel.find((m) => m.atc === z.atc && z.bezeichnung.startsWith(m.bezeichnung)) ??
    arzneimittel.find((m) => m.atc === z.atc) ??
    null;
  const mittel = stand?.plan.ressourcen.find(
    (r) => r.resourceType === 'Medication' && r.id === referenz(z.eintrag),
  );
  return {
    arzneimittel: {
      bezeichnung: z.bezeichnung,
      pzn: (mittel && codeVon(mittel, 'code', PZN)) ?? katalog?.pzn ?? '',
      atc: z.atc,
      atcVersion: katalog?.atcVersion ?? '2026',
    },
    dosierung: z.dosierung,
    dosis: z.dosis ?? null,
    empId: empKennung(z),
    grund: z.grund,
    herkunft: 'plan',
    imPlan: true,
    katalog,
  };
}

export function vorlageAusListe(z: Listenzeile): Rezeptvorlage {
  const katalog = arzneimittel.find((m) => m.atc === z.atc) ?? null;
  return {
    arzneimittel: {
      bezeichnung: z.medikament ? textVon(z.medikament) : (katalog?.bezeichnung ?? ''),
      pzn: (z.medikament && codeVon(z.medikament, 'code', PZN)) ?? katalog?.pzn ?? '',
      atc: z.atc,
      atcVersion: katalog?.atcVersion ?? '2026',
    },
    dosierung: z.dosierung,
    dosis: dosierungAusFhir(z.aussage['dosage']),
    empId: null,
    grund: null,
    herkunft: 'liste',
    imPlan: z.planeintrag !== null,
    wirkstoffImPlan: z.wirkstoffImPlan?.bezeichnung ?? null,
    katalog,
    ...(z.medikament
      ? {
          listeneintrag: {
            aussageId: String(z.aussage.id),
            medicationId: String(z.medikament.id),
          },
        }
      : {}),
  };
}

export function vorlageNeu(
  m: ArzneimittelEintrag,
  zeilen: readonly Ansichtszeile[],
): Rezeptvorlage {
  return {
    arzneimittel: {
      bezeichnung: m.bezeichnung,
      pzn: m.pzn,
      atc: m.atc,
      atcVersion: m.atcVersion,
    },
    dosierung: '1-0-0-0',
    dosis: DOSIERUNG_VORGABE,
    empId: null,
    grund: null,
    herkunft: 'neu',
    imPlan: false,
    wirkstoffImPlan:
      zeilen.map((z) => z.lokal ?? z.epa!).find((e) => e.atc === m.atc && imGueltigenPlan(e))
        ?.bezeichnung ?? null,
    katalog: m,
  };
}
