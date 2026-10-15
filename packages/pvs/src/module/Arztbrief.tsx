import { useMemo } from 'react';
import {
  ADRESSBUCH,
  ARZTBRIEF_XDS,
  KIM_DIENSTKENNUNG,
  PRAXIS_STAMMDATEN,
  arztbriefBauen,
  base64AusBytes,
  briefAusFhir,
  briefPdfErzeugen,
  deutschesDatum,
  pdfSeitenLesen,
  uuidAlsOid,
  type Allergie,
  type Arztbriefangabe,
  type Briefmittel,
  type Diagnose,
  type Impfung,
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
  dokumenteEinstellen,
  kimSenden,
} from '../epa/klient.js';
import { fehlerTitel } from '../epa/epa-bestand.js';
import { istGueltig, useBefugnis } from '../epa/befugnis.js';
import { useBriefangebote, type Abschnitt, type Angebot } from './arztbrief/angebote.js';
import { Briefabschnitt } from './arztbrief/Auswahlmenue.js';
import {
  entwurfAendern,
  entwurfVerwerfen,
  istGewaehlt,
  umschalten,
  useEntwurf,
  type Weg,
} from './arztbrief/entwurf.js';

/**
 * ✦ Arztbrief — strukturiert schreiben, in die ePA einstellen, per KIM versenden (ADR 0038).
 *
 * **Alles Strukturierte steht zur Wahl.** Je Abschnitt öffnet „Auswählen" ein Menü mit allem,
 * was Praxis und ePA dazu führen (`arztbrief/angebote.ts`), nach Quelle gegliedert; das
 * Aktuelle ist vorausgewählt. Neues wird nicht im Brief erfasst, sondern in seiner Quelle —
 * Diagnosen und Allergien, Medikationsplan, Impfungen, Karteikarte. Der Entwurf bleibt dabei
 * erhalten (`arztbrief/entwurf.ts`), und was neu angelegt wurde, ist bei der Rückkehr gewählt.
 * Frei geschrieben werden nur Fragestellung, Beurteilung und Empfehlungen.
 *
 * Die Vorschau ist der Brief, wie er gedruckt und versandt wird — erzeugt aus dem FHIR-Dokument.
 *
 * **Ein Dokument, zwei Wege.** Nach der Unterschrift liegt der Brief in der Praxisablage und geht
 * in die ePA über ITI-41 als ✦ FHIR-Dokument und per KIM als Client-Mail
 * (`Arztbrief;VHitG-Versand;V1.2`) mit PDF und ✦ FHIR-Dokument. Für den Versand wird GOP 86900
 * erfasst.
 *
 * ⚠ Die qualifizierte elektronische Signatur mit dem eHBA bildet die Demo nicht nach; der
 * CDA-Anteil des eArztbriefs (VHitG) entsteht nicht.
 */

const SENDERSYSTEM = `Demo-PVS;V${USER_AGENT.split('/')[1] ?? '0'}`;
/** ⚠ Fiktive OID des einstellenden Systems (sourceId), unter dem Bogen 2.25. */
const QUELLE_OID = '2.25.311173326467018462930125617411520312345';

/** Abschnitte mit Auswahl, in der Reihenfolge des Briefs, und wo Neues erfasst wird. */
const ABSCHNITTE: {
  abschnitt: Abschnitt;
  titel: string;
  erfassen: { pfad: string; text: string } | null;
}[] = [
  {
    abschnitt: 'anamnese',
    titel: 'Anamnese',
    erfassen: { pfad: 'karteikarte', text: 'In der Karteikarte notieren' },
  },
  {
    abschnitt: 'diagnosen',
    titel: 'Diagnosen',
    erfassen: { pfad: 'diagnosen', text: 'Diagnose in „Diagnosen und Allergien" erfassen' },
  },
  {
    abschnitt: 'allergien',
    titel: 'Allergien und Unverträglichkeiten',
    erfassen: { pfad: 'diagnosen', text: 'Allergie in „Diagnosen und Allergien" erfassen' },
  },
  {
    abschnitt: 'befunde',
    titel: 'Befunde',
    erfassen: { pfad: 'karteikarte', text: 'Befund in der Karteikarte notieren' },
  },
  {
    abschnitt: 'medikation',
    titel: 'Medikation',
    erfassen: { pfad: 'medikation', text: 'Im Medikationsplan erfassen' },
  },
  {
    abschnitt: 'impfungen',
    titel: 'Impfungen',
    erfassen: { pfad: 'impfungen', text: 'Impfung erfassen' },
  },
];

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

