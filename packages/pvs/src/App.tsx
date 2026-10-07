import { useEffect } from 'react';
import { Link, NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { ROLLE_BEZEICHNUNG } from '@demo-pvs/kern';
import { ausfuehren, useZustand, zuruecksetzen } from './speicher/speicher.js';
import { vorgaenge } from './speicher/vorgaenge.js';
import { Tagesuebersicht } from './module/Tagesuebersicht.js';
import { Patientenliste } from './module/Patientenliste.js';
import { EpaUmleitung, Patientenkartei } from './module/Patientenkartei.js';
import { Karteikarte } from './module/Karteikarte.js';
import { Diagnosen } from './module/Diagnosen.js';
import { Medikation } from './module/Medikation.js';
import { Impfungen } from './module/Impfungen.js';
import { Dokumente } from './module/Dokumente.js';
import { Labor } from './module/Labor.js';
import { Abrechnung } from './module/Abrechnung.js';
import { Stammdaten } from './module/Stammdaten.js';
import { Rezeptstapel, useStapelzahl } from './module/Rezeptstapel.js';
import { PraxisLotse } from './lotse/PraxisLotse.js';
import { Versichertensicht } from './lotse/Versichertensicht.js';
import { Aufrufprotokoll } from './epa/Aufrufprotokoll.js';
import { EpaFenster } from './epa/EpaFenster.js';
import { protokollUmschalten, useProtokollSichtbar } from './epa/protokoll.js';
import { aktensystemZuruecksetzen, klientZuruecksetzen } from './epa/klient.js';
import { befugnisabgleichEinrichten } from './epa/befugnis.js';

/** Spezifikation, Entscheidungen und Anleitung der Demo — im öffentlichen Repository. */
const DOKUMENTATION = 'https://github.com/mno-93/demo-pvs/tree/main/docs';

export function App() {
  // Meldet die ePA eine fehlende Befugnis, berichtigt das Praxissystem seinen Stand (ADR 0017).
  useEffect(() => befugnisabgleichEinrichten(), []);
  const { pathname } = useLocation();

  /*
   * ✦ Die Versichertensicht ist kein Teil des Praxissystems, sondern stellvertretend die App der
   * Versicherten (FdV). Sie steht deshalb in einem eigenen Rahmen — ohne Praxis, Nutzerwahl und
   * Navigation des PVS — und ist über die Konfiguration erreichbar.
   */
  if (pathname === '/versicherte') {
    return (
      <>
        <header className="kopf kopf-versicherte">
          <div className="kopf-oben">
            <div className="marke">
              <span className="punkt" aria-hidden="true" />
              Versichertensicht ✦<span className="fiktiv">fiktiv</span>
            </div>
            <div className="kopf-rechts">
              <KonfigurationKnopf />
              <Link className="knopf" to="/">
                Zum Praxissystem
              </Link>
            </div>
          </div>
        </header>
        <main className="inhalt">
          <Versichertensicht />
        </main>
        <Aufrufprotokoll />
      </>
    );
  }

  return (
    <>
      <Kopf />
      <main className="inhalt">
        <Routes>
          <Route path="/" element={<Tagesuebersicht />} />
          <Route path="/patienten" element={<Patientenliste />} />
          <Route path="/rezepte" element={<Rezeptstapel />} />
          <Route path="/patient/:patientId" element={<Patientenkartei />}>
            <Route index element={<Navigate to="karteikarte" replace />} />
            <Route path="karteikarte" element={<Karteikarte />} />
            <Route path="diagnosen" element={<Diagnosen />} />
            <Route path="medikation" element={<Medikation />} />
            <Route path="impfungen" element={<Impfungen />} />
            <Route path="labor" element={<Labor />} />
            <Route path="dokumente" element={<Dokumente />} />
            <Route path="lotse" element={<PraxisLotse />} />
            <Route path="epa" element={<EpaUmleitung />} />
            <Route path="abrechnung" element={<Abrechnung />} />
            <Route path="stammdaten" element={<Stammdaten />} />
          </Route>
          <Route
            path="*"
            element={<div className="karte">Diese Seite gibt es in der Demo nicht.</div>}
          />
        </Routes>
      </main>
      <EpaFenster />
      <Aufrufprotokoll />
    </>
  );
}

function Kopf() {
  const nutzer = useZustand((z) => z.nutzer);
  const stapel = useStapelzahl();
  const nutzerliste = useZustand((z) => z.nutzerliste);
  const heute = useZustand((z) => z.heute);
  const handlungen = useZustand((z) => z.handlungen);

  return (
    <header className="kopf">
      <div className="kopf-oben">
        <div className="marke">
          <span className="punkt" aria-hidden="true" />
          Demo-PVS
          <span className="fiktiv">fiktives System</span>
        </div>
        <span className="kopf-praxis">
          Hausarztpraxis am Stadtgarten · {heute.slice(8, 10)}.{heute.slice(5, 7)}.
          {heute.slice(0, 4)}
        </span>

        <div className="kopf-rechts">
          <span className="kopf-zaehler">
            {handlungen} {handlungen === 1 ? 'Handlung' : 'Handlungen'}
          </span>
          <label className="nur-fuer-screenreader" htmlFor="rollenwahl">
            Angemeldete Person
          </label>
          <select
            id="rollenwahl"
            className="knopf"
            value={nutzer.id}
            onChange={(e) => {
              const gewaehlt = nutzerliste.find((n) => n.id === e.target.value);
              if (gewaehlt) ausfuehren(vorgaenge.nutzerWechseln(gewaehlt));
            }}
          >
            {nutzerliste.map((n) => (
              <option key={n.id} value={n.id}>
                {n.name} — {ROLLE_BEZEICHNUNG[n.rolle]}
              </option>
            ))}
          </select>
          <KonfigurationKnopf />
          <a
            className="knopf"
            href={DOKUMENTATION}
            target="_blank"
            rel="noreferrer"
            aria-label="Dokumentation auf GitHub (öffnet ein neues Fenster)"
          >
            Dokumentation ↗
          </a>
          <button
            type="button"
            className="knopf"
            onClick={() => {
              // Praxis und Aktensystem gemeinsam: sonst stünden in der ePA Einträge, die die
              // Praxis nicht mehr kennt, und umgekehrt.
              zuruecksetzen();
              klientZuruecksetzen();
              void aktensystemZuruecksetzen().catch(() => undefined);
            }}
          >
            Zurücksetzen
          </button>
        </div>
      </div>

      <nav className="hauptnavi" aria-label="Hauptbereiche">
        <NavLink to="/" end className={({ isActive }) => (isActive ? 'aktiv' : '')}>
          Tagesübersicht
        </NavLink>
        <NavLink to="/patienten" className={({ isActive }) => (isActive ? 'aktiv' : '')}>
          Patient:innen
        </NavLink>
        <NavLink to="/rezepte" className={({ isActive }) => (isActive ? 'aktiv' : '')}>
          Rezepte
          {stapel > 0 && (
            <span className="navi-zahl" aria-label={`${stapel} zur Signatur`}>
              {stapel}
            </span>
          )}
        </NavLink>
      </nav>
    </header>
  );
}

function KonfigurationKnopf() {
  const offen = useProtokollSichtbar();
  return (
    <button type="button" className="knopf" aria-pressed={offen} onClick={protokollUmschalten}>
      Konfiguration
    </button>
  );
}
