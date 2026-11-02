import {
  CODESYSTEM,
  EMP_EXTENSION,
  EMP_STATUS_BEZEICHNUNG,
  type Abgleichlage,
  EMP_KATEGORIEN,
  EMP_KATEGORIE_BEZEICHNUNG,
  automatischeKategorie,
  dosierungNachFhir,
  type EmpKategorie,
  dosierungsanzeige,
  dosierungAusText,
  planGrundNachFhir,
  planeintragNachFhir,
  type Diagnose,
  type Dosierung,
  imGueltigenPlan,
  staendeVergleichen,
  type Standaenderungen,
  type EmpStatus,
  type PraxisplanEintrag,
  type Ressource,
  type SpiegelEintrag,
} from '@demo-pvs/kern';
import { EINRICHTUNG } from '../../epa/klient.js';
import {
  medikationslisteSeit,
  medikationsplanLesen,
  planaenderungenSeit,
  type Medikationsliste,
  type Medikationsplan,
} from '../../epa/dienste/medikation.js';
import { codeVon, textVon } from '../../epa/epa-bestand.js';
import { planzeilen, referenz, type Planzeile } from './planabgleich.js';

const ATC = CODESYSTEM.atc;

/**
 * Stand der Medikation: Plan und Liste aus dem Medication Service, ihre Zeilen, die Gruppen der
 * Anzeige, die Spur eines Rezepts und die Frage „was ist neu seit …“. Ohne Oberfläche.
 */

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

