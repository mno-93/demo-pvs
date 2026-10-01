import { useMemo, useState } from 'react';
import {
  ALLERGIESTATUS_BEZEICHNUNG,
  CODESYSTEM,
  GEWISSHEIT_BEZEICHNUNG,
  REAKTIONSSCHWEREGRAD_BEZEICHNUNG,
  WIRKSTOFFKATEGORIE_CODE,
  allergieNachFhir,
  amtsZuordnung,
  atcFuerSubstanz,
  deutschesDatum,
  expositionswege,
  manifestationen,
  substanzen,
  terminologieSuchen,
  type Allergie,
  type AllergieStatus,
  type AllergieTyp,
  type Gewissheit,
  type Kodierung,
  type Kritikalitaet,
  type Reaktion,
  type Reaktionsschweregrad,
  type SnomedWerteintrag,
  type Wirkstoffkategorie,
} from '@demo-pvs/kern';
import { Karte, Marker } from '../../bausteine/Bausteine.js';
import { Terminologiesuche } from '../../bausteine/Terminologiesuche.js';
import { Auswahl, Datum, Text } from './DiagnoseFormular.js';
import { Listenwahl, OHNE_LISTE, type Listenoption } from './Listenwahl.js';

/**
 * Erfassen und Bearbeiten einer Allergie oder Unverträglichkeit nach dem Informationsmodell.
 *
 * Die Substanz wird in der national abgestimmten Werteliste gesucht
 * (KBV_VS_AllergyIntolerance_Substance_SNOMED_CT, 197 SNOMED-CT-Konzepte); die Manifestationen einer
 * Reaktion in KBV_VS_AllergyIntolerance_Manifestation_SNOMED_CT. Beide Bindungen sind extensible — ein Freitext ist
 * erlaubt, bleibt aber unkodiert und erreicht keine AMTS-Prüfung. Die Maske sagt das dort,
 * wo die Entscheidung fällt.
 */

export type Allergieentwurf = Omit<Allergie, 'id' | 'herkunft'>;

const KATEGORIEN = Object.keys(WIRKSTOFFKATEGORIE_CODE) as Wirkstoffkategorie[];
const KRITIKALITAETEN: Kritikalitaet[] = [
  'hohes Risiko',
  'niedriges Risiko',
  'Risiko nicht einschätzbar',
];

const sct = (e: SnomedWerteintrag): Kodierung => ({
  system: CODESYSTEM.snomed,
  code: e.snomed,
  anzeige: e.bezeichnung,
});

function wertelisteSuchen(liste: readonly SnomedWerteintrag[], hoechstens = 10) {
  return (begriff: string) =>
    terminologieSuchen(
      liste,
      begriff,
      (e) => ({
        codes: [e.snomed],
        bezeichnung: e.bezeichnung,
        synonyme: [...e.synonyme, e.anzeigeEn],
      }),
      hoechstens,
    );
}

const substanzSuchen = wertelisteSuchen(substanzen);
const manifestationSuchen = wertelisteSuchen(manifestationen, 8);
/** Häufige Expositionswege zuerst; die übrigen der 63 Konzepte alphabetisch dahinter. */
const HAEUFIGE_WEGE = [
  '26643006',
  '448598008',
  '47625008',
  '78421000',
  '34206005',
  '447694001',
  '46713006',
  '54485002',
  '37161004',
];
const WEGE = [...expositionswege].sort((a, b) => {
  const ia = HAEUFIGE_WEGE.indexOf(a.snomed);
  const ib = HAEUFIGE_WEGE.indexOf(b.snomed);
  if (ia !== -1 || ib !== -1) return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  return a.bezeichnung.localeCompare(b.bezeichnung, 'de');
});

export function leererAllergieentwurf(
  patientId: string,
  heute: string,
  person: string,
): Allergieentwurf {
  return {
    patientId,
    substanz: '',
    snomed: null,
    typ: 'Allergie',
    kategorien: [],
    gewissheit: 'bestätigt',
    kritikalitaet: 'Risiko nicht einschätzbar',
    reaktionen: [],
    klinischerStatus: 'aktiv',
    beginn: null,
    ende: null,
    dokumentiertAm: heute,
    feststellendePerson: person,
    notiz: null,
    epaId: null,
    epaFassung: null,
  };
}

