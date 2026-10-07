import type { Briefbaustein, Briefvorlage, Ressource } from '@demo-pvs/kern';

/**
 * Arzt- und Entlassbriefe des Startbestands. Alle Personen, Einrichtungen, Anschriften und
 * Befunde sind erfunden.
 *
 * **Wie Briefe heute in der ePA liegen.** Ganz überwiegend als PDF mit Fließtext:
 * - Der **Krankenhaus-Entlassbrief** folgt dem üblichen Aufbau — Anrede, Diagnosen, Anamnese,
 *   Befunde, Verlauf, Medikation, Empfehlungen, Gruß. Strukturierte Einträge trägt er nicht.
 * - Der **ambulante Arztbrief** folgt der Richtlinie elektronischer Brief der KBV (§ 383 SGB V,
 *   Fassung 17.05.2024, Abschnitt 2.1): Er besteht aus einer **PDF/A-Datei, die alle Inhalte
 *   enthält**, und einer XML-Datei nach dem VHitG-Leitfaden „Arztbrief" auf Basis von CDA R2
 *   (Version 1.50), deren `body` **leer sein darf**. In der Demo liegt deshalb nur das PDF in
 *   der Akte. ⚠ Ob und wie der CDA-Teil eines eArztbriefs in die ePA gelangt, ist nicht geprüft.
 *
 * **✦ Strukturierte Briefe ab „Weiterentwicklung 2".** Neue Briefe liegen dann zusätzlich als
 * FHIR-Dokument vor. Verbindliche Vorgaben gibt es dafür nicht; die Demo folgt dem
 * europäischen Vorbild: Gliederung und Abschnittscodes nach dem **HL7 Europe Hospital
 * Discharge Report** (`hl7.fhir.eu.hdr`, CI-Build 1.0.0 vom 30.09.2026, `composition-eu-hdr`),
 * Abschnittsfolge und Überschriften nach dem **MIO Krankenhaus-Entlassbrief 1.0.0**
 * (`KBV_PR_MIO_KHE_Composition`). Profilkonformität wird nicht behauptet.
 */

const SCT = 'http://snomed.info/sct';
const ICD = 'http://fhir.de/CodeSystem/bfarm/icd-10-gm';
const OPS = 'http://fhir.de/CodeSystem/bfarm/ops';
const ATC = 'http://fhir.de/CodeSystem/bfarm/atc';
const LOINC = 'http://loinc.org';

const u = (text: string): Briefbaustein => ({ art: 'ueberschrift', text });
const a = (text: string): Briefbaustein => ({ art: 'absatz', text });
const z = (text: string): Briefbaustein => ({ art: 'zeile', text });
const leer: Briefbaustein = { art: 'leer' };

/* ======================================================================================
 * Entlassbrief Klinikum Sonnenschein, Frau Hoffmann, Juli 2026
 * ==================================================================================== */

const KLINIKUM_KOPF = [
  'Klinikum Sonnenschein',
  'Klinik für Innere Medizin und Kardiologie · Chefarzt Prof. Dr. med. Martin Ehlers',
  'Am Sonnenhang 1 · 26000 Beispielstadt · Sekretariat Tel. 0000 1234-200 · Fax 0000 1234-209',
];

/** Diagnosen des Briefs — Text und Kodierung an einer Stelle, für PDF und FHIR. */
interface Briefdiagnose {
  id: string;
  icd: string;
  sct: string | null;
  text: string;
  zusatz: string;
  status: 'active' | 'resolved';
  kategorie: 'encounter-diagnosis' | 'problem-list-item';
  beginn: string;
}

const KH_DIAGNOSEN: Briefdiagnose[] = [
  {
    id: 'kh-cond-1',
    icd: 'I48.1',
    sct: '440028005',
    text: 'Vorhofflimmern, persistierend',
    zusatz: 'EHRA III, CHA2DS2-VASc-Score 4; paroxysmal bekannt seit 06/2026',
    status: 'active',
    kategorie: 'encounter-diagnosis',
    beginn: '2026-07-12',
  },
  {
    id: 'kh-cond-3',
    icd: 'N39.0',
    sct: '68566005',
    text: 'Harnwegsinfektion, Lokalisation nicht näher bezeichnet',
    zusatz: 'E. coli, unter Antibiose rückläufig',
    status: 'active',
    kategorie: 'encounter-diagnosis',
    beginn: '2026-07-12',
  },
  {
    id: 'kh-cond-2',
    icd: 'E11.74',
    sct: '44054006',
    text: 'Diabetes mellitus, Typ 2: Mit multiplen Komplikationen',
    zusatz: 'ED 2011, HbA1c 7,6 %',
    status: 'active',
    kategorie: 'problem-list-item',
    beginn: '2011-05-12',
  },
  {
    id: 'kh-cond-4',
    icd: 'I10.90',
    sct: '59621000',
    text: 'Essentielle Hypertonie',
    zusatz: '',
    status: 'active',
    kategorie: 'problem-list-item',
    beginn: '2009-02-03',
  },
  {
    id: 'kh-cond-5',
    icd: 'N18.3',
    sct: '433144002',
    text: 'Chronische Nierenkrankheit, Stadium 3',
    zusatz: 'eGFR 42 ml/min/1,73 m² bei Aufnahme',
    status: 'active',
    kategorie: 'problem-list-item',
    beginn: '2023-09-24',
  },
  {
    id: 'kh-cond-6',
    icd: 'E78.2',
    sct: '55822004',
    text: 'Gemischte Hyperlipidämie',
    zusatz: '',
    status: 'active',
    kategorie: 'problem-list-item',
    beginn: '2015-01-01',
  },
  {
    id: 'kh-cond-7',
    icd: 'Z95.0',
    sct: null,
    text: 'Vorhandensein eines kardialen elektronischen Gerätes',
    zusatz: 'Zweikammer-Herzschrittmacher seit 04/2019',
    status: 'active',
    kategorie: 'problem-list-item',
    beginn: '2019-04-02',
  },
  {
    id: 'kh-cond-8',
    icd: 'K59.09',
    sct: '14760008',
    text: 'Obstipation',
    zusatz: 'unter Macrogol rückläufig',
    status: 'resolved',
    kategorie: 'encounter-diagnosis',
    beginn: '2026-07-15',
  },
];

