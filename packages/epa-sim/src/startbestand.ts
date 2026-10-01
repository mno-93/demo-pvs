import {
  allergieNachFhir,
  BEFUND_HOFFMANN,
  BEFUND_HOFFMANN_MAERZ,
  BEFUND_YILDIZ,
  CODESYSTEM,
  diagnoseNachFhir,
  impfstoffe,
  impfungNachFhir,
  dokumenttypen,
  laborbefundBauen,
  pdfErzeugen,
  psRelevanzSetzen,
  uuidAlsOid,
  type Befundangabe,
  type Allergie,
  type Diagnose,
  type Impfung,
  type Ressource,
} from '@demo-pvs/kern';
import { sha256Hex, utf8AlsBytezeichen } from './plattform.ts';
import { bestandFuer, bestaendeLeeren, type Dokument, type Kodewert } from './bestand.ts';
import { befugnisErteilen, befugnisseLeeren } from './befugnis.ts';
import { chronologieAnlegen } from './chronologie.ts';
import { eintragAnlegen, listeFortschreiben } from './diagnosedienst.ts';
import { EMP, EMP_IDENTIFIER, EXT, PROFIL } from './medikation.ts';
import { eintragsUuid } from './mhd.ts';
import { jetzt } from './fhir-hilfen.ts';
import {
  aktivitaetAnlegen,
  subjektFuer,
  versionierterVerweis,
  type Handelnde,
} from './schreibwege.ts';

/**
 * Startbestand des simulierten Aktensystems. Alle Personen, Einrichtungen und Befunde sind
 * erfunden, die Telematik-IDs ebenso.
 *
 * Die Dokumente zeigen den Spezifikationsstand:
 * - ein **eArztbrief** — im Release 3.1.3 registriert (`urn:gematik:ig:Arztbrief:r3.1`);
 * - **Laborbefunde** — im Release 3.1.3 als PDF, in der Vorschau auf ePA 3.2 als
 *   strukturierter Befund nach dgLP (ohne veröffentlichten formatCode);
 * - der **Entlassbrief** — im Release 3.1.3 als PDF, in der Weiterentwicklung strukturiert.
 *
 * Für Herrn Krüger liegt nichts vor; er hat dem Medikationsprozess widersprochen. Frau Weber
 * (nur im Praxissystem) hat keine Akte.
 */

const KVNR = { hoffmann: 'A123456780', krueger: 'K876543217', yildiz: 'M555123402' } as const;

export const KLINIKUM: Handelnde = {
  telematikId: 'DEMO-KLINIKUM-SONNENSCHEIN',
  anzeige: 'Klinikum Sonnenschein',
};
export const PRAXIS: Handelnde = {
  telematikId: 'DEMO-PRAXIS-STADTGARTEN',
  anzeige: 'Hausarztpraxis am Stadtgarten',
};
const APOTHEKE = 'Stadtgarten-Apotheke';

const OID_KLASSE = '1.3.6.1.4.1.19376.3.276.1.5.8';
const OID_TYP = '1.3.6.1.4.1.19376.3.276.1.5.9';
const kode = (code: string, system: string, anzeige: string): Kodewert => ({
  code,
  system,
  anzeige,
});

/**
 * uniqueId eines Dokuments ohne eigene Kennung: aus der Dokumentkennung wird eine UUID
 * gebildet und nach ITU-T X.667 unter dem Bogen 2.25 geführt.
 */
function abgeleiteteUniqueId(id: string): string {
  const hex = sha256Hex(id).slice(0, 32);
  return `urn:oid:2.25.${BigInt(`0x${hex}`).toString(10)}`;
}

/**
 * formatCode für PDF/A-1 aus „Deutsche Dokumentenformate" — belegt im Beispiel zu
 * `EPAMHDDocumentReference` (MHD-IG 1.1.3); das ValueSet `epa-xds-format-code-vs` bindet das
 * Codesystem vollständig ein.
 */
const PDF_A1: Kodewert = kode(
  'urn:ihe-d:spec:PDF_A1:2005',
  '1.3.6.1.4.1.19376.3.276.1.5.6',
  'PDF/A-1',
);

/** Ein Befund als PDF, wie er im Release 3.1.3 in der ePA liegt. */
function laborbefundAlsPdf(a: Befundangabe): string {
  return pdfErzeugen(`Laborbefund ${a.labor}`, [
    `Auftrag ${a.auftragsnummer} · Entnahme ${a.entnahme.slice(0, 10)} · Probe ${a.probenart}`,
    `Patientin/Patient: ${a.patientName.nachname}, ${a.patientName.vorname}, geb. ${a.geburtsdatum}`,
    '',
    ...a.gruppen.flatMap((g) => [
      g.bezeichnung,
      ...g.werte.map(
        (w) =>
          `   ${w.bezeichnung}: ${String(w.wert).replace('.', ',')} ${w.einheit}   (Ref. ${w.referenzText})`,
      ),
    ]),
    '',
    ...(a.beurteilung ? [`Beurteilung: ${a.beurteilung}`] : []),
    `Freigegeben von ${a.freigebendePerson}`,
  ]);
}

function pdfDokument(
  teil: Omit<Dokument, 'mimeType' | 'formatCode' | 'groesseBytes' | 'inhalt' | 'datei'> & {
    datei: string;
  },
): Dokument {
  return {
    ...teil,
    mimeType: 'application/pdf',
    formatCode: PDF_A1,
    groesseBytes: teil.datei.length,
    inhalt: null,
  };
}

