import { Fragment, useMemo, useState } from 'react';
import {
  EMP_STATUS_BEZEICHNUNG,
  EMP_STATUS_CODE,
  offeneUnterschiede,
  planAbgleichen,
  arzneimittel,
  dosierungAlsText,
  dosierungAusFhir,
  dosierungAusText,
  planGrundNachFhir,
  planeintragFortschreiben,
  planmittelNachFhir,
  planeintragGleicherWirkstoff,
  planangabeAusRezept,
  planeintragZumRezept,
  type Rezept,
  type AmtsUmgebung,
  type Dosierung,
  type EmpStatus,
  type PraxisplanEintrag,
  neueId,
} from '@demo-pvs/kern';
import { ausfuehren, lesen, useAuswahl, useZustand } from '../speicher/speicher.js';
import { vorgaenge } from '../speicher/vorgaenge.js';
import { Bestandsband, Karte, Leer, Marker } from '../bausteine/Bausteine.js';
import { DosierungAnzeige } from './medikation/DosierungEingabe.js';
import { DosierungAendern } from './medikation/DosierungAendern.js';
import { usePatientId } from './Patientenkartei.js';
import { EINRICHTUNG, EpaFehler } from '../epa/klient.js';
import { empEintragAendern, empEintragAnlegen, empVerknuepfen } from '../epa/dienste/medikation.js';
import { fehlerTitel } from '../epa/epa-bestand.js';
import { useAktenstatus } from '../epa/aktenstatus.js';
import {
  NeuesRezept,
  RezeptFormular,
  RezepteKarte,
  type Rezeptangabe,
  type Rezeptvorlage,
  dosierungFuerRezept,
} from './medikation/RezeptUi.js';
import { rezeptLoeschen, rezeptSenden } from './medikation/rezepte.js';
import { epaFensterOeffnen } from '../epa/fenster.js';
import { BefugnisHinweis, istGueltig, useBefugnis } from '../epa/befugnis.js';
import { useEpaListen } from '../epa/listen.js';
import { Aenderungsband } from '../epa/gesehen.js';
import { type Planzeile } from './medikation/planabgleich.js';
import {
  planGruppieren,
  Ansichtszeile,
  Listenzeile,
  rezeptspur,
  empKennung,
  planeintrag,
} from './medikation/stand.js';
import { Abgleichband, AbgleichMarker } from './medikation/Abgleich.js';
import {
  STATUS_TON,
  Spur,
  PraxisplanSpur,
  Planhandlungen,
  EmlTabelle,
} from './medikation/Tabellen.js';
import { NeuerPlaneintrag } from './medikation/NeuerPlaneintrag.js';
import {
  useMedikationsstand,
  useNachfragen,
  useZwischenueberschriften,
} from './medikation/laden.js';
import { useAmtsUmgebung } from './medikation/amts.js';
import {
  vorlageAusListe,
  vorlageAusPlan,
  vorlageAusPraxisplan,
  vorlageNeu,
} from './medikation/vorlagen.js';