interface Briefprozedur {
  id: string;
  ops: string;
  text: string;
  zeitpunkt: string;
}

/** ⚠ OPS 3-222 und 3-052 nicht gegen den amtlichen Katalog geprüft. */
const KH_PROZEDUREN: Briefprozedur[] = [
  {
    id: 'kh-proc-1',
    ops: '8-640',
    text: 'Elektrische Kardioversion',
    zeitpunkt: '2026-07-17T10:30:00',
  },
  {
    id: 'kh-proc-2',
    ops: '3-052',
    text: 'Transösophageale Echokardiographie',
    zeitpunkt: '2026-07-17T09:15:00',
  },
  {
    id: 'kh-proc-3',
    ops: '3-222',
    text: 'CT-Angiographie des Thorax mit Kontrastmittel',
    zeitpunkt: '2026-07-13T15:40:00',
  },
];

interface Briefmittel {
  atc: string;
  text: string;
  dosierung: string;
}

const KH_ENTLASSMEDIKATION: Briefmittel[] = [
  { atc: 'B01AF02', text: 'Apixaban 5 mg Filmtabletten', dosierung: '1-0-1-0' },
  { atc: 'C07AB07', text: 'Bisoprolol 2,5 mg Filmtabletten', dosierung: '1-0-0-0' },
  { atc: 'C09AA05', text: 'Ramipril 5 mg Tabletten', dosierung: '1-0-0-0' },
  { atc: 'A10BA02', text: 'Metformin 1000 mg Filmtabletten', dosierung: '1-0-1-0' },
  { atc: 'C10AA05', text: 'Atorvastatin 40 mg Filmtabletten', dosierung: '0-0-1-0' },
];

/** Allergien, wie sie im Brief stehen — in PDF und FHIR-Erzähltext wortgleich. */
const KH_ALLERGIEZEILEN = [
  'Penicillin: makulopapulöses Exanthem unter Ampicillin/Sulbactam i. v. (14.07.2026)',
  'Iodhaltiges Kontrastmittel: Übelkeit nach CT-Angiographie (13.07.2026), Unverträglichkeit',
];

/** Implantat, wie es im Brief steht. */
const KH_IMPLANTATZEILE =
  'Zweikammer-Herzschrittmacher (DDD) seit 04/2019 bei AV-Block II. Grades, Kontrolle nach Kardioversion unauffällig';

const deutsch = (iso: string) => iso.slice(0, 10).split('-').reverse().join('.');

const KH_TEXT = {
  anamnese:
    'Die Patientin stellte sich am 12.07.2026 über unsere Notaufnahme mit seit drei Tagen bestehendem Herzrasen, zunehmender Belastungsdyspnoe und Abgeschlagenheit vor. Zusätzlich bestanden seit fünf Tagen Dysurie und Pollakisurie. Kein Fieber, keine thorakalen Schmerzen, keine Synkope. Im Juni 2026 war in der kardiologischen Praxis im Langzeit-EKG paroxysmales Vorhofflimmern aufgefallen; eine orale Antikoagulation war bis zur Aufnahme nicht eingeleitet worden. Zweikammer-Herzschrittmacher seit 04/2019 bei AV-Block II. Grades. Die Patientin ist kürzlich umgezogen; die hausärztliche Weiterbetreuung soll in Ihrer Praxis erfolgen.',
  aufnahmebefund:
    '68-jährige Patientin in leicht reduziertem Allgemeinzustand und adipösem Ernährungszustand (BMI 31 kg/m²). RR 148/92 mmHg, Herzfrequenz 118/min arrhythmisch, SpO2 95 % unter Raumluft, Temperatur 37,6 °C. Herztöne arrhythmisch, keine pathologischen Geräusche. Pulmo: vesikuläres Atemgeräusch, keine Rasselgeräusche. Abdomen weich, suprapubischer Druckschmerz, Nierenlager frei. Geringe Unterschenkelödeme beidseits.',
  befunde: [
    'EKG (12.07.): Vorhofflimmern mit tachykarder Überleitung, Herzfrequenz 116/min, Linkstyp, intermittierend ventrikuläre Stimulation, keine Erregungsrückbildungsstörungen.',
    'Transthorakale Echokardiographie (13.07.): LVEF 50 % (biplan), keine regionalen Wandbewegungsstörungen, linker Vorhof mäßig dilatiert, leichte Mitralinsuffizienz, kein Perikarderguss.',
    'CT-Angiographie Thorax (13.07.): kein Nachweis einer Lungenarterienembolie, keine Infiltrate, Schrittmachersonden regelrecht.',
    'Transösophageale Echokardiographie (17.07.): kein Thrombus im linken Vorhof und im Vorhofohr.',
    'Schrittmacherabfrage (13.07. und 17.07.): regelrechte Funktion, Sonden- und Batteriewerte im Normbereich.',
    'Labor bei Aufnahme: Kreatinin 1,32 mg/dl, eGFR 42 ml/min/1,73 m², Kalium 4,1 mmol/l, CRP 48 mg/l, Leukozyten 12,4 /nl, HbA1c 7,6 %, TSH basal 1,8 mU/l. Urinstatus mit Leukozyturie, Nitrit positiv; Urinkultur E. coli > 10^5/ml, sensibel auf Cefuroxim.',
  ],
  verlauf: [
    'Bei persistierendem Vorhofflimmern erfolgte zunächst die Frequenzkontrolle mit Bisoprolol sowie die Einleitung einer oralen Antikoagulation mit Apixaban 5 mg zweimal täglich; die Kriterien für eine Dosisreduktion liegen nicht vor. Zum Ausschluss einer Lungenarterienembolie führten wir am 13.07.2026 eine CT-Angiographie durch. Im Anschluss an die Kontrastmittelgabe trat eine kurzzeitige Übelkeit ohne weitere Symptome auf. Metformin wurde vor der Untersuchung pausiert und nach 48 Stunden bei stabiler Nierenfunktion wieder angesetzt.',
    'Nach Ausschluss intrakardialer Thromben mittels TEE erfolgte am 17.07.2026 die elektrische Kardioversion (150 J biphasisch, einmalig), die primär erfolgreich war. Seither stabiler Sinusrhythmus beziehungsweise atriale Stimulation. Die Schrittmacherkontrolle nach Kardioversion war unauffällig.',
    'Der Harnwegsinfekt wurde kalkuliert mit Ampicillin/Sulbactam i. v. behandelt. Am 14.07.2026 trat ein makulopapulöses Exanthem am Stamm auf, das wir als Arzneimittelreaktion auf das Penicillin werteten. Nach Umstellung auf Cefuroxim p. o. gemäß Antibiogramm bildete es sich rasch zurück. Die Antibiose ist mit dem Entlasstag abgeschlossen. Ein Allergiepass wurde ausgestellt.',
    'Unter Immobilisation entwickelte sich eine Obstipation, die unter Macrogol rückläufig war.',
  ],
  empfehlungen: [
    'Fortführung der oralen Antikoagulation mit Apixaban; Kontrolle von Nierenfunktion und Blutbild in vier Wochen.',
    'Metformin bei weiterer Verschlechterung der Nierenfunktion bitte überprüfen.',
    'Kardiologische Verlaufskontrolle mit EKG und Echokardiographie in drei Monaten, Schrittmacherabfrage turnusgemäß.',
    'Bei erneutem Vorhofflimmern Vorstellung zur Rhythmuskontrolle.',
    'Penicillin und Ampicillin künftig meiden; iodhaltiges Kontrastmittel nur mit Prämedikation.',
  ],
  entlassung:
    'Die Entlassung erfolgt am 18.07.2026 in die Häuslichkeit. Ein pflegerischer Unterstützungsbedarf besteht nicht. Die Patientin erhält einen Medikationsplan und ein Entlassrezept.',
};

