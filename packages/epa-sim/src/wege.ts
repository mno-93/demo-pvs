/**
 * ePA-Simulator — Prüfkette und Wege.
 *
 * Hängt an einem Fastify-Server (`anwendung.ts`, lokal) ebenso wie am Browser-Adapter
 * (`browser.ts`, gehostete Demo). Deshalb hier nur Typen aus Fastify, keine Laufzeit.
 *
 * Bildet das Verhalten des Aktensystems nach, ohne mit der Telematikinfrastruktur zu
 * sprechen. Lokal ein eigener Prozess, damit die Grenze zwischen Primärsystem und Aktensystem
 * überprüfbar ist (ADR 0002); in der gehosteten Demo ein eigenes Modul hinter derselben
 * HTTP-Schnittstelle (ADR 0025).
 *
 * Maßstab ist das Release ePA 3.1.3 mit seinen Implementation Guides (ADR 0013). Jeder Weg
 * trägt seine Grundlage; was nicht belegt ist, gibt es nicht. Die Ausbaustände der
 * Weiterentwicklung schalten Schritt für Schritt Vorschau und Vorschläge frei (ADR 0034):
 * Laborbefunde und Volltextsuche, strukturierte Briefe, Listen mit Patient Summary,
 * Aktenlotse. Fachliche Wege antworten nur mit gültiger Befugnis (ADR 0017).
 */
import type { FastifyInstance } from 'fastify';
import { alleBestaende, bestandFuer, bestandVorhanden } from './bestand.ts';
import {
  BEFUGNIS_WEG,
  alleBefugnisse,
  befugnisEinhaengen,
  befugnisseEntziehen,
  gueltigeBefugnis,
} from './befugnis.ts';
import { AB_STUFE, STANDARD_BETRIEBSLAGE, STUFE, abStufe, betriebslage } from './betrieb.ts';
import {
  DIAGNOSEDIENST_BASIS,
  IMPFLISTE_BASIS,
  diagnosedienstEinhaengen,
  impflisteEinhaengen,
} from './diagnosedienst.ts';
import { AKTENLOTSE_BASIS, aktenlotseEinhaengen } from './aktenlotse.ts';
import { KONTAKT_BASIS, kontaktEinhaengen } from './kontakt.ts';
import { ERP_BASIS, erezeptEinhaengen, erezepteLeeren } from './erezept.ts';
import { INFORMATION_BASIS, informationEinhaengen } from './information.ts';
import { PATIENT_SUMMARY_BASIS, patientSummaryEinhaengen } from './patient-summary.ts';
import { operationOutcome } from './fhir-hilfen.ts';
import { MEDIKATION_BASIS, medikationEinhaengen } from './medikation.ts';
import { MHD_ABRUF, MHD_BASIS, mhdEinhaengen } from './mhd.ts';
import { fremdeEintraegeAnlegen, startbestandAufbauen } from './startbestand.ts';

const istEpaWeg = (url: string) => url.startsWith('/epa/');
/** Wege des Aktensystems und des Fachdienstes, deren Antworten nicht zwischengespeichert werden. */
const istFernweg = (url: string) =>
  istEpaWeg(url) || url.startsWith('/information/') || url.startsWith('/erp/');

/** Adressierung der Akte über `x-insurantid` — Pflicht auf allen ePA-Wegen (OpenAPI ePA-Basic 3.1.3). */
function kvnrAus(anfrage: { headers: Record<string, unknown> }): string {
  return String(anfrage.headers['x-insurantid'] ?? '');
}

/**
 * Demo-Ersatz für die Sitzung am Aktensystem. Im Wirkbetrieb meldet sich das Primärsystem
 * über den Authorization Service mit der SMC-B an (ID-Token, VAU-Kanal); Name, Rolle und
 * Telematik-ID stehen dann in der Sitzung. Die Demo hat weder IDP noch VAU und trägt die
 * Telematik-ID deshalb in der Kopfzeile `x-demo-sitzung` — ausdrücklich keine ePA-Schnittstelle.
 */
