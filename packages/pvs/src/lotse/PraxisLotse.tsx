/**
 * ✦ VORSCHLAG — Der Aktenlotse in der Praxis.
 *
 * Vier Dinge, die eine Stichwortsuche nicht leistet. Sie stehen in **Abschnitten** und nicht
 * nebeneinander: Der Lotse liefert viel auf einmal, und eine Wand liest niemand in acht Minuten.
 * Offen ist, was Handlungsbedarf trägt.
 *
 * - **Zu klären** (S4): Entlassmedikation gegen Medikationsplan. Der Lotse sagt, dass zwei
 *   Angaben auseinandergehen — ausdrücklich nicht, welche stimmt.
 * - **Kontext zum Anlass** (S6): was zuletzt geschehen ist. Zuerst ein Satz, der Rest auf Wunsch.
 * - **Frage an die Akte** (S1): dieselbe Grundlage wie die Versichertensicht, fachsprachlich.
 * - **Vorschläge für die Listen** (S5): was aus unstrukturiertem Text in eine strukturierte Liste
 *   könnte. Vorschläge, keine Einträge; bestätigen muss sie ein Mensch.
 *
 * Ohne Befugnis antwortet die ePA nicht. Dann steht hier nicht der Fehler, sondern der Weg aus
 * ihm heraus: die Karte einlesen.
 */
import { useEffect, useState } from 'react';
import {
  VORSCHLAGSFRAGEN,
  type Lotsenantwort,
  type Lotsenkontext,
  type Lotsenvorschlaege,
  type Quellenangabe,
  type Quellentext,
} from '@demo-pvs/kern';
import { useZustand } from '../speicher/speicher.js';
import { usePatientId } from '../module/Patientenkartei.js';
import { EgkKnopf } from '../epa/befugnis.js';
import { ohneBefugnis } from '../epa/epa-bestand.js';
import {
  EpaFehler,
  lotseFragen,
  lotseKontext,
  lotseQuelle,
  lotseVorschlaege,
} from '../epa/klient.js';
import {
  Abschnitt,
  Absaetze,
  AbsaetzeGekuerzt,
  Fragefeld,
  Quellenblatt,
  Quellenverweis,
  Umfangsangabe,
} from './bausteine.js';
import { useLotseVorhanden } from './vorhanden.js';

const LISTE_BEZEICHNUNG: Record<string, string> = {
  diagnosen: 'Diagnosenliste',
  allergien: 'Allergienliste',
  prozeduren: 'Prozeduren',
};

const ABWEICHUNG_BEZEICHNUNG: Record<string, string> = {
  'fehlt-im-plan': 'im Dokument, nicht im Plan',
  'nur-im-plan': 'im Plan, nicht im Dokument',
  'dosis-abweichend': 'Dosis weicht ab',
};

