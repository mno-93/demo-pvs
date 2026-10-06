import { useEffect, useState } from 'react';
import { deutschesDatum } from '@demo-pvs/kern';
import { useZustand } from '../speicher/speicher.js';
import {
  EINRICHTUNG,
  akteSetzen,
  aktenLesen,
  fremdeEintraegeAnlegen,
  aktensystemZuruecksetzen,
  apothekeGibtAb,
  apothekeStorniertAbgabe,
  apothekenRezepteLesen,
  befugnisseEntziehen,
  befugnisseLesen,
  betriebslageLesen,
  betriebslageSetzen,
  type Abgabeart,
  type Aktenbefugnis,
  type Aktenlage,
  type ApothekenRezept,
  type Ausbaustand,
  type Betriebslage,
} from './klient.js';
import {
  pfadKurz,
  protokollLeeren,
  protokollSchliessen,
  useAufrufe,
  useProtokollSichtbar,
  type Aufruf,
} from './protokoll.js';

/**
 * Einblendbares Seitenfenster mit allen Aufrufen an die ePA und den Schaltern für die
 * Betriebslage des Simulators. Jede Zeile nennt die Spezifikationsgrundlage ihres Wegs;
 * aufgeklappt zeigt sie Kopfzeilen und Körper. Schließt über das Kreuz und die Escape-Taste.
 */
