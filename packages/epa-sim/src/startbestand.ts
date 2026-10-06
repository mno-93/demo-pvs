import {
  allergieNachFhir,
  BEFUND_HOFFMANN,
  briefPdfErzeugen,
  briefTextzeilen,
  BEFUND_HOFFMANN_MAERZ,
  BEFUND_YILDIZ,
  CODESYSTEM,
  diagnoseNachFhir,
  impfstoffe,
  impfungNachFhir,
  laborbefundBauen,
  pdfErzeugen,
  scanPdfErzeugen,
  psRelevanzSetzen,
  uuidAlsOid,
  type Befundangabe,
  type Allergie,
  type Diagnose,
  type Impfung,
  type Ressource,
} from '@demo-pvs/kern';
import { sha256Hex } from './plattform.ts';
import { SCAN_KARDIOLOGIE_2019 } from './scanbild.ts';
import {
  entlassbriefHoffmannBrief,
  entlassbriefHoffmannFhir,
  entlassbriefSchrittmacherBrief,
  kardiologieBefundberichtBrief,
  kardiologieKontrolleBrief,
  kardiologieKontrolleFhir,
} from './briefe.ts';
import { bestandFuer, bestaendeLeeren, type Dokument, type Kodewert } from './bestand.ts';
import { befugnisErteilen, befugnisseLeeren } from './befugnis.ts';
import { chronologieAnlegen } from './chronologie.ts';
import { eintragAnlegen, listeFortschreiben } from './diagnosedienst.ts';
import { EMP, EMP_IDENTIFIER, EXT, PROFIL } from './medikation.ts';
import { eintragsUuid } from './mhd.ts';
import { jetzt, neueId } from './fhir-hilfen.ts';
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
 * - **Arzt- und Entlassbriefe** als PDF mit Fließtext, wie sie heute in der Akte liegen
 *   (`briefe.ts`); ab der Weiterentwicklung liegen **neue** Briefe zusätzlich strukturiert vor
 *   (✦ FHIR nach dem Vorbild des HL7 Europe Hospital Discharge Report), ältere bleiben PDF;
 * - **Laborbefunde** — im Release 3.1.3 als PDF, in der Vorschau auf ePA 3.2 als
 *   strukturierter Befund nach dgLP (ohne veröffentlichten formatCode).
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