const zeitpunktJetzt = (heute: string) => `${heute}T${new Date().toTimeString().slice(0, 8)}`;

export function Arztbrief() {
  const patientId = usePatientId();
  const patient = useAuswahl((z) => z.patienten.find((p) => p.id === patientId), [patientId]);
  const nutzer = useZustand((z) => z.nutzer);
  const heute = useZustand((z) => z.heute);
  const kvnr = patient?.versicherung.kvnr ?? '';
  const befugt = istGueltig(useBefugnis(patientId));

  const entwurf = useEntwurf(patientId, zeitpunktJetzt(heute));
  const angebote = useBriefangebote(patientId, entwurf.beginn);
  const aendern = (teil: Parameters<typeof entwurfAendern>[1]) => entwurfAendern(patientId, teil);
  const gewaehlt = (a: Angebot) => istGewaehlt(entwurf, a.id, a.vorgabe);
  const auswahl = (abschnitt: Abschnitt) => angebote[abschnitt].angebote.filter(gewaehlt);

  const { brief, epa, kim, anlass, beurteilung, empfehlungen } = entwurf;
  const empfaenger = ADRESSBUCH.find((e) => e.id === entwurf.empfaengerId) ?? null;

  const angabe = (zeitpunkt: string, dokumentId: string): Arztbriefangabe | null =>
    patient
      ? {
          dokumentId,
          zeitpunkt,
          patient,
          verfasser: { name: nutzer.name, lanr: nutzer.lanr },
          einrichtung: PRAXIS_STAMMDATEN,
          empfaenger,
          anlass,
          anamnese: auswahl('anamnese').map((a) => a.text),
          diagnosen: auswahl('diagnosen').map((a) => a.diagnose as Diagnose),
          allergien: auswahl('allergien').map((a) => a.allergie as Allergie),
          befunde: auswahl('befunde').map((a) => a.text),
          beurteilung,
          medikation: auswahl('medikation').map((a) => a.mittel as Briefmittel),
          impfungen: auswahl('impfungen').map((a) => a.impfung as Impfung),
          empfehlungen,
        }
      : null;

  const vorschau =
    brief?.bundle ??
    (() => {
      const a = angabe(`${heute}T00:00:00`, '00000000-0000-4000-8000-000000000000');
      return a ? arztbriefBauen(a, festeKennungen()) : null;
    })();
  // Neu gerechnet wird nur, wenn sich der Brief ändert — nicht bei jedem Zeichnen.
  const schluessel = vorschau ? JSON.stringify(vorschau) : '';
  const seiten = useMemo(() => {
    const v = schluessel ? briefAusFhir(JSON.parse(schluessel)) : null;
    return v ? pdfSeitenLesen(briefPdfErzeugen(v)) : null;
  }, [schluessel]);

  if (!patient) return <Leer>Diese Patientenkartei gibt es in der Demo nicht.</Leer>;

  const uebernommen = ABSCHNITTE.reduce((n, s) => n + auswahl(s.abschnitt).length, 0);
  const geschrieben = `${anlass} ${beurteilung} ${empfehlungen}`
    .split(/\s+/)
    .filter(Boolean).length;
  const aerztlich = nutzer.rolle === 'aerztin';
  const fest = brief !== null;
  const titel = empfaenger ? `Arztbrief an ${empfaenger.einrichtung}` : 'Arztbrief';
  const setzeWeg = (art: 'epa' | 'kim', weg: Weg) => aendern({ [art]: weg });

  function unterschreiben() {
    const uuid = crypto.randomUUID();
    const zeitpunkt = zeitpunktJetzt(heute);
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
    aendern({ brief: { dokumentId, uuid, bundle, zeitpunkt } });
  }

  async function einstellen() {
    if (!brief) return;
    setzeWeg('epa', { art: 'laeuft' });
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
      setzeWeg('epa', { art: 'erledigt', text: 'in der ePA' });
    } catch (f) {
      const e = f instanceof EpaFehler ? f : null;
      setzeWeg('epa', {
        art: 'fehler',
        text: e && e.status !== 200 ? fehlerTitel(e) : (e?.diagnose ?? 'Nicht eingestellt.'),
      });
    }
  }

  async function senden() {
    const vorlage = brief ? briefAusFhir(brief.bundle) : null;
    if (!brief || !empfaenger?.kim || !vorlage || !patient) return;
    setzeWeg('kim', { art: 'laeuft' });
    const name = `${patient.vorname} ${patient.nachname}`;
    try {
      const antwort = await kimSenden({
        von: PRAXIS_STAMMDATEN.kim,
        an: [empfaenger.kim],
        betreff: `Arztbrief — ${name}, geb. ${deutschesDatum(patient.geburtsdatum)}`,
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
      setzeWeg('kim', {
        art: 'erledigt',
        text: antwort.startsWith('250') ? 'per KIM zugestellt' : antwort,
      });
    } catch (f) {
      setzeWeg('kim', {
        art: 'fehler',
        text: f instanceof EpaFehler ? f.diagnose : 'Nicht versandt.',
      });
    }
  }

  const freitext = (
    id: string,
    beschriftung: string,
    wert: string,
    feld: 'anlass' | 'beurteilung' | 'empfehlungen',
    zeilen: number,
  ) => (
    <div className="feldzeile">
      <label htmlFor={id}>{beschriftung}</label>
      <textarea
        id={id}
        rows={zeilen}
        value={wert}
        onChange={(e) => aendern({ [feld]: e.target.value })}
      />
    </div>
  );
  const abschnitt = (s: (typeof ABSCHNITTE)[number]) => (
    <Briefabschnitt
      key={s.abschnitt}
      titel={s.titel}
      angebote={angebote[s.abschnitt].angebote}
      quellen={angebote[s.abschnitt].quellen}
      gewaehlt={gewaehlt}
      umschalten={(a) => umschalten(patientId, a.id, a.vorgabe, gewaehlt(a))}
      erfassen={s.erfassen}
      gesperrt={fest}
    />
  );
  const nach = (name: Abschnitt) => ABSCHNITTE.find((s) => s.abschnitt === name)!;

  return (
    <div className="spalten arztbrief">
      <Karte
        titel="Arztbrief ✦"
        werkzeuge={
          <>
            <Marker ton="lokal" titel="Aus Praxis und ePA übernommen">
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
                value={entwurf.empfaengerId}
                onChange={(e) => aendern({ empfaengerId: e.target.value })}
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

          {freitext('brief-anlass', 'Fragestellung', anlass, 'anlass', 2)}
          {abschnitt(nach('anamnese'))}
          {abschnitt(nach('diagnosen'))}
          {abschnitt(nach('allergien'))}
          {abschnitt(nach('befunde'))}
          {freitext('brief-beurteilung', 'Beurteilung', beurteilung, 'beurteilung', 3)}
          {abschnitt(nach('medikation'))}
          {abschnitt(nach('impfungen'))}
          {freitext('brief-empfehlungen', 'Empfehlungen', empfehlungen, 'empfehlungen', 2)}
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
              {entwurf.geaendert && (
                <button
                  type="button"
                  className="knopf rechts"
                  onClick={() => entwurfVerwerfen(patientId, zeitpunktJetzt(heute))}
                >
                  Entwurf verwerfen
                </button>
              )}
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
              <button
                type="button"
                className="knopf rechts"
                onClick={() => entwurfVerwerfen(patientId, zeitpunktJetzt(heute))}
              >
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
