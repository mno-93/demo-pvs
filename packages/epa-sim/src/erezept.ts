import type { SimAntwort, SimAnwendung } from './schnittstelle.ts';
import { base64ZuText, zufallHex } from './plattform.ts';
import {
  CODESYSTEM,
  TEXT_EXTENSION,
  dosierungAusFhir,
  dosierungAusText,
  dosierungNachFhir,
  textErweiterungen,
  type Ressource,
  neueId,
  WEG,
} from '@demo-pvs/kern';
import { bestandFuer, bestandVorhanden } from './bestand.ts';
import { betriebslage } from './betrieb.ts';
import { chronologieAnlegen } from './chronologie.ts';
import { jetzt, operationOutcome, parameterLesen } from './fhir-hilfen.ts';
import {
  EMP,
  EMP_IDENTIFIER,
  EXT,
  PROFIL,
  empKennung,
  empVerweis,
  empZuruecksetzen,
  istEmpEintrag,
  mittelLoeschenWennFrei,
  verknuepfen,
  verknuepfterEintrag,
} from './medikation.ts';
import {
  MEDIKATIONSDIENST,
  aktivitaetAnlegen,
  fortschreiben,
  loeschen,
  subjektFuer,
  versionierterVerweis,
  type Handelnde,
} from './schreibwege.ts';

/**
 * E-Rezept-Fachdienst — ⚠ Demo-Ersatz, und die Zulieferung in den Medication Service.
 *
 * **Fachdienst** nach gematik `api-erp`: Das Primärsystem holt mit `Task/$create` eine
 * Rezept-ID und einen AccessCode, bildet den Verordnungsdatensatz nach den KBV-Profilen
 * (`kbv.ita.erp` 1.4), signiert ihn qualifiziert und aktiviert das Rezept mit
 * `Task/{id}/$activate`. Vor der Einlösung löscht es das Rezept mit `Task/{id}/$abort`.
 * ⚠ Demo-Ersatz: keine VAU, keine QES — der Datensatz kommt unsigniert, Base64-kodiert, im
 * Parameter `ePrescription`; eigener Pfadpräfix `/erp`.
 *
 * **Zulieferung** nach IG `de.gematik.epa.medication` 1.4.0-ballot.1, Aktivitätsdiagramme der
 * E-Rezept-Operationen (ADR 0055): Der Fachdienst reiht Verschreibung, Abgabe und Stornierungen
 * in eine Warteschlange ein und überträgt sie **asynchron** (`$provide-prescription-erp`,
 * `$provide-dispensation-erp`, `$cancel-prescription-erp`, `$cancel-dispensation-erp`). Trägt die
 * Verschreibung den eMP-Identifier eines Planeintrags (`MedicationRequest.basedOn.identifier`),
 * verknüpft der Medication Service die Medikationsinformation mit ihm, ohne den Plan zu ändern;
 * erst die Abgabe schreibt den Planeintrag fort — mit dem abgegebenen Arzneimittel, bei Austausch
 * mit geänderter Dosierung. Werden zu einem Rezept mehrere Arzneimittel abgegeben, entsteht je
 * eines eine Medikationsinformation, und der Plan übernimmt keines. Urheber dieser Änderungen ist
 * der Dienst (MEDICATIONSVC).
 *
 * Die Abgabe selbst löst die Demo-Steuerung aus („Apotheke gibt ab").
 */

export const ERP_BASIS = WEG.erp;

const NS = 'https://gematik.de/fhir/erp/NamingSystem/';
const PRESCRIPTION_ID = `${NS}GEM_ERP_NS_PrescriptionId`;
const ACCESS_CODE = `${NS}GEM_ERP_NS_AccessCode`;
const FLOWTYPE = 'https://gematik.de/fhir/erp/CodeSystem/GEM_ERP_CS_FlowType';
const RX_PROZESS = 'https://gematik.de/fhir/epa-medication/sid/rx-prescription-process-identifier';
const RX_EXTENSION =
  'https://gematik.de/fhir/epa-medication/StructureDefinition/rx-prescription-process-identifier-extension';
const VERARBEITUNGSEREIGNIS =
  'https://gematik.de/fhir/epa-medication/StructureDefinition/epa-medicationstatement-processing-event-extension';
const KVID = 'http://fhir.de/sid/gkv/kvid-10';
const ATC = CODESYSTEM.atc;
const PZN = CODESYSTEM.pzn;

const FLOWTYPEN: Record<string, string> = {
  '160': 'Muster 16 (Apothekenpflichtige Arzneimittel)',
  '200': 'PKV (Apothekenpflichtige Arzneimittel)',
};

export const APOTHEKE: Handelnde = {
  telematikId: '3-DEMO-APOTHEKE-STADTGARTEN',
  anzeige: 'Stadtgarten-Apotheke',
};

