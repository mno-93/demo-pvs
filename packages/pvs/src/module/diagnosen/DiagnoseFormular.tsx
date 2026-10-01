import { useState } from 'react';
import {
  CODESYSTEM,
  DIAGNOSEART_BEZEICHNUNG,
  DIAGNOSESICHERHEIT_BEZEICHNUNG,
  KLINISCHER_STATUS_BEZEICHNUNG,
  SEITENLOKALISATION_BEZEICHNUNG,
  SNOMED_VERSION,
  ZUSATZKENNZEICHEN_BEZEICHNUNG,
  deutschesDatum,
  diagnoseNachFhir,
  icd10gm,
  kodierservice,
  schweregrade,
  sicherheitAusZusatzkennzeichen,
  statusAusZusatzkennzeichen,
  suche,
  terminologieSuchen,
  type Diagnose,
  type Diagnoseart,
  type Diagnosesicherheit,
  type IcdEintrag,
  type KlinischerStatus,
  type KodierserviceEintrag,
  type Seitenlokalisation,
  type Zusatzkennzeichen,
} from '@demo-pvs/kern';
import { Karte, Marker } from '../../bausteine/Bausteine.js';
import { Terminologiesuche } from '../../bausteine/Terminologiesuche.js';
import { Listenwahl, OHNE_LISTE, type Listenoption } from './Listenwahl.js';

/**
 * Erfassen und Bearbeiten einer Diagnose nach dem Informationsmodell der Patient Summary.
 *
 * Gesucht wird wie im Praxisalltag über einen Begriff. Der Kodierservice hinterlegt dazu
 * ICD-10-GM und SNOMED CT in einem Schritt — nach dem Vorbild des zentralen Kodierservice in
 * Österreich. Die Ärztin wählt einen Begriff, nicht zwei Codes.
 *
 * Bei klinischem Status „Aktiv" gibt es nur einen Beginn, kein Ende. Und ob die Diagnose in der Diagnosenliste der
 * ePA geführt wird, ist ein Kästchen in derselben Maske — kein zweiter Schritt.
 */

export type Diagnoseentwurf = Omit<Diagnose, 'id' | 'fallId' | 'herkunft'>;

type Vorschlag =
  | { art: 'kodierservice'; eintrag: KodierserviceEintrag; ueber: string; synonym: boolean }
  | { art: 'icd'; eintrag: IcdEintrag };

/** Kodierservice zuerst; ICD-10-GM allein nur, wo der Auszug keine SNOMED-CT-Zuordnung kennt. */
export function diagnoseVorschlaege(begriff: string): Vorschlag[] {
  const ausDienst: Vorschlag[] = terminologieSuchen(
    kodierservice,
    begriff,
    (e) => ({ codes: [e.icd10gm, e.snomed], bezeichnung: e.begriff, synonyme: e.synonyme }),
    8,
  ).map((t) => ({ art: 'kodierservice', ...t }));
  const schonDa = new Set(
    ausDienst.map((v) => (v.art === 'kodierservice' ? v.eintrag.icd10gm : '')),
  );
  const ausIcd: Vorschlag[] = suche(
    icd10gm,
    begriff,
    (e) => e.code,
    (e) => e.bezeichnung,
    8,
  )
    .filter((e) => !schonDa.has(e.code))
    .map((e) => {
      const zuordnung = kodierservice.find((k) => k.icd10gm === e.code);
      return zuordnung
        ? {
            art: 'kodierservice' as const,
            eintrag: zuordnung,
            ueber: e.bezeichnung,
            synonym: false,
          }
        : { art: 'icd' as const, eintrag: e };
    });
  return [...ausDienst, ...ausIcd].slice(0, 12);
}

function schluessel(v: Vorschlag): string {
  return v.art === 'kodierservice'
    ? `ks-${v.eintrag.icd10gm}-${v.eintrag.snomed}`
    : `icd-${v.eintrag.code}`;
}

export function leererEntwurf(patientId: string, heute: string, person: string): Diagnoseentwurf {
  return {
    patientId,
    code: '',
    bezeichnung: '',
    snomed: null,
    alphaId: null,
    zusatzkennzeichen: 'G',
    seitenlokalisation: null,
    diagnosesicherheit: 'gesichert',
    art: 'akut',
    klinischerStatus: 'aktiv',
    schweregrad: null,
    koerperstelle: null,
    beginn: heute,
    ende: null,
    festgestelltAm: heute,
    dokumentiertAm: heute,
    feststellendePerson: person,
    notiz: null,
    epaId: null,
    epaFassung: null,
  };
}

