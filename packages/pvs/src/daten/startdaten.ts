import {
  BEFUND_YILDIZ,
  CODESYSTEM,
  laborbefundBauen,
  type Allergie,
  type Behandlungsfall,
  type Diagnose,
  type Herkunft,
  type Karteikarteneintrag,
  type Kodierung,
  type LokalesDokument,
  type Leistungsziffer,
  type Nutzer,
  type Patient,
  type Termin,
  type Impfung,
  DEMO_HEUTE,
} from '@demo-pvs/kern';
import type { EpaBefugnis, Zustand } from '../speicher/zustand.js';

/**
 * Startdaten der Demo-Praxis. Alle Personen, Einrichtungen und Befunde sind erfunden.
 *
 * Die Krankenversichertennummern sind mit `kvnrBilden` aus dem Kern gebildet und daher
 * in sich stimmig.
 */

export const HEUTE = DEMO_HEUTE;
const PRAXIS = 'Hausarztpraxis am Stadtgarten';

export const nutzerliste: Nutzer[] = [
  { id: 'n1', name: 'Dr. med. Anna Brandt', rolle: 'aerztin', lanr: '999999901' },
  { id: 'n2', name: 'Sabine Rothe', rolle: 'mfa', lanr: null },
];

function lokal(zeitpunkt: string, verantwortlich = 'Dr. med. Anna Brandt'): Herkunft {
  return { bestand: 'lokal', quelle: PRAXIS, zeitpunkt, verantwortlich, dokumentId: null };
}

export const patienten: Patient[] = [
  {
    id: 'p-hoffmann',
    nachname: 'Hoffmann',
    vorname: 'Renate',
    geburtsdatum: '1958-03-14',
    geschlecht: 'weiblich',
    anschrift: { strasse: 'Gartenweg', hausnummer: '4', plz: '28195', ort: 'Bremen' },
    telefon: '0421 5550101',
    versicherung: {
      kvnr: 'A123456780',
      kostentraeger: 'Beispielkasse Nordwest',
      kostentraegerkennung: '109999901',
      versichertenart: 'Rentner:in',
      zuzahlungsbefreit: true,
      gueltigBis: '2029-12-31',
      zuletztEingelesen: null,
    },
    angelegtAm: '2026-08-30T08:15:00',
    hinweis: 'Neu in der Praxis, Übernahme aus Vorbehandlung. Vorbefunde liegen vor.',
  },
  {
    id: 'p-krueger',
    nachname: 'Krüger',
    vorname: 'Tobias',
    geburtsdatum: '1992-11-02',
    geschlecht: 'maennlich',
    anschrift: { strasse: 'Lindenallee', hausnummer: '17a', plz: '28203', ort: 'Bremen' },
    telefon: '0421 5550202',
    versicherung: {
      kvnr: 'K876543217',
      kostentraeger: 'Beispielkasse Nordwest',
      kostentraegerkennung: '109999901',
      versichertenart: 'Mitglied',
      zuzahlungsbefreit: false,
      gueltigBis: '2028-06-30',
      zuletztEingelesen: '2026-07-14T09:02:00',
    },
    angelegtAm: '2018-04-11T10:00:00',
    hinweis: null,
  },
  {
    id: 'p-yildiz',
    nachname: 'Yildiz',
    vorname: 'Meral',
    geburtsdatum: '1969-06-25',
    geschlecht: 'weiblich',
    anschrift: { strasse: 'Am Deich', hausnummer: '88', plz: '28199', ort: 'Bremen' },
    telefon: '0421 5550303',
    versicherung: {
      kvnr: 'M555123402',
      kostentraeger: 'Beispielkasse Süd',
      kostentraegerkennung: '109999902',
      versichertenart: 'Mitglied',
      zuzahlungsbefreit: false,
      gueltigBis: '2027-09-30',
      zuletztEingelesen: '2026-07-02T08:40:00',
    },
    angelegtAm: '2012-02-20T11:30:00',
    hinweis: 'Bevorzugt Termine am Vormittag.',
  },
  {
    // Ohne ePA: Das Aktensystem kennt keine Akte (Widerspruch gegen die Akte insgesamt).
    id: 'p-weber',
    nachname: 'Weber',
    vorname: 'Lena',
    geburtsdatum: '1985-01-19',
    geschlecht: 'weiblich',
    anschrift: { strasse: 'Hafenstraße', hausnummer: '3', plz: '28217', ort: 'Bremen' },
    telefon: '0421 5550404',
    versicherung: {
      kvnr: 'W246813578',
      kostentraeger: 'Beispielkasse Nordwest',
      kostentraegerkennung: '109999901',
      versichertenart: 'Mitglied',
      zuzahlungsbefreit: false,
      gueltigBis: '2030-03-31',
      zuletztEingelesen: null,
    },
    angelegtAm: '2026-09-09T07:50:00',
    hinweis: null,
  },
];

