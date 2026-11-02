import { useEffect, useMemo, useState } from 'react';
import { CODESYSTEM, deutschesDatum, dokumentinhaltLesen, type Ressource } from '@demo-pvs/kern';
import { useAuswahl } from '../../speicher/speicher.js';
import { Leer, Marker } from '../../bausteine/Bausteine.js';
import { istDatei } from '../dienste/dokumente.js';
import { codeVon, datumVon, istStrukturiert, textVon } from '../epa-bestand.js';
import { Dokumentzugang, Abschnitt } from './Teile.js';

/** Bereich „Inhalte aus Dokumenten“ des ePA-Fensters: Diagnosen, Allergien, Werte, Prozeduren und Implantate aus strukturierten Dokumenten. */

interface Eintrag {
  ressource: Ressource;
  quelle: string;
}

/**
 * Das Release kennt keine Einzelabfrage von Diagnosen, Allergien oder Laborwerten: Das
 * Praxissystem ruft jedes strukturierte Dokument ab (ITI-68) und zerlegt es selbst.
 */
export function InhalteAusDokumenten({
  patientId,
  verweise,
  inhalte,
  abrufen,
  laeuft,
}: Dokumentzugang & { laeuft: boolean }) {
  const strukturiert = verweise.filter(istStrukturiert);
  const lokaleDiagnosen = useAuswahl(
    (z) => z.diagnosen.filter((d) => d.patientId === patientId),
    [patientId],
  );
  const lokaleAllergien = useAuswahl(
    (z) => z.allergien.filter((a) => a.patientId === patientId),
    [patientId],
  );

  useEffect(() => {
    void abrufen(strukturiert);
  }, [strukturiert.map((s) => s.id).join('|')]);

  const daten = useMemo(() => {
    const ergebnis = {
      diagnosen: [] as Eintrag[],
      allergien: [] as Eintrag[],
      werte: [] as Eintrag[],
      prozeduren: [] as Eintrag[],
      implantate: [] as Eintrag[],
    };
    for (const v of strukturiert) {
      const inhalt = inhalte[v.id]?.inhalt;
      if (!inhalt || istDatei(inhalt)) continue;
      const s = dokumentinhaltLesen(inhalt);
      const quelle = `${v.titel}, ${v.autor.split(', ').slice(1).join(', ') || v.autor}`;
      ergebnis.diagnosen.push(...s.diagnosen.map((r) => ({ ressource: r, quelle })));
      ergebnis.allergien.push(...s.allergien.map((r) => ({ ressource: r, quelle })));
      ergebnis.werte.push(
        ...s.beobachtungen.filter((r) => r['valueQuantity']).map((r) => ({ ressource: r, quelle })),
      );
      ergebnis.prozeduren.push(...s.prozeduren.map((r) => ({ ressource: r, quelle })));
      // Ein Implantat steht als DeviceUseStatement; Bezeichnung und Code trägt das Device.
      const alle = ((inhalt as { entry?: { resource: Ressource }[] }).entry ?? []).map(
        (e) => e.resource,
      );
      ergebnis.implantate.push(
        ...s.implantate.map((r) => {
          const geraet = alle.find(
            (x) =>
              x.resourceType === 'Device' &&
              `Device/${String(x.id)}` === (r['device'] as { reference?: string })?.reference,
          );
          return { ressource: { ...r, code: geraet?.['type'] }, quelle };
        }),
      );
    }
    return ergebnis;
  }, [inhalte, strukturiert]);

  const lokaleIcd = new Set(lokaleDiagnosen.map((d) => d.code));
  const lokaleSnomed = new Set([
    ...lokaleDiagnosen.map((d) => d.snomed?.code),
    ...lokaleAllergien.map((a) => a.snomed?.code),
  ]);

  if (laeuft) return <Leer>Wird abgerufen …</Leer>;
  return (
    <>
      <Eintragsliste
        titel="Diagnosen"
        eintraege={daten.diagnosen}
        lokal={(r) =>
          lokaleIcd.has(codeVon(r, 'code', CODESYSTEM.icd10gm) ?? '') ||
          lokaleSnomed.has(codeVon(r, 'code', CODESYSTEM.snomed) ?? '')
        }
      />
      <Eintragsliste
        titel="Allergien und Unverträglichkeiten"
        eintraege={daten.allergien}
        lokal={(r) => lokaleSnomed.has(codeVon(r, 'code', CODESYSTEM.snomed) ?? '')}
      />
      <Eintragsliste titel="Laborwerte" eintraege={daten.werte} />
      <Eintragsliste titel="Prozeduren" eintraege={daten.prozeduren} />
      <Eintragsliste titel="Implantate" eintraege={daten.implantate} />
    </>
  );
}

function Eintragsliste({
  titel,
  eintraege,
  lokal,
}: {
  titel: string;
  eintraege: Eintrag[];
  lokal?: (r: Ressource) => boolean;
}) {
  const [offen, setzeOffen] = useState<string | null>(null);
  return (
    <Abschnitt titel={`${titel} (${eintraege.length})`}>
      {eintraege.length === 0 ? (
        <Leer>Keine Einträge.</Leer>
      ) : (
        eintraege.map(({ ressource: r, quelle }) => {
          const id = `${r.resourceType}-${String(r.id)}`;
          const menge = r['valueQuantity'] as { value?: number; unit?: string } | undefined;
          return (
            <div key={id} className="akten-eintrag">
              <div className="herkunft">
                {deutschesDatum(datumVon(r))} — aus <b>{quelle}</b>
              </div>
              <div className="reihe">
                <b>{textVon(r)}</b>
                {(
                  r['code'] as { coding?: { system?: string; code?: string }[] } | undefined
                )?.coding?.map((k) => (
                  <span key={`${k.system}-${k.code}`} className="code" title={k.system}>
                    {kurzSystem(k.system)} {k.code}
                  </span>
                ))}
                {menge?.value !== undefined && (
                  <span className="code">
                    {String(menge.value).replace('.', ',')} {menge.unit}
                  </span>
                )}
                {lokal?.(r) && <Marker ton="lokal">auch in der Praxis</Marker>}
                <button
                  type="button"
                  className="knopf klein rechts"
                  aria-expanded={offen === id}
                  onClick={() => setzeOffen(offen === id ? null : id)}
                >
                  FHIR
                </button>
              </div>
              {offen === id && <pre className="code-block">{JSON.stringify(r, null, 2)}</pre>}
            </div>
          );
        })
      )}
    </Abschnitt>
  );
}

function kurzSystem(system: string | undefined): string {
  if (system === CODESYSTEM.icd10gm) return 'ICD-10-GM';
  if (system === CODESYSTEM.snomed) return 'SNOMED CT';
  if (system === CODESYSTEM.atc) return 'ATC';
  if (system === CODESYSTEM.loinc) return 'LOINC';
  if (system === CODESYSTEM.ops) return 'OPS';
  return system ?? '';
}