function sitzungAus(anfrage: { headers: Record<string, unknown> }): string {
  return String(anfrage.headers['x-demo-sitzung'] ?? '');
}

/**
 * ✦ Demo-Ersatz für den **zweiten Zugangsweg** zur Akte: die versicherte Person selbst oder
 * eine Person mit Vertretung, in ihrer eigenen Anwendung.
 *
 * Dieser Weg läuft im Wirkbetrieb nicht über die Befugnis einer Einrichtung — die entsteht
 * durch das Stecken der eGK und gilt für eine Praxis. Versicherte melden sich über ihre
 * GesundheitsID an; eine Vertretung wird in der Akte hinterlegt. Die Demo bildet weder IDP
 * noch Vertretungsverwaltung nach und trägt die Kennung deshalb in `x-demo-versicherte`.
 *
 * ⚠ Keine ePA-Schnittstelle. Der Wert wird ausschließlich gegen `x-insurantid` geprüft:
 * Wer sich als Versicherte:r meldet, kommt genau an eine Akte — die eigene oder die, für die
 * die Vertretung gilt. Ein Weg zu einer dritten Akte entsteht dadurch nicht.
 */
function versichertenzugang(anfrage: { headers: Record<string, unknown> }): string {
  return String(anfrage.headers['x-demo-versicherte'] ?? '');
}

/**
 * x-useragent: ClientId und Version (OpenAPI ePA-Basic 3.1.3, `UserAgentType`). Der Medication
 * Service verlangt eine ClientId von genau 20 Zeichen (CapabilityStatement, IG 1.3.5).
 */
const USER_AGENT = /^[a-zA-Z0-9-]{1,20}\/[a-zA-Z0-9\-.]{1,15}$/;

/** Fehlerkörper der Basisdienste und für `notEntitled` (OpenAPI: `ErrorType`). */
function fehler(errorCode: string, errorDetail: string) {
  return { errorCode, errorDetail };
}