export const faelle: Behandlungsfall[] = [
  {
    id: 'fall-krueger-q3',
    patientId: 'p-krueger',
    jahr: 2026,
    quartal: 3,
    fallart: 'ambulant',
    beginn: '2026-07-14',
    ueberweiserLanr: null,
  },
  {
    id: 'fall-yildiz-q3',
    patientId: 'p-yildiz',
    jahr: 2026,
    quartal: 3,
    fallart: 'ambulant',
    beginn: '2026-07-02',
    ueberweiserLanr: null,
  },
];

const sct = (code: string, anzeige: string): Kodierung => ({
  system: CODESYSTEM.snomed,
  code,
  anzeige,
});

/** Grundmuster einer Diagnose; jede Zeile unten nennt nur, was abweicht. */
function diagnose(
  teil: Partial<Diagnose> & Pick<Diagnose, 'id' | 'patientId' | 'code' | 'bezeichnung' | 'beginn'>,
): Diagnose {
  return {
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
    feststellendePerson: 'Dr. med. Anna Brandt',
    notiz: null,
    epaId: null,
    epaFassung: null,
    herkunft: lokal(`${teil.beginn}T09:00:00`),
    ...teil,
  };
}

/**
 * Diagnosen, mit dem Kodierservice erfasst: ICD-10-GM und SNOMED CT nebeneinander.
 * Die akute Bronchitis von Frau Hoffmann stammt aus der Zeit vor dem Kodierservice und
 * trägt nur die ICD-10-GM — so sieht Altbestand aus.
 */
