import type { FastifyInstance, FastifyReply } from 'fastify';
import { base64ZuText, zufallHex } from './plattform.ts';
import type { Ressource } from '@demo-pvs/kern';
import { bestandFuer, bestandVorhanden } from './bestand.ts';
import { betriebslage } from './betrieb.ts';
import { chronologieAnlegen } from './chronologie.ts';
import { jetzt, neueId, operationOutcome, parameterLesen } from './fhir-hilfen.ts';
import { EMP, EMP_IDENTIFIER, EXT, PROFIL, istEmpEintrag } from './medikation.ts';
import {
  aktivitaetAnlegen,
  fortschreiben,
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
 * **Zulieferung** nach IG `de.gematik.epa.medication` 1.3.5, technische Anwendungsfälle: Der
 * Fachdienst reiht Verschreibung, Abgabe und Stornierungen in eine Warteschlange ein und
 * überträgt sie **asynchron** (`$provide-prescription-erp`, `$provide-dispensation-erp`,
 * `$cancel-prescription-erp`, `$cancel-dispensation-erp`). Trägt die Verschreibung den
 * eMP-Identifier eines Planeintrags (`MedicationRequest.basedOn.identifier`), verknüpft der
 * Medication Service Liste und Plan selbst; nach der Abgabe verweist der Planeintrag auf das
 * abgegebene Arzneimittel, bei Austausch mit geänderter Dosierung. Werden zu einem Rezept
 * mehrere Arzneimittel abgegeben, aktualisiert sich der Plan nicht.
 *
 * Die Abgabe selbst löst die Demo-Steuerung aus („Apotheke gibt ab").
 */

export const ERP_BASIS = '/erp';

const NS = 'https://gematik.de/fhir/erp/NamingSystem/';
const PRESCRIPTION_ID = `${NS}GEM_ERP_NS_PrescriptionId`;
const ACCESS_CODE = `${NS}GEM_ERP_NS_AccessCode`;
const FLOWTYPE = 'https://gematik.de/fhir/erp/CodeSystem/GEM_ERP_CS_FlowType';
const RX_PROZESS = 'https://gematik.de/fhir/epa-medication/sid/rx-prescription-process-identifier';
const KVID = 'http://fhir.de/sid/gkv/kvid-10';
const ATC = 'http://fhir.de/CodeSystem/bfarm/atc';
const PZN = 'http://fhir.de/CodeSystem/ifa/pzn';

const FLOWTYPEN: Record<string, string> = {
  '160': 'Muster 16 (Apothekenpflichtige Arzneimittel)',
  '200': 'PKV (Apothekenpflichtige Arzneimittel)',
};

export const APOTHEKE: Handelnde = {
  telematikId: 'DEMO-APOTHEKE-STADTGARTEN',
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

function mitProzess(kvnr: string, typ: string, prozess: string): Ressource[] {
  return ablage(kvnr).filter(
    (x) =>
      x.resourceType === typ &&
      ((x['identifier'] as { value?: string }[] | undefined) ?? []).some(
        (i) => i.value === prozess,
      ),
  );
}

function referenzId(verweis: unknown): string {
  return (
    String((verweis as { reference?: string } | undefined)?.reference ?? '').split('/')[1] ?? ''
  );
}

function planeintragZu(kvnr: string, aussage: Ressource): Ressource | undefined {
  const verweis = (aussage['basedOn'] as { reference?: string }[] | undefined)?.[0];
  const id = referenzId(verweis);
  return id ? ablage(kvnr).find((r) => istEmpEintrag(r) && r.id === id) : undefined;
}

/** `$provide-prescription-erp`: Verschreibung, Arzneimittel und Medikationsinformation anlegen. */
function verschreibungEinstellen(r: Rezept): void {
  const kvnr = r.kvnr!;
  const liste = ablage(kvnr);
  const zeit = jetzt();
  const prozess = prozesskennung(r);
  const wer = r.verordner!;
  const medication: Ressource = {
    ...r.medication!,
    id: neueId('med'),
    meta: { versionId: '1', lastUpdated: zeit, profile: [PROFIL.medication] },
    identifier: [{ system: RX_PROZESS, value: prozess }],
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
    requester: { display: `${r.arzt}, ${wer.anzeige}` },
    dosageInstruction: dosierung,
    ...(r.verordnung!['dispenseRequest']
      ? { dispenseRequest: r.verordnung!['dispenseRequest'] }
      : {}),
    ...(r.empId ? { basedOn: [{ identifier: { system: EMP_IDENTIFIER, value: r.empId } }] } : {}),
  };
  const aussage: Ressource = {
    resourceType: 'MedicationStatement',
    id: neueId('ms'),
    meta: { versionId: '1', lastUpdated: zeit, profile: [PROFIL.aussage] },
    extension: [{ url: EXT.kontext, valueCode: 'PRESCRIPTION' }],
    identifier: [{ system: RX_PROZESS, value: prozess }],
    status: 'intended',
    medicationReference: { reference: `Medication/${String(medication.id)}` },
    subject: subjektFuer(kvnr),
    effectivePeriod: { start: r.authoredOn },
    dateAsserted: zeit,
    derivedFrom: [{ reference: `MedicationRequest/${String(verordnung.id)}` }],
    // Die Dosierung wird in die Medikationsinformation kopiert (IG 1.3.5, Verknüpfungslogik).
    dosage: dosierung,
  };
  liste.push(medication, verordnung, aussage);
  aktivitaetAnlegen(
    liste,
    [
      versionierterVerweis(medication),
      versionierterVerweis(verordnung),
      versionierterVerweis(aussage),
    ],
    wer,
    'CREATE',
    zeit,
  );

  // Verknüpfung mit dem Planeintrag über den eMP-Identifier.
  const plan = r.empId
    ? liste.find(
        (x) =>
          istEmpEintrag(x) &&
          kennung(x, EMP_IDENTIFIER) === r.empId &&
          ['active', 'on-hold'].includes(String(x['status'])),
      )
    : undefined;
  if (plan) {
    aussage['basedOn'] = [{ reference: `MedicationRequest/${String(plan.id)}` }];
    plan.extension = [
      ...((plan.extension ?? []) as { url: string }[]),
      {
        url: EXT.aktivitaet,
        extension: [
          {
            url: 'reference',
            valueReference: { reference: `MedicationStatement/${String(aussage.id)}` },
          },
          { url: 'addedOn', valueDateTime: zeit },
        ],
      },
    ];
    fortschreiben(plan, zeit);
    aktivitaetAnlegen(liste, [versionierterVerweis(plan)], wer, 'UPDATE', zeit);
    chronologieAnlegen(liste, EMP, wer, zeit);
  }
}

/** Nimmt die Verknüpfung eines Planeintrags mit einer Medikationsinformation zurück. */
function planVerknuepfungLoesen(kvnr: string, aussage: Ressource, wer: Handelnde, zeit: string) {
  const plan = planeintragZu(kvnr, aussage);
  if (!plan) return;
  plan.extension = (plan.extension ?? []).filter(
    (e) =>
      !(
        e.url === EXT.aktivitaet &&
        referenzId(e.extension?.find((y) => y.url === 'reference')?.valueReference) === aussage.id
      ),
  );
  const herkunft = ((plan.extension ?? []) as { url: string; valueReference?: unknown }[]).find(
    (e) => e.url === EXT.herkunftsmittel,
  );
  if (herkunft) plan['medicationReference'] = herkunft.valueReference;
  delete aussage['basedOn'];
  fortschreiben(plan, zeit);
  aktivitaetAnlegen(ablage(kvnr), [versionierterVerweis(plan)], wer, 'UPDATE', zeit);
  chronologieAnlegen(ablage(kvnr), EMP, wer, zeit);
}

/**
 * `$cancel-prescription-erp`: Verschreibung, Arzneimittel, Abgaben und Medikationsinformation
 * mit derselben Prozesskennung werden `entered-in-error`; die eML zeigt sie nicht mehr.
 * ⚠ Die Statusübersicht des IG spricht von Löschen, der Anwendungsfall von `entered-in-error`;
 * die Demo folgt dem Anwendungsfall und löst eine Verknüpfung mit dem Plan.
 */
function verschreibungStornieren(r: Rezept): void {
  const kvnr = r.kvnr!;
  const zeit = jetzt();
  const prozess = prozesskennung(r);
  const betroffen = [
    'MedicationRequest',
    'Medication',
    'MedicationDispense',
    'MedicationStatement',
  ].flatMap((typ) => mitProzess(kvnr, typ, prozess));
  for (const x of betroffen) {
    if (x.resourceType === 'MedicationStatement')
      planVerknuepfungLoesen(kvnr, x, r.verordner!, zeit);
    x['status'] = 'entered-in-error';
    fortschreiben(x, zeit);
  }
  if (betroffen.length > 0) {
    aktivitaetAnlegen(
      ablage(kvnr),
      betroffen.map(versionierterVerweis),
      r.verordner!,
      'DELETE',
      zeit,
    );
  }
}

export type Abgabeart = 'wie-verordnet' | 'austausch' | 'mehrfach';

/** Halbiert eine Stärke im Namen und verdoppelt das Viererschema — für den Austausch. */
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

/** `$provide-dispensation-erp`: Abgabe(n) anlegen, Verschreibung abschließen, Plan fortschreiben. */
function abgabeEinstellen(r: Rezept, art: Abgabeart): void {
  const kvnr = r.kvnr!;
  const liste = ablage(kvnr);
  const zeit = jetzt();
  const heute = zeit.slice(0, 10);
  const prozess = prozesskennung(r);
  const verordnung = mitProzess(kvnr, 'MedicationRequest', prozess)[0];
  const aussage = mitProzess(kvnr, 'MedicationStatement', prozess)[0];
  const verordnetesMittel = mitProzess(kvnr, 'Medication', prozess)[0];
  if (!verordnung || !aussage || !verordnetesMittel) return;
  const text = String((verordnetesMittel['code'] as { text?: string } | undefined)?.text ?? '');
  const dosierungText =
    (verordnung['dosageInstruction'] as { text?: string }[] | undefined)?.[0]?.text ?? '';
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

  const abgaben: Ressource[] = [];
  const mittel: Ressource[] = [];
  for (const p of produkte) {
    const m: Ressource = {
      resourceType: 'Medication',
      id: neueId('med'),
      meta: { versionId: '1', lastUpdated: zeit, profile: [PROFIL.medication] },
      identifier: [{ system: RX_PROZESS, value: prozess }],
      status: 'active',
      code: {
        coding: [
          ...coding.filter((k) => k.system === ATC),
          ...(p.pzn ? [{ system: PZN, code: p.pzn }] : []),
        ],
        text: p.text,
      },
    };
    const a: Ressource = {
      resourceType: 'MedicationDispense',
      id: neueId('ab'),
      meta: { versionId: '1', lastUpdated: zeit, profile: [PROFIL.abgabe] },
      extension: [
        {
          url: 'https://gematik.de/fhir/epa-medication/StructureDefinition/rx-prescription-process-identifier-extension',
          valueIdentifier: { system: RX_PROZESS, value: prozess },
        },
      ],
      status: 'completed',
      medicationReference: { reference: `Medication/${String(m.id)}` },
      subject: subjektFuer(kvnr),
      performer: [{ actor: { display: APOTHEKE.anzeige } }],
      authorizingPrescription: [{ reference: `MedicationRequest/${String(verordnung.id)}` }],
      whenHandedOver: heute,
      ...(art !== 'wie-verordnet' ? { substitution: { wasSubstituted: true } } : {}),
      ...(p.dosierung ? { dosageInstruction: [{ text: p.dosierung }] } : {}),
    };
    mittel.push(m);
    abgaben.push(a);
  }
  liste.push(...mittel, ...abgaben);
  verordnung['status'] = 'completed';
  verordnetesMittel['status'] = 'active';
  aussage['status'] = 'unknown';
  aussage['derivedFrom'] = [
    ...((aussage['derivedFrom'] as unknown[] | undefined) ?? []),
    ...abgaben.map((a) => ({ reference: `MedicationDispense/${String(a.id)}` })),
  ];
  for (const x of [verordnung, verordnetesMittel, aussage]) fortschreiben(x, zeit);
  aktivitaetAnlegen(
    liste,
    [...mittel, ...abgaben, verordnung, verordnetesMittel, aussage].map(versionierterVerweis),
    APOTHEKE,
    'CREATE',
    zeit,
  );

  // Der Planeintrag verweist auf das abgegebene Arzneimittel — nur bei genau einem.
  const plan = planeintragZu(kvnr, aussage);
  if (plan && abgaben.length === 1) {
    plan['medicationReference'] = { reference: `Medication/${String(mittel[0]!.id)}` };
    if (produkte[0]!.dosierung) plan['dosageInstruction'] = [{ text: produkte[0]!.dosierung }];
    fortschreiben(plan, zeit);
    aktivitaetAnlegen(liste, [versionierterVerweis(plan)], APOTHEKE, 'UPDATE', zeit);
    chronologieAnlegen(liste, EMP, APOTHEKE, zeit);
  }
}

/**
 * `$cancel-dispensation-erp`: Abgaben entfernen, Verschreibung wieder `active`, Arzneimittel
 * `inactive`, Medikationsinformation `intended`. ⚠ Den Planeintrag setzt die Demo auf das
 * ursprüngliche Arzneimittel zurück; der IG regelt das für diesen Fall nicht ausdrücklich.
 */
function abgabeStornieren(r: Rezept): void {
  const kvnr = r.kvnr!;
  const liste = ablage(kvnr);
  const zeit = jetzt();
  const prozess = prozesskennung(r);
  const verordnung = mitProzess(kvnr, 'MedicationRequest', prozess)[0];
  const aussage = mitProzess(kvnr, 'MedicationStatement', prozess)[0];
  const alleMittel = mitProzess(kvnr, 'Medication', prozess);
  const abgaben = mitProzess(kvnr, 'MedicationDispense', prozess);
  if (!verordnung || !aussage) return;
  const abgegebeneMittel = new Set(abgaben.map((a) => referenzId(a['medicationReference'])));
  const verordnetesMittel = alleMittel.find((m) => !abgegebeneMittel.has(String(m.id)));
  const weg = new Set([...abgaben.map((a) => a.id), ...abgegebeneMittel]);
  liste.splice(
    0,
    liste.length,
    ...liste.filter(
      (x) =>
        !(weg.has(String(x.id)) && ['MedicationDispense', 'Medication'].includes(x.resourceType)),
    ),
  );
  verordnung['status'] = 'active';
  if (verordnetesMittel) verordnetesMittel['status'] = 'inactive';
  aussage['status'] = 'intended';
  aussage['derivedFrom'] = [{ reference: `MedicationRequest/${String(verordnung.id)}` }];
  for (const x of [verordnung, aussage, ...(verordnetesMittel ? [verordnetesMittel] : [])])
    fortschreiben(x, zeit);
  aktivitaetAnlegen(
    liste,
    [versionierterVerweis(verordnung), versionierterVerweis(aussage)],
    APOTHEKE,
    'UPDATE',
    zeit,
  );
  const plan = planeintragZu(kvnr, aussage);
  if (plan && abgegebeneMittel.has(referenzId(plan['medicationReference']))) {
    const herkunft = ((plan.extension ?? []) as { url: string; valueReference?: unknown }[]).find(
      (e) => e.url === EXT.herkunftsmittel,
    );
    if (herkunft) plan['medicationReference'] = herkunft.valueReference;
    fortschreiben(plan, zeit);
    aktivitaetAnlegen(liste, [versionierterVerweis(plan)], APOTHEKE, 'UPDATE', zeit);
    chronologieAnlegen(liste, EMP, APOTHEKE, zeit);
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

function fehlerAntwort(antwort: FastifyReply, status: number, code: string, text: string) {
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
  app: FastifyInstance,
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
    antwort: FastifyReply,
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
