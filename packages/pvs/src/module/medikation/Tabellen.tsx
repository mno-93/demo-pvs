import { useMemo, useState } from 'react';
import {
  EMP_STATUS_BEZEICHNUNG,
  amtsPruefen,
  arzneimittel,
  deutschesDatum,
  dosierungAusFhir,
  dosierungAusText,
  imGueltigenPlan,
  letzteVerordnung,
  schwersterBefund,
  type Rezept,
  type AmtsUmgebung,
  type ArzneimittelEintrag,
  type EmpStatus,
  type PraxisplanEintrag,
  type SpiegelEintrag,
} from '@demo-pvs/kern';
import { Marker } from '../../bausteine/Bausteine.js';
import { Befundliste } from '../../bausteine/Befundliste.js';
import { textVon } from '../../epa/epa-bestand.js';
import { Listenzeile, Rezeptspur } from './stand.js';

/** Teile der Plan- und Listentabelle: Spur eines Rezepts, Handlungen je Eintrag, die Medikationsliste. */

export const STATUS_TON: Record<EmpStatus, 'gut' | 'neutral' | 'warn'> = {
  aktiv: 'gut',
  pausiert: 'warn',
  beendet: 'neutral',
  abgesetzt: 'neutral',
  'entered-in-error': 'warn',
};

/** Letzte Verschreibung und Abgabe am Planeintrag. */
export function Spur({ spur }: { spur: Rezeptspur }) {
  if (!spur.verordnetAm) return null;
  return (
    <div className="leise-klein">
      verordnet {deutschesDatum(spur.verordnetAm)}
      {spur.abgegebenAm ? ` · abgegeben ${deutschesDatum(spur.abgegebenAm)}` : ' · nicht eingelöst'}
      {spur.mehrfach && (
        <>
          {' '}
          <Marker ton="warn">{spur.mehrfach.length} Arzneimittel abgegeben</Marker>
        </>
      )}
    </div>
  );
}

/** Letzte Verordnung am Eintrag des Medikationsplans der Praxis — ohne ePA keine Abgabe. */
export function PraxisplanSpur({
  eintrag,
  rezepte,
}: {
  eintrag: PraxisplanEintrag;
  rezepte: readonly Rezept[];
}) {
  const letzte = letzteVerordnung(eintrag, rezepte);
  if (!letzte?.gesendetAm) return null;
  return (
    <div className="leise-klein">verordnet {deutschesDatum(letzte.gesendetAm.slice(0, 10))}</div>
  );
}

/* ---------- Abgleich ---------- */

export function Planhandlungen({
  zeile,
  ausfuehren,
}: {
  zeile: Pick<SpiegelEintrag, 'status'>;
  ausfuehren: (status: EmpStatus, text: string) => void;
}) {
  const [rueckfrage, setzeRueckfrage] = useState(false);
  if (rueckfrage) {
    return (
      <div className="rueckfrage-inline" role="group" aria-label="Als fehlerhaft kennzeichnen?">
        <span>Als fehlerhaft kennzeichnen?</span>
        <button
          type="button"
          className="knopf klein stark"
          onClick={() => {
            setzeRueckfrage(false);
            ausfuehren('entered-in-error', 'Als fehlerhaft gekennzeichnet.');
          }}
        >
          ja
        </button>
        <button type="button" className="knopf klein" onClick={() => setzeRueckfrage(false)}>
          nein
        </button>
      </div>
    );
  }
  return (
    <div className="reihe" style={{ gap: 5 }}>
      {zeile.status === 'aktiv' ? (
        <button
          type="button"
          className="knopf klein"
          onClick={() => ausfuehren('pausiert', 'Pausiert.')}
        >
          pausieren
        </button>
      ) : (
        <button
          type="button"
          className="knopf klein"
          onClick={() => ausfuehren('aktiv', 'Fortgesetzt.')}
        >
          fortsetzen
        </button>
      )}
      <button
        type="button"
        className="knopf klein"
        onClick={() => ausfuehren('abgesetzt', 'Abgesetzt.')}
      >
        absetzen
      </button>
      <button type="button" className="knopf klein" onClick={() => setzeRueckfrage(true)}>
        fehlerhaft …
      </button>
    </div>
  );
}

/* ---------- eML ---------- */

const AKTIVITAET = 'emp-medicationrequest-activity-extension';

/** Aktivitätsnachweise eines eMP-Eintrags: aufgenommene eML-Einträge mit Zeitpunkt (`addedOn`). */
function aktivitaeten(eintrag: { extension?: unknown }): { verweis: string; am: string }[] {
  return (
    (eintrag.extension ?? []) as {
      url: string;
      extension?: {
        url: string;
        valueReference?: { reference?: string };
        valueDateTime?: string;
      }[];
    }[]
  )
    .filter((e) => e.url.endsWith(AKTIVITAET))
    .map((e) => ({
      verweis: e.extension?.find((x) => x.url === 'reference')?.valueReference?.reference ?? '',
      am: e.extension?.find((x) => x.url === 'addedOn')?.valueDateTime ?? '',
    }));
}