/**
 * ✦ Markiert Einträge der zentralen Listen als relevant für die Patient Summary — so, wie sie die
 * einstellende Einrichtung beim Anlegen markiert hätte.
 */
function alsRelevantMarkieren(kvnr: string, ...kennungen: string[]): void {
  const ablage = bestandFuer(kvnr).diagnosedienst;
  ablage.forEach((r, i) => {
    if (kennungen.includes(String(r.id))) ablage[i] = psRelevanzSetzen(r, true);
  });
}

/** Registrierter formatCode aus dem übernommenen Katalog — nie von Hand gesetzt. */
function registriert(formatCode: string): Kodewert {
  const eintrag = dokumenttypen.find((d) => d.formatCode === formatCode);
  if (!eintrag) throw new Error(`Nicht registriert: ${formatCode}`);
  return kode(eintrag.formatCode, eintrag.formatSystem ?? '', eintrag.formatAnzeige);
}

const ATC = 'http://fhir.de/CodeSystem/bfarm/atc';
const SCT = 'http://snomed.info/sct';
const ICD = 'http://fhir.de/CodeSystem/bfarm/icd-10-gm';

/* ---------- Strukturierter Entlassbrief (Vorgriff auf die Weiterentwicklung) ---------- */

function entlassbriefHoffmann(): Record<string, unknown> {
  const pid = `pat-${KVNR.hoffmann}`;
  const diagnose = (
    id: string,
    icd: string,
    sct: string,
    text: string,
    status: string,
    kategorie: string,
    beginn: string,
  ): Ressource => ({
    resourceType: 'Condition',
    id,
    clinicalStatus: {
      coding: [
        { system: 'http://terminology.hl7.org/CodeSystem/condition-clinical', code: status },
      ],
    },
    verificationStatus: {
      coding: [
        { system: 'http://terminology.hl7.org/CodeSystem/condition-ver-status', code: 'confirmed' },
      ],
    },
    category: [
      {
        coding: [
          { system: 'http://terminology.hl7.org/CodeSystem/condition-category', code: kategorie },
        ],
      },
    ],
    code: {
      coding: [
        { system: ICD, code: icd, display: text },
        { system: SCT, code: sct },
      ],
      text,
    },
    subject: { reference: `Patient/${pid}` },
    onsetDateTime: beginn,
    recordedDate: '2026-07-17',
    recorder: { display: 'Dr. med. Lea Wagner' },
  });
  const allergie = (
    id: string,
    sct: string,
    atc: string | null,
    text: string,
    typ: string,
    krit: string,
    man: [string, string],
  ): Ressource => ({
    resourceType: 'AllergyIntolerance',
    id,
    clinicalStatus: {
      coding: [
        {
          system: 'http://terminology.hl7.org/CodeSystem/allergyintolerance-clinical',
          code: 'active',
        },
      ],
    },
    verificationStatus: {
      coding: [
        {
          system: 'http://terminology.hl7.org/CodeSystem/allergyintolerance-verification',
          code: 'confirmed',
        },
      ],
    },
    type: typ,
    category: ['medication'],
    criticality: krit,
    code: {
      coding: [
        { system: SCT, code: sct, display: text },
        ...(atc ? [{ system: ATC, code: atc }] : []),
      ],
      text,
    },
    patient: { reference: `Patient/${pid}` },
    recordedDate: '2026-07-17',
    recorder: { display: 'Dr. med. Lea Wagner' },
    reaction: [
      {
        manifestation: [{ coding: [{ system: SCT, code: man[0], display: man[1] }], text: man[1] }],
      },
    ],
  });
  const ressourcen: Ressource[] = [
    {
      resourceType: 'Composition',
      id: 'comp-kh-e',
      status: 'final',
      // LOINC 18842-5 „Discharge summary". Profilkonformität zu MIO KH-E nicht behauptet.
      type: {
        coding: [{ system: 'http://loinc.org', code: '18842-5', display: 'Discharge summary' }],
      },
      subject: { reference: `Patient/${pid}` },
      date: '2026-07-17',
      author: [{ display: 'Dr. med. Lea Wagner, Klinikum Sonnenschein' }],
      title: 'Entlassbrief stationäre Behandlung',
    },
    {
      resourceType: 'Patient',
      id: pid,
      identifier: [{ system: 'http://fhir.de/sid/gkv/kvid-10', value: KVNR.hoffmann }],
    },
    diagnose(
      'kh-cond-1',
      'I48.1',
      '440028005',
      'Vorhofflimmern, persistierend',
      'active',
      'problem-list-item',
      '2026-07-17',
    ),
    diagnose(
      'kh-cond-2',
      'E11.74',
      '44054006',
      'Diabetes mellitus, Typ 2: Mit multiplen Komplikationen',
      'active',
      'problem-list-item',
      '2026-07-17',
    ),
    diagnose(
      'kh-cond-3',
      'N39.0',
      '68566005',
      'Harnwegsinfektion, Lokalisation nicht näher bezeichnet',
      'active',
      'encounter-diagnosis',
      '2026-07-12',
    ),
    allergie('kh-allg-1', '764146007', 'J01C', 'Penicillin', 'allergy', 'high', [
      '247471006',
      'Makulopapulöses Exanthem',
    ]),
    allergie('kh-allg-2', '426722004', 'V08A', 'Iodhaltiges Kontrastmittel', 'intolerance', 'low', [
      '422587007',
      'Übelkeit',
    ]),
    {
      resourceType: 'Procedure',
      id: 'kh-proc-1',
      status: 'completed',
      code: {
        coding: [
          {
            system: 'http://fhir.de/CodeSystem/bfarm/ops',
            code: '8-640',
            display: 'Kardiale Defibrillation und Kardioversion',
          },
        ],
        text: 'Kardiale Defibrillation und Kardioversion',
      },
      subject: { reference: `Patient/${pid}` },
      performedDateTime: '2026-07-18',
    },
  ];
  return {
    resourceType: 'Bundle',
    type: 'document',
    timestamp: '2026-07-17T14:00:00',
    entry: ressourcen.map((r) => ({ fullUrl: `urn:uuid:${r.id}`, resource: r })),
  };
}

