import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CODESYSTEM,
  EMP_STATUS_BEZEICHNUNG,
  EMP_STATUS_CODE,
  offeneUnterschiede,
  planAbgleichen,
  praxisGeaendert,
  type Abgleichlage,
  allergieAusFhir,
  allergieFuerAmts,
  amtsPruefen,
  arzneimittel,
  deutscherZeitpunkt,
  deutschesDatum,
  EMP_KATEGORIEN,
  EMP_KATEGORIE_BEZEICHNUNG,
  automatischeKategorie,
  dosierungNachFhir,
  dosierungAlsText,
  type EmpKategorie,
  dosierungAusFhir,
  dosierungsanzeige,
  dosierungAusText,
  planGrundNachFhir,
  planeintragFortschreiben,
  planeintragNachFhir,
  planmittelNachFhir,
  type Diagnose,
  type Dosierung,
  dokumentinhaltLesen,
  istKeineBekannteAllergie,
  laborwerteAusDokumenten,
  letzteVerordnung,
  planangabeAusRezept,
  planeintragZumRezept,
  schwersterBefund,
  staendeVergleichen,
  type Rezept,
  type Standaenderungen,
  type AmtsUmgebung,
  type ArzneimittelEintrag,
  type DokumentierteAllergie,
  type EmpStatus,
  type PraxisplanEintrag,
  type Ressource,
  type SpiegelEintrag,
} from '@demo-pvs/kern';
import { ausfuehren, lesen, useAuswahl, useZustand } from '../speicher/speicher.js';
import { neueId, vorgaenge } from '../speicher/vorgaenge.js';
import { Bestandsband, Karte, Leer, Marker } from '../bausteine/Bausteine.js';
import { Katalogsuche } from '../bausteine/Katalogsuche.js';
import { Befundliste } from '../bausteine/Befundliste.js';
import {
  DOSIERUNG_VORGABE,
  DosierungAnzeige,
  DosierungEingabe,
  dosierungGueltig,
} from './medikation/DosierungEingabe.js';
import { usePatientId } from './Patientenkartei.js';
import {
  EINRICHTUNG,
  EpaFehler,
  empEintragAendern,
  empEintragAnlegen,
  empVerknuepfen,
  medikationslisteLesen,
  medikationslisteSeit,
  medikationsplanLesen,
  medikationsplanStand,
  planaenderungenSeit,
  type Medikationsliste,
  type Medikationsplan,
} from '../epa/klient.js';
import { codeVon, fehlerTitel, textVon, useBetriebsstand } from '../epa/epa-bestand.js';
import { useAktenstatus } from '../epa/aktenstatus.js';
import {
  NeuesRezept,
  RezeptFormular,
  RezepteKarte,
  type Rezeptangabe,
  type Rezeptvorlage,
} from './medikation/RezeptUi.js';
import { rezeptInEpa, rezeptLoeschen, rezeptSenden } from './medikation/rezepte.js';
import { epaFensterOeffnen } from '../epa/fenster.js';
import { BefugnisHinweis, istGueltig, useBefugnis, useEinlesungen } from '../epa/befugnis.js';
import { useEpaListen } from '../epa/listen.js';
import { useLesezeichen } from '../epa/lesezeichen.js';
import { Aenderungsband } from '../epa/gesehen.js';
import {
  eindeutigesAbgleichen,
  planzeilen,
  referenz,
  type Planzeile,
} from './medikation/planabgleich.js';

/**
 * Medikationsmodul nach dem digital gestützten Medikationsprozess — gegen den Medication
 * Service nach IG 1.3.5.
 *
 * Die Medikationsliste (eML) entsteht aus Verordnung, Abgabe und Nachtrag; der
 * Medikationsplan (eMP) nur durch ärztliche Handlung. Jede Änderung am Plan trägt den
 * Lesenachweis — die Kennung des Chronologieeintrags, auf dem die Ansicht beruht. Hat eine
 * andere Einrichtung inzwischen geändert, lehnt die ePA ab, und das Modul lädt neu.
 *
 * ▸ Für das Projekt ist das die Blaupause: automatisch abgeleiteter Bestand plus ärztlich
 * verantwortete Ebene darüber — so ist es für die Patient Summary vorgeschlagen.
 *
 * Angezeigt wird der Medikationsplan der Praxis — für jede Person der Bestand des
 * Praxissystems, auch ohne eingelesene eGK (ADR 0045, 0046). Mit Zugriff wird er gegen den eMP
 * abgeglichen: Eindeutiges automatisch, Eigenes auf Knopfdruck; geschrieben wird dann in den
 * eMP, und der Plan der Praxis folgt. Ohne Zugriff wirken die Handlungen im Plan der Praxis.
 * Die Medikationsliste ist eine reine Sicht der ePA.
 */

