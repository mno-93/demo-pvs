import { useMemo, useState, type KeyboardEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  EPA_KENNZEICHEN_BEZEICHNUNG,
  FREITEXT_KUERZEL,
  KUERZEL_BEZEICHNUNG,
  TERMINSTATUS_BEZEICHNUNG,
  besucheBilden,
  deutschesDatum,
  laborwerteAusDokumenten,
  verlaufBilden,
  type Besuch,
  type EpaKennzeichen,
  type Kuerzel,
  type Terminstatus,
  type Verlaufseintrag,
} from '@demo-pvs/kern';
import { ausfuehren, useAuswahl, useZustand } from '../speicher/speicher.js';
import { vorgaenge } from '../speicher/vorgaenge.js';
import { Bestandsband, Karte, Leer, Marker } from '../bausteine/Bausteine.js';
import { usePatientId } from './Patientenkartei.js';
import { epaFensterOeffnen } from '../epa/fenster.js';

/**
 * Die Karteikarte: der Verlauf je Besuch.
 *
 * Ein Block je Tag sammelt, was an diesem Tag entstanden ist — Notizen, Diagnosen, Allergien,
 * Impfungen, Medikationsplan, Rezepte, Laborbefunde, Dokumente —, nach Art gruppiert. Ein Tag
 * mit Termin oder Notiz ist ein Besuch, sonst ein Eingang (Befund vom Labor, Eintrag einer
 * anderen Einrichtung). Der heutige Besuch steht oben, sobald ein Termin da ist, und sammelt,
 * was während des Besuchs dokumentiert wird.
 *
 * Der Verlauf entsteht **nicht** aus gespeicherten Texten allein: Strukturierte Einträge stehen
 * hier, weil sie in ihrem Bestand stehen, und ändern sich mit ihm. ▸ Die Karteikarte führt im
 * Kleinen vor, was für die Patient Summary gefordert wird: eine Sicht, kein Duplikat.
 */

const BEREICHSZIEL: Partial<Record<NonNullable<Verlaufseintrag['bereich']>, string>> = {
  diagnosen: 'diagnosen',
  medikation: 'medikation',
  labor: 'labor',
  dokumente: 'dokumente',
  impfungen: 'impfungen',
};

/** Zeichen der ePA-Kennzeichen: Pfeil in die Praxis, Pfeil in die Akte. */
const KENNZEICHEN_ZEICHEN: Record<EpaKennzeichen, string> = { 'aus-epa': '↓', 'in-epa': '↑' };

const WOCHENTAG = new Intl.DateTimeFormat('de-DE', { weekday: 'short' });