/** Was die Demo über ein Rezept im Fachdienst führt. */
interface Rezept {
  task: Ressource;
  accessCode: string;
  kvnr: string | null;
  /** Verordnender, aus Sitzung und Datensatz. */
  verordner: Handelnde | null;
  arzt: string;
  medication: Ressource | null;
  verordnung: Ressource | null;
  authoredOn: string;
  empId: string | null;
  /** Die Medikationsinformation der Verschreibung in der eML — Grundlage der Abgabe. */
  aussageId?: string;
  /** Stand der Zulieferung in die ePA. */
  epa: 'ausstehend' | 'übertragen' | 'keine Akte' | 'Widerspruch' | 'storniert';
  abgabe: 'keine' | 'abgegeben';
}

const rezepte = new Map<string, Rezept>();
const zeitgeber = new Set<ReturnType<typeof setTimeout>>();
let laufnummer = 0;

/** Leert Fachdienst und Warteschlange — beim Zurücksetzen des Simulators. */
export function erezepteLeeren(): void {
  rezepte.clear();
  zeitgeber.forEach((z) => clearTimeout(z));
  zeitgeber.clear();
  laufnummer = 0;
}

/** Rezept-ID nach `api-erp`: Flowtype, zwölfstellige Nummer, Prüfziffer ISO 7064 Mod 97-10. */
function rezeptId(flowtype: string): string {
  laufnummer += 1;
  const ziffern = `${flowtype}${String(laufnummer).padStart(12, '0')}`;
  const pruef = 98 - Number((BigInt(ziffern) * 100n) % 97n);
  const alle = `${ziffern}${String(pruef).padStart(2, '0')}`;
  return alle.match(/.{1,3}/g)!.join('.');
}

function kennung(r: Ressource, system: string): string | undefined {
  return (r['identifier'] as { system?: string; value?: string }[] | undefined)?.find(
    (i) => i.system === system,
  )?.value;
}

/* ---------- Zulieferung in den Medication Service ---------- */

function ablage(kvnr: string): Ressource[] {
  return bestandFuer(kvnr).medikation;
}

function prozesskennung(r: Rezept): string {
  return `${String(r.task.id)}_${r.authoredOn}`;
}

/**
 * Die Prozesskennung (RxPrescriptionProcessIdentifier) trägt die Verordnung als `identifier`,
 * Arzneimittel, Abgabe und Medikationsinformation als Extension (`de.gematik.epa` 1.4.0-ballot.1,
 * Profile EPAMedicationRequest, EPAMedication, EPAMedicationDispense, EPAMedicationStatement).
 */
const prozessExtension = (prozess: string) => ({
  url: RX_EXTENSION,
  valueIdentifier: { system: RX_PROZESS, value: prozess },
});

function prozessVon(r: Ressource): string | undefined {
  if (r.resourceType === 'MedicationRequest') return kennung(r, RX_PROZESS);
  return ((r.extension ?? []) as { url: string; valueIdentifier?: { value?: string } }[]).find(
    (e) => e.url === RX_EXTENSION,
  )?.valueIdentifier?.value;
}

function mitProzess(kvnr: string, typ: string, prozess: string): Ressource[] {
  return ablage(kvnr).filter((x) => x.resourceType === typ && prozessVon(x) === prozess);
}

function referenzId(verweis: unknown): string {
  return (
    String((verweis as { reference?: string } | undefined)?.reference ?? '').split('/')[1] ?? ''
  );
}

function planeintragZu(kvnr: string, aussage: Ressource): Ressource | undefined {
  const id = verknuepfterEintrag(aussage);
  return id ? ablage(kvnr).find((r) => istEmpEintrag(r) && r.id === id) : undefined;
}

/**
 * `$provide-prescription-erp` (IG-MED-BL-PROVIDE-PRESCRIPTION-ERP-V3): Verschreibung,
 * Arzneimittel und Medikationsinformation anlegen. Trägt die Verschreibung den Identifier eines
 * eMP-Eintrags, wird die Medikationsinformation mit ihm verknüpft (`basedOn` mit `isEMP`) — ohne
 * den eMP selbst zu ändern; den Aktivitätsnachweis bekommt der Eintrag erst mit der Abgabe. Gibt
 * es den Eintrag nicht, vermerkt die Medikationsinformation das Verarbeitungsereignis
 * `LINKING_NOT_SUCCESSFUL`. Urheber der Änderungen ist der Dienst (MEDICATIONSVC).
 */