/* ---------- Medikation ---------- */

/**
 * Eine Verordnung mit Abgabe, wie sie der E-Rezept-Fachdienst in die eML stellt: Arzneimittel,
 * Verordnung, Abgabe und die daraus abgeleitete Medikationsinformation (Kontext PRESCRIPTION).
 */
function verordnetUndAbgegeben(
  kvnr: string,
  id: string,
  atc: string,
  text: string,
  dosierung: string,
  datum: string,
  von: string,
  wer: Handelnde,
): Ressource {
  const zeit = `${datum}T16:00:00`;
  const ablage = bestandFuer(kvnr).medikation;
  const medication: Ressource = {
    resourceType: 'Medication',
    id: `med-${id}`,
    meta: { versionId: '1', lastUpdated: zeit, profile: [PROFIL.medication] },
    status: 'active',
    code: { coding: [{ system: ATC, code: atc, version: '2026', display: text }], text },
  };
  const verordnung: Ressource = {
    resourceType: 'MedicationRequest',
    id: `vo-${id}`,
    meta: { versionId: '1', lastUpdated: zeit, profile: [PROFIL.verordnung] },
    status: 'completed',
    intent: 'filler-order',
    medicationReference: { reference: `Medication/med-${id}` },
    subject: subjektFuer(kvnr),
    authoredOn: datum,
    requester: { display: von },
    dosageInstruction: [{ text: dosierung }],
  };
  const abgabe: Ressource = {
    resourceType: 'MedicationDispense',
    id: `ab-${id}`,
    meta: { versionId: '1', lastUpdated: zeit, profile: [PROFIL.abgabe] },
    status: 'completed',
    medicationReference: { reference: `Medication/med-${id}` },
    subject: subjektFuer(kvnr),
    whenHandedOver: datum,
    performer: [{ actor: { display: APOTHEKE } }],
    authorizingPrescription: [{ reference: `MedicationRequest/vo-${id}` }],
  };
  const aussage: Ressource = {
    resourceType: 'MedicationStatement',
    id: `eml-${id}`,
    meta: { versionId: '1', lastUpdated: zeit, profile: [PROFIL.aussage] },
    extension: [{ url: EXT.kontext, valueCode: 'PRESCRIPTION' }],
    status: 'unknown',
    medicationReference: { reference: `Medication/med-${id}` },
    subject: subjektFuer(kvnr),
    effectivePeriod: { start: datum },
    dateAsserted: zeit,
    derivedFrom: [
      { reference: `MedicationRequest/vo-${id}` },
      { reference: `MedicationDispense/ab-${id}` },
    ],
    dosage: [{ text: dosierung }],
  };
  ablage.push(medication, verordnung, abgabe, aussage);
  aktivitaetAnlegen(
    ablage,
    [
      versionierterVerweis(medication),
      versionierterVerweis(verordnung),
      versionierterVerweis(abgabe),
      versionierterVerweis(aussage),
    ],
    wer,
    'CREATE',
    zeit,
  );
  return aussage;
}

/**
 * Ein eMP-Eintrag (MedicationRequest mit intent plan), verknüpft mit dem eML-Eintrag, aus dem
 * er stammt — wie nach `$add-emp-entry` und `$link-emp`. Die Chronologie schreibt der Aufrufer
 * fort, einmal für alle Einträge.
 */
function planeintrag(
  kvnr: string,
  aussage: Ressource,
  text: string,
  atc: string,
  dosierung: string,
  grund: string,
  wer: Handelnde,
  datum: string,
): void {
  const zeit = `${datum}T16:00:00`;
  const ablage = bestandFuer(kvnr).medikation;
  const id = `emp-${String(aussage.id).replace(/^eml-/, '')}`;
  const mittel: Ressource = {
    resourceType: 'Medication',
    id: `empmed-${String(aussage.id).replace(/^eml-/, '')}`,
    meta: { versionId: '1', lastUpdated: zeit, profile: [PROFIL.empMedication] },
    extension: [{ url: EXT.kontext, valueCode: 'EMP' }],
    status: 'active',
    code: { coding: [{ system: ATC, code: atc, version: '2026', display: text }], text },
  };
  const eintrag: Ressource = {
    resourceType: 'MedicationRequest',
    id,
    meta: { versionId: '1', lastUpdated: zeit, profile: [PROFIL.empEintrag] },
    extension: [
      { url: EXT.kontext, valueCode: 'EMP' },
      {
        url: EXT.herkunftsmittel,
        valueReference: { reference: `Medication/${String(mittel.id)}` },
      },
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
    ],
    identifier: [{ system: EMP_IDENTIFIER, value: id }],
    status: 'active',
    intent: 'plan',
    medicationReference: aussage['medicationReference'],
    subject: subjektFuer(kvnr),
    authoredOn: datum,
    reasonCode: [{ text: grund }],
    dosageInstruction: [{ text: dosierung }],
  };
  aussage['basedOn'] = [{ reference: `MedicationRequest/${id}` }];
  ablage.push(mittel, eintrag);
  aktivitaetAnlegen(
    ablage,
    [versionierterVerweis(eintrag), versionierterVerweis(mittel)],
    wer,
    'CREATE',
    zeit,
  );
}

