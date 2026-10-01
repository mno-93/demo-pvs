import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CODESYSTEM,
  EMP_STATUS_BEZEICHNUNG,
  EMP_STATUS_CODE,
  allergieAusFhir,
  allergieFuerAmts,
  amtsPruefen,
  arzneimittel,
  chronikLesen,
  deutscherZeitpunkt,
  deutschesDatum,
  dokumentinhaltLesen,
  istKeineBekannteAllergie,
  jetztAlsIsoOrtszeit,
  laborwerteAusDokumenten,
  schwersterBefund,
  type Rezept,
  type AmtsUmgebung,
  type ArzneimittelEintrag,
  type DokumentierteAllergie,
  type EmpStatus,
  type Ressource,
  type SpiegelEintrag,
} from '@demo-pvs/kern';
import { ausfuehren, lesen, useAuswahl, useZustand } from '../speicher/speicher.js';
import { neueId, vorgaenge } from '../speicher/vorgaenge.js';
import { Bestandsband, Karte, Leer, Marker } from '../bausteine/Bausteine.js';
import { Katalogsuche } from '../bausteine/Katalogsuche.js';
import { Befundliste } from '../bausteine/Befundliste.js';
import { usePatientId } from './Patientenkartei.js';
import {
  EpaFehler,
  empEintragAendern,
  empEintragAnlegen,
  empVerknuepfen,
  medikationslisteLesen,
  medikationsplanLesen,
  medikationsplanStand,
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
 */

const ATC = CODESYSTEM.atc;
const PZN = 'http://fhir.de/CodeSystem/ifa/pzn';
const EMP = 'https://gematik.de/fhir/epa-medication/StructureDefinition/';

const STATUS_AUS_CODE: Record<string, EmpStatus> = Object.fromEntries(
  Object.entries(EMP_STATUS_CODE).map(([k, v]) => [v, k as EmpStatus]),
);

const STATUS_TON: Record<EmpStatus, 'gut' | 'neutral' | 'warn'> = {
  aktiv: 'gut',
  pausiert: 'warn',
  beendet: 'neutral',
  abgesetzt: 'neutral',
  'entered-in-error': 'warn',
};

/** Ein Eintrag des Plans mit allem, was die Handlungen brauchen. */
interface Planzeile extends SpiegelEintrag {
  eintrag: Ressource;
  angelegtVon: string;
  zuletztVon: string;
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

function referenz(r: Ressource, feld = 'medicationReference'): string {
  return (
    String((r[feld] as { reference?: string } | undefined)?.reference ?? '').split('/')[1] ?? ''
  );
}

function planzeilen(plan: Medikationsplan): Planzeile[] {
  const provenance = plan.ressourcen.filter((r) => r.resourceType === 'Provenance');
  return plan.eintraege.map((e) => {
    const mittel = plan.ressourcen.find(
      (r) => r.resourceType === 'Medication' && r.id === referenz(e),
    );
    const chronik = chronikLesen(e, provenance);
    return {
      id: String(e.id),
      eintrag: e,
      bezeichnung: mittel ? textVon(mittel) : '(ohne Bezeichnung)',
      atc: (mittel && codeVon(mittel, 'code', ATC)) ?? '',
      dosierung: (e['dosageInstruction'] as { text?: string }[] | undefined)?.[0]?.text ?? '—',
      grund: (e['reasonCode'] as { text?: string }[] | undefined)?.[0]?.text ?? null,
      status: STATUS_AUS_CODE[String(e['status'])] ?? 'aktiv',
      verantwortlich: chronik.zuletztVon,
      fassung: e.meta?.versionId ?? '1',
      angelegtVon: chronik.angelegtVon,
      zuletztVon: chronik.zuletztVon,
      geaendertAm: chronik.zuletztAm,
    };
  });
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
        dosierung: (a['dosage'] as { text?: string }[] | undefined)?.[0]?.text ?? '1-0-0-0',
        imPlan: Array.isArray(a['basedOn']) || planAtc.has(atc),
      };
    })
    .sort((x, y) => y.datum.localeCompare(x.datum));
}