export function Medikation() {
  const patientId = usePatientId();
  const patient = useAuswahl((z) => z.patienten.find((p) => p.id === patientId), [patientId]);
  const lokaleAllergien = useAuswahl(
    (z) => z.allergien.filter((a) => a.patientId === patientId && a.klinischerStatus === 'aktiv'),
    [patientId],
  );
  const diagnosen = useAuswahl(
    (z) => z.diagnosen.filter((d) => d.patientId === patientId),
    [patientId],
  );
  const lokaleDokumente = useAuswahl(
    (z) => z.dokumente.filter((d) => d.patientId === patientId),
    [patientId],
  );
  const nutzer = useZustand((z) => z.nutzer);
  const heute = useZustand((z) => z.heute);
  const darfVerordnen = nutzer.rolle === 'aerztin';
  const kvnr = patient?.versicherung.kvnr ?? '';

  const befugt = istGueltig(useBefugnis(patientId));
  const { lage: listenlage } = useEpaListen(patient);
  const { stand, laedt, fehler, seit, seitFehler, neuLaden } = useMedikationsstand(
    patientId,
    kvnr,
    befugt,
  );
  const umgebungOhnePlan = useAmtsUmgebung(listenlage, lokaleAllergien, lokaleDokumente);

  const [meldung, setzeMeldung] = useState<{
    art: 'gut' | 'fehler' | 'neutral';
    text: string;
  } | null>(null);
  const planabgleich = useAuswahl(
    (z) => z.planabgleiche.find((a) => a.patientId === patientId) ?? null,
    [patientId],
  );
  const rezepte = useAuswahl(
    (z) => z.rezepte.filter((r) => r.patientId === patientId),
    [patientId],
  );
  const aktenstatus = useAktenstatus(patient);
  const ohneAkte = aktenstatus.daten?.akte === 'keine';
  const praxisplan = useAuswahl(
    (z) => z.praxisplan.filter((e) => e.patientId === patientId),
    [patientId],
  );
  const [vorlage, setzeVorlage] = useState<Rezeptvorlage | null>(null);
  const [neuesRezept, setzeNeuesRezept] = useState(false);
  /** Planzeile, deren Dosierung gerade geändert wird. */
  const [dosisZeile, setzeDosisZeile] = useState<string | null>(null);
  const [neuerPlaneintrag, setzeNeuerPlaneintrag] = useState(false);

  const ohneBefugnis = fehler?.ohneBefugnis ?? false;
  const gesperrt = fehler?.status === 423 || aktenstatus.daten?.medikationGesperrt === true;
  // Der eMP ist gelesen und beschreibbar: Plan und Liste geladen, keine Sperre, kein Widerspruch.
  const mitEpa = !!stand && !fehler && !ohneAkte && !gesperrt;
  const lesenachweis = stand?.plan.lesenachweis ?? null;

  /*
   * Der Plan der Praxis ist, was angezeigt wird (ADR 0046). Mit eMP trägt jede Zeile ihre Lage
   * im Abgleich; ohne eMP stehen nur die Einträge der Praxis da.
   */
  const zeilen: Ansichtszeile[] = useMemo(() => {
    if (!mitEpa || !stand) return praxisplan.map((l) => ({ lage: null, lokal: l, epa: null }));
    return planAbgleichen(praxisplan, stand.zeilen)
      .filter((z) => !(z.lage === 'nur-epa' && z.epa?.status === 'entered-in-error'))
      .map((z) => ({
        lage: z.lage,
        lokal: z.lokal,
        epa: z.epa ? (stand.zeilen.find((x) => x.id === z.epa!.id) ?? null) : null,
      }));
  }, [mitEpa, stand, praxisplan]);
  /**
   * Gruppen nach Status, aktive und pausierte zusätzlich nach Kategorie, wenn die Einstellung der
   * Zwischenüberschriften es vorsieht (IG-MED09759K35-01, Render API).
   */
  const [ueberschriften, zwischenueberschriftenUmschalten, ueberschriftenFehler] =
    useZwischenueberschriften(kvnr, mitEpa);
  // Ohne ePA stellt das Praxissystem den Plan selbst dar, mit Zwischenüberschriften.
  const gruppen = useMemo(
    () => planGruppieren(zeilen, !mitEpa || ueberschriften),
    [zeilen, mitEpa, ueberschriften],
  );
  const offen = mitEpa && stand ? offeneUnterschiede(planAbgleichen(praxisplan, stand.zeilen)) : 0;
  const aktivePlanCodes = zeilen
    .map((z) => z.lokal ?? z.epa!)
    .filter((e) => e.status === 'aktiv')
    .map((e) => e.atc)
    .filter(Boolean);
  const umgebung: AmtsUmgebung = { ...umgebungOhnePlan, bestehendeAtc: aktivePlanCodes };
  // Aufnehmen und Ergänzen gehen immer: in den eMP, wenn er erreichbar ist, sonst in den Plan
  // der Praxis (ADR 0046).
  const planSchreibbar = darfVerordnen;
  const planErgaenzbar = darfVerordnen;

  /*
   * Solange ein gesendetes Rezept noch nicht in der Medikationsliste steht, fragt das Modul
   * nach — der Fachdienst überträgt asynchron. Höchstens zwanzigmal je Rezept, dann bleibt es
   * beim Stand; ein später gesendetes Rezept bekommt seine eigenen Nachfragen.
   */
  useNachfragen(rezepte, stand, gesperrt || !befugt, laedt, neuLaden);

  /** Legt das Rezept an, nimmt das Mittel auf Wunsch in den Plan und sendet es, wenn gewünscht. */
  function rezeptAusVorlage(v: Rezeptvorlage, a: Rezeptangabe, senden: boolean) {
    setzeVorlage(null);
    void handlung(
      async () => {
        // Ohne eMP — und für Einträge nur der Praxis — gehört das Rezept zum Plan der Praxis.
        if (!mitEpa || v.praxisplanId) {
          const id = rezeptOhneEpa(v, a);
          const r = lesen().rezepte.find((x) => x.id === id);
          if (senden && r) await rezeptSenden(r);
          return;
        }
        let empId = v.empId;
        if (a.planAnpassen && v.empId) {
          const z = stand?.zeilen.find((x) => empKennung(x) === v.empId);
          if (z) await epaDosierungAendern(z, a.dosis);
        }
        if (a.auchInPlan) {
          if (v.listeneintrag) {
            // Mit Verweis auf das Arzneimittel des Listeneintrags verknüpft der Dienst beide
            // selbst (IG-MED-BL-ADD-EMP-ENTRY-V2) — ein eigenes $link-emp braucht es nicht.
            const neu = await empEintragAnlegen(
              kvnr,
              lesenachweis,
              { reference: `Medication/${v.listeneintrag.medicationId}` },
              ...planeintrag(kvnr, heute, {
                dosierung: a.dosierung,
                dosis: a.dosis,
                grund: a.grund,
              }),
            );
            empId = String(neu.eintrag.id);
          } else {
            const neu = await empEintragAnlegen(
              kvnr,
              lesenachweis,
              { resource: planmittelNachFhir(v.arzneimittel) },
              ...planeintrag(kvnr, heute, {
                dosierung: a.dosierung,
                dosis: a.dosis,
                grund: a.grund,
              }),
            );
            empId = String(neu.eintrag.id);
          }
        }
        const id = neueId('rezept');
        ausfuehren(
          vorgaenge.rezeptVorbereiten(
            {
              patientId,
              arzneimittel: v.arzneimittel,
              dosierung: a.dosierung,
              dosis: a.dosis,
              packungen: a.packungen,
              normgroesse: a.normgroesse,
              empId,
              grund: a.grund,
              freigabe: a.freigabe,
              hinweis: a.hinweis,
            },
            id,
          ),
        );
        if (senden) {
          const r = lesen().rezepte.find((x) => x.id === id);
          if (r) await rezeptSenden(r);
        }
      },
      senden ? 'E-Rezept signiert und gesendet.' : 'E-Rezept vorbereitet.',
    );
  }

  /**
   * Ohne eMP: Rezept anlegen und dem Medikationsplan der Praxis zuordnen — dem Eintrag, aus dem
   * verordnet wird, oder einem neuen, wenn „auch in den Medikationsplan" gewählt ist.
   */
  function rezeptOhneEpa(v: Rezeptvorlage, a: Rezeptangabe) {
    const id = neueId('rezept');
    ausfuehren(
      vorgaenge.rezeptVorbereiten(
        {
          patientId,
          arzneimittel: v.arzneimittel,
          dosierung: a.dosierung,
          dosis: a.dosis,
          packungen: a.packungen,
          normgroesse: a.normgroesse,
          empId: null,
          grund: a.grund,
          freigabe: a.freigabe,
          hinweis: a.hinweis,
        },
        id,
      ),
    );
    if (v.praxisplanId) {
      ausfuehren(vorgaenge.praxisplanRezeptZuordnen(v.praxisplanId, id));
      if (a.planAnpassen)
        ausfuehren(
          vorgaenge.praxisplanAendern(v.praxisplanId, { dosierung: a.dosierung, dosis: a.dosis }),
        );
    } else if (a.auchInPlan) {
      const r = lesen().rezepte.find((x) => x.id === id);
      if (r)
        ausfuehren(
          vorgaenge.praxisplanAufnehmen({ patientId, ...planangabeAusRezept(r), rezeptIds: [id] }),
        );
    }
    return id;
  }

  /** Ordnet ein Rezept dem gültigen Planeintrag mit demselben Wirkstoff zu (ADR 0051). */
  function rezeptZuordnen(r: Rezept) {
    const e = planeintragGleicherWirkstoff(r, praxisplan);
    if (!e) return;
    ausfuehren(vorgaenge.praxisplanRezeptZuordnen(e.id, r.id));
    setzeMeldung({ art: 'gut', text: 'Dem Planeintrag zugeordnet.' });
  }

  /** Nimmt ein vorhandenes Rezept in den Medikationsplan der Praxis auf. */
  function rezeptInPraxisplan(r: Rezept) {
    ausfuehren(
      vorgaenge.praxisplanAufnehmen({ patientId, ...planangabeAusRezept(r), rezeptIds: [r.id] }),
    );
    setzeMeldung({ art: 'gut', text: 'In den Plan aufgenommen.' });
  }

  function vorlageZeigen(v: Rezeptvorlage) {
    setzeNeuesRezept(false);
    setzeVorlage(v);
  }

  const mehrfachabgaben = (stand?.zeilen ?? [])
    .map((z) => ({ z, spur: rezeptspur(stand!.roh, z.id) }))
    .filter((x) => x.spur.mehrfach);

  /** Führt Operationen aus und lädt danach neu — auch nach einem Fehler. */
  async function handlung(schritte: () => Promise<unknown>, erfolg: string) {
    setzeMeldung({ art: 'neutral', text: 'Wird übermittelt …' });
    try {
      await schritte();
      setzeMeldung({ art: 'gut', text: erfolg });
    } catch (f) {
      setzeMeldung({
        art: 'fehler',
        text:
          f instanceof EpaFehler && f.veraltet
            ? 'Der Plan wurde inzwischen von einer anderen Einrichtung geändert. Er ist neu geladen — bitte erneut ausführen.'
            : f instanceof EpaFehler
              ? `${f.status}: ${f.diagnose}`
              : 'Der Vorgang ist fehlgeschlagen.',
      });
    }
    neuLaden();
  }

  function statusSetzen(z: Planzeile, status: EmpStatus) {
    return () =>
      empEintragAendern(kvnr, lesenachweis, { ...z.eintrag, status: EMP_STATUS_CODE[status] });
  }

  /** „in die ePA →": Eintrag nur der Praxis als neuen eMP-Eintrag anlegen und verknüpfen. */
  function inDieEpa(l: PraxisplanEintrag) {
    const katalog = arzneimittel.find((m) => m.atc === l.atc);
    void handlung(async () => {
      const neu = await empEintragAnlegen(
        kvnr,
        lesenachweis,
        {
          resource: planmittelNachFhir({
            bezeichnung: l.bezeichnung,
            atc: l.atc,
            atcVersion: l.atcVersion || (katalog?.atcVersion ?? ''),
            pzn: l.pzn ?? katalog?.pzn ?? '',
            ...(katalog?.wirkstoff ? { wirkstoff: katalog.wirkstoff } : {}),
          }),
        },
        ...planeintrag(kvnr, heute, {
          dosierung: l.dosierung,
          dosis: l.dosis ?? null,
          grund: l.grund,
          grundDiagnose: diagnosen.find((d) => d.id === l.grundDiagnoseId) ?? null,
        }),
      );
      ausfuehren(
        vorgaenge.praxisplanVerknuepfen(l.id, {
          ...l,
          id: String(neu.eintrag.id),
          status: 'aktiv',
          fassung: neu.eintrag.meta?.versionId ?? '1',
        }),
      );
    }, `„${l.bezeichnung}" in den Medikationsplan der ePA aufgenommen.`);
  }

  /**
   * „Änderung in die ePA →": Dosierung, Grund und Status der Praxis in den eMP-Eintrag. Was die
   * Praxis nicht geändert hat, bleibt, wie es im eMP steht — die Dosierung samt Text und der
   * Behandlungsgrund einer anderen Einrichtung (ADR 0052).
   */
  function aenderungUebertragen(l: PraxisplanEintrag, e: Planzeile) {
    const grundDiagnose = diagnosen.find((d) => d.id === l.grundDiagnoseId) ?? null;
    const dosierungGeaendert = !l.epaStand || l.dosierung !== l.epaStand.dosierung;
    const fortgeschrieben = planeintragFortschreiben(e.eintrag, {
      dosierung: dosierungGeaendert ? (l.dosis ?? dosierungAusText(l.dosierung)) : null,
      grund: l.grund,
      ...(grundDiagnose ? { grundDiagnose } : {}),
    });
    void handlung(async () => {
      const neu = await empEintragAendern(
        kvnr,
        lesenachweis,
        { ...fortgeschrieben, status: EMP_STATUS_CODE[l.status] },
        grundDiagnose ? [planGrundNachFhir(grundDiagnose, kvnr)] : [],
      );
      ausfuehren(
        vorgaenge.praxisplanVerknuepfen(l.id, {
          ...e,
          dosierung: l.dosierung,
          dosis: l.dosis ?? null,
          grund: l.grund,
          grundDiagnose: grundDiagnose
            ? { code: grundDiagnose.code, bezeichnung: grundDiagnose.bezeichnung }
            : null,
          status: l.status,
          fassung: neu.eintrag?.meta?.versionId ?? e.fassung,
        }),
      );
    }, `Änderung an „${l.bezeichnung}" in den Medikationsplan der ePA übertragen.`);
  }

  /**
   * „Dosierung ändern“ (Anwendungsfall „Editieren von eMP-Einträgen“): im eMP über
   * `$update-emp-entry`, wenn der Eintrag abgeglichen ist — Dosierung samt Text, alles andere
   * bleibt —, sonst im Plan der Praxis.
   */
  async function epaDosierungAendern(e: Planzeile, dosis: Dosierung) {
    const neu = await empEintragAendern(
      kvnr,
      lesenachweis,
      planeintragFortschreiben(e.eintrag, { dosierung: dosis, grund: e.grund }),
    );
    // Der Plan der Praxis folgt dem eMP-Eintrag, mit dem er verknüpft ist: Er übernimmt dessen
    // neuen Stand samt Abgleichsstand.
    const lokal = praxisplan.find((l) => l.epaId === e.id);
    if (lokal)
      ausfuehren(
        vorgaenge.praxisplanNachEpa(lokal.id, {
          ...e,
          verantwortlich: EINRICHTUNG.anzeige,
          dosierung: dosierungAlsText(dosis),
          dosis,
          fassung: neu.eintrag?.meta?.versionId ?? e.fassung,
        }),
      );
  }

  function dosierungAendern(z: Ansichtszeile, dosis: Dosierung) {
    setzeDosisZeile(null);
    const text = dosierungAlsText(dosis);
    if (mitEpa && z.epa && (z.lage === 'abgeglichen' || z.lage === 'epa-geaendert')) {
      const e = z.epa;
      void handlung(
        () => epaDosierungAendern(e, dosis),
        `Dosierung von „${e.bezeichnung}" im Medikationsplan der ePA geändert.`,
      );
    } else if (z.lokal) {
      ausfuehren(vorgaenge.praxisplanAendern(z.lokal.id, { dosierung: text, dosis }));
      setzeMeldung({ art: 'gut', text: `Dosierung von „${z.lokal.bezeichnung}" geändert.` });
    }
  }

  /** Status ändern: im eMP, wenn der Eintrag abgeglichen ist — sonst im Plan der Praxis. */
  function statusAendern(z: Ansichtszeile, status: EmpStatus, text: string) {
    if (mitEpa && z.epa && (z.lage === 'abgeglichen' || z.lage === 'epa-geaendert')) {
      void handlung(async () => {
        await statusSetzen(z.epa!, status)();
        // Einen fehlerhaften Eintrag löscht der Dienst (IG-MED-BL-UPDATE-EMP-ENTRY-V3); im Plan
        // der Praxis bleibt er als fehlerhaft stehen.
        if (status === 'entered-in-error' && z.lokal)
          ausfuehren(vorgaenge.praxisplanStatusSetzen(z.lokal.id, status));
      }, text);
    } else if (z.lokal) {
      ausfuehren(vorgaenge.praxisplanStatusSetzen(z.lokal.id, status));
      setzeMeldung({ art: 'gut', text });
    }
  }

  if (!patient) return null;

  return (
    <>
      <Bestandsband lage={ohneAkte ? 'lokal' : 'beides'} />

      {!ohneAkte && (
        <Abgleichband
          kvnr={kvnr}
          mitEpa={mitEpa}
          grund={
            gesperrt
              ? 'Widerspruch gegen den Medikationsprozess'
              : ohneBefugnis
                ? 'keine ePA-Befugnis'
                : fehler
                  ? 'ePA antwortet nicht'
                  : laedt
                    ? 'wird abgefragt'
                    : null
          }
          zuletzt={planabgleich?.abgeglichenAm ?? null}
          offen={offen}
          lesenachweis={lesenachweis}
          neuLaden={neuLaden}
        />
      )}

      {ohneBefugnis && !ohneAkte && <BefugnisHinweis patientId={patientId} />}
      {fehler && !ohneBefugnis && !ohneAkte && (
        <div className={`hinweisbox ${fehler.status === 423 ? 'warn' : 'fehler'}`}>
          <b>{fehlerTitel(fehler)}</b> {fehler.status === 423 ? '' : fehler.diagnose}
        </div>
      )}
      {mehrfachabgaben.map(({ z, spur }) => (
        <div key={z.id} className="hinweisbox warn" role="alert">
          <b>{z.bezeichnung}: mehrere Arzneimittel abgegeben.</b> Der Planeintrag wurde nicht
          automatisch angepasst — bitte prüfen. Abgegeben: {spur.mehrfach!.join(' · ')}
        </div>
      ))}
      {meldung && (
        <div
          className={`hinweisbox ${meldung.art === 'gut' ? 'gut' : meldung.art === 'fehler' ? 'fehler' : ''}`}
          role="status"
        >
          {meldung.text}
        </div>
      )}

      <div className="reihe" style={{ marginBottom: 10 }}>
        {ohneAkte && <Marker ton="neutral">keine ePA</Marker>}
        <Marker ton="neutral">{aktivePlanCodes.length} aktiv im Plan</Marker>
        {!ohneAkte && <Marker ton="neutral">{stand?.liste.length ?? 0} in der Liste</Marker>}
        {umgebung.egfr !== null ? (
          <Marker ton={umgebung.egfr < 45 ? 'warn' : 'neutral'}>
            eGFR {umgebung.egfr} ml/min/1,73 m²
          </Marker>
        ) : (
          <button
            type="button"
            className="marker warn knopflos"
            onClick={() => epaFensterOeffnen(patientId, 'labor')}
          >
            kein Nierenwert
          </button>
        )}
        <Marker ton={umgebung.allergien.length > 0 ? 'warn' : 'neutral'}>
          {umgebung.allergien.length} Allergieangaben
        </Marker>
        {!ohneAkte && (
          <button
            type="button"
            className="knopf klein rechts"
            onClick={() => epaFensterOeffnen(patientId, 'medikation')}
          >
            in der ePA
          </button>
        )}
      </div>

      {vorlage && (
        <RezeptFormular
          vorlage={vorlage}
          umgebung={umgebung}
          heute={heute}
          aerztlich={darfVerordnen}
          planSchreibbar={planSchreibbar}
          beiVorbereiten={(a) => rezeptAusVorlage(vorlage, a, false)}
          beiSenden={(a) => rezeptAusVorlage(vorlage, a, true)}
          abbrechen={() => setzeVorlage(null)}
        />
      )}

      <Karte
        titel="Medikationsplan der Praxis"
        werkzeuge={
          <div className="reihe" style={{ gap: 8 }}>
            {mitEpa && (
              <label className="leise-klein">
                <input
                  type="checkbox"
                  checked={ueberschriften}
                  onChange={(e) => zwischenueberschriftenUmschalten(e.target.checked)}
                />{' '}
                Zwischenüberschriften
              </label>
            )}
            {mitEpa && ueberschriftenFehler && (
              <Marker ton="fehler" titel={ueberschriftenFehler}>
                Einstellung nicht übertragen
              </Marker>
            )}
            {planErgaenzbar && (
              <button
                type="button"
                className="knopf klein"
                aria-expanded={neuerPlaneintrag}
                onClick={() => setzeNeuerPlaneintrag((n) => !n)}
              >
                neuer Planeintrag
              </button>
            )}
          </div>
        }
      >
        {seitFehler && mitEpa && (
          <Marker ton="fehler" titel={seitFehler}>
            Änderungen seit dem letzten Aufruf nicht abrufbar
          </Marker>
        )}
        {seit?.plan && mitEpa && (
          <Aenderungsband
            am={seit.am}
            teile={[
              seit.plan.neu.size > 0 ? `${seit.plan.neu.size} neu` : null,
              seit.plan.geaendert.size > 0 ? `${seit.plan.geaendert.size} geändert` : null,
              seit.plan.entfallen.length > 0
                ? `entfallen: ${seit.plan.entfallen.join(', ')}`
                : null,
            ]}
            von={seit.planVon}
          />
        )}
        {laedt && !stand && zeilen.length === 0 && befugt && !ohneAkte ? (
          <Leer>Wird abgefragt …</Leer>
        ) : zeilen.length === 0 ? (
          <Leer>Kein Eintrag im Plan.</Leer>
        ) : (
          <div className="tabelle-rahmen">
            <table className="liste">
              <thead>
                <tr>
                  <th>Arzneimittel</th>
                  <th>Dosierung</th>
                  <th>Grund</th>
                  <th>Status</th>
                  <th>Zuletzt</th>
                  {!ohneAkte && <th>ePA</th>}
                  <th>
                    <span className="nur-fuer-screenreader">Aktionen</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {gruppen.flatMap((g) => [
                  <tr className="gruppe" key={`gruppe-${g.schluessel}`}>
                    <th colSpan={ohneAkte ? 6 : 7} scope="colgroup">
                      {g.kopf}
                    </th>
                  </tr>,
                  ...g.zeilen.map((z) => {
                    const e = z.lokal ?? z.epa!;
                    const abgeglichen =
                      mitEpa && !!z.epa && (z.lage === 'abgeglichen' || z.lage === 'epa-geaendert');
                    const ungeklaert =
                      z.lage === 'praxis-geaendert' || z.lage === 'beide-geaendert';
                    const schluessel = z.lokal?.id ?? z.epa!.id;
                    return (
                      <Fragment key={schluessel}>
                        <tr>
                          <td>
                            <b>{e.bezeichnung}</b>
                            {z.epa && seit?.plan?.neu.has(z.epa.id) && (
                              <span className="neu-marke">neu</span>
                            )}
                            {z.epa && seit?.plan?.geaendert.has(z.epa.id) && (
                              <span className="neu-marke">geändert</span>
                            )}
                            <div className="leise-klein">ATC {e.atc || '—'}</div>
                            {abgeglichen && stand ? (
                              <Spur spur={rezeptspur(stand.roh, z.epa!.id)} />
                            ) : (
                              z.lokal && <PraxisplanSpur eintrag={z.lokal} rezepte={rezepte} />
                            )}
                            {(ungeklaert || z.lage === 'gleiches-mittel') && z.epa && (
                              <div className="leise-klein">
                                ePA: {z.epa.dosierung} · {z.epa.grund ?? '—'} ·{' '}
                                {EMP_STATUS_BEZEICHNUNG[z.epa.status]}
                              </div>
                            )}
                          </td>
                          <td>
                            <DosierungAnzeige text={e.dosierung} dosis={e.dosis} />
                          </td>
                          <td>
                            {e.grund ?? (e.grundDiagnose ? '' : '—')}
                            {e.grundDiagnose && (
                              <div className="leise-klein">
                                <span className="code">{e.grundDiagnose.code}</span>{' '}
                                {e.grundDiagnose.bezeichnung}
                              </div>
                            )}
                          </td>
                          <td>
                            <Marker ton={STATUS_TON[e.status]}>
                              {EMP_STATUS_BEZEICHNUNG[e.status]}
                            </Marker>
                          </td>
                          <td
                            className="leise-klein"
                            title={
                              z.epa?.angelegtVon ? `angelegt von ${z.epa.angelegtVon}` : undefined
                            }
                          >
                            {e.verantwortlich}
                          </td>
                          {!ohneAkte && (
                            <td>
                              <AbgleichMarker zeile={z} />
                            </td>
                          )}
                          <td>
                            <div className="reihe" style={{ gap: 5 }}>
                              {mitEpa &&
                                darfVerordnen &&
                                z.lokal &&
                                z.lage === 'nur-praxis' &&
                                e.status !== 'beendet' &&
                                e.status !== 'abgesetzt' &&
                                e.status !== 'entered-in-error' && (
                                  <button
                                    type="button"
                                    className="knopf klein stark"
                                    onClick={() => inDieEpa(z.lokal!)}
                                  >
                                    in die ePA →
                                  </button>
                                )}
                              {mitEpa && darfVerordnen && ungeklaert && z.lokal && z.epa && (
                                <>
                                  <button
                                    type="button"
                                    className="knopf klein stark"
                                    onClick={() => aenderungUebertragen(z.lokal!, z.epa!)}
                                  >
                                    Änderung in die ePA →
                                  </button>
                                  <button
                                    type="button"
                                    className="knopf klein"
                                    onClick={() => {
                                      ausfuehren(vorgaenge.praxisplanNachEpa(z.lokal!.id, z.epa!));
                                      setzeMeldung({
                                        art: 'gut',
                                        text: `„${e.bezeichnung}" auf den Stand der ePA gebracht.`,
                                      });
                                    }}
                                  >
                                    ← ePA-Stand
                                  </button>
                                </>
                              )}
                              {mitEpa && darfVerordnen && z.lage === 'gleiches-mittel' && (
                                <button
                                  type="button"
                                  className="knopf klein"
                                  onClick={() => {
                                    ausfuehren(
                                      vorgaenge.praxisplanVerknuepfen(z.lokal!.id, z.epa!),
                                    );
                                    setzeMeldung({
                                      art: 'gut',
                                      text: `„${e.bezeichnung}" mit dem Eintrag der ePA verknüpft.`,
                                    });
                                  }}
                                >
                                  verknüpfen
                                </button>
                              )}
                              {!ungeklaert && e.status === 'aktiv' && (abgeglichen || z.lokal) && (
                                <button
                                  type="button"
                                  className="knopf klein"
                                  onClick={() =>
                                    abgeglichen
                                      ? vorlageZeigen(vorlageAusPlan(z.epa!, stand))
                                      : vorlageZeigen(vorlageAusPraxisplan(z.lokal!))
                                  }
                                >
                                  Rezept
                                </button>
                              )}
                              {darfVerordnen &&
                                !ungeklaert &&
                                z.lage !== 'gleiches-mittel' &&
                                z.lage !== 'nur-epa' &&
                                (e.status === 'aktiv' || e.status === 'pausiert') && (
                                  <button
                                    type="button"
                                    className="knopf klein"
                                    aria-expanded={dosisZeile === schluessel}
                                    onClick={() =>
                                      setzeDosisZeile((s) => (s === schluessel ? null : schluessel))
                                    }
                                  >
                                    Dosierung ändern
                                  </button>
                                )}
                              {darfVerordnen &&
                                !ungeklaert &&
                                z.lage !== 'gleiches-mittel' &&
                                z.lage !== 'nur-epa' &&
                                e.status !== 'entered-in-error' && (
                                  <Planhandlungen
                                    zeile={e}
                                    ausfuehren={(status, text) => statusAendern(z, status, text)}
                                  />
                                )}
                            </div>
                          </td>
                        </tr>
                        {dosisZeile === schluessel && (
                          <tr>
                            <td colSpan={ohneAkte ? 6 : 7}>
                              <DosierungAendern
                                bezeichnung={e.bezeichnung}
                                start={dosierungFuerRezept(e)}
                                abbrechen={() => setzeDosisZeile(null)}
                                beiUebernahme={(d) => dosierungAendern(z, d)}
                              />
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  }),
                ])}
              </tbody>
            </table>
          </div>
        )}
      </Karte>

      {planErgaenzbar && neuerPlaneintrag && (
        <NeuerPlaneintrag
          umgebung={umgebung}
          diagnosen={diagnosen}
          abbrechen={() => setzeNeuerPlaneintrag(false)}
          beiAnlage={(mittel, { dosis, text, grund, grundDiagnose }) => {
            // Nach dem Aufnehmen schließt der Dialog; geöffnet beginnt er wieder leer.
            setzeNeuerPlaneintrag(false);
            // Ohne eMP in den Plan der Praxis; mit eMP dorthin — der Plan der Praxis folgt im Abgleich.
            if (!mitEpa) {
              ausfuehren(
                vorgaenge.praxisplanAufnehmen({
                  patientId,
                  bezeichnung: mittel.bezeichnung,
                  atc: mittel.atc,
                  atcVersion: mittel.atcVersion,
                  pzn: mittel.pzn,
                  dosierung: text,
                  dosis,
                  grund,
                  grundDiagnoseId: grundDiagnose?.id ?? null,
                }),
              );
              setzeMeldung({ art: 'gut', text: 'In den Plan aufgenommen.' });
              return;
            }
            void handlung(
              () =>
                empEintragAnlegen(
                  kvnr,
                  lesenachweis,
                  {
                    resource: planmittelNachFhir({
                      bezeichnung: mittel.bezeichnung,
                      atc: mittel.atc,
                      atcVersion: mittel.atcVersion,
                      pzn: mittel.pzn,
                      wirkstoff: mittel.wirkstoff,
                    }),
                  },
                  ...planeintrag(kvnr, heute, { dosierung: text, dosis, grund, grundDiagnose }),
                ),
              'In den Plan aufgenommen.',
            );
          }}
        />
      )}

      <Karte titel="Medikationsliste">
        {ohneAkte ? (
          <Leer>Keine ePA.</Leer>
        ) : (
          <>
            {seit && seit.liste.size > 0 && (
              <Aenderungsband am={seit.am} teile={[`${seit.liste.size} neu`]} von={seit.listeVon} />
            )}
            {!stand || stand.liste.length === 0 ? (
              <Leer>
                {gesperrt
                  ? 'Gesperrt durch Widerspruch.'
                  : !mitEpa
                    ? 'Ohne Zugriff auf die ePA.'
                    : 'Keine Verordnungen, Abgaben oder Nachträge.'}
              </Leer>
            ) : (
              <EmlTabelle
                zeilen={stand.liste}
                neu={seit?.liste ?? new Set()}
                darfVerordnen={darfVerordnen && mitEpa}
                rezept={(z: Listenzeile) => vorlageZeigen(vorlageAusListe(z))}
                umgebung={umgebung}
                verknuepfen={(z) =>
                  void handlung(async () => {
                    if (!z.wirkstoffImPlan) return;
                    await empVerknuepfen(
                      kvnr,
                      lesenachweis,
                      String(z.aussage.id),
                      empKennung(z.wirkstoffImPlan),
                    );
                  }, 'Mit dem Planeintrag verknüpft.')
                }
                planAktualisieren={(z) =>
                  void handlung(async () => {
                    if (!z.planeintrag) return;
                    await empVerknuepfen(
                      kvnr,
                      lesenachweis,
                      String(z.aussage.id),
                      empKennung(z.planeintrag),
                    );
                  }, 'Medikationsplan aus der Medikationsliste aktualisiert.')
                }
                uebernehmen={(z) =>
                  void handlung(async () => {
                    // Der Dienst verknüpft den Listeneintrag selbst (IG-MED-BL-ADD-EMP-ENTRY-V2).
                    await empEintragAnlegen(
                      kvnr,
                      lesenachweis,
                      { reference: `Medication/${String(z.medikament?.id)}` },
                      ...planeintrag(kvnr, heute, {
                        dosierung: z.dosierung,
                        dosis: dosierungAusFhir(z.aussage['dosage']),
                        dosage: z.aussage['dosage'],
                        grund: null,
                      }),
                    );
                  }, 'In den Plan übernommen.')
                }
              />
            )}
          </>
        )}
      </Karte>

      <RezepteKarte
        rezepte={rezepte}
        liste={stand?.roh ?? null}
        gesperrt={gesperrt || !befugt}
        ohneAkte={ohneAkte}
        aerztlich={darfVerordnen}
        {...(!mitEpa
          ? {
              imPlan: (r: Rezept) => planeintragZumRezept(r, praxisplan) !== null,
              wirkstoffImPlan: (r: Rezept) =>
                planeintragGleicherWirkstoff(r, praxisplan)?.bezeichnung ?? null,
              ...(darfVerordnen ? { inDenPlan: rezeptInPraxisplan, zuordnen: rezeptZuordnen } : {}),
            }
          : {})}
        werkzeuge={
          <button
            type="button"
            className="knopf klein"
            onClick={() => {
              setzeVorlage(null);
              setzeNeuesRezept((n) => !n);
            }}
          >
            neues E-Rezept
          </button>
        }
        beiSenden={(r: Rezept) => {
          void handlung(() => rezeptSenden(r), 'E-Rezept signiert und gesendet.');
        }}
        beiLoeschen={(r: Rezept) => {
          void handlung(() => rezeptLoeschen(r), 'E-Rezept gelöscht.');
        }}
        beiVerwerfen={(r: Rezept) => ausfuehren(vorgaenge.rezeptVerwerfen(r.id))}
      />
      {neuesRezept && (
        <Karte titel="Neues E-Rezept">
          <NeuesRezept beiAuswahl={(m) => vorlageZeigen(vorlageNeu(m, zeilen))} />
        </Karte>
      )}
    </>
  );
}