export function AllergieFormular({
  ausgang,
  kvnr,
  heute,
  person,
  titel,
  liste = OHNE_LISTE,
  beiSpeichern,
  beiAbbruch,
}: {
  ausgang: Allergieentwurf;
  kvnr: string;
  heute: string;
  person: string;
  titel: string;
  /** Kann die Allergie in der Allergienliste der ePA geführt werden (✦ Diagnose-Service)? */
  liste?: Listenoption;
  beiSpeichern: (entwurf: Allergieentwurf, inEpaListe: boolean, psRelevant: boolean) => void;
  beiAbbruch?: () => void;
}) {
  const [e, setzeE] = useState<Allergieentwurf>(ausgang);
  const [substanzNeu, setzeSubstanzNeu] = useState(ausgang.substanz === '');
  // Allergien sind der notfallrelevanteste Einzelblock — ohne eigene Wahl gehören sie in die Liste.
  const [listeGewaehlt, setzeListeGewaehlt] = useState<boolean | null>(null);
  const inListe = listeGewaehlt ?? true;
  const [psGewaehlt, setzePsGewaehlt] = useState<boolean | null>(null);
  const psRelevant = psGewaehlt ?? true;
  const setze = <K extends keyof Allergieentwurf>(feld: K, wert: Allergieentwurf[K]) =>
    setzeE((alt) => ({ ...alt, [feld]: wert }));

  function substanzWaehlen(eintrag: SnomedWerteintrag | null, freitext?: string) {
    const atc = atcFuerSubstanz(eintrag?.snomed ?? null);
    setzeE((alt) => ({
      ...alt,
      substanz: eintrag?.bezeichnung ?? freitext ?? '',
      snomed: eintrag ? sct(eintrag) : null,
      // Mit einer Arzneimittelzuordnung ist die Kategorie klar; sonst entscheidet die Ärztin.
      kategorien: atc.length > 0 && alt.kategorien.length === 0 ? ['Medikation'] : alt.kategorien,
    }));
    setzeSubstanzNeu(false);
  }

  function reaktionAendern(i: number, teil: Partial<Reaktion>) {
    setzeE((alt) => ({
      ...alt,
      reaktionen: alt.reaktionen.map((r, j) => (j === i ? { ...r, ...teil } : r)),
    }));
  }

  const zuordnung = amtsZuordnung.find((z) => z.snomed === e.snomed?.code) ?? null;
  const reaktionOhneManifestation = e.reaktionen.some((r) => r.manifestationen.length === 0);
  const vorschau = useMemo(
    () =>
      allergieNachFhir(
        {
          ...e,
          id: 'vorschau',
          herkunft: {
            bestand: 'lokal',
            quelle: 'Hausarztpraxis am Stadtgarten',
            zeitpunkt: `${heute}T00:00:00`,
            verantwortlich: person,
            dokumentId: null,
          },
        },
        kvnr,
      ),
    [e, heute, person, kvnr],
  );

  return (
    <Karte
      titel={titel}
      werkzeuge={
        beiAbbruch && (
          <button type="button" className="knopf klein" onClick={beiAbbruch}>
            schließen
          </button>
        )
      }
    >
      {substanzNeu ? (
        <>
          <Terminologiesuche
            beschriftung="Auslösende Substanz — national abgestimmte Werteliste"
            platzhalter="Substanz oder Gruppe, z. B. Penicillin, Erdnuss, Birke, Kontrastmittel"
            suchen={substanzSuchen}
            schluessel={(t) => t.eintrag.snomed}
            beiAuswahl={(t) => substanzWaehlen(t.eintrag)}
            anfangswert={e.snomed ? '' : e.substanz}
            autoFocus
            zeile={(t) => (
              <span className="vorschlag">
                <b>{t.eintrag.bezeichnung}</b>
                {t.synonym && <span className="leise-klein"> · gefunden über „{t.ueber}"</span>}
                <span className="vorschlag-codes">
                  <span className="code">SNOMED CT {t.eintrag.snomed}</span>
                  <span className="leise-klein">{t.eintrag.anzeigeEn}</span>
                  {atcFuerSubstanz(t.eintrag.snomed).length > 0 && (
                    <span className="marker neutral">
                      AMTS: ATC {atcFuerSubstanz(t.eintrag.snomed).join(', ')}
                    </span>
                  )}
                </span>
              </span>
            )}
            zusatz={(begriff, anzahl) => (
              <div className="freitextwahl">
                {anzahl === 0 && <span>Nicht in der Werteliste. </span>}
                <button
                  type="button"
                  className="knopf klein"
                  onClick={() => substanzWaehlen(null, begriff)}
                >
                  „{begriff}" als Freitext übernehmen
                </button>
              </div>
            )}
          />
          {beiAbbruch && e.substanz && (
            <button type="button" className="knopf klein" onClick={() => setzeSubstanzNeu(false)}>
              Substanz beibehalten
            </button>
          )}
        </>
      ) : (
        <>
          <div className="kodierblock">
            <div className="kodierblock-titel">
              <b>{e.substanz}</b>
              <button
                type="button"
                className={`knopf klein rechts ${e.snomed ? '' : 'stark'}`}
                disabled={liste.verknuepft}
                onClick={() => setzeSubstanzNeu(true)}
              >
                {e.snomed ? 'Substanz ändern' : 'mit der Werteliste kodieren'}
              </button>
            </div>
            {liste.verknuepft && (
              <div className="leise-klein" style={{ marginBottom: 6 }}>
                Substanz in der Allergienliste festgelegt.
              </div>
            )}
            <dl>
              <div>
                <dt>SNOMED CT</dt>
                <dd>
                  {e.snomed ? (
                    <>
                      <span className="code">{e.snomed.code}</span> aus der Werteliste
                    </>
                  ) : (
                    <Marker ton="warn">Freitext — nicht kodiert</Marker>
                  )}
                </dd>
              </div>
              <div>
                <dt>AMTS-Prüfung</dt>
                <dd>
                  {zuordnung ? (
                    <>
                      über ATC <span className="code">{zuordnung.atc.join(', ')}</span>{' '}
                      <span className="leise-klein">(Demo-Zuordnung, {zuordnung.weg})</span>
                    </>
                  ) : e.snomed ? (
                    <span className="leise-klein">—</span>
                  ) : (
                    <Marker ton="warn">nicht möglich ohne Code</Marker>
                  )}
                </dd>
              </div>
            </dl>
          </div>

          <div className="feldreihe">
            <Auswahl
              id="a-typ"
              beschriftung="Typ"
              wert={e.typ}
              optionen={[
                ['Allergie', 'Allergie'],
                ['Unverträglichkeit', 'Unverträglichkeit'],
              ]}
              aendern={(w) => setze('typ', w as AllergieTyp)}
            />
            <Auswahl
              id="a-status"
              beschriftung="Klinischer Status"
              wert={e.klinischerStatus}
              optionen={Object.entries(ALLERGIESTATUS_BEZEICHNUNG)}
              aendern={(w) => setze('klinischerStatus', w as AllergieStatus)}
            />
          </div>

          <fieldset className="feldgruppe">
            <legend>Wirkstoffkategorie</legend>
            <div className="reihe">
              {KATEGORIEN.map((k) => (
                <label key={k} className="kaestchen">
                  <input
                    type="checkbox"
                    checked={e.kategorien.includes(k)}
                    onChange={(ev) =>
                      setze(
                        'kategorien',
                        ev.target.checked
                          ? [...e.kategorien, k]
                          : e.kategorien.filter((x) => x !== k),
                      )
                    }
                  />
                  {k}
                </label>
              ))}
            </div>
          </fieldset>

          <div className="feldreihe">
            <Auswahl
              id="a-gewissheit"
              beschriftung="Gewissheit"
              wert={e.gewissheit}
              optionen={Object.entries(GEWISSHEIT_BEZEICHNUNG)}
              aendern={(w) => setze('gewissheit', w as Gewissheit)}
            />
            <Auswahl
              id="a-kritikalitaet"
              beschriftung="Kritikalität"
              wert={e.kritikalitaet}
              optionen={KRITIKALITAETEN.map((k) => [k, k] as [string, string])}
              aendern={(w) => setze('kritikalitaet', w as Kritikalitaet)}
            />
          </div>

          <div className="feldreihe">
            <Datum
              id="a-von"
              beschriftung="Zeitraum von"
              wert={e.beginn ?? ''}
              aendern={(w) => setze('beginn', w || null)}
            />
            <Datum
              id="a-bis"
              beschriftung="Zeitraum bis"
              wert={e.ende ?? ''}
              aendern={(w) => setze('ende', w || null)}
            />
          </div>

          <fieldset className="feldgruppe">
            <legend>Reaktionen ({e.reaktionen.length})</legend>
            {e.reaktionen.map((r, i) => (
              <ReaktionFeld
                key={i}
                nummer={i + 1}
                reaktion={r}
                aendern={(teil) => reaktionAendern(i, teil)}
                entfernen={() =>
                  setze(
                    'reaktionen',
                    e.reaktionen.filter((_, j) => j !== i),
                  )
                }
              />
            ))}
            <button
              type="button"
              className="knopf klein"
              onClick={() =>
                setze('reaktionen', [
                  ...e.reaktionen,
                  { manifestationen: [], schweregrad: null, datum: null, expositionsweg: null },
                ])
              }
            >
              Reaktion hinzufügen
            </button>
          </fieldset>

          <div className="feldreihe">
            <Text
              id="a-person"
              beschriftung="Feststellende Person"
              wert={e.feststellendePerson ?? ''}
              aendern={(w) => setze('feststellendePerson', w || null)}
            />
          </div>
          <Text
            id="a-notiz"
            beschriftung="Notiz"
            wert={e.notiz ?? ''}
            aendern={(w) => setze('notiz', w || null)}
          />

          <p className="leise-klein">
            Dokumentiert am {deutschesDatum(heute)} von {person}
          </p>

          <Listenwahl
            liste="Allergienliste"
            option={liste}
            gewaehlt={inListe}
            aendern={setzeListeGewaehlt}
            vorbelegung="für jede Allergie"
            markierung={{
              gewaehlt: psRelevant,
              aendern: setzePsGewaehlt,
              vorbelegung: 'für jede Allergie',
            }}
          />

          {reaktionOhneManifestation && (
            <div className="hinweisbox warn">
              Jede Reaktion braucht mindestens eine Manifestation.
            </div>
          )}

          <div className="reihe" style={{ gap: 8, marginBottom: 10 }}>
            <button
              type="button"
              className="knopf stark"
              disabled={reaktionOhneManifestation || !e.substanz}
              onClick={() =>
                beiSpeichern(
                  { ...e, dokumentiertAm: heute },
                  liste.moeglich && inListe,
                  liste.moeglich && inListe && psRelevant,
                )
              }
            >
              Allergie speichern
            </button>
            {beiAbbruch && (
              <button type="button" className="knopf" onClick={beiAbbruch}>
                verwerfen
              </button>
            )}
          </div>

          <details className="aufklapper">
            <summary>FHIR-Vorschau — AllergyIntolerance nach allergyIntolerance-eu-core</summary>
            <pre className="code-block">{JSON.stringify(vorschau, null, 2)}</pre>
          </details>
        </>
      )}
    </Karte>
  );
}

function ReaktionFeld({
  nummer,
  reaktion,
  aendern,
  entfernen,
}: {
  nummer: number;
  reaktion: Reaktion;
  aendern: (teil: Partial<Reaktion>) => void;
  entfernen: () => void;
}) {
  return (
    <div className="reaktion">
      <div className="reihe">
        <b>Reaktion {nummer}</b>
        <button type="button" className="knopf klein rechts" onClick={entfernen}>
          entfernen
        </button>
      </div>
      <div className="chips">
        {reaktion.manifestationen.map((m) => (
          <span key={m.code || m.anzeige} className="chip">
            {m.anzeige}
            {m.code && <span className="code">{m.code}</span>}
            <button
              type="button"
              aria-label={`${m.anzeige} entfernen`}
              onClick={() =>
                aendern({ manifestationen: reaktion.manifestationen.filter((x) => x !== m) })
              }
            >
              ×
            </button>
          </span>
        ))}
      </div>
      <Terminologiesuche
        beschriftung="Manifestation hinzufügen"
        platzhalter="z. B. Urtikaria, Atemnot, Anaphylaxie"
        suchen={manifestationSuchen}
        schluessel={(t) => t.eintrag.snomed}
        beiAuswahl={(t) =>
          !reaktion.manifestationen.some((m) => m.code === t.eintrag.snomed) &&
          aendern({ manifestationen: [...reaktion.manifestationen, sct(t.eintrag)] })
        }
        zeile={(t) => (
          <span className="vorschlag">
            <b>{t.eintrag.bezeichnung}</b>
            {t.synonym && <span className="leise-klein"> · „{t.ueber}"</span>}
            <span className="vorschlag-codes">
              <span className="code">SNOMED CT {t.eintrag.snomed}</span>
            </span>
          </span>
        )}
        zusatz={(begriff, anzahl) =>
          anzahl === 0 && (
            <button
              type="button"
              className="knopf klein"
              onClick={() =>
                aendern({
                  manifestationen: [
                    ...reaktion.manifestationen,
                    { system: '', code: '', anzeige: begriff },
                  ],
                })
              }
            >
              „{begriff}" als Freitext
            </button>
          )
        }
      />
      <div className="feldreihe">
        <Auswahl
          id={`r${nummer}-schwere`}
          beschriftung="Schweregrad"
          wert={reaktion.schweregrad ?? ''}
          optionen={[['', 'nicht angegeben'], ...Object.entries(REAKTIONSSCHWEREGRAD_BEZEICHNUNG)]}
          aendern={(w) => aendern({ schweregrad: w === '' ? null : (w as Reaktionsschweregrad) })}
        />
        <Datum
          id={`r${nummer}-datum`}
          beschriftung="Ereignisdatum"
          wert={reaktion.datum ?? ''}
          aendern={(w) => aendern({ datum: w || null })}
        />
        <Auswahl
          id={`r${nummer}-weg`}
          beschriftung="Expositionsweg"
          wert={reaktion.expositionsweg?.code ?? ''}
          optionen={[
            ['', 'nicht angegeben'],
            ...WEGE.map((w) => [w.snomed, w.bezeichnung] as [string, string]),
          ]}
          aendern={(w) => {
            const weg = expositionswege.find((x) => x.snomed === w);
            aendern({ expositionsweg: weg ? sct(weg) : null });
          }}
        />
      </div>
    </div>
  );
}