export const diagnosen: Diagnose[] = [
  diagnose({
    id: 'diag-h1',
    patientId: 'p-hoffmann',
    code: 'I10.90',
    bezeichnung: 'Essentielle Hypertonie, ohne Angabe einer hypertensiven Krise',
    snomed: sct('59621000', 'Essentielle Hypertonie'),
    beginn: '2009-02-03',
    dokumentiertAm: '2026-08-30',
    feststellendePerson: 'Hausarztpraxis Dr. Kolbe (Vorbehandlung)',
    notiz: 'Aus der Vorbehandlung übernommen.',
    herkunft: lokal('2026-08-30T08:40:00'),
  }),
  diagnose({
    id: 'diag-h2',
    patientId: 'p-hoffmann',
    code: 'E11.90',
    bezeichnung: 'Diabetes mellitus, Typ 2: Ohne Komplikationen, nicht als entgleist bezeichnet',
    snomed: sct('44054006', 'Diabetes mellitus Typ 2'),
    beginn: '2011-05-12',
    dokumentiertAm: '2026-08-30',
    feststellendePerson: 'Hausarztpraxis Dr. Kolbe (Vorbehandlung)',
    herkunft: lokal('2026-08-30T08:42:00'),
  }),
  diagnose({
    id: 'diag-h3',
    patientId: 'p-hoffmann',
    code: 'N18.3',
    bezeichnung: 'Chronische Nierenkrankheit, Stadium 3',
    snomed: sct('433144002', 'Chronische Nierenkrankheit, Stadium 3'),
    beginn: '2023-09-24',
    dokumentiertAm: '2026-08-30',
    feststellendePerson: 'Hausarztpraxis Dr. Kolbe (Vorbehandlung)',
    notiz: 'Laut Vorbehandlung. Ein aktueller Laborbefund liegt in der ePA.',
    herkunft: lokal('2026-08-30T08:44:00'),
  }),
  diagnose({
    id: 'diag-h4',
    patientId: 'p-hoffmann',
    code: 'J20.9',
    bezeichnung: 'Akute Bronchitis, nicht näher bezeichnet',
    art: 'akut',
    klinischerStatus: 'behoben',
    beginn: '2025-11-08',
    ende: '2025-11-22',
    dokumentiertAm: '2026-08-30',
    feststellendePerson: 'Hausarztpraxis Dr. Kolbe (Vorbehandlung)',
    herkunft: lokal('2026-08-30T08:45:00'),
  }),
  diagnose({
    id: 'diag-k1',
    patientId: 'p-krueger',
    fallId: 'fall-krueger-q3',
    code: 'J45.9',
    bezeichnung: 'Asthma bronchiale, nicht näher bezeichnet',
    snomed: sct('195967001', 'Asthma bronchiale'),
    schweregrad: sct('255604002', 'Leichtgradig'),
    beginn: '2015-03-19',
    herkunft: lokal('2015-03-19T11:00:00'),
  }),
  diagnose({
    id: 'diag-k2',
    patientId: 'p-krueger',
    fallId: 'fall-krueger-q3',
    code: 'J30.1',
    bezeichnung: 'Allergische Rhinopathie durch Pollen',
    snomed: sct('21719001', 'Allergische Rhinitis durch Pollen'),
    beginn: '2014-05-06',
    herkunft: lokal('2014-05-06T09:30:00'),
  }),
  diagnose({
    id: 'diag-y1',
    patientId: 'p-yildiz',
    fallId: 'fall-yildiz-q3',
    code: 'I10.90',
    bezeichnung: 'Essentielle Hypertonie, ohne Angabe einer hypertensiven Krise',
    snomed: sct('59621000', 'Essentielle Hypertonie'),
    beginn: '2016-08-30',
    herkunft: lokal('2016-08-30T10:15:00'),
    // Seit Quartalsbeginn in der Diagnosenliste der ePA geführt (✦ Diagnose-Service).
    epaId: 'cond-y-2',
    epaFassung: '1',
  }),
  diagnose({
    id: 'diag-y2',
    patientId: 'p-yildiz',
    fallId: 'fall-yildiz-q3',
    code: 'E03.9',
    bezeichnung: 'Hypothyreose, nicht näher bezeichnet',
    snomed: sct('40930008', 'Hypothyreose'),
    beginn: '2019-01-22',
    herkunft: lokal('2019-01-22T09:10:00'),
    epaId: 'cond-y-1',
    epaFassung: '1',
  }),
];

/**
 * Allergien mit Substanzen aus KBV_VS_AllergyIntolerance_Substance_SNOMED_CT und Manifestationen aus
 * KBV_VS_AllergyIntolerance_Manifestation_SNOMED_CT. Frau Yildiz' Pflasterkleber steht nicht in der Werteliste und ist
 * als Freitext erfasst — die Bindung ist extensible, eine AMTS-Prüfung erreicht er nicht.
 */
