/**
 * ✦ VORSCHLAG — Der Aktenlotse in der Praxis.
 *
 * Zwei Spalten, weil im Gespräch zwei Dinge gleichzeitig gebraucht werden:
 *
 * - **Überblick** (links): was vor dem Kontakt zu wissen ist — was **zu klären** ist
 *   (Entlassmedikation gegen Medikationsplan; der Lotse sagt, dass zwei Angaben auseinandergehen,
 *   nicht, welche stimmt), der **Kontext** zum Anlass als knappe Liste und die **Vorschläge für
 *   die Listen**, nach Liste gruppiert. Vorschläge sind keine Einträge; bestätigen muss ein Mensch.
 * - **Nachlesen** (rechts): die **Frage an die Akte** — oder das Dokument, das hinter einer
 *   Angabe steht, mit den Stellen markiert, auf denen sie beruht.
 *
 * Der Lotse spricht hier über die Person, nicht zu ihr: „Renate Hoffmann war …". Das ergibt
 * sich aus dem Zugang — die Praxis fragt mit ihrer Befugnis, nicht als versicherte Person.
 *
 * Ohne Befugnis antwortet die ePA nicht. Dann steht hier nicht der Fehler, sondern der Weg aus
 * ihm heraus: die Karte einlesen.
 */
import { useEffect, useMemo, useState } from 'react';
import {
  VORSCHLAGSFRAGEN,
  type Lotsenabsatz,
  type Lotsenantwort,
  type Lotsenkontext,
  type Lotsenvorschlaege,
  type Quellenangabe,
  type Quellentext,
} from '@demo-pvs/kern';
import { useZustand } from '../speicher/speicher.js';
import { usePatientId } from '../module/Patientenkartei.js';
import { EgkKnopf } from '../epa/befugnis.js';
import { epaFensterOeffnen } from '../epa/fenster.js';
import {
  dokumentverweisLesen,
  fehlerTitel,
  ohneBefugnis,
  useBetriebsstand,
  type Dokumentverweis,
} from '../epa/epa-bestand.js';
import {
  EpaFehler,
  dokumentAbrufen,
  dokumenteSuchen,
  lotseFragen,
  lotseKontext,
  lotseQuelle,
  lotseVorschlaege,
} from '../epa/klient.js';
import { DokumentBetrachter } from '../bausteine/DokumentBetrachter.js';
import {
  Absaetze,
  Antworthinweis,
  Textquelle,
  Fragefeld,
  Umfangsangabe,
  belegzeilen,
  tag,
} from './bausteine.js';
import { useLotseVorhanden } from './vorhanden.js';
import { useBeschriftung } from './beschriftung.js';

const LISTE_BEZEICHNUNG: Record<string, string> = {
  diagnosen: 'Diagnosen',
  allergien: 'Allergien',
  prozeduren: 'Prozeduren',
};

/** So viele Angaben zum Kontext stehen zunächst — der Rest auf Wunsch. */
const KONTEXT_KURZ = 4;

const ABWEICHUNG_BEZEICHNUNG: Record<string, string> = {
  'fehlt-im-plan': 'im Dokument, nicht im Plan',
  'nur-im-plan': 'im Plan, nicht im Dokument',
  'dosis-abweichend': 'Dosis weicht ab',
};

/** Was rechts zum Nachlesen offen ist: ein Dokument oder eine Unterlage ohne Datei. */
type Geoeffnet =
  | { art: 'dokument'; verweis: Dokumentverweis; inhalt: unknown; markieren: string[] }
  | { art: 'text'; quelle: Quellentext; markieren: string[] };

/** Reiter „Aktenlotse" der Patientenkartei. */
export function PraxisLotse() {
  return <AktenlotseInhalt patientId={usePatientId()} />;
}

/**
 * Der Aktenlotse für eine Akte, aus Sicht der Praxis — im Reiter der Patientenkartei und als
 * Bereich im ePA-Fenster: Er ist eine Anwendung der ePA, das PVS bindet sie ein.
 */
