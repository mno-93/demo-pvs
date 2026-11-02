import { useMemo, useState } from 'react';
import {
  amtsPruefen,
  arzneimittel,
  dosierungAlsText,
  type Diagnose,
  type Dosierung,
  type AmtsUmgebung,
  type ArzneimittelEintrag,
} from '@demo-pvs/kern';
import { Karte } from '../../bausteine/Bausteine.js';
import { Katalogsuche } from '../../bausteine/Katalogsuche.js';
import { Befundliste } from '../../bausteine/Befundliste.js';
import { DOSIERUNG_VORGABE, DosierungEingabe, dosierungGueltig } from './DosierungEingabe.js';

/** „neuer Planeintrag“: Arzneimittel, Dosierung und Grund für den Plan, mit AMTS-Prüfung. */

/** Angaben eines neuen Planeintrags aus dem Dialog. */
interface Planangabe {
  dosis: Dosierung;
  text: string;
  grund: string | null;
  grundDiagnose: Diagnose | null;
}

export function NeuerPlaneintrag({
  umgebung,
  diagnosen,
  beiAnlage,
  abbrechen,
}: {
  umgebung: AmtsUmgebung;
  diagnosen: readonly Diagnose[];
  beiAnlage: (mittel: ArzneimittelEintrag, angabe: Planangabe) => void;
  abbrechen: () => void;
}) {
  const [mittel, setzeMittel] = useState<ArzneimittelEintrag | null>(null);
  const [dosis, setzeDosis] = useState<Dosierung>(DOSIERUNG_VORGABE);
  const [grund, setzeGrund] = useState('');
  const [diagnoseId, setzeDiagnoseId] = useState('');
  const gueltigeDiagnosen = diagnosen.filter(
    (d) => d.diagnosesicherheit !== 'irrtümlich' && d.zusatzkennzeichen !== 'A',
  );
  const befunde = useMemo(() => (mittel ? amtsPruefen(mittel, umgebung) : []), [mittel, umgebung]);

  return (
    <Karte titel="Neuer Planeintrag">
      {!mittel ? (
        <Katalogsuche
          beschriftung="Arzneimittel suchen"
          eintraege={arzneimittel}
          schluesselVon={(a) => a.atc}
          bezeichnungVon={(a) => a.bezeichnung}
          beiAuswahl={setzeMittel}
          platzhalter="Wirkstoff oder ATC, z. B. Metformin oder J01C"
        />
      ) : (
        <>
          <div className="reihe" style={{ marginBottom: 8 }}>
            <b>{mittel.bezeichnung}</b>
            <span className="leise-klein">
              ATC {mittel.atc} ({mittel.atcVersion}) · PZN {mittel.pzn}
            </span>
            <button type="button" className="knopf klein rechts" onClick={() => setzeMittel(null)}>
              anderes Mittel
            </button>
          </div>
          <Befundliste befunde={befunde} />
          <DosierungEingabe wert={dosis} setze={setzeDosis} />
          <div className="feldreihe">
            <div className="feldzeile" style={{ flex: '2 1 240px' }}>
              <label htmlFor="grund-diagnose">Behandlungsgrund (Diagnose)</label>
              <select
                id="grund-diagnose"
                value={diagnoseId}
                onChange={(e) => setzeDiagnoseId(e.target.value)}
              >
                <option value="">—</option>
                {gueltigeDiagnosen.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.code} {d.bezeichnung}
                  </option>
                ))}
              </select>
            </div>
            <div className="feldzeile" style={{ flex: '2 1 240px' }}>
              <label htmlFor="grund">Behandlungsgrund für Patient:in</label>
              <input
                id="grund"
                type="text"
                value={grund}
                placeholder="z. B. Blutdruck"
                onChange={(e) => setzeGrund(e.target.value)}
              />
            </div>
          </div>
          <div className="reihe" style={{ gap: 6 }}>
            <button
              type="button"
              className="knopf stark"
              disabled={!dosierungGueltig(dosis)}
              onClick={() =>
                beiAnlage(mittel, {
                  dosis,
                  text: dosierungAlsText(dosis),
                  grund: grund.trim() === '' ? null : grund.trim(),
                  grundDiagnose: gueltigeDiagnosen.find((d) => d.id === diagnoseId) ?? null,
                })
              }
            >
              In den Plan aufnehmen
            </button>
            <button type="button" className="knopf" onClick={abbrechen}>
              abbrechen
            </button>
          </div>
        </>
      )}
      {!mittel && (
        <button type="button" className="knopf klein" style={{ marginTop: 8 }} onClick={abbrechen}>
          abbrechen
        </button>
      )}
    </Karte>
  );
}