export function Karteikarte() {
  const patientId = usePatientId();
  const navigiere = useNavigate();
  const heute = useZustand((z) => z.heute);
  const [kuerzel, setzeKuerzel] = useState<Kuerzel>('A');
  const [text, setzeText] = useState('');
  const [filter, setzeFilter] = useState<Kuerzel | 'alle'>('alle');
  const [bezug, setzeBezug] = useState<EpaKennzeichen | 'alle'>('alle');

  const quellen = useAuswahl(
    (z) => {
      const spiegel = z.medikationsspiegel.find((s) => s.patientId === patientId);
      return {
        notizen: z.karteikarte.filter((e) => e.patientId === patientId),
        diagnosen: z.diagnosen.filter((d) => d.patientId === patientId),
        allergien: z.allergien.filter((a) => a.patientId === patientId),
        // Laborwerte stehen nicht im Zustand; sie werden aus den Befunden der Ablage gelesen.
        laborwerte: laborwerteAusDokumenten(z.dokumente.filter((d) => d.patientId === patientId)),
        // Ein Planeintrag gehört zu dem Tag, an dem er zuletzt geändert wurde.
        medikation: (spiegel?.eintraege ?? []).map((e) => ({
          id: e.id,
          bezeichnung: e.bezeichnung,
          dosierung: e.dosierung,
          zeitpunkt: e.geaendertAm || spiegel?.abgeglichenAm || '',
          verantwortlich: e.verantwortlich,
          status: e.status,
        })),
        dokumente: z.dokumente.filter((d) => d.patientId === patientId),
        rezepte: z.rezepte.filter((r) => r.patientId === patientId),
        impfungen: z.impfungen.filter((i) => i.patientId === patientId),
      };
    },
    [patientId],
  );
  const termine = useAuswahl(
    (z) => z.termine.filter((t) => t.patientId === patientId),
    [patientId],
  );

  const besuche = useMemo(() => {
    const verlauf = verlaufBilden(quellen).filter(
      (e) => (filter === 'alle' || e.kuerzel === filter) && (bezug === 'alle' || e.epa === bezug),
    );
    const alle = besucheBilden(verlauf, termine, heute);
    // Mit Filter nur Tage, an denen etwas passt.
    return filter === 'alle' && bezug === 'alle' ? alle : alle.filter((b) => b.gruppen.length > 0);
  }, [quellen, termine, heute, filter, bezug]);

  function erfassen() {
    if (!text.trim()) return;
    ausfuehren(vorgaenge.karteneintragAnlegen(patientId, kuerzel, text));
    setzeText('');
  }

  function beiTaste(ereignis: KeyboardEvent<HTMLTextAreaElement>) {
    // Wie in Praxissystemen üblich: Strg+Eingabe schließt den Eintrag ab.
    if ((ereignis.ctrlKey || ereignis.metaKey) && ereignis.key === 'Enter') {
      ereignis.preventDefault();
      erfassen();
    }
  }

  const oeffnen = (e: Verlaufseintrag) => {
    if (e.bereich === 'epa') epaFensterOeffnen(patientId);
    else if (e.bereich && BEREICHSZIEL[e.bereich]) navigiere(`../${BEREICHSZIEL[e.bereich]}`);
  };

  return (
    <>
      <Bestandsband lage="lokal" />

      <div className="spalten">
        <div>
          <Karte
            titel="Verlauf"
            werkzeuge={
              <>
                <label
                  htmlFor="kk-filter"
                  style={{ fontSize: '0.82em', color: 'var(--text-sehr-leise)' }}
                >
                  Filter
                </label>
                <select
                  id="kk-filter"
                  className="knopf"
                  value={filter}
                  onChange={(e) => setzeFilter(e.target.value as Kuerzel | 'alle')}
                >
                  <option value="alle">alle Eintragsarten</option>
                  {(Object.keys(KUERZEL_BEZEICHNUNG) as Kuerzel[]).map((k) => (
                    <option key={k} value={k}>
                      {k} — {KUERZEL_BEZEICHNUNG[k]}
                    </option>
                  ))}
                </select>
                <label
                  htmlFor="kk-bezug"
                  style={{ fontSize: '0.82em', color: 'var(--text-sehr-leise)' }}
                >
                  ePA
                </label>
                <select
                  id="kk-bezug"
                  className="knopf"
                  value={bezug}
                  onChange={(e) => setzeBezug(e.target.value as EpaKennzeichen | 'alle')}
                >
                  <option value="alle">alle</option>
                  <option value="aus-epa">↓ aus der ePA</option>
                  <option value="in-epa">↑ in der ePA</option>
                </select>
              </>
            }
          >
            {besuche.length === 0 ? (
              <Leer>Keine Einträge mit diesem Filter.</Leer>
            ) : (
              besuche.map((b) => (
                <Besuchsblock key={b.datum} besuch={b} heute={heute} oeffnen={oeffnen} />
              ))
            )}
          </Karte>
        </div>

        <div>
          <Karte titel="Notiz erfassen">
            <div className="feldzeile">
              <label htmlFor="kk-kuerzel">Eintragsart</label>
              <select
                id="kk-kuerzel"
                value={kuerzel}
                onChange={(e) => setzeKuerzel(e.target.value as Kuerzel)}
              >
                {FREITEXT_KUERZEL.map((k) => (
                  <option key={k} value={k}>
                    {k} — {KUERZEL_BEZEICHNUNG[k]}
                  </option>
                ))}
              </select>
            </div>
            <div className="feldzeile">
              <label htmlFor="kk-text">Text</label>
              <textarea
                id="kk-text"
                value={text}
                onChange={(e) => setzeText(e.target.value)}
                onKeyDown={beiTaste}
                placeholder="Notiz erfassen. Strg + Eingabetaste schließt ab."
              />
            </div>
            <button
              type="button"
              className="knopf stark"
              onClick={erfassen}
              disabled={!text.trim()}
            >
              Notiz speichern
            </button>

            <div>
              <div className="reihe" style={{ gap: 6, marginTop: 8 }}>
                <button
                  type="button"
                  className="knopf klein"
                  onClick={() => navigiere('../diagnosen')}
                >
                  zu Diagnosen und Allergien
                </button>
                <button
                  type="button"
                  className="knopf klein"
                  onClick={() => navigiere('../medikation')}
                >
                  zur Medikation
                </button>
                <button
                  type="button"
                  className="knopf klein"
                  onClick={() => navigiere('../impfungen')}
                >
                  zu den Impfungen
                </button>
                <button type="button" className="knopf klein" onClick={() => navigiere('../labor')}>
                  zum Labor
                </button>
              </div>
            </div>
          </Karte>
        </div>
      </div>
    </>
  );
}

