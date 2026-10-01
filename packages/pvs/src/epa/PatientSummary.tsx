import { useMemo, useState, type ReactNode } from 'react';
import {
  ALLERGIESTATUS_BEZEICHNUNG,
  CODESYSTEM,
  DIAGNOSESICHERHEIT_BEZEICHNUNG,
  GEWISSHEIT_BEZEICHNUNG,
  KLINISCHER_STATUS_BEZEICHNUNG,
  PS_QUELLE_BEZEICHNUNG,
  PS_QUELLE_GEFUEHRT,
  allergieAusFhirRessource,
  chronikLesen,
  deutscherZeitpunkt,
  deutschesDatum,
  diagnoseAusFhir,
  impfungAusFhir,
  istKeineBekannteAllergie,
  reaktionenAlsText,
  type Chronik,
  type Herkunft,
  type PatientSummaryInhalt,
  type PsAbschnitt,
  type PsAbschnittSchluessel,
  type Ressource,
} from '@demo-pvs/kern';
import { Marker } from '../bausteine/Bausteine.js';
import {
  NeuMarke,
  SeitLetztemAufrufBand,
  gesehenAus,
  useSeitLetztemAufruf,
  type SeitLetztemAufruf,
} from './gesehen.js';

/**
 * ✦ Die Patient Summary als Sicht der ePA (ADR 0021).
 *
 * Blöcke je Abschnitt, Allergien zuerst. Jeder Block
 * nennt seine Quelle und führt dorthin, wo er gepflegt wird — die Patient Summary selbst hat
 * keine Eingabe. Leere Blöcke unterscheiden „Information nicht verfügbar" von der ärztlich
 * bestätigten Angabe „keine bekannten Allergien".
 */

/** Wohin ein Block zur Pflege führt. */
export type PsSprung = (ziel: PsAbschnittSchluessel) => void;

const SPRUNG: Partial<Record<PsAbschnittSchluessel, string>> = {
  allergien: 'Zur Allergienübersicht',
  diagnosen: 'Zur Diagnosenübersicht',
  medikation: 'Zum Medikationsplan',
  laborwerte: 'Zu den Laborwerten',
  impfungen: 'Zur Impfübersicht',
};

/** Hauptspalte: was im Notfall zuerst zählt. Nebenspalte: der Rest. */
const HAUPT: PsAbschnittSchluessel[] = ['allergien', 'diagnosen', 'medikation'];
const NEBEN: PsAbschnittSchluessel[] = [
  'laborwerte',
  'impfungen',
  'prozeduren',
  'implantate',
  'erklaerungen',
];

export function PatientSummaryAnsicht({
  inhalt,
  roh,
  patientId,
  sprung,
  inDokumentenSuchen,
}: {
  inhalt: PatientSummaryInhalt;
  roh: unknown;
  patientId: string;
  sprung: PsSprung;
  inDokumentenSuchen: () => void;
}) {
  const [fhir, setzeFhir] = useState(false);
  const provenance = inhalt.ressourcen.filter((r) => r.resourceType === 'Provenance');
  // Neu seit dem letzten Aufruf: alle gezeigten Einträge, mit ihrer Fassung (ADR 0027).
  const gesehen = useMemo(
    () =>
      gesehenAus(
        inhalt.abschnitte.flatMap((a) => a.eintraege),
        inhalt.ressourcen.filter((r) => r.resourceType === 'Provenance'),
      ),
    [inhalt],
  );
  const seit = useSeitLetztemAufruf(patientId, 'summary', gesehen);
  const gefuellt = inhalt.abschnitte.filter((a) => a.eintraege.length > 0).length;
  // Jüngste Änderung an einem gezeigten Eintrag — „zuletzt aktualisiert" der Übersicht.
  const zuletzt = provenance
    .map((p) => String(p['recorded'] ?? ''))
    .sort()
    .pop();
  const block = (s: PsAbschnittSchluessel) => {
    const a = inhalt.abschnitte.find((x) => x.schluessel === s)!;
    return (
      <Block
        key={s}
        abschnitt={a}
        sprung={SPRUNG[s] ? () => sprung(s) : undefined}
        inDokumentenSuchen={a.quelle === 'none' ? inDokumentenSuchen : undefined}
      >
        <Eintraege
          abschnitt={a}
          ressourcen={inhalt.ressourcen}
          provenance={provenance}
          patientId={patientId}
          seit={seit}
        />
      </Block>
    );
  };
  return (
    <div className="ps">
      <div className="ps-kopf">
        <h3>
          <span className="ps-stern" aria-hidden="true">
            ★
          </span>{' '}
          Patient Summary
        </h3>
        <span className="leise-klein">
          Stand {deutscherZeitpunkt(inhalt.erstellt)} · {gefuellt} von {inhalt.abschnitte.length}{' '}
          Abschnitten mit Inhalt
          {zuletzt && ` · zuletzt geändert ${deutscherZeitpunkt(zuletzt)}`}
        </span>
        <button
          type="button"
          className="knopf klein rechts"
          aria-expanded={fhir}
          onClick={() => setzeFhir(!fhir)}
        >
          FHIR
        </button>
      </div>
      <SeitLetztemAufrufBand seit={seit} />
      {fhir && <pre className="code-block">{JSON.stringify(roh, null, 2)}</pre>}
      <div className="ps-raster">
        <div className="ps-spalte">{HAUPT.map(block)}</div>
        <div className="ps-spalte">{NEBEN.map(block)}</div>
      </div>
    </div>
  );
}

