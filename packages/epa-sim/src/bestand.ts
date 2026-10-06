import type { Ressource } from '@demo-pvs/kern';
import type { Ausbaustand } from './betrieb.ts';

/**
 * Datenbestand des simulierten Aktensystems, gehalten je Health Record Identifier
 * (in der ePA für alle die Krankenversichertennummer, übergeben im Header `x-insurantid`).
 *
 * Ebenen, wie im Konzept 3.1.3 getrennt:
 * - **Dokumente** im XDS Document Service, lesbar über den MHD Service (ITI-67, ITI-68);
 * - **FHIR-Ressourcen** des Medication Service (eML, eMP, Provenance);
 * - ✦ **Listen** des vorgeschlagenen Diagnose-Service (ab Ausbaustand „Weiterentwicklung 3").
 */

export interface Kodewert {
  code: string;
  system: string;
  anzeige: string;
}

/** XDS-Dokumenteintrag mit den Metadaten, die der MHD Service als DocumentReference abbildet. */
export interface Dokument {
  id: string;
  /**
   * XDS-uniqueId als OID, vom einstellenden System vergeben. Bei Laborbefunden bildet die
   * Demo sie aus der UUID des Befunds (⚠ Annahme, siehe kern/dokumentkennungLokal).
   */
  uniqueId: string;
  titel: string;
  classCode: Kodewert;
  typeCode: Kodewert;
  /** Registrierter formatCode, oder null, wenn der Dokumenttyp im Release nicht registriert ist. */
  formatCode: Kodewert | null;
  mimeType: string;
  /** Ordner im Aktensystem, etwa `emergency`. */
  ordner: string | null;
  /** ISO-Zeitpunkt der Erstellung. */
  erstellt: string;
  /**
   * ISO-Zeitpunkt der Einstellung in die Akte (XDS submissionTime, MHD `DocumentReference.date`).
   * Fehlt er, gilt die Erstellung.
   */
  eingestellt?: string;
  autor: string;
  einrichtung: string;
  groesseBytes: number;
  /** Strukturierter Inhalt als FHIR-Bundle. */
  inhalt: Record<string, unknown> | null;
  /** Unstrukturierter Inhalt (PDF, XML) als Bytefolge, je Zeichen ein Byte. */
  datei?: string;
  /** Lesbarer Text eines unstrukturierten Dokuments — Grundlage der Volltextsuche. */
  text?: string;
  /**
   * Derselbe Text in Zeilen. Die Volltextsuche braucht ihn nicht, der ✦ Aktenlotse schon:
   * Er belegt jede Aussage mit genau der Zeile, aus der sie stammt, und erkennt Abschnitte
   * an ihren Überschriften.
   */
  textzeilen?: string[];
  /** Sichtbar nur in diesem Ausbaustand, etwa der strukturierte Laborbefund ab ePA 3.2. */
  nurIn?: Ausbaustand;
  /** Ab diesem Ausbaustand liegt das Dokument strukturiert vor; diese Fassung ist dann weg. */
  ersetztAb?: Ausbaustand;
}

export interface Demographie {
  vorname: string;
  nachname: string;
  geburtsdatum: string;
}

export interface Aktenbestand {
  kvnr: string;
  /** Versicherteninformation, wie sie der Patient Information Service („demographics") liefert. */
  demographie: Demographie | null;
  dokumente: Dokument[];
  /** Ressourcen des Medication Service. */
  medikation: Ressource[];
  /**
   * Ressourcen des vorgeschlagenen Diagnose-Service (✦ Weiterentwicklung, siehe
   * `diagnosedienst.ts`): AllergyIntolerance, Condition und ihre Provenance.
   */
  diagnosedienst: Ressource[];
  /**
   * Zustand der Akte (OpenAPI I_Information_Service 1.5.1, `getRecordStatus`): `ACTIVATED`
   * oder vorübergehend `SUSPENDED`, etwa während eines Anbieterwechsels. Dann antworten alle
   * Dienste mit 409 `statusMismatch`.
   */
  status: 'ACTIVATED' | 'SUSPENDED';
  /**
   * Widersprüche gegen Versorgungsprozesse, wie der Information Service sie spiegelt
   * (`getConsentDecisionInformation`): Medikationsprozess (`medication`) und Einstellen durch
   * den E-Rezept-Fachdienst (`erp-submission`). Konzept ePA 3.1.3, Consent Management.
   */
  widersprueche: Record<Widerspruchsfunktion, 'permit' | 'deny'>;
}

export type Widerspruchsfunktion = 'medication' | 'erp-submission';

const bestaende = new Map<string, Aktenbestand>();

export function bestandFuer(kvnr: string): Aktenbestand {
  let bestand = bestaende.get(kvnr);
  if (!bestand) {
    bestand = {
      kvnr,
      demographie: null,
      dokumente: [],
      medikation: [],
      diagnosedienst: [],
      status: 'ACTIVATED',
      widersprueche: { medication: 'permit', 'erp-submission': 'permit' },
    };
    bestaende.set(kvnr, bestand);
  }
  return bestand;
}

export function bestandVorhanden(kvnr: string): boolean {
  return bestaende.has(kvnr);
}

export function alleBestaende(): Aktenbestand[] {
  return [...bestaende.values()];
}

export function bestaendeLeeren(): void {
  bestaende.clear();
}
