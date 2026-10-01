import {
  CODESYSTEM,
  KEINE_BEKANNTE_ALLERGIE,
  SNOMED_VERSION,
  allergieAusFhirRessource,
  allergieNachFhir,
  chronikLesen,
  diagnoseAusFhir,
  diagnoseNachFhir,
  istPsRelevant,
  psRelevanzSetzen,
  type Allergie,
  type Chronik,
  type Diagnose,
  type Herkunft,
  type Patient,
  type Ressource,
} from '@demo-pvs/kern';
import {
  EINRICHTUNG,
  diagnosedienstVerfuegbar,
  listeLesen,
  listeneintragAendern,
  listeneintragAnlegen,
  listeneintragMarkieren,
  type Listenart,
} from './klient.js';
import { istGueltig, useBefugnis, useEinlesungen } from './befugnis.js';
import { useBetriebsstand, useEpaAbfrage, type Ladezustand } from './epa-bestand.js';

/**
 * Allergienliste und Diagnosenliste der ePA — ✦ Vorschlag Diagnose-Service (ADR 0018).
 *
 * Gelesen werden die Listen samt Änderungseinträgen; daraus entstehen Einträge in den
 * Domänentypen des Praxissystems, jeweils mit ihrer Chronik. Geschrieben wird wie im
 * Medication Service: anlegen und ändern, jeweils mit dem Lesenachweis der Liste; berichtigt
 * wird über den Status.
 */

export interface Listeneintrag<T> {
  eintrag: T;
  ressource: Ressource;
  chronik: Chronik;
  /** Von dieser Praxis angelegt. */
  eigener: boolean;
  /** ✦ Als relevant für die Patient Summary markiert. */
  psRelevant: boolean;
}

export interface EpaListen {
  /** Bietet das Aktensystem den Dienst an? Im Release 3.1.3 nicht. */
  verfuegbar: boolean;
  diagnosen: Listeneintrag<Diagnose>[];
  allergien: Listeneintrag<Allergie>[];
  /** Lesenachweis je Liste — die Kennung des letzten Chronologieeintrags. */
  lesenachweis: Record<Listenart, string | null>;
}

export const LISTENNAME: Record<Listenart, string> = {
  Condition: 'Diagnosenliste',
  AllergyIntolerance: 'Allergienliste',
};

function herkunftAus(chronik: Chronik, art: Listenart): Herkunft {
  return {
    bestand: 'epa',
    quelle: chronik.quelldokument?.anzeige ?? `${LISTENNAME[art]} der ePA · ${chronik.angelegtVon}`,
    zeitpunkt: chronik.angelegtAm,
    verantwortlich: chronik.erstelltDurch ?? chronik.angelegtVon,
    dokumentId: chronik.quelldokument?.id ?? null,
  };
}

export async function listenLaden(kvnr: string, patientId: string): Promise<EpaListen> {
  if (!(await diagnosedienstVerfuegbar())) {
    return {
      verfuegbar: false,
      diagnosen: [],
      allergien: [],
      lesenachweis: { Condition: null, AllergyIntolerance: null },
    };
  }
  const [c, a] = await Promise.all([
    listeLesen(kvnr, 'Condition'),
    listeLesen(kvnr, 'AllergyIntolerance'),
  ]);
  const eintrag = <T>(
    art: Listenart,
    provenance: Ressource[],
    lesen: (r: Ressource, h: Herkunft) => T,
  ) =>
    function (r: Ressource): Listeneintrag<T> {
      const chronik = chronikLesen(r, provenance);
      return {
        eintrag: lesen(r, herkunftAus(chronik, art)),
        ressource: r,
        chronik,
        eigener: chronik.angelegtVonTelematikId === EINRICHTUNG.telematikId,
        psRelevant: istPsRelevant(r),
      };
    };
  return {
    verfuegbar: true,
    lesenachweis: { Condition: c.lesenachweis, AllergyIntolerance: a.lesenachweis },
    diagnosen: c.eintraege.map(
      eintrag('Condition', c.provenance, (r, h) => diagnoseAusFhir(r, patientId, h)),
    ),
    allergien: a.eintraege.map(
      eintrag('AllergyIntolerance', a.provenance, (r, h) =>
        allergieAusFhirRessource(r, patientId, h),
      ),
    ),
  };
}

/** Lage der Listen aus Sicht einer Ansicht. */
export type Listenlage =
  | { art: 'ohne-befugnis' }
  | { art: 'laedt' }
  | { art: 'fehler'; text: string; status: number; code: string | null }
  | { art: 'nicht-angeboten' }
  | { art: 'bereit'; listen: EpaListen };

/**
 * Lädt die Listen einer Person, sobald das Praxissystem eine Befugnis kennt. Ohne bekannte
 * Befugnis fragt es gar nicht erst — das tut nur, wer die ePA ausdrücklich öffnet.
 */
