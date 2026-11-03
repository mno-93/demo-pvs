import { useEffect, useMemo, useRef, useState } from 'react';
import {
  REZEPTFREIGABE_BEZEICHNUNG,
  amtsPruefen,
  arzneimittel,
  deutschesDatum,
  dosierungAlsText,
  dosierungAusText,
  reichweiteTage,
  type AmtsUmgebung,
  type ArzneimittelEintrag,
  type Dosierung,
  type Normgroesse,
  type Rezept,
  type Rezeptfreigabe,
} from '@demo-pvs/kern';
import { Karte, Leer, Marker } from '../../bausteine/Bausteine.js';
import { Befundliste } from '../../bausteine/Befundliste.js';
import { Katalogsuche } from '../../bausteine/Katalogsuche.js';
import type { Medikationsliste } from '../../epa/dienste/medikation.js';
import { DosierungEingabe, dosierungGueltig } from './DosierungEingabe.js';
import { rezeptInEpa, type RezeptInEpa } from './rezepte.js';

/** Woraus ein Rezept entsteht: aus dem Plan, aus der Liste oder neu. */
export interface Rezeptvorlage {
  arzneimittel: Rezept['arzneimittel'];
  /** Text der Dosierung, wie er am Eintrag steht. */
  dosierung: string;
  /**
   * Strukturierte Dosierung des Planeintrags oder Listeneintrags (ADR 0052). Fehlt sie, wird der
   * Text strukturiert, wenn er ein Viererschema ist, sonst als Freitext angeboten.
   */
  dosis?: Dosierung | null;
  empId: string | null;
  /** Eintrag im Medikationsplan der Praxis, aus dem ohne Akte verordnet wird (ADR 0045). */
  praxisplanId?: string;
  grund: string | null;
  herkunft: 'plan' | 'liste' | 'neu';
  /** Gehört das Rezept zu einem Planeintrag (verknüpft oder zugeordnet, ADR 0051)? */
  imPlan: boolean;
  /** Nicht im Plan, aber ein gültiger Planeintrag mit demselben Wirkstoff — seine Bezeichnung. */
  wirkstoffImPlan?: string | null;
  /** Katalogeintrag für die AMTS-Prüfung. */
  katalog: ArzneimittelEintrag | null;
  /** Eintrag der Medikationsliste, aus dem erneut verordnet wird. */
  listeneintrag?: { aussageId: string; medicationId: string };
}

export interface Rezeptangabe {
  /** Text der Dosierung — erzeugt nach Algorithmus 2.0.0 oder Freitext. */
  dosierung: string;
  dosis: Dosierung;
  packungen: number;
  normgroesse: Normgroesse;
  auchInPlan: boolean;
  /**
   * Rezept aus dem Plan mit geänderter Dosierung: den Planeintrag mit anpassen (Anwendungsfall
   * „Pflege des eMP im Rahmen der Rezeptierung – Aktualisieren eines eMP-Eintrags“).
   */
  planAnpassen: boolean;
  freigabe: Rezeptfreigabe;
  hinweis: string | null;
  grund: string | null;
}

const PLUS_TAGE = (heute: string, tage: number) => {
  const d = new Date(`${heute}T12:00:00`);
  d.setDate(d.getDate() + tage);
  return d.toISOString().slice(0, 10);
};

/**
 * Startwert der Dosierung im Formular: die strukturierte Dosierung der Vorlage. Ein Viererschema,
 * das nur als Freitext vorliegt (ältere Einträge), wird zum Schema — als Freitext verbietet es das
 * Profil (`DosageFourSlotPatternInText`).
 */
export function dosierungFuerRezept(v: Pick<Rezeptvorlage, 'dosis' | 'dosierung'>): Dosierung {
  const d = v.dosis ?? dosierungAusText(v.dosierung);
  return d.schema.art === 'freitext' ? dosierungAusText(d.schema.text, d.einheit) : d;
}

