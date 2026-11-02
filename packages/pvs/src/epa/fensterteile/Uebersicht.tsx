import { type ReactNode } from 'react';
import {
  deutschesDatum,
  deutscherZeitpunkt,
  istKeineBekannteAllergie,
  type LokalesDokument,
} from '@demo-pvs/kern';
import { EINRICHTUNG, USER_AGENT } from '../klient.js';
import { istStrukturiert, type Dokumentverweis } from '../epa-bestand.js';
import { useBefugnis } from '../befugnis.js';
import { type EpaListen } from '../listen.js';
import { epaBereichWaehlen, type EpaBereich } from '../fenster.js';
import { Medikation, Abschnitt } from './Teile.js';

/** Bereich „Übersicht“ des ePA-Fensters: Kacheln je Bestand, Zugriff und letzte Aufrufe. */

export function Uebersicht({
  kvnr,
  patientId,
  verweise,
  laedt,
  lokalNachEpaId,
  medikation,
  listen,
  summaryAbschnitte,
}: {
  kvnr: string;
  patientId: string;
  verweise: Dokumentverweis[];
  laedt: boolean;
  lokalNachEpaId: Map<string, LokalesDokument>;
  medikation: Medikation | null;
  listen: EpaListen | null;
  summaryAbschnitte: { gefuellt: number; gesamt: number } | null;
}) {
  const befugnis = useBefugnis(patientId);
  const neu = verweise.filter((v) => !lokalNachEpaId.has(v.id)).length;
  const befunde = verweise.filter((v) => v.typ?.code === 'BEFU');
  const strukturiert = verweise.filter(istStrukturiert).length;
  const plan = medikation?.[1];
  const kachel = (ziel: EpaBereich, titel: string, zahl: ReactNode, text: string) => (
    <button type="button" className="epa-kachel" onClick={() => epaBereichWaehlen(ziel)}>
      <span className="epa-kachel-titel">{titel}</span>
      <span className="epa-kachel-zahl">{zahl}</span>
      <span className="leise-klein">{text}</span>
    </button>
  );
  return (
    <>
      <div className="epa-kacheln">
        {summaryAbschnitte &&
          kachel(
            'summary',
            'Patient Summary',
            `${summaryAbschnitte.gefuellt}/${summaryAbschnitte.gesamt}`,
            'Abschnitte mit Inhalt',
          )}
        {kachel(
          'dokumente',
          'Dokumente',
          laedt ? '…' : verweise.length,
          `${neu} neu für die Praxis`,
        )}
        {kachel(
          'medikation',
          'Medikationsplan',
          plan ? plan.eintraege.length : '…',
          plan?.stand ? `Stand ${deutscherZeitpunkt(plan.stand)}` : 'Einträge',
        )}
        {listen?.verfuegbar &&
          kachel(
            'listen',
            'Diagnosen · Allergien',
            `${listen.diagnosen.length} · ${listen.allergien.filter((a) => !istKeineBekannteAllergie(a.eintrag)).length}`,
            'Einträge',
          )}
        {kachel(
          'labor',
          'Laborbefunde',
          laedt ? '…' : befunde.length,
          befunde.some(istStrukturiert) ? 'strukturiert' : 'als PDF',
        )}
        {kachel(
          'inhalte',
          'Inhalte aus Dokumenten',
          laedt ? '…' : strukturiert,
          'strukturierte Dokumente',
        )}
      </div>

      <Abschnitt titel="Zugriff">
        <dl className="befund-kopf">
          <div>
            <dt>Akte</dt>
            <dd>
              <span className="code">x-insurantid: {kvnr}</span>
            </dd>
          </div>
          <div>
            <dt>Client</dt>
            <dd>
              <span className="code">x-useragent: {USER_AGENT}</span>
            </dd>
          </div>
          <div>
            <dt>Einrichtung</dt>
            <dd>
              {EINRICHTUNG.anzeige} · <span className="code">{EINRICHTUNG.telematikId}</span>
            </dd>
          </div>
          <div>
            <dt>Befugnis</dt>
            <dd>
              {befugnis
                ? `bis ${deutschesDatum(befugnis.gueltigBis.slice(0, 10))} (eGK eingelesen am ${deutschesDatum(befugnis.erteiltAm.slice(0, 10))})`
                : '—'}
            </dd>
          </div>
        </dl>
      </Abschnitt>
    </>
  );
}

/* ---------- Dokumente ---------- */
