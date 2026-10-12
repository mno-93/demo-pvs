import { useMemo, useState } from 'react';
import {
  ADRESSBUCH,
  ARZTBRIEF_XDS,
  KIM_DIENSTKENNUNG,
  KIM_PRAXIS,
  allergiezeile,
  arztbriefBauen,
  base64AusBytes,
  briefAusFhir,
  briefPdfErzeugen,
  deutschesDatum,
  diagnosezeile,
  istGegenwaertig,
  laborbefundeAusDokumenten,
  laborbefundLesen,
  mittelzeile,
  pdfSeitenLesen,
  uuidAlsOid,
  type Arztbriefangabe,
  type Briefmittel,
} from '@demo-pvs/kern';
import { ausfuehren, useAuswahl, useZustand } from '../speicher/speicher.js';
import { vorgaenge } from '../speicher/vorgaenge.js';
import { Karte, Leer, Marker } from '../bausteine/Bausteine.js';
import { Seitenansicht } from '../bausteine/Seitenansicht.js';
import { usePatientId } from './Patientenkartei.js';
import {
  EINRICHTUNG,
  EpaFehler,
  USER_AGENT,
  dokumentAbrufen,
  dokumenteEinstellen,
  dokumenteSuchen,
  kimSenden,
  medikationsplanLesen,
} from '../epa/klient.js';
import {
  codeVon,
  dokumentverweisLesen,
  fehlerTitel,
  istStrukturiert,
  textVon,
  useBetriebsstand,
  useEpaAbfrage,
} from '../epa/epa-bestand.js';
import { istGueltig, useBefugnis, useEinlesungen } from '../epa/befugnis.js';

/**
 * ✦ Arztbrief — strukturiert schreiben, in die ePA einstellen, per KIM versenden.
 *
 * **Was schon dokumentiert ist, wird nicht noch einmal geschrieben.** Diagnosen, Allergien,
 * Befunde der Karteikarte, Laborbefunde und der Medikationsplan der ePA stehen zur Auswahl, das
 * Aktuelle ist vorausgewählt. Selbst zu schreiben bleiben Fragestellung, Beurteilung und
 * Empfehlungen. Die Vorschau ist der Brief, wie er gedruckt und versandt wird — erzeugt aus dem
 * FHIR-Dokument, nicht daneben gepflegt.
 *
 * **Ein Dokument, zwei Wege.** Nach der Unterschrift liegt der Brief in der Praxisablage und geht
 * - in die ePA über ITI-41 (XDS Document Service) als ✦ FHIR-Dokument und
 * - per KIM als Client-Mail mit `X-KIM-Dienstkennung: Arztbrief;VHitG-Versand;V1.2`: PDF mit allen
 *   Inhalten, wie es die Richtlinie elektronischer Brief verlangt, dazu ✦ das FHIR-Dokument als
 *   strukturierter Anhang. Für den Versand wird GOP 86900 erfasst.
 *
 * ⚠ Die qualifizierte elektronische Signatur mit dem eHBA bildet die Demo nicht nach; der
 * CDA-Anteil des eArztbriefs (VHitG) entsteht nicht.
 */

const SENDERSYSTEM = `Demo-PVS;V${USER_AGENT.split('/')[1] ?? '0'}`;
/** ⚠ Fiktive OID des einstellenden Systems (sourceId), unter dem Bogen 2.25. */
const QUELLE_OID = '2.25.311173326467018462930125617411520312345';

interface Befundquelle {
  id: string;
  text: string;
  datum: string;
  herkunft: string;
  vorausgewaehlt: boolean;
}

type Weg =
  | { art: 'bereit' }
  | { art: 'laeuft' }
  | { art: 'erledigt'; text: string }
  | { art: 'fehler'; text: string };