/** Rezept aus einer Vorlage — für Ärztin (signieren) und MFA (vorbereiten). */
export function RezeptFormular({
  vorlage,
  umgebung,
  heute,
  aerztlich,
  planSchreibbar,
  beiVorbereiten,
  beiSenden,
  abbrechen,
}: {
  vorlage: Rezeptvorlage;
  umgebung: AmtsUmgebung;
  heute: string;
  aerztlich: boolean;
  /** Kann der Plan der ePA geschrieben werden (Befugnis, kein Widerspruch, ärztlich)? */
  planSchreibbar: boolean;
  beiVorbereiten: (a: Rezeptangabe) => void;
  beiSenden: (a: Rezeptangabe) => void;
  abbrechen: () => void;
}) {
  const [dosis, setzeDosis] = useState<Dosierung>(() => dosierungFuerRezept(vorlage));
  const gueltig = dosierungGueltig(dosis);
  const [packungen, setzePackungen] = useState(1);
  const [normgroesse, setzeNormgroesse] = useState<Normgroesse>('N3');
  const [grund, setzeGrund] = useState(vorlage.grund ?? '');
  const angeboten = !vorlage.imPlan && planSchreibbar;
  // Steht derselbe Wirkstoff schon im Plan, wäre ein zweiter Eintrag meist eine Doppelung.
  const [auchInPlan, setzeAuchInPlan] = useState(angeboten && !vorlage.wirkstoffImPlan);
  const [freigabe, setzeFreigabe] = useState<Rezeptfreigabe>(
    vorlage.imPlan ? 'freigegeben' : 'hinweis',
  );
  const [hinweis, setzeHinweis] = useState(
    vorlage.imPlan
      ? ''
      : vorlage.wirkstoffImPlan
        ? `Wirkstoff im Plan: ${vorlage.wirkstoffImPlan}`
        : 'nicht im Medikationsplan',
  );
  const befunde = useMemo(
    () =>
      vorlage.katalog && vorlage.herkunft !== 'plan' ? amtsPruefen(vorlage.katalog, umgebung) : [],
    [vorlage, umgebung],
  );
  const reichweite = gueltig ? reichweiteTage(dosis, packungen, normgroesse) : null;
  const textVon = (d: Dosierung) =>
    d.schema.art === 'freitext' ? d.schema.text.trim() : dosierungAlsText(d);
  const dosierungstext = gueltig ? textVon(dosis) : null;
  // Verglichen wird mit dem Startwert des Formulars, nicht mit dem Text am Eintrag: Ein älterer
  // Freitext „1-0-0-0“ wird beim Öffnen strukturiert, ohne dass jemand die Dosierung ändert.
  const [startText] = useState(() => {
    try {
      return textVon(dosierungFuerRezept(vorlage));
    } catch {
      return vorlage.dosierung;
    }
  });
  // Aus dem Plan verordnet, Dosierung geändert: den Planeintrag mit anpassen. In der ePA nur
  // ärztlich und mit schreibbarem Plan; im Plan der Praxis immer.
  const anpassbar =
    dosierungstext !== null &&
    dosierungstext !== startText &&
    ((!!vorlage.empId && planSchreibbar && aerztlich) || !!vorlage.praxisplanId);
  const [planAnpassen, setzePlanAnpassen] = useState(true);
  // Das Formular öffnet oberhalb des Plans; der Blick und der Fokus folgen ihm.
  const rahmen = useRef<HTMLDivElement>(null);
  useEffect(() => {
    rahmen.current?.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
    rahmen.current
      ?.querySelector<HTMLSelectElement>('fieldset select')
      ?.focus({ preventScroll: true });
  }, [vorlage]);

  const angabe = (): Rezeptangabe => ({
    dosierung: dosis.schema.art === 'freitext' ? dosis.schema.text.trim() : dosierungAlsText(dosis),
    dosis,
    packungen,
    normgroesse,
    auchInPlan: angeboten && auchInPlan,
    planAnpassen: anpassbar && planAnpassen,
    freigabe: aerztlich ? 'freigegeben' : freigabe,
    hinweis: aerztlich ? null : hinweis.trim() || null,
    grund: grund.trim() || null,
  });

  return (
    <div ref={rahmen}>
      <Karte titel="E-Rezept">
        <div className="reihe" style={{ marginBottom: 8 }}>
          <b>{vorlage.arzneimittel.bezeichnung}</b>
          <span className="leise-klein">
            PZN {vorlage.arzneimittel.pzn} · ATC {vorlage.arzneimittel.atc}
          </span>
          {vorlage.empId || vorlage.praxisplanId ? (
            <Marker ton="gut">aus dem Plan</Marker>
          ) : vorlage.imPlan ? (
            <Marker ton="gut">im Plan</Marker>
          ) : (
            <Marker ton="warn">nicht im Plan</Marker>
          )}
          {vorlage.wirkstoffImPlan && (
            <span className="leise-klein">Wirkstoff im Plan: {vorlage.wirkstoffImPlan}</span>
          )}
        </div>
        {vorlage.herkunft !== 'plan' && vorlage.katalog && <Befundliste befunde={befunde} />}
        <DosierungEingabe wert={dosis} setze={setzeDosis} />
        <div className="feldreihe">
          <div className="feldzeile" style={{ flex: '0 1 110px' }}>
            <label htmlFor="rz-packungen">Packungen</label>
            <input
              id="rz-packungen"
              type="number"
              min={1}
              max={3}
              value={packungen}
              onChange={(e) =>
                setzePackungen(Math.max(1, Math.min(3, Number(e.target.value) || 1)))
              }
            />
          </div>
          <div className="feldzeile" style={{ flex: '0 1 110px' }}>
            <label htmlFor="rz-normgroesse">Normgröße</label>
            <select
              id="rz-normgroesse"
              value={normgroesse}
              onChange={(e) => setzeNormgroesse(e.target.value as Normgroesse)}
            >
              <option value="N1">N1</option>
              <option value="N2">N2</option>
              <option value="N3">N3</option>
            </select>
          </div>
          {vorlage.herkunft === 'neu' && (
            <div className="feldzeile" style={{ flex: '2 1 200px' }}>
              <label htmlFor="rz-grund">Behandlungsgrund</label>
              <input
                id="rz-grund"
                type="text"
                value={grund}
                onChange={(e) => setzeGrund(e.target.value)}
              />
            </div>
          )}
        </div>
        <div className="leise-klein" style={{ margin: '2px 0 8px' }} role="status">
          {reichweite !== null
            ? `Reichweite ${reichweite} Tage · bis ${deutschesDatum(PLUS_TAGE(heute, reichweite))}`
            : dosis.einheit.code !== '1'
              ? `Reichweite: nicht in ${dosis.einheit.anzeige}`
              : 'Reichweite: keine Tagesmenge'}
        </div>
        {anpassbar && (
          <label className="relevanzwahl">
            <input
              type="checkbox"
              checked={planAnpassen}
              onChange={(e) => setzePlanAnpassen(e.target.checked)}
            />
            <span>
              <b>Dosierung im Plan anpassen</b>{' '}
              <span className="leise-klein">bisher {vorlage.dosierung}</span>
            </span>
          </label>
        )}
        {angeboten && (
          <label className="relevanzwahl">
            <input
              type="checkbox"
              checked={auchInPlan}
              onChange={(e) => setzeAuchInPlan(e.target.checked)}
            />
            <span>
              <b>Auch in den Medikationsplan aufnehmen</b>
            </span>
          </label>
        )}
        {!aerztlich && (
          <div className="feldreihe">
            <div className="feldzeile" style={{ flex: '0 1 170px' }}>
              <label htmlFor="rz-freigabe">Freigabe</label>
              <select
                id="rz-freigabe"
                value={freigabe}
                onChange={(e) => setzeFreigabe(e.target.value as Rezeptfreigabe)}
              >
                {(Object.keys(REZEPTFREIGABE_BEZEICHNUNG) as Rezeptfreigabe[]).map((f) => (
                  <option key={f} value={f}>
                    {REZEPTFREIGABE_BEZEICHNUNG[f]}
                  </option>
                ))}
              </select>
            </div>
            <div className="feldzeile" style={{ flex: '2 1 240px' }}>
              <label htmlFor="rz-hinweis">Hinweis für die Ärztin</label>
              <input
                id="rz-hinweis"
                type="text"
                value={hinweis}
                onChange={(e) => setzeHinweis(e.target.value)}
              />
            </div>
          </div>
        )}
        <div className="reihe" style={{ gap: 6, marginTop: 6 }}>
          {aerztlich ? (
            <>
              <button
                type="button"
                className="knopf stark"
                disabled={!gueltig}
                onClick={() => beiSenden(angabe())}
              >
                Signieren und senden
              </button>
              <button
                type="button"
                className="knopf"
                disabled={!gueltig}
                onClick={() => beiVorbereiten(angabe())}
              >
                In den Signaturstapel
              </button>
            </>
          ) : (
            <button
              type="button"
              className="knopf stark"
              disabled={!gueltig}
              onClick={() => beiVorbereiten(angabe())}
            >
              Zur Signatur vorbereiten
            </button>
          )}
          <button type="button" className="knopf" onClick={abbrechen}>
            abbrechen
          </button>
        </div>
      </Karte>
    </div>
  );
}