export function Aufrufprotokoll() {
  const sichtbar = useProtokollSichtbar();
  const aufrufe = useAufrufe();
  const [lage, setzeLage] = useState<Betriebslage | null>(null);
  const [befugnisse, setzeBefugnisse] = useState<Aktenbefugnis[]>([]);
  const [offen, setzeOffen] = useState<number | null>(null);
  const [apotheke, setzeApotheke] = useState<ApothekenRezept[]>([]);
  const [akten, setzeAkten] = useState<Aktenlage[]>([]);
  const patienten = useZustand((z) => z.patienten);

  function stand() {
    betriebslageLesen().then(setzeLage, () => setzeLage(null));
    befugnisseLesen().then(setzeBefugnisse, () => setzeBefugnisse([]));
    apothekenRezepteLesen().then(setzeApotheke, () => setzeApotheke([]));
    aktenLesen().then(setzeAkten, () => setzeAkten([]));
  }

  useEffect(() => {
    if (!sichtbar) return;
    stand();
  }, [sichtbar]);

  // Nach einem Aufruf an den E-Rezept-Fachdienst zeigt die Apotheke das neue Rezept.
  const letzterFachdienstAufruf = aufrufe.find((a) => a.pfad.startsWith('/erp/'))?.id ?? 0;
  useEffect(() => {
    if (!sichtbar || letzterFachdienstAufruf === 0) return;
    apothekenRezepteLesen().then(setzeApotheke, () => setzeApotheke([]));
  }, [sichtbar, letzterFachdienstAufruf]);

  const nameZu = (kvnr: string | null) => {
    const p = patienten.find((x) => x.versicherung.kvnr === kvnr);
    return p ? `${p.nachname}, ${p.vorname}` : (kvnr ?? '—');
  };

  async function abgeben(id: string, art: Abgabeart) {
    try {
      await apothekeGibtAb(id, art);
    } catch {
      /* Der Fehler steht bereits im Protokoll. */
    }
    stand();
  }

  const eigene = befugnisse.flatMap((a) =>
    a.befugnisse
      .filter((b) => b.telematikId === EINRICHTUNG.telematikId)
      .map((b) => {
        const p = patienten.find((x) => x.versicherung.kvnr === a.kvnr);
        return { ...b, kvnr: a.kvnr, name: p ? `${p.nachname}, ${p.vorname}` : a.kvnr };
      }),
  );

  useEffect(() => {
    if (!sichtbar) return;
    const beiTaste = (e: KeyboardEvent) => {
      // Ist zugleich das ePA-Fenster offen, schließt Escape zuerst dieses.
      if (e.key !== 'Escape' || e.defaultPrevented || document.querySelector('.epa-fenster'))
        return;
      e.preventDefault();
      protokollSchliessen();
    };
    window.addEventListener('keydown', beiTaste);
    return () => window.removeEventListener('keydown', beiTaste);
  }, [sichtbar]);

  if (!sichtbar) return null;

  async function aendern(teil: Partial<Betriebslage>) {
    try {
      setzeLage(await betriebslageSetzen(teil));
    } catch {
      /* Der Fehler steht bereits im Protokoll. */
    }
  }

  return (
    <aside className="protokoll" aria-label="Konfiguration und Aufrufe an die ePA">
      <div className="protokoll-kopf">
        <h3>Konfiguration</h3>
        <span className="marker neutral">{aufrufe.length} ePA-Aufrufe</span>
        <button type="button" className="knopf klein rechts" onClick={protokollLeeren}>
          leeren
        </button>
        <button
          type="button"
          className="schliessen"
          aria-label="Konfiguration schließen"
          title="Schließen (Esc)"
          onClick={protokollSchliessen}
        >
          ×
        </button>
      </div>

      <div className="protokoll-lage">
        <div className="protokoll-lage-titel">Betriebslage (Demo)</div>
        {lage === null ? (
          <div style={{ fontSize: '0.82em', color: 'var(--text-sehr-leise)' }}>
            Simulator nicht erreichbar.
          </div>
        ) : (
          <>
            <div className="protokoll-schalter">
              <label htmlFor="ausbaustand">Ausbaustand</label>
              <select
                id="ausbaustand"
                value={lage.ausbaustand}
                onChange={(e) => aendern({ ausbaustand: e.target.value as Ausbaustand })}
              >
                <option value="weiterentwicklung-4">Weiterentwicklung 4 ✦ Aktenlotse</option>
                <option value="weiterentwicklung-3">
                  Weiterentwicklung 3 ✦ Listen und Patient Summary
                </option>
                <option value="weiterentwicklung-2">
                  Weiterentwicklung 2 ✦ strukturierte Briefe
                </option>
                <option value="weiterentwicklung">Weiterentwicklung 1 · Labor und Volltext</option>
                <option value="release-3.1.3">Release 3.1.3</option>
              </select>
            </div>
            <div className="protokoll-schalter">
              Befugnisse der Praxis ({eigene.length})
              <small>
                {eigene.length === 0
                  ? '—'
                  : eigene
                      .map((b) => `${b.name} bis ${deutschesDatum(b.gueltigBis.slice(0, 10))}`)
                      .join(' · ')}
              </small>
              <button
                type="button"
                className="knopf klein"
                style={{ marginTop: 6 }}
                disabled={eigene.length === 0}
                onClick={() => befugnisseEntziehen().then(stand, stand)}
              >
                Befugnisse entziehen
              </button>
            </div>
            <label className="protokoll-schalter">
              <input
                type="checkbox"
                checked={lage.fremdeAenderungVorSchreibzugriff}
                onChange={(e) => aendern({ fremdeAenderungVorSchreibzugriff: e.target.checked })}
              />
              Andere Einrichtung ändert zwischendurch
            </label>
            <div className="protokoll-schalter">
              <label htmlFor="ps-quellen">Patient Summary aus</label>
              <select
                id="ps-quellen"
                value={lage.patientSummaryQuellen}
                disabled={
                  !['weiterentwicklung-3', 'weiterentwicklung-4'].includes(lage.ausbaustand)
                }
                onChange={(e) =>
                  aendern({ patientSummaryQuellen: e.target.value as 'listen' | 'automatisch' })
                }
              >
                <option value="listen">geführten Listen ✦</option>
                <option value="automatisch">nur automatischen Daten</option>
              </select>
            </div>
            <div className="protokoll-schalter">
              <label htmlFor="verzoegerung">Antwortzeit</label>
              <select
                id="verzoegerung"
                value={lage.verzoegerungMs}
                onChange={(e) => aendern({ verzoegerungMs: Number(e.target.value) })}
              >
                <option value={0}>ohne Verzögerung</option>
                <option value={400}>400 ms</option>
                <option value={1500}>1,5 s</option>
                <option value={4000}>4 s</option>
              </select>
            </div>
            <div className="protokoll-schalter">
              <label htmlFor="erezept-verzoegerung">E-Rezept → ePA</label>
              <select
                id="erezept-verzoegerung"
                value={lage.erezeptVerzoegerungMs}
                onChange={(e) => aendern({ erezeptVerzoegerungMs: Number(e.target.value) })}
              >
                <option value={0}>sofort</option>
                <option value={3000}>nach 3 s</option>
                <option value={10000}>nach 10 s</option>
              </select>
            </div>
            <div className="protokoll-schalter">
              Akten
              {akten.map((a) => (
                <div key={a.kvnr} className="protokoll-akte">
                  <span>{nameZu(a.kvnr)}</span>
                  <label>
                    <input
                      type="checkbox"
                      checked={a.status === 'SUSPENDED'}
                      onChange={(e) =>
                        akteSetzen(a.kvnr, {
                          status: e.target.checked ? 'SUSPENDED' : 'ACTIVATED',
                        }).then(stand, stand)
                      }
                    />
                    gesperrt
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={a.widersprueche.medication === 'deny'}
                      onChange={(e) =>
                        akteSetzen(a.kvnr, {
                          medication: e.target.checked ? 'deny' : 'permit',
                        }).then(stand, stand)
                      }
                    />
                    Widerspruch Medikation
                  </label>
                  <button
                    type="button"
                    className="knopf klein"
                    onClick={() => fremdeEintraegeAnlegen(a.kvnr).then(stand, stand)}
                  >
                    andere Einrichtung trägt ein
                  </button>
                </div>
              ))}
            </div>
            <div className="protokoll-schalter">
              Apotheke ({apotheke.length})
              {apotheke.length === 0 ? (
                <small>—</small>
              ) : (
                apotheke.map((r) => (
                  <div key={r.id} className="protokoll-rezept">
                    <small>
                      {nameZu(r.kvnr)} · {r.arzneimittel} · <code>{r.id}</code>
                      <br />
                      {r.status === 'ready'
                        ? 'einlösbar'
                        : r.status === 'completed'
                          ? 'abgegeben'
                          : r.status === 'cancelled'
                            ? 'gelöscht'
                            : r.status}{' '}
                      · ePA: {r.epa}
                    </small>
                    {r.status === 'ready' && (
                      <div className="reihe" style={{ gap: 4 }}>
                        <button
                          type="button"
                          className="knopf klein"
                          onClick={() => void abgeben(r.id, 'wie-verordnet')}
                        >
                          abgeben
                        </button>
                        <button
                          type="button"
                          className="knopf klein"
                          onClick={() => void abgeben(r.id, 'austausch')}
                        >
                          mit Austausch
                        </button>
                        <button
                          type="button"
                          className="knopf klein"
                          onClick={() => void abgeben(r.id, 'mehrfach')}
                        >
                          zwei Arzneimittel
                        </button>
                      </div>
                    )}
                    {r.status === 'completed' && (
                      <button
                        type="button"
                        className="knopf klein"
                        onClick={() => apothekeStorniertAbgabe(r.id).then(stand, stand)}
                      >
                        Abgabe stornieren
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>
            <button
              type="button"
              className="knopf klein"
              onClick={() => aktensystemZuruecksetzen().then(stand, stand)}
            >
              ePA-Bestand zurücksetzen
            </button>
          </>
        )}
      </div>

      <div className="protokoll-liste">
        {aufrufe.length === 0 ? (
          <div className="leer" style={{ fontSize: '0.85em' }}>
            Keine Aufrufe.
          </div>
        ) : (
          aufrufe.map((a) => (
            <Zeile
              key={a.id}
              aufruf={a}
              offen={offen === a.id}
              umschalten={() => setzeOffen(offen === a.id ? null : a.id)}
            />
          ))
        )}
      </div>
    </aside>
  );
}

function Zeile({
  aufruf: a,
  offen,
  umschalten,
}: {
  aufruf: Aufruf;
  offen: boolean;
  umschalten: () => void;
}) {
  return (
    <div className={`protokoll-zeile ${a.fehler ? 'fehlerhaft' : ''}`}>
      <button
        type="button"
        className="protokoll-zeile-knopf"
        aria-expanded={offen}
        onClick={umschalten}
      >
        <span className={`protokoll-status ${a.fehler ? 'fehler' : 'gut'}`}>{a.status ?? '—'}</span>
        <span className="protokoll-methode">{a.methode}</span>
        <span className="protokoll-pfad" title={a.pfad}>
          {pfadKurz(a.pfad)}
        </span>
        <span className="protokoll-dauer">{a.dauerMs} ms</span>
      </button>
      <div className="protokoll-ergebnis">{a.ergebnis}</div>
      <div className="protokoll-grundlage">{a.grundlage}</div>
      {offen && (
        <div className="protokoll-details">
          <div>
            <b>Pfad</b> <code>{a.pfad}</code>
          </div>
          {Object.keys(a.kopfzeilen).length > 0 && (
            <div>
              <b>Kopfzeilen</b>
              {Object.entries(a.kopfzeilen).map(([k, v]) => (
                <div key={k}>
                  <code>
                    {k}: {v}
                  </code>
                </div>
              ))}
            </div>
          )}
          {a.koerper !== null && (
            <div>
              <b>Körper</b>
              <pre className="code-block">{JSON.stringify(a.koerper, null, 2)}</pre>
            </div>
          )}
          {a.fehler && (
            <div>
              <b>Antwort</b> {a.fehler}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