function Block({
  abschnitt: a,
  sprung,
  inDokumentenSuchen,
  children,
}: {
  abschnitt: PsAbschnitt;
  sprung?: () => void;
  inDokumentenSuchen?: () => void;
  children: ReactNode;
}) {
  const id = `ps-${a.schluessel}`;
  const gefuehrt = PS_QUELLE_GEFUEHRT.has(a.quelle);
  return (
    <section className="ps-block" aria-labelledby={id}>
      <div className="ps-block-kopf">
        <h4 id={id}>{a.titel}</h4>
        {a.quelle !== 'none' && (
          <Marker
            ton={gefuehrt ? 'gut' : 'neutral'}
            titel={gefuehrt ? 'ärztlich geführt' : 'automatisch abgeleitet'}
          >
            {PS_QUELLE_BEZEICHNUNG[a.quelle]} · {gefuehrt ? 'geführt' : 'automatisch'}
          </Marker>
        )}
        {sprung && (
          <button type="button" className="kk-sprung rechts" onClick={sprung}>
            {SPRUNG[a.schluessel]} ↗
          </button>
        )}
        {inDokumentenSuchen && (
          <button type="button" className="kk-sprung rechts" onClick={inDokumentenSuchen}>
            In Dokumenten suchen
          </button>
        )}
      </div>
      {children}
      {a.weitere > 0 && sprung && (
        <button type="button" className="ps-weitere" onClick={sprung}>
          + {a.weitere} {a.weitere === 1 ? 'weiterer Eintrag' : 'weitere Einträge'} in der{' '}
          {PS_QUELLE_BEZEICHNUNG[a.quelle]}, nicht markiert ↗
        </button>
      )}
    </section>
  );
}

/**
 * Herkunft in einer Zeile unter dem Eintrag: Quelle, Datum, verantwortliche Person. Der Befund
 * steht zuerst — die Herkunft ergänzt ihn, sie verdrängt ihn nicht.
 */
function PsHerkunft({ chronik }: { chronik: Chronik }) {
  const teile = [
    chronik.quelldokument
      ? `aus ${chronik.quelldokument.anzeige}`
      : `eingetragen von ${chronik.angelegtVon}`,
    chronik.angelegtAm ? deutschesDatum(chronik.angelegtAm.slice(0, 10)) : null,
    chronik.erstelltDurch,
    chronik.aenderungen > 0
      ? `geändert ${deutschesDatum(chronik.zuletztAm.slice(0, 10))} von ${chronik.zuletztVon}`
      : null,
  ].filter(Boolean);
  return <div className="ps-herkunft">{teile.join(' · ')}</div>;
}

function herkunftAus(chronik: Chronik): Herkunft {
  return {
    bestand: 'epa',
    quelle: chronik.quelldokument?.anzeige ?? chronik.angelegtVon,
    zeitpunkt: chronik.angelegtAm,
    verantwortlich: chronik.erstelltDurch ?? chronik.angelegtVon,
    dokumentId: chronik.quelldokument?.id ?? null,
  };
}