/**
 * Die Dosierung als Schema — verglichen wird, was sie sagt, nicht ihr Text: Ein älterer Freitext
 * „1-0-0-0“ und dasselbe Schema strukturiert sind gleich.
 */
function dosierungsschema(dosierungen: unknown, text: string): string {
  const d = dosierungAusFhir(dosierungen) ?? dosierungAusText(text);
  return JSON.stringify(
    d.schema.art === 'freitext' ? dosierungAusText(d.schema.text, d.einheit) : d,
  );
}

/**
 * Weicht ein verknüpfter Listeneintrag in der Dosierung vom Planeintrag ab und hat der Eintrag ihn
 * noch nicht aufgenommen, kann `$link-emp` den Plan aktualisieren — etwa nach einer Verordnung
 * aus dem Plan mit neuer Dosierung. Bedingung des Dienstes (IG-MED-BL-LINK-EMP-ENTRY-V2): kein
 * Aktivitätsnachweis am Eintrag später als der Listeneintrag. Dazu angeboten nur, wenn der Plan
 * seitdem nicht von Hand geändert wurde — eine ältere Verordnung drehte sonst eine spätere
 * Änderung zurück. Ohne Zeitstempel entscheidet die Bedingung des Dienstes allein.
 */
export function planAktualisierbar(z: Listenzeile): boolean {
  const plan = z.planeintrag;
  if (!plan || !imGueltigenPlan(plan)) return false;
  if (
    dosierungsschema(z.aussage['dosage'], z.dosierung) ===
    dosierungsschema(plan.eintrag['dosageInstruction'], plan.dosierung)
  )
    return false;
  const aussageStand = String(z.aussage.meta?.lastUpdated ?? '');
  const nachweise = aktivitaeten(plan.eintrag);
  if (nachweise.some((n) => n.verweis === `MedicationStatement/${String(z.aussage.id)}`))
    return false;
  if (aussageStand && nachweise.some((n) => n.am > aussageStand)) return false;
  const a = Date.parse(aussageStand);
  const p = Date.parse(String(plan.eintrag.meta?.lastUpdated ?? ''));
  return Number.isNaN(a) || Number.isNaN(p) || p <= a;
}

/**
 * Spalten „Verordnung“ und „Dispensierung“ nach der Datenherkunft der eML (IG-MED64473BLY):
 * Datum mit Verordnenden bzw. Apotheke, „(M)“ vor dem Verordnungsdatum bei Mehrfachverordnung,
 * „(S)“ vor dem Abgabedatum bei Substitution. Nachträge, BtM- und T-Rezepte sind erkennbar
 * (Anwendungsfall „Anzeige der eML“); ein Nachtrag zeigt statt der Verordnung die Bearbeitung.
 */
export function VerordnungZelle({ z }: { z: Listenzeile }) {
  const v = z.verordnung;
  if (!v && (z.art === 'Nachtrag' || z.kontext === 'EMP'))
    return (
      <>
        <Marker ton="neutral">{z.art === 'Nachtrag' ? 'Nachtrag' : 'aus dem Plan'}</Marker>{' '}
        {/* Datum und Einrichtung aus derselben Quelle: der letzten Bearbeitung (Provenance). */}
        {deutschesDatum((z.bearbeitung?.datum ?? z.datum).slice(0, 10))}
        <div className="leise-klein">{z.bearbeitung?.einrichtung ?? z.einrichtung}</div>
      </>
    );
  if (!v) return <span className="leise-klein">—</span>;
  return (
    <>
      {v.mehrfach && <abbr title="Mehrfachverordnung">(M)</abbr>}
      {v.mehrfach && ' '}
      {deutschesDatum(v.datum)}
      {v.btm && (
        <>
          {' '}
          <Marker ton="warn">BtM</Marker>
        </>
      )}
      {v.tRezept && (
        <>
          {' '}
          <Marker ton="warn">T-Rezept</Marker>
        </>
      )}
      <div className="leise-klein">{v.von}</div>
    </>
  );
}

export function AbgabeZelle({ z }: { z: Listenzeile }) {
  const a = z.abgabe;
  if (!a) return <span className="leise-klein">{z.verordnung ? 'nicht eingelöst' : '—'}</span>;
  return (
    <>
      {a.substitution && <abbr title="Substitution">(S)</abbr>}
      {a.substitution && ' '}
      {deutschesDatum(a.datum)}
      <div className="leise-klein">{a.apotheke}</div>
    </>
  );
}