function verschreibungEinstellen(r: Rezept): void {
  const kvnr = r.kvnr!;
  const liste = ablage(kvnr);
  const zeit = jetzt();
  const prozess = prozesskennung(r);
  const medication: Ressource = {
    ...r.medication!,
    id: neueId('med'),
    meta: { versionId: '1', lastUpdated: zeit, profile: [PROFIL.medication] },
    extension: [prozessExtension(prozess)],
    status: 'inactive',
  };
  const dosierung = r.verordnung!['dosageInstruction'];
  const verordnung: Ressource = {
    resourceType: 'MedicationRequest',
    id: neueId('vo'),
    meta: { versionId: '1', lastUpdated: zeit, profile: [PROFIL.verordnung] },
    identifier: [{ system: RX_PROZESS, value: prozess }],
    status: 'active',
    intent: 'filler-order',
    medicationReference: { reference: `Medication/${String(medication.id)}` },
    subject: subjektFuer(kvnr),
    authoredOn: r.authoredOn,
    requester: { display: `${r.arzt}, ${r.verordner!.anzeige}` },
    ...(r.verordnung!['dispenseRequest']
      ? { dispenseRequest: r.verordnung!['dispenseRequest'] }
      : {}),
    ...(r.empId ? { basedOn: [{ identifier: { system: EMP_IDENTIFIER, value: r.empId } }] } : {}),
  };
  const aussage: Ressource = {
    resourceType: 'MedicationStatement',
    id: neueId('ms'),
    meta: { versionId: '1', lastUpdated: zeit, profile: [PROFIL.aussage] },
    extension: [{ url: EXT.kontext, valueCode: 'PRESCRIPTION' }, prozessExtension(prozess)],
    status: 'intended',
    medicationReference: { reference: `Medication/${String(medication.id)}` },
    subject: subjektFuer(kvnr),
    effectivePeriod: { start: r.authoredOn },
    dateAsserted: zeit,
    derivedFrom: [{ reference: `MedicationRequest/${String(verordnung.id)}` }],
  };
  // Die Dosierung wird samt Text in die Medikationsinformation kopiert.
  if (Array.isArray(dosierung) && dosierung.length > 0) {
    mitDosierung(verordnung, 'dosageInstruction', dosierung as Record<string, unknown>[]);
    mitDosierung(aussage, 'dosage', dosierung as Record<string, unknown>[]);
  }
  // Verknüpfung mit dem Planeintrag über den eMP-Identifier (Kontext EMP, gleich welcher Status).
  if (r.empId) {
    const plan = liste.find((x) => istEmpEintrag(x) && empKennung(x) === r.empId);
    if (plan) aussage['basedOn'] = [empVerweis(String(plan.id))];
    else
      aussage.extension = [
        ...(aussage.extension ?? []),
        {
          url: VERARBEITUNGSEREIGNIS,
          extension: [
            { url: 'event', valueCode: 'LINKING_NOT_SUCCESSFUL' },
            { url: 'dateTime', valueDateTime: zeit },
          ],
        },
      ];
  }
  liste.push(medication, verordnung, aussage);
  r.aussageId = String(aussage.id);
  aktivitaetAnlegen(
    liste,
    [
      versionierterVerweis(medication),
      versionierterVerweis(verordnung),
      versionierterVerweis(aussage),
    ],
    MEDIKATIONSDIENST,
    'CREATE',
    zeit,
  );
}

/**
 * `$cancel-prescription-erp` (IG-MED-BL-CANCEL-PRESCRIPTION-ERP-V4): Medikationsinformationen,
 * Abgaben und Verschreibung der Prozesskennung werden gelöscht (bleiben über die Historie
 * abrufbar), ebenso Arzneimittel, die niemand mehr braucht. Ein verknüpfter eMP-Eintrag wird auf
 * seine Fassung vor der Übernahme zurückgesetzt.
 */
function verschreibungStornieren(r: Rezept): void {
  const kvnr = r.kvnr!;
  const liste = ablage(kvnr);
  const zeit = jetzt();
  const prozess = prozesskennung(r);
  const aussagen = mitProzess(kvnr, 'MedicationStatement', prozess);
  const geloescht = [
    ...aussagen,
    ...mitProzess(kvnr, 'MedicationDispense', prozess),
    ...mitProzess(kvnr, 'MedicationRequest', prozess),
  ];
  const mittel = [
    ...new Set(
      geloescht
        .map((x) => referenzId(x['medicationReference']))
        .concat(mitProzess(kvnr, 'Medication', prozess).map((m) => String(m.id))),
    ),
  ];
  let planGeaendert = false;
  for (const a of aussagen) {
    const plan = planeintragZu(kvnr, a);
    if (!plan) continue;
    if (empZuruecksetzen(kvnr, plan, a, zeit).eintragGeaendert) {
      fortschreiben(plan, zeit);
      aktivitaetAnlegen(liste, [versionierterVerweis(plan)], MEDIKATIONSDIENST, 'UPDATE', zeit);
      planGeaendert = true;
    }
  }
  if (geloescht.length === 0) return;
  aktivitaetAnlegen(liste, geloescht.map(versionierterVerweis), MEDIKATIONSDIENST, 'DELETE', zeit);
  for (const x of geloescht) loeschen(liste, x);
  for (const id of mittel) mittelLoeschenWennFrei(kvnr, id);
  if (planGeaendert) chronologieAnlegen(liste, EMP, MEDIKATIONSDIENST, zeit);
}

