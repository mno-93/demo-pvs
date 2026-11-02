import { useMemo } from 'react';
import {
  allergieAusFhir,
  allergieFuerAmts,
  deutschesDatum,
  dokumentinhaltLesen,
  istKeineBekannteAllergie,
  laborwerteAusDokumenten,
  type Allergie,
  type DokumentierteAllergie,
  type LokalesDokument,
} from '@demo-pvs/kern';
import type { Listenlage } from '../../epa/listen.js';

/**
 * Umgebung der AMTS-Prüfung ohne den Plan: Allergien der Praxis, aus übernommenen Dokumenten und
 * — in der Weiterentwicklung — aus der Allergienliste der ePA; Nierenfunktion aus Laborbefunden.
 */
export function useAmtsUmgebung(
  listenlage: Listenlage,
  lokaleAllergien: readonly Allergie[],
  lokaleDokumente: readonly LokalesDokument[],
) {
  const epaAllergien = useMemo(() => {
    if (listenlage.art !== 'bereit') return [];
    const verknuepft = new Set(lokaleAllergien.map((a) => a.epaId).filter(Boolean));
    return listenlage.listen.allergien
      .filter(
        (e) =>
          !istKeineBekannteAllergie(e.eintrag) &&
          !verknuepft.has(e.eintrag.id) &&
          e.eintrag.klinischerStatus === 'aktiv' &&
          e.eintrag.gewissheit !== 'irrtümlich',
      )
      .map((e) =>
        allergieFuerAmts(
          e.eintrag,
          `Allergienliste der ePA, eingetragen von ${e.chronik.angelegtVon}`,
        ),
      );
  }, [listenlage, lokaleAllergien]);

  return useMemo(() => {
    const allergien: DokumentierteAllergie[] = [
      ...lokaleAllergien.map((a) => allergieFuerAmts(a, 'Allergien der Praxis')),
      ...epaAllergien,
      ...lokaleDokumente.flatMap((d) =>
        dokumentinhaltLesen(d.inhalt).allergien.map((r) =>
          allergieAusFhir(r, `${d.titel} (übernommen)`),
        ),
      ),
    ];
    const egfr = laborwerteAusDokumenten(lokaleDokumente)
      .filter((w) => w.loinc === '62238-1')
      .sort((a, b) => b.erhobenAm.localeCompare(a.erhobenAm))[0];
    return {
      allergien,
      egfr: egfr ? Number(egfr.wert.replace(',', '.')) : null,
      egfrGrundlage: egfr
        ? `Laborbefund ${egfr.herkunft.quelle} vom ${deutschesDatum(egfr.erhobenAm)}`
        : null,
    };
  }, [lokaleAllergien, epaAllergien, lokaleDokumente]);
}
