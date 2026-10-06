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

interface Briefabschnitt {
  title?: string;
  text?: { div?: string };
  entry?: { reference?: string }[];
}

/** Absätze aus dem Erzähltext eines Abschnitts (XHTML), ohne Markup. */
function absaetzeAus(div: string | undefined): string[] {
  if (!div) return [];
  const dok = new DOMParser().parseFromString(div, 'text/html');
  const absaetze = [...dok.querySelectorAll('p, li')].map((p) => p.textContent ?? '');
  return absaetze.length > 0 ? absaetze : [dok.body.textContent ?? ''];
}

/**
 * Ein strukturierter Brief, wie er gelesen wird: Abschnitt für Abschnitt mit seinem
 * Erzähltext. Was ein Abschnitt zusätzlich als Eintrag führt, steht darunter mit Code — das
 * ist der Teil, den Listen und Patient Summary nachnutzen können.
 */
function StrukturierterBrief({ inhalt }: { inhalt: unknown }) {
  const s = dokumentinhaltLesen(inhalt);
  const ressourcen = ((inhalt as { entry?: { resource: Ressource }[] }).entry ?? []).map(
    (e) => e.resource,
  );
  const komposition = ressourcen.find((r) => r.resourceType === 'Composition');
  const nachVerweis = new Map(ressourcen.map((r) => [`${r.resourceType}/${String(r.id)}`, r]));
  const abschnitte = (komposition?.['section'] as Briefabschnitt[] | undefined) ?? [];
  const autor = (komposition?.['author'] as { display?: string }[] | undefined)?.[0]?.display;
  /** Ein Eintrag in Kurzform: der Code, sonst die Bezeichnung. */
  const kurz = (r: Ressource) => {
    if (r.resourceType === 'DeviceUseStatement') {
      const geraet = nachVerweis.get(String((r['device'] as { reference?: string })?.reference));
      return geraet ? textVon(geraet, 'type') : 'Gerät';
    }
    return codeVon(r) ?? textVon(r);
  };
  return (
    <div>
      <div className="reihe" style={{ marginBottom: 6 }}>
        <Marker ton="akzent">
          {s.art === 'Entlassbrief' ? 'Strukturierter Entlassbrief' : 'Strukturierter Arztbrief'}
        </Marker>
        <b>{String(komposition?.['title'] ?? '')}</b>
        <span className="leise-klein">
          {deutschesDatum(datumVon(komposition ?? { resourceType: 'Composition' }))}
          {autor ? ` · ${autor}` : ''}
        </span>
      </div>
      {abschnitte.map((a, i) => {
        const eintraege = (a.entry ?? [])
          .map((e) => nachVerweis.get(String(e.reference)))
          .filter((r): r is Ressource => !!r);
        return (
          <section key={i} className="befund-gruppe" aria-label={a.title}>
            <div className="befund-gruppe-titel">{a.title}</div>
            {absaetzeAus(a.text?.div).map((p, j) => (
              <p key={j} className="brief-absatz">
                {p}
              </p>
            ))}
            {eintraege.length > 0 && (
              <p className="brief-eintraege">
                {[...new Set(eintraege.map((r) => r.resourceType))].map((typ) => {
                  const gleiche = eintraege.filter((r) => r.resourceType === typ);
                  return (
                    <span key={typ}>
                      <span className="marker">
                        {gleiche.length} × {typ}
                      </span>{' '}
                      {gleiche.map(kurz).join(', ')}
                    </span>
                  );
                })}
              </p>
            )}
          </section>
        );
      })}
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