export function DiagnoseFormular({
  ausgang,
  kvnr,
  heute,
  person,
  titel,
  liste = OHNE_LISTE,
  beiSpeichern,
  beiAbbruch,
}: {
  ausgang: Diagnoseentwurf;
  kvnr: string;
  heute: string;
  person: string;
  titel: string;
  /** Kann die Diagnose in der Diagnosenliste der ePA geführt werden (✦ Diagnose-Service)? */
  liste?: Listenoption;
  beiSpeichern: (entwurf: Diagnoseentwurf, inEpaListe: boolean, psRelevant: boolean) => void;
  beiAbbruch?: () => void;
}) {
  const [e, setzeE] = useState<Diagnoseentwurf>(ausgang);
  const [kodierungNeu, setzeKodierungNeu] = useState(ausgang.code === '');
  const [vorbelegt, setzeVorbelegt] = useState(false);
  // Ohne eigene Wahl folgt das Kästchen der Kategorie: Dauerdiagnosen gehören in die Liste.
  const [listeGewaehlt, setzeListeGewaehlt] = useState<boolean | null>(null);
  const inListe = listeGewaehlt ?? (liste.verknuepft || e.art === 'dauer');
  const [psGewaehlt, setzePsGewaehlt] = useState<boolean | null>(null);
  const psRelevant = psGewaehlt ?? e.art === 'dauer';
  const setze = <K extends keyof Diagnoseentwurf>(feld: K, wert: Diagnoseentwurf[K]) =>
    setzeE((alt) => ({ ...alt, [feld]: wert }));

  function waehlen(v: Vorschlag) {
    if (v.art === 'kodierservice') {
      const icd = icd10gm.find((i) => i.code === v.eintrag.icd10gm);
      setzeE((alt) => ({
        ...alt,
        code: v.eintrag.icd10gm,
        bezeichnung: icd?.bezeichnung ?? v.eintrag.begriff,
        snomed: { system: CODESYSTEM.snomed, code: v.eintrag.snomed, anzeige: v.eintrag.begriff },
      }));
    } else {
      setzeE((alt) => ({
        ...alt,
        code: v.eintrag.code,
        bezeichnung: v.eintrag.bezeichnung,
        snomed: null,
      }));
    }
    setzeKodierungNeu(false);
  }

  function zusatzWaehlen(z: Zusatzkennzeichen) {
    // Beide Angaben stehen im Modell nebeneinander; die eine belegt die andere vor.
    setzeE((alt) => {
      const klinischerStatus = statusAusZusatzkennzeichen(z);
      return {
        ...alt,
        zusatzkennzeichen: z,
        diagnosesicherheit: sicherheitAusZusatzkennzeichen(z),
        klinischerStatus,
        ende: klinischerStatus === 'aktiv' ? null : alt.ende,
      };
    });
    setzeVorbelegt(true);
  }

  /** Bei klinischem Status „Aktiv" gibt es nur einen Beginn, kein Ende. */
  const nurBeginn = e.klinischerStatus === 'aktiv';

  const dienst = kodierservice.find((k) => k.icd10gm === e.code && k.snomed === e.snomed?.code);
  const vorschau = diagnoseNachFhir(
    {
      ...e,
      id: 'vorschau',
      fallId: null,
      herkunft: {
        bestand: 'lokal',
        quelle: 'Hausarztpraxis am Stadtgarten',
        zeitpunkt: `${heute}T00:00:00`,
        verantwortlich: person,
        dokumentId: null,
      },
    },
    kvnr,
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
      {kodierungNeu ? (
        <>
          <Terminologiesuche
            beschriftung="Diagnose suchen — Kodierservice"
            platzhalter="Begriff, Synonym oder Code, z. B. Bluthochdruck, Zucker, I48"
            suchen={diagnoseVorschlaege}
            schluessel={schluessel}
            beiAuswahl={waehlen}
            anfangswert={e.code}
            autoFocus
            zeile={(v) =>
              v.art === 'kodierservice' ? (
                <span className="vorschlag">
                  <b>{v.eintrag.begriff}</b>
                  {v.synonym && <span className="leise-klein"> · gefunden über „{v.ueber}"</span>}
                  <span className="vorschlag-codes">
                    <span className="code">ICD-10-GM {v.eintrag.icd10gm}</span>
                    <span className="code">SNOMED CT {v.eintrag.snomed}</span>
                    {v.eintrag.unsicher && (
                      <span className="marker warn">⚠ Zuordnung ungeprüft</span>
                    )}
                  </span>
                </span>
              ) : (
                <span className="vorschlag">
                  <b>{v.eintrag.bezeichnung}</b>
                  <span className="vorschlag-codes">
                    <span className="code">ICD-10-GM {v.eintrag.code}</span>
                    <span className="marker neutral">ohne SNOMED-CT-Zuordnung im Auszug</span>
                  </span>
                </span>
              )
            }
            zusatz={(_, anzahl) => anzahl === 0 && <div className="hinweisbox">Kein Treffer.</div>}
          />
          {beiAbbruch && e.code && (
            <button type="button" className="knopf klein" onClick={() => setzeKodierungNeu(false)}>
              Kodierung beibehalten
            </button>
          )}
        </>
      ) : (
        <>
          <div className="kodierblock">
            <div className="kodierblock-titel">
              <b>{e.bezeichnung}</b>
              <button
                type="button"
                className={`knopf klein rechts ${e.snomed ? '' : 'stark'}`}
                disabled={liste.verknuepft}
                onClick={() => setzeKodierungNeu(true)}
              >
                {e.snomed ? 'Kodierung ändern' : 'SNOMED CT über den Kodierservice ergänzen'}
              </button>
            </div>
            {liste.verknuepft && (
              <div className="leise-klein" style={{ marginBottom: 6 }}>
                Kodierung in der Diagnosenliste festgelegt.
              </div>
            )}
            <dl>
              <div>
                <dt>ICD-10-GM</dt>
                <dd>
                  <span className="code">
                    {e.code} {e.zusatzkennzeichen}
                    {e.seitenlokalisation ? ` ${e.seitenlokalisation}` : ''}
                  </span>
                </dd>
              </div>
              <div>
                <dt>SNOMED CT</dt>
                <dd>
                  {e.snomed ? (
                    <>
                      <span className="code">{e.snomed.code}</span> {e.snomed.anzeige}
                      {dienst && <span className="leise-klein"> · {dienst.anzeigeEn}</span>}
                      <div className="leise-klein">{SNOMED_VERSION}</div>
                    </>
                  ) : (
                    <Marker ton="warn">nicht kodiert</Marker>
                  )}
                </dd>
              </div>
              <div>
                <dt>Alpha-ID</dt>
                <dd className="leise-klein">—</dd>
              </div>
            </dl>
            {dienst?.hinweis && <div className="hinweisbox warn">{dienst.hinweis}</div>}
            {dienst?.unsicher && <div className="hinweisbox warn">⚠ Zuordnung ungeprüft</div>}
          </div>

          <div className="feldreihe">
            <Auswahl
              id="d-zusatz"
              beschriftung="ICD-Diagnosesicherheit"
              wert={e.zusatzkennzeichen}
              optionen={Object.entries(ZUSATZKENNZEICHEN_BEZEICHNUNG).map(([k, b]) => [
                k,
                `${k} — ${b}`,
              ])}
              aendern={(w) => zusatzWaehlen(w as Zusatzkennzeichen)}
            />
            <Auswahl
              id="d-seite"
              beschriftung="ICD-Seitenlokalisation"
              wert={e.seitenlokalisation ?? ''}
              optionen={[['', 'keine'], ...Object.entries(SEITENLOKALISATION_BEZEICHNUNG)]}
              aendern={(w) =>
                setze('seitenlokalisation', w === '' ? null : (w as Seitenlokalisation))
              }
            />
          </div>

          <div className="feldreihe">
            <Auswahl
              id="d-sicherheit"
              beschriftung="Diagnosesicherheit"
              wert={e.diagnosesicherheit}
              optionen={Object.entries(DIAGNOSESICHERHEIT_BEZEICHNUNG)}
              aendern={(w) => setze('diagnosesicherheit', w as Diagnosesicherheit)}
              hinweis={vorbelegt ? 'aus dem Zusatzkennzeichen vorbelegt' : undefined}
            />
            <Auswahl
              id="d-status"
              beschriftung="Klinischer Status"
              wert={e.klinischerStatus}
              optionen={Object.entries(KLINISCHER_STATUS_BEZEICHNUNG)}
              aendern={(w) =>
                setzeE((alt) => ({
                  ...alt,
                  klinischerStatus: w as KlinischerStatus,
                  ende: w === 'aktiv' ? null : alt.ende,
                }))
              }
            />
          </div>

          <div className="feldreihe">
            <Auswahl
              id="d-art"
              beschriftung="Kategorie"
              wert={e.art}
              optionen={Object.entries(DIAGNOSEART_BEZEICHNUNG)}
              aendern={(w) => setze('art', w as Diagnoseart)}
            />
            <Auswahl
              id="d-schwere"
              beschriftung="Schweregrad (SNOMED CT)"
              wert={e.schweregrad?.code ?? ''}
              optionen={[
                ['', 'nicht angegeben'],
                ...schweregrade.map(
                  (s) => [s.snomed, `${s.bezeichnung} (${s.snomed})`] as [string, string],
                ),
              ]}
              aendern={(w) => {
                const s = schweregrade.find((x) => x.snomed === w);
                setze(
                  'schweregrad',
                  s ? { system: CODESYSTEM.snomed, code: s.snomed, anzeige: s.bezeichnung } : null,
                );
              }}
            />
          </div>

          <div className="feldreihe">
            <Datum
              id="d-von"
              beschriftung="Zeitraum von"
              wert={e.beginn}
              aendern={(w) => setze('beginn', w || heute)}
            />
            <Datum
              id="d-bis"
              beschriftung="Zeitraum bis"
              wert={e.ende ?? ''}
              aendern={(w) => setze('ende', w || null)}
              gesperrt={nurBeginn}
              hinweis={nurBeginn ? 'bei Status „Aktiv" nur Beginn' : undefined}
            />
            <Datum
              id="d-festgestellt"
              beschriftung="Feststellungsdatum"
              wert={e.festgestelltAm ?? ''}
              aendern={(w) => setze('festgestelltAm', w || null)}
            />
          </div>

          <div className="feldreihe">
            <Text
              id="d-person"
              beschriftung="Feststellende Person"
              wert={e.feststellendePerson ?? ''}
              aendern={(w) => setze('feststellendePerson', w || null)}
            />
            <Text
              id="d-koerper"
              beschriftung="Körperstelle"
              wert={e.koerperstelle ?? ''}
              platzhalter="z. B. linkes Kniegelenk"
              aendern={(w) => setze('koerperstelle', w || null)}
            />
          </div>

          <Text
            id="d-notiz"
            beschriftung="Notiz"
            wert={e.notiz ?? ''}
            aendern={(w) => setze('notiz', w || null)}
          />

          <p className="leise-klein">
            Dokumentiert am {deutschesDatum(heute)} von {person}
          </p>

          <Listenwahl
            liste="Diagnosenliste"
            option={liste}
            gewaehlt={inListe}
            aendern={setzeListeGewaehlt}
            vorbelegung="für Dauerdiagnosen"
            markierung={{
              gewaehlt: psRelevant,
              aendern: setzePsGewaehlt,
              vorbelegung: 'für Dauerdiagnosen',
            }}
          />

          <div className="reihe" style={{ gap: 8, marginBottom: 10 }}>
            <button
              type="button"
              className="knopf stark"
              onClick={() =>
                beiSpeichern(
                  { ...e, dokumentiertAm: heute },
                  liste.moeglich && inListe,
                  liste.moeglich && inListe && psRelevant,
                )
              }
            >
              Diagnose speichern
            </button>
            {beiAbbruch && (
              <button type="button" className="knopf" onClick={beiAbbruch}>
                verwerfen
              </button>
            )}
          </div>

          <details className="aufklapper">
            <summary>
              FHIR-Vorschau — Condition nach ti-condition-diagnosis (TI 1.5.0-ballot.1)
            </summary>
            <pre className="code-block">{JSON.stringify(vorschau, null, 2)}</pre>
          </details>
        </>
      )}
    </Karte>
  );
}

/* ---------- Feldbausteine ---------- */

export function Auswahl({
  id,
  beschriftung,
  wert,
  optionen,
  aendern,
  hinweis,
}: {
  id: string;
  beschriftung: string;
  wert: string;
  optionen: readonly (readonly [string, string])[];
  aendern: (wert: string) => void;
  hinweis?: string;
}) {
  return (
    <div className="feldzeile">
      <label htmlFor={id}>{beschriftung}</label>
      <select id={id} value={wert} onChange={(ev) => aendern(ev.target.value)}>
        {optionen.map(([k, b]) => (
          <option key={k} value={k}>
            {b}
          </option>
        ))}
      </select>
      {hinweis && <div className="leise-klein">{hinweis}</div>}
    </div>
  );
}

export function Datum({
  id,
  beschriftung,
  wert,
  aendern,
  gesperrt = false,
  hinweis,
}: {
  id: string;
  beschriftung: string;
  wert: string;
  aendern: (wert: string) => void;
  gesperrt?: boolean;
  hinweis?: string;
}) {
  return (
    <div className="feldzeile">
      <label htmlFor={id}>{beschriftung}</label>
      <input
        id={id}
        type="date"
        value={wert}
        disabled={gesperrt}
        onChange={(ev) => aendern(ev.target.value)}
      />
      {hinweis && <div className="leise-klein">{hinweis}</div>}
    </div>
  );
}

export function Text({
  id,
  beschriftung,
  wert,
  aendern,
  platzhalter,
}: {
  id: string;
  beschriftung: string;
  wert: string;
  aendern: (wert: string) => void;
  platzhalter?: string;
}) {
  return (
    <div className="feldzeile">
      <label htmlFor={id}>{beschriftung}</label>
      <input
        id={id}
        type="text"
        value={wert}
        placeholder={platzhalter}
        onChange={(ev) => aendern(ev.target.value)}
      />
    </div>
  );
}
