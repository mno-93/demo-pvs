import { useEffect, useMemo, useRef } from 'react';
import {
  aenderungenSeit,
  anzahlAenderungen,
  chronikLesen,
  deutscherZeitpunkt,
  fassungsstandBilden,
  KEINE_AENDERUNGEN,
  type Aenderungen,
  type GesehenerEintrag,
  type Ressource,
} from '@demo-pvs/kern';
import { ausfuehren, lesen } from '../speicher/speicher.js';
import { vorgaenge } from '../speicher/vorgaenge.js';
import type { EpaGesehen, EpaSicht } from '../speicher/zustand.js';
import { EINRICHTUNG } from './klient.js';

/**
 * „Neu seit dem letzten Aufruf" für Sichten auf die ePA (ADR 0027).
 *
 * Beim Aufruf vergleicht die Sicht, was die ePA jetzt liefert, mit dem, was die Praxis beim
 * letzten Aufruf gesehen hat, und merkt sich danach den neuen Stand. Gemeldet werden nur
 * Änderungen anderer Einrichtungen. Grundlage sind Kennung und `meta.versionId` je Eintrag und
 * die Einrichtung der letzten Änderung aus den Änderungseinträgen — nichts, was die ePA nicht
 * ohnehin liefert.
 */

/** Einträge einer Antwort als „gesehene Einträge". */
export function gesehenAus(
  ressourcen: readonly Ressource[],
  provenance: readonly Ressource[],
): GesehenerEintrag[] {
  return ressourcen.map((r) => {
    const chronik = chronikLesen(r, provenance);
    return {
      schluessel: `${r.resourceType}/${String(r.id)}`,
      fassung: r.meta?.versionId ?? '1',
      vonAnderen: chronik.zuletztVonTelematikId !== EINRICHTUNG.telematikId,
    };
  });
}

/** Einträge einer Liste, deren Chronik schon gelesen ist. */
export function gesehenAusListe(
  eintraege: readonly { ressource: Ressource; chronik: { zuletztVonTelematikId: string | null } }[],
): GesehenerEintrag[] {
  return eintraege.map((e) => ({
    schluessel: `${e.ressource.resourceType}/${String(e.ressource.id)}`,
    fassung: e.ressource.meta?.versionId ?? '1',
    vonAnderen: e.chronik.zuletztVonTelematikId !== EINRICHTUNG.telematikId,
  }));
}

export interface SeitLetztemAufruf {
  vorher: EpaGesehen | null;
  aenderungen: Aenderungen;
}

/**
 * Vergleicht mit dem Stand des letzten Aufrufs dieser Sicht und merkt sich den jetzigen. Der
 * Vergleich bleibt für die Dauer der Ansicht gegen den früheren Stand — auch nach einem
 * Neuladen.
 */
export function useSeitLetztemAufruf(
  patientId: string,
  sicht: EpaSicht,
  eintraege: readonly GesehenerEintrag[] | null,
): SeitLetztemAufruf {
  const vorher = useRef<{ schluessel: string; stand: EpaGesehen | null } | null>(null);
  const schluessel = `${patientId}|${sicht}`;
  if (eintraege && vorher.current?.schluessel !== schluessel) {
    vorher.current = {
      schluessel,
      stand: lesen().epaGesehen.find((g) => g.patientId === patientId && g.sicht === sicht) ?? null,
    };
  }
  const stand = vorher.current?.schluessel === schluessel ? vorher.current.stand : null;
  const aenderungen = useMemo(
    () => (eintraege ? aenderungenSeit(stand, eintraege) : KEINE_AENDERUNGEN),
    [eintraege, stand],
  );
  useEffect(() => {
    if (!eintraege) return;
    const heute = lesen().heute;
    const uhrzeit = new Date().toTimeString().slice(0, 8);
    ausfuehren(
      vorgaenge.epaGesehenMerken({
        patientId,
        sicht,
        ...fassungsstandBilden(eintraege, `${heute}T${uhrzeit}`),
      }),
    );
  }, [eintraege, patientId, sicht]);
  return { vorher: stand, aenderungen };
}

/** Band über einer Sicht: was sich seit dem letzten Aufruf geändert hat. */
export function SeitLetztemAufrufBand({
  seit,
  liste,
}: {
  seit: SeitLetztemAufruf;
  /** Name der Liste, wenn mehrere Bänder untereinander stehen. */
  liste?: string;
}) {
  const { vorher, aenderungen: a } = seit;
  if (!vorher || anzahlAenderungen(a) === 0) return null;
  return (
    <Aenderungsband
      liste={liste}
      am={vorher.am}
      teile={[
        a.neu.size > 0 ? `${a.neu.size} neu` : null,
        a.geaendert.size > 0 ? `${a.geaendert.size} geändert` : null,
        a.entfallen > 0 ? `${a.entfallen} entfallen` : null,
      ]}
      von={['andere Einrichtungen']}
    />
  );
}

/**
 * Gemeinsame Darstellung — für den Vergleich im Primärsystem (ADR 0027) wie für die
 * spezifizierte Abfrage „seit" (ADR 0030).
 */
export function Aenderungsband({
  liste,
  am,
  teile,
  von,
}: {
  liste?: string;
  am: string;
  teile: (string | null)[];
  von: string[];
}) {
  const sichtbar = teile.filter(Boolean);
  if (sichtbar.length === 0) return null;
  return (
    <div className="seit-band" role="status">
      <b>
        {liste ? `${liste} — seit` : 'Seit'} dem letzten Aufruf am {deutscherZeitpunkt(am)}:
      </b>{' '}
      {sichtbar.join(' · ')} <span className="leise-klein">({von.join(', ')})</span>
    </div>
  );
}

/** Marke an einem Eintrag, der seit dem letzten Aufruf neu ist oder sich geändert hat. */
export function NeuMarke({ seit, ressource }: { seit: SeitLetztemAufruf; ressource: Ressource }) {
  const s = `${ressource.resourceType}/${String(ressource.id)}`;
  if (seit.aenderungen.neu.has(s)) return <span className="neu-marke">neu</span>;
  if (seit.aenderungen.geaendert.has(s)) return <span className="neu-marke">geändert</span>;
  return null;
}
