import {
  chronikLesen,
  impfungAusFhir,
  impfungNachFhir,
  type Chronik,
  type Impfung,
  type Ressource,
} from '@demo-pvs/kern';
import { EINRICHTUNG, impflisteVerfuegbar, listeLesen, listeneintragAnlegen } from './klient.js';

/**
 * ✦ Impfliste der ePA (ADR 0026) — gelesen und geschrieben wie die Listen für Allergien und
 * Diagnosen: Liste mit Änderungseinträgen, Anlegen mit Lesenachweis.
 */

export interface Impflisteneintrag {
  impfung: Impfung;
  ressource: Ressource;
  chronik: Chronik;
  eigener: boolean;
}

export interface EpaImpfliste {
  verfuegbar: boolean;
  eintraege: Impflisteneintrag[];
  lesenachweis: string | null;
}

export async function impflisteLaden(kvnr: string, patientId: string): Promise<EpaImpfliste> {
  if (!(await impflisteVerfuegbar()))
    return { verfuegbar: false, eintraege: [], lesenachweis: null };
  const liste = await listeLesen(kvnr, 'Immunization');
  return {
    verfuegbar: true,
    lesenachweis: liste.lesenachweis,
    eintraege: liste.eintraege.map((r) => {
      const chronik = chronikLesen(r, liste.provenance);
      return {
        ressource: r,
        chronik,
        eigener: chronik.angelegtVonTelematikId === EINRICHTUNG.telematikId,
        impfung: impfungAusFhir(r, patientId, {
          bestand: 'epa',
          quelle: `Impfliste der ePA · ${chronik.angelegtVon}`,
          zeitpunkt: chronik.angelegtAm,
          verantwortlich: chronik.angelegtVon,
          dokumentId: null,
        }),
      };
    }),
  };
}

/** Stellt eine Impfung der Praxis in die Impfliste. */
export function inDieImpfliste(
  kvnr: string,
  lesenachweis: string | null,
  impfung: Impfung,
): Promise<{ eintrag: Ressource; lesenachweis: string }> {
  const r = impfungNachFhir(impfung, kvnr);
  delete r.id;
  return listeneintragAnlegen(kvnr, 'Immunization', lesenachweis, r);
}