export type Abgabeart = 'wie-verordnet' | 'austausch' | 'mehrfach';

/** Halbiert eine Stärke im Namen und verdoppelt das Viererschema — für den Austausch. */
/** Viererschema einer strukturierten Dosierung als „1-0-1-0", sonst leer. */
function viererschema(dosierungen: unknown): string {
  const d = dosierungAusFhir(dosierungen);
  return d?.schema.art === 'tageszeiten'
    ? d.schema.mengen.map((m) => String(m).replace('.', ',')).join('-')
    : '';
}

/** Dosierung samt Text für eine Ressource des Dienstes (1.4.0-ballot.1). */
function mitDosierung(
  r: Ressource,
  feld: 'dosageInstruction' | 'dosage',
  dosierungen: Record<string, unknown>[],
) {
  const typ = r.resourceType as 'MedicationRequest' | 'MedicationStatement' | 'MedicationDispense';
  r[feld] = dosierungen;
  r.extension = [
    ...((r.extension ?? []) as { url: string }[]).filter(
      (e) => e.url !== TEXT_EXTENSION.gerendert(typ) && e.url !== TEXT_EXTENSION.generiert,
    ),
    ...textErweiterungen(typ, dosierungen),
  ];
}

function austauschen(text: string, dosierung: string): { text: string; dosierung: string | null } {
  const staerke = /(\d+(?:,\d+)?)\s*mg/.exec(text);
  const schema = /^(\d+(?:,\d+)?)-(\d+(?:,\d+)?)-(\d+(?:,\d+)?)-(\d+(?:,\d+)?)$/.exec(
    dosierung.trim(),
  );
  if (!staerke || !schema) return { text: `${text} (anderer Hersteller)`, dosierung: null };
  const zahl = (s: string) => Number(s.replace(',', '.'));
  const deutsch = (n: number) => String(n).replace('.', ',');
  const halb = deutsch(zahl(staerke[1]!) / 2);
  return {
    text: `${text.replace(staerke[0], `${halb} mg`)} (Rabattvertrag, anderer Hersteller)`,
    dosierung: schema
      .slice(1)
      .map((d) => deutsch(zahl(d) * 2))
      .join('-'),
  };
}

/**
 * `$provide-dispensation-erp` (IG-MED-BL-PROVIDE-DISPENSATION-ERP-V4, Teil
 * ADD-DISPENSATION-ERP-V1): je abgegebenem Arzneimittel eine Abgabe und eine
 * Medikationsinformation — die erste ist die der Verschreibung, weitere entstehen neu. Die
 * Medikationsinformation nennt das abgegebene Arzneimittel und beginnt am Tag der Abgabe; eine
 * geänderte Dosierung der Abgabe geht in sie über. Ohne Austausch wird das verordnete Arzneimittel
 * fortgeschrieben (neue Fassung, aktiv) statt neu angelegt. Danach „link eMP element“: Der
 * verknüpfte eMP-Eintrag bekommt den Aktivitätsnachweis und — bei genau einem abgegebenen
 * Arzneimittel — dessen Arzneimittel und Dosierung (IG 1.3.5, „mehrere Arzneimittel“: kein
 * Planupdate).
 */