export function PraxisLotse() {
  const patientId = usePatientId();
  const patient = useZustand((z) => z.patienten.find((p) => p.id === patientId));
  // Ohne Befugnis antwortet die ePA nicht. Wird sie erteilt, liest der Lotse neu — sonst
  // bliebe der Hinweis stehen, obwohl der Zugang inzwischen besteht.
  const befugnisBis = useZustand(
    (z) => z.epaBefugnisse.find((b) => b.patientId === patientId)?.gueltigBis ?? null,
  );
  const kvnr = patient?.versicherung.kvnr ?? '';

  const [kontext, setzeKontext] = useState<Lotsenkontext | null>(null);
  const [vorschlaege, setzeVorschlaege] = useState<Lotsenvorschlaege | null>(null);
  const [antwort, setzeAntwort] = useState<Lotsenantwort | null>(null);
  const [laeuft, setzeLaeuft] = useState(false);
  const [fehler, setzeFehler] = useState<EpaFehler | Error | null>(null);
  const [bestaetigt, setzeBestaetigt] = useState<Set<string>>(new Set());
  const [blatt, setzeBlatt] = useState<Quellentext | null>(null);
  const angeboten = useLotseVorhanden();

  async function oeffnen(q: Quellenangabe) {
    if (!kvnr) return;
    try {
      setzeBlatt(await lotseQuelle(kvnr, q.quelleId));
    } catch {
      setzeFehler(new Error('Diese Unterlage lässt sich nicht öffnen.'));
    }
  }

  useEffect(() => {
    if (!kvnr || angeboten !== true) return;
    setzeFehler(null);
    void lotseKontext(kvnr, 'nach Krankenhausaufenthalt')
      .then(setzeKontext)
      .catch((f: unknown) =>
        setzeFehler(f instanceof Error ? f : new Error('Kontext nicht lesbar')),
      );
    void lotseVorschlaege(kvnr)
      .then(setzeVorschlaege)
      .catch(() => undefined);
  }, [kvnr, angeboten, befugnisBis]);

  async function fragen(frage: string) {
    if (!kvnr) return;
    setzeLaeuft(true);
    setzeFehler(null);
    try {
      setzeAntwort(await lotseFragen(kvnr, frage, 'fach'));
    } catch (f) {
      setzeFehler(f instanceof Error ? f : new Error('Der Lotse hat nicht geantwortet.'));
    } finally {
      setzeLaeuft(false);
    }
  }

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
  const befugnisFehlt = fehler instanceof EpaFehler && ohneBefugnis(fehler);
  if (befugnisFehlt) {
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

  const offeneVorschlaege = vorschlaege?.vorschlaege.filter((v) => !v.schonInListe) ?? [];
  const abweichungen = kontext?.abweichungen ?? [];

  return (
    <div className="lotse-praxis">
      <div className="karte">
        <Kopf />
        {fehler && <p className="lotse-fehler">{fehler.message}</p>}

        {abweichungen.length > 0 && (
          <Abschnitt titel="Zu klären" zahl={abweichungen.length} offenAnfangs betont>
            <ul className="lotse-abweichungen-liste">
              {abweichungen.map((a, i) => (
                <li key={i}>
                  <span className="lotse-abweichung-text">{a.bezeichnung}</span>
                  <span className="marker">{ABWEICHUNG_BEZEICHNUNG[a.art] ?? a.art}</span>
                  {a.fundstelle && (
                    <Quellenverweis quellen={[a.fundstelle]} oeffnen={(q) => void oeffnen(q)} />
                  )}
                </li>
              ))}
            </ul>
          </Abschnitt>
        )}

        {kontext && (
          <Abschnitt titel={`Kontext · ${kontext.anlass}`} offenAnfangs>
            {kontext.verlauf.length === 0 ? (
              <p className="leer">Kein belegbarer Verlauf.</p>
            ) : (
              <AbsaetzeGekuerzt absaetze={kontext.verlauf} oeffnen={(q) => void oeffnen(q)} />
            )}
          </Abschnitt>
        )}

        <Abschnitt titel="Frage an die Akte" offenAnfangs>
          <Fragefeld
            kennung="lotse-frage-praxis"
            vorschlaege={VORSCHLAGSFRAGEN.praxis}
            laeuft={laeuft}
            fragen={(f) => void fragen(f)}
            beschriftung="Frage an die Akte"
          />
          {laeuft && <p className="leer">Der Lotse liest …</p>}
          {antwort && !laeuft && (
            <section className="lotse-antwort" aria-live="polite">
              {antwort.hinweis && <p className="lotse-hinweis">{antwort.hinweis}</p>}
              <Absaetze absaetze={antwort.absaetze} oeffnen={(q) => void oeffnen(q)} />
            </section>
          )}
        </Abschnitt>

        {offeneVorschlaege.length > 0 && (
          <Abschnitt titel="Vorschläge für die Listen" zahl={offeneVorschlaege.length}>
            <ul className="lotse-vorschlagsliste">
              {offeneVorschlaege.map((v, i) => {
                const schluessel = `${v.liste}-${v.text}`;
                const schonBestaetigt = bestaetigt.has(schluessel);
                return (
                  <li key={i} className={schonBestaetigt ? 'bestaetigt' : ''}>
                    <div className="lotse-vorschlag-kopf">
                      <span className="marker">{LISTE_BEZEICHNUNG[v.liste] ?? v.liste}</span>
                      <span className="lotse-vorschlag-text">{v.text}</span>
                    </div>
                    <span className="herkunft">maschinell vorgeschlagen</span>
                    <Quellenverweis quellen={[v.fundstelle]} oeffnen={(q) => void oeffnen(q)} />
                    <button
                      type="button"
                      className="knopf"
                      disabled={schonBestaetigt}
                      onClick={() => setzeBestaetigt((vorher) => new Set(vorher).add(schluessel))}
                    >
                      {schonBestaetigt ? 'bestätigt' : 'Bestätigen'}
                    </button>
                  </li>
                );
              })}
            </ul>
          </Abschnitt>
        )}

        {kontext && <Umfangsangabe umfang={kontext.umfang} />}
      </div>

      {blatt && (
        <div className="karte">
          <Quellenblatt
            titel={blatt.titel}
            einrichtung={blatt.einrichtung}
            datum={blatt.datum}
            zeilen={blatt.zeilen}
            nichtLesbar={blatt.nichtLesbar}
            schliessen={() => setzeBlatt(null)}
          />
        </div>
      )}
    </div>
  );
}

function Kopf() {
  return (
    <div className="lotse-kopf">
      <h2>Aktenlotse</h2>
      <span className="vorschlagsmarke">✦ Vorschlag · regelbasiert</span>
    </div>
  );
}