/** Auswahl eines Arzneimittels für ein neues Rezept, ohne Plan oder Liste. */
export function NeuesRezept({ beiAuswahl }: { beiAuswahl: (m: ArzneimittelEintrag) => void }) {
  return (
    <Katalogsuche
      beschriftung="Neues E-Rezept"
      eintraege={arzneimittel}
      schluesselVon={(a) => a.pzn}
      bezeichnungVon={(a) => a.bezeichnung}
      beiAuswahl={beiAuswahl}
      platzhalter="Wirkstoff oder ATC, z. B. Salbutamol"
    />
  );
}

const TON: Record<RezeptInEpa['art'], 'gut' | 'neutral' | 'warn' | 'akzent'> = {
  vorbereitet: 'neutral',
  ausstehend: 'warn',
  'in-liste': 'akzent',
  eingeloest: 'gut',
  'nicht-sichtbar': 'neutral',
  geloescht: 'neutral',
};

/** Rezepte einer Person mit ihrem Stand in der ePA. */
export function RezepteKarte({
  rezepte,
  liste,
  gesperrt,
  ohneAkte = false,
  aerztlich,
  werkzeuge,
  imPlan,
  wirkstoffImPlan,
  inDenPlan,
  zuordnen,
  beiSenden,
  beiLoeschen,
  beiVerwerfen,
}: {
  rezepte: readonly Rezept[];
  liste: Medikationsliste | null;
  gesperrt: boolean;
  /** Keine Akte: Rezepte gehen nicht in die ePA; der Plan ist der Medikationsplan der Praxis. */
  ohneAkte?: boolean;
  aerztlich: boolean;
  /** Ist das Rezept einem Eintrag des Medikationsplans der Praxis zugeordnet? */
  imPlan?: (r: Rezept) => boolean;
  /** Bezeichnung eines gültigen Planeintrags mit demselben Wirkstoff, dem es nicht zugeordnet ist. */
  wirkstoffImPlan?: (r: Rezept) => string | null;
  /** Nimmt das Rezept in den Medikationsplan der Praxis auf. */
  inDenPlan?: (r: Rezept) => void;
  /** Ordnet das Rezept dem Planeintrag mit demselben Wirkstoff zu. */
  zuordnen?: (r: Rezept) => void;
  werkzeuge?: React.ReactNode;
  beiSenden: (r: Rezept) => void;
  beiLoeschen: (r: Rezept) => void;
  beiVerwerfen: (r: Rezept) => void;
}) {
  const sortiert = [...rezepte].sort((a, b) =>
    (b.gesendetAm ?? b.erstelltAm).localeCompare(a.gesendetAm ?? a.erstelltAm),
  );
  return (
    <Karte titel="E-Rezepte" werkzeuge={werkzeuge}>
      {sortiert.length === 0 ? (
        <Leer>Keine E-Rezepte.</Leer>
      ) : (
        <div className="tabelle-rahmen">
          <table className="liste">
            <thead>
              <tr>
                <th>Datum</th>
                <th>Arzneimittel</th>
                <th>Rezept</th>
                <th>ePA</th>
                <th>
                  <span className="nur-fuer-screenreader">Aktionen</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {sortiert.map((r) => {
                const epa = rezeptInEpa(r, liste, gesperrt, ohneAkte);
                const imPraxisplan = imPlan?.(r) ?? false;
                const wirkstoff = imPraxisplan ? null : (wirkstoffImPlan?.(r) ?? null);
                return (
                  <tr key={r.id} className={r.status === 'geloescht' ? 'gedaempft' : undefined}>
                    <td>{deutschesDatum((r.gesendetAm ?? r.erstelltAm).slice(0, 10))}</td>
                    <td>
                      <b>{r.arzneimittel.bezeichnung}</b>
                      <div className="leise-klein">
                        {r.packungen} × {r.normgroesse} ·{' '}
                        <span className="code">{r.dosierung}</span>
                        {r.empId
                          ? ' · aus dem Plan'
                          : imPraxisplan
                            ? ' · im Plan'
                            : wirkstoff
                              ? ` · Wirkstoff im Plan: ${wirkstoff}`
                              : ''}
                      </div>
                    </td>
                    <td>
                      {r.status === 'vorbereitet' ? (
                        <>
                          <Marker
                            ton={
                              r.freigabe === 'gesperrt'
                                ? 'fehler'
                                : r.freigabe === 'hinweis'
                                  ? 'warn'
                                  : 'neutral'
                            }
                          >
                            vorbereitet · {REZEPTFREIGABE_BEZEICHNUNG[r.freigabe]}
                          </Marker>
                          {r.hinweis && <div className="leise-klein">{r.hinweis}</div>}
                        </>
                      ) : (
                        <span className="code leise-klein">{r.rezeptId}</span>
                      )}
                    </td>
                    <td>
                      <Marker ton={TON[epa.art]}>{epa.text}</Marker>
                      {epa.abgaben.length > 0 && (
                        <div className="leise-klein">abgegeben: {epa.abgaben.join(' · ')}</div>
                      )}
                    </td>
                    <td>
                      <div className="reihe" style={{ gap: 5 }}>
                        {r.status === 'vorbereitet' && aerztlich && r.freigabe !== 'gesperrt' && (
                          <button
                            type="button"
                            className="knopf klein stark"
                            onClick={() => beiSenden(r)}
                          >
                            signieren und senden
                          </button>
                        )}
                        {r.status === 'vorbereitet' && (
                          <button
                            type="button"
                            className="knopf klein"
                            onClick={() => beiVerwerfen(r)}
                          >
                            verwerfen
                          </button>
                        )}
                        {zuordnen && wirkstoff && r.status !== 'geloescht' && (
                          <button
                            type="button"
                            className="knopf klein"
                            aria-label={`zuordnen zu ${wirkstoff}`}
                            onClick={() => zuordnen(r)}
                          >
                            zuordnen
                          </button>
                        )}
                        {inDenPlan && imPlan && !imPraxisplan && r.status !== 'geloescht' && (
                          <button
                            type="button"
                            className="knopf klein"
                            onClick={() => inDenPlan(r)}
                          >
                            in den Plan
                          </button>
                        )}
                        {r.status === 'gesendet' && epa.art !== 'eingeloest' && (
                          <button
                            type="button"
                            className="knopf klein"
                            onClick={() => beiLoeschen(r)}
                          >
                            löschen
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Karte>
  );
}
