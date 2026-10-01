import { useMemo, useState } from 'react';
import {
  ABGLEICHSTATUS_BEZEICHNUNG,
  DOKUMENTURSPRUNG_BEZEICHNUNG,
  abgleichZaehlen,
  deutschesDatum,
  deutscherZeitpunkt,
  dokumenteAbgleichen,
  dokumentinhaltLesen,
  type Abgleichzeile,
  type Dokumentart,
} from '@demo-pvs/kern';
import { ausfuehren, useAuswahl, useZustand } from '../speicher/speicher.js';
import { vorgaenge } from '../speicher/vorgaenge.js';
import { Bestandsband, Karte, Leer, Marker } from '../bausteine/Bausteine.js';
import { DokumentBetrachter } from '../bausteine/DokumentBetrachter.js';
import { usePatientId } from './Patientenkartei.js';
import {
  EINRICHTUNG,
  EpaFehler,
  dokumentAbrufen,
  dokumenteMitStand,
  dokumenteSeit,
} from '../epa/klient.js';
import { useLesezeichen } from '../epa/lesezeichen.js';
import { Aenderungsband } from '../epa/gesehen.js';
import {
  alsEpaDokument,
  dokumentverweisLesen,
  useEpaAbfrage,
  type Dokumentverweis,
} from '../epa/epa-bestand.js';
import { Abrufstand } from '../epa/aktenstatus.js';
import { epaFensterOeffnen } from '../epa/fenster.js';
import { protokollUmschalten } from '../epa/protokoll.js';

/**
 * Dokumentenablage des Praxissystems und ihr Abgleich mit der ePA.
 *
 * Die Frage, die diese Ansicht beantworten muss, ist die des Praxisalltags: Was ist neu?
 * Deshalb steht bei jedem Dokument, in welchem Bestand es liegt — und deshalb sind Ansehen
 * und Übernehmen zwei verschiedene Handlungen. Ein Blick in ein Dokument soll die lokale
 * Ablage nicht anwachsen lassen.
 *
 * Die ePA wird über den MHD Service gelesen: ITI-67 für die Liste, ITI-68 für den Inhalt.
 * Einstellen ginge nur über XDS ITI-41 (SOAP) und ist nicht nachgebildet.
 *
 * Was seit dem letzten Aufruf eingestellt wurde, fragt die Ansicht mit `_lastUpdated` ab — dem
 * Suchparameter, den der IG verbindlich vorsieht (ADR 0030).
 */

const STATUS_TON = {
  'nur-in-epa': 'warn',
  'in-beiden': 'gut',
  'nur-lokal': 'lokal',
  'lokal-eingestellt': 'akzent',
} as const;

const ARTEN: Dokumentart[] = [
  'Arztbrief',
  'Entlassbrief',
  'Laborbefund',
  'Befundbericht',
  'Bescheinigung',
  'Scan',
  'Sonstiges',
];