const diagnosezeile = (d: Briefdiagnose) => `${d.icd} ${d.text}${d.zusatz ? ` (${d.zusatz})` : ''}`;

/** Der Entlassbrief als Brief, so wie er als PDF in der Akte liegt. */
export function entlassbriefHoffmannBrief(): Briefvorlage {
  return {
    absender: KLINIKUM_KOPF,
    empfaenger: [
      'Hausarztpraxis am Stadtgarten',
      'Frau Dr. med. Anna Brandt',
      'Am Stadtgarten 4',
      '26000 Beispielstadt',
    ],
    ortDatum: 'Beispielstadt, 17.07.2026',
    betreff:
      'Entlassbrief — Frau Renate Hoffmann, geb. 14.03.1958 — stationärer Aufenthalt 12.07.2026 bis 18.07.2026',
    bausteine: [
      a('Sehr geehrte Frau Kollegin Brandt,'),
      leer,
      a(
        'wir berichten über Ihre Patientin Frau Renate Hoffmann, geb. 14.03.1958, die sich vom 12.07.2026 bis zum 18.07.2026 in unserer stationären Behandlung befand.',
      ),
      leer,
      u('Diagnosen'),
      ...KH_DIAGNOSEN.map((d) => z(diagnosezeile(d))),
      leer,
      u('Allergien und Unverträglichkeiten'),
      ...KH_ALLERGIEZEILEN.map(z),
      leer,
      u('Anamnese'),
      a(KH_TEXT.anamnese),
      leer,
      u('Aufnahmebefund'),
      a(KH_TEXT.aufnahmebefund),
      leer,
      u('Befunde'),
      ...KH_TEXT.befunde.map(a),
      leer,
      u('Prozeduren'),
      ...[...KH_PROZEDUREN]
        .sort((x, y) => x.zeitpunkt.localeCompare(y.zeitpunkt))
        .map((p) => z(`${deutsch(p.zeitpunkt)} ${p.text} (OPS ${p.ops})`)),
      leer,
      u('Implantate'),
      z(KH_IMPLANTATZEILE),
      leer,
      u('Therapie und Verlauf'),
      ...KH_TEXT.verlauf.map(a),
      leer,
      u('Entlassmedikation'),
      ...KH_ENTLASSMEDIKATION.map((m) => z(`${m.text} ${m.dosierung}`)),
      leer,
      u('Empfehlungen'),
      ...KH_TEXT.empfehlungen.map(z),
      leer,
      u('Entlassung'),
      a(KH_TEXT.entlassung),
      leer,
      a('Für Rückfragen stehen wir Ihnen gern zur Verfügung.'),
      a('Mit freundlichen kollegialen Grüßen'),
      leer,
      a(
        'Prof. Dr. med. Martin Ehlers, Chefarzt · Dr. med. Lea Wagner, Oberärztin · Jan Petersen, Assistenzarzt',
      ),
    ],
    fusszeile: 'Klinikum Sonnenschein · Klinik für Innere Medizin und Kardiologie',
  };
}

/* ---------- FHIR-Dokument nach europäischem Vorbild ---------- */