const ATC = CODESYSTEM.atc;
const PZN = 'http://fhir.de/CodeSystem/ifa/pzn';

const STATUS_TON: Record<EmpStatus, 'gut' | 'neutral' | 'warn'> = {
  aktiv: 'gut',
  pausiert: 'warn',
  beendet: 'neutral',
  abgesetzt: 'neutral',
  'entered-in-error': 'warn',
};

/** Eine Zeile des Plans: Eintrag der Praxis, eMP-Eintrag oder beide — mit der Lage im Abgleich. */
const STATUS_REIHE: readonly EmpStatus[] = [
  'aktiv',
  'pausiert',
  'beendet',
  'abgesetzt',
  'entered-in-error',
];

function kategorieDerZeile(e: SpiegelEintrag): EmpKategorie {
  return (
    e.kategorie ??
    (e.dosis ? automatischeKategorie(dosierungNachFhir(e.dosis)) : null) ??
    'unassigned'
  );
}

function planGruppieren(zeilen: readonly Ansichtszeile[]) {
  const gruppen: { schluessel: string; kopf: string; zeilen: Ansichtszeile[] }[] = [];
  for (const status of STATUS_REIHE) {
    const imStatus = zeilen.filter((z) => (z.lokal ?? z.epa!).status === status);
    if (imStatus.length === 0) continue;
    if (status !== 'aktiv' && status !== 'pausiert') {
      gruppen.push({ schluessel: status, kopf: EMP_STATUS_BEZEICHNUNG[status], zeilen: imStatus });
      continue;
    }
    for (const k of EMP_KATEGORIEN) {
      const teil = imStatus.filter((z) => kategorieDerZeile(z.lokal ?? z.epa!) === k);
      if (teil.length > 0)
        gruppen.push({
          schluessel: `${status}-${k}`,
          kopf: `${EMP_STATUS_BEZEICHNUNG[status]} · ${EMP_KATEGORIE_BEZEICHNUNG[k]}`,
          zeilen: teil,
        });
    }
  }
  return gruppen;
}

interface Ansichtszeile {
  /** `null`: ohne eMP, kein Abgleich. */
  lage: Abgleichlage | null;
  lokal: PraxisplanEintrag | null;
  epa: Planzeile | null;
}

/** Was die spezifizierte Abfrage „seit dem letzten Aufruf" ergeben hat (ADR 0030). */
interface SeitAbfrage {
  am: string;
  plan: Standaenderungen | null;
  /** Einrichtungen, die den Plan seitdem geändert haben. */
  planVon: string[];
  /** Neue Einträge der Medikationsliste von anderen Einrichtungen. */
  liste: ReadonlySet<string>;
  listeVon: string[];
}

function alsStand(z: Planzeile) {
  return {
    id: z.id,
    fassung: z.fassung,
    bezeichnung: z.bezeichnung,
    vonAnderen: z.zuletztVonTelematikId !== EINRICHTUNG.telematikId,
  };
}

/**
 * Fragt ab, was sich seit dem Lesezeichen geändert hat — mit den Mitteln des Medication
 * Service: Chronologieeinträge nach `recorded`, der Plan zum früheren Chronologieeintrag,
 * `$medication-list` mit `date`. Gemeldet wird nur, was andere Einrichtungen geändert haben.
 */
async function seitAbfragen(
  kvnr: string,
  vorher: { zeitpunkt: string; chronologie: string | null },
  zeilen: Planzeile[],
  liste: Listenzeile[],
): Promise<SeitAbfrage> {
  const chronologie = await planaenderungenSeit(kvnr, vorher.zeitpunkt);
  const fremd = chronologie.filter((c) => c.telematikId !== EINRICHTUNG.telematikId);
  let plan: Standaenderungen | null = null;
  if (fremd.length > 0 && vorher.chronologie) {
    const frueher = await medikationsplanLesen(kvnr, vorher.chronologie);
    plan = staendeVergleichen(planzeilen(frueher).map(alsStand), zeilen.map(alsStand));
  }
  const neueAussagen = new Set(await medikationslisteSeit(kvnr, vorher.zeitpunkt));
  const fremdeZeilen = liste.filter(
    (z) => neueAussagen.has(String(z.aussage.id)) && !z.einrichtung.includes(EINRICHTUNG.anzeige),
  );
  return {
    am: vorher.zeitpunkt,
    plan,
    planVon: [...new Set(fremd.map((c) => c.einrichtung))],
    liste: new Set(fremdeZeilen.map((z) => String(z.aussage.id))),
    listeVon: [...new Set(fremdeZeilen.map((z) => z.einrichtung.split(', ').pop() ?? ''))],
  };
}

