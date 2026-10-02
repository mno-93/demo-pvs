import { useMemo, useState } from 'react';
import {
  CODESYSTEM,
  deutschesDatum,
  impfstoffe,
  impfungNachFhir,
  type Impfung,
  type ImpfstoffEintrag,
} from '@demo-pvs/kern';
import { ausfuehren, lesen, useAuswahl, useZustand } from '../speicher/speicher.js';
import { neueId, vorgaenge } from '../speicher/vorgaenge.js';
import { Bestandsband, Karte, Leer, Marker } from '../bausteine/Bausteine.js';
import { Katalogsuche } from '../bausteine/Katalogsuche.js';
import { usePatientId } from './Patientenkartei.js';
import { EpaFehler } from '../epa/klient.js';
import { istGueltig, useBefugnis, useEinlesungen } from '../epa/befugnis.js';
import { fehlerTitel, useBetriebsstand, useEpaAbfrage } from '../epa/epa-bestand.js';
import { Abrufstand } from '../epa/aktenstatus.js';
import { impflisteLaden, inDieImpfliste, type Impflisteneintrag } from '../epa/impfliste.js';
import {
  NeuMarke,
  SeitLetztemAufrufBand,
  gesehenAusListe,
  useSeitLetztemAufruf,
} from '../epa/gesehen.js';
import { Herkunftszeile } from './diagnosen/Splitscreen.js';

/**
 * Impfungen — Praxis und ✦ Impfliste der ePA nebeneinander (ADR 0026).
 *
 * Links, was die Praxis dokumentiert hat; rechts die Impfliste der ePA mit Herkunft. Eine
 * Impfung der Praxis geht mit „in die ePA →" in die Liste, eine der Liste mit „← in die Praxis"
 * in die Praxis — danach sind beide verknüpft. Neue Impfungen werden in der Erfassung
 * vorbelegt in die Impfliste gestellt: kein zweiter Dokumentationsschritt.
 */