function Eintraege({
  abschnitt: a,
  ressourcen,
  provenance,
  patientId,
  seit,
}: {
  abschnitt: PsAbschnitt;
  ressourcen: readonly Ressource[];
  provenance: readonly Ressource[];
  patientId: string;
  seit: SeitLetztemAufruf;
}) {
  if (a.eintraege.length === 0) {
    return (
      <div className="ps-leer">
        {a.leer === 'withheld'
          ? 'Gesperrt durch Widerspruch der versicherten Person'
          : a.weitere > 0
            ? 'Kein Eintrag für die Patient Summary markiert'
            : 'Information nicht verfügbar'}
      </div>
    );
  }

  if (a.schluessel === 'allergien') {
    const allergien = a.eintraege.map((r) => {
      const chronik = chronikLesen(r, provenance);
      return { r, chronik, e: allergieAusFhirRessource(r, patientId, herkunftAus(chronik)) };
    });
    const keineBekannte = allergien.find((x) => istKeineBekannteAllergie(x.e));
    if (keineBekannte) {
      return (
        <div className="ps-eintrag">
          <div className="ps-bestaetigt">Keine bekannten Allergien</div>
          <PsHerkunft chronik={keineBekannte.chronik} />
        </div>
      );
    }
    return (
      <>
        {allergien.map(({ r, chronik, e }) => (
          <div key={String(r.id)} className="ps-eintrag">
            <div className="reihe">
              <b>{e.substanz}</b>
              <NeuMarke seit={seit} ressource={r} />
              <span className="leise-klein">{e.typ}</span>
              <Marker ton={e.gewissheit === 'bestätigt' ? 'gut' : 'warn'}>
                {GEWISSHEIT_BEZEICHNUNG[e.gewissheit]}
              </Marker>
              <span className="leise-klein">
                {e.kritikalitaet} · {ALLERGIESTATUS_BEZEICHNUNG[e.klinischerStatus]}
              </span>
            </div>
            {e.reaktionen.length > 0 && (
              <div className="leise-klein">Reaktion: {reaktionenAlsText(e.reaktionen)}</div>
            )}
            <PsHerkunft chronik={chronik} />
          </div>
        ))}
      </>
    );
  }

  if (a.schluessel === 'diagnosen') {
    return (
      <>
        {a.eintraege.map((r) => {
          const chronik = chronikLesen(r, provenance);
          const d = diagnoseAusFhir(r, patientId, herkunftAus(chronik));
          return (
            <div key={String(r.id)} className="ps-eintrag">
              <div className="reihe">
                <b>{d.bezeichnung}</b>
                <NeuMarke seit={seit} ressource={r} />
                {d.code && (
                  <span className="code">
                    {d.code} {d.zusatzkennzeichen}
                  </span>
                )}
                {d.beginn && <span className="leise-klein">seit {d.beginn.slice(0, 4)}</span>}
                <Marker ton="neutral">
                  {DIAGNOSESICHERHEIT_BEZEICHNUNG[d.diagnosesicherheit]}
                </Marker>
                <Marker ton="neutral">{KLINISCHER_STATUS_BEZEICHNUNG[d.klinischerStatus]}</Marker>
                {d.schweregrad && <Marker ton="neutral">{d.schweregrad.anzeige}</Marker>}
              </div>
              <PsHerkunft chronik={chronik} />
            </div>
          );
        })}
      </>
    );
  }

  if (a.schluessel === 'medikation') {
    return (
      <table className="liste ps-tabelle">
        <thead>
          <tr>
            <th>Arzneimittel</th>
            <th>Dosierung</th>
            <th>Grund</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {a.eintraege.map((r) => (
            <tr key={String(r.id)}>
              <td>
                <b>{arzneimittel(r, ressourcen)}</b>
                <NeuMarke seit={seit} ressource={r} />
                <div className="leise-klein">{zeitraum(r)}</div>
              </td>
              <td>
                <span className="code">{dosierung(r)}</span>
              </td>
              <td>{(r['reasonCode'] as { text?: string }[] | undefined)?.[0]?.text ?? '—'}</td>
              <td>{STATUS[String(r['status'])] ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  if (a.schluessel === 'laborwerte') {
    const quelleVon = (o: Ressource) =>
      (o.extension ?? []).find((e) => e.url.endsWith('source-document'))?.valueReference?.display ??
      '';
    // Stammen alle Werte aus demselben Befund, steht die Quelle einmal unter der Tabelle.
    const quellen = [...new Set(a.eintraege.map(quelleVon))];
    const gemeinsam = quellen.length === 1 ? quellen[0] : null;
    return (
      <>
        <table className="liste ps-tabelle">
          <thead>
            <tr>
              <th>Untersuchung</th>
              <th className="zahl">Wert</th>
              <th>Datum</th>
            </tr>
          </thead>
          <tbody>
            {a.eintraege.map((o) => {
              const menge = o['valueQuantity'] as { value?: number; unit?: string } | undefined;
              const deutung = (
                o['interpretation'] as { coding?: { code?: string }[] }[] | undefined
              )?.[0]?.coding?.[0]?.code;
              const quelle = gemeinsam ? null : quelleVon(o);
              return (
                <tr key={String(o.id)}>
                  <td>
                    {untersuchung(o)}
                    <NeuMarke seit={seit} ressource={o} />
                    {quelle && <div className="ps-herkunft">{quelle}</div>}
                  </td>
                  <td className="zahl">
                    <b className={deutung && deutung !== 'N' ? 'ps-auffaellig' : undefined}>
                      {String(menge?.value ?? '').replace('.', ',')} {menge?.unit}
                    </b>
                    {deutung && deutung !== 'N' && <span className="leise-klein"> {deutung}</span>}
                  </td>
                  <td>{deutschesDatum(String(o['effectiveDateTime'] ?? '').slice(0, 10))}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {gemeinsam && <div className="ps-herkunft">aus {gemeinsam}</div>}
      </>
    );
  }

  if (a.schluessel === 'impfungen') {
    return (
      <table className="liste ps-tabelle">
        <thead>
          <tr>
            <th>Impfstoff</th>
            <th>gegen</th>
            <th>Datum</th>
          </tr>
        </thead>
        <tbody>
          {a.eintraege.map((r) => {
            const chronik = chronikLesen(r, provenance);
            const i = impfungAusFhir(r, patientId, herkunftAus(chronik));
            return (
              <tr key={String(r.id)}>
                <td>
                  <b>{i.impfstoff.bezeichnung}</b>
                  <NeuMarke seit={seit} ressource={r} />
                  <div className="ps-herkunft">
                    {[i.dosis ? `${i.dosis}. Dosis` : null, i.geimpftVon]
                      .filter(Boolean)
                      .join(' · ')}
                  </div>
                </td>
                <td>{i.zielkrankheiten.map((k) => k.anzeige).join(', ')}</td>
                <td>{deutschesDatum(i.datum)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    );
  }

  return <div className="ps-leer">Information nicht verfügbar</div>;
}

const STATUS: Record<string, string> = {
  active: 'aktiv',
  'on-hold': 'pausiert',
  unknown: 'verordnet',
  intended: 'geplant',
};

function arzneimittel(r: Ressource, ressourcen: readonly Ressource[]): string {
  const id = String(
    (r['medicationReference'] as { reference?: string } | undefined)?.reference ?? '',
  ).split('/')[1];
  const m = ressourcen.find((x) => x.resourceType === 'Medication' && x.id === id);
  const konzept = (m?.['code'] ?? r['medicationCodeableConcept']) as
    { text?: string; coding?: { system?: string; code?: string; display?: string }[] } | undefined;
  return konzept?.text ?? konzept?.coding?.find((c) => c.system === CODESYSTEM.atc)?.display ?? '—';
}

function dosierung(r: Ressource): string {
  const d = (r['dosageInstruction'] ?? r['dosage']) as { text?: string }[] | undefined;
  return d?.[0]?.text ?? '—';
}

function zeitraum(r: Ressource): string {
  const beginn =
    (r['effectivePeriod'] as { start?: string } | undefined)?.start ??
    (r['authoredOn'] as string | undefined) ??
    (r['dateAsserted'] as string | undefined);
  return beginn ? `seit ${deutschesDatum(beginn.slice(0, 10))}` : '';
}

function untersuchung(o: Ressource): string {
  const k = o['code'] as { text?: string; coding?: { display?: string }[] } | undefined;
  return k?.text ?? k?.coding?.[0]?.display ?? '—';
}