/** Ein Eintrag der Liste: Medikationsinformation mit Arzneimittel und Herkunft. */
interface Listenzeile {
  aussage: Ressource;
  medikament: Ressource | null;
  atc: string;
  art: 'Verordnung' | 'Nachtrag';
  datum: string;
  einrichtung: string;
  dosierung: string;
  imPlan: boolean;
}

interface Medikationsstand {
  plan: Medikationsplan;
  zeilen: Planzeile[];
  liste: Listenzeile[];
  /** Die Medikationsliste, wie sie kam — für Rezepte und Abgaben. */
  roh: Medikationsliste;
}

/** Letzte Verschreibung und Abgabe zu einem Planeintrag, aus den verknüpften eML-Einträgen. */
interface Rezeptspur {
  verordnetAm: string | null;
  abgegebenAm: string | null;
  /** Mehr als ein abgegebenes Arzneimittel zur letzten Verschreibung (IG 1.3.5, MUSS-Hinweis). */
  mehrfach: string[] | null;
}

function rezeptspur(liste: Medikationsliste, planId: string): Rezeptspur {
  const verknuepft = liste.eintraege
    .filter((a) =>
      ((a['basedOn'] as { reference?: string }[] | undefined) ?? []).some(
        (b) => b.reference === `MedicationRequest/${planId}`,
      ),
    )
    .sort((x, y) =>
      String((y['effectivePeriod'] as { start?: string } | undefined)?.start ?? '').localeCompare(
        String((x['effectivePeriod'] as { start?: string } | undefined)?.start ?? ''),
      ),
    );
  const letzte = verknuepft[0];
  if (!letzte) return { verordnetAm: null, abgegebenAm: null, mehrfach: null };
  const abgaben = ((letzte['derivedFrom'] as { reference?: string }[] | undefined) ?? [])
    .map((d) => String(d.reference ?? '').split('/'))
    .filter(([typ]) => typ === 'MedicationDispense')
    .map(([, id]) =>
      liste.einschluesse.find((r) => r.resourceType === 'MedicationDispense' && r.id === id),
    )
    .filter((r): r is Ressource => !!r);
  const mittel = (a: Ressource) =>
    textVon(
      liste.einschluesse.find(
        (r) =>
          r.resourceType === 'Medication' &&
          `Medication/${String(r.id)}` ===
            (a['medicationReference'] as { reference?: string } | undefined)?.reference,
      ) ?? a,
    );
  return {
    verordnetAm: String(
      (letzte['effectivePeriod'] as { start?: string } | undefined)?.start ?? '',
    ).slice(0, 10),
    abgegebenAm: abgaben[0] ? String(abgaben[0]['whenHandedOver'] ?? '').slice(0, 10) : null,
    mehrfach: abgaben.length > 1 ? abgaben.map(mittel) : null,
  };
}

function listenzeilen(liste: Medikationsliste, plan: Planzeile[]): Listenzeile[] {
  const suche = (typ: string, id: string) =>
    liste.einschluesse.find((r) => r.resourceType === typ && r.id === id);
  const planAtc = new Set(plan.map((z) => z.atc));
  return liste.eintraege
    .map((a) => {
      const medikament = suche('Medication', referenz(a)) ?? null;
      const atc = (medikament && codeVon(medikament, 'code', ATC)) ?? '';
      const kontext = (a.extension ?? []).find((e) =>
        e.url.endsWith('context-extension'),
      )?.valueCode;
      const verordnung = ((a['derivedFrom'] as { reference?: string }[] | undefined) ?? [])
        .map((q) => String(q.reference ?? '').split('/'))
        .map(([typ, id]) => suche(String(typ), String(id)))
        .find((r) => r?.resourceType === 'MedicationRequest');
      const aktivitaet = liste.einschluesse.find(
        (r) =>
          r.resourceType === 'Provenance' &&
          (r['target'] as { reference: string }[]).some((t) =>
            t.reference.startsWith(`MedicationStatement/${String(a.id)}/`),
          ),
      );
      return {
        aussage: a,
        medikament,
        atc,
        art: kontext === 'MANUAL' ? ('Nachtrag' as const) : ('Verordnung' as const),
        datum: String(
          (a['effectivePeriod'] as { start?: string } | undefined)?.start ??
            a['dateAsserted'] ??
            '',
        ),
        einrichtung:
          (verordnung?.['requester'] as { display?: string } | undefined)?.display ??
          (aktivitaet?.['agent'] as { who?: { display?: string } }[] | undefined)?.[0]?.who
            ?.display ??
          '—',
        dosierung: dosierungsanzeige(a),
        imPlan: Array.isArray(a['basedOn']) || planAtc.has(atc),
      };
    })
    .sort((x, y) => y.datum.localeCompare(x.datum));
}

