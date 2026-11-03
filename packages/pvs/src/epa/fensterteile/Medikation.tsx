import {
  CODESYSTEM,
  deutscherZeitpunkt,
  type Ressource,
  dosierungsanzeige,
  grundanzeige,
} from '@demo-pvs/kern';
import { Leer, Marker } from '../../bausteine/Bausteine.js';
import { planzeilen } from '../../module/medikation/planabgleich.js';
import { listenzeilen } from '../../module/medikation/stand.js';
import { AbgabeZelle, VerordnungZelle } from '../../module/medikation/Tabellen.js';
import { codeVon, medikamentZu, textVon, type Abfragefehler } from '../epa-bestand.js';
import { Medikation, Fehlerlage, Abschnitt, ZurKartei } from './Teile.js';

/** Bereich „Medikation“ des ePA-Fensters: eMP und eML, wie der Medication Service sie liefert. */

/** Status eines Eintrags im eMP (EMPMedicationRequest) und einer Medikationsinformation. */
const STATUS: Record<string, string> = {
  active: 'aktiv',
  'on-hold': 'pausiert',
  completed: 'beendet',
  stopped: 'abgesetzt',
  'entered-in-error': 'fehlerhaft',
  intended: 'geplant',
  'not-taken': 'nicht eingenommen',
  unknown: 'unbekannt',
};

export function MedikationInEpa({
  patientId,
  laedt,
  fehler,
  daten,
  neuLaden,
}: {
  patientId: string;
  laedt: boolean;
  fehler: Abfragefehler | null;
  daten: Medikation | null;
  neuLaden: () => void;
}) {
  if (fehler) return <Fehlerlage fehler={fehler} neuLaden={neuLaden} patientId={patientId} />;
  if (laedt || !daten) return <Leer>Wird abgefragt …</Leer>;
  const [liste, plan] = daten;
  const medikamente = [...liste.einschluesse, ...plan.ressourcen].filter(
    (r) => r.resourceType === 'Medication',
  );
  const name = (r: Ressource) => {
    const m = medikamentZu(r, medikamente);
    return m ? textVon(m) : textVon(r);
  };
  const atc = (r: Ressource) => codeVon(medikamentZu(r, medikamente) ?? r, 'code', CODESYSTEM.atc);
  // Dieselben Spalten wie in der Kartei: Verordnung und Abgabe nach der Datenherkunft der eML.
  const eml = listenzeilen(liste, planzeilen(plan));

  return (
    <>
      <Abschnitt
        titel="Medikationsplan"
        werkzeuge={
          <>
            <span className="leise-klein">
              {plan.stand ? `Stand ${deutscherZeitpunkt(plan.stand)}` : ''}
            </span>
            <ZurKartei patientId={patientId} ziel="medikation">
              Bearbeiten
            </ZurKartei>
          </>
        }
      >
        {plan.eintraege.length === 0 ? (
          <Leer>Keine Einträge.</Leer>
        ) : (
          <table className="liste">
            <thead>
              <tr>
                <th>Arzneimittel</th>
                <th>Dosierung</th>
                <th>Grund</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {plan.eintraege.map((e) => (
                <tr key={String(e.id)}>
                  <td>
                    <b>{name(e)}</b>
                    <div className="leise-klein">ATC {atc(e) ?? '—'}</div>
                  </td>
                  <td>
                    <span className="code">{dosierungsanzeige(e)}</span>
                  </td>
                  <td>{grundanzeige(e) ?? '—'}</td>
                  <td>
                    <Marker ton="neutral">
                      {STATUS[String(e['status'])] ?? String(e['status'])}
                    </Marker>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Abschnitt>

      <Abschnitt titel={`Medikationsliste (${liste.eintraege.length})`}>
        {liste.eintraege.length === 0 ? (
          <Leer>Keine Einträge.</Leer>
        ) : (
          <table className="liste">
            <thead>
              <tr>
                <th>Verordnung</th>
                <th>Abgabe</th>
                <th>Arzneimittel</th>
                <th>Dosierung</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {eml.map((z) => (
                <tr key={String(z.aussage.id)}>
                  <td>
                    <VerordnungZelle z={z} />
                  </td>
                  <td>
                    <AbgabeZelle z={z} />
                  </td>
                  <td>{name(z.aussage)}</td>
                  <td>
                    <span className="code">{z.dosierung}</span>
                  </td>
                  <td>{STATUS[String(z.aussage['status'])] ?? String(z.aussage['status'])}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Abschnitt>
    </>
  );
}

/* ---------- Diagnosen und Allergien (✦ Vorschlag Diagnose-Service) ---------- */
