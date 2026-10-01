import { useEffect, useState } from 'react';
import {
  deutschesDatum,
  dokumentinhaltLesen,
  laborbefundLesen,
  type Ressource,
} from '@demo-pvs/kern';
import { Leer, Marker } from './Bausteine.js';
import { Befundansicht } from './Befundansicht.js';
import { codeVon, datumVon, textVon } from '../epa/epa-bestand.js';
import { istDatei, type EpaDatei } from '../epa/klient.js';

/**
 * Zeigt den Inhalt eines Dokuments so, wie ihn ein Praxissystem darstellen würde: einen
 * Laborbefund als Befund, einen strukturierten Brief nach seinen Einträgen, eine PDF-Datei als
 * PDF. Die FHIR-Ressource bleibt einen Klick entfernt.
 */
export function DokumentBetrachter({
  inhalt,
  patientId,
  dokumentId,
  bestand,
}: {
  inhalt: unknown;
  patientId: string;
  dokumentId: string | null;
  bestand: 'lokal' | 'epa';
}) {
  const [roh, setzeRoh] = useState(false);

  if (inhalt === null || inhalt === undefined) return <Leer>Keine Datei.</Leer>;
  if (istDatei(inhalt)) return <Dateiansicht datei={inhalt} />;

  const befund = laborbefundLesen(inhalt, patientId, { bestand, dokumentId });
  const struktur = dokumentinhaltLesen(inhalt);

  return (
    <div>
      {befund ? (
        <>
          <div className="reihe" style={{ marginBottom: 8 }}>
            <Marker ton="akzent">Laborbefund (dgLP)</Marker>
          </div>
          <Befundansicht befund={befund} />
        </>
      ) : struktur.art === 'unstrukturiert' ? (
        <Leer>Das Dokument enthält keine lesbaren Einträge.</Leer>
      ) : (
        <StrukturierterBrief inhalt={inhalt} />
      )}
      <button
        type="button"
        className="knopf klein"
        style={{ marginTop: 10 }}
        onClick={() => setzeRoh(!roh)}
      >
        {roh ? 'FHIR-Ressource verbergen' : 'FHIR-Ressource ansehen'}
      </button>
      {roh && <pre className="code-block">{JSON.stringify(inhalt, null, 2)}</pre>}
    </div>
  );
}

function StrukturierterBrief({ inhalt }: { inhalt: unknown }) {
  const s = dokumentinhaltLesen(inhalt);
  const komposition = ((inhalt as { entry?: { resource: Ressource }[] }).entry ?? [])
    .map((e) => e.resource)
    .find((r) => r.resourceType === 'Composition');
  const abschnitt = (titel: string, liste: Ressource[], zeile: (r: Ressource) => string) =>
    liste.length > 0 && (
      <div className="befund-gruppe">
        <div className="befund-gruppe-titel">
          {titel} ({liste.length})
        </div>
        <ul className="brief-liste">
          {liste.map((r) => (
            <li key={String(r.id)}>{zeile(r)}</li>
          ))}
        </ul>
      </div>
    );
  return (
    <div>
      <div className="reihe" style={{ marginBottom: 6 }}>
        <Marker ton="akzent">
          {s.art === 'Entlassbrief' ? 'Strukturierter Entlassbrief' : 'Strukturiertes Dokument'}
        </Marker>
        <b>{String(komposition?.['title'] ?? '')}</b>
        <span className="leise-klein">
          {deutschesDatum(datumVon(komposition ?? { resourceType: 'Composition' }))}
        </span>
      </div>
      {abschnitt('Diagnosen', s.diagnosen, (r) => `${textVon(r)} · ${codeVon(r) ?? 'ohne Code'}`)}
      {abschnitt(
        'Allergien und Unverträglichkeiten',
        s.allergien,
        (r) => `${textVon(r)} · ${codeVon(r) ?? 'ohne Code'}`,
      )}
      {abschnitt('Prozeduren', s.prozeduren, (r) => `${textVon(r)} · ${codeVon(r) ?? 'ohne Code'}`)}
    </div>
  );
}

/** PDF im eingebetteten Anzeigeprogramm des Browsers, andere Dateien als Angabe. */
function Dateiansicht({ datei }: { datei: EpaDatei }) {
  const [adresse, setzeAdresse] = useState<string | null>(null);
  useEffect(() => {
    if (typeof URL.createObjectURL !== 'function') return;
    const url = URL.createObjectURL(datei.datei);
    setzeAdresse(url);
    return () => URL.revokeObjectURL(url);
  }, [datei]);
  if (datei.mimeType === 'application/pdf' && adresse) {
    return <iframe className="pdf-ansicht" src={adresse} title="PDF-Dokument" />;
  }
  if (datei.mimeType.includes('xml')) return <XmlAnsicht datei={datei.datei} />;
  return (
    <div className="hinweisbox">
      <b>{datei.mimeType}</b> · {datei.datei.size} Bytes
    </div>
  );
}

/**
 * Ein XML-Brief (etwa eArztbrief nach CDA) als lesbarer Text: Titel und Absätze des
 * Erzähltexts. Der Quelltext bleibt einen Klick entfernt.
 */
function XmlAnsicht({ datei }: { datei: Blob }) {
  const [text, setzeText] = useState<string | null>(null);
  const [roh, setzeRoh] = useState(false);
  useEffect(() => {
    let abgebrochen = false;
    void datei.text().then((t) => {
      if (!abgebrochen) setzeText(t);
    });
    return () => {
      abgebrochen = true;
    };
  }, [datei]);
  if (text === null) return <Leer>Wird gelesen …</Leer>;
  const dok = new DOMParser().parseFromString(text, 'application/xml');
  const titel = dok.getElementsByTagName('title')[0]?.textContent ?? null;
  const absaetze = [...dok.getElementsByTagName('paragraph')].map((p) => p.textContent ?? '');
  return (
    <div className="xml-ansicht">
      {titel && <b>{titel}</b>}
      {absaetze.length > 0 ? (
        absaetze.map((a, i) => <p key={i}>{a}</p>)
      ) : (
        <Leer>Kein lesbarer Text.</Leer>
      )}
      <button type="button" className="knopf klein" onClick={() => setzeRoh(!roh)}>
        {roh ? 'Quelltext verbergen' : 'Quelltext ansehen'}
      </button>
      {roh && <pre className="code-block">{text}</pre>}
    </div>
  );
}