/** eMP-Eintrag nach `EMPMedicationRequest`. */
function planeintrag(
  kvnr: string,
  heute: string,
  dosierung: string,
  grund: string | null,
): Ressource {
  return {
    resourceType: 'MedicationRequest',
    meta: { profile: [`${EMP}emp-medication-request`] },
    extension: [{ url: `${EMP}context-extension`, valueCode: 'EMP' }],
    status: 'active',
    intent: 'plan',
    subject: { identifier: { system: 'http://fhir.de/sid/gkv/kvid-10', value: kvnr } },
    authoredOn: heute,
    dosageInstruction: [{ text: dosierung }],
    ...(grund ? { reasonCode: [{ text: grund }] } : {}),
  };
}

export function Medikation() {
  const patientId = usePatientId();
  const patient = useAuswahl((z) => z.patienten.find((p) => p.id === patientId), [patientId]);
  const lokaleAllergien = useAuswahl(
    (z) => z.allergien.filter((a) => a.patientId === patientId && a.klinischerStatus === 'aktiv'),
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
  const spiegel = useAuswahl(
    (z) => z.medikationsspiegel.find((m) => m.patientId === patientId) ?? null,
    [patientId],
  );
  const rezepte = useAuswahl(
    (z) => z.rezepte.filter((r) => r.patientId === patientId),
    [patientId],
  );
  const aktenstatus = useAktenstatus(patient);
  const [vorlage, setzeVorlage] = useState<Rezeptvorlage | null>(null);
  const [neuesRezept, setzeNeuesRezept] = useState(false);

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
        ausfuehren(
          vorgaenge.medikationAbgeglichen({
            patientId,
            planId: plan.lesenachweis ?? '',
            abgeglichenAm: jetztAlsIsoOrtszeit(),
            eintraege: zeilen.map(
              ({
                id,
                bezeichnung,
                atc,
                dosierung,
                grund,
                status,
                verantwortlich,
                fassung,
                geaendertAm,
              }) => ({
                id,
                bezeichnung,
                atc,
                dosierung,
                grund,
                status,
                verantwortlich,
                fassung,
                geaendertAm,
              }),
            ),
          }),
        );
        setzeStand({ plan, zeilen, liste: listenzeilen(liste, zeilen), roh: liste });
        setzeLaedt(false);
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
  const ausSpiegel = fehler !== null && spiegel !== null;
  const angezeigt: (SpiegelEintrag & Partial<Planzeile>)[] = ausSpiegel
    ? [...spiegel.eintraege]
    : (stand?.zeilen ?? []);
  const aktivePlanCodes = angezeigt
    .filter((e) => e.status === 'aktiv')
    .map((e) => e.atc)
    .filter(Boolean);
  const umgebung: AmtsUmgebung = { ...umgebungOhnePlan, bestehendeAtc: aktivePlanCodes };
  const lesenachweis = stand?.plan.lesenachweis ?? null;
  const gesperrt = fehler?.status === 423 || aktenstatus.daten?.medikationGesperrt === true;
  const planSchreibbar = darfVerordnen && !!stand && !ausSpiegel && !gesperrt;

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
        let empId = v.empId;
        if (a.auchInPlan) {
          if (v.listeneintrag) {
            const neu = await empEintragAnlegen(
              kvnr,
              lesenachweis,
              { reference: `Medication/${v.listeneintrag.medicationId}` },
              planeintrag(kvnr, heute, a.dosierung, a.grund),
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
              { resource: empMittel(v.arzneimittel) },
              planeintrag(kvnr, heute, a.dosierung, a.grund),
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
      imPlan: angezeigt.some((e) => e.atc === m.atc && e.status === 'aktiv'),
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

  if (!patient) return null;

  return (
    <>
      <Bestandsband lage="beides" />

      <Abgleichband
        kvnr={kvnr}
        ausSpiegel={ausSpiegel}
        ohneBefugnis={ohneBefugnis || fehler !== null}
        spiegel={spiegel}
        lesenachweis={lesenachweis}
        neuLaden={neuLaden}
      />

      {ohneBefugnis && <BefugnisHinweis patientId={patientId} />}
      {fehler && !ohneBefugnis && (
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
        <Marker ton="gut">{aktivePlanCodes.length} aktiv im Plan</Marker>
        <Marker ton="neutral">{stand?.liste.length ?? 0} in der Liste</Marker>
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
        <button
          type="button"
          className="knopf klein rechts"
          onClick={() => epaFensterOeffnen(patientId, 'medikation')}
        >
          in der ePA
        </button>
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

      <Karte titel="Medikationsplan">
        {laedt && !stand ? (
          <Leer>Wird abgefragt …</Leer>
        ) : angezeigt.length === 0 ? (
          <Leer>{gesperrt ? 'Gesperrt durch Widerspruch.' : 'Kein Eintrag im Plan.'}</Leer>
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
                  <th>
                    <span className="nur-fuer-screenreader">Aktionen</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {angezeigt.map((e) => (
                  <tr key={e.id}>
                    <td>
                      <b>{e.bezeichnung}</b>
                      <div className="leise-klein">
                        ATC {e.atc} · Fassung {e.fassung}
                      </div>
                      {stand && !ausSpiegel && <Spur spur={rezeptspur(stand.roh, e.id)} />}
                    </td>
                    <td>
                      <span className="code">{e.dosierung}</span>
                    </td>
                    <td>{e.grund ?? '—'}</td>
                    <td>
                      <Marker ton={STATUS_TON[e.status]}>{EMP_STATUS_BEZEICHNUNG[e.status]}</Marker>
                    </td>
                    <td
                      className="leise-klein"
                      title={e.angelegtVon ? `angelegt von ${e.angelegtVon}` : undefined}
                    >
                      {e.verantwortlich}
                    </td>
                    <td>
                      <div className="reihe" style={{ gap: 5 }}>
                        {!ausSpiegel && e.eintrag && e.status === 'aktiv' && (
                          <button
                            type="button"
                            className="knopf klein"
                            onClick={() => vorlageAusPlan(e as Planzeile)}
                          >
                            Rezept
                          </button>
                        )}
                        {!ausSpiegel && darfVerordnen && e.eintrag && (
                          <Planhandlungen
                            zeile={e as Planzeile}
                            ausfuehren={(status, text) =>
                              void handlung(statusSetzen(e as Planzeile, status), text)
                            }
                          />
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Karte>

      <Karte titel="Medikationsliste">
        {!stand || stand.liste.length === 0 ? (
          <Leer>
            {gesperrt
              ? 'Gesperrt durch Widerspruch.'
              : 'Keine Verordnungen, Abgaben oder Nachträge.'}
          </Leer>
        ) : (
          <EmlTabelle
            zeilen={stand.liste}
            darfVerordnen={darfVerordnen && !ausSpiegel}
            rezept={vorlageAusListe}
            umgebung={umgebung}
            uebernehmen={(z) =>
              void handlung(async () => {
                const neu = await empEintragAnlegen(
                  kvnr,
                  lesenachweis,
                  { reference: `Medication/${String(z.medikament?.id)}` },
                  planeintrag(kvnr, heute, z.dosierung, null),
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
      </Karte>

      <RezepteKarte
        rezepte={rezepte}
        liste={stand?.roh ?? null}
        gesperrt={gesperrt || !befugt}
        aerztlich={darfVerordnen}
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

      {darfVerordnen && !ausSpiegel && !ohneBefugnis && !gesperrt && (
        <NeuerPlaneintrag
          umgebung={umgebung}
          beiAnlage={(mittel, dosierung, grund) =>
            void handlung(
              () =>
                empEintragAnlegen(
                  kvnr,
                  lesenachweis,
                  {
                    resource: {
                      resourceType: 'Medication',
                      meta: { profile: [`${EMP}emp-medication`] },
                      extension: [{ url: `${EMP}context-extension`, valueCode: 'EMP' }],
                      status: 'active',
                      code: {
                        coding: [
                          {
                            system: ATC,
                            version: mittel.atcVersion,
                            code: mittel.atc,
                            display: mittel.wirkstoff,
                          },
                          { system: PZN, code: mittel.pzn },
                        ],
                        text: mittel.bezeichnung,
                      },
                    },
                  },
                  planeintrag(kvnr, heute, dosierung, grund),
                ),
              'In den Plan aufgenommen.',
            )
          }
        />
      )}
    </>
  );
}

/** Arzneimittel eines neuen Planeintrags nach `EMPMedication`. */
function empMittel(m: Rezept['arzneimittel']): Ressource {
  return {
    resourceType: 'Medication',
    meta: { profile: [`${EMP}emp-medication`] },
    extension: [{ url: `${EMP}context-extension`, valueCode: 'EMP' }],
    status: 'active',
    code: {
      coding: [
        { system: ATC, version: m.atcVersion, code: m.atc },
        ...(m.pzn ? [{ system: PZN, code: m.pzn }] : []),
      ],
      text: m.bezeichnung,
    },
  };
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

/* ---------- Abgleich ---------- */

function Abgleichband({
  kvnr,
  ausSpiegel,
  ohneBefugnis,
  spiegel,
  lesenachweis,
  neuLaden,
}: {
  kvnr: string;
  ausSpiegel: boolean;
  ohneBefugnis: boolean;
  spiegel: { abgeglichenAm: string; planId: string } | null;
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
    <div className={`abgleichband ${ausSpiegel || ohneBefugnis ? 'veraltet' : 'synchron'}`}>
      <span className="abgleichband-punkt" aria-hidden="true" />
      {ausSpiegel && spiegel ? (
        <span>
          <b>Nicht abgeglichen</b> · lokaler Stand vom {deutscherZeitpunkt(spiegel.abgeglichenAm)}
        </span>
      ) : ohneBefugnis ? (
        <span>
          <b>Nicht abgeglichen</b>
        </span>
      ) : spiegel ? (
        <span>
          <b>Abgeglichen</b> · {deutscherZeitpunkt(spiegel.abgeglichenAm)}
        </span>
      ) : (
        <span>Noch nicht abgeglichen</span>
      )}
      <button
        type="button"
        className="knopf klein rechts"
        disabled={ohneBefugnis}
        onClick={() => void pruefen()}
      >
        Stand prüfen
      </button>
      {pruefung && <span className="leise-klein">{pruefung}</span>}
    </div>
  );
}

/* ---------- Handlungen am Plan ---------- */

function Planhandlungen({
  zeile,
  ausfuehren,
}: {
  zeile: Planzeile;
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
  darfVerordnen,
  rezept,
  umgebung,
  uebernehmen,
}: {
  zeilen: Listenzeile[];
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

function NeuerPlaneintrag({
  umgebung,
  beiAnlage,
}: {
  umgebung: AmtsUmgebung;
  beiAnlage: (mittel: ArzneimittelEintrag, dosierung: string, grund: string | null) => void;
}) {
  const [mittel, setzeMittel] = useState<ArzneimittelEintrag | null>(null);
  const [dosierung, setzeDosierung] = useState('1-0-0-0');
  const [grund, setzeGrund] = useState('');
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
          <div className="feldreihe">
            <div className="feldzeile">
              <label htmlFor="dosierung">Dosierung</label>
              <input
                id="dosierung"
                type="text"
                value={dosierung}
                onChange={(e) => setzeDosierung(e.target.value)}
              />
            </div>
            <div className="feldzeile" style={{ flex: '2 1 240px' }}>
              <label htmlFor="grund">Behandlungsgrund</label>
              <input
                id="grund"
                type="text"
                value={grund}
                onChange={(e) => setzeGrund(e.target.value)}
              />
            </div>
          </div>
          <button
            type="button"
            className="knopf stark"
            onClick={() => beiAnlage(mittel, dosierung, grund.trim() === '' ? null : grund.trim())}
          >
            In den Plan aufnehmen
          </button>
        </>
      )}
    </Karte>
  );
}
