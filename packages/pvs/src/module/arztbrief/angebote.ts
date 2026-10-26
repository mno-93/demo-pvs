import { useMemo } from 'react';
import {
  allergiezeile,
  deutschesDatum,
  diagnosezeile,
  impfzeile,
  istGegenwaertig,
  laborbefundeAusDokumenten,
  laborbefundLesen,
  mittelzeile,
  type Allergie,
  type Briefmittel,
  type Diagnose,
  type GelesenerBefund,
  type Impfung,
} from '@demo-pvs/kern';
import { useAuswahl, useZustand } from '../../speicher/speicher.js';
import {
  dokumentAbrufen,
  dokumenteSuchen,
  medikationslisteLesen,
  medikationsplanLesen,
} from '../../epa/klient.js';
import {
  codeVon,
  dokumentverweisLesen,
  fehlerTitel,
  istStrukturiert,
  textVon,
  useBetriebsstand,
  useEpaAbfrage,
  type Ladezustand,
} from '../../epa/epa-bestand.js';
import { istGueltig, useBefugnis, useEinlesungen } from '../../epa/befugnis.js';
import type { Listenlage } from '../../epa/listen.js';
import { impflisteLaden } from '../../epa/impfliste.js';

/**
 * Was für einen Arztbrief zur Wahl steht: alle strukturierten Angaben zur Person — aus dem
 * Praxissystem und aus der ePA, je Abschnitt und Quelle.
 *
 * | Abschnitt   | Praxis                         | ePA                                          |
 * | ----------- | ------------------------------ | -------------------------------------------- |
 * | Anamnese    | Karteikarte (A)                | —                                            |
 * | Diagnosen   | Diagnosen                      | ✦ Diagnosenliste                             |
 * | Allergien   | Allergien                      | ✦ Allergienliste                             |
 * | Befunde     | Karteikarte (B), Laborbefunde  | Laborbefunde (dgLP)                          |
 * | Medikation  | Spiegel des Plans, wenn die ePA nicht antwortet | Medikationsplan, Medikationsliste |
 * | Impfungen   | Impfungen                      | ✦ Impfliste                                  |
 *
 * Doppeltes erscheint einmal: Ein ePA-Eintrag, mit dem ein Eintrag der Praxis verknüpft ist oder
 * der denselben Code trägt, steht nur bei der Praxis.
 *
 * **Vorauswahl:** gegenwärtige Diagnosen der Praxis, aktive Allergien der Praxis, Notizen der
 * letzten 90 Tage, der jüngste Laborbefund, die aktiven Einträge des Medikationsplans — und alles,
 * was seit Beginn des Entwurfs neu angelegt wurde. Was nur in der ePA steht, ist angeboten,
 * nicht vorausgewählt: Die Praxis übernimmt es bewusst.
 */

export type Abschnitt =
  'anamnese' | 'diagnosen' | 'allergien' | 'befunde' | 'medikation' | 'impfungen';

export interface Angebot {
  id: string;
  abschnitt: Abschnitt;
  /** Die Zeile, wie sie im Brief steht. */
  text: string;
  /** Quelle, als Gruppe im Menü und als Marker am gewählten Eintrag. */
  quelle: string;
  bestand: 'praxis' | 'epa';
  marken: string[];
  vorgabe: boolean;
  diagnose?: Diagnose;
  allergie?: Allergie;
  mittel?: Briefmittel;
  impfung?: Impfung;
}

/** Eine Quelle eines Abschnitts — mit Zustand, wenn sie gerade nichts liefern kann. */
export interface Quelle {
  name: string;
  bestand: 'praxis' | 'epa';
  zustand: string | null;
}

export interface Abschnittsangebot {
  angebote: Angebot[];
  quellen: Quelle[];
}

const ATC = 'http://fhir.de/CodeSystem/bfarm/atc';

function zustandAus<T>(befugt: boolean, abfrage: Ladezustand<T>): string | null {
  if (!befugt) return 'Keine Befugnis für die ePA dieser Person.';
  if (abfrage.fehler) return fehlerTitel(abfrage.fehler);
  if (abfrage.laedt || !abfrage.daten) return 'wird gelesen …';
  return null;
}

