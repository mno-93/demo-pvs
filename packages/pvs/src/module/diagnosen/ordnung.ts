import type { Chronik, Ordnungsangaben, Sortierung } from '@demo-pvs/kern';
import { ausfuehren, useAuswahl } from '../../speicher/speicher.js';
import { vorgaenge } from '../../speicher/vorgaenge.js';
import type { Listenordnung } from '../../speicher/zustand.js';
import type { Ordnung } from './Splitscreen.js';

/**
 * Die Ordnung einer Liste für eine Person — gemerkt im Praxissystem, gemeinsam für Splitscreen
 * und ePA-Fenster (ADR 0029). Voreingestellt: Einstellung, neueste zuerst.
 */
export function useOrdnung(patientId: string, liste: Listenordnung['liste']): Ordnung {
  const gemerkt = useAuswahl(
    (z) => z.listenordnung.find((o) => o.patientId === patientId && o.liste === liste),
    [patientId, liste],
  );
  const sortierung: Sortierung = gemerkt?.sortierung ?? 'eingestellt-neu';
  const reihenfolge = gemerkt?.reihenfolge ?? [];
  return {
    sortierung,
    reihenfolge,
    sortierungSetzen: (s) =>
      ausfuehren(vorgaenge.listenordnungSetzen({ patientId, liste, sortierung: s, reihenfolge })),
    reihenfolgeSetzen: (kennungen) =>
      ausfuehren(
        vorgaenge.listenordnungSetzen({
          patientId,
          liste,
          sortierung: 'eigene',
          reihenfolge: kennungen,
        }),
      ),
  };
}

/**
 * Ordnungsangaben eines Eintrags. Eingestellt ist ein Eintrag der ePA, wenn er in die Liste kam;
 * ein Eintrag nur der Praxis, wenn er dokumentiert wurde.
 */
export function ordnungsangaben(
  lokal: { id: string; dokumentiertAm: string } | null,
  epa: { id: string } | null,
  chronik: Chronik | null,
  beginn: string,
  bezeichnung: string,
): Ordnungsangaben {
  return {
    kennungen: [epa?.id, lokal?.id].filter((k): k is string => !!k),
    eingestelltAm: chronik?.angelegtAm || lokal?.dokumentiertAm || '',
    beginn,
    bezeichnung,
  };
}