export const allergien: Allergie[] = [
  {
    id: 'allg-h1',
    patientId: 'p-hoffmann',
    substanz: 'Amoxicillin',
    snomed: sct('372687004', 'Amoxicillin'),
    typ: 'Unverträglichkeit',
    kategorien: ['Medikation'],
    gewissheit: 'unbestätigt',
    kritikalitaet: 'Risiko nicht einschätzbar',
    reaktionen: [
      {
        manifestationen: [sct('725119006', 'Generalisierter Ausschlag')],
        schweregrad: 'leicht',
        datum: null,
        expositionsweg: sct('26643006', 'Oraler Verabreichungsweg'),
      },
    ],
    klinischerStatus: 'aktiv',
    beginn: null,
    ende: null,
    dokumentiertAm: '2026-08-30',
    feststellendePerson: null,
    notiz:
      'Anamnestisch berichtet: Hautausschlag nach Amoxicillin in der Kindheit, nicht ärztlich dokumentiert.',
    epaId: null,
    epaFassung: null,
    herkunft: lokal('2026-08-30T08:50:00'),
  },
  {
    id: 'allg-h2',
    patientId: 'p-hoffmann',
    substanz: 'Nickelverbindung',
    snomed: sct('43921001', 'Nickelverbindung'),
    typ: 'Allergie',
    kategorien: ['Umwelt/Chemikalie'],
    gewissheit: 'bestätigt',
    kritikalitaet: 'niedriges Risiko',
    reaktionen: [
      {
        manifestationen: [sct('43116000', 'Juckflechte')],
        schweregrad: 'leicht',
        datum: '2015-09-14',
        expositionsweg: sct('448598008', 'Kutaner Verabreichungsweg'),
      },
    ],
    klinischerStatus: 'aktiv',
    beginn: '2015-09-14',
    ende: null,
    dokumentiertAm: '2026-08-30',
    feststellendePerson: 'Hautarztpraxis (Epikutantest)',
    notiz: 'Epikutantest 09/2015.',
    epaId: null,
    epaFassung: null,
    herkunft: lokal('2026-08-30T08:52:00'),
  },
  {
    id: 'allg-k1',
    patientId: 'p-krueger',
    substanz: 'Gräserpollen',
    snomed: sct('256277009', 'Gräserpollen'),
    typ: 'Allergie',
    kategorien: ['Umwelt/Chemikalie'],
    gewissheit: 'bestätigt',
    kritikalitaet: 'niedriges Risiko',
    reaktionen: [
      {
        manifestationen: [sct('70076002', 'Rhinitis'), sct('9826008', 'Conjunktivitis')],
        schweregrad: 'mittelschwer',
        datum: null,
        expositionsweg: null,
      },
    ],
    klinischerStatus: 'aktiv',
    beginn: '2014-05-06',
    ende: null,
    dokumentiertAm: '2014-05-06',
    feststellendePerson: 'Dr. med. Anna Brandt',
    notiz: null,
    epaId: null,
    epaFassung: null,
    herkunft: lokal('2014-05-06T09:35:00'),
  },
  {
    id: 'allg-y1',
    patientId: 'p-yildiz',
    substanz: 'Pflasterkleber (Acrylat)',
    snomed: null,
    typ: 'Unverträglichkeit',
    kategorien: ['Umwelt/Chemikalie'],
    gewissheit: 'unbestätigt',
    kritikalitaet: 'niedriges Risiko',
    reaktionen: [
      {
        manifestationen: [sct('418363000', 'Juckreiz der Haut')],
        schweregrad: 'leicht',
        datum: '2024-03-11',
        expositionsweg: sct('448598008', 'Kutaner Verabreichungsweg'),
      },
    ],
    klinischerStatus: 'aktiv',
    beginn: '2024-03-11',
    ende: null,
    dokumentiertAm: '2024-03-11',
    feststellendePerson: 'Dr. med. Anna Brandt',
    notiz: 'Nach Blutentnahme; Pflaster nicht vertragen.',
    epaId: null,
    epaFassung: null,
    herkunft: lokal('2024-03-11T10:20:00'),
  },
];

export const leistungen: Leistungsziffer[] = [
  {
    id: 'leist-k1',
    patientId: 'p-krueger',
    fallId: 'fall-krueger-q3',
    ziffer: '03000',
    bezeichnung: 'Versichertenpauschale (hausärztlich)',
    datum: '2026-07-14',
    anzahl: 1,
    erfasstVon: 'Sabine Rothe',
  },
  {
    id: 'leist-y1',
    patientId: 'p-yildiz',
    fallId: 'fall-yildiz-q3',
    ziffer: '03000',
    bezeichnung: 'Versichertenpauschale (hausärztlich)',
    datum: '2026-07-02',
    anzahl: 1,
    erfasstVon: 'Sabine Rothe',
  },
];