export function useEpaListen(patient: Patient | undefined): {
  lage: Listenlage;
  abfrage: Ladezustand<EpaListen>;
} {
  const befugnis = useBefugnis(patient?.id ?? '');
  const einlesungen = useEinlesungen();
  const betriebsstand = useBetriebsstand();
  const befugt = istGueltig(befugnis);
  const abfrage = useEpaAbfrage(
    () => listenLaden(patient?.versicherung.kvnr ?? '', patient?.id ?? ''),
    [patient?.id, einlesungen, betriebsstand],
    befugt && !!patient,
  );
  const lage: Listenlage = !befugt
    ? { art: 'ohne-befugnis' }
    : abfrage.fehler
      ? abfrage.fehler.status === 403 && abfrage.fehler.code === 'notEntitled'
        ? { art: 'ohne-befugnis' }
        : { art: 'fehler', ...abfrage.fehler }
      : abfrage.laedt || !abfrage.daten
        ? { art: 'laedt' }
        : abfrage.daten.verfuegbar
          ? { art: 'bereit', listen: abfrage.daten }
          : { art: 'nicht-angeboten' };
  return { lage, abfrage };
}

/* ---------- Schreiben ---------- */

/**
 * Ressource für die Liste aus einem Eintrag des Praxissystems. Verantwortlich ist, wer ihn in
 * die Liste stellt. Ein Verweis auf ein Quelldokument bleibt nur, wenn es in der ePA liegt.
 */
function alsListenressource(
  art: Listenart,
  e: Diagnose | Allergie,
  kvnr: string,
  person: string,
): Ressource {
  const herkunft: Herkunft = {
    ...e.herkunft,
    verantwortlich: person,
    dokumentId: e.herkunft.bestand === 'epa' ? e.herkunft.dokumentId : null,
  };
  const r =
    art === 'Condition'
      ? diagnoseNachFhir({ ...(e as Diagnose), herkunft }, kvnr)
      : allergieNachFhir({ ...(e as Allergie), herkunft }, kvnr);
  delete r.id;
  return r;
}

export function inDieListeAufnehmen(
  kvnr: string,
  art: Listenart,
  lesenachweis: string | null,
  e: Diagnose | Allergie,
  person: string,
  psRelevant = false,
) {
  return listeneintragAnlegen(
    kvnr,
    art,
    lesenachweis,
    psRelevanzSetzen(alsListenressource(art, e, kvnr, person), psRelevant),
  );
}

/** ✦ Relevanz für die Patient Summary setzen oder aufheben — der Eintrag bleibt in der Liste. */
export function psRelevanzAendern(
  kvnr: string,
  art: Listenart,
  lesenachweis: string | null,
  id: string,
  psRelevant: boolean,
) {
  return listeneintragMarkieren(kvnr, art, lesenachweis, id, psRelevant);
}

/**
 * Überträgt den Stand des Praxissystems auf einen Eintrag der Liste. Kodierung und Bezug
 * bleiben, wie sie in der ePA stehen; Extensions, die das Praxissystem nicht selbst setzt
 * (etwa der Verweis auf das Quelldokument), bleiben ebenfalls.
 */
export function inDieListeUebertragen(
  kvnr: string,
  art: Listenart,
  lesenachweis: string | null,
  e: Diagnose | Allergie,
  epa: Ressource,
  person: string,
) {
  const neu = alsListenressource(art, e, kvnr, person);
  const eigene = new Set((neu.extension ?? []).map((x) => x.url));
  const extension = [
    ...(epa.extension ?? []).filter((x) => !eigene.has(x.url)),
    ...(neu.extension ?? []),
  ];
  const ressource: Ressource = { ...neu, id: epa.id, code: epa['code'] };
  if (extension.length > 0) ressource.extension = extension;
  else delete ressource.extension;
  return listeneintragAendern(kvnr, art, lesenachweis, ressource);
}

const VERIFIKATION: Record<Listenart, string> = {
  Condition: 'http://terminology.hl7.org/CodeSystem/condition-ver-status',
  AllergyIntolerance: 'http://terminology.hl7.org/CodeSystem/allergyintolerance-verification',
};

/** Kennzeichnet einen Eintrag als fehlerhaft — wie beim eMP über den Status, nicht durch Löschen. */
export function inDerListeBerichtigen(
  kvnr: string,
  art: Listenart,
  lesenachweis: string | null,
  epa: Ressource,
) {
  const ressource: Ressource = {
    ...epa,
    verificationStatus: { coding: [{ system: VERIFIKATION[art], code: 'entered-in-error' }] },
  };
  delete ressource['clinicalStatus'];
  return listeneintragAendern(kvnr, art, lesenachweis, ressource);
}

/**
 * „Keine bekannte Allergie" als ausdrückliche Angabe — SNOMED CT 716186003. Eine später
 * eingetragene Allergie widerlegt sie; das erledigt der Dienst.
 */
export function keineBekannteAllergieEintragen(
  kvnr: string,
  lesenachweis: string | null,
  person: string,
  heute: string,
) {
  return listeneintragAnlegen(kvnr, 'AllergyIntolerance', lesenachweis, {
    resourceType: 'AllergyIntolerance',
    clinicalStatus: {
      coding: [
        {
          system: 'http://terminology.hl7.org/CodeSystem/allergyintolerance-clinical',
          code: 'active',
        },
      ],
    },
    verificationStatus: {
      coding: [{ system: VERIFIKATION.AllergyIntolerance, code: 'confirmed' }],
    },
    code: {
      coding: [
        {
          system: CODESYSTEM.snomed,
          version: SNOMED_VERSION,
          code: KEINE_BEKANNTE_ALLERGIE,
          display: 'No known allergy',
        },
      ],
      text: 'Keine bekannte Allergie',
    },
    recordedDate: heute,
    recorder: { display: person },
    asserter: { display: person },
  });
}
