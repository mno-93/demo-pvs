import {
  CODESYSTEM,
  EMP_EXTENSION,
  deutschesDatum,
  deutscherZeitpunkt,
  type Ressource,
  dosierungsanzeige,
  grundanzeige,
} from '@demo-pvs/kern';
import { Leer, Marker } from '../../bausteine/Bausteine.js';
import { codeVon, datumVon, medikamentZu, textVon, type Abfragefehler } from '../epa-bestand.js';
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

const EML_ART: Record<string, string> = {
  PRESCRIPTION: 'Verordnung',
  MANUAL: 'Nachtrag',
  EMP: 'Medikationsplan',
};

/** Herkunft eines Eintrags der Medikationsliste: Verordnung, Nachtrag oder Medikationsplan. */
function kontextVon(r: Ressource): string {
  const e = (r.extension ?? []).find((x) => x.url === EMP_EXTENSION.kontext);
  return e?.valueCoding?.code ?? e?.valueCode ?? '';
}

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
                <th>Datum</th>
                <th>Herkunft</th>
                <th>Arzneimittel</th>
                <th>Dosierung</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {liste.eintraege
                .slice()
                .sort((a, b) => datumVon(b).localeCompare(datumVon(a)))
                .map((e) => (
                  <tr key={String(e.id)}>
                    <td>{deutschesDatum(datumVon(e))}</td>
                    <td>
                      <Marker ton={kontextVon(e) === 'PRESCRIPTION' ? 'akzent' : 'neutral'}>
                        {EML_ART[kontextVon(e)] ?? (kontextVon(e) || '—')}
                      </Marker>
                    </td>
                    <td>{name(e)}</td>
                    <td>
                      <span className="code">{dosierungsanzeige(e)}</span>
                    </td>
                    <td>{STATUS[String(e['status'])] ?? String(e['status'])}</td>
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