function listenzustand(lage: Listenlage): string | null {
  switch (lage.art) {
    case 'ohne-befugnis':
      return 'Keine Befugnis für die ePA dieser Person.';
    case 'laedt':
      return 'wird gelesen …';
    case 'fehler':
      return fehlerTitel(lage);
    case 'nicht-angeboten':
      return 'Im Ausbaustand nicht angeboten.';
    default:
      return null;
  }
}

function befundzeile(b: GelesenerBefund): string {
  const auffaellig = b.werte.filter((w) => w.bewertung !== 'normal');
  const werte = (auffaellig.length > 0 ? auffaellig : b.werte)
    .map(
      (w) =>
        `${w.bezeichnung} ${w.wert} ${w.einheit}${w.bewertung !== 'normal' ? ` (${w.bewertung})` : ''}`,
    )
    .join(', ');
  return `Labor ${deutschesDatum(b.kopf.entnahme.slice(0, 10))} (${b.kopf.labor}): ${werte}`;
}

export function useBriefangebote(
  patientId: string,
  beginn: string,
  /** Lage der ✦ Listen — vom Aufrufer abgefragt, damit das Pop-up an der Quelle sie teilt. */
  listenlage: Listenlage,
): Record<Abschnitt, Abschnittsangebot> {
  const patient = useAuswahl((z) => z.patienten.find((p) => p.id === patientId), [patientId]);
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
  const impfungen = useAuswahl(
    (z) => z.impfungen.filter((i) => i.patientId === patientId),
    [patientId],
  );
  const spiegel = useAuswahl(
    (z) => z.medikationsspiegel.find((m) => m.patientId === patientId) ?? null,
    [patientId],
  );
  const kvnr = patient?.versicherung.kvnr ?? '';
  const befugt = istGueltig(useBefugnis(patientId));
  const einlesungen = useEinlesungen();
  const betriebsstand = useBetriebsstand();
  const aktiv = !!kvnr && befugt;
  const abh = [kvnr, betriebsstand, einlesungen];

  const impfliste = useEpaAbfrage(() => impflisteLaden(kvnr, patientId), abh, aktiv);
  const medikation = useEpaAbfrage(
    () => Promise.all([medikationsplanLesen(kvnr), medikationslisteLesen(kvnr)]),
    abh,
    aktiv,
  );
  // Strukturierte Laborbefunde aus der ePA (dgLP) — derselbe Weg wie im ePA-Fenster.
  const epaLabor = useEpaAbfrage(
    async () => {
      const verweise = (await dokumenteSuchen(kvnr))
        .map(dokumentverweisLesen)
        .filter((v) => v.typ?.code === 'BEFU' && istStrukturiert(v));
      const befunde: GelesenerBefund[] = [];
      for (const v of verweise) {
        const inhalt = await dokumentAbrufen(kvnr, v.ressource);
        const b = laborbefundLesen(inhalt, patientId, { bestand: 'epa', dokumentId: v.id });
        if (b) befunde.push(b);
      }
      return befunde;
    },
    abh,
    aktiv,
  );

  return useMemo(() => {
    const neu = (zeitpunkt: string | undefined) => !!zeitpunkt && zeitpunkt >= beginn;
    const grenze = new Date(`${heute}T00:00:00`);
    grenze.setDate(grenze.getDate() - 90);
    const listen = listenlage.art === 'bereit' ? listenlage.listen : null;

    /* Anamnese und Befunde aus der Karteikarte */
    const notizen = (kuerzel: 'A' | 'B', abschnitt: Abschnitt): Angebot[] =>
      karteikarte
        .filter((k) => k.kuerzel === kuerzel)
        .sort((a, b) => b.zeitpunkt.localeCompare(a.zeitpunkt))
        .map((k) => ({
          id: `kk:${k.id}`,
          abschnitt,
          text: `${deutschesDatum(k.zeitpunkt.slice(0, 10))}: ${k.text}`,
          quelle: 'Karteikarte',
          bestand: 'praxis',
          marken: neu(k.zeitpunkt) ? ['neu'] : [],
          vorgabe: neu(k.zeitpunkt) || new Date(k.zeitpunkt) >= grenze,
        }));

    /* Diagnosen */
    const verknuepfteDiagnosen = new Set(diagnosen.map((d) => d.epaId).filter(Boolean));
    const praxiscodes = new Set(diagnosen.map((d) => d.code));
    const diagnosenAngebote: Angebot[] = [
      ...diagnosen.map((d): Angebot => ({
        id: `dx:${d.id}`,
        abschnitt: 'diagnosen',
        text: diagnosezeile(d),
        quelle: 'Praxis · Diagnosen',
        bestand: 'praxis',
        marken: [
          istGegenwaertig(d.klinischerStatus)
            ? d.art === 'dauer'
              ? 'Dauerdiagnose'
              : 'akut'
            : 'behoben',
          ...(d.epaId ? ['auch in der ePA'] : []),
          ...(neu(d.herkunft.zeitpunkt) ? ['neu'] : []),
        ],
        vorgabe: istGegenwaertig(d.klinischerStatus) || neu(d.herkunft.zeitpunkt),
        diagnose: d,
      })),
      ...(listen?.diagnosen ?? [])
        .filter(
          (e) =>
            !verknuepfteDiagnosen.has(String(e.ressource.id)) && !praxiscodes.has(e.eintrag.code),
        )
        .map((e): Angebot => ({
          id: `dx-epa:${String(e.ressource.id)}`,
          abschnitt: 'diagnosen',
          text: diagnosezeile(e.eintrag),
          quelle: 'ePA · Diagnosenliste ✦',
          bestand: 'epa',
          marken: [istGegenwaertig(e.eintrag.klinischerStatus) ? e.chronik.angelegtVon : 'behoben'],
          vorgabe: false,
          diagnose: e.eintrag,
        })),
    ];

    /* Allergien */
    const verknuepfteAllergien = new Set(allergien.map((a) => a.epaId).filter(Boolean));
    const praxissubstanzen = new Set(allergien.map((a) => a.snomed?.code ?? a.substanz));
    const allergienAngebote: Angebot[] = [
      ...allergien.map((a): Angebot => ({
        id: `al:${a.id}`,
        abschnitt: 'allergien',
        text: allergiezeile(a),
        quelle: 'Praxis · Allergien',
        bestand: 'praxis',
        marken: [
          a.klinischerStatus,
          ...(a.epaId ? ['auch in der ePA'] : []),
          ...(neu(a.herkunft.zeitpunkt) ? ['neu'] : []),
        ],
        vorgabe: a.klinischerStatus === 'aktiv' || neu(a.herkunft.zeitpunkt),
        allergie: a,
      })),
      ...(listen?.allergien ?? [])
        .filter(
          (e) =>
            !verknuepfteAllergien.has(String(e.ressource.id)) &&
            !praxissubstanzen.has(e.eintrag.snomed?.code ?? e.eintrag.substanz),
        )
        .map((e): Angebot => ({
          id: `al-epa:${String(e.ressource.id)}`,
          abschnitt: 'allergien',
          text: allergiezeile(e.eintrag),
          quelle: 'ePA · Allergienliste ✦',
          bestand: 'epa',
          marken: [e.chronik.angelegtVon],
          vorgabe: false,
          allergie: e.eintrag,
        })),
    ];

    /* Befunde: Notizen und Laborbefunde */
    const lokaleBefunde = laborbefundeAusDokumenten(dokumente);
    const bekannt = new Set(lokaleBefunde.map((b) => b.kopf.uuid));
    const epaBefunde = (epaLabor.daten ?? []).filter((b) => !bekannt.has(b.kopf.uuid));
    const juengster = [...lokaleBefunde, ...epaBefunde].sort((a, b) =>
      b.kopf.entnahme.localeCompare(a.kopf.entnahme),
    )[0]?.kopf.uuid;
    const labor = (b: GelesenerBefund, bestand: 'praxis' | 'epa'): Angebot => ({
      id: `lab:${b.kopf.uuid}`,
      abschnitt: 'befunde',
      text: befundzeile(b),
      quelle: bestand === 'praxis' ? 'Praxis · Laborbefunde' : 'ePA · Laborbefunde',
      bestand,
      marken: [b.kopf.labor],
      vorgabe: b.kopf.uuid === juengster,
    });

    /* Medikation */
    const [plan, liste] = medikation.daten ?? [null, null];
    const planMittel: Angebot[] = (plan?.eintraege ?? [])
      .filter((e) => e['status'] === 'active')
      .map((e) => {
        const verweis =
          (e['medicationReference'] as { reference?: string } | undefined)?.reference ?? '';
        const m = plan!.ressourcen.find(
          (r) => r.resourceType === 'Medication' && `Medication/${String(r.id)}` === verweis,
        );
        const mittel: Briefmittel = {
          bezeichnung: m ? textVon(m) : '(ohne Bezeichnung)',
          atc: m ? codeVon(m, 'code', ATC) : null,
          dosierung: (e['dosageInstruction'] as { text?: string }[] | undefined)?.[0]?.text ?? '—',
          grund: (e['reasonCode'] as { text?: string }[] | undefined)?.[0]?.text ?? null,
        };
        return {
          id: `emp:${String(e.id)}`,
          abschnitt: 'medikation',
          text: mittelzeile(mittel),
          quelle: 'ePA · Medikationsplan',
          bestand: 'epa',
          marken: [],
          vorgabe: true,
          mittel,
        };
      });
    const imPlan = new Set(planMittel.map((p) => p.mittel?.atc).filter(Boolean));
    const listenMittel: Angebot[] = (liste?.eintraege ?? [])
      .filter((a) => !Array.isArray(a['basedOn']))
      .map((a): Angebot | null => {
        const verweis =
          (a['medicationReference'] as { reference?: string } | undefined)?.reference ?? '';
        const m = liste!.einschluesse.find(
          (r) => r.resourceType === 'Medication' && `Medication/${String(r.id)}` === verweis,
        );
        const atc = m ? codeVon(m, 'code', ATC) : null;
        if (atc && imPlan.has(atc)) return null;
        const datum = String(
          (a['effectivePeriod'] as { start?: string } | undefined)?.start ??
            a['dateAsserted'] ??
            '',
        );
        const mittel: Briefmittel = {
          bezeichnung: m ? textVon(m) : textVon(a),
          atc,
          dosierung: (a['dosage'] as { text?: string }[] | undefined)?.[0]?.text ?? '—',
          grund: null,
        };
        return {
          id: `eml:${String(a.id)}`,
          abschnitt: 'medikation',
          text: mittelzeile(mittel),
          quelle: 'ePA · Medikationsliste',
          bestand: 'epa',
          marken: datum ? [`seit ${deutschesDatum(datum.slice(0, 10))}`] : [],
          vorgabe: false,
          mittel,
        };
      })
      .filter((x): x is Angebot => x !== null);
    // Antwortet die ePA nicht, bleibt der lokale Spiegel des Plans — mit seinem Stand.
    const spiegelMittel: Angebot[] =
      !medikation.daten && spiegel
        ? spiegel.eintraege
            .filter((e) => e.status === 'aktiv')
            .map((e) => {
              const mittel: Briefmittel = {
                bezeichnung: e.bezeichnung,
                atc: e.atc || null,
                dosierung: e.dosierung,
                grund: e.grund,
              };
              return {
                id: `sp:${e.id}`,
                abschnitt: 'medikation' as const,
                text: mittelzeile(mittel),
                quelle: `Praxis · Spiegel des Medikationsplans, Stand ${deutschesDatum(spiegel.abgeglichenAm.slice(0, 10))}`,
                bestand: 'praxis' as const,
                marken: [],
                vorgabe: true,
                mittel,
              };
            })
        : [];

    /* Impfungen */
    const verknuepfteImpfungen = new Set(impfungen.map((i) => i.epaId).filter(Boolean));
    const impfAngebote: Angebot[] = [
      ...impfungen
        .filter((i) => i.status === 'erfolgt')
        .map((i): Angebot => ({
          id: `im:${i.id}`,
          abschnitt: 'impfungen',
          text: impfzeile(i),
          quelle: 'Praxis · Impfungen',
          bestand: 'praxis',
          marken: [
            ...(i.epaId ? ['auch in der ePA'] : []),
            ...(neu(i.herkunft.zeitpunkt) ? ['neu'] : []),
          ],
          vorgabe: neu(i.herkunft.zeitpunkt),
          impfung: i,
        })),
      ...(impfliste.daten?.eintraege ?? [])
        .filter((e) => !verknuepfteImpfungen.has(String(e.ressource.id)))
        .map((e): Angebot => ({
          id: `im-epa:${String(e.ressource.id)}`,
          abschnitt: 'impfungen',
          text: impfzeile(e.impfung),
          quelle: 'ePA · Impfliste ✦',
          bestand: 'epa',
          marken: [],
          vorgabe: false,
          impfung: e.impfung,
        })),
    ].sort((a, b) => (b.impfung?.datum ?? '').localeCompare(a.impfung?.datum ?? ''));

    const listenZustand = listenzustand(listenlage);
    const impfZustand =
      impfliste.daten && !impfliste.daten.verfuegbar
        ? 'Im Ausbaustand nicht angeboten.'
        : zustandAus(befugt, impfliste);
    const medZustand = zustandAus(befugt, medikation);
    return {
      anamnese: {
        angebote: notizen('A', 'anamnese'),
        quellen: [{ name: 'Karteikarte', bestand: 'praxis', zustand: null }],
      },
      diagnosen: {
        angebote: diagnosenAngebote,
        quellen: [
          { name: 'Praxis · Diagnosen', bestand: 'praxis', zustand: null },
          { name: 'ePA · Diagnosenliste ✦', bestand: 'epa', zustand: listenZustand },
        ],
      },
      allergien: {
        angebote: allergienAngebote,
        quellen: [
          { name: 'Praxis · Allergien', bestand: 'praxis', zustand: null },
          { name: 'ePA · Allergienliste ✦', bestand: 'epa', zustand: listenZustand },
        ],
      },
      befunde: {
        angebote: [
          ...notizen('B', 'befunde'),
          ...lokaleBefunde.map((b) => labor(b, 'praxis')),
          ...epaBefunde.map((b) => labor(b, 'epa')),
        ],
        quellen: [
          { name: 'Karteikarte', bestand: 'praxis', zustand: null },
          { name: 'Praxis · Laborbefunde', bestand: 'praxis', zustand: null },
          { name: 'ePA · Laborbefunde', bestand: 'epa', zustand: zustandAus(befugt, epaLabor) },
        ],
      },
      medikation: {
        angebote: [...planMittel, ...listenMittel, ...spiegelMittel],
        quellen: [
          ...(spiegelMittel.length > 0
            ? [{ name: spiegelMittel[0]!.quelle, bestand: 'praxis' as const, zustand: null }]
            : []),
          { name: 'ePA · Medikationsplan', bestand: 'epa', zustand: medZustand },
          { name: 'ePA · Medikationsliste', bestand: 'epa', zustand: medZustand },
        ],
      },
      impfungen: {
        angebote: impfAngebote,
        quellen: [
          { name: 'Praxis · Impfungen', bestand: 'praxis', zustand: null },
          { name: 'ePA · Impfliste ✦', bestand: 'epa', zustand: impfZustand },
        ],
      },
    };
  }, [
    beginn,
    heute,
    karteikarte,
    diagnosen,
    allergien,
    dokumente,
    impfungen,
    spiegel,
    listenlage,
    impfliste.daten,
    impfliste.fehler,
    impfliste.laedt,
    medikation.daten,
    medikation.fehler,
    medikation.laedt,
    epaLabor.daten,
    epaLabor.fehler,
    epaLabor.laedt,
    befugt,
  ]);
}