export const karteikarte: Karteikarteneintrag[] = [
  {
    id: 'kk-h1',
    patientId: 'p-hoffmann',
    fallId: null,
    zeitpunkt: '2026-08-30T08:30:00',
    kuerzel: 'A',
    text: 'Erstvorstellung nach Umzug. Übernahme in die hausärztliche Betreuung gewünscht. Stationäre Behandlung vor sechs Wochen, Entlassbrief liegt vor.',
    verfasser: 'Dr. med. Anna Brandt',
  },
  {
    id: 'kk-h2',
    patientId: 'p-hoffmann',
    fallId: null,
    zeitpunkt: '2026-08-30T08:38:00',
    kuerzel: 'S',
    text: 'Vorbefunde und Dauerdiagnosen aus der Vorbehandlung übernommen.',
    verfasser: 'Sabine Rothe',
  },
  {
    id: 'kk-k1',
    patientId: 'p-krueger',
    fallId: 'fall-krueger-q3',
    zeitpunkt: '2026-07-14T09:05:00',
    kuerzel: 'A',
    text: 'Rezeptwunsch Asthmaspray. Beschwerden aktuell gering, Belastbarkeit unauffällig.',
    verfasser: 'Dr. med. Anna Brandt',
  },
  {
    id: 'kk-y1',
    patientId: 'p-yildiz',
    fallId: 'fall-yildiz-q3',
    zeitpunkt: '2026-07-02T08:50:00',
    kuerzel: 'B',
    text: 'RR 138/84 mmHg, Puls 72/min, regelmäßig. Gewicht 74 kg.',
    verfasser: 'Dr. med. Anna Brandt',
  },
];

/**
 * Dokumente, die bereits im Praxissystem liegen. Frau Hoffmann bringt eine eingescannte
 * Unterlage mit, die es in der ePA nicht gibt — damit ist der Abgleich von Beginn an in
 * beide Richtungen belegt. Frau Yildiz' Laborbefund kam vom Labor direkt; dasselbe Labor hat
 * ihn in die ePA eingestellt. Der Abgleich erkennt beide als ein Dokument.
 *
 * Laborwerte gibt es nur in solchen Befunden. Ein Feld, sie von Hand zu erfassen, gibt es
 * nicht (Festlegung vom 10.09.2026).
 */
export const dokumente: LokalesDokument[] = [
  {
    id: 'dok-h-1',
    patientId: 'p-hoffmann',
    titel: 'Medikationsübersicht der Vorbehandlung (Scan)',
    art: 'Scan',
    ursprung: 'praxis',
    datum: '2026-08-30',
    epaId: null,
    einrichtung: 'Hausarztpraxis am Stadtgarten',
    autor: 'Sabine Rothe',
    dateiname: 'medikationsuebersicht_2026-08-30.pdf',
    inhaltstyp: 'application/pdf',
    groesseBytes: 184320,
    gespeichertAm: '2026-08-30T08:35:00',
    gespeichertVon: 'Sabine Rothe',
    inhalt: null,
    notiz: 'Von der Patientin mitgebracht, bei der Erstvorstellung eingescannt.',
  },
  {
    id: 'dok-y-1',
    patientId: 'p-yildiz',
    titel: 'Laborbefund Schilddrüse',
    art: 'Laborbefund',
    ursprung: 'labor',
    datum: '2026-07-02',
    epaId: null,
    einrichtung: 'Laborgemeinschaft Nordwest',
    autor: 'Dr. rer. nat. Kai Petersen',
    dateiname: 'laborbefund_2026-07-02.json',
    inhaltstyp: 'application/fhir+json',
    groesseBytes: JSON.stringify(laborbefundBauen(BEFUND_YILDIZ)).length,
    gespeichertAm: '2026-07-02T13:45:00',
    gespeichertVon: 'Laborbefundeingang',
    inhalt: laborbefundBauen(BEFUND_YILDIZ),
    notiz: null,
  },
];