/** Die Vorschau soll beim Tippen nicht zittern: feste Kennungen für den Entwurf. */
function festeKennungen() {
  let n = 0;
  return () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`;
}

function oidAusUuid(uuid: string): string {
  return uuidAlsOid(uuid).replace(/^urn:oid:/, '');
}

function base64Utf8(text: string): string {
  let bin = '';
  for (const b of new TextEncoder().encode(text)) bin += String.fromCharCode(b);
  return btoa(bin);
}

export function Arztbrief() {
  const patientId = usePatientId();
  const patient = useAuswahl((z) => z.patienten.find((p) => p.id === patientId), [patientId]);
  const nutzer = useZustand((z) => z.nutzer);
  const heute = useZustand((z) => z.heute);
  const diagnosen = useAuswahl(
    (z) => z.diagnosen.filter((d) => d.patientId === patientId),
    [patientId],
  );
  const allergien = useAuswahl(
    (z) => z.allergien.filter((a) => a.patientId === patientId),
    [patientId],
  );
  const karteikarte = useAuswahl(
    (z) => z.karteikarte.filter((k) => k.patientId === patientId),
    [patientId],
  );
  const dokumente = useAuswahl(
    (z) => z.dokumente.filter((d) => d.patientId === patientId),
    [patientId],
  );
  const kvnr = patient?.versicherung.kvnr ?? '';
  const betriebsstand = useBetriebsstand();
  // Wie in jeder Ansicht: ohne Befugnis keine Abfrage, nach dem Einlesen der eGK neu.
  const befugt = istGueltig(useBefugnis(patientId));
  const einlesungen = useEinlesungen();

  const plan = useEpaAbfrage(
    () => medikationsplanLesen(kvnr),
    [kvnr, betriebsstand, einlesungen],
    !!kvnr && befugt,
  );
  const mittel = useMemo((): (Briefmittel & { id: string })[] => {
    const p = plan.daten;
    if (!p) return [];
    return p.eintraege
      .filter((e) => e['status'] === 'active')
      .map((e) => {
        const verweis =
          (e['medicationReference'] as { reference?: string } | undefined)?.reference ?? '';
        const m = p.ressourcen.find(
          (r) => r.resourceType === 'Medication' && `Medication/${String(r.id)}` === verweis,
        );
        return {
          id: String(e.id),
          bezeichnung: m ? textVon(m) : '(ohne Bezeichnung)',
          atc: m ? codeVon(m, 'code', 'http://fhir.de/CodeSystem/bfarm/atc') : null,
          dosierung: (e['dosageInstruction'] as { text?: string }[] | undefined)?.[0]?.text ?? '—',
          grund: (e['reasonCode'] as { text?: string }[] | undefined)?.[0]?.text ?? null,
        };
      });
  }, [plan.daten]);

  // Strukturierte Laborbefunde aus der ePA (dgLP) — derselbe Weg wie im ePA-Fenster.
  const epaLabor = useEpaAbfrage(
    async () => {
      const verweise = (await dokumenteSuchen(kvnr))
        .map(dokumentverweisLesen)
        .filter((v) => v.typ?.code === 'BEFU' && istStrukturiert(v));
      const befunde = [];
      for (const v of verweise) {
        const inhalt = await dokumentAbrufen(kvnr, v.ressource);
        const b = laborbefundLesen(inhalt, patientId, { bestand: 'epa', dokumentId: v.id });
        if (b) befunde.push(b);
      }
      return befunde;
    },
    [kvnr, betriebsstand, einlesungen],
    !!kvnr && befugt,
  );

  const befundquellen = useMemo((): Befundquelle[] => {
    const grenze = new Date(`${heute}T00:00:00`);
    grenze.setDate(grenze.getDate() - 90);
    const ausKartei = karteikarte
      .filter((k) => k.kuerzel === 'B')
      .map((k) => ({
        id: k.id,
        text: `${deutschesDatum(k.zeitpunkt.slice(0, 10))}: ${k.text}`,
        datum: k.zeitpunkt,
        herkunft: 'Karteikarte',
        vorausgewaehlt: new Date(k.zeitpunkt) >= grenze,
      }));
    const lokal = laborbefundeAusDokumenten(dokumente).map((b) => ({
      ...b,
      herkunft: 'Laborbefund',
    }));
    const bekannt = new Set(lokal.map((b) => b.kopf.uuid));
    const ausAkte = (epaLabor.daten ?? [])
      .filter((b) => !bekannt.has(b.kopf.uuid))
      .map((b) => ({ ...b, herkunft: 'Laborbefund · ePA' }));
    const ausLabor = [...lokal, ...ausAkte]
      .sort((a, b) => b.kopf.entnahme.localeCompare(a.kopf.entnahme))
      .map((b, i) => {
        const auffaellig = b.werte.filter((w) => w.bewertung !== 'normal');
        const werte = (auffaellig.length > 0 ? auffaellig : b.werte)
          .map(
            (w) =>
              `${w.bezeichnung} ${w.wert} ${w.einheit}${w.bewertung !== 'normal' ? ` (${w.bewertung})` : ''}`,
          )
          .join(', ');
        return {
          id: `labor-${b.kopf.uuid}`,
          text: `Labor ${deutschesDatum(b.kopf.entnahme.slice(0, 10))} (${b.kopf.labor}): ${werte}`,
          datum: b.kopf.entnahme,
          herkunft: b.herkunft,
          vorausgewaehlt: i === 0,
        };
      });
    return [...ausKartei, ...ausLabor].sort((a, b) => b.datum.localeCompare(a.datum));
  }, [karteikarte, dokumente, heute, epaLabor.daten]);

  const [empfaengerId, setzeEmpfaengerId] = useState(ADRESSBUCH[0]!.id);
  const [anlass, setzeAnlass] = useState('');
  const [beurteilung, setzeBeurteilung] = useState('');
  const [empfehlungen, setzeEmpfehlungen] = useState('');
  // `null`: noch nicht angefasst — dann gilt die Vorauswahl.
  const [diagnoseWahl, setzeDiagnoseWahl] = useState<Set<string> | null>(null);
  const [allergieWahl, setzeAllergieWahl] = useState<Set<string> | null>(null);
  const [befundWahl, setzeBefundWahl] = useState<Set<string> | null>(null);
  const [mittelWahl, setzeMittelWahl] = useState<Set<string> | null>(null);
  const [brief, setzeBrief] = useState<{
    dokumentId: string;
    uuid: string;
    bundle: Record<string, unknown>;
    zeitpunkt: string;
  } | null>(null);
  const [epa, setzeEpa] = useState<Weg>({ art: 'bereit' });
  const [kim, setzeKim] = useState<Weg>({ art: 'bereit' });

  const gewaehlteDiagnosen =
    diagnoseWahl ??
    new Set(diagnosen.filter((d) => istGegenwaertig(d.klinischerStatus)).map((d) => d.id));
  const gewaehlteAllergien =
    allergieWahl ??
    new Set(allergien.filter((a) => a.klinischerStatus === 'aktiv').map((a) => a.id));
  const gewaehlteBefunde =
    befundWahl ?? new Set(befundquellen.filter((b) => b.vorausgewaehlt).map((b) => b.id));
  const gewaehlteMittel = mittelWahl ?? new Set(mittel.map((m) => m.id));
  const empfaenger = ADRESSBUCH.find((e) => e.id === empfaengerId) ?? null;

  const angabe = (zeitpunkt: string, dokumentId: string): Arztbriefangabe | null =>
    patient
      ? {
          dokumentId,
          zeitpunkt,
          patient,
          verfasser: { name: nutzer.name, lanr: nutzer.lanr },
          einrichtung: {
            name: EINRICHTUNG.anzeige,
            telematikId: EINRICHTUNG.telematikId,
            anschrift: ['Am Stadtgarten 4', '26000 Beispielstadt'],
            telefon: '0000 3030-0',
          },
          empfaenger,
          anlass,
          diagnosen: diagnosen.filter((d) => gewaehlteDiagnosen.has(d.id)),
          allergien: allergien.filter((a) => gewaehlteAllergien.has(a.id)),
          befunde: befundquellen.filter((b) => gewaehlteBefunde.has(b.id)).map((b) => b.text),
          beurteilung,
          medikation: mittel.filter((m) => gewaehlteMittel.has(m.id)),
          empfehlungen,
        }
      : null;

  const entwurf =
    brief?.bundle ??
    (() => {
      const a = angabe(`${heute}T00:00:00`, '00000000-0000-4000-8000-000000000000');
      return a ? arztbriefBauen(a, festeKennungen()) : null;
    })();
  // Neu gerechnet wird nur, wenn sich der Brief ändert — nicht bei jedem Zeichnen.
  const schluessel = entwurf ? JSON.stringify(entwurf) : '';
  const seiten = useMemo(() => {
    const v = schluessel ? briefAusFhir(JSON.parse(schluessel)) : null;
    return v ? pdfSeitenLesen(briefPdfErzeugen(v)) : null;
  }, [schluessel]);

  if (!patient) return <Leer>Diese Patientenkartei gibt es in der Demo nicht.</Leer>;

  const uebernommen =
    gewaehlteDiagnosen.size +
    gewaehlteAllergien.size +
    gewaehlteBefunde.size +
    gewaehlteMittel.size;
  const geschrieben = `${anlass} ${beurteilung} ${empfehlungen}`
    .split(/\s+/)
    .filter(Boolean).length;
  const aerztlich = nutzer.rolle === 'aerztin';
  const fest = brief !== null;
  const titel = empfaenger ? `Arztbrief an ${empfaenger.einrichtung}` : 'Arztbrief';

  const umschalten = (wahl: Set<string>, setzen: (s: Set<string>) => void, id: string) => {
    const neu = new Set(wahl);
    if (neu.has(id)) neu.delete(id);
    else neu.add(id);
    setzen(neu);
  };

  function unterschreiben() {
    const uuid = crypto.randomUUID();
    const zeitpunkt = `${heute}T${new Date().toTimeString().slice(0, 8)}`;
    const a = angabe(zeitpunkt, uuid);
    if (!a) return;
    const bundle = arztbriefBauen(a);
    const dokumentId = `dok-brief-${uuid.slice(0, 8)}`;
    ausfuehren(
      vorgaenge.arztbriefAblegen(patientId, {
        id: dokumentId,
        titel,
        datum: zeitpunkt,
        inhalt: bundle,
        einrichtung: EINRICHTUNG.anzeige,
      }),
    );
    setzeBrief({ dokumentId, uuid, bundle, zeitpunkt });
  }

  async function einstellen() {
    if (!brief) return;
    setzeEpa({ art: 'laeuft' });
    try {
      // Die entryUUID vergibt das Primärsystem; unter ihr findet der MHD Service das Dokument.
      const entryUuid = crypto.randomUUID();
      await dokumenteEinstellen({
        kvnr,
        uniqueId: oidAusUuid(crypto.randomUUID()),
        quelle: QUELLE_OID,
        zeitpunkt: new Date().toISOString(),
        autor: {
          person: nutzer.name,
          einrichtung: EINRICHTUNG.anzeige,
          telematikId: EINRICHTUNG.telematikId,
        },
        dokumente: [
          {
            entryUuid,
            uniqueId: oidAusUuid(brief.uuid),
            titel,
            mimeType: 'application/fhir+json',
            erstellt: new Date(brief.zeitpunkt).toISOString(),
            ...ARZTBRIEF_XDS,
            inhaltBase64: base64Utf8(JSON.stringify(brief.bundle)),
          },
        ],
      });
      ausfuehren(vorgaenge.dokumentEingestellt(brief.dokumentId, entryUuid));
      setzeEpa({ art: 'erledigt', text: 'in der ePA' });
    } catch (f) {
      const e = f instanceof EpaFehler ? f : null;
      setzeEpa({
        art: 'fehler',
        text: e && e.status !== 200 ? fehlerTitel(e) : (e?.diagnose ?? 'Nicht eingestellt.'),
      });
    }
  }

  async function senden() {
    const vorlage = brief ? briefAusFhir(brief.bundle) : null;
    if (!brief || !empfaenger?.kim || !vorlage) return;
    setzeKim({ art: 'laeuft' });
    const name = `${patient!.vorname} ${patient!.nachname}`;
    try {
      const antwort = await kimSenden({
        von: KIM_PRAXIS,
        an: [empfaenger.kim],
        betreff: `Arztbrief — ${name}, geb. ${deutschesDatum(patient!.geburtsdatum)}`,
        datum: new Date().toISOString(),
        nachrichtId: `${crypto.randomUUID()}@demo-pvs`,
        dienstkennung: KIM_DIENSTKENNUNG.arztbrief,
        sendersystem: SENDERSYSTEM,
        text: `Sehr geehrte Damen und Herren,\n\nanbei der Arztbrief zu ${name}.\n\nMit freundlichen Grüßen\n${nutzer.name}\n${EINRICHTUNG.anzeige}`,
        anhaenge: [
          {
            dateiname: 'arztbrief.pdf',
            mimeType: 'application/pdf',
            base64: base64AusBytes(briefPdfErzeugen(vorlage)),
          },
          {
            dateiname: 'arztbrief.fhir.json',
            mimeType: 'application/fhir+json',
            base64: base64Utf8(JSON.stringify(brief.bundle)),
          },
        ],
      });
      ausfuehren(
        vorgaenge.dokumentVersandt(brief.dokumentId, `per KIM an ${empfaenger.einrichtung}`),
      );
      ausfuehren(vorgaenge.leistungErfassen(patientId, '86900', 'Versand eines eArztbriefs'));
      setzeKim({
        art: 'erledigt',
        text: antwort.startsWith('250') ? 'per KIM zugestellt' : antwort,
      });
    } catch (f) {
      setzeKim({ art: 'fehler', text: f instanceof EpaFehler ? f.diagnose : 'Nicht versandt.' });
    }
  }

  function neu() {
    setzeBrief(null);
    setzeEpa({ art: 'bereit' });
    setzeKim({ art: 'bereit' });
    setzeAnlass('');
    setzeBeurteilung('');
    setzeEmpfehlungen('');
    setzeDiagnoseWahl(null);
    setzeAllergieWahl(null);
    setzeBefundWahl(null);
    setzeMittelWahl(null);
  }

  return (
    <div className="spalten arztbrief">
      <Karte
        titel="Arztbrief ✦"
        werkzeuge={
          <>
            <Marker ton="lokal" titel="Aus Kartei, Labor und Medikationsplan übernommen">
              {uebernommen} übernommen
            </Marker>
            <Marker titel="Selbst geschriebene Wörter">{geschrieben} Wörter geschrieben</Marker>
          </>
        }
      >
        <fieldset disabled={fest} className="arztbrief-formular">
          <div className="feldreihe">
            <div className="feldzeile">
              <label htmlFor="brief-an">An</label>
              <select
                id="brief-an"
                value={empfaengerId}
                onChange={(e) => setzeEmpfaengerId(e.target.value)}
              >
                {ADRESSBUCH.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.einrichtung}
                    {e.kim ? '' : ' (ohne KIM)'}
                  </option>
                ))}
              </select>
            </div>
            <div className="feldzeile arztbrief-kim">
              <span className="leise-klein">KIM</span>
              {empfaenger?.kim ? (
                <code>{empfaenger.kim}</code>
              ) : (
                <Marker ton="warn">keine KIM-Adresse</Marker>
              )}
            </div>
          </div>

          <div className="feldzeile">
            <label htmlFor="brief-anlass">Fragestellung</label>
            <textarea
              id="brief-anlass"
              rows={2}
              value={anlass}
              onChange={(e) => setzeAnlass(e.target.value)}
            />
          </div>

          <Auswahl
            titel="Diagnosen"
            leer="Keine Diagnosen dokumentiert."
            eintraege={diagnosen.map((d) => ({
              id: d.id,
              text: diagnosezeile(d),
              marke: istGegenwaertig(d.klinischerStatus)
                ? d.art === 'dauer'
                  ? 'Dauerdiagnose'
                  : 'akut'
                : 'behoben',
            }))}
            gewaehlt={gewaehlteDiagnosen}
            umschalten={(id) => umschalten(gewaehlteDiagnosen, setzeDiagnoseWahl, id)}
          />
          <Auswahl
            titel="Allergien und Unverträglichkeiten"
            leer="Keine Allergien dokumentiert."
            eintraege={allergien.map((a) => ({
              id: a.id,
              text: allergiezeile(a),
              marke: a.klinischerStatus,
            }))}
            gewaehlt={gewaehlteAllergien}
            umschalten={(id) => umschalten(gewaehlteAllergien, setzeAllergieWahl, id)}
          />
          <Auswahl
            titel="Befunde"
            leer="Keine Befunde in Karteikarte und Labor."
            eintraege={befundquellen.map((b) => ({ id: b.id, text: b.text, marke: b.herkunft }))}
            gewaehlt={gewaehlteBefunde}
            umschalten={(id) => umschalten(gewaehlteBefunde, setzeBefundWahl, id)}
          />

          <div className="feldzeile">
            <label htmlFor="brief-beurteilung">Beurteilung</label>
            <textarea
              id="brief-beurteilung"
              rows={3}
              value={beurteilung}
              onChange={(e) => setzeBeurteilung(e.target.value)}
            />
          </div>

          <Auswahl
            titel="Medikation"
            quelle="Medikationsplan der ePA"
            leer={
              !befugt
                ? 'Keine Befugnis für die ePA dieser Person.'
                : plan.fehler
                  ? fehlerTitel(plan.fehler)
                  : plan.laedt
                    ? 'Medikationsplan wird gelesen …'
                    : 'Keine aktiven Einträge im Medikationsplan.'
            }
            eintraege={mittel.map((m) => ({ id: m.id, text: mittelzeile(m), marke: 'eMP' }))}
            gewaehlt={gewaehlteMittel}
            umschalten={(id) => umschalten(gewaehlteMittel, setzeMittelWahl, id)}
          />

          <div className="feldzeile">
            <label htmlFor="brief-empfehlungen">Empfehlungen</label>
            <textarea
              id="brief-empfehlungen"
              rows={2}
              value={empfehlungen}
              onChange={(e) => setzeEmpfehlungen(e.target.value)}
            />
          </div>
        </fieldset>

        <div className="reihe arztbrief-handlungen">
          {!fest ? (
            <>
              <button
                type="button"
                className="knopf stark"
                disabled={!aerztlich}
                onClick={unterschreiben}
              >
                Unterschreiben
              </button>
              {!aerztlich && <Marker ton="warn">nur ärztlich</Marker>}
              <Marker titel="Qualifizierte elektronische Signatur mit dem eHBA — in der Demo nicht nachgebildet">
                eHBA ⚠
              </Marker>
            </>
          ) : (
            <>
              <Marker ton="gut">unterschrieben</Marker>
              <WegKnopf
                zustand={epa}
                beschriftung="In die ePA einstellen"
                handeln={einstellen}
                gesperrt={befugt ? null : 'keine ePA-Befugnis'}
              />
              <WegKnopf
                zustand={kim}
                beschriftung="Per KIM senden"
                handeln={senden}
                gesperrt={!empfaenger?.kim ? 'keine KIM-Adresse' : null}
              />
              <button type="button" className="knopf rechts" onClick={neu}>
                Neuer Brief
              </button>
            </>
          )}
        </div>
      </Karte>

      <Karte titel="Vorschau">
        {seiten ? <Seitenansicht seiten={seiten} markieren={[]} /> : <Leer>Keine Vorschau.</Leer>}
      </Karte>
    </div>
  );
}

function Auswahl({
  titel,
  quelle,
  leer,
  eintraege,
  gewaehlt,
  umschalten,
}: {
  titel: string;
  quelle?: string;
  leer: string;
  eintraege: { id: string; text: string; marke: string }[];
  gewaehlt: Set<string>;
  umschalten: (id: string) => void;
}) {
  return (
    <fieldset className="brief-auswahl">
      <legend>
        {titel}
        {quelle && <span className="leise-klein"> · {quelle}</span>}
      </legend>
      {eintraege.length === 0 ? (
        <p className="leise-klein">{leer}</p>
      ) : (
        eintraege.map((e) => (
          <label key={e.id} className="brief-eintrag">
            <input type="checkbox" checked={gewaehlt.has(e.id)} onChange={() => umschalten(e.id)} />
            <span>{e.text}</span>
            <span className="leise-klein">{e.marke}</span>
          </label>
        ))
      )}
    </fieldset>
  );
}

function WegKnopf({
  zustand,
  beschriftung,
  handeln,
  gesperrt = null,
}: {
  zustand: Weg;
  beschriftung: string;
  handeln: () => void;
  gesperrt?: string | null;
}) {
  if (zustand.art === 'erledigt') return <Marker ton="gut">{zustand.text}</Marker>;
  return (
    <>
      <button
        type="button"
        className="knopf"
        disabled={zustand.art === 'laeuft' || gesperrt !== null}
        onClick={handeln}
      >
        {beschriftung}
      </button>
      {gesperrt && <Marker ton="warn">{gesperrt}</Marker>}
      {zustand.art === 'fehler' && <Marker ton="fehler">{zustand.text}</Marker>}
    </>
  );
}
