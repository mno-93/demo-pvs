import {
  ALLERGIESTATUS_BEZEICHNUNG,
  DIAGNOSEART_BEZEICHNUNG,
  GEWISSHEIT_BEZEICHNUNG,
  deutschesDatum,
  deutscherZeitpunkt,
  istKeineBekannteAllergie,
  ordnen,
  reaktionenAlsText,
  type Allergie,
  type Diagnose,
  diagnosecode,
  klinischerStatusText,
} from '@demo-pvs/kern';
import { Leer, Marker } from '../../bausteine/Bausteine.js';
import { type Abfragefehler } from '../epa-bestand.js';
import { type EpaListen, type Listeneintrag } from '../listen.js';
import { PsMarke } from '../../bausteine/PsMarke.js';
import {
  Kompaktkarte,
  Listenwerkzeug,
  useAufgeklappt,
  type Aufklappen,
  type Ordnung,
} from '../../module/diagnosen/Splitscreen.js';
import { ordnungsangaben, useOrdnung } from '../../module/diagnosen/ordnung.js';
import { Fehlerlage, Abschnitt, ZurKartei } from './Teile.js';

/** Bereich „Listen“ des ePA-Fensters (✦ Diagnose-Service): Diagnosen und Allergien der ePA. */

export function ListenInEpa({
  patientId,
  laedt,
  fehler,
  daten,
  neuLaden,
}: {
  patientId: string;
  laedt: boolean;
  fehler: Abfragefehler | null;
  daten: EpaListen | null;
  neuLaden: () => void;
}) {
  const ordnungAllergien = useOrdnung(patientId, 'AllergyIntolerance');
  const ordnungDiagnosen = useOrdnung(patientId, 'Condition');
  if (fehler) return <Fehlerlage fehler={fehler} neuLaden={neuLaden} patientId={patientId} />;
  if (laedt || !daten) return <Leer>Wird abgefragt …</Leer>;
  const keineBekannte = daten.allergien.find(
    (e) => istKeineBekannteAllergie(e.eintrag) && e.eintrag.gewissheit === 'bestätigt',
  );
  const allergien = daten.allergien.filter((e) => !istKeineBekannteAllergie(e.eintrag));
  return (
    <>
      <Abschnitt
        titel={`Allergienliste (${allergien.length})`}
        werkzeuge={
          <ZurKartei patientId={patientId} ziel="diagnosen">
            Abgleichen
          </ZurKartei>
        }
      >
        {keineBekannte && (
          <div className="hinweisbox gut">
            Keine bekannten Allergien · {keineBekannte.chronik.angelegtVon},{' '}
            {deutschesDatum(keineBekannte.chronik.angelegtAm.slice(0, 10))}
          </div>
        )}
        {allergien.length === 0 ? (
          !keineBekannte && <Leer>Keine Einträge.</Leer>
        ) : (
          <Listenposten eintraege={allergien} ordnung={ordnungAllergien} />
        )}
      </Abschnitt>

      <Abschnitt titel={`Diagnosenliste (${daten.diagnosen.length})`}>
        {daten.diagnosen.length === 0 ? (
          <Leer>Keine Einträge.</Leer>
        ) : (
          <Listenposten eintraege={daten.diagnosen} ordnung={ordnungDiagnosen} />
        )}
      </Abschnitt>
    </>
  );
}

type Posten = Listeneintrag<Diagnose> | Listeneintrag<Allergie>;