/* ---------- Diagnose-Service (✦ Vorschlag, ADR 0018) ---------- */

const sct = (code: string, anzeige: string) => ({ system: CODESYSTEM.snomed, code, anzeige });

/** Eintrag der Diagnosenliste, gebaut aus dem Domänentyp — dieselbe Abbildung wie im Praxissystem. */
function diagnoseEintrag(
  kvnr: string,
  teil: Partial<Diagnose> & Pick<Diagnose, 'code' | 'bezeichnung' | 'beginn'>,
  wer: string,
): Ressource {
  const d: Diagnose = {
    id: 'vorlage',
    patientId: `pat-${kvnr}`,
    fallId: null,
    snomed: null,
    alphaId: null,
    zusatzkennzeichen: 'G',
    seitenlokalisation: null,
    diagnosesicherheit: 'gesichert',
    art: 'dauer',
    klinischerStatus: 'aktiv',
    schweregrad: null,
    koerperstelle: null,
    ende: null,
    festgestelltAm: teil.beginn,
    dokumentiertAm: teil.beginn,
    feststellendePerson: wer,
    notiz: null,
    epaId: null,
    epaFassung: null,
    herkunft: {
      bestand: 'epa',
      quelle: '',
      zeitpunkt: `${teil.beginn}T12:00:00`,
      verantwortlich: wer,
      dokumentId: null,
    },
    ...teil,
  };
  const r = diagnoseNachFhir(d, kvnr);
  delete r.id;
  delete r.meta;
  return r;
}

function allergieEintrag(
  kvnr: string,
  teil: Partial<Allergie> & Pick<Allergie, 'substanz'>,
  wer: string,
): Ressource {
  const a: Allergie = {
    id: 'vorlage',
    patientId: `pat-${kvnr}`,
    snomed: null,
    typ: 'Allergie',
    kategorien: ['Medikation'],
    gewissheit: 'bestätigt',
    kritikalitaet: 'Risiko nicht einschätzbar',
    reaktionen: [],
    klinischerStatus: 'aktiv',
    beginn: null,
    ende: null,
    dokumentiertAm: '2026-07-17',
    feststellendePerson: wer,
    notiz: null,
    epaId: null,
    epaFassung: null,
    herkunft: {
      bestand: 'epa',
      quelle: '',
      zeitpunkt: '2026-07-17T12:00:00',
      verantwortlich: wer,
      dokumentId: null,
    },
    ...teil,
  };
  const r = allergieNachFhir(a, kvnr);
  delete r.id;
  delete r.meta;
  return r;
}

/* ---------- Impfliste (✦ Vorschlag, ADR 0026) ---------- */

const VORPRAXIS: Handelnde = {
  telematikId: 'DEMO-PRAXIS-NORDSTADT',
  anzeige: 'Hausarztpraxis Nordstadt',
};

/** Eintrag der Impfliste aus dem Katalog — dieselbe Abbildung wie im Praxissystem. */
function impfEintrag(
  kvnr: string,
  atc: string,
  datum: string,
  geimpftVon: string,
  teil: Partial<Impfung> = {},
): Ressource {
  const stoff = impfstoffe.find((i) => i.atc === atc);
  if (!stoff) throw new Error(`Kein Impfstoff ${atc} im Katalog.`);
  const r = impfungNachFhir(
    {
      id: 'vorlage',
      patientId: `pat-${kvnr}`,
      impfstoff: {
        bezeichnung: stoff.bezeichnung,
        atc: stoff.atc,
        atcVersion: stoff.atcVersion,
        pzn: stoff.pzn,
      },
      zielkrankheiten: stoff.zielkrankheiten.map((z) => sct(z.code, z.anzeige)),
      datum,
      dosis: null,
      charge: null,
      geimpftVon,
      status: 'erfolgt',
      herkunft: {
        bestand: 'epa',
        quelle: '',
        zeitpunkt: `${datum}T10:00:00`,
        verantwortlich: geimpftVon,
        dokumentId: null,
      },
      epaId: null,
      notiz: null,
      ...teil,
    },
    kvnr,
  );
  delete r.id;
  return r;
}

/**
 * Demo-Steuerung: Eine andere Einrichtung trägt jetzt in die Listen ein — damit „neu seit dem
 * letzten Aufruf" vorführbar ist. Die Kardiologie stellt eine Diagnose ein und markiert sie; ab
 * Stufe 2 impft die Apotheke gegen Grippe.
 */
export function fremdeEintraegeAnlegen(kvnr: string, mitImpfliste: boolean): string[] {
  const kardiologie: Handelnde = {
    telematikId: 'DEMO-KARDIOLOGIE-AM-WALL',
    anzeige: 'Kardiologische Praxis am Wall',
  };
  const apotheke: Handelnde = {
    telematikId: 'DEMO-APOTHEKE-STADTGARTEN',
    anzeige: 'Stadtgarten-Apotheke',
  };
  const heute = jetzt();
  const behrens = 'Dr. med. Jonas Behrens';
  const { eintrag } = eintragAnlegen(
    kvnr,
    psRelevanzSetzen(
      diagnoseEintrag(
        kvnr,
        {
          code: 'I50.12',
          bezeichnung: 'Linksherzinsuffizienz: Mit Beschwerden bei stärkerer Belastung',
          snomed: sct('84114007', 'Herzinsuffizienz'),
          beginn: heute.slice(0, 10),
        },
        behrens,
      ),
      true,
    ),
    kardiologie,
    heute,
  );
  listeFortschreiben(kvnr, 'Condition', kardiologie, heute);
  const angelegt = [`Condition/${String(eintrag.id)}`];
  if (mitImpfliste) {
    const impfung = eintragAnlegen(
      kvnr,
      impfEintrag(
        kvnr,
        'J07BB02',
        heute.slice(0, 10),
        'Apothekerin Lisa Kaya, Stadtgarten-Apotheke',
        {
          charge: 'FLU-26-0815',
          dosis: 1,
        },
      ),
      apotheke,
      heute,
    );
    listeFortschreiben(kvnr, 'Immunization', apotheke, heute);
    angelegt.push(`Immunization/${String(impfung.eintrag.id)}`);
  }
  return angelegt;
}

