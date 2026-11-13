import { useEffect, useRef, useState } from 'react';
import {
  diagnosenAbgleichen,
  diagnosenAutomatikPlanen,
  istGegenwaertig,
  type Automatikschritt,
  type Patient,
} from '@demo-pvs/kern';
import {
  ausfuehren,
  lesen,
  useAuswahl,
  useZustand,
  type Vorgang,
} from '../../speicher/speicher.js';
import { vorgaenge } from '../../speicher/vorgaenge.js';
import type { Automatikvermerk } from '../../speicher/zustand.js';
import { EINRICHTUNG, betriebsstandErhoehen } from '../../epa/klient.js';
import { inDieListeAufnehmen, inDieListeUebertragen, useEpaListen } from '../../epa/listen.js';

/**
 * ✦ Automatische Übertragung der Diagnosen (ADR 0062): führt aus, was der Kern für den gewählten
 * Weg plant — ohne ärztliche Handlung, sobald die Listen der Person geladen sind, also auch dann,
 * wenn niemand die Diagnosen geöffnet hat. Jeder Schritt wird vermerkt.
 *
 * Eingehängt in der Patientenkartei. Im geführten Weg fragt der Hook nichts ab.
 */

/** Was das Praxissystem von selbst tut, ist keine Handlung der Praxis — es zählt nicht mit. */
const still = (v: Vorgang): Vorgang => ({ ...v, zaehltNicht: true });

const schluessel = (s: Automatikschritt) =>
  [s.art, s.lokal?.id ?? '-', s.epa?.id ?? '-', s.epa?.epaFassung ?? '-'].join(':');

export function useDiagnosenautomatik(patient: Patient | undefined): void {
  const weg = useZustand((z) => z.diagnosenweg);
  const umfang = useZustand((z) => z.diagnosenumfang);
  const patientId = patient?.id ?? '';
  const lokal = useAuswahl(
    (z) => z.diagnosen.filter((d) => d.patientId === patientId),
    [patientId],
  );
  const { lage } = useEpaListen(weg === 'gefuehrt' ? undefined : patient);
  const listen = lage.art === 'bereit' ? lage.listen : null;

  const laeuft = useRef(false);
  // Was schon versucht wurde — ein abgelehnter Schritt wird nicht endlos wiederholt.
  const versucht = useRef(new Set<string>());
  const [durchlauf, setzeDurchlauf] = useState(0);

  useEffect(() => {
    if (weg === 'gefuehrt' || !listen || !patient || laeuft.current) return;
    const zeilen = diagnosenAbgleichen(
      lokal,
      listen.diagnosen.map((e) => e.eintrag),
    );
    const schritte = diagnosenAutomatikPlanen(zeilen, weg, umfang).filter(
      (s) => !versucht.current.has(schluessel(s)),
    );
    if (schritte.length === 0) return;

    laeuft.current = true;
    void (async () => {
      const kvnr = patient.versicherung.kvnr;
      const person = lesen().nutzer.name;
      let lesenachweis = listen.lesenachweis.Condition;
      let geschrieben = false;
      const vermerke: Omit<Automatikvermerk, 'id' | 'zeitpunkt' | 'angezeigtAm'>[] = [];

      for (const s of schritte) {
        versucht.current.add(schluessel(s));
        const eintrag = s.epa ? listen.diagnosen.find((e) => e.eintrag.id === s.epa?.id) : null;
        let diagnoseId = s.lokal?.id ?? null;
        try {
          if (s.art === 'in-die-praxis' && s.epa) {
            ausfuehren(
              still(
                vorgaenge.diagnoseAusEpaUebernehmen(
                  patient.id,
                  s.epa,
                  `Diagnosenliste der ePA, angelegt von ${eintrag?.chronik.angelegtVon ?? 'unbekannt'} — automatisch übernommen`,
                ),
              ),
            );
            diagnoseId =
              lesen().diagnosen.find((d) => d.patientId === patient.id && d.epaId === s.epa?.id)
                ?.id ?? null;
          } else if (
            (s.art === 'verknuepfen' || s.art === 'epa-stand' || s.art === 'berichtigt') &&
            s.lokal &&
            s.epa
          ) {
            ausfuehren(still(vorgaenge.diagnoseNachEpaAngleichen(s.lokal.id, s.epa)));
          } else if (s.art === 'in-die-epa' && s.lokal) {
            const antwort = await inDieListeAufnehmen(
              kvnr,
              'Condition',
              lesenachweis,
              s.lokal,
              person,
              s.lokal.art === 'dauer' && istGegenwaertig(s.lokal.klinischerStatus),
            );
            lesenachweis = antwort.lesenachweis;
            geschrieben = true;
            ausfuehren(
              vorgaenge.listeneintragVerknuepfen(
                'diagnose',
                s.lokal.id,
                String(antwort.eintrag.id),
                antwort.eintrag.meta?.versionId ?? '1',
                true,
              ),
            );
          } else if (s.art === 'aenderung-in-die-epa' && s.lokal && eintrag) {
            const antwort = await inDieListeUebertragen(
              kvnr,
              'Condition',
              lesenachweis,
              s.lokal,
              eintrag.ressource,
              person,
            );
            lesenachweis = antwort.lesenachweis;
            geschrieben = true;
            ausfuehren(
              vorgaenge.listeneintragVerknuepfen(
                'diagnose',
                s.lokal.id,
                String(antwort.eintrag.id),
                antwort.eintrag.meta?.versionId ?? '1',
                true,
              ),
            );
          } else {
            continue;
          }
        } catch {
          // Die Ablehnung steht im Aufrufprotokoll. Der Lesenachweis kann veraltet sein — die
          // übrigen Schritte plant der nächste Durchlauf mit dem neu geladenen Stand.
          geschrieben = true;
          break;
        }
        const quelle = s.lokal ?? s.epa;
        // Wessen Eintrag oder Änderung übernommen wurde: beim Übernehmen und Verknüpfen, wer
        // angelegt hat; bei einer Änderung, wer zuletzt geändert hat.
        const fremd = !eintrag
          ? null
          : s.art === 'in-die-praxis' || s.art === 'verknuepfen'
            ? eintrag.eigener
              ? null
              : eintrag.chronik.angelegtVon
            : eintrag.chronik.zuletztVonTelematikId === EINRICHTUNG.telematikId
              ? null
              : eintrag.chronik.zuletztVon;
        vermerke.push({
          patientId: patient.id,
          art: s.art,
          diagnoseId,
          code: quelle?.code ?? '',
          bezeichnung: quelle?.bezeichnung ?? '',
          einrichtung: s.art === 'in-die-epa' || s.art === 'aenderung-in-die-epa' ? null : fremd,
        });
      }

      ausfuehren(vorgaenge.automatikVermerken(vermerke));
      laeuft.current = false;
      // Nach einer Schreibung fragen alle offenen Ansichten die Listen neu ab.
      if (geschrieben) betriebsstandErhoehen();
      setzeDurchlauf((n) => n + 1);
    })();
  }, [weg, umfang, listen, lokal, patient, durchlauf]);
}