/**
 * Planeintrag und Behandlungsgründe für `$add-emp-entry` — Abbildung im Kern
 * (fhir/medikation.ts). Ohne strukturierte Dosierung wird der Text übernommen: ein Viererschema
 * strukturiert, sonst Freitext.
 */
function planeintrag(
  kvnr: string,
  datum: string,
  angabe: {
    dosierung: string;
    dosis?: Dosierung | null;
    grund: string | null;
    grundDiagnose?: Diagnose | null;
  },
): [Ressource, Ressource[]] {
  const dosis = angabe.dosis ?? dosierungAusText(angabe.dosierung);
  return [
    planeintragNachFhir({
      kvnr,
      datum,
      dosierung: dosis,
      grund: angabe.grund,
      grundDiagnose: angabe.grundDiagnose ?? null,
    }),
    angabe.grundDiagnose ? [planGrundNachFhir(angabe.grundDiagnose, kvnr)] : [],
  ];
}

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
  const einlesungen = useEinlesungen();
  const betriebsstand = useBetriebsstand();
  const { lage: listenlage } = useEpaListen(patient);

  const [zaehler, setzeZaehler] = useState(0);
  const neuLaden = useCallback(() => setzeZaehler((z) => z + 1), []);
  const [stand, setzeStand] = useState<Medikationsstand | null>(null);
  const [laedt, setzeLaedt] = useState(true);
  const [fehler, setzeFehler] = useState<EpaFehler | null>(null);
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
  const [neuerPlaneintrag, setzeNeuerPlaneintrag] = useState(false);
  const lesezeichen = useLesezeichen(patientId, 'medikation');
  const [seit, setzeSeit] = useState<SeitAbfrage | null>(null);

  useEffect(() => {
    let abgebrochen = false;
    if (!befugt) {
      setzeFehler(new EpaFehler(403, 'Keine Befugnis.', 'notEntitled'));
      setzeStand(null);
      setzeLaedt(false);
      return;
    }
    setzeLaedt(true);
    setzeFehler(null);
    Promise.all([medikationslisteLesen(kvnr), medikationsplanLesen(kvnr)])
      .then(([liste, plan]) => {
        if (abgebrochen) return;
        const zeilen = planzeilen(plan);
        // Der Plan der Praxis übernimmt, was eindeutig ist (ADR 0046).
        eindeutigesAbgleichen(patientId, plan);
        const listenZeilen = listenzeilen(liste, zeilen);
        setzeStand({ plan, zeilen, liste: listenZeilen, roh: liste });
        setzeLaedt(false);
        // Abfrage „seit" gegen das Lesezeichen vom Öffnen der Ansicht; danach das neue merken.
        const vorher = lesezeichen.vorher;
        if (vorher) {
          seitAbfragen(kvnr, vorher, zeilen, listenZeilen)
            .then((s) => {
              if (!abgebrochen) setzeSeit(s);
            })
            .catch(() => undefined);
        }
        lesezeichen.merken(plan.abgerufen, plan.lesenachweis);
      })
      .catch((f: unknown) => {
        if (abgebrochen) return;
        setzeFehler(f instanceof EpaFehler ? f : new EpaFehler(0, 'Unbekannter Fehler'));
        setzeLaedt(false);
      });
    return () => {
      abgebrochen = true;
    };
  }, [kvnr, zaehler, patientId, befugt, einlesungen, betriebsstand]);

  /*
   * AMTS-Prüfung: Allergien der Praxis, aus übernommenen Dokumenten und — in der
   * Weiterentwicklung — aus der Allergienliste der ePA; Nierenfunktion aus Laborbefunden.
   */
  const epaAllergien = useMemo(() => {
    if (listenlage.art !== 'bereit') return [];
    const verknuepft = new Set(lokaleAllergien.map((a) => a.epaId).filter(Boolean));
    return listenlage.listen.allergien
      .filter(
        (e) =>
          !istKeineBekannteAllergie(e.eintrag) &&
          !verknuepft.has(e.eintrag.id) &&
          e.eintrag.klinischerStatus === 'aktiv' &&
          e.eintrag.gewissheit !== 'irrtümlich',
      )
      .map((e) =>
        allergieFuerAmts(
          e.eintrag,
          `Allergienliste der ePA, eingetragen von ${e.chronik.angelegtVon}`,
        ),
      );
  }, [listenlage, lokaleAllergien]);

  const umgebungOhnePlan = useMemo(() => {
    const allergien: DokumentierteAllergie[] = [
      ...lokaleAllergien.map((a) => allergieFuerAmts(a, 'Allergien der Praxis')),
      ...epaAllergien,
      ...lokaleDokumente.flatMap((d) =>
        dokumentinhaltLesen(d.inhalt).allergien.map((r) =>
          allergieAusFhir(r, `${d.titel} (übernommen)`),
        ),
      ),
    ];
    const egfr = laborwerteAusDokumenten(lokaleDokumente)
      .filter((w) => w.loinc === '62238-1')
      .sort((a, b) => b.erhobenAm.localeCompare(a.erhobenAm))[0];
    return {
      allergien,
      egfr: egfr ? Number(egfr.wert.replace(',', '.')) : null,
      egfrGrundlage: egfr
        ? `Laborbefund ${egfr.herkunft.quelle} vom ${deutschesDatum(egfr.erhobenAm)}`
        : null,
    };
  }, [lokaleAllergien, epaAllergien, lokaleDokumente]);

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
   * Gruppen nach Status, aktive und pausierte zusätzlich nach Kategorie (IG-MED09759K35-01; die
   * Einstellung der Zwischenüberschriften gilt mit ihrem Standardwert `true`).
   */
  const gruppen = useMemo(() => planGruppieren(zeilen), [zeilen]);
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
   * nach — der Fachdienst überträgt asynchron. Höchstens zwanzigmal, dann bleibt es beim Stand.
   */
  const ausstehend = rezepte.some(
    (r) => rezeptInEpa(r, stand?.roh ?? null, gesperrt || !befugt).art === 'ausstehend',
  );
  const [nachfragen, setzeNachfragen] = useState(0);
  useEffect(() => {
    if (!ausstehend || laedt || nachfragen >= 20) return;
    const z = setTimeout(() => {
      setzeNachfragen((n) => n + 1);
      neuLaden();
    }, 1500);
    return () => clearTimeout(z);
  }, [ausstehend, laedt, nachfragen, neuLaden]);

  /** Legt das Rezept an, nimmt das Mittel auf Wunsch in den Plan und sendet es, wenn gewünscht. */
  function rezeptAusVorlage(v: Rezeptvorlage, a: Rezeptangabe, senden: boolean) {
    setzeVorlage(null);
    setzeNachfragen(0);
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
        if (a.auchInPlan) {
          if (v.listeneintrag) {
            const neu = await empEintragAnlegen(
              kvnr,
              lesenachweis,
              { reference: `Medication/${v.listeneintrag.medicationId}` },
              ...planeintrag(kvnr, heute, { dosierung: a.dosierung, grund: a.grund }),
            );
            await empVerknuepfen(
              kvnr,
              neu.lesenachweis,
              v.listeneintrag.aussageId,
              String(neu.eintrag.id),
            );
            empId = String(neu.eintrag.id);
          } else {
            const neu = await empEintragAnlegen(
              kvnr,
              lesenachweis,
              { resource: planmittelNachFhir(v.arzneimittel) },
              ...planeintrag(kvnr, heute, { dosierung: a.dosierung, grund: a.grund }),
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
    } else if (a.auchInPlan) {
      const r = lesen().rezepte.find((x) => x.id === id);
      if (r)
        ausfuehren(
          vorgaenge.praxisplanAufnehmen({ patientId, ...planangabeAusRezept(r), rezeptIds: [id] }),
        );
    }
    return id;
  }

  /** Nimmt ein vorhandenes Rezept in den Medikationsplan der Praxis auf. */
  function rezeptInPraxisplan(r: Rezept) {
    ausfuehren(
      vorgaenge.praxisplanAufnehmen({ patientId, ...planangabeAusRezept(r), rezeptIds: [r.id] }),
    );
    setzeMeldung({ art: 'gut', text: 'In den Plan aufgenommen.' });
  }

  function vorlageAusPraxisplan(e: PraxisplanEintrag) {
    setzeNeuesRezept(false);
    setzeVorlage({
      arzneimittel: {
        bezeichnung: e.bezeichnung,
        pzn: e.pzn ?? arzneimittel.find((m) => m.atc === e.atc)?.pzn ?? '',
        atc: e.atc,
        atcVersion: e.atcVersion,
      },
      dosierung: e.dosierung,
      empId: null,
      praxisplanId: e.id,
      grund: e.grund,
      herkunft: 'plan',
      imPlan: true,
      katalog: arzneimittel.find((m) => m.atc === e.atc) ?? null,
    });
  }

  function vorlageAusPlan(z: Planzeile) {
    const katalog =
      arzneimittel.find((m) => m.atc === z.atc && z.bezeichnung.startsWith(m.bezeichnung)) ??
      arzneimittel.find((m) => m.atc === z.atc) ??
      null;
    const mittel = stand?.plan.ressourcen.find(
      (r) => r.resourceType === 'Medication' && r.id === referenz(z.eintrag),
    );
    setzeNeuesRezept(false);
    setzeVorlage({
      arzneimittel: {
        bezeichnung: z.bezeichnung,
        pzn: (mittel && codeVon(mittel, 'code', PZN)) ?? katalog?.pzn ?? '',
        atc: z.atc,
        atcVersion: katalog?.atcVersion ?? '2026',
      },
      dosierung: z.dosierung,
      empId: String(
        (z.eintrag['identifier'] as { value?: string }[] | undefined)?.[0]?.value ?? z.id,
      ),
      grund: z.grund,
      herkunft: 'plan',
      imPlan: true,
      katalog,
    });
  }

  function vorlageAusListe(z: Listenzeile) {
    const katalog = arzneimittel.find((m) => m.atc === z.atc) ?? null;
    setzeNeuesRezept(false);
    setzeVorlage({
      arzneimittel: {
        bezeichnung: z.medikament ? textVon(z.medikament) : (katalog?.bezeichnung ?? ''),
        pzn: (z.medikament && codeVon(z.medikament, 'code', PZN)) ?? katalog?.pzn ?? '',
        atc: z.atc,
        atcVersion: katalog?.atcVersion ?? '2026',
      },
      dosierung: z.dosierung,
      empId: null,
      grund: null,
      herkunft: 'liste',
      imPlan: z.imPlan,
      katalog,
      ...(z.medikament
        ? {
            listeneintrag: {
              aussageId: String(z.aussage.id),
              medicationId: String(z.medikament.id),
            },
          }
        : {}),
    });
  }

  function vorlageNeu(m: ArzneimittelEintrag) {
    setzeNeuesRezept(false);
    setzeVorlage({
      arzneimittel: {
        bezeichnung: m.bezeichnung,
        pzn: m.pzn,
        atc: m.atc,
        atcVersion: m.atcVersion,
      },
      dosierung: '1-0-0-0',
      empId: null,
      grund: null,
      herkunft: 'neu',
      imPlan: aktivePlanCodes.includes(m.atc),
      katalog: m,
    });
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

  /** „Änderung in die ePA →": Dosierung, Grund und Status der Praxis in den eMP-Eintrag. */
  function aenderungUebertragen(l: PraxisplanEintrag, e: Planzeile) {
    const grundDiagnose = diagnosen.find((d) => d.id === l.grundDiagnoseId) ?? null;
    const fortgeschrieben = planeintragFortschreiben(e.eintrag, {
      dosierung: l.dosis ?? dosierungAusText(l.dosierung),
      grund: l.grund,
      grundDiagnose,
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
          fassung: neu.eintrag.meta?.versionId ?? e.fassung,
        }),
      );
    }, `Änderung an „${l.bezeichnung}" in den Medikationsplan der ePA übertragen.`);
  }

  /** Status ändern: im eMP, wenn der Eintrag abgeglichen ist — sonst im Plan der Praxis. */
  function statusAendern(z: Ansichtszeile, status: EmpStatus, text: string) {
    if (mitEpa && z.epa && (z.lage === 'abgeglichen' || z.lage === 'epa-geaendert')) {
      void handlung(statusSetzen(z.epa, status), text);
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
          planErgaenzbar && (
            <button
              type="button"
              className="knopf klein"
              aria-expanded={neuerPlaneintrag}
              onClick={() => setzeNeuerPlaneintrag((n) => !n)}
            >
              neuer Planeintrag
            </button>
          )
        }
      >
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
                    return (
                      <tr key={z.lokal?.id ?? z.epa!.id}>
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
                                  ausfuehren(vorgaenge.praxisplanVerknuepfen(z.lokal!.id, z.epa!));
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
                                    ? vorlageAusPlan(z.epa!)
                                    : vorlageAusPraxisplan(z.lokal!)
                                }
                              >
                                Rezept
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
                rezept={vorlageAusListe}
                umgebung={umgebung}
                uebernehmen={(z) =>
                  void handlung(async () => {
                    const neu = await empEintragAnlegen(
                      kvnr,
                      lesenachweis,
                      { reference: `Medication/${String(z.medikament?.id)}` },
                      ...planeintrag(kvnr, heute, {
                        dosierung: z.dosierung,
                        dosis: dosierungAusFhir(z.aussage['dosage']),
                        grund: null,
                      }),
                    );
                    await empVerknuepfen(
                      kvnr,
                      neu.lesenachweis,
                      String(z.aussage.id),
                      String(neu.eintrag.id),
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
              ...(darfVerordnen ? { inDenPlan: rezeptInPraxisplan } : {}),
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
          setzeNachfragen(0);
          void handlung(() => rezeptSenden(r), 'E-Rezept signiert und gesendet.');
        }}
        beiLoeschen={(r: Rezept) => {
          setzeNachfragen(0);
          void handlung(() => rezeptLoeschen(r), 'E-Rezept gelöscht.');
        }}
        beiVerwerfen={(r: Rezept) => ausfuehren(vorgaenge.rezeptVerwerfen(r.id))}
      />
      {neuesRezept && (
        <Karte titel="Neues E-Rezept">
          <NeuesRezept beiAuswahl={vorlageNeu} />
        </Karte>
      )}
    </>
  );
}

/** Letzte Verschreibung und Abgabe am Planeintrag. */
function Spur({ spur }: { spur: Rezeptspur }) {
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
function PraxisplanSpur({
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

function Abgleichband({
  kvnr,
  mitEpa,
  grund,
  zuletzt,
  offen,
  lesenachweis,
  neuLaden,
}: {
  kvnr: string;
  mitEpa: boolean;
  /** Warum nicht abgeglichen wird. */
  grund: string | null;
  /** Letzter erfolgreicher Abgleich. */
  zuletzt: string | null;
  /** Unterschiede, die eine Handlung brauchen. */
  offen: number;
  lesenachweis: string | null;
  neuLaden: () => void;
}) {
  const [pruefung, setzePruefung] = useState<string | null>(null);

  async function pruefen() {
    try {
      const aktuell = await medikationsplanStand(kvnr);
      const gleich = aktuell.lesenachweis === lesenachweis;
      setzePruefung(gleich ? 'Plan unverändert' : 'Plan geändert — neu geladen');
      // Die Liste hat keine Chronologie; Abgaben ändern sie auch bei unverändertem Plan.
      neuLaden();
    } catch (f) {
      setzePruefung(f instanceof EpaFehler ? f.diagnose : 'keine Antwort');
    }
  }

  return (
    <div className={`abgleichband ${mitEpa && offen === 0 ? 'synchron' : 'veraltet'}`}>
      <span className="abgleichband-punkt" aria-hidden="true" />
      {mitEpa ? (
        <span>
          <b>Abgeglichen</b>
          {zuletzt && ` · ${deutscherZeitpunkt(zuletzt)}`}
          {offen > 0 && ` · ${offen} ${offen === 1 ? 'Unterschied' : 'Unterschiede'} offen`}
        </span>
      ) : (
        <span>
          <b>Nicht abgeglichen</b>
          {grund && ` · ${grund}`}
          {' · '}
          {zuletzt
            ? `Stand des letzten Abgleichs ${deutscherZeitpunkt(zuletzt)}`
            : 'noch nie mit der ePA abgeglichen'}
        </span>
      )}
      <button
        type="button"
        className="knopf klein rechts"
        disabled={!mitEpa}
        onClick={() => void pruefen()}
      >
        Stand prüfen
      </button>
      {pruefung && <span className="leise-klein">{pruefung}</span>}
    </div>
  );
}

/** Lage eines Eintrags im Abgleich mit dem eMP — ohne eMP, was der letzte Abgleich hinterließ. */
function AbgleichMarker({ zeile: z }: { zeile: Ansichtszeile }) {
  const lage =
    z.lage ??
    (z.lokal?.epaId ? (praxisGeaendert(z.lokal) ? 'praxis-geaendert' : 'stand') : 'nur-praxis');
  switch (lage) {
    case 'abgeglichen':
    case 'epa-geaendert':
      return <Marker ton="gut">abgeglichen</Marker>;
    case 'stand':
      return (
        <Marker ton="neutral" titel="Stand des letzten Abgleichs">
          verknüpft
        </Marker>
      );
    case 'praxis-geaendert':
      return <Marker ton="warn">lokal geändert</Marker>;
    case 'beide-geaendert':
      return <Marker ton="warn">in beiden geändert</Marker>;
    case 'nur-praxis':
      return <Marker ton="lokal">nur Praxis</Marker>;
    case 'nur-epa':
      return <Marker ton="akzent">nur ePA</Marker>;
    case 'gleiches-mittel':
      return <Marker ton="warn">gleiches Mittel in der ePA</Marker>;
    case 'nicht-in-epa':
      return <Marker ton="warn">nicht mehr in der ePA</Marker>;
  }
}

/* ---------- Handlungen am Plan ---------- */

function Planhandlungen({
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

function EmlTabelle({
  zeilen,
  neu,
  darfVerordnen,
  rezept,
  umgebung,
  uebernehmen,
}: {
  zeilen: Listenzeile[];
  /** Seit dem letzten Aufruf neu, von anderen Einrichtungen. */
  neu: ReadonlySet<string>;
  darfVerordnen: boolean;
  rezept: (z: Listenzeile) => void;
  umgebung: AmtsUmgebung;
  uebernehmen: (z: Listenzeile) => void;
}) {
  return (
    <div className="tabelle-rahmen">
      <table className="liste">
        <thead>
          <tr>
            <th>Datum</th>
            <th>Art</th>
            <th>Arzneimittel</th>
            <th>Einrichtung</th>
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
                <td>{deutschesDatum(z.datum)}</td>
                <td>
                  <Marker ton={z.art === 'Verordnung' ? 'akzent' : 'neutral'}>{z.art}</Marker>
                </td>
                <td>
                  {z.medikament ? textVon(z.medikament) : '—'}
                  {neu.has(String(z.aussage.id)) && <span className="neu-marke">neu</span>}
                  <div className="leise-klein">ATC {z.atc || '—'}</div>
                </td>
                <td className="leise-klein">{z.einrichtung}</td>
                <td>
                  {z.imPlan ? (
                    <Marker ton="gut">im Plan</Marker>
                  ) : (
                    <Marker ton="warn">nicht im Plan</Marker>
                  )}
                </td>
                <td>
                  <div className="reihe" style={{ gap: 5 }}>
                    {z.art === 'Verordnung' && z.medikament && katalog && (
                      <button type="button" className="knopf klein" onClick={() => rezept(z)}>
                        Rezept
                      </button>
                    )}
                    {darfVerordnen && !z.imPlan && z.medikament && katalog && (
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

/** Angaben eines neuen Planeintrags aus dem Dialog. */
interface Planangabe {
  dosis: Dosierung;
  text: string;
  grund: string | null;
  grundDiagnose: Diagnose | null;
}

function NeuerPlaneintrag({
  umgebung,
  diagnosen,
  beiAnlage,
  abbrechen,
}: {
  umgebung: AmtsUmgebung;
  diagnosen: readonly Diagnose[];
  beiAnlage: (mittel: ArzneimittelEintrag, angabe: Planangabe) => void;
  abbrechen: () => void;
}) {
  const [mittel, setzeMittel] = useState<ArzneimittelEintrag | null>(null);
  const [dosis, setzeDosis] = useState<Dosierung>(DOSIERUNG_VORGABE);
  const [grund, setzeGrund] = useState('');
  const [diagnoseId, setzeDiagnoseId] = useState('');
  const gueltigeDiagnosen = diagnosen.filter(
    (d) => d.diagnosesicherheit !== 'irrtümlich' && d.zusatzkennzeichen !== 'A',
  );
  const befunde = useMemo(() => (mittel ? amtsPruefen(mittel, umgebung) : []), [mittel, umgebung]);

  return (
    <Karte titel="Neuer Planeintrag">
      {!mittel ? (
        <Katalogsuche
          beschriftung="Arzneimittel suchen"
          eintraege={arzneimittel}
          schluesselVon={(a) => a.atc}
          bezeichnungVon={(a) => a.bezeichnung}
          beiAuswahl={setzeMittel}
          platzhalter="Wirkstoff oder ATC, z. B. Metformin oder J01C"
        />
      ) : (
        <>
          <div className="reihe" style={{ marginBottom: 8 }}>
            <b>{mittel.bezeichnung}</b>
            <span className="leise-klein">
              ATC {mittel.atc} ({mittel.atcVersion}) · PZN {mittel.pzn}
            </span>
            <button type="button" className="knopf klein rechts" onClick={() => setzeMittel(null)}>
              anderes Mittel
            </button>
          </div>
          <Befundliste befunde={befunde} />
          <DosierungEingabe wert={dosis} setze={setzeDosis} />
          <div className="feldreihe">
            <div className="feldzeile" style={{ flex: '2 1 240px' }}>
              <label htmlFor="grund-diagnose">Behandlungsgrund (Diagnose)</label>
              <select
                id="grund-diagnose"
                value={diagnoseId}
                onChange={(e) => setzeDiagnoseId(e.target.value)}
              >
                <option value="">—</option>
                {gueltigeDiagnosen.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.code} {d.bezeichnung}
                  </option>
                ))}
              </select>
            </div>
            <div className="feldzeile" style={{ flex: '2 1 240px' }}>
              <label htmlFor="grund">Behandlungsgrund für Patient:in</label>
              <input
                id="grund"
                type="text"
                value={grund}
                placeholder="z. B. Blutdruck"
                onChange={(e) => setzeGrund(e.target.value)}
              />
            </div>
          </div>
          <div className="reihe" style={{ gap: 6 }}>
            <button
              type="button"
              className="knopf stark"
              disabled={!dosierungGueltig(dosis)}
              onClick={() =>
                beiAnlage(mittel, {
                  dosis,
                  text: dosierungAlsText(dosis),
                  grund: grund.trim() === '' ? null : grund.trim(),
                  grundDiagnose: gueltigeDiagnosen.find((d) => d.id === diagnoseId) ?? null,
                })
              }
            >
              In den Plan aufnehmen
            </button>
            <button type="button" className="knopf" onClick={abbrechen}>
              abbrechen
            </button>
          </div>
        </>
      )}
      {!mittel && (
        <button type="button" className="knopf klein" style={{ marginTop: 8 }} onClick={abbrechen}>
          abbrechen
        </button>
      )}
    </Karte>
  );
}