/** Hängt Prüfkette, Dienste und Demo-Steuerung an eine Anwendung. */
export function wegeEinhaengen(app: FastifyInstance): void {
  app.addHook('onRequest', async (anfrage, antwort) => {
    if (betriebslage.verzoegerungMs > 0) {
      await new Promise((fertig) => setTimeout(fertig, betriebslage.verzoegerungMs));
    }
    if (!istEpaWeg(anfrage.url)) return;

    const pfad = anfrage.url.split('?')[0] ?? '';
    const noetigeStufe =
      pfad.startsWith(AKTENLOTSE_BASIS) || pfad.startsWith(KONTAKT_BASIS)
        ? AB_STUFE.aktenlotse
        : pfad.startsWith(IMPFLISTE_BASIS) || pfad.startsWith(DIAGNOSEDIENST_BASIS)
          ? AB_STUFE.listen
          : pfad.startsWith(PATIENT_SUMMARY_BASIS)
            ? AB_STUFE.patientSummary
            : 0;
    if (!abStufe(noetigeStufe)) {
      return antwort
        .code(404)
        .send(
          operationOutcome(
            'error',
            'not-found',
            `Diesen Dienst gibt es im Release 3.1.3 nicht. Er ist ein Vorschlag und antwortet erst ab dem Ausbaustand „Weiterentwicklung ${noetigeStufe}".`,
          ),
        );
    }
    // Die Fähigkeiten eines Dienstes sind ohne Aktenbezug abfragbar — ebenso die ✦
    // Kontaktauskunft: Ein Verzeichnis braucht keine Akte.
    if (pfad.endsWith('/metadata') || pfad.startsWith(KONTAKT_BASIS)) return;

    if (!USER_AGENT.test(String(anfrage.headers['x-useragent'] ?? ''))) {
      return antwort
        .code(400)
        .send(
          fehler(
            'malformedRequest',
            'Die Kopfzeile x-useragent fehlt oder ist nicht im Format ClientId/Version.',
          ),
        );
    }
    if (!sitzungAus(anfrage)) {
      return antwort
        .code(403)
        .send(
          fehler(
            'invalAuth',
            'Keine Sitzung mit gültigem ID-Token (Demo: Kopfzeile x-demo-sitzung fehlt).',
          ),
        );
    }
    const kvnr = kvnrAus(anfrage);
    if (!kvnr) {
      return antwort
        .code(400)
        .send(
          fehler('malformedRequest', 'Die Kopfzeile x-insurantid fehlt. Sie adressiert die Akte.'),
        );
    }
    if (!bestandVorhanden(kvnr)) {
      return antwort.code(404).send(fehler('noHealthRecord', `Für ${kvnr} besteht keine Akte.`));
    }
    // Eine vorübergehend gesperrte Akte antwortet auf jedem Weg gleich (I_Information_Service).
    if (bestandFuer(kvnr).status !== 'ACTIVATED') {
      return antwort
        .code(409)
        .send(fehler('statusMismatch', 'Die Akte ist vorübergehend nicht nutzbar (SUSPENDED).'));
    }
    // Die Befugnis selbst entsteht ohne bestehende Befugnis — dafür ist sie da.
    if (pfad === BEFUGNIS_WEG) return;

    /*
     * Zwei Zugangswege, eine Prüfung: entweder eine gültige Befugnis der Einrichtung — oder
     * der ✦ Versichertenzugang auf genau die eigene Akte. Beides führt zu denselben Daten;
     * der Weg entscheidet nicht über den Inhalt.
     */
    const alsVersicherte = versichertenzugang(anfrage) === kvnr;
    if (!alsVersicherte && !gueltigeBefugnis(kvnr, sitzungAus(anfrage))) {
      return antwort
        .code(403)
        .send(
          fehler(
            'notEntitled',
            'Für diese Einrichtung besteht keine gültige Befugnis. Sie entsteht durch das Stecken der eGK und gilt 90 Tage.',
          ),
        );
    }
    /*
     * Widerspruch gegen den Medikationsprozess: Der Medication Service ist für Einrichtungen
     * gesperrt, die Daten bleiben erhalten (IG 1.3.5, Statuscodes: 423 locked; Konzept 3.1.3,
     * Consent Management).
     */
    if (
      pfad.startsWith(MEDIKATION_BASIS) &&
      bestandFuer(kvnr).widersprueche.medication === 'deny'
    ) {
      return antwort
        .code(423)
        .send(
          fehler(
            'locked',
            'Die versicherte Person hat dem digital gestützten Medikationsprozess widersprochen.',
          ),
        );
    }
  });

  /**
   * X-Request-ID: vom Client je Anfrage vergeben, vom Dienst unverändert zurückzugeben
   * (OpenAPI ePA 3.1.3; CapabilityStatement Medication Service 1.3.5).
   */
  app.addHook('onSend', async (anfrage, antwort, koerper) => {
    const kennung = anfrage.headers['x-request-id'];
    if (typeof kennung === 'string') void antwort.header('X-Request-ID', kennung);
    // Personenbezogene Gesundheitsdaten werden nicht zwischengespeichert. Ohne diese Angabe
    // bediente der Browser eine Planabfrage nach einer Änderung aus seinem Speicher.
    if (istFernweg(anfrage.url)) void antwort.header('Cache-Control', 'no-store');
    // FHIR-Antworten im FHIR-Inhaltstyp; Fehlercodes der Basisdienste bleiben application/json.
    if (
      istFernweg(anfrage.url) &&
      typeof koerper === 'string' &&
      koerper.startsWith('{"resourceType"') &&
      String(antwort.getHeader('content-type') ?? '').startsWith('application/json')
    ) {
      void antwort.header('content-type', 'application/fhir+json; charset=utf-8');
    }
    return koerper;
  });

  befugnisEinhaengen(app, kvnrAus, sitzungAus);
  mhdEinhaengen(app, kvnrAus);
  medikationEinhaengen(app, kvnrAus, sitzungAus);
  diagnosedienstEinhaengen(app, kvnrAus, sitzungAus);
  impflisteEinhaengen(app, kvnrAus, sitzungAus);
  patientSummaryEinhaengen(app, kvnrAus);
  aktenlotseEinhaengen(app);
  kontaktEinhaengen(app);
  informationEinhaengen(app);
  erezeptEinhaengen(app, sitzungAus);

  /* ---------- Demo-Steuerung — keine ePA-Schnittstelle ---------- */

  app.get('/verwaltung/betriebslage', async () => betriebslage);

  app.post('/verwaltung/betriebslage', async (anfrage) => {
    const k = anfrage.body as Partial<typeof betriebslage>;
    if (typeof k.verzoegerungMs === 'number') betriebslage.verzoegerungMs = k.verzoegerungMs;
    if (k.ausbaustand && k.ausbaustand in STUFE) betriebslage.ausbaustand = k.ausbaustand;
    if (typeof k.fremdeAenderungVorSchreibzugriff === 'boolean') {
      betriebslage.fremdeAenderungVorSchreibzugriff = k.fremdeAenderungVorSchreibzugriff;
    }
    if (k.patientSummaryQuellen === 'listen' || k.patientSummaryQuellen === 'automatisch') {
      betriebslage.patientSummaryQuellen = k.patientSummaryQuellen;
    }
    if (typeof k.erezeptVerzoegerungMs === 'number' && k.erezeptVerzoegerungMs >= 0) {
      betriebslage.erezeptVerzoegerungMs = k.erezeptVerzoegerungMs;
    }
    return betriebslage;
  });

  /** Zustand und Widersprüche einer Akte — wie sie die versicherte Person oder ihre Kasse setzt. */
  app.post('/verwaltung/akte', async (anfrage, antwort) => {
    const k = anfrage.body as {
      kvnr?: string;
      status?: 'ACTIVATED' | 'SUSPENDED';
      medication?: 'permit' | 'deny';
      'erp-submission'?: 'permit' | 'deny';
    };
    if (!k?.kvnr || !bestandVorhanden(k.kvnr)) {
      return antwort.code(404).send(fehler('noHealthRecord', 'Keine Akte.'));
    }
    const b = bestandFuer(k.kvnr);
    if (k.status === 'ACTIVATED' || k.status === 'SUSPENDED') b.status = k.status;
    if (k['erp-submission'] === 'deny') {
      // Konzept 3.1.3: Widerspruch gegen das Einstellen löscht die dgMP-Daten und setzt den
      // Widerspruch gegen den Medikationsprozess mit.
      b.widersprueche['erp-submission'] = 'deny';
      b.widersprueche.medication = 'deny';
      b.medikation.splice(0, b.medikation.length);
    } else if (k['erp-submission'] === 'permit') {
      b.widersprueche['erp-submission'] = 'permit';
      b.widersprueche.medication = 'permit';
    }
    if (k.medication === 'deny' || k.medication === 'permit') {
      b.widersprueche.medication = k.medication;
    }
    return { kvnr: b.kvnr, status: b.status, widersprueche: b.widersprueche };
  });

  app.post('/verwaltung/zuruecksetzen', async () => {
    startbestandAufbauen();
    erezepteLeeren();
    Object.assign(betriebslage, STANDARD_BETRIEBSLAGE);
    return { zurueckgesetzt: true, bestaende: alleBestaende().length };
  });

  app.get('/verwaltung/befugnisse', async () => alleBefugnisse());

  /** Eine andere Einrichtung trägt jetzt ein — Dokument, Medikationsplan, Listen — für „neu seit dem letzten Aufruf". */
  app.post('/verwaltung/fremde-eintraege', async (anfrage, antwort) => {
    const kvnr = String((anfrage.body as { kvnr?: string } | undefined)?.kvnr ?? '');
    if (!bestandVorhanden(kvnr)) {
      return antwort.code(409).send(fehler('conflict', 'Keine Akte.'));
    }
    const stufe = STUFE[betriebslage.ausbaustand];
    return { angelegt: fremdeEintraegeAnlegen(kvnr, stufe) };
  });

  /** Wie nach Ablauf der 90 Tage: Die Einrichtung verliert ihre Befugnisse in allen Akten. */
  app.post('/verwaltung/befugnisse/entziehen', async (anfrage) => {
    const telematikId = String(
      (anfrage.body as { telematikId?: string } | undefined)?.telematikId ?? '',
    );
    return { entzogen: befugnisseEntziehen(telematikId) };
  });

  app.get('/verwaltung/bestand', async () =>
    alleBestaende().map((b) => ({
      kvnr: b.kvnr,
      dokumente: b.dokumente.map((d) => ({ id: d.id, formatCode: d.formatCode?.code ?? null })),
      medikation: b.medikation.length,
      diagnosedienst: b.diagnosedienst.filter((r) => r.resourceType !== 'Provenance').length,
      status: b.status,
      widersprueche: b.widersprueche,
    })),
  );

  app.get('/health', async () => ({
    dienst: 'ePA-Simulator',
    hinweis: 'Fiktiv. Keine Anbindung an die Telematikinfrastruktur.',
    release: 'ePA 3.1.3',
    betriebslage,
  }));

  /** Übersicht der Wege, jeweils mit ihrer Grundlage. */
  app.get('/', async () => ({
    dienst: 'ePA-Simulator',
    release: 'ePA 3.1.3',
    ausbaustand: betriebslage.ausbaustand,
    grundlagen: [
      'Konzept und OpenAPI ePA-Basic, Release 3.1.3',
      'Implementation Guide de.gematik.epa 1.3.2 (generelle Prinzipien, Provenance)',
      'Implementation Guide de.gematik.epa.medication 1.3.5',
      'Implementation Guide de.gematik.epa.mhd 1.1.3',
      'OpenAPI I_Information_Service 1.5.1 (Aktenstatus, Widersprüche)',
      'gematik api-erp (E-Rezept-Fachdienst) — als Demo-Ersatz',
      'Vorschau: Fachkonzept dgLP Stufe 1 (ePA 3.2), Content-IG de.gematik.epa.laboratory 1.0.0-ballot.1',
    ],
    kopfzeilen: {
      'x-insurantid': 'adressiert die Akte',
      'x-useragent': 'ClientId/Version',
      'X-Request-ID': 'wird zurückgegeben',
      'X-Requesting-Organization':
        'TIOrganization, Base64 — Pflicht bei schreibenden Operationen der FHIR Data Services',
      'x-demo-sitzung': 'Demo-Ersatz für ID-Token und VAU — keine ePA-Schnittstelle',
    },
    information: [
      `GET ${INFORMATION_BASIS} — getRecordStatus: 204, 404 noHealthRecord, 409 statusMismatch`,
      `GET ${INFORMATION_BASIS}/consentdecisions — getConsentDecisionInformation`,
    ],
    erezept: {
      hinweis:
        'Demo-Ersatz des E-Rezept-Fachdienstes, ohne VAU und QES. Überträgt asynchron in den Medication Service.',
      wege: [
        `POST ${ERP_BASIS}/Task/$create`,
        `POST ${ERP_BASIS}/Task/{id}/$activate (X-AccessCode)`,
        `POST ${ERP_BASIS}/Task/{id}/$abort (X-AccessCode)`,
      ],
      verzoegerungMs: betriebslage.erezeptVerzoegerungMs,
    },
    befugnis: {
      weg: `POST ${BEFUGNIS_WEG}`,
      grundlage: 'setEntitlementPs, OpenAPI I_Entitlement_Management 1.8.0',
      ohneBefugnis: '403 notEntitled',
    },
    mhd: [
      `GET ${MHD_BASIS}/DocumentReference — ITI-67; _content (Volltext) ab Weiterentwicklung 1`,
      `GET ${MHD_BASIS}/metadata — CapabilityStatement mit den Suchparametern`,
      `GET ${MHD_ABRUF}/{entryUUID}.{Endung} — ITI-68`,
    ],
    medikation: [
      '$medication-list',
      '$medication-plan',
      '$medication-plan-log',
      '$add-emp-entry',
      '$update-emp-entry',
      '$batch-emp mit $emp-commit',
      'MedicationStatement/$add-eml-entry',
      'MedicationStatement/{id}/$cancel-eml-entry',
      'MedicationStatement/{id}/$link-emp',
      'MedicationStatement/{id}/$unlink-emp',
      'Query API: Medication, MedicationRequest, MedicationDispense, MedicationStatement, Organization, Provenance',
    ].map((w) => `${MEDIKATION_BASIS}/${w}`),
    vorschlaege: [
      {
        dienst: 'Diagnose-Service für Allergien und Diagnosen — Vorschlag, nicht spezifiziert',
        aktiv: abStufe(AB_STUFE.listen),
        basis: DIAGNOSEDIENST_BASIS,
        operationen: [
          '$condition-list',
          '$condition-list-log',
          '$add-condition-entry',
          '$update-condition-entry',
          '$allergy-list',
          '$allergy-list-log',
          '$add-allergy-entry',
          '$update-allergy-entry',
        ],
      },
      {
        dienst:
          'Patient Summary als Sicht aus den Diensten der ePA — Vorschlag, nicht spezifiziert',
        aktiv: abStufe(AB_STUFE.patientSummary),
        basis: PATIENT_SUMMARY_BASIS,
        operationen: ['metadata', 'Patient/$summary'],
        grundlage: 'Operation nach HL7 IPS $summary, Inhalt nach HL7 Europe EPS 1.0.0-ballot',
        quellen: betriebslage.patientSummaryQuellen,
      },
      {
        dienst: 'Impfliste — Vorschlag, nicht spezifiziert',
        aktiv: abStufe(AB_STUFE.listen),
        basis: IMPFLISTE_BASIS,
        operationen: [
          '$immunization-list',
          '$immunization-list-log',
          '$add-immunization-entry',
          '$update-immunization-entry',
        ],
        grundlage: 'Einträge nach immunization-eu-core (HL7 Europe), Mechanik wie Diagnose-Service',
      },
      {
        dienst: 'Aktenlotse — Vorschlag, nicht spezifiziert',
        aktiv: abStufe(AB_STUFE.aktenlotse),
        basis: AKTENLOTSE_BASIS,
        operationen: ['metadata', 'frage', 'kontext', 'vorschlaege'],
        grundlage:
          'kein FHIR — Auskunft über vorhandene Ressourcen. Regelbasiert statt mit Sprachmodell; liest nur die Akte aus x-insurantid und nur, was im Ausbaustand sichtbar ist. Kein Schreibweg.',
      },
    ],
    nichtNachgebildet: [
      'Einstellen von Dokumenten (XDS ITI-41, SOAP), XDS ITI-18 und ITI-43',
      'Operationen des E-Rezept-Fachdienstes am Medication Service ($provide-prescription-erp und Verwandte) als Schnittstelle — der Fachdienst-Ersatz ruft sie intern auf',
      'Render API des Medication Service',
      'Anmeldung (ID-Token, VAU), VSDM, QES und Signaturprüfung, PoPP, Befugnisse durch Versicherte, Widerspruch gegen einzelne Dokumente, Protokollierung',
    ],
    demoSteuerung: [
      'GET|POST /verwaltung/betriebslage',
      'POST /verwaltung/zuruecksetzen',
      'GET /verwaltung/bestand',
      'GET /verwaltung/befugnisse',
      'POST /verwaltung/befugnisse/entziehen',
      'POST /verwaltung/akte — Zustand und Widersprüche einer Akte',
      'GET /verwaltung/erezepte',
      'POST /verwaltung/erezepte/{id}/abgabe — Apotheke gibt ab (art: wie-verordnet, austausch, mehrfach)',
      'POST /verwaltung/erezepte/{id}/abgabe-storno',
      'POST /verwaltung/fremde-eintraege — eine andere Einrichtung trägt in die Listen ein',
    ],
  }));

  app.setNotFoundHandler(async (anfrage, antwort) => {
    await antwort
      .code(404)
      .send(
        operationOutcome(
          'error',
          'not-found',
          `${anfrage.method} ${anfrage.url} ist nicht umgesetzt. Übersicht unter GET /`,
        ),
      );
  });
}