const ATC = 'http://fhir.de/CodeSystem/bfarm/atc';

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
  zeitpunkt?: string,
): Ressource {
  const zeit = zeitpunkt ?? `${datum}T16:00:00`;
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
  zeitpunkt?: string,
): void {
  const zeit = zeitpunkt ?? `${datum}T16:00:00`;
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

const KARDIOLOGIE: Handelnde = {
  telematikId: 'DEMO-KARDIOLOGIE-AM-WALL',
  anzeige: 'Kardiologische Praxis am Wall',
};

/**
 * Demo-Steuerung: Eine andere Einrichtung trägt jetzt ein — damit „neu seit dem letzten Aufruf"
 * vorführbar ist. Die Kardiologie stellt einen Kontrollbefund ein und ändert den
 * Medikationsplan (Torasemid neu, Dosis eines bestehenden Eintrags geändert); ab Stufe 2 ist der
 * Befund strukturiert, ab Stufe 3 trägt sie eine Diagnose ein und markiert sie, und die Apotheke
 * impft gegen Grippe.
 */
export function fremdeEintraegeAnlegen(kvnr: string, stufe: number): string[] {
  const apotheke: Handelnde = {
    telematikId: 'DEMO-APOTHEKE-STADTGARTEN',
    anzeige: 'Stadtgarten-Apotheke',
  };
  const heute = jetzt();
  const datum = heute.slice(0, 10);
  const behrens = 'Dr. med. Jonas Behrens';
  const bestand = bestandFuer(kvnr);
  const angelegt: string[] = [];

  // Kontrollbefund der Kardiologie, eingestellt jetzt: als PDF, ab Weiterentwicklung 2 als
  // ✦ strukturierter Arztbrief.
  const brief = kardiologieKontrolleBrief(datum);
  const zeilen = briefTextzeilen(brief);
  const dokId = neueId('eab');
  const kopfdaten = {
    id: dokId,
    uniqueId: abgeleiteteUniqueId(dokId),
    titel: 'Befundbericht Kardiologie, Kontrolle',
    classCode: kode('BRI', OID_KLASSE, 'Brief'),
    typeCode: kode('BERI', OID_TYP, 'Arztberichte'),
    ordner: null,
    erstellt: heute,
    eingestellt: heute,
    autor: behrens,
    einrichtung: KARDIOLOGIE.anzeige,
    text: zeilen.join(' '),
    textzeilen: zeilen,
  };
  if (stufe >= 2) {
    const inhalt = kardiologieKontrolleFhir(kvnr, datum, dokId);
    bestand.dokumente.push({
      ...kopfdaten,
      formatCode: null,
      mimeType: 'application/fhir+json',
      groesseBytes: JSON.stringify(inhalt).length,
      inhalt,
    });
  } else {
    bestand.dokumente.push(pdfDokument({ ...kopfdaten, datei: briefPdfErzeugen(brief) }));
  }
  angelegt.push(`DocumentReference/${eintragsUuid(bestand.dokumente.at(-1)!)}`);

  // Medikationsplan: neues Mittel aus Verordnung, Dosis eines bestehenden Eintrags geändert.
  const aussage = verordnetUndAbgegeben(
    kvnr,
    neueId('k'),
    'C03CA04',
    'Torasemid 10 mg Tabletten',
    '1-0-0-0',
    datum,
    `${behrens}, ${KARDIOLOGIE.anzeige}`,
    KARDIOLOGIE,
    heute,
  );
  planeintrag(
    kvnr,
    aussage,
    'Torasemid 10 mg Tabletten',
    'C03CA04',
    '1-0-0-0',
    'Herzinsuffizienz',
    KARDIOLOGIE,
    datum,
    heute,
  );
  angelegt.push(
    `MedicationRequest/${String((aussage['basedOn'] as { reference: string }[])[0]?.reference.split('/')[1])}`,
  );
  // Bevorzugt Bisoprolol — wie im Befund empfohlen; sonst ein Eintrag mit anderer Dosierung.
  const atcVon = (r: Ressource) => {
    const id = String((r['medicationReference'] as { reference?: string })?.reference ?? '').split(
      '/',
    )[1];
    const m = bestand.medikation.find((x) => x.resourceType === 'Medication' && x.id === id);
    return (m?.['code'] as { coding?: { code?: string }[] } | undefined)?.coding?.[0]?.code;
  };
  const kandidaten = bestand.medikation.filter(
    (r) =>
      r.resourceType === 'MedicationRequest' &&
      r['intent'] === 'plan' &&
      r['status'] === 'active' &&
      !String(r.id).includes(String(aussage.id).replace(/^eml-/, '')),
  );
  const dosis = (r: Ressource) =>
    (r['dosageInstruction'] as { text?: string }[] | undefined)?.[0]?.text;
  const geaendert =
    kandidaten.find((r) => atcVon(r) === 'C07AB07') ??
    kandidaten.find((r) => dosis(r) !== '1-0-1-0') ??
    kandidaten[0];
  if (geaendert) {
    geaendert.meta = {
      ...geaendert.meta,
      versionId: String(Number(geaendert.meta?.versionId ?? '1') + 1),
      lastUpdated: heute,
    };
    geaendert['dosageInstruction'] = [{ text: '1-0-1-0' }];
    aktivitaetAnlegen(
      bestand.medikation,
      [versionierterVerweis(geaendert)],
      KARDIOLOGIE,
      'UPDATE',
      heute,
    );
    angelegt.push(`MedicationRequest/${String(geaendert.id)}`);
  }
  chronologieAnlegen(bestand.medikation, EMP, KARDIOLOGIE, heute);

  if (stufe >= 3) {
    const { eintrag } = eintragAnlegen(
      kvnr,
      psRelevanzSetzen(
        diagnoseEintrag(
          kvnr,
          {
            code: 'I50.12',
            bezeichnung: 'Linksherzinsuffizienz: Mit Beschwerden bei stärkerer Belastung',
            snomed: sct('84114007', 'Herzinsuffizienz'),
            beginn: datum,
          },
          behrens,
        ),
        true,
      ),
      KARDIOLOGIE,
      heute,
    );
    listeFortschreiben(kvnr, 'Condition', KARDIOLOGIE, heute);
    angelegt.push(`Condition/${String(eintrag.id)}`);
  }
  if (stufe >= 3) {
    const impfung = eintragAnlegen(
      kvnr,
      impfEintrag(kvnr, 'J07BB02', datum, 'Apothekerin Lisa Kaya, Stadtgarten-Apotheke', {
        charge: 'FLU-26-0815',
        dosis: 1,
      }),
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

  /*
   * Entlassbrief des Klinikums: im Release 3.1.3 als PDF mit Fließtext, ab der
   * Weiterentwicklung als ✦ FHIR-Dokument mit denselben Inhalten (`briefe.ts`).
   */
  const briefkopf = {
    titel: 'Entlassbrief stationäre Behandlung',
    classCode: kode('BRI', OID_KLASSE, 'Brief'),
    typeCode: kode('BERI', OID_TYP, 'Arztberichte'),
    ordner: null,
    erstellt: '2026-07-17T14:00:00',
    autor: 'Dr. med. Lea Wagner',
    einrichtung: 'Klinikum Sonnenschein',
  };
  const entlassbrief = entlassbriefHoffmannBrief();
  const brieftext = briefTextzeilen(entlassbrief);
  const strukturiert = entlassbriefHoffmannFhir(KVNR.hoffmann);
  hoffmann.dokumente.push(
    pdfDokument({
      ...briefkopf,
      id: 'kh-e-2026-07-17-pdf',
      uniqueId: abgeleiteteUniqueId('kh-e-2026-07-17-pdf'),
      datei: briefPdfErzeugen(entlassbrief),
      text: brieftext.join(' '),
      textzeilen: brieftext,
      ersetztAb: 'weiterentwicklung-2',
    }),
    {
      ...briefkopf,
      id: 'kh-e-2026-07-17',
      uniqueId: abgeleiteteUniqueId('kh-e-2026-07-17'),
      formatCode: null,
      mimeType: 'application/fhir+json',
      groesseBytes: JSON.stringify(strukturiert).length,
      inhalt: strukturiert,
      text: brieftext.join(' '),
      textzeilen: brieftext,
      nurIn: 'weiterentwicklung-2',
    },
  );

  // Älterer Entlassbrief (Schrittmacherimplantation 2019): nur PDF, in jedem Ausbaustand.
  const schrittmacher = entlassbriefSchrittmacherBrief();
  const schrittmacherText = briefTextzeilen(schrittmacher);
  hoffmann.dokumente.push(
    pdfDokument({
      titel: 'Entlassbrief stationäre Behandlung',
      classCode: kode('BRI', OID_KLASSE, 'Brief'),
      typeCode: kode('BERI', OID_TYP, 'Arztberichte'),
      ordner: null,
      erstellt: '2019-04-05T13:00:00',
      autor: 'Dr. med. Bernd Albers',
      einrichtung: 'Kreisklinikum Weserbogen',
      id: 'kh-e-2019-04-05-pdf',
      uniqueId: abgeleiteteUniqueId('kh-e-2019-04-05-pdf'),
      datei: briefPdfErzeugen(schrittmacher),
      text: schrittmacherText.join(' '),
      textzeilen: schrittmacherText,
    }),
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

  /*
   * Eingescannter Altbefund ohne Textebene: ein PDF, das nur das Bild der Seite trägt. Ein Mensch
   * liest ihn, ein Dienst nicht — weder die Volltextsuche noch der ✦ Aktenlotse. Genau dafür ist
   * er da: Er macht sichtbar, dass eine Antwort nie den ganzen Bestand abdeckt, und erscheint in
   * der Umfangsangabe des Lotsen als übergangene Quelle. Die handschriftliche Notiz zu ASS steht
   * nur hier (`scanbild.ts`).
   *
   * Hochgeladen hat ihn die frühere Hausarztpraxis; Verfasserin ist die Kardiologin. Der
   * Eingangsstempel der Hausarztpraxis steht auf dem Scan.
   */
  hoffmann.dokumente.push(
    pdfDokument({
      titel: 'Vorbefund Kardiologie (eingescannt)',
      classCode: kode('BEF', OID_KLASSE, 'Befundbericht'),
      typeCode: kode('BERI', OID_TYP, 'Arztberichte'),
      ordner: null,
      erstellt: '2019-04-11T09:00:00',
      autor: 'Dr. med. U. Brinkmann',
      einrichtung: 'Kardiologische Praxis Dr. Brinkmann, Oldenburg',
      id: 'scan-2019-04-11',
      uniqueId: abgeleiteteUniqueId('scan-2019-04-11'),
      datei: scanPdfErzeugen(
        atob(SCAN_KARDIOLOGIE_2019.jpegBase64),
        SCAN_KARDIOLOGIE_2019.breite,
        SCAN_KARDIOLOGIE_2019.hoehe,
      ),
    }),
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

  /*
   * Befundbericht der Kardiologie als eArztbrief: In der Akte liegt das PDF/A, das nach der
   * Richtlinie alle Inhalte trägt. Strukturierte Einträge gibt es nicht — die
   * Echokardiographie steht nur im Text, auch in der Weiterentwicklung (älterer Brief).
   */
  const kardio = kardiologieBefundberichtBrief();
  const kardioText = briefTextzeilen(kardio);
  hoffmann.dokumente.push(
    pdfDokument({
      id: 'eab-2026-06-03',
      uniqueId: abgeleiteteUniqueId('eab-2026-06-03'),
      titel: 'Befundbericht Kardiologie',
      classCode: kode('BRI', OID_KLASSE, 'Brief'),
      typeCode: kode('BERI', OID_TYP, 'Arztberichte'),
      ordner: null,
      erstellt: '2026-06-03T10:30:00',
      autor: 'Dr. med. Jonas Behrens',
      einrichtung: 'Kardiologische Praxis am Wall',
      datei: briefPdfErzeugen(kardio),
      text: kardioText.join(' '),
      textzeilen: kardioText,
    }),
  );

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
