import { useEffect } from 'react';
import { Link, NavLink, Navigate, Outlet, useParams } from 'react-router-dom';
import {
  alterInJahren,
  deutschesDatum,
  istGegenwaertig,
  quartalsBezeichnung,
  quartalVon,
} from '@demo-pvs/kern';
import { useAuswahl, useZustand } from '../speicher/speicher.js';
import { useLotseVorhanden } from '../lotse/vorhanden.js';
import { Marker } from '../bausteine/Bausteine.js';
import { epaFensterOeffnen, useEpaFenster } from '../epa/fenster.js';
import { EgkKnopf } from '../epa/befugnis.js';
import { EpaZugang, useAktenstatus } from '../epa/aktenstatus.js';
import { patientSummaryVerfuegbar } from '../epa/klient.js';
import { useBetriebsstand, useEpaAbfrage } from '../epa/epa-bestand.js';

/**
 * Rahmen einer Patientenkartei: Kopfzeile mit den Angaben, die in der Praxis ständig
 * sichtbar sein müssen, und die Reiter der Bereiche.
 *
 * Die Bereiche sind als verschachtelte Routen eingehängt und werden über <Outlet />
 * dargestellt. Das ist nicht nur Geschmackssache: Eine frühere Fassung hängte sie über
 * eine Sammelroute (`/patient/:patientId/*`) mit eigenen <Routes> darunter. Relative
 * Verweise lösen sich dort gegen den bereits verbrauchten Pfad auf, sodass aus
 * „diagnosen" der Pfad „karteikarte/diagnosen" wurde und der Reiterwechsel ins Leere
 * lief. Der Test in Patientenkartei.test.tsx hält diesen Fehler fern.
 *
 * Die ePA ist kein Reiter. Sie öffnet sich über den Knopf im Kopf als eigenes Fenster über
 * der Kartei — eine Ebene höher, weil sie ein fremdes System ist (ADR 0014). Daneben steht der
 * Zustand des Zugangs — keine Akte, gesperrt, keine Befugnis, Befugnis bis … — samt Widerspruch
 * gegen den Medikationsprozess (ADR 0023), und der Knopf, der die Befugnis durch Einlesen der
 * eGK verschafft (ADR 0017). Die Patient Summary ist von hier mit einem Klick erreichbar — sie ist
 * Teil der ePA und öffnet deren Fenster auf dem ersten Reiter (ADR 0021).
 */

const REITER = [
  { pfad: 'karteikarte', beschriftung: 'Karteikarte' },
  { pfad: 'diagnosen', beschriftung: 'Diagnosen und Allergien' },
  { pfad: 'medikation', beschriftung: 'Medikation' },
  { pfad: 'impfungen', beschriftung: 'Impfungen' },
  { pfad: 'labor', beschriftung: 'Labor' },
  { pfad: 'dokumente', beschriftung: 'Dokumente' },
  { pfad: 'abrechnung', beschriftung: 'Abrechnung' },
  { pfad: 'stammdaten', beschriftung: 'Stammdaten' },
];

/** Liest die Patientenkennung aus der Route. Alle Bereiche greifen darauf zu. */
export function usePatientId(): string {
  const { patientId } = useParams();
  if (!patientId) throw new Error('Die Route führt keine Patientenkennung.');
  return patientId;
}