function abgabeEinstellen(r: Rezept, art: Abgabeart): void {
  const kvnr = r.kvnr!;
  const liste = ablage(kvnr);
  const zeit = jetzt();
  const heute = zeit.slice(0, 10);
  const prozess = prozesskennung(r);
  const verordnung = mitProzess(kvnr, 'MedicationRequest', prozess)[0];
  const aussage =
    mitProzess(kvnr, 'MedicationStatement', prozess).find((a) => a.id === r.aussageId) ??
    mitProzess(kvnr, 'MedicationStatement', prozess)[0];
  const verordnetesMittel = verordnung
    ? liste.find(
        (x) =>
          x.resourceType === 'Medication' && x.id === referenzId(verordnung['medicationReference']),
      )
    : undefined;
  if (!verordnung || !aussage || !verordnetesMittel) return;
  const text = String((verordnetesMittel['code'] as { text?: string } | undefined)?.text ?? '');
  const dosierungText = viererschema(verordnung['dosageInstruction']);
  const coding = ((verordnetesMittel['code'] as { coding?: unknown[] } | undefined)?.coding ??
    []) as { system?: string }[];

  const tausch = art === 'austausch' ? austauschen(text, dosierungText) : null;
  const produkte: { text: string; pzn: string; dosierung: string | null }[] =
    art === 'mehrfach'
      ? [
          { text: `${text} (Teilmenge, Hersteller A)`, pzn: '09990001', dosierung: null },
          { text: `${text} (Teilmenge, Hersteller B)`, pzn: '09990002', dosierung: null },
        ]
      : [
          {
            text: tausch?.text ?? text,
            pzn: tausch
              ? '09990003'
              : ((coding.find((k) => k.system === PZN) as { code?: string } | undefined)?.code ??
                ''),
            dosierung: tausch?.dosierung ?? null,
          },
        ];

  const neu: Ressource[] = [];
  const geaendert: Ressource[] = [verordnung, aussage];
  const aussagen: Ressource[] = [];
  produkte.forEach((p, i) => {
    // Ohne Austausch: dasselbe Arzneimittel in neuer Fassung; sonst ein neues.
    let m: Ressource;
    if (art === 'wie-verordnet') {
      m = verordnetesMittel;
      m['status'] = 'active';
      fortschreiben(m, zeit);
      geaendert.push(m);
    } else {
      m = {
        resourceType: 'Medication',
        id: neueId('med'),
        meta: { versionId: '1', lastUpdated: zeit, profile: [PROFIL.medication] },
        extension: [prozessExtension(prozess)],
        status: 'active',
        code: {
          coding: [
            ...coding.filter((k) => k.system === ATC),
            ...(p.pzn ? [{ system: PZN, code: p.pzn }] : []),
          ],
          text: p.text,
        },
      };
      neu.push(m);
    }
    const abgabe: Ressource = {
      resourceType: 'MedicationDispense',
      id: neueId('ab'),
      meta: { versionId: '1', lastUpdated: zeit, profile: [PROFIL.abgabe] },
      extension: [prozessExtension(prozess)],
      status: 'completed',
      medicationReference: { reference: `Medication/${String(m.id)}` },
      subject: subjektFuer(kvnr),
      performer: [{ actor: { display: APOTHEKE.anzeige } }],
      authorizingPrescription: [{ reference: `MedicationRequest/${String(verordnung.id)}` }],
      whenHandedOver: heute,
      ...(art !== 'wie-verordnet' ? { substitution: { wasSubstituted: true } } : {}),
    };
    if (p.dosierung)
      mitDosierung(abgabe, 'dosageInstruction', dosierungNachFhir(dosierungAusText(p.dosierung)));
    neu.push(abgabe);
    // Die erste Abgabe schreibt die Medikationsinformation der Verschreibung fort; jede weitere
    // bekommt eine eigene, mit derselben Verknüpfung.
    const a: Ressource =
      i === 0
        ? aussage
        : {
            ...structuredClone(aussage),
            id: neueId('ms'),
            meta: { versionId: '1', lastUpdated: zeit, profile: [PROFIL.aussage] },
            dateAsserted: zeit,
          };
    a['status'] = 'unknown';
    a['medicationReference'] = { reference: `Medication/${String(m.id)}` };
    a['effectivePeriod'] = { start: heute };
    a['derivedFrom'] = [
      { reference: `MedicationRequest/${String(verordnung.id)}` },
      { reference: `MedicationDispense/${String(abgabe.id)}` },
    ];
    if (p.dosierung) mitDosierung(a, 'dosage', dosierungNachFhir(dosierungAusText(p.dosierung)));
    if (i > 0) neu.push(a);
    aussagen.push(a);
  });
  liste.push(...neu.filter((x) => !liste.includes(x)));
  verordnung['status'] = 'completed';
  for (const x of [verordnung, aussage]) fortschreiben(x, zeit);
  aktivitaetAnlegen(liste, neu.map(versionierterVerweis), MEDIKATIONSDIENST, 'CREATE', zeit);
  aktivitaetAnlegen(liste, geaendert.map(versionierterVerweis), MEDIKATIONSDIENST, 'UPDATE', zeit);

  // „link eMP element“: Aktivitätsnachweis am verknüpften Eintrag; Arzneimittel und Dosierung nur
  // bei genau einem abgegebenen Arzneimittel.
  const plan = planeintragZu(kvnr, aussage);
  if (plan) {
    for (const a of aussagen) verknuepfen(kvnr, a, plan, zeit, aussagen.length === 1);
    fortschreiben(plan, zeit);
    aktivitaetAnlegen(liste, [versionierterVerweis(plan)], MEDIKATIONSDIENST, 'UPDATE', zeit);
    chronologieAnlegen(liste, EMP, MEDIKATIONSDIENST, zeit);
  }
}