/**
 * Befugnisse aus früheren Kartenlesungen — dieselben, die der Simulator im Startbestand führt.
 * 90 Tage nach Konzept 3.1.3; das Ende rechnet die OpenAPI als Tag des Einlesens plus 89 Tage,
 * 23:59:59 deutscher Zeit. Frau Hoffmann ist neu: Für sie gibt es noch keine.
 */
export const epaBefugnisse: EpaBefugnis[] = [
  {
    patientId: 'p-krueger',
    gueltigBis: '2026-10-11T23:59:59+02:00',
    erteiltAm: '2026-07-14T09:02:00+02:00',
  },
  {
    patientId: 'p-yildiz',
    gueltigBis: '2026-09-29T23:59:59+02:00',
    erteiltAm: '2026-07-02T08:40:00+02:00',
  },
];

/**
 * Impfungen der Praxis. Frau Yildiz wurde hier gegen Grippe geimpft; in der Impfliste der ePA
 * steht die Impfung noch nicht — „in die ePA" ist die Handlung, um die es geht.
 */
export const impfungen: Impfung[] = [
  {
    id: 'impf-y-1',
    patientId: 'p-yildiz',
    impfstoff: {
      bezeichnung: 'Influenza-Impfstoff, inaktiviert, Saison 2025/2026',
      atc: 'J07BB02',
      atcVersion: '2026',
      pzn: '90900102',
    },
    zielkrankheiten: [{ system: CODESYSTEM.snomed, code: '6142004', anzeige: 'Influenza' }],
    datum: '2025-10-15',
    dosis: null,
    charge: 'FLU-25-1510',
    geimpftVon: 'Dr. med. Anna Brandt',
    status: 'erfolgt',
    herkunft: lokal('2025-10-15T10:20:00'),
    epaId: null,
    notiz: null,
  },
];

export const termine: Termin[] = [
  {
    id: 't1',
    patientId: 'p-hoffmann',
    datum: HEUTE,
    uhrzeit: '08:40',
    dauerMinuten: 20,
    art: 'sprechstunde',
    status: 'wartend',
    anlass: 'Folgeverordnung, Übernahme in die Betreuung',
  },
  {
    id: 't2',
    patientId: 'p-krueger',
    datum: HEUTE,
    uhrzeit: '09:00',
    dauerMinuten: 10,
    art: 'sprechstunde',
    status: 'geplant',
    anlass: 'Rezeptwunsch',
  },
  {
    id: 't3',
    patientId: 'p-yildiz',
    datum: HEUTE,
    uhrzeit: '09:20',
    dauerMinuten: 20,
    art: 'blutentnahme',
    status: 'geplant',
    anlass: 'Kontrolle Schilddrüsenwerte',
  },
  {
    id: 't5',
    patientId: 'p-weber',
    datum: HEUTE,
    uhrzeit: '09:40',
    dauerMinuten: 20,
    art: 'sprechstunde',
    status: 'geplant',
    anlass: 'Erstkontakt',
  },
  {
    id: 't4',
    patientId: 'p-krueger',
    datum: '2026-09-16',
    uhrzeit: '11:00',
    dauerMinuten: 20,
    art: 'vorsorge',
    status: 'geplant',
    anlass: 'Gesundheitsuntersuchung',
  },
];

export function startzustand(): Zustand {
  const ersterNutzer = nutzerliste[0];
  if (!ersterNutzer) throw new Error('Die Nutzerliste ist leer.');
  return {
    nutzer: ersterNutzer,
    nutzerliste,
    heute: HEUTE,
    patienten,
    faelle,
    karteikarte,
    diagnosen,
    allergien,
    dokumente,
    medikationsspiegel: [],
    epaBefugnisse,
    leistungen,
    termine,
    rezepte: [],
    impfungen,
    epaGesehen: [],
    listenordnung: [],
    handlungen: 0,
    protokoll: [],
    vorfuehrmodus: false,
  };
}