/* ---------- Aufbau ---------- */

export function startbestandAufbauen(): void {
  bestaendeLeeren();
  befugnisseLeeren();

  /*
   * Befugnisse aus früheren Kartenlesungen (Konzept 3.1.3: 90 Tage ab Stecken der eGK).
   * Das Klinikum hat Frau Hoffmann bei der Aufnahme am 12.07. eingelesen, die Praxis
   * Herrn Krüger und Frau Yildiz zu Quartalsbeginn. Frau Hoffmann ist neu in der Praxis —
   * dort gibt es noch keine Befugnis.
   */
  befugnisErteilen(
    KVNR.hoffmann,
    KLINIKUM.telematikId,
    new Date('2026-07-12T10:00:00'),
    'Startbestand',
  );
  befugnisErteilen(
    KVNR.krueger,
    PRAXIS.telematikId,
    new Date('2026-07-14T09:02:00'),
    'Startbestand',
  );
  befugnisErteilen(
    KVNR.yildiz,
    PRAXIS.telematikId,
    new Date('2026-07-02T08:40:00'),
    'Startbestand',
  );

  // --- Frau Hoffmann ---
  const hoffmann = bestandFuer(KVNR.hoffmann);
  hoffmann.demographie = { vorname: 'Renate', nachname: 'Hoffmann', geburtsdatum: '1958-03-14' };

  // Entlassbrief: im Release 3.1.3 als PDF, in der Weiterentwicklung strukturiert.
  const entlassbrief = entlassbriefHoffmann();
  const briefkopf = {
    titel: 'Entlassbrief stationäre Behandlung',
    classCode: kode('BRI', OID_KLASSE, 'Brief'),
    typeCode: kode('BERI', OID_TYP, 'Arztberichte'),
    ordner: null,
    erstellt: '2026-07-17T14:00:00',
    autor: 'Dr. med. Lea Wagner',
    einrichtung: 'Klinikum Sonnenschein',
  };
  const brieftext = [
    'Stationärer Aufenthalt 12.07.2026 bis 18.07.2026',
    '',
    'Diagnosen',
    '   I48.1 Vorhofflimmern, persistierend (Erstdiagnose)',
    '   E11.74 Diabetes mellitus Typ 2 mit multiplen Komplikationen',
    '   N39.0 Harnwegsinfektion, behoben',
    '',
    'Allergien und Unverträglichkeiten',
    '   Penicillin: makulopapulöses Exanthem unter Ampicillin i. v. (14.07.2026)',
    '   Iodhaltiges Kontrastmittel: Übelkeit (Unverträglichkeit)',
    '',
    'Entlassmedikation',
    '   Apixaban 5 mg 1-0-1, Metformin 1000 mg 1-0-1, Ramipril 5 mg 1-0-0,',
    '   Bisoprolol 2,5 mg 1-0-0, Atorvastatin 40 mg 0-0-1',
    '',
    'Dr. med. Lea Wagner, Klinik für Innere Medizin',
  ];
  const briefPdf = pdfErzeugen('Entlassbrief — Klinikum Sonnenschein', brieftext);
  hoffmann.dokumente.push(
    pdfDokument({
      ...briefkopf,
      id: 'kh-e-2026-07-17-pdf',
      uniqueId: abgeleiteteUniqueId('kh-e-2026-07-17-pdf'),
      datei: briefPdf,
      text: brieftext.join(' '),
      nurIn: 'release-3.1.3',
    }),
    {
      ...briefkopf,
      id: 'kh-e-2026-07-17',
      uniqueId: abgeleiteteUniqueId('kh-e-2026-07-17'),
      formatCode: null,
      mimeType: 'application/fhir+json',
      groesseBytes: JSON.stringify(entlassbrief).length,
      inhalt: entlassbrief,
      nurIn: 'weiterentwicklung',
    },
  );

  // Laborbefund: im Release 3.1.3 als PDF, in der Vorschau auf ePA 3.2 strukturiert (dgLP).
  const labor = laborbefundBauen(BEFUND_HOFFMANN);
  const laborkopf = {
    titel: 'Laborgesamtbefund',
    classCode: kode('BEF', OID_KLASSE, 'Befundbericht'),
    typeCode: kode('BEFU', OID_TYP, 'Ergebnisse Diagnostik'),
    ordner: null,
    erstellt: '2026-08-12T11:00:00',
    autor: 'Dr. rer. nat. Kai Petersen',
    einrichtung: 'Laborgemeinschaft Nordwest',
  };
  const laborPdf = laborbefundAlsPdf(BEFUND_HOFFMANN);
  hoffmann.dokumente.push(
    pdfDokument({
      ...laborkopf,
      id: 'labor-2026-08-12-pdf',
      uniqueId: abgeleiteteUniqueId('labor-2026-08-12-pdf'),
      datei: laborPdf,
      text: laborPdf,
      nurIn: 'release-3.1.3',
    }),
    {
      ...laborkopf,
      id: 'labor-2026-08-12',
      uniqueId: uuidAlsOid(BEFUND_HOFFMANN.uuid),
      formatCode: null,
      mimeType: 'application/fhir+json',
      groesseBytes: JSON.stringify(labor).length,
      inhalt: labor,
      nurIn: 'weiterentwicklung',
    },
  );

  // Vorbefund aus der Vorbehandlung (März): Verlauf der Nierenfunktion, in beiden Formen.
  const laborMaerz = laborbefundBauen(BEFUND_HOFFMANN_MAERZ);
  const laborMaerzKopf = {
    ...laborkopf,
    erstellt: '2026-03-18T14:20:00',
    autor: 'Dr. med. Hanna Voss',
    einrichtung: 'MVZ Labor Oldenburg',
  };
  const laborMaerzPdf = laborbefundAlsPdf(BEFUND_HOFFMANN_MAERZ);
  hoffmann.dokumente.push(
    pdfDokument({
      ...laborMaerzKopf,
      id: 'labor-2026-03-18-pdf',
      uniqueId: abgeleiteteUniqueId('labor-2026-03-18-pdf'),
      datei: laborMaerzPdf,
      text: laborMaerzPdf,
      nurIn: 'release-3.1.3',
    }),
    {
      ...laborMaerzKopf,
      id: 'labor-2026-03-18',
      uniqueId: uuidAlsOid(BEFUND_HOFFMANN_MAERZ.uuid),
      formatCode: null,
      mimeType: 'application/fhir+json',
      groesseBytes: JSON.stringify(laborMaerz).length,
      inhalt: laborMaerz,
      nurIn: 'weiterentwicklung',
    },
  );

  // eArztbrief der Kardiologie: registriertes Format, aber ohne strukturierte Einträge. Die
  // Echokardiographie steht nur im Text — die Patient Summary kennt sie nicht.
  const kardioText = [
    'Kardiologische Praxis am Wall — Dr. med. Jonas Behrens',
    'Befundbericht vom 03.06.2026, Patientin Renate Hoffmann, geb. 14.03.1958',
    'Anlass: Belastungsdyspnoe, Palpitationen',
    'Echokardiographie: LVEF 45 %, leichte Mitralinsuffizienz, linker Vorhof dilatiert',
    'Langzeit-EKG: intermittierendes Vorhofflimmern',
    'Empfehlung: Antikoagulation prüfen, Kontrolle in 6 Monaten',
  ];
  const kardioXml = `<?xml version="1.0" encoding="UTF-8"?>\n<ClinicalDocument xmlns="urn:hl7-org:v3"><title>Befundbericht Kardiologie</title><component><structuredBody><component><section><text>${kardioText
    .map((z) => `<paragraph>${z}</paragraph>`)
    .join('')}</text></section></component></structuredBody></component></ClinicalDocument>`;
  const kardioBytes = utf8AlsBytezeichen(kardioXml);
  hoffmann.dokumente.push({
    id: 'eab-2026-06-03',
    uniqueId: abgeleiteteUniqueId('eab-2026-06-03'),
    titel: 'Befundbericht Kardiologie',
    classCode: kode('BRI', OID_KLASSE, 'Brief'),
    typeCode: kode('BERI', OID_TYP, 'Arztberichte'),
    formatCode: registriert('urn:gematik:ig:Arztbrief:r3.1'),
    mimeType: 'application/xml',
    ordner: null,
    erstellt: '2026-06-03T10:30:00',
    autor: 'Dr. med. Jonas Behrens',
    einrichtung: 'Kardiologische Praxis am Wall',
    groesseBytes: kardioBytes.length,
    inhalt: null,
    datei: kardioBytes,
    text: kardioText.join(' '),
  });

  // Medikation: Verordnungen und Plan vom Klinikum, Abgaben aus der Apotheke.
  const mittel: [string, string, string, string, string][] = [
    ['med-1', 'B01AF02', 'Apixaban 5 mg Filmtabletten', '1-0-1-0', 'Vorhofflimmern'],
    ['med-2', 'A10BA02', 'Metformin 1000 mg Filmtabletten', '1-0-1-0', 'Diabetes mellitus Typ 2'],
    ['med-3', 'C09AA05', 'Ramipril 5 mg Tabletten', '1-0-0-0', 'Arterielle Hypertonie'],
    ['med-4', 'C07AB07', 'Bisoprolol 2,5 mg Filmtabletten', '1-0-0-0', 'Vorhofflimmern'],
    ['med-5', 'C10AA05', 'Atorvastatin 40 mg Filmtabletten', '0-0-1-0', 'Hyperlipidämie'],
  ];
  mittel.forEach(([id, atc, text, dosierung, grund]) => {
    const aussage = verordnetUndAbgegeben(
      KVNR.hoffmann,
      `h-${id}`,
      atc,
      text,
      dosierung,
      '2026-07-18',
      'Dr. med. Lea Wagner, Klinikum Sonnenschein',
      KLINIKUM,
    );
    // Metformin fehlt im Plan bewusst — an dieser Lücke wird die ärztliche Ebene sichtbar.
    if (atc !== 'A10BA02') {
      planeintrag(KVNR.hoffmann, aussage, text, atc, dosierung, grund, KLINIKUM, '2026-07-18');
    }
  });
  chronologieAnlegen(bestandFuer(KVNR.hoffmann).medikation, EMP, KLINIKUM, '2026-07-18T16:05:00');

  /*
   * Diagnose-Service (✦ Vorschlag): Das Klinikum hat bei der Entlassung Allergien und
   * Diagnosen in die Listen der ePA eingestellt — nach österreichischem Muster aus dem KIS
   * heraus, zusätzlich zum Entlassbrief.
   */
  const wagner = 'Dr. med. Lea Wagner';
  const beiEntlassung = '2026-07-17T14:05:00';
  // Jeder Eintrag verweist auf den Entlassbrief, aus dem er stammt — Grundlage der Herkunftszeile.
  const ausEntlassbrief = {
    bestand: 'epa' as const,
    quelle: 'Entlassbrief stationäre Behandlung, Klinikum Sonnenschein',
    zeitpunkt: beiEntlassung,
    verantwortlich: wagner,
    // Verweis auf die DocumentReference des strukturierten Entlassbriefs (entryUUID).
    dokumentId: eintragsUuid({ id: 'kh-e-2026-07-17' } as Dokument),
  };
  eintragAnlegen(
    KVNR.hoffmann,
    diagnoseEintrag(
      KVNR.hoffmann,
      {
        code: 'I48.1',
        bezeichnung: 'Vorhofflimmern, persistierend',
        snomed: sct('440028005', 'Vorhofflimmern, persistierend'),
        beginn: '2026-07-12',
        herkunft: ausEntlassbrief,
      },
      wagner,
    ),
    KLINIKUM,
    beiEntlassung,
    'cond-h-1',
  );
  eintragAnlegen(
    KVNR.hoffmann,
    diagnoseEintrag(
      KVNR.hoffmann,
      {
        code: 'E11.74',
        bezeichnung:
          'Diabetes mellitus, Typ 2: Mit multiplen Komplikationen, nicht als entgleist bezeichnet',
        snomed: sct('44054006', 'Diabetes mellitus Typ 2'),
        beginn: '2011-05-12',
        festgestelltAm: '2011-05-12',
        dokumentiertAm: '2026-07-17',
        herkunft: ausEntlassbrief,
      },
      wagner,
    ),
    KLINIKUM,
    beiEntlassung,
    'cond-h-2',
  );
  eintragAnlegen(
    KVNR.hoffmann,
    diagnoseEintrag(
      KVNR.hoffmann,
      {
        code: 'N39.0',
        bezeichnung: 'Harnwegsinfektion, Lokalisation nicht näher bezeichnet',
        snomed: sct('68566005', 'Harnwegsinfektion'),
        art: 'akut',
        klinischerStatus: 'behoben',
        beginn: '2026-07-12',
        ende: '2026-07-18',
        herkunft: ausEntlassbrief,
      },
      wagner,
    ),
    KLINIKUM,
    beiEntlassung,
    'cond-h-3',
  );
  // Aktuell, aber nicht relevant für die Patient Summary: steht in der Liste, nicht in der Übersicht.
  eintragAnlegen(
    KVNR.hoffmann,
    diagnoseEintrag(
      KVNR.hoffmann,
      {
        code: 'K59.0',
        bezeichnung: 'Obstipation',
        snomed: sct('14760008', 'Obstipation'),
        art: 'akut',
        beginn: '2026-07-15',
        herkunft: ausEntlassbrief,
      },
      wagner,
    ),
    KLINIKUM,
    beiEntlassung,
    'cond-h-4',
  );
  eintragAnlegen(
    KVNR.hoffmann,
    allergieEintrag(
      KVNR.hoffmann,
      {
        substanz: 'Penicillin',
        snomed: sct('764146007', 'Penicillin'),
        kritikalitaet: 'hohes Risiko',
        beginn: '2026-07-14',
        reaktionen: [
          {
            manifestationen: [sct('247471006', 'Makulopapulöses Exanthem')],
            schweregrad: 'mittelschwer',
            datum: '2026-07-14',
            expositionsweg: sct('47625008', 'Intravenöser Verabreichungsweg'),
          },
        ],
        notiz: 'Exanthem am zweiten Tag unter Ampicillin i. v.; abgesetzt, rasch rückläufig.',
        herkunft: ausEntlassbrief,
      },
      wagner,
    ),
    KLINIKUM,
    beiEntlassung,
    'allg-h-1',
  );
  eintragAnlegen(
    KVNR.hoffmann,
    allergieEintrag(
      KVNR.hoffmann,
      {
        substanz: 'Iodhaltiges Kontrastmittel',
        snomed: sct('426722004', 'Iodhaltiges Kontrastmittel'),
        typ: 'Unverträglichkeit',
        kritikalitaet: 'niedriges Risiko',
        beginn: '2026-07-13',
        reaktionen: [
          {
            manifestationen: [sct('422587007', 'Übelkeit')],
            schweregrad: 'leicht',
            datum: '2026-07-13',
            expositionsweg: sct('47625008', 'Intravenöser Verabreichungsweg'),
          },
        ],
        herkunft: ausEntlassbrief,
      },
      wagner,
    ),
    KLINIKUM,
    beiEntlassung,
    'allg-h-2',
  );

  // Relevant für die Patient Summary: die beiden Dauerdiagnosen und beide Allergien. Die
  // behobene Harnwegsinfektion und die Obstipation bleiben in der Liste, aber nicht in der Übersicht.
  alsRelevantMarkieren(KVNR.hoffmann, 'cond-h-1', 'cond-h-2', 'allg-h-1', 'allg-h-2');

  // Impfliste (✦): Impfungen der früheren Hausarztpraxis; die Zoster-Serie ist unvollständig.
  const lang = 'Dr. med. Petra Lang, Hausarztpraxis Nordstadt';
  const impfungen: [string, string, string, Partial<Impfung>][] = [
    ['imm-h-1', 'J07AM51', '2019-05-14', { charge: 'TD-19-4471' }],
    ['imm-h-2', 'J07AL02', '2024-10-08', { charge: 'PNC-24-1102' }],
    ['imm-h-3', 'J07BK03', '2025-03-11', { dosis: 1, charge: 'HZ-25-0311' }],
    ['imm-h-4', 'J07BB02', '2025-10-21', { charge: 'FLU-25-2210' }],
    ['imm-h-5', 'J07BN01', '2025-10-21', { charge: 'CV-25-7781' }],
  ];
  for (const [id, atc, datum, teil] of impfungen) {
    eintragAnlegen(
      KVNR.hoffmann,
      impfEintrag(KVNR.hoffmann, atc, datum, lang, teil),
      VORPRAXIS,
      `${datum}T10:00:00`,
      id,
    );
  }
  listeFortschreiben(KVNR.hoffmann, 'Immunization', VORPRAXIS, '2025-10-21T10:05:00');
  listeFortschreiben(KVNR.hoffmann, 'Condition', KLINIKUM, beiEntlassung);
  listeFortschreiben(KVNR.hoffmann, 'AllergyIntolerance', KLINIKUM, beiEntlassung);

  // --- Frau Yildiz ---
  const yildiz = bestandFuer(KVNR.yildiz);
  yildiz.demographie = { vorname: 'Meral', nachname: 'Yildiz', geburtsdatum: '1969-06-25' };
  const laborY = laborbefundBauen(BEFUND_YILDIZ);
  const laborkopfY = {
    titel: 'Laborbefund Schilddrüse',
    classCode: kode('BEF', OID_KLASSE, 'Befundbericht'),
    typeCode: kode('BEFU', OID_TYP, 'Ergebnisse Diagnostik'),
    ordner: null,
    erstellt: '2026-07-02T13:40:00',
    autor: 'Dr. rer. nat. Kai Petersen',
    einrichtung: 'Laborgemeinschaft Nordwest',
  };
  const laborPdfY = laborbefundAlsPdf(BEFUND_YILDIZ);
  yildiz.dokumente.push(
    pdfDokument({
      ...laborkopfY,
      id: 'labor-2026-07-02-pdf',
      uniqueId: abgeleiteteUniqueId('labor-2026-07-02-pdf'),
      datei: laborPdfY,
      text: laborPdfY,
      nurIn: 'release-3.1.3',
    }),
    {
      ...laborkopfY,
      id: 'labor-2026-07-02',
      uniqueId: uuidAlsOid(BEFUND_YILDIZ.uuid),
      formatCode: null,
      mimeType: 'application/fhir+json',
      groesseBytes: JSON.stringify(laborY).length,
      inhalt: laborY,
      nurIn: 'weiterentwicklung',
    },
  );
  const levothyroxin = verordnetUndAbgegeben(
    KVNR.yildiz,
    'y-1',
    'H03AA01',
    'Levothyroxin 75 µg Tabletten',
    '1-0-0-0',
    '2026-07-02',
    'Dr. med. Anna Brandt, Hausarztpraxis am Stadtgarten',
    PRAXIS,
  );
  planeintrag(
    KVNR.yildiz,
    levothyroxin,
    'Levothyroxin 75 µg Tabletten',
    'H03AA01',
    '1-0-0-0',
    'Hypothyreose',
    PRAXIS,
    '2026-07-02',
  );
  chronologieAnlegen(bestandFuer(KVNR.yildiz).medikation, EMP, PRAXIS, '2026-07-02T16:05:00');

  // Die Praxis führt Frau Yildiz' Dauerdiagnosen seit dem Quartalsbeginn in der Diagnosenliste.
  const brandt = 'Dr. med. Anna Brandt';
  eintragAnlegen(
    KVNR.yildiz,
    diagnoseEintrag(
      KVNR.yildiz,
      {
        code: 'E03.9',
        bezeichnung: 'Hypothyreose, nicht näher bezeichnet',
        snomed: sct('40930008', 'Hypothyreose'),
        beginn: '2019-01-22',
        dokumentiertAm: '2026-07-02',
      },
      brandt,
    ),
    PRAXIS,
    '2026-07-02T09:05:00',
    'cond-y-1',
  );
  eintragAnlegen(
    KVNR.yildiz,
    diagnoseEintrag(
      KVNR.yildiz,
      {
        code: 'I10.90',
        bezeichnung: 'Essentielle Hypertonie, ohne Angabe einer hypertensiven Krise',
        snomed: sct('59621000', 'Essentielle Hypertonie'),
        beginn: '2016-08-30',
        dokumentiertAm: '2026-07-02',
      },
      brandt,
    ),
    PRAXIS,
    '2026-07-02T09:06:00',
    'cond-y-2',
  );

  alsRelevantMarkieren(KVNR.yildiz, 'cond-y-1', 'cond-y-2');
  listeFortschreiben(KVNR.yildiz, 'Condition', PRAXIS, '2026-07-02T09:06:00');

  // --- Herr Krüger: leere Akte, Widerspruch gegen den Medikationsprozess ---
  const krueger = bestandFuer(KVNR.krueger);
  krueger.demographie = {
    vorname: 'Tobias',
    nachname: 'Krüger',
    geburtsdatum: '1992-11-02',
  };
  // Verordnungen gelangen weiter in die Akte, Einrichtungen sehen Liste und Plan aber nicht.
  krueger.widersprueche.medication = 'deny';
}

export type { Dokument };