function escape(t: string): string {
  return t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function erzaehlung(absaetze: string[]): { status: string; div: string } {
  return {
    status: 'generated',
    div: `<div xmlns="http://www.w3.org/1999/xhtml">${absaetze.map((p) => `<p>${escape(p)}</p>`).join('')}</div>`,
  };
}

function abschnitt(
  titel: string,
  loinc: string,
  anzeige: string,
  absaetze: string[],
  eintraege: string[] = [],
): Record<string, unknown> {
  return {
    title: titel,
    code: { coding: [{ system: LOINC, code: loinc, display: anzeige }] },
    text: erzaehlung(absaetze),
    ...(eintraege.length > 0 ? { entry: eintraege.map((reference) => ({ reference })) } : {}),
  };
}

const status = (system: string, code: string) => ({ coding: [{ system, code }] });

/**
 * ✦ Der Entlassbrief als FHIR-Dokument. Composition mit LOINC 34105-7 (wie `composition-eu-hdr`)
 * und SNOMED CT 373942005 (wie `KBV_PR_MIO_KHE_Composition`), Encounter 1..1, Abschnitte mit
 * den LOINC-Codes des HDR und den Überschriften des MIO KH-E, je mit Erzähltext; Diagnosen,
 * Allergien, Prozeduren, Implantate und Entlassmedikation zusätzlich als Einträge.
 *
 * Laborwerte stehen bewusst nur im Erzähltext: Strukturierte Laborwerte kommen aus dem
 * Laborbefund nach dgLP, nicht aus dem Brief.
 */
export function entlassbriefHoffmannFhir(kvnr: string): Record<string, unknown> {
  const pid = `pat-${kvnr}`;
  const pat = { reference: `Patient/${pid}` };
  const aerztin = { reference: 'Practitioner/kh-wagner', display: 'Dr. med. Lea Wagner' };
  const diagnosen: Ressource[] = KH_DIAGNOSEN.map((d) => ({
    resourceType: 'Condition',
    id: d.id,
    clinicalStatus: status('http://terminology.hl7.org/CodeSystem/condition-clinical', d.status),
    verificationStatus: status(
      'http://terminology.hl7.org/CodeSystem/condition-ver-status',
      'confirmed',
    ),
    category: [status('http://terminology.hl7.org/CodeSystem/condition-category', d.kategorie)],
    code: {
      coding: [
        { system: ICD, version: '2026', code: d.icd, display: d.text },
        ...(d.sct ? [{ system: SCT, code: d.sct }] : []),
      ],
      text: d.text,
    },
    subject: pat,
    encounter: { reference: 'Encounter/kh-aufenthalt' },
    onsetDateTime: d.beginn,
    ...(d.status === 'resolved' ? { abatementDateTime: '2026-07-17' } : {}),
    recordedDate: '2026-07-17',
    recorder: aerztin,
    ...(d.zusatz ? { note: [{ text: d.zusatz }] } : {}),
  }));
  const allergie = (
    id: string,
    sct: string,
    atc: string,
    text: string,
    typ: string,
    krit: string,
    man: [string, string],
    beginn: string,
    notiz: string,
  ): Ressource => ({
    resourceType: 'AllergyIntolerance',
    id,
    clinicalStatus: status(
      'http://terminology.hl7.org/CodeSystem/allergyintolerance-clinical',
      'active',
    ),
    verificationStatus: status(
      'http://terminology.hl7.org/CodeSystem/allergyintolerance-verification',
      'confirmed',
    ),
    type: typ,
    category: ['medication'],
    criticality: krit,
    code: {
      coding: [
        { system: SCT, code: sct, display: text },
        { system: ATC, code: atc },
      ],
      text,
    },
    patient: pat,
    onsetDateTime: beginn,
    recordedDate: '2026-07-17',
    recorder: aerztin,
    reaction: [
      {
        manifestation: [{ coding: [{ system: SCT, code: man[0], display: man[1] }], text: man[1] }],
        onset: beginn,
        exposureRoute: {
          coding: [{ system: SCT, code: '47625008', display: 'Intravenous route' }],
        },
      },
    ],
    note: [{ text: notiz }],
  });
  const allergien = [
    allergie(
      'kh-allg-1',
      '764146007',
      'J01C',
      'Penicillin',
      'allergy',
      'high',
      ['247471006', 'Makulopapulöses Exanthem'],
      '2026-07-14',
      'Exanthem am zweiten Tag unter Ampicillin/Sulbactam i. v.; nach Umstellung rasch rückläufig.',
    ),
    allergie(
      'kh-allg-2',
      '426722004',
      'V08A',
      'Iodhaltiges Kontrastmittel',
      'intolerance',
      'low',
      ['422587007', 'Übelkeit'],
      '2026-07-13',
      'Kurzzeitige Übelkeit nach CT-Angiographie.',
    ),
  ];
  const prozeduren: Ressource[] = KH_PROZEDUREN.map((p) => ({
    resourceType: 'Procedure',
    id: p.id,
    status: 'completed',
    code: {
      coding: [{ system: OPS, version: '2026', code: p.ops, display: p.text }],
      text: p.text,
    },
    subject: pat,
    encounter: { reference: 'Encounter/kh-aufenthalt' },
    performedDateTime: p.zeitpunkt,
  }));
  // Implantat aus der Anamnese. ⚠ SNOMED CT 14106009 nicht gegen einen Terminologieserver
  // geprüft; das Beispiel ist erfunden und fachlich von der Medizin zu bestätigen.
  const geraet: Ressource = {
    resourceType: 'Device',
    id: 'kh-device-1',
    type: {
      coding: [
        { system: SCT, code: '14106009', display: 'Cardiac pacemaker, device (physical object)' },
      ],
      text: 'Herzschrittmacher (Zweikammer)',
    },
    patient: pat,
  };
  const nutzung: Ressource = {
    resourceType: 'DeviceUseStatement',
    id: 'kh-device-use-1',
    status: 'active',
    subject: pat,
    timingDateTime: '2019-04-02',
    recordedOn: '2026-07-17',
    device: { reference: 'Device/kh-device-1' },
    reasonCode: [{ text: 'AV-Block II. Grades' }],
    note: [{ text: 'Kontrolle nach Kardioversion am 17.07.2026 unauffällig' }],
  };
  const medikation: Ressource[] = KH_ENTLASSMEDIKATION.map((m, i) => ({
    resourceType: 'MedicationStatement',
    id: `kh-med-${i + 1}`,
    status: 'active',
    medicationCodeableConcept: {
      coding: [{ system: ATC, version: '2026', code: m.atc }],
      text: m.text,
    },
    subject: pat,
    effectivePeriod: { start: '2026-07-18' },
    dateAsserted: '2026-07-17',
    dosage: [{ text: m.dosierung }],
  }));

  const ref = (r: Ressource) => `${r.resourceType}/${String(r.id)}`;
  const komposition: Ressource = {
    resourceType: 'Composition',
    id: 'comp-kh-e',
    status: 'final',
    type: {
      coding: [
        { system: LOINC, code: '34105-7', display: 'Hospital Discharge summary' },
        { system: SCT, code: '373942005', display: 'Discharge summary (record artifact)' },
      ],
    },
    subject: pat,
    encounter: { reference: 'Encounter/kh-aufenthalt' },
    date: '2026-07-17T14:00:00',
    author: [aerztin, { reference: 'Organization/kh-klinikum' }],
    title: 'Entlassbrief stationäre Behandlung',
    attester: [{ mode: 'legal', time: '2026-07-17T14:00:00', party: aerztin }],
    custodian: { reference: 'Organization/kh-klinikum' },
    section: [
      abschnitt('Anamnese', '11329-0', 'History general Narrative', [KH_TEXT.anamnese]),
      abschnitt('Aufnahmebefund', '67851-6', 'Admission evaluation note', [KH_TEXT.aufnahmebefund]),
      abschnitt(
        'Diagnosen',
        '11535-2',
        'Hospital discharge Dx Narrative',
        KH_DIAGNOSEN.map(diagnosezeile),
        diagnosen.map(ref),
      ),
      abschnitt(
        'Allergien und Unverträglichkeiten',
        '48765-2',
        'Allergies and adverse reactions Document',
        KH_ALLERGIEZEILEN,
        allergien.map(ref),
      ),
      abschnitt(
        'Prozeduren',
        '10185-7',
        'Hospital discharge procedures Narrative',
        KH_PROZEDUREN.map((p) => `${deutsch(p.zeitpunkt)} ${p.text} (OPS ${p.ops})`),
        prozeduren.map(ref),
      ),
      abschnitt(
        'Implantate',
        '46264-8',
        'History of medical device use',
        [KH_IMPLANTATZEILE],
        [ref(nutzung)],
      ),
      abschnitt(
        'Befunde',
        '30954-2',
        'Relevant diagnostic tests/laboratory data Narrative',
        KH_TEXT.befunde,
      ),
      abschnitt('Therapie und Verlauf', '8648-8', 'Hospital course Narrative', KH_TEXT.verlauf),
      abschnitt(
        'Entlassmedikation',
        '75311-1',
        'Discharge medications Narrative',
        KH_ENTLASSMEDIKATION.map((m) => `${m.text} ${m.dosierung}`),
        medikation.map(ref),
      ),
      abschnitt('Empfehlungen', '18776-5', 'Plan of care note', KH_TEXT.empfehlungen),
      abschnitt('Entlassung', '8650-4', 'Hospital discharge disposition Narrative', [
        KH_TEXT.entlassung,
      ]),
    ],
  };
  const ressourcen: Ressource[] = [
    komposition,
    {
      resourceType: 'Patient',
      id: pid,
      identifier: [{ system: 'http://fhir.de/sid/gkv/kvid-10', value: kvnr }],
      name: [{ family: 'Hoffmann', given: ['Renate'] }],
      birthDate: '1958-03-14',
    },
    {
      resourceType: 'Encounter',
      id: 'kh-aufenthalt',
      status: 'finished',
      class: {
        system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode',
        code: 'IMP',
        display: 'inpatient encounter',
      },
      subject: pat,
      period: { start: '2026-07-12T09:40:00', end: '2026-07-18T10:00:00' },
      serviceProvider: { reference: 'Organization/kh-klinikum' },
      hospitalization: { dischargeDisposition: { text: 'nach Hause' } },
    },
    {
      resourceType: 'Practitioner',
      id: 'kh-wagner',
      name: [{ family: 'Wagner', given: ['Lea'], prefix: ['Dr. med.'] }],
    },
    {
      resourceType: 'Organization',
      id: 'kh-klinikum',
      identifier: [
        { system: 'https://gematik.de/fhir/sid/telematik-id', value: 'DEMO-KLINIKUM-SONNENSCHEIN' },
      ],
      name: 'Klinikum Sonnenschein',
    },
    ...diagnosen,
    ...allergien,
    ...prozeduren,
    geraet,
    nutzung,
    ...medikation,
  ];
  return {
    resourceType: 'Bundle',
    identifier: {
      system: 'urn:ietf:rfc:3986',
      value: 'urn:uuid:6f1c2b7e-3d4a-4e8b-9c1d-2a7f0e5b8c31',
    },
    type: 'document',
    timestamp: '2026-07-17T14:00:00',
    entry: ressourcen.map((r) => ({ fullUrl: `urn:uuid:${String(r.id)}`, resource: r })),
  };
}

/* ======================================================================================
 * Älterer Entlassbrief, Frau Hoffmann, April 2019 — nur PDF
 * ==================================================================================== */

/**
 * Entlassbrief nach Schrittmacherimplantation aus der Zeit vor dem Umzug. Liegt nur als PDF
 * vor, in jedem Ausbaustand: Was darin steht — das Implantat, „Allergien nicht bekannt" —,
 * erreicht weder Liste noch Patient Summary.
 */
export function entlassbriefSchrittmacherBrief(): Briefvorlage {
  return {
    absender: [
      'Kreisklinikum Weserbogen',
      'Medizinische Klinik II — Kardiologie und Angiologie · Chefarzt Dr. med. Bernd Albers',
      'Klinikstraße 12 · 26999 Weserbogen · Tel. 0000 9876-0',
    ],
    empfaenger: [
      'Hausarztpraxis Nordstadt',
      'Frau Dr. med. Petra Lang',
      'Nordstraße 18',
      '26990 Nordstadt',
    ],
    ortDatum: 'Weserbogen, 05.04.2019',
    betreff:
      'Frau Renate Hoffmann, geb. 14.03.1958 — stationärer Aufenthalt 01.04.2019 bis 05.04.2019',
    bausteine: [
      a('Sehr geehrte Frau Kollegin Lang,'),
      leer,
      a(
        'wir berichten über die o. g. Patientin, die sich vom 01.04.2019 bis 05.04.2019 in unserer stationären Behandlung befand.',
      ),
      leer,
      u('Diagnosen'),
      z('I44.1 AV-Block II. Grades, Typ Mobitz II, mit Präsynkopen'),
      z('E11.90 Diabetes mellitus Typ 2, nicht insulinpflichtig'),
      z('I10.90 Arterielle Hypertonie'),
      leer,
      u('Anamnese'),
      a(
        'Zuweisung durch Sie wegen wiederholter Schwindelattacken mit Beinahe-Synkopen seit zwei Wochen. Im Langzeit-EKG intermittierender AV-Block II. Grades. Keine Thoraxschmerzen, keine Dyspnoe. Allergien sind nicht bekannt.',
      ),
      leer,
      u('Befunde'),
      a(
        'EKG bei Aufnahme: Sinusrhythmus 58/min, AV-Block II. Grades Typ Mobitz II mit 2:1-Überleitung.',
      ),
      a('Echokardiographie: normale linksventrikuläre Pumpfunktion, keine relevanten Vitien.'),
      leer,
      u('Prozeduren'),
      z(
        '02.04.2019 Implantation eines Zweikammer-Herzschrittmachers (DDD), Zugang V. cephalica links',
      ),
      leer,
      u('Verlauf'),
      a(
        'Nach komplikationsloser Implantation am 02.04.2019 regelrechte Schrittmacherfunktion, Wundverhältnisse reizlos. Röntgen-Thorax ohne Pneumothorax, Sonden in regelrechter Lage. Beschwerdefreie Mobilisation.',
      ),
      leer,
      u('Medikation bei Entlassung'),
      z('Metformin 1000 mg 1-0-1'),
      z('Ramipril 5 mg 1-0-0'),
      z('Simvastatin 20 mg 0-0-1'),
      leer,
      u('Empfehlungen'),
      z('Wundkontrolle und Fadenzug am 12. postoperativen Tag'),
      z(
        'Schrittmacherkontrolle in drei Monaten, danach jährlich; Schrittmacherausweis wurde ausgehändigt',
      ),
      z('Keine Armbewegungen links über Schulterhöhe für vier Wochen'),
      leer,
      a('Mit freundlichen kollegialen Grüßen'),
      leer,
      a('Dr. med. Bernd Albers, Chefarzt · Dr. med. Sven Kröger, Oberarzt'),
    ],
    fusszeile: 'Kreisklinikum Weserbogen · Medizinische Klinik II',
  };
}

/* ======================================================================================
 * Ambulante Arztbriefe der Kardiologie — eArztbrief, in der ePA als PDF
 * ==================================================================================== */

const KARDIOLOGIE_KOPF = [
  'Kardiologische Praxis am Wall',
  'Dr. med. Jonas Behrens · Facharzt für Innere Medizin und Kardiologie',
  'Am Wall 7 · 26000 Beispielstadt · Tel. 0000 5544-0 · BSNR 000000000 · LANR 000000000',
];

/** Befundbericht nach Überweisung, Juni 2026 — an die frühere Hausärztin. */
export function kardiologieBefundberichtBrief(): Briefvorlage {
  return {
    absender: KARDIOLOGIE_KOPF,
    empfaenger: [
      'Hausarztpraxis Nordstadt',
      'Frau Dr. med. Petra Lang',
      'Nordstraße 18',
      '26990 Nordstadt',
    ],
    ortDatum: 'Beispielstadt, 03.06.2026',
    betreff: 'Befundbericht — Frau Renate Hoffmann, geb. 14.03.1958 — Untersuchung am 03.06.2026',
    bausteine: [
      a('Sehr geehrte Frau Kollegin Lang,'),
      leer,
      a(
        'vielen Dank für die Überweisung Ihrer Patientin zur kardiologischen Abklärung bei Belastungsdyspnoe und Palpitationen. Wir berichten über die Untersuchung am 03.06.2026.',
      ),
      leer,
      u('Diagnosen'),
      z('I48.0 Paroxysmales Vorhofflimmern (Erstdiagnose im Langzeit-EKG)'),
      z('Z95.0 Zweikammer-Herzschrittmacher seit 04/2019'),
      z('I10.90 Essentielle Hypertonie'),
      leer,
      u('Anamnese'),
      a(
        'Seit etwa acht Wochen Herzstolpern und Luftnot beim Treppensteigen ab dem zweiten Stockwerk. Keine Synkopen, keine Angina pectoris. Kardiovaskuläre Risikofaktoren: Diabetes mellitus Typ 2, arterielle Hypertonie, Hyperlipidämie, Adipositas.',
      ),
      leer,
      u('Befunde'),
      a(
        'Ruhe-EKG: atriale Stimulation, Herzfrequenz 72/min, Linkstyp, unauffällige Erregungsrückbildung.',
      ),
      a(
        'Echokardiographie: LVEF 45 %, leichte Mitralinsuffizienz, linker Vorhof dilatiert, keine regionalen Wandbewegungsstörungen.',
      ),
      a(
        'Langzeit-EKG über 24 Stunden: intermittierendes Vorhofflimmern, längste Episode etwa vier Stunden, maximale Herzfrequenz 132/min.',
      ),
      a('Schrittmacherabfrage: regelrechte Funktion, Mode-Switch-Episoden 6 % der Zeit.'),
      leer,
      u('Beurteilung'),
      a(
        'Neu diagnostiziertes paroxysmales Vorhofflimmern bei einem CHA2DS2-VASc-Score von 4. Leicht eingeschränkte linksventrikuläre Pumpfunktion, am ehesten tachykardiebedingt.',
      ),
      leer,
      u('Procedere'),
      z(
        'Wir empfehlen die Einleitung einer oralen Antikoagulation; die Patientin wünscht zunächst Bedenkzeit.',
      ),
      z('Neu: Bisoprolol 2,5 mg 1-0-0'),
      z('Kontrolle in unserer Praxis in sechs Monaten, bei Beschwerden früher.'),
      leer,
      a('Mit freundlichen kollegialen Grüßen'),
      leer,
      a('Dr. med. Jonas Behrens'),
    ],
    fusszeile: 'Kardiologische Praxis am Wall · Dr. med. Jonas Behrens',
  };
}

const KONTROLLE = {
  anlass: 'Zunahme der Belastungsdyspnoe, Unterschenkelödeme beidseits',
  befunde: [
    'Ruhe-EKG: Sinusrhythmus, Herzfrequenz 76/min, keine neuen Erregungsrückbildungsstörungen.',
    'Echokardiographie: LVEF 40 %, linker Vorhof dilatiert, leichte Mitralinsuffizienz, kein Perikarderguss.',
    'NT-proBNP 1.420 pg/ml.',
  ],
  procedere: [
    'Neu: Torasemid 10 mg 1-0-0-0',
    'Bisoprolol auf 5 mg täglich steigern (2,5 mg 1-0-1-0)',
    'Kontrolle von Kalium und Kreatinin in einer Woche',
    'Kardiologische Kontrolle in drei Monaten',
  ],
};

/** Kontrollbefund — die Kardiologie stellt ihn „jetzt" ein (Demo-Steuerung). */
export function kardiologieKontrolleBrief(datum: string): Briefvorlage {
  return {
    absender: KARDIOLOGIE_KOPF,
    empfaenger: [
      'Hausarztpraxis am Stadtgarten',
      'Frau Dr. med. Anna Brandt',
      'Am Stadtgarten 4',
      '26000 Beispielstadt',
    ],
    ortDatum: `Beispielstadt, ${deutsch(datum)}`,
    betreff: `Befundbericht Kontrolle — Frau Renate Hoffmann, geb. 14.03.1958 — Untersuchung am ${deutsch(datum)}`,
    bausteine: [
      a('Sehr geehrte Frau Kollegin Brandt,'),
      leer,
      a(`wir berichten über die Kontrolluntersuchung Ihrer Patientin am ${deutsch(datum)}.`),
      leer,
      u('Diagnosen'),
      z('I50.12 Linksherzinsuffizienz, NYHA-Stadium II'),
      z('I48.1 Vorhofflimmern, persistierend, Zustand nach Kardioversion 07/2026'),
      z('Z95.0 Zweikammer-Herzschrittmacher seit 04/2019'),
      leer,
      u('Anlass'),
      a(KONTROLLE.anlass),
      leer,
      u('Befunde'),
      ...KONTROLLE.befunde.map(a),
      leer,
      u('Procedere'),
      ...KONTROLLE.procedere.map(z),
      leer,
      a('Mit freundlichen kollegialen Grüßen'),
      leer,
      a('Dr. med. Jonas Behrens'),
    ],
    fusszeile: 'Kardiologische Praxis am Wall · Dr. med. Jonas Behrens',
  };
}

/**
 * ✦ Der Kontrollbefund als strukturierter ambulanter Arztbrief. Für ambulante Briefe gibt es
 * weder eine nationale noch eine europäische FHIR-Vorgabe; die Demo baut ihn wie den
 * Entlassbrief: Composition mit Erzähltext je Abschnitt, Diagnosen und Prozedur als Einträge.
 * ⚠ LOINC 11488-4 (Consult note), LOINC 42349-1 (Reason for referral) und SNOMED CT 40701008
 * (Echocardiography) sind nicht gegen
 * einen Terminologieserver geprüft.
 */
export function kardiologieKontrolleFhir(
  kvnr: string,
  datum: string,
  id: string,
): Record<string, unknown> {
  const pat = { reference: `Patient/pat-${kvnr}` };
  const arzt = { reference: 'Practitioner/kardio-behrens', display: 'Dr. med. Jonas Behrens' };
  const diagnose: Ressource = {
    resourceType: 'Condition',
    id: `${id}-cond-1`,
    clinicalStatus: status('http://terminology.hl7.org/CodeSystem/condition-clinical', 'active'),
    verificationStatus: status(
      'http://terminology.hl7.org/CodeSystem/condition-ver-status',
      'confirmed',
    ),
    category: [
      status('http://terminology.hl7.org/CodeSystem/condition-category', 'problem-list-item'),
    ],
    code: {
      coding: [
        {
          system: ICD,
          version: '2026',
          code: 'I50.12',
          display: 'Linksherzinsuffizienz: Mit Beschwerden bei stärkerer Belastung',
        },
        { system: SCT, code: '84114007' },
      ],
      text: 'Linksherzinsuffizienz: Mit Beschwerden bei stärkerer Belastung',
    },
    subject: pat,
    onsetDateTime: datum,
    recordedDate: datum,
    recorder: arzt,
  };
  const echo: Ressource = {
    resourceType: 'Procedure',
    id: `${id}-proc-1`,
    status: 'completed',
    code: {
      coding: [{ system: SCT, code: '40701008', display: 'Echocardiography (procedure)' }],
      text: 'Transthorakale Echokardiographie',
    },
    subject: pat,
    performedDateTime: datum,
    note: [{ text: 'LVEF 40 %' }],
  };
  const komposition: Ressource = {
    resourceType: 'Composition',
    id: `${id}-comp`,
    status: 'final',
    type: { coding: [{ system: LOINC, code: '11488-4', display: 'Consult note' }] },
    subject: pat,
    date: `${datum}T12:00:00`,
    author: [arzt],
    title: 'Befundbericht Kardiologie, Kontrolle',
    attester: [{ mode: 'legal', time: `${datum}T12:00:00`, party: arzt }],
    section: [
      abschnitt(
        'Diagnosen',
        '11450-4',
        'Problem list - Reported',
        ['I50.12 Linksherzinsuffizienz, NYHA-Stadium II'],
        [`Condition/${String(diagnose.id)}`],
      ),
      abschnitt('Anlass', '42349-1', 'Reason for referral (narrative)', [KONTROLLE.anlass]),
      abschnitt(
        'Befunde',
        '30954-2',
        'Relevant diagnostic tests/laboratory data Narrative',
        KONTROLLE.befunde,
        [`Procedure/${String(echo.id)}`],
      ),
      abschnitt('Procedere', '18776-5', 'Plan of care note', KONTROLLE.procedere),
    ],
  };
  const ressourcen = [
    komposition,
    {
      resourceType: 'Patient',
      id: `pat-${kvnr}`,
      identifier: [{ system: 'http://fhir.de/sid/gkv/kvid-10', value: kvnr }],
    },
    {
      resourceType: 'Practitioner',
      id: 'kardio-behrens',
      name: [{ family: 'Behrens', given: ['Jonas'], prefix: ['Dr. med.'] }],
    },
    diagnose,
    echo,
  ];
  return {
    resourceType: 'Bundle',
    type: 'document',
    timestamp: `${datum}T12:00:00`,
    entry: ressourcen.map((r) => ({ fullUrl: `urn:uuid:${String(r.id)}`, resource: r })),
  };
}

/* ======================================================================================
 * Unklar beschriftete Unterlagen, Frau Hoffmann — Inhalt in Ordnung, Metadaten nicht
 * ==================================================================================== */

/*
 * Drei Unterlagen aus der Zeit vor dem Umzug, die die frühere Hausarztpraxis gesammelt
 * eingestellt hat. Der Text ist lesbar und vollständig; die Metadaten sagen nicht, worum es
 * geht (B22–B24, `startbestand.ts`). In der Liste öffnet sie niemand.
 *
 * Messwerte stehen bewusst in Sätzen, nicht als „Bezeichnung: Wert" — sonst zählte der ✦
 * Aktenlotse die Nierenlänge zu den Nierenwerten.
 */

const NORDSTADT_KOPF = [
  'Hausarztpraxis Nordstadt',
  'Dr. med. Petra Lang · Fachärztin für Allgemeinmedizin',
  'Nordstraße 18 · 26990 Nordstadt · Tel. 0000 2233-0',
];

const AN_NORDSTADT = [
  'Hausarztpraxis Nordstadt',
  'Frau Dr. med. Petra Lang',
  'Nordstraße 18',
  '26990 Nordstadt',
];

/** Sonographie in der früheren Hausarztpraxis, September 2023 — als Scannerdatei eingestellt. */
export function sonographieBrief(): Briefvorlage {
  return {
    absender: NORDSTADT_KOPF,
    empfaenger: ['Befunddokumentation', 'Hausarztpraxis Nordstadt'],
    ortDatum: 'Nordstadt, 14.09.2023',
    betreff: 'Sonographie des Abdomens vom 14.09.2023 — Frau Renate Hoffmann, geb. 14.03.1958',
    bausteine: [
      u('Fragestellung'),
      a(
        'Verlaufskontrolle bei Diabetes mellitus Typ 2 und arterieller Hypertonie, zuletzt erhöhte Nierenwerte.',
      ),
      leer,
      u('Befund'),
      a(
        'Leber normal groß, Parenchym homogen mit leicht vermehrter Echogenität. Gallenblase ohne Konkremente. Pankreas, soweit einsehbar, unauffällig. Milz normal groß.',
      ),
      a(
        'Rechte Niere 10,4 cm, linke Niere 10,8 cm lang, beidseits mit verschmälertem Parenchymsaum. Kein Harnstau, keine Konkremente. Harnblase wenig gefüllt, unauffällig.',
      ),
      leer,
      u('Beurteilung'),
      a(
        'Beidseits verschmälerter Nierenparenchymsaum, vereinbar mit einer chronischen Nierenerkrankung. Leichte Steatosis hepatis.',
      ),
      leer,
      u('Procedere'),
      a(
        'Kontrolle der Nierenwerte in vier Wochen, nephrologische Mitbeurteilung bei weiterem Abfall.',
      ),
      leer,
      a('Dr. med. Petra Lang'),
    ],
    fusszeile: 'Hausarztpraxis Nordstadt · Befunddokumentation',
  };
}

/** Augenärztlicher Bericht, November 2024 — als „Befund" mit falscher Dokumentklasse eingestellt. */
export function netzhautBrief(): Briefvorlage {
  return {
    absender: [
      'Augenärztliche Gemeinschaftspraxis am Markt',
      'Dr. med. Ines Zander · Dr. med. Ole Brandes',
      'Markt 4 · 26990 Nordstadt · Tel. 0000 3344-0',
    ],
    empfaenger: AN_NORDSTADT,
    ortDatum: 'Nordstadt, 05.11.2024',
    betreff:
      'Diabetisches Netzhaut-Screening vom 05.11.2024 — Frau Renate Hoffmann, geb. 14.03.1958',
    bausteine: [
      a('Sehr geehrte Frau Kollegin Lang,'),
      leer,
      a(
        'wir sahen Ihre Patientin am 05.11.2024 zur augenärztlichen Untersuchung bei Diabetes mellitus Typ 2.',
      ),
      leer,
      u('Befund'),
      a(
        'Sehschärfe mit Korrektur rechts 0,8, links 0,9. Vordere Augenabschnitte regelrecht, beginnende Linsentrübung beidseits. Fundus in Mydriasis beidseits ohne Zeichen einer diabetischen Retinopathie, Makula beidseits unauffällig.',
      ),
      leer,
      u('Beurteilung'),
      a('Keine diabetische Retinopathie. Beginnende Katarakt beidseits ohne Behandlungsbedarf.'),
      leer,
      u('Empfehlung'),
      a('Erneute Untersuchung in zwei Jahren, bei Sehverschlechterung früher.'),
      leer,
      a('Mit freundlichen kollegialen Grüßen'),
      a('Dr. med. Ines Zander'),
    ],
    fusszeile: 'Augenärztliche Gemeinschaftspraxis am Markt',
  };
}

/** Diabetologische Fußuntersuchung, Januar 2026 — als „Anlage 1" ohne Verfasser eingestellt. */
export function fussBrief(): Briefvorlage {
  return {
    absender: [
      'Diabetologische Schwerpunktpraxis Nordstadt',
      'Dr. med. Kerstin Wolff · Diabetologin',
      'Bahnhofstraße 9 · 26990 Nordstadt · Tel. 0000 5566-0',
    ],
    empfaenger: AN_NORDSTADT,
    ortDatum: 'Nordstadt, 20.01.2026',
    betreff:
      'Fußuntersuchung bei Diabetes mellitus vom 20.01.2026 — Frau Renate Hoffmann, geb. 14.03.1958',
    bausteine: [
      a('Sehr geehrte Frau Kollegin Lang,'),
      leer,
      a('Ihre Patientin stellte sich am 20.01.2026 zur jährlichen Fußuntersuchung vor.'),
      leer,
      u('Befund'),
      a(
        'Haut beidseits intakt, keine Druckstellen, keine Ulzerationen. Fußpulse beidseits tastbar. Vibrationsempfinden mit der Stimmgabel beidseits leicht vermindert, Monofilament-Test beidseits regelrecht.',
      ),
      leer,
      u('Beurteilung'),
      a('Kein diabetisches Fußsyndrom. Beginnende sensible Polyneuropathie nicht ausgeschlossen.'),
      leer,
      u('Empfehlung'),
      a('Tägliche Fußkontrolle, geeignetes Schuhwerk, Kontrolle in zwölf Monaten.'),
      leer,
      a('Mit freundlichen Grüßen'),
      a('Dr. med. Kerstin Wolff'),
    ],
    fusszeile: 'Diabetologische Schwerpunktpraxis Nordstadt',
  };
}