export function Dokumente() {
  const patientId = usePatientId();
  const patient = useAuswahl((z) => z.patienten.find((p) => p.id === patientId), [patientId]);
  const lokale = useAuswahl(
    (z) => z.dokumente.filter((d) => d.patientId === patientId),
    [patientId],
  );
  const kvnr = patient?.versicherung.kvnr ?? '';

  const lesezeichen = useLesezeichen(patientId, 'dokumente');
  const abfrage = useEpaAbfrage(async () => {
    const { verweise, stand } = await dokumenteMitStand(kvnr);
    const vorher = lesezeichen.vorher;
    // Neu seit dem letzten Aufruf: nur, was andere Einrichtungen eingestellt haben.
    const neu = vorher
      ? (await dokumenteSeit(kvnr, vorher.zeitpunkt))
          .map(dokumentverweisLesen)
          .filter((d) => !d.autor.includes(EINRICHTUNG.anzeige))
      : [];
    lesezeichen.merken(stand);
    return {
      verweise: verweise.map(dokumentverweisLesen),
      seit: vorher
        ? {
            am: vorher.zeitpunkt,
            neu: new Set(neu.map((d) => d.id)),
            von: [...new Set(neu.map((d) => d.autor.split(', ').pop() ?? ''))],
          }
        : null,
    };
  }, [kvnr]);
  const verweise = useMemo(() => abfrage.daten?.verweise ?? [], [abfrage.daten]);
  const seit = abfrage.daten?.seit ?? null;
  const laedt = abfrage.laedt;
  const fehler = abfrage.fehler?.text ?? null;
  const [ansicht, setzeAnsicht] = useState<{
    titel: string;
    inhalt: unknown;
    ausAkte: boolean;
    dokumentId: string;
  } | null>(null);
  const [meldung, setzeMeldung] = useState<string | null>(null);

  const zeilen = useMemo(
    () => dokumenteAbgleichen(verweise.map(alsEpaDokument), lokale),
    [verweise, lokale],
  );
  const zahlen = abgleichZaehlen(zeilen);
  const verweisZu = (zeile: Abgleichzeile): Dokumentverweis | undefined =>
    verweise.find((v) => v.id === zeile.epaDokument?.id);

  async function ansehen(zeile: Abgleichzeile) {
    setzeMeldung(null);
    if (zeile.lokal) {
      setzeAnsicht({
        titel: zeile.titel,
        inhalt: zeile.lokal.inhalt,
        ausAkte: false,
        dokumentId: zeile.lokal.id,
      });
      return;
    }
    const verweis = verweisZu(zeile);
    if (!verweis) return;
    try {
      const inhalt = await dokumentAbrufen(kvnr, verweis.ressource);
      setzeAnsicht({ titel: zeile.titel, inhalt, ausAkte: true, dokumentId: verweis.id });
    } catch (f) {
      setzeMeldung(f instanceof EpaFehler ? f.diagnose : 'Das Dokument ließ sich nicht abrufen.');
    }
  }

  async function uebernehmen(zeile: Abgleichzeile) {
    setzeMeldung(null);
    const verweis = verweisZu(zeile);
    if (!verweis) return;
    try {
      const inhalt = await dokumentAbrufen(kvnr, verweis.ressource);
      ausfuehren(
        vorgaenge.dokumentUebernehmen(patientId, {
          epaId: verweis.id,
          titel: zeile.titel,
          art: artZuordnen(zeile.art, inhalt),
          datum: zeile.datum.slice(0, 10),
          einrichtung: zeile.einrichtung,
          autor: zeile.autor,
          inhalt,
          inhaltstyp: verweis.mimeType,
        }),
      );
    } catch (f) {
      setzeMeldung(
        f instanceof EpaFehler ? f.diagnose : 'Das Dokument ließ sich nicht übernehmen.',
      );
    }
  }

  if (!patient) return null;

  return (
    <>
      <Bestandsband lage="beides" />

      <Karte
        titel="Dokumentenablage"
        werkzeuge={
          <>
            <Abrufstand
              geladenUm={abfrage.geladenUm}
              laedt={abfrage.laedt}
              neuLaden={abfrage.neuLaden}
            />
            <button
              type="button"
              className="knopf klein"
              onClick={() => epaFensterOeffnen(patientId, 'dokumente')}
            >
              in der ePA öffnen
            </button>
            <button type="button" className="knopf klein" onClick={protokollUmschalten}>
              Aufrufe anzeigen
            </button>
          </>
        }
      >
        <div className="reihe" style={{ marginBottom: 8 }}>
          <Marker ton="neutral">{zahlen.gesamt} Dokumente insgesamt</Marker>
          <Marker ton="gut">{zahlen.lokalVorhanden} lokal vorhanden</Marker>
          <Marker ton="warn">{zahlen.nurInEpa} noch nicht lokal</Marker>
          <Marker ton="lokal">{zahlen.nurLokal} nur lokal</Marker>
          {laedt && (
            <span style={{ fontSize: '0.85em', color: 'var(--text-sehr-leise)' }}>
              Akte wird abgefragt …
            </span>
          )}
        </div>

        {seit && seit.neu.size > 0 && (
          <Aenderungsband
            am={seit.am}
            teile={[`${seit.neu.size} ${seit.neu.size === 1 ? 'Dokument' : 'Dokumente'} neu`]}
            von={seit.von}
          />
        )}
        {meldung && <div className="hinweisbox fehler">{meldung}</div>}
        {fehler && (
          <div className="hinweisbox fehler">
            <b>Die ePA konnte nicht abgefragt werden.</b>
            <div style={{ marginTop: 4 }}>{fehler}</div>
          </div>
        )}

        {zeilen.length === 0 ? (
          <Leer>
            Für diese Patientin oder diesen Patienten liegt kein Dokument vor — weder lokal noch in
            der ePA.
          </Leer>
        ) : (
          <table className="liste">
            <thead>
              <tr>
                <th>Datum</th>
                <th>Dokument</th>
                <th>Einrichtung</th>
                <th>Zustand</th>
                <th>Lokal seit</th>
                <th>
                  <span className="nur-fuer-screenreader">Aktionen</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {zeilen.map((zeile) => (
                <tr key={zeile.schluessel}>
                  <td>{deutschesDatum(zeile.datum)}</td>
                  <td>
                    <b>{zeile.titel}</b>
                    {zeile.epaDokument && seit?.neu.has(zeile.epaDokument.id) && (
                      <span className="neu-marke">neu</span>
                    )}
                    <div style={{ fontSize: '0.82em', color: 'var(--text-sehr-leise)' }}>
                      {zeile.art}
                      {zeile.lokal
                        ? ` · ${DOKUMENTURSPRUNG_BEZEICHNUNG[zeile.lokal.ursprung]}`
                        : ''}
                      {zeile.lokal?.notiz ? ` · ${zeile.lokal.notiz}` : ''}
                    </div>
                  </td>
                  <td>{zeile.einrichtung}</td>
                  <td>
                    <Marker ton={STATUS_TON[zeile.status]}>
                      {ABGLEICHSTATUS_BEZEICHNUNG[zeile.status]}
                    </Marker>
                    {zeile.erkanntUeber === 'dokumentkennung' && (
                      <div
                        className="leise-klein"
                        title="Derselbe Befund kam auf zwei Wegen: vom Labor und über die ePA. Erkannt an der Dokumentkennung (uniqueId)."
                      >
                        erkannt an der Dokumentkennung
                      </div>
                    )}
                  </td>
                  <td style={{ fontSize: '0.85em', color: 'var(--text-sehr-leise)' }}>
                    {zeile.lokal ? (
                      <>
                        {deutscherZeitpunkt(zeile.lokal.gespeichertAm)}
                        <div>{zeile.lokal.gespeichertVon}</div>
                        <div>{(zeile.lokal.groesseBytes / 1024).toFixed(0)} KB</div>
                      </>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td>
                    <div className="reihe" style={{ gap: 5 }}>
                      <button
                        type="button"
                        className="knopf klein"
                        onClick={() => void ansehen(zeile)}
                      >
                        Ansehen
                      </button>
                      {zeile.status === 'nur-in-epa' && (
                        <button
                          type="button"
                          className="knopf klein stark"
                          onClick={() => void uebernehmen(zeile)}
                        >
                          Übernehmen
                        </button>
                      )}
                      {zeile.lokal && zeile.status !== 'lokal-eingestellt' && (
                        <button
                          type="button"
                          className="knopf klein"
                          onClick={() => ausfuehren(vorgaenge.dokumentEntfernen(zeile.lokal!.id))}
                        >
                          lokal entfernen
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Karte>

      {ansicht && (
        <Karte
          titel={`Ansicht: ${ansicht.titel}`}
          werkzeuge={
            <button type="button" className="knopf klein" onClick={() => setzeAnsicht(null)}>
              schließen
            </button>
          }
        >
          <div className="reihe" style={{ marginBottom: 6 }}>
            <Marker ton={ansicht.ausAkte ? 'akzent' : 'lokal'}>
              {ansicht.ausAkte ? 'ePA' : 'Praxis'}
            </Marker>
          </div>
          <DokumentBetrachter
            inhalt={ansicht.inhalt}
            patientId={patientId}
            dokumentId={ansicht.dokumentId}
            bestand={ansicht.ausAkte ? 'epa' : 'lokal'}
          />
        </Karte>
      )}

      <Einscannen patientId={patientId} />
    </>
  );
}

/** Die Art ergibt sich zuerst aus dem Inhalt, sonst aus dem Typ laut Metadaten. */
function artZuordnen(art: string, inhalt: unknown): Dokumentart {
  const gelesen = dokumentinhaltLesen(inhalt).art;
  if (gelesen === 'Laborbefund') return 'Laborbefund';
  if (gelesen === 'Entlassbrief') return 'Entlassbrief';
  const treffer = ARTEN.find((a) => art.toLowerCase().includes(a.toLowerCase()));
  if (treffer) return treffer;
  if (art.toLowerCase().includes('arzt')) return 'Arztbrief';
  if (art.toLowerCase().includes('diagnostik')) return 'Befundbericht';
  return 'Sonstiges';
}

function Einscannen({ patientId }: { patientId: string }) {
  const heute = useZustand((z) => z.heute);
  const [titel, setzeTitel] = useState('');
  const [art, setzeArt] = useState<Dokumentart>('Scan');
  const [datum, setzeDatum] = useState(heute);
  const [notiz, setzeNotiz] = useState('');

  return (
    <Karte titel="Unterlage einscannen">
      <p style={{ fontSize: '0.9em', color: 'var(--text-leise)' }}>
        Der Scanvorgang ist simuliert: Die Demo legt einen Eintrag mit Metadaten an, keine
        Bilddaten. Er bleibt im Praxissystem und gelangt nicht von selbst in die ePA.
      </p>
      <div className="feldreihe">
        <div className="feldzeile" style={{ flex: '2 1 240px' }}>
          <label htmlFor="scan-titel">Bezeichnung</label>
          <input
            id="scan-titel"
            type="text"
            value={titel}
            placeholder="z. B. Befundbericht Kardiologie"
            onChange={(e) => setzeTitel(e.target.value)}
          />
        </div>
        <div className="feldzeile">
          <label htmlFor="scan-art">Art</label>
          <select
            id="scan-art"
            value={art}
            onChange={(e) => setzeArt(e.target.value as Dokumentart)}
          >
            {ARTEN.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </div>
        <div className="feldzeile">
          <label htmlFor="scan-datum">Dokumentdatum</label>
          <input
            id="scan-datum"
            type="date"
            value={datum}
            onChange={(e) => setzeDatum(e.target.value)}
          />
        </div>
      </div>
      <div className="feldzeile">
        <label htmlFor="scan-notiz">Notiz</label>
        <input
          id="scan-notiz"
          type="text"
          value={notiz}
          placeholder="freiwillig"
          onChange={(e) => setzeNotiz(e.target.value)}
        />
      </div>
      <button
        type="button"
        className="knopf stark"
        disabled={!titel.trim()}
        onClick={() => {
          ausfuehren(
            vorgaenge.dokumentEinscannen(patientId, {
              titel: titel.trim(),
              art,
              datum,
              notiz: notiz.trim() === '' ? null : notiz.trim(),
            }),
          );
          setzeTitel('');
          setzeNotiz('');
          setzeArt('Scan');
        }}
      >
        In die Ablage aufnehmen
      </button>
    </Karte>
  );
}