function Besuchsblock({
  besuch: b,
  heute,
  oeffnen,
}: {
  besuch: Besuch;
  heute: string;
  oeffnen: (e: Verlaufseintrag) => void;
}) {
  const istHeute = b.datum === heute;
  const titel = `${WOCHENTAG.format(new Date(`${b.datum}T12:00:00`))}, ${deutschesDatum(b.datum)}`;
  return (
    <section
      className={`besuch ${b.art} ${istHeute ? 'heute' : ''}`}
      aria-label={`${b.art === 'besuch' ? 'Besuch' : 'Eingang'} am ${deutschesDatum(b.datum)}`}
    >
      <header className="besuch-kopf">
        <b>{titel}</b>
        <Marker ton={b.art === 'besuch' ? 'lokal' : 'neutral'}>
          {istHeute ? 'heutiger Besuch' : b.art === 'besuch' ? 'Besuch' : 'Eingang'}
        </Marker>
        {b.termin && (
          <span className="leise-klein">
            {b.termin.uhrzeit} · {b.termin.art} · {b.termin.anlass}
            {istHeute && ` · ${TERMINSTATUS_BEZEICHNUNG[b.termin.status as Terminstatus]}`}
          </span>
        )}
        <span className="rechts leise-klein">
          {b.epa.in > 0 && (
            <span title="in die ePA" className="besuch-epa">
              ↑ {b.epa.in}
            </span>
          )}
          {b.epa.aus > 0 && (
            <span title="aus der ePA" className="besuch-epa">
              ↓ {b.epa.aus}
            </span>
          )}
          {b.verfasser.join(', ')}
        </span>
      </header>
      {b.gruppen.length === 0 ? (
        <div className="besuch-leer">Noch nichts dokumentiert.</div>
      ) : (
        b.gruppen.map((g) => (
          <div key={g.titel} className="besuch-gruppe">
            <div className="besuch-gruppe-titel">{g.titel}</div>
            {g.eintraege.map((e) => (
              <div key={e.id} className="besuch-zeile">
                <span className="kk-kuerzel" title={KUERZEL_BEZEICHNUNG[e.kuerzel]}>
                  {e.kuerzel}
                </span>
                <span className="nur-fuer-screenreader">{KUERZEL_BEZEICHNUNG[e.kuerzel]}</span>
                <div className="besuch-inhalt">
                  <span className="kk-text">{e.text}</span>
                  {e.epa && (
                    <span
                      className={`kk-epa inline ${e.epa}`}
                      title={EPA_KENNZEICHEN_BEZEICHNUNG[e.epa]}
                      aria-label={EPA_KENNZEICHEN_BEZEICHNUNG[e.epa]}
                    >
                      {KENNZEICHEN_ZEICHEN[e.epa]}
                    </span>
                  )}
                  {e.zusatz && <div className="kk-zusatz">{e.zusatz}</div>}
                  {e.ursprung === 'notiz' ? (
                    <div className="kk-verfasser">
                      {e.zeitpunkt.slice(11, 16)} · {e.verfasser}
                    </div>
                  ) : (
                    e.bereich &&
                    (BEREICHSZIEL[e.bereich] || e.bereich === 'epa') && (
                      <button type="button" className="kk-sprung" onClick={() => oeffnen(e)}>
                        dort öffnen
                      </button>
                    )
                  )}
                </div>
              </div>
            ))}
          </div>
        ))
      )}
    </section>
  );
}