/**
 * `$cancel-dispensation-erp` (IG-MED-BL-CANCEL-DISPENSATION-ERP-V5, Teil
 * REMOVE-DISPENSATION-ERP-V2): Der verknüpfte eMP-Eintrag wird auf seine Fassung vor der Abgabe
 * zurückgesetzt — Arzneimittel und Dosierung —, der Aktivitätsnachweis entfällt. Die
 * Medikationsinformation der Verschreibung kehrt zurück (geplant, Arzneimittel, Beginn und
 * Dosierung der Verordnung), weitere werden gelöscht, ebenso die Abgaben und die abgegebenen
 * Arzneimittel; ein ohne Austausch fortgeschriebenes Arzneimittel wird wieder inaktiv.
 */
function abgabeStornieren(r: Rezept): void {
  const kvnr = r.kvnr!;
  const liste = ablage(kvnr);
  const zeit = jetzt();
  const prozess = prozesskennung(r);
  const verordnung = mitProzess(kvnr, 'MedicationRequest', prozess)[0];
  const aussagen = mitProzess(kvnr, 'MedicationStatement', prozess);
  const aussage = aussagen.find((a) => a.id === r.aussageId) ?? aussagen[0];
  const abgaben = mitProzess(kvnr, 'MedicationDispense', prozess);
  if (!verordnung || !aussage) return;

  // Zuerst der eMP-Eintrag: Er vergleicht seine Fassungen mit der Medikationsinformation, wie
  // sie nach der Abgabe aussieht.
  const plan = planeintragZu(kvnr, aussage);
  let planGeaendert = false;
  if (plan) {
    for (const a of aussagen)
      if (empZuruecksetzen(kvnr, plan, a, zeit, { verknuepfungBehalten: true }).eintragGeaendert)
        planGeaendert = true;
  }

  const verordnetesMittelId = referenzId(verordnung['medicationReference']);
  const abgegebeneMittel = new Set(abgaben.map((a) => referenzId(a['medicationReference'])));
  const weitere = aussagen.filter((a) => a !== aussage);
  aussage['status'] = 'intended';
  aussage['medicationReference'] = structuredClone(verordnung['medicationReference']);
  aussage['effectivePeriod'] = { start: String(verordnung['authoredOn'] ?? r.authoredOn) };
  aussage['derivedFrom'] = [{ reference: `MedicationRequest/${String(verordnung.id)}` }];
  const dosierung = verordnung['dosageInstruction'] as Record<string, unknown>[] | undefined;
  if (dosierung && dosierung.length > 0) mitDosierung(aussage, 'dosage', dosierung);
  verordnung['status'] = 'active';
  const geaendert: Ressource[] = [aussage, verordnung];
  const verordnetesMittel = liste.find(
    (x) => x.resourceType === 'Medication' && x.id === verordnetesMittelId,
  );
  if (verordnetesMittel && verordnetesMittel['status'] !== 'inactive') {
    verordnetesMittel['status'] = 'inactive';
    geaendert.push(verordnetesMittel);
  }
  for (const x of geaendert) fortschreiben(x, zeit);
  aktivitaetAnlegen(liste, geaendert.map(versionierterVerweis), MEDIKATIONSDIENST, 'UPDATE', zeit);
  const geloescht = [
    ...weitere,
    ...abgaben,
    ...[...abgegebeneMittel]
      .filter((id) => id !== verordnetesMittelId)
      .map((id) => liste.find((x) => x.resourceType === 'Medication' && x.id === id))
      .filter((x): x is Ressource => !!x),
  ];
  if (geloescht.length > 0) {
    aktivitaetAnlegen(
      liste,
      geloescht.map(versionierterVerweis),
      MEDIKATIONSDIENST,
      'DELETE',
      zeit,
    );
    for (const x of geloescht) loeschen(liste, x);
  }
  if (plan && planGeaendert) {
    fortschreiben(plan, zeit);
    aktivitaetAnlegen(liste, [versionierterVerweis(plan)], MEDIKATIONSDIENST, 'UPDATE', zeit);
    chronologieAnlegen(liste, EMP, MEDIKATIONSDIENST, zeit);
  }
}

/* ---------- Warteschlange ---------- */

type Auftrag = (r: Rezept) => void;

/**
 * Reiht eine Übertragung ein. Der Fachdienst prüft vor der Übertragung, ob es eine Akte gibt
 * und ob dem Einstellen widersprochen wurde (Information Service).
 */
