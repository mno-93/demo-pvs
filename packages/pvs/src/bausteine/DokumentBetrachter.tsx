import { useEffect, useMemo, useState } from 'react';
import {
  deutschesDatum,
  dokumentinhaltLesen,
  laborbefundLesen,
  pdfAnsichtFuer,
  pdfSeitenLesen,
  type Ressource,
} from '@demo-pvs/kern';
import { Leer, Marker } from './Bausteine.js';
import { Befundansicht } from './Befundansicht.js';
import { Seitenansicht } from './Seitenansicht.js';
import { codeVon, datumVon, textVon } from '../epa/epa-bestand.js';
import { istDatei, type EpaDatei } from '../epa/klient.js';

/**
 * Zeigt den Inhalt eines Dokuments so, wie ihn ein Praxissystem darstellen würde: einen
 * Laborbefund als Befund, einen strukturierten Brief nach seinen Abschnitten, eine PDF-Datei als
 * PDF. Strukturierte Dokumente gibt es zusätzlich als **PDF-Ansicht** — so, wie man einen Brief
 * kennt. Die FHIR-Ressource bleibt einen Klick entfernt.
 *
 * `markieren`: Zeilen, die hinterlegt werden — etwa die Stellen, auf denen eine Antwort des
 * ✦ Aktenlotsen beruht. Dann öffnet das Dokument in der Seitenansicht.
 */
export function DokumentBetrachter({
  inhalt,
  patientId,
  dokumentId,
  bestand,
  markieren = [],
  anfang = 'struktur',
}: {
  inhalt: unknown;
  patientId: string;
  dokumentId: string | null;
  bestand: 'lokal' | 'epa';
  markieren?: string[];
  /** Womit ein strukturiertes Dokument öffnet. */
  anfang?: 'struktur' | 'pdf';
}) {
  const [roh, setzeRoh] = useState(false);
  const pdf = useMemo(
    () => (inhalt && !istDatei(inhalt) ? pdfAnsichtFuer(inhalt) : null),
    [inhalt],
  );
  const [ansicht, setzeAnsicht] = useState<'struktur' | 'pdf'>(
    markieren.length > 0 && pdf ? 'pdf' : anfang,
  );
  useEffect(() => {
    if (markieren.length > 0 && pdf) setzeAnsicht('pdf');
  }, [markieren, pdf]);

  if (inhalt === null || inhalt === undefined) return <Leer>Keine Datei.</Leer>;
  if (istDatei(inhalt)) return <Dateiansicht datei={inhalt} markieren={markieren} />;

  const befund = laborbefundLesen(inhalt, patientId, { bestand, dokumentId });
  const struktur = dokumentinhaltLesen(inhalt);

  return (
    <div>
      {pdf && (
        <div className="modusschalter dokument-ansicht-wahl" role="group" aria-label="Ansicht">
          <button
            type="button"
            className={ansicht === 'struktur' ? 'aktiv' : ''}
            aria-pressed={ansicht === 'struktur'}
            onClick={() => setzeAnsicht('struktur')}
          >
            {befund ? 'Befund' : 'Strukturiert'}
          </button>
          <button
            type="button"
            className={ansicht === 'pdf' ? 'aktiv' : ''}
            aria-pressed={ansicht === 'pdf'}
            onClick={() => setzeAnsicht('pdf')}
          >
            PDF-Ansicht
          </button>
        </div>
      )}
      {pdf && ansicht === 'pdf' ? (
        <PdfAnzeige pdf={pdf} markieren={markieren} />
      ) : befund ? (
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

/** Eine Zeichenkette mit einem Byte je Zeichen — so liest der Kern ein PDF. */
async function alsBytezeichen(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let aus = '';
  for (let i = 0; i < bytes.length; i += 8192) {
    aus += String.fromCharCode(...bytes.subarray(i, i + 8192));
  }
  return aus;
}

/**
 * Ein PDF: im eingebetteten Betrachter des Browsers — oder, wenn Stellen zu markieren sind,
 * seitengetreu nachgezeichnet mit den Markierungen. Das Original bleibt einen Klick entfernt.
 */
function PdfAnzeige({ pdf, markieren }: { pdf: string; markieren: string[] }) {
  const seiten = useMemo(() => pdfSeitenLesen(pdf), [pdf]);
  const [original, setzeOriginal] = useState(false);
  const [adresse, setzeAdresse] = useState<string | null>(null);
  const mitMarkierung = markieren.length > 0 && !!seiten && !original;

  useEffect(() => {
    if (mitMarkierung || typeof URL.createObjectURL !== 'function') return;
    const bytes = Uint8Array.from(pdf, (c) => c.charCodeAt(0));
    const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
    setzeAdresse(url);
    return () => URL.revokeObjectURL(url);
  }, [pdf, mitMarkierung]);

  return (
    <div>
      {markieren.length > 0 && seiten && (
        <div className="reihe dokument-markierung-kopf">
          <Marker ton="warn">Stellen zur Antwort markiert</Marker>
          <button type="button" className="knopf klein" onClick={() => setzeOriginal(!original)}>
            {original ? 'Markierung zeigen' : 'Original-PDF'}
          </button>
        </div>
      )}
      {mitMarkierung ? (
        <Seitenansicht seiten={seiten} markieren={markieren} />
      ) : adresse ? (
        <iframe className="pdf-ansicht" src={adresse} title="PDF-Dokument" />
      ) : null}
    </div>
  );
}

/** PDF im eingebetteten Anzeigeprogramm des Browsers, andere Dateien als Angabe. */
function Dateiansicht({ datei, markieren }: { datei: EpaDatei; markieren: string[] }) {
  const [pdf, setzePdf] = useState<string | null>(null);
  useEffect(() => {
    if (datei.mimeType !== 'application/pdf') return;
    let abgebrochen = false;
    void alsBytezeichen(datei.datei)
      .then((p) => {
        if (!abgebrochen) setzePdf(p);
      })
      .catch(() => undefined);
    return () => {
      abgebrochen = true;
    };
  }, [datei]);
  if (datei.mimeType === 'application/pdf') {
    return pdf ? <PdfAnzeige pdf={pdf} markieren={markieren} /> : <Leer>Wird gelesen …</Leer>;
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