export function Patientenkartei() {
  const { patientId } = useParams();
  const patient = useAuswahl((z) => z.patienten.find((p) => p.id === patientId), [patientId]);
  const heute = useZustand((z) => z.heute);
  const diagnosen = useZustand((z) => z.diagnosen);
  const allergien = useZustand((z) => z.allergien);
  const aktenstatus = useAktenstatus(patient);
  const lotseDa = useLotseVorhanden() === true;
  const ohneAkte = aktenstatus.daten?.akte === 'keine';
  const nutzbar = aktenstatus.daten?.akte === 'aktiv';

  if (!patient) {
    return <div className="karte">Diese Patientenkartei gibt es in der Demo nicht.</div>;
  }

  const dauerdiagnosen = diagnosen.filter(
    (d) => d.patientId === patient.id && d.art === 'dauer' && istGegenwaertig(d.klinischerStatus),
  );
  const aktiveAllergien = allergien.filter(
    (a) => a.patientId === patient.id && a.klinischerStatus === 'aktiv',
  );
  const quartal = quartalsBezeichnung(quartalVon(heute));
  // ✦ Der Aktenlotse ist ein Vorschlag und erscheint erst im Ausbaustand, der ihn anbietet.
  const reiter = lotseDa ? [...REITER, { pfad: 'lotse', beschriftung: 'Aktenlotse ✦' }] : REITER;

  return (
    <>
      <div className="patientenkopf">
        <div className="zeile1">
          <span className="name">
            {patient.nachname}, {patient.vorname}
          </span>
          <span style={{ color: 'var(--text-leise)' }}>
            {deutschesDatum(patient.geburtsdatum)} ({alterInJahren(patient.geburtsdatum, heute)} J.)
          </span>
          <Marker ton="neutral">Quartal {quartal}</Marker>
          {aktiveAllergien.length > 0 && (
            <Marker ton="warn">
              {aktiveAllergien.length} {aktiveAllergien.length === 1 ? 'Allergie' : 'Allergien'}{' '}
              dokumentiert
            </Marker>
          )}
          <span className="rechts reihe epa-zugang">
            <EpaZugang patient={patient} status={aktenstatus} />
            <EgkKnopf patientId={patient.id} />
            {nutzbar && <SummaryKnopf patientId={patient.id} />}
            {nutzbar && lotseDa && (
              <Link className="knopf lotse-knopf" to={`/patient/${patient.id}/lotse`}>
                Aktenlotse ✦
              </Link>
            )}
            <EpaKnopf patientId={patient.id} ohneAkte={ohneAkte} />
          </span>
        </div>
        <div className="zeile2">
          <span>
            <b>Versichertennummer</b> {patient.versicherung.kvnr}
          </span>
          <span>
            <b>Kostenträger</b> {patient.versicherung.kostentraeger}
          </span>
          <span>
            <b>Versichertenart</b> {patient.versicherung.versichertenart}
          </span>
          <span>
            <b>Dauerdiagnosen</b> {dauerdiagnosen.length}
          </span>
          {patient.hinweis && <span style={{ color: 'var(--warn)' }}>{patient.hinweis}</span>}
        </div>
        <nav className="aktenreiter" aria-label="Bereiche der Patientenkartei">
          {reiter.map((r) => (
            <NavLink
              key={r.pfad}
              to={r.pfad}
              className={({ isActive }) => (isActive ? 'aktiv' : '')}
            >
              {r.beschriftung}
            </NavLink>
          ))}
        </nav>
      </div>

      <Outlet />
    </>
  );
}

/** Öffnet die ePA auf der Patient Summary — nur, wenn das Aktensystem sie anbietet. */
function SummaryKnopf({ patientId }: { patientId: string }) {
  const betriebsstand = useBetriebsstand();
  const dienst = useEpaAbfrage(() => patientSummaryVerfuegbar(), [betriebsstand]);
  if (dienst.daten !== true) return null;
  return (
    <button
      type="button"
      className="knopf ps-knopf"
      aria-haspopup="dialog"
      onClick={() => epaFensterOeffnen(patientId, 'summary')}
      title="Patient Summary der ePA (Alt+P)"
      accessKey="p"
    >
      Patient Summary
    </button>
  );
}

/** Öffnet die ePA als Fenster über der Kartei. */
function EpaKnopf({ patientId, ohneAkte }: { patientId: string; ohneAkte: boolean }) {
  const fenster = useEpaFenster();
  const offen = fenster.offen && fenster.patientId === patientId;
  return (
    <button
      type="button"
      className="knopf epa-knopf"
      aria-haspopup="dialog"
      aria-expanded={offen}
      disabled={ohneAkte}
      onClick={() => epaFensterOeffnen(patientId)}
      title={
        ohneAkte
          ? 'Für diese Person besteht keine ePA'
          : 'Elektronische Patientenakte in eigenem Fenster öffnen'
      }
    >
      <span className="epa-siegel klein" aria-hidden="true">
        ePA
      </span>
      ePA öffnen
    </button>
  );
}

/**
 * Frühere Adresse des ePA-Reiters. Wer sie aufruft, landet in der Karteikarte, und die ePA
 * öffnet sich als Fenster.
 */
export function EpaUmleitung() {
  const { patientId } = useParams();
  useEffect(() => {
    if (patientId) epaFensterOeffnen(patientId);
  }, [patientId]);
  return <Navigate to="../karteikarte" replace />;
}