export function Impfungen() {
  const patientId = usePatientId();
  const patient = useAuswahl((z) => z.patienten.find((p) => p.id === patientId), [patientId]);
  const lokale = useAuswahl(
    (z) =>
      z.impfungen
        .filter((i) => i.patientId === patientId)
        .sort((a, b) => b.datum.localeCompare(a.datum)),
    [patientId],
  );
  const nutzer = useZustand((z) => z.nutzer);
  const darfSchreiben = nutzer.rolle === 'aerztin';
  const kvnr = patient?.versicherung.kvnr ?? '';
  const befugt = istGueltig(useBefugnis(patientId));
  const einlesungen = useEinlesungen();
  const betriebsstand = useBetriebsstand();
  const abfrage = useEpaAbfrage(
    () => impflisteLaden(kvnr, patientId),
    [kvnr, patientId, einlesungen, betriebsstand],
    befugt && !!kvnr,
  );
  const liste = abfrage.daten?.verfuegbar ? abfrage.daten : null;
  const gesehen = useMemo(() => (liste ? gesehenAusListe(liste.eintraege) : null), [liste]);
  const seit = useSeitLetztemAufruf(patientId, 'Immunization', gesehen);
  const [meldung, setzeMeldung] = useState<{ gut: boolean; text: string } | null>(null);
  const [laeuft, setzeLaeuft] = useState(false);

  const epaEintraege = [...(liste?.eintraege ?? [])].sort((a, b) =>
    b.impfung.datum.localeCompare(a.impfung.datum),
  );
  const verknuepft = new Set(lokale.map((i) => i.epaId).filter(Boolean));

  async function handlung(schritt: () => Promise<unknown>, erfolg: string) {
    setzeLaeuft(true);
    try {
      await schritt();
      setzeMeldung({ gut: true, text: erfolg });
    } catch (f) {
      setzeMeldung({
        gut: false,
        text:
          f instanceof EpaFehler && f.status === 409
            ? 'Die Impfliste wurde inzwischen von einer anderen Einrichtung geändert. Sie ist neu geladen — bitte erneut ausführen.'
            : f instanceof EpaFehler
              ? `${f.status}: ${f.diagnose}`
              : 'Der Vorgang ist fehlgeschlagen.',
      });
    }
    setzeLaeuft(false);
    abfrage.neuLaden();
  }

  const inDieEpa = (i: Impfung) =>
    void handlung(async () => {
      const { eintrag } = await inDieImpfliste(kvnr, liste?.lesenachweis ?? null, i);
      ausfuehren(vorgaenge.impfungVerknuepfen(i.id, String(eintrag.id), true));
    }, 'In die Impfliste der ePA gestellt.');

  const inDiePraxis = (e: Impflisteneintrag) => {
    ausfuehren(
      vorgaenge.impfungAusEpaUebernehmen(
        patientId,
        e.impfung,
        `Impfliste der ePA · ${e.chronik.angelegtVon}`,
      ),
    );
    setzeMeldung({ gut: true, text: 'In die Praxis übernommen.' });
  };

  // Impfschutz auf einen Blick: je Krankheit die jüngste Impfung, aus Praxis und ePA.
  const zuletzt = useMemo(() => {
    const alle = [...lokale, ...epaEintraege.map((e) => e.impfung)].filter(
      (i) => i.status === 'erfolgt',
    );
    const je = new Map<string, string>();
    for (const i of alle) {
      for (const k of i.zielkrankheiten) {
        if ((je.get(k.anzeige) ?? '') < i.datum) je.set(k.anzeige, i.datum);
      }
    }
    return [...je.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [lokale, epaEintraege]);

  if (!patient) return null;

  return (
    <>
      <Bestandsband lage="beides" />

      <div className={`abgleichband ${liste ? 'synchron' : 'veraltet'}`} role="status">
        <span className="abgleichband-punkt" aria-hidden="true" />
        <span>
          {liste
            ? 'Impfliste der ePA'
            : !befugt
              ? 'Keine Befugnis für die ePA dieser Person.'
              : abfrage.fehler
                ? fehlerTitel(abfrage.fehler)
                : abfrage.laedt
                  ? 'Wird abgefragt …'
                  : 'Die ePA bietet keine Impfliste.'}
        </span>
        <span className="rechts reihe">
          <Abrufstand
            geladenUm={abfrage.geladenUm}
            laedt={abfrage.laedt}
            neuLaden={abfrage.neuLaden}
          />
        </span>
      </div>

      <SeitLetztemAufrufBand seit={seit} liste="Impfliste" />
      {meldung && (
        <div className={`hinweisbox ${meldung.gut ? 'gut' : 'fehler'}`} role="status">
          {meldung.text}
        </div>
      )}

      {zuletzt.length > 0 && (
        <div className="reihe" style={{ marginBottom: 10 }} aria-label="Zuletzt geimpft gegen">
          {zuletzt.map(([krankheit, datum]) => (
            <Marker key={krankheit} ton="neutral">
              {krankheit} {deutschesDatum(datum)}
            </Marker>
          ))}
        </div>
      )}

      <div className="spalten">
        <div>
          <Karte titel={`Praxis (${lokale.length})`}>
            {lokale.length === 0 ? (
              <Leer>Keine Impfungen dokumentiert.</Leer>
            ) : (
              lokale.map((i) => (
                <div key={i.id} className="impfung">
                  <Impfzeile impfung={i} />
                  <div className="reihe" style={{ gap: 6 }}>
                    {i.epaId ? (
                      <Marker ton="gut">in der Impfliste</Marker>
                    ) : (
                      <Marker ton="warn">nur in der Praxis</Marker>
                    )}
                    {!i.epaId && liste && darfSchreiben && (
                      <button
                        type="button"
                        className="knopf klein"
                        disabled={laeuft}
                        onClick={() => inDieEpa(i)}
                      >
                        in die ePA →
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </Karte>
        </div>
        <div>
          <Karte titel={`Impfliste der ePA ✦ (${epaEintraege.length})`}>
            {!liste ? (
              <div className="split-grund">
                <b>
                  {!befugt
                    ? 'Keine Befugnis.'
                    : abfrage.laedt
                      ? 'Wird abgefragt …'
                      : 'Keine Impfliste in diesem Ausbaustand.'}
                </b>
              </div>
            ) : epaEintraege.length === 0 ? (
              <Leer>Keine Impfungen in der Impfliste.</Leer>
            ) : (
              epaEintraege.map((e) => (
                <div key={String(e.ressource.id)} className="impfung epa">
                  <div>
                    <NeuMarke seit={seit} ressource={e.ressource} />
                    <Herkunftszeile chronik={e.chronik} />
                  </div>
                  <Impfzeile impfung={e.impfung} />
                  <div className="reihe" style={{ gap: 6 }}>
                    {verknuepft.has(String(e.ressource.id)) ? (
                      <Marker ton="gut">in der Praxis</Marker>
                    ) : (
                      <button type="button" className="knopf klein" onClick={() => inDiePraxis(e)}>
                        ← in die Praxis
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </Karte>
        </div>
      </div>

      {darfSchreiben && (
        <NeueImpfung
          heute={lesen().heute}
          kvnr={kvnr}
          listeDa={!!liste}
          speichern={(i, inDieListe) => {
            const id = neueId('impf');
            ausfuehren(vorgaenge.impfungAnlegen({ ...i, patientId }, id));
            const angelegt = lesen().impfungen.find((x) => x.id === id);
            if (inDieListe && angelegt) inDieEpa(angelegt);
            else setzeMeldung({ gut: true, text: 'Impfung dokumentiert.' });
          }}
        />
      )}
    </>
  );
}

function Impfzeile({ impfung: i }: { impfung: Impfung }) {
  return (
    <div className="impfung-inhalt">
      <div className="reihe">
        <b>{i.impfstoff.bezeichnung}</b>
        {i.dosis && <Marker ton="neutral">{i.dosis}. Dosis</Marker>}
        {i.status === 'fehlerhaft' && <Marker ton="fehler">fehlerhaft</Marker>}
      </div>
      <div className="leise-klein">
        {deutschesDatum(i.datum)} · {i.zielkrankheiten.map((k) => k.anzeige).join(', ')}
        {i.charge ? ` · Charge ${i.charge}` : ''} · {i.geimpftVon}
      </div>
    </div>
  );
}

function NeueImpfung({
  heute,
  kvnr,
  listeDa,
  speichern,
}: {
  heute: string;
  kvnr: string;
  listeDa: boolean;
  speichern: (
    i: Omit<Impfung, 'id' | 'herkunft' | 'epaId' | 'status' | 'patientId'>,
    inDieListe: boolean,
  ) => void;
}) {
  const [stoff, setzeStoff] = useState<ImpfstoffEintrag | null>(null);
  const [datum, setzeDatum] = useState(heute);
  const [dosis, setzeDosis] = useState('');
  const [charge, setzeCharge] = useState('');
  const [inDieListe, setzeInDieListe] = useState(true);
  const nutzer = useZustand((z) => z.nutzer);
  const angaben = useMemo(
    () =>
      stoff && {
        impfstoff: {
          bezeichnung: stoff.bezeichnung,
          atc: stoff.atc,
          atcVersion: stoff.atcVersion,
          pzn: stoff.pzn,
        },
        zielkrankheiten: stoff.zielkrankheiten.map((k) => ({
          system: CODESYSTEM.snomed,
          code: k.code,
          anzeige: k.anzeige,
        })),
        datum,
        dosis: dosis ? Number(dosis) : null,
        charge: charge.trim() || null,
        geimpftVon: nutzer.name,
        notiz: null,
      },
    [stoff, datum, dosis, charge, nutzer.name],
  );
  const vorschau = useMemo(
    () =>
      angaben &&
      impfungNachFhir(
        {
          ...angaben,
          id: 'vorschau',
          patientId: 'vorschau',
          status: 'erfolgt',
          epaId: null,
          herkunft: {
            bestand: 'lokal',
            quelle: 'Hausarztpraxis am Stadtgarten',
            zeitpunkt: `${datum}T00:00:00`,
            verantwortlich: nutzer.name,
            dokumentId: null,
          },
        },
        kvnr,
      ),
    [angaben, datum, nutzer.name, kvnr],
  );
  return (
    <Karte titel="Impfung dokumentieren">
      {!stoff ? (
        <Katalogsuche
          beschriftung="Impfstoff suchen"
          eintraege={impfstoffe}
          schluesselVon={(i) => i.pzn}
          bezeichnungVon={(i) =>
            `${i.bezeichnung} — ${i.zielkrankheiten.map((k) => k.anzeige).join(', ')}`
          }
          beiAuswahl={setzeStoff}
          platzhalter="Impfstoff oder Krankheit, z. B. Influenza"
        />
      ) : (
        <>
          <div className="reihe" style={{ marginBottom: 8 }}>
            <b>{stoff.bezeichnung}</b>
            <span className="leise-klein">
              ATC {stoff.atc} · gegen {stoff.zielkrankheiten.map((k) => k.anzeige).join(', ')}
            </span>
            <button type="button" className="knopf klein rechts" onClick={() => setzeStoff(null)}>
              anderer Impfstoff
            </button>
          </div>
          <div className="feldreihe">
            <div className="feldzeile" style={{ flex: '0 1 170px' }}>
              <label htmlFor="imp-datum">Datum</label>
              <input
                id="imp-datum"
                type="date"
                value={datum}
                onChange={(e) => setzeDatum(e.target.value)}
              />
            </div>
            <div className="feldzeile" style={{ flex: '0 1 110px' }}>
              <label htmlFor="imp-dosis">Dosis</label>
              <input
                id="imp-dosis"
                type="number"
                min={1}
                max={9}
                value={dosis}
                onChange={(e) => setzeDosis(e.target.value)}
              />
            </div>
            <div className="feldzeile" style={{ flex: '1 1 160px' }}>
              <label htmlFor="imp-charge">Charge</label>
              <input
                id="imp-charge"
                type="text"
                value={charge}
                onChange={(e) => setzeCharge(e.target.value)}
              />
            </div>
          </div>
          <label className={`relevanzwahl ${listeDa ? '' : 'gesperrt'}`}>
            <input
              type="checkbox"
              checked={listeDa && inDieListe}
              disabled={!listeDa}
              onChange={(e) => setzeInDieListe(e.target.checked)}
            />
            <span>
              <b>In der Impfliste der ePA führen</b>{' '}
              <span className="vorschlagsmarke">✦ Vorschlag</span>
            </span>
          </label>
          <button
            type="button"
            className="knopf stark"
            disabled={!datum}
            onClick={() => {
              if (!angaben) return;
              speichern(angaben, listeDa && inDieListe);
              setzeStoff(null);
              setzeDosis('');
              setzeCharge('');
            }}
          >
            Impfung speichern
          </button>
          <details className="aufklapper">
            <summary>FHIR-Vorschau — Immunization nach immunization-eu-core</summary>
            <pre className="code-block">{JSON.stringify(vorschau, null, 2)}</pre>
          </details>
        </>
      )}
    </Karte>
  );
}