function einreihen(r: Rezept, auftrag: Auftrag, stornierung = false): void {
  const ausfuehren = () => {
    if (!r.kvnr || !bestandVorhanden(r.kvnr)) {
      r.epa = 'keine Akte';
      return;
    }
    if (bestandFuer(r.kvnr).widersprueche['erp-submission'] === 'deny') {
      r.epa = 'Widerspruch';
      return;
    }
    if (!stornierung && r.epa === 'storniert') return;
    auftrag(r);
    if (!stornierung) r.epa = 'übertragen';
  };
  const ms = betriebslage.erezeptVerzoegerungMs;
  if (ms <= 0) {
    ausfuehren();
    return;
  }
  const z = setTimeout(() => {
    zeitgeber.delete(z);
    ausfuehren();
  }, ms);
  zeitgeber.add(z);
}

/* ---------- Schnittstelle des Fachdienstes ---------- */

function fehlerAntwort(antwort: SimAntwort, status: number, code: string, text: string) {
  return antwort.code(status).send(operationOutcome('error', code, text));
}

/** Liest den Verordnungsdatensatz aus `ePrescription` — ⚠ in der Demo unsigniert. */
function datensatzLesen(koerper: unknown): Ressource | null {
  const binary = parameterLesen(koerper, 'ePrescription')?.resource;
  const daten = typeof binary?.['data'] === 'string' ? (binary['data'] as string) : '';
  try {
    const bundle = JSON.parse(base64ZuText(daten)) as Ressource;
    return bundle.resourceType === 'Bundle' ? bundle : null;
  } catch {
    return null;
  }
}

function eintraegeAus(bundle: Ressource): Ressource[] {
  return ((bundle['entry'] as { resource?: Ressource }[] | undefined) ?? [])
    .map((e) => e.resource)
    .filter((r): r is Ressource => !!r);
}