export function planGruppieren(zeilen: readonly Ansichtszeile[], mitKategorie: boolean) {
  const gruppen: { schluessel: string; kopf: string; zeilen: Ansichtszeile[] }[] = [];
  for (const status of STATUS_REIHE) {
    const imStatus = zeilen.filter((z) => (z.lokal ?? z.epa!).status === status);
    if (imStatus.length === 0) continue;
    if (!mitKategorie || (status !== 'aktiv' && status !== 'pausiert')) {
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

export interface Ansichtszeile {
  /** `null`: ohne eMP, kein Abgleich. */
  lage: Abgleichlage | null;
  lokal: PraxisplanEintrag | null;
  epa: Planzeile | null;
}

/** Was die spezifizierte Abfrage „seit dem letzten Aufruf" ergeben hat (ADR 0030). */
export interface SeitAbfrage {
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
export async function seitAbfragen(
  kvnr: string,
  vorher: { zeitpunkt: string; chronologie: string | null },
  zeilen: Planzeile[],
  liste: Listenzeile[],
): Promise<SeitAbfrage> {
  // Chronologie und Liste hängen nicht voneinander ab; der frühere Plan nur von der Chronologie.
  const [chronologie, seit] = await Promise.all([
    planaenderungenSeit(kvnr, vorher.zeitpunkt),
    medikationslisteSeit(kvnr, vorher.zeitpunkt),
  ]);
  const fremd = chronologie.filter((c) => c.telematikId !== EINRICHTUNG.telematikId);
  let plan: Standaenderungen | null = null;
  if (fremd.length > 0 && vorher.chronologie) {
    const frueher = await medikationsplanLesen(kvnr, vorher.chronologie);
    plan = staendeVergleichen(planzeilen(frueher).map(alsStand), zeilen.map(alsStand));
  }
  const neueAussagen = new Set(seit);
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
export interface Listenzeile {
  aussage: Ressource;
  medikament: Ressource | null;
  atc: string;
  art: 'Verordnung' | 'Nachtrag';
  datum: string;
  einrichtung: string;
  dosierung: string;
  /** Der Planeintrag, mit dem der Eintrag verknüpft ist (`basedOn`, ADR 0051). */
  planeintrag: Planzeile | null;
  /** Nicht verknüpft, aber ein gültiger Planeintrag mit demselben Wirkstoff (ATC-Code). */
  wirkstoffImPlan: Planzeile | null;
}

export interface Medikationsstand {
  plan: Medikationsplan;
  zeilen: Planzeile[];
  liste: Listenzeile[];
  /** Die Medikationsliste, wie sie kam — für Rezepte und Abgaben. */
  roh: Medikationsliste;
}

/** Letzte Verschreibung und Abgabe zu einem Planeintrag, aus den verknüpften eML-Einträgen. */
export interface Rezeptspur {
  verordnetAm: string | null;
  abgegebenAm: string | null;
  /** Mehr als ein abgegebenes Arzneimittel zur letzten Verschreibung (IG 1.3.5, MUSS-Hinweis). */
  mehrfach: string[] | null;
}

export function rezeptspur(liste: Medikationsliste, planId: string): Rezeptspur {
  const quelle = (a: Ressource, typ: string) =>
    ((a['derivedFrom'] as { reference?: string }[] | undefined) ?? [])
      .map((d) => String(d.reference ?? '').split('/'))
      .filter(([t]) => t === typ)
      .map(([, id]) => liste.einschluesse.find((r) => r.resourceType === typ && r.id === id))
      .filter((r): r is Ressource => !!r);
  const verknuepft = liste.eintraege.filter((a) =>
    ((a['basedOn'] as { reference?: string }[] | undefined) ?? []).some(
      (b) => b.reference === `MedicationRequest/${planId}`,
    ),
  );
  // Die jüngste Verordnung; zu ihr gehören alle Medikationsinformationen ihrer Abgaben — je
  // abgegebenem Arzneimittel eine (IG 1.4.0-ballot.1, ADD-DISPENSATION-ERP-V1).
  const letzte = verknuepft
    .flatMap((a) => quelle(a, 'MedicationRequest'))
    .sort((x, y) => String(y['authoredOn'] ?? '').localeCompare(String(x['authoredOn'] ?? '')))[0];
  if (!letzte) return { verordnetAm: null, abgegebenAm: null, mehrfach: null };
  const abgaben = verknuepft
    .filter((a) => quelle(a, 'MedicationRequest').some((v) => v.id === letzte.id))
    .flatMap((a) => quelle(a, 'MedicationDispense'));
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
    verordnetAm: String(letzte['authoredOn'] ?? '').slice(0, 10),
    abgegebenAm: abgaben[0] ? String(abgaben[0]['whenHandedOver'] ?? '').slice(0, 10) : null,
    mehrfach: abgaben.length > 1 ? abgaben.map(mittel) : null,
  };
}

export function listenzeilen(liste: Medikationsliste, plan: Planzeile[]): Listenzeile[] {
  const suche = (typ: string, id: string) =>
    liste.einschluesse.find((r) => r.resourceType === typ && r.id === id);
  const planNachId = new Map(plan.map((z) => [z.id, z]));
  return liste.eintraege
    .map((a) => {
      const medikament = suche('Medication', referenz(a)) ?? null;
      const atc = (medikament && codeVon(medikament, 'code', ATC)) ?? '';
      const kontext = (a.extension ?? []).find((e) => e.url === EMP_EXTENSION.kontext)?.valueCode;
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
        ...planbezug(a, atc, plan, planNachId),
      };
    })
    .sort((x, y) => y.datum.localeCompare(x.datum));
}

/**
 * Bezug eines eML-Eintrags zum eMP (ADR 0051): „im Plan“ nur über die Verknüpfung (`basedOn`,
 * gesetzt von `$link-emp` oder `$add-emp-entry`). Derselbe Wirkstoff in einem gültigen
 * Planeintrag ist ein eigener Hinweis — eine andere Stärke ist gerade die Abweichung, die der
 * Abgleich zeigen soll.
 */
function planbezug(
  aussage: Ressource,
  atc: string,
  plan: readonly Planzeile[],
  planNachId: ReadonlyMap<string, Planzeile>,
): Pick<Listenzeile, 'planeintrag' | 'wirkstoffImPlan'> {
  const planeintrag =
    ((aussage['basedOn'] as { reference?: string }[] | undefined) ?? [])
      .map((b) => String(b.reference ?? '').split('/'))
      .filter(([typ]) => typ === 'MedicationRequest')
      .map(([, id]) => planNachId.get(String(id)))
      .find((z) => z !== undefined) ?? null;
  const wirkstoffImPlan =
    planeintrag || !atc ? null : (plan.find((z) => z.atc === atc && imGueltigenPlan(z)) ?? null);
  return { planeintrag, wirkstoffImPlan };
}

/** Die Kennung des eMP-Eintrags (`identifier`), über die `$link-emp` und Rezepte ihn nennen. */
export function empKennung(z: Planzeile): string {
  return String((z.eintrag['identifier'] as { value?: string }[] | undefined)?.[0]?.value ?? z.id);
}

/**
 * Planeintrag und Behandlungsgründe für `$add-emp-entry` — Abbildung im Kern
 * (fhir/medikation.ts). Ohne strukturierte Dosierung gehen die `Dosage`-Elemente der Quelle
 * unverändert in den Eintrag (ADR 0052); ohne beides wird der Text übernommen: ein Viererschema
 * strukturiert, sonst Freitext.
 */
export function planeintrag(
  kvnr: string,
  datum: string,
  angabe: {
    dosierung: string;
    dosis?: Dosierung | null;
    /** `Dosage`-Elemente der Quelle, etwa des eML-Eintrags. */
    dosage?: unknown;
    grund: string | null;
    grundDiagnose?: Diagnose | null;
  },
): [Ressource, Ressource[]] {
  const dosis = angabe.dosis ?? dosierungAusText(angabe.dosierung);
  const uebernommen =
    !angabe.dosis && Array.isArray(angabe.dosage) && angabe.dosage.length > 0
      ? (angabe.dosage as Ressource[])
      : null;
  return [
    planeintragNachFhir({
      kvnr,
      datum,
      dosierung: dosis,
      dosageUebernommen: uebernommen,
      grund: angabe.grund,
      grundDiagnose: angabe.grundDiagnose ?? null,
    }),
    angabe.grundDiagnose ? [planGrundNachFhir(angabe.grundDiagnose, kvnr)] : [],
  ];
}