/** Lesesicht einer Liste: kompakte Zeilen, aufklappbar, in der Ordnung der Praxis (ADR 0029). */
function Listenposten({ eintraege, ordnung }: { eintraege: readonly Posten[]; ordnung: Ordnung }) {
  const aufgeklappt = useAufgeklappt();
  const angaben = (p: Posten) => {
    const e = p.eintrag;
    return 'substanz' in e
      ? ordnungsangaben(null, e, p.chronik, e.beginn ?? '', e.substanz)
      : ordnungsangaben(null, e, p.chronik, e.beginn, e.bezeichnung);
  };
  const geordnet = ordnen(eintraege, angaben, ordnung.sortierung, ordnung.reihenfolge);
  const schluessel = geordnet.map((p) => p.eintrag.id);
  const alleOffen = aufgeklappt.alleOffen(schluessel);
  return (
    <>
      <Listenwerkzeug
        ordnung={ordnung}
        alleOffen={alleOffen}
        leer={geordnet.length === 0}
        alleUmschalten={() => aufgeklappt.alle(schluessel, !alleOffen)}
      />
      {geordnet.map((p) => (
        <Listenzeile key={p.eintrag.id} eintrag={p} aufklappen={aufgeklappt.offen(p.eintrag.id)} />
      ))}
    </>
  );
}

function Listenzeile({ eintrag, aufklappen }: { eintrag: Posten; aufklappen: Aufklappen }) {
  const { chronik } = eintrag;
  const e = eintrag.eintrag;
  const allergie = 'substanz' in e ? e : null;
  const diagnose = 'substanz' in e ? null : e;
  const berichtigt = allergie
    ? allergie.gewissheit === 'irrtümlich'
    : diagnose?.diagnosesicherheit === 'irrtümlich';
  const eingestellt = chronik.angelegtAm ? deutschesDatum(chronik.angelegtAm.slice(0, 10)) : '—';
  return (
    <div className="akten-eintrag kompakt-eintrag">
      <Kompaktkarte
        titel={allergie ? allergie.substanz : (diagnose?.bezeichnung ?? '')}
        aufklappen={aufklappen}
        markiert={eintrag.psRelevant && !berichtigt}
        berichtigt={berichtigt}
        rechts={eintrag.psRelevant && !berichtigt ? <PsMarke kompakt /> : undefined}
        zeile={
          <>
            {diagnose?.code && <span className="code">{diagnosecode(diagnose)}</span>}
            {berichtigt ? (
              <Marker ton="fehler">fehlerhaft</Marker>
            ) : allergie ? (
              <>
                <Marker ton={allergie.gewissheit === 'bestätigt' ? 'gut' : 'warn'}>
                  {GEWISSHEIT_BEZEICHNUNG[allergie.gewissheit]}
                </Marker>
                <span>{allergie.kritikalitaet}</span>
              </>
            ) : (
              diagnose && (
                <span>
                  {DIAGNOSEART_BEZEICHNUNG[diagnose.art]} ·{' '}
                  {klinischerStatusText(diagnose.klinischerStatus)}
                </span>
              )
            )}
            <span title="Eingestellt">· {eingestellt}</span>
          </>
        }
        details={
          <>
            <div className="herkunft">
              {eingestellt} –{' '}
              {chronik.quelldokument ? (
                <>
                  aus <b>{chronik.quelldokument.anzeige}</b>
                </>
              ) : (
                <b>{chronik.angelegtVon}</b>
              )}
              {chronik.erstelltDurch && <> · {chronik.erstelltDurch}</>}
              {chronik.aenderungen > 0 &&
                ` · geändert ${deutscherZeitpunkt(chronik.zuletztAm)}, ${chronik.zuletztVon}`}
            </div>
            <div className="codezeile">
              {diagnose?.code && <span className="code">ICD-10-GM {diagnosecode(diagnose)}</span>}
              {e.snomed && <span className="code snomed">SNOMED CT {e.snomed.code}</span>}
              {allergie && (
                <span className="leise-klein">
                  {ALLERGIESTATUS_BEZEICHNUNG[allergie.klinischerStatus]}
                </span>
              )}
            </div>
            {allergie && allergie.reaktionen.length > 0 && (
              <div className="leise-klein">Reaktion: {reaktionenAlsText(allergie.reaktionen)}</div>
            )}
          </>
        }
      />
    </div>
  );
}

/* ---------- Laborbefunde ---------- */