export function erezeptEinhaengen(
  app: SimAnwendung,
  sitzungAus: (anfrage: { headers: Record<string, unknown> }) => string,
): void {
  const b = ERP_BASIS;

  app.post(`${b}/Task/$create`, async (anfrage, antwort) => {
    const sitzung = sitzungAus(anfrage);
    if (!sitzung)
      return fehlerAntwort(antwort, 403, 'forbidden', 'Keine Sitzung (Demo: x-demo-sitzung).');
    const flowtype = String(parameterLesen(anfrage.body, 'workflowType')?.valueCoding?.code ?? '');
    if (!FLOWTYPEN[flowtype]) {
      return fehlerAntwort(
        antwort,
        400,
        'invalid',
        `Flowtype „${flowtype}" wird in der Demo nicht angeboten.`,
      );
    }
    const id = rezeptId(flowtype);
    const accessCode = zufallHex(32);
    const zeit = jetzt();
    const task: Ressource = {
      resourceType: 'Task',
      id,
      meta: { profile: ['https://gematik.de/fhir/erp/StructureDefinition/GEM_ERP_PR_Task'] },
      extension: [
        {
          url: 'https://gematik.de/fhir/erp/StructureDefinition/GEM_ERP_EX_PrescriptionType',
          valueCoding: { system: FLOWTYPE, code: flowtype, display: FLOWTYPEN[flowtype] },
        },
      ],
      identifier: [
        { system: PRESCRIPTION_ID, value: id },
        { system: ACCESS_CODE, value: accessCode },
      ],
      status: 'draft',
      intent: 'order',
      authoredOn: zeit,
      lastModified: zeit,
    };
    rezepte.set(id, {
      task,
      accessCode,
      kvnr: null,
      verordner: { telematikId: sitzung, anzeige: sitzung },
      arzt: '',
      medication: null,
      verordnung: null,
      authoredOn: zeit.slice(0, 10),
      empId: null,
      epa: 'ausstehend',
      abgabe: 'keine',
    });
    return antwort.code(201).send(task);
  });

  /** Gemeinsam für `$activate` und `$abort`: Rezept finden und AccessCode prüfen. */
  function rezeptMitZugang(
    anfrage: { params: unknown; headers: Record<string, unknown> },
    antwort: SimAntwort,
  ): Rezept | null {
    const r = rezepte.get((anfrage.params as { id: string }).id);
    if (!r) {
      void fehlerAntwort(antwort, 404, 'not-found', 'Kein Rezept mit dieser ID.');
      return null;
    }
    if (anfrage.headers['x-accesscode'] !== r.accessCode) {
      void fehlerAntwort(antwort, 403, 'forbidden', 'AccessCode fehlt oder passt nicht.');
      return null;
    }
    return r;
  }

  app.post(`${b}/Task/:id/$activate`, async (anfrage, antwort) => {
    const r = rezeptMitZugang(anfrage, antwort);
    if (!r) return antwort;
    if (r.task['status'] !== 'draft') {
      return fehlerAntwort(antwort, 403, 'business-rule', 'Das Rezept ist bereits aktiviert.');
    }
    const bundle = datensatzLesen(anfrage.body);
    if (!bundle) {
      return fehlerAntwort(
        antwort,
        400,
        'invalid',
        'ePrescription enthält keinen lesbaren Verordnungsdatensatz.',
      );
    }
    const teile = eintraegeAus(bundle);
    const patient = teile.find((x) => x.resourceType === 'Patient');
    const verordnung = teile.find((x) => x.resourceType === 'MedicationRequest');
    const medication = teile.find((x) => x.resourceType === 'Medication');
    const arzt = teile.find((x) => x.resourceType === 'Practitioner');
    const praxis = teile.find((x) => x.resourceType === 'Organization');
    const kvnr = patient ? kennung(patient, KVID) : undefined;
    if (!kvnr || !verordnung || !medication) {
      return fehlerAntwort(
        antwort,
        400,
        'invalid',
        'Im Datensatz fehlen Patient (KVNR), MedicationRequest oder Medication.',
      );
    }
    const name = (arzt?.['name'] as { text?: string }[] | undefined)?.[0]?.text ?? '';
    r.kvnr = kvnr;
    r.arzt = name;
    r.verordner = {
      telematikId: r.verordner!.telematikId,
      anzeige: String(praxis?.['name'] ?? r.verordner!.anzeige),
    };
    r.medication = { resourceType: 'Medication', code: medication['code'] };
    r.verordnung = verordnung;
    r.empId =
      (verordnung['basedOn'] as { identifier?: { system?: string; value?: string } }[] | undefined)
        ?.map((x) => x.identifier)
        .find((i) => i?.system === EMP_IDENTIFIER)?.value ?? null;
    r.authoredOn = String(verordnung['authoredOn'] ?? r.authoredOn).slice(0, 10);
    r.task['status'] = 'ready';
    r.task['for'] = { identifier: { system: KVID, value: kvnr } };
    r.task['lastModified'] = jetzt();
    einreihen(r, verschreibungEinstellen);
    return r.task;
  });

  app.post(`${b}/Task/:id/$abort`, async (anfrage, antwort) => {
    const r = rezeptMitZugang(anfrage, antwort);
    if (!r) return antwort;
    if (!['draft', 'ready'].includes(String(r.task['status']))) {
      return fehlerAntwort(
        antwort,
        403,
        'business-rule',
        'Das Rezept ist in Belieferung oder eingelöst und kann nicht mehr gelöscht werden.',
      );
    }
    const warAktiv = r.task['status'] === 'ready';
    r.task['status'] = 'cancelled';
    r.task['lastModified'] = jetzt();
    if (warAktiv) {
      einreihen(r, verschreibungStornieren, true);
      r.epa = r.epa === 'übertragen' ? 'storniert' : r.epa === 'ausstehend' ? 'storniert' : r.epa;
    }
    return antwort.code(204).send();
  });

  /* ---------- Demo-Steuerung: die Apotheke ---------- */

  app.get('/verwaltung/erezepte', async () =>
    [...rezepte.values()]
      .filter((r) => r.task['status'] !== 'draft')
      .map((r) => ({
        id: r.task.id,
        kvnr: r.kvnr,
        status: r.task['status'],
        arzneimittel: (r.medication?.['code'] as { text?: string } | undefined)?.text ?? '',
        authoredOn: r.authoredOn,
        epa: r.epa,
        abgabe: r.abgabe,
        empId: r.empId,
      })),
  );

  app.post('/verwaltung/erezepte/:id/abgabe', async (anfrage, antwort) => {
    const r = rezepte.get((anfrage.params as { id: string }).id);
    const art = ((anfrage.body as { art?: Abgabeart } | undefined)?.art ??
      'wie-verordnet') as Abgabeart;
    if (!r || r.task['status'] !== 'ready') {
      return fehlerAntwort(
        antwort,
        409,
        'business-rule',
        'Nur ein aktives, nicht eingelöstes Rezept lässt sich abgeben.',
      );
    }
    r.task['status'] = 'completed';
    r.abgabe = 'abgegeben';
    einreihen(r, (x) => abgabeEinstellen(x, art));
    return { id: r.task.id, status: r.task['status'] };
  });

  app.post('/verwaltung/erezepte/:id/abgabe-storno', async (anfrage, antwort) => {
    const r = rezepte.get((anfrage.params as { id: string }).id);
    if (!r || r.task['status'] !== 'completed') {
      return fehlerAntwort(
        antwort,
        409,
        'business-rule',
        'Nur eine erfolgte Abgabe lässt sich stornieren.',
      );
    }
    r.task['status'] = 'ready';
    r.abgabe = 'keine';
    einreihen(r, abgabeStornieren, true);
    return { id: r.task.id, status: r.task['status'] };
  });
}