export function EmlTabelle({
  zeilen,
  neu,
  darfVerordnen,
  rezept,
  umgebung,
  uebernehmen,
  verknuepfen,
  planAktualisieren,
}: {
  zeilen: Listenzeile[];
  /** Seit dem letzten Aufruf neu, von anderen Einrichtungen. */
  neu: ReadonlySet<string>;
  darfVerordnen: boolean;
  rezept: (z: Listenzeile) => void;
  umgebung: AmtsUmgebung;
  uebernehmen: (z: Listenzeile) => void;
  /** Verknüpft den Eintrag mit dem Planeintrag desselben Wirkstoffs (`$link-emp`). */
  verknuepfen: (z: Listenzeile) => void;
  /**
   * Aktualisiert den verknüpften Planeintrag aus dem Listeneintrag (`$link-emp`, Anwendungsfall
   * „Pflege des eMP aus der eML – Aktualisierung eines eMP-Eintrags“).
   */
  planAktualisieren: (z: Listenzeile) => void;
}) {
  return (
    <div className="tabelle-rahmen">
      <table className="liste">
        <thead>
          <tr>
            <th>Verordnung</th>
            <th>Abgabe</th>
            <th>Arzneimittel</th>
            <th>Dosierung</th>
            <th>Plan</th>
            <th>
              <span className="nur-fuer-screenreader">Aktionen</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {zeilen.map((z) => {
            const katalog = arzneimittel.find((a) => a.atc === z.atc);
            return (
              <tr key={String(z.aussage.id)}>
                <td>
                  <VerordnungZelle z={z} />
                </td>
                <td>
                  <AbgabeZelle z={z} />
                </td>
                <td>
                  {z.medikament ? textVon(z.medikament) : '—'}
                  {neu.has(String(z.aussage.id)) && <span className="neu-marke">neu</span>}
                  <div className="leise-klein">
                    ATC {z.atc || '—'}
                    {z.pzn && ` · PZN ${z.pzn}`}
                  </div>
                </td>
                <td className="leise-klein">{z.dosierung || '—'}</td>
                <td>
                  {!z.planeintrag ? (
                    <Marker ton="warn">nicht im Plan</Marker>
                  ) : imGueltigenPlan(z.planeintrag) ? (
                    <Marker ton="gut">im Plan</Marker>
                  ) : (
                    <Marker ton="neutral">
                      im Plan · {EMP_STATUS_BEZEICHNUNG[z.planeintrag.status]}
                    </Marker>
                  )}
                  {z.wirkstoffImPlan && (
                    <div className="leise-klein">
                      Wirkstoff im Plan: {z.wirkstoffImPlan.bezeichnung}
                    </div>
                  )}
                </td>
                <td>
                  <div className="reihe" style={{ gap: 5 }}>
                    {z.art === 'Verordnung' && z.medikament && katalog && (
                      <button type="button" className="knopf klein" onClick={() => rezept(z)}>
                        Rezept
                      </button>
                    )}
                    {darfVerordnen && planAktualisierbar(z) && (
                      <button
                        type="button"
                        className="knopf klein"
                        aria-label={`Plan aktualisieren: ${z.planeintrag!.bezeichnung} auf ${z.dosierung}`}
                        onClick={() => planAktualisieren(z)}
                      >
                        Plan aktualisieren
                      </button>
                    )}
                    {darfVerordnen && z.wirkstoffImPlan && (
                      <button
                        type="button"
                        className="knopf klein"
                        aria-label={`verknüpfen mit ${z.wirkstoffImPlan.bezeichnung}`}
                        onClick={() => verknuepfen(z)}
                      >
                        verknüpfen
                      </button>
                    )}
                    {darfVerordnen && !z.planeintrag && z.medikament && katalog && (
                      <UebernahmeKnopf
                        mittel={katalog}
                        umgebung={umgebung}
                        beiUebernahme={() => uebernehmen(z)}
                      />
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ---------- AMTS ---------- */

function UebernahmeKnopf({
  mittel,
  umgebung,
  beiUebernahme,
}: {
  mittel: ArzneimittelEintrag;
  umgebung: AmtsUmgebung;
  beiUebernahme: () => void;
}) {
  const [offen, setzeOffen] = useState(false);
  const befunde = useMemo(() => amtsPruefen(mittel, umgebung), [mittel, umgebung]);
  const schwere = schwersterBefund(befunde);
  if (!offen) {
    return (
      <button type="button" className="knopf klein" onClick={() => setzeOffen(true)}>
        in den Plan{schwere === 'kontraindiziert' ? ' ⚠' : ''}
      </button>
    );
  }
  return (
    <div style={{ minWidth: 260 }}>
      <Befundliste befunde={befunde} />
      <div className="reihe" style={{ gap: 6 }}>
        <button
          type="button"
          className={`knopf klein ${schwere === 'kontraindiziert' ? '' : 'stark'}`}
          onClick={() => {
            beiUebernahme();
            setzeOffen(false);
          }}
        >
          {schwere === 'kontraindiziert' ? 'trotzdem übernehmen' : 'übernehmen'}
        </button>
        <button type="button" className="knopf klein" onClick={() => setzeOffen(false)}>
          abbrechen
        </button>
      </div>
    </div>
  );
}