export function AktenlotseInhalt({ patientId }: { patientId: string }) {
  const patient = useZustand((z) => z.patienten.find((p) => p.id === patientId));
  // Ohne Befugnis antwortet die ePA nicht. Wird sie erteilt, liest der Lotse neu — sonst
  // bliebe der Hinweis stehen, obwohl der Zugang inzwischen besteht.
  const befugnisBis = useZustand(
    (z) => z.epaBefugnisse.find((b) => b.patientId === patientId)?.gueltigBis ?? null,
  );
  const kvnr = patient?.versicherung.kvnr ?? '';

  const [kontext, setzeKontext] = useState<Lotsenkontext | null>(null);
  const [vorschlaege, setzeVorschlaege] = useState<Lotsenvorschlaege | null>(null);
  const [verweise, setzeVerweise] = useState<Dokumentverweis[]>([]);
  const [antwort, setzeAntwort] = useState<Lotsenantwort | null>(null);
  const [laeuft, setzeLaeuft] = useState(false);
  const [fehler, setzeFehler] = useState<EpaFehler | Error | null>(null);
  const [bestaetigt, setzeBestaetigt] = useState<Set<string>>(new Set());
  const [geoeffnet, setzeGeoeffnet] = useState<Geoeffnet | null>(null);
  const [kontextGanz, setzeKontextGanz] = useState(false);
  const angeboten = useLotseVorhanden();
  // Dieselbe Quelle wie die Dokumentenlisten (`useBeschriftung`) — eine Aussage je Dokument.
  const beschriftung = useBeschriftung(kvnr);
  const unklar = useMemo(() => [...beschriftung.values()], [beschriftung]);
  // Nach jeder Umstellung der Demo-Steuerung — neue Einträge, Widerspruch, Sperre, entzogene
  // Befugnis — liest der Lotse neu, wie jede andere Ansicht der ePA auch.
  const betriebsstand = useBetriebsstand();

  useEffect(() => {
    if (!kvnr || angeboten !== true) return;
    setzeFehler(null);
    // Eine Antwort von vorher beruht auf einem Stand, den es nicht mehr gibt.
    setzeAntwort(null);
    setzeGeoeffnet(null);
    void lotseKontext(kvnr, 'nach Krankenhausaufenthalt')
      .then(setzeKontext)
      .catch((f: unknown) => {
        // Kein Überblick aus einem Stand, den die ePA gerade abgelehnt hat.
        setzeKontext(null);
        setzeVorschlaege(null);
        setzeFehler(f instanceof Error ? f : new Error('Kontext nicht lesbar'));
      });
    void lotseVorschlaege(kvnr)
      .then(setzeVorschlaege)
      .catch(() => setzeVorschlaege(null));
    void dokumenteSuchen(kvnr)
      .then((r) => setzeVerweise(r.map(dokumentverweisLesen)))
      .catch(() => setzeVerweise([]));
  }, [kvnr, angeboten, befugnisBis, betriebsstand]);

  /** Öffnet die Unterlage hinter einer Angabe und markiert die Stellen, auf denen sie beruht. */
  async function nachlesen(q: Quellenangabe, markieren: string[]) {
    if (!kvnr) return;
    const verweis = verweise.find((v) => v.id === q.quelleId);
    try {
      if (verweis) {
        setzeGeoeffnet({ art: 'dokument', verweis, inhalt: null, markieren });
        const inhalt = await dokumentAbrufen(kvnr, verweis.ressource);
        setzeGeoeffnet({ art: 'dokument', verweis, inhalt, markieren });
      } else {
        // Keine Datei — etwa der Medikationsplan. Dann die Zeilen, die der Lotse gelesen hat.
        setzeGeoeffnet({ art: 'text', quelle: await lotseQuelle(kvnr, q.quelleId), markieren });
      }
    } catch {
      setzeFehler(new Error('Diese Unterlage lässt sich nicht öffnen.'));
    }
  }

  async function fragen(frage: string) {
    if (!kvnr) return;
    setzeLaeuft(true);
    setzeFehler(null);
    setzeGeoeffnet(null);
    try {
      setzeAntwort(await lotseFragen(kvnr, frage, 'fach'));
    } catch (f) {
      setzeFehler(f instanceof Error ? f : new Error('Der Lotse hat nicht geantwortet.'));
    } finally {
      setzeLaeuft(false);
    }
  }

  const gruppen = useMemo(() => {
    const offen = vorschlaege?.vorschlaege.filter((v) => !v.schonInListe) ?? [];
    const nachListe = new Map<string, typeof offen>();
    for (const v of offen) nachListe.set(v.liste, [...(nachListe.get(v.liste) ?? []), v]);
    return [...nachListe.entries()];
  }, [vorschlaege]);

  if (!patient) {
    return <div className="karte">Diese Patientin oder diesen Patienten gibt es nicht.</div>;
  }

  if (angeboten === false) {
    return (
      <div className="karte">
        <Kopf />
        <p className="leer">Aktenlotse in diesem Ausbaustand nicht vorhanden.</p>
      </div>
    );
  }

  /* Ohne Befugnis braucht es keinen Fehlertext, sondern die Karte. */
  if (fehler instanceof EpaFehler && ohneBefugnis(fehler)) {
    return (
      <div className="karte">
        <Kopf />
        <div className="lotse-ohne-rechte">
          <span className="marker">keine Befugnis für diese Akte</span>
          <EgkKnopf patientId={patient.id} stark klein={false} beschriftung="eGK einlesen" />
        </div>
      </div>
    );
  }

  const abweichungen = kontext?.abweichungen ?? [];
  const umfang = kontext?.umfang ?? antwort?.umfang ?? null;

  return (
    <div className="karte lotse-praxis">
      <Kopf
        umfang={
          umfang
            ? `${umfang.gelesen} von ${umfang.gesamt} Unterlagen gelesen${
                umfang.uebergangen.length > 0 ? ` · ${umfang.uebergangen.length} nicht gelesen` : ''
              }`
            : null
        }
      />
      {fehler && (
        <p className="lotse-fehler">
          {fehler instanceof EpaFehler ? (
            <>
              <b>{fehlerTitel(fehler)}</b> {fehler.diagnose}
            </>
          ) : (
            fehler.message
          )}
        </p>
      )}

      <div className="lotse-raster">
        <div className="lotse-spalte" aria-label="Überblick">
          {abweichungen.length > 0 && (
            <section className="lotse-block lotse-block-warn" aria-label="Zu klären">
              <h3>
                Zu klären <span className="lotse-zahl">{abweichungen.length}</span>
              </h3>
              <ul className="lotse-faktenliste">
                {abweichungen.map((a, i) => (
                  <li key={i}>
                    <span>
                      <b>{a.bezeichnung}</b> — {ABWEICHUNG_BEZEICHNUNG[a.art] ?? a.art}
                    </span>
                    {a.fundstelle && (
                      <QuellenKnopf
                        q={a.fundstelle}
                        oeffnen={() => void nachlesen(a.fundstelle!, [a.fundstelle!.zeile])}
                      />
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {kontext && (
            <section className="lotse-block" aria-label="Kontext">
              <h3>Kontext · {kontext.anlass}</h3>
              {kontext.verlauf.length === 0 ? (
                <p className="leer">Kein belegbarer Verlauf.</p>
              ) : (
                <ul className="lotse-faktenliste">
                  {(kontextGanz ? kontext.verlauf : kontext.verlauf.slice(0, KONTEXT_KURZ)).map(
                    (a: Lotsenabsatz, i) => (
                      <li key={i}>
                        <span>{a.text}</span>
                        {a.quellen[0] && (
                          <QuellenKnopf
                            q={a.quellen[0]}
                            oeffnen={() =>
                              void nachlesen(
                                a.quellen[0]!,
                                belegzeilen([a], a.quellen[0]!.quelleId),
                              )
                            }
                          />
                        )}
                      </li>
                    ),
                  )}
                </ul>
              )}
              {kontext.verlauf.length > KONTEXT_KURZ && (
                <button
                  type="button"
                  className="lotse-mehr"
                  onClick={() => setzeKontextGanz(!kontextGanz)}
                >
                  {kontextGanz
                    ? 'weniger anzeigen'
                    : `${kontext.verlauf.length - KONTEXT_KURZ} weitere Angaben`}
                </button>
              )}
            </section>
          )}

          {unklar.length > 0 && (
            // ✦ Dokumente, deren Metadaten nicht sagen, worum es geht. Der Lotse nennt, was
            // laut Inhalt darin steht, und markiert beim Öffnen den Betreff.
            <section className="lotse-block" aria-label="Unklar beschriftet">
              <h3>
                Unklar beschriftet <span className="lotse-zahl">{unklar.length}</span>
              </h3>
              <ul className="lotse-faktenliste">
                {unklar.map((u) => (
                  <li key={u.quelleId}>
                    <span>
                      <b>„{u.titel}“</b> — laut Inhalt: {u.lautInhalt ?? 'nicht lesbar'}
                      <span className="lotse-gruende">{u.gruende.join(' · ')}</span>
                    </span>
                    <button
                      type="button"
                      className="lotse-quelle-chip"
                      onClick={() =>
                        void nachlesen(
                          {
                            quelleId: u.quelleId,
                            titel: u.titel,
                            datum: u.datumLautInhalt ?? '',
                            einrichtung: '',
                          },
                          u.beleg ? [u.beleg] : [],
                        )
                      }
                    >
                      öffnen
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {gruppen.length > 0 && (
            <section className="lotse-block" aria-label="Vorschläge für die Listen">
              <h3>
                Vorschläge für die Listen{' '}
                <span className="lotse-zahl">{gruppen.reduce((n, [, g]) => n + g.length, 0)}</span>
              </h3>
              {gruppen.map(([liste, eintraege]) => (
                <details key={liste} className="lotse-gruppe">
                  <summary>
                    {LISTE_BEZEICHNUNG[liste] ?? liste}{' '}
                    <span className="lotse-zahl">{eintraege.length}</span>
                  </summary>
                  <ul className="lotse-faktenliste">
                    {eintraege.map((v, i) => {
                      const schluessel = `${v.liste}-${v.text}`;
                      const schonBestaetigt = bestaetigt.has(schluessel);
                      return (
                        <li key={i} className={schonBestaetigt ? 'bestaetigt' : ''}>
                          <span>{v.text}</span>
                          <span className="lotse-zeilenwerkzeuge">
                            <QuellenKnopf
                              q={v.fundstelle}
                              oeffnen={() => void nachlesen(v.fundstelle, [v.fundstelle.zeile])}
                            />
                            <button
                              type="button"
                              className="knopf klein"
                              disabled={schonBestaetigt}
                              onClick={() =>
                                setzeBestaetigt((vorher) => new Set(vorher).add(schluessel))
                              }
                            >
                              {schonBestaetigt ? 'bestätigt' : 'Bestätigen'}
                            </button>
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </details>
              ))}
              <p className="herkunft">maschinell vorgeschlagen · Bestätigen schreibt nichts</p>
            </section>
          )}
          {umfang && umfang.uebergangen.length > 0 && <Umfangsangabe umfang={umfang} />}
        </div>

        <div className="lotse-spalte" aria-label="Nachlesen">
          {geoeffnet ? (
            <section className="lotse-block lotse-dokument" aria-label="Geöffnete Unterlage">
              <div className="lotse-dokument-kopf">
                <div>
                  <h3>
                    {geoeffnet.art === 'dokument'
                      ? geoeffnet.verweis.titel
                      : geoeffnet.quelle.titel}
                  </h3>
                  <span className="herkunft">
                    {geoeffnet.art === 'dokument'
                      ? `${geoeffnet.verweis.autor} · ${tag(geoeffnet.verweis.datum)}`
                      : `${geoeffnet.quelle.einrichtung} · ${tag(geoeffnet.quelle.datum)}`}
                  </span>
                </div>
                <button type="button" className="knopf klein" onClick={() => setzeGeoeffnet(null)}>
                  {antwort ? '← zurück zur Antwort' : '← zur Frage'}
                </button>
              </div>
              {geoeffnet.art === 'dokument' ? (
                geoeffnet.inhalt === null ? (
                  <p className="leer">Wird abgerufen …</p>
                ) : (
                  <DokumentBetrachter
                    inhalt={geoeffnet.inhalt}
                    patientId={patient.id}
                    dokumentId={geoeffnet.verweis.id}
                    bestand="epa"
                    markieren={geoeffnet.markieren}
                  />
                )
              ) : (
                <>
                  <Textquelle zeilen={geoeffnet.quelle.zeilen} markieren={geoeffnet.markieren} />
                  {geoeffnet.quelle.quelleId === 'medikationsplan' && (
                    // Der Plan ist kein Dokument, aber ein Bereich der ePA: dorthin, wo er
                    // gepflegt wird.
                    <button
                      type="button"
                      className="knopf"
                      onClick={() => epaFensterOeffnen(patient.id, 'medikation')}
                    >
                      Im Medikationsplan der ePA öffnen
                    </button>
                  )}
                </>
              )}
            </section>
          ) : (
            <section className="lotse-block" aria-label="Frage an die Akte">
              <h3>Frage an die Akte</h3>
              <Fragefeld
                kennung="lotse-frage-praxis"
                vorschlaege={VORSCHLAGSFRAGEN.praxis}
                laeuft={laeuft}
                fragen={(f) => void fragen(f)}
                beschriftung="Frage an die Akte"
              />
              {laeuft && <p className="leer">Der Lotse liest …</p>}
              {antwort && !laeuft && (
                <div className="lotse-antwort" aria-live="polite">
                  <Antworthinweis antwort={antwort} />
                  <Absaetze
                    absaetze={antwort.absaetze}
                    oeffnen={(q) => void nachlesen(q, belegzeilen(antwort.absaetze, q.quelleId))}
                  />
                </div>
              )}
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

/** Kurzer Verweis auf die Unterlage — öffnet sie rechts, mit der Stelle markiert. */
function QuellenKnopf({ q, oeffnen }: { q: Quellenangabe; oeffnen: () => void }) {
  return (
    <button
      type="button"
      className="lotse-quelle-chip"
      onClick={oeffnen}
      title={`${q.titel}, ${q.einrichtung}, ${tag(q.datum)} — öffnen und Stelle markieren`}
    >
      {q.titel.replace(/ stationäre Behandlung$/, '')} · {tag(q.datum)}
    </button>
  );
}

function Kopf({ umfang = null }: { umfang?: string | null }) {
  return (
    <div className="lotse-kopf">
      <h2>Aktenlotse</h2>
      <span className="vorschlagsmarke">✦ Vorschlag · regelbasiert</span>
      {umfang && <span className="lotse-umfang-kurz">{umfang}</span>}
    </div>
  );
}
