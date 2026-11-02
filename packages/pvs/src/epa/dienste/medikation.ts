import { neueKennung } from '@demo-pvs/kern';
import type { Ressource } from '@demo-pvs/kern';
import {
  MEDIKATION,
  QUERY,
  RENDER_EINSTELLUNG,
  EMP_IDENTIFIER,
  GRUNDLAGE,
  EpaFehler,
  anfragen,
  Bundle,
  treffer,
  serverzeit,
  eingeschlossen,
  parameterRessource,
} from '../klient.js';

/**
 * Medication Service (`de.gematik.epa.medication` 1.4.0-ballot.1, ADR 0047): eML, eMP samt
 * Chronologie, eMP-Einträge anlegen und ändern, eML-Einträge mit dem eMP verknüpfen; Lesen über
 * die Common Query API. Schreibend immer mit Lesenachweis `acknowledgedChronologyId` und dem
 * Header `X-Requesting-Organization`.
 */

export interface Medikationsliste {
  /** Medikationsinformationen (MedicationStatement) — die Einträge der eML. */
  eintraege: Ressource[];
  /** Arzneimittel, Verordnungen, Abgaben, Änderungseinträge, Organisationen. */
  einschluesse: Ressource[];
  /** Zeitpunkt des Aktensystems beim Abruf; leer, wenn die Liste leer ist. */
  abgerufen?: string;
}

/** Ist der Fehler die Antwort „nichts da“ des Medication Service (1.4.0)? */
const leer = (f: unknown, code: string) =>
  f instanceof EpaFehler && f.status === 404 && f.code === code;

export async function medikationslisteLesen(kvnr: string): Promise<Medikationsliste> {
  try {
    const { inhalt } = await anfragen<Bundle>({
      pfad: `${MEDIKATION}/$medication-list`,
      kvnr,
      grundlage: GRUNDLAGE.eml,
      leerBei: ['MSG_NO_MATCH'],
    });
    return {
      eintraege: treffer(inhalt),
      einschluesse: eingeschlossen(inhalt),
      abgerufen: serverzeit(inhalt),
    };
  } catch (f) {
    // Ohne Treffer antwortet der Dienst 404 MSG_NO_MATCH (IG-MED16217P4A): eine leere Liste.
    if (leer(f, 'MSG_NO_MATCH')) return { eintraege: [], einschluesse: [], abgerufen: '' };
    throw f;
  }
}

export interface Medikationsplan {
  /** Kennung des Chronologieeintrags — der Lesenachweis für jede Änderung. */
  lesenachweis: string | null;
  stand: string;
  /** Zeitpunkt des Aktensystems beim Abruf — Lesezeichen für die Abfrage „seit". */
  abgerufen: string;
  eintraege: Ressource[];
  ressourcen: Ressource[];
}

/** Der Medikationsplan — aktuell oder, mit `chronologie`, der Stand zu diesem Eintrag. */
export async function medikationsplanLesen(
  kvnr: string,
  frueherenStand?: string,
): Promise<Medikationsplan> {
  let inhalt: Bundle;
  try {
    inhalt = (
      await anfragen<Bundle>({
        pfad: frueherenStand
          ? `${MEDIKATION}/$medication-plan?provenance=${encodeURIComponent(frueherenStand)}`
          : `${MEDIKATION}/$medication-plan`,
        kvnr,
        grundlage: frueherenStand ? GRUNDLAGE.empFrueher : GRUNDLAGE.emp,
        leerBei: ['MEDSVC_EMP_NO_EXIST'],
      })
    ).inhalt;
  } catch (f) {
    // Noch kein eMP: 404 MEDSVC_EMP_NO_EXIST (IG-MED35894UP4) — ein leerer Plan ohne Lesenachweis.
    if (!frueherenStand && leer(f, 'MEDSVC_EMP_NO_EXIST'))
      return { lesenachweis: null, stand: '', abgerufen: '', eintraege: [], ressourcen: [] };
    throw f;
  }
  const alle = (inhalt.entry ?? []).map((e) => e.resource);
  const chronologie = alle.find(
    (r) =>
      r.resourceType === 'Provenance' &&
      (r.extension ?? []).some((e) => e.url.endsWith('is-emp-chronology-extension')),
  );
  return {
    lesenachweis: chronologie ? String(chronologie.id) : null,
    stand: String(chronologie?.['recorded'] ?? ''),
    abgerufen: serverzeit(inhalt),
    eintraege: alle.filter((r) => r.resourceType === 'MedicationRequest' && r['intent'] === 'plan'),
    ressourcen: alle,
  };
}

/**
 * Chronologieeinträge des Medikationsplans seit dem Lesezeichen, je mit der Einrichtung, die
 * geändert hat (`agent.who.identifier`).
 */
/**
 * Einstellung der Zwischenüberschriften im eMP (Render API, IG 1.4.0-ballot.1). Ein Client, der
 * den eMP selbst darstellt, richtet seine Gruppierung danach (IG-MED09759K35-01).
 */
export async function zwischenueberschriftenLesen(kvnr: string): Promise<boolean> {
  const { inhalt } = await anfragen<{ subheadings?: boolean }>({
    pfad: RENDER_EINSTELLUNG,
    kvnr,
    inhaltstyp: 'application/json',
    grundlage: GRUNDLAGE.zwischenueberschriften,
  });
  return inhalt.subheadings !== false;
}

export async function zwischenueberschriftenSetzen(kvnr: string, wert: boolean): Promise<boolean> {
  const { inhalt } = await anfragen<{ subheadings?: boolean }>({
    methode: 'PUT',
    pfad: RENDER_EINSTELLUNG,
    kvnr,
    koerper: { subheadings: wert },
    inhaltstyp: 'application/json',
    grundlage: GRUNDLAGE.zwischenueberschriften,
  });
  return inhalt.subheadings !== false;
}

export async function planaenderungenSeit(
  kvnr: string,
  seit: string,
): Promise<{ id: string; telematikId: string | null; einrichtung: string }[]> {
  const { inhalt } = await anfragen<Bundle>({
    pfad: `${QUERY}/Provenance?is-emp-chronology=true&recorded=gt${encodeURIComponent(seit)}`,
    kvnr,
    grundlage: GRUNDLAGE.empSeit,
  });
  return treffer(inhalt).map((p) => {
    const wer = (
      p['agent'] as { who?: { identifier?: { value?: string }; display?: string } }[] | undefined
    )?.[0]?.who;
    return {
      id: String(p.id),
      telematikId: wer?.identifier?.value ?? null,
      einrichtung: wer?.display ?? '—',
    };
  });
}

/** Einträge der Medikationsliste seit dem Lesezeichen (`date`). */
export async function medikationslisteSeit(kvnr: string, seit: string): Promise<string[]> {
  try {
    const { inhalt } = await anfragen<Bundle>({
      pfad: `${MEDIKATION}/$medication-list?date=gt${encodeURIComponent(seit)}`,
      kvnr,
      grundlage: GRUNDLAGE.emlSeit,
      leerBei: ['MSG_NO_MATCH'],
    });
    return treffer(inhalt).map((r) => String(r.id));
  } catch (f) {
    if (leer(f, 'MSG_NO_MATCH')) return [];
    throw f;
  }
}

/** Nur der neueste Chronologieeintrag — für die Frage „hat sich etwas geändert?". */
export async function medikationsplanStand(
  kvnr: string,
): Promise<{ lesenachweis: string | null; stand: string }> {
  const { inhalt } = await anfragen<Bundle>({
    pfad: `${MEDIKATION}/$medication-plan-log?_count=1`,
    kvnr,
    grundlage: GRUNDLAGE.empLog,
  });
  const neueste = treffer(inhalt)[0];
  return {
    lesenachweis: neueste ? String(neueste.id) : null,
    stand: String(neueste?.['recorded'] ?? ''),
  };
}

interface EmpErgebnis {
  eintrag: Ressource;
  /** Der Chronologieeintrag nach der Schreibung; ohne neuen bleibt der bisherige. */
  lesenachweis: string | null;
}

/** Ergebnis von `$update-emp-entry`: ohne Eintrag, wenn der Dienst ihn gelöscht hat (fehlerhaft). */
export interface EmpAenderung {
  eintrag: Ressource | null;
  lesenachweis: string | null;
}

type Ausgabe = { parameter?: { name: string; resource?: Ressource }[] };

function empAenderung(p: Ausgabe, vorher: string | null): EmpAenderung {
  const chronologie = parameterRessource(p, 'relatedChronology');
  return {
    eintrag: parameterRessource(p, 'empEntry') ?? null,
    lesenachweis: chronologie ? String(chronologie.id) : vorher,
  };
}

function empErgebnis(p: Ausgabe, vorher: string | null): EmpErgebnis {
  const { eintrag, lesenachweis } = empAenderung(p, vorher);
  if (!eintrag) throw new EpaFehler(0, 'Die Antwort ist unvollständig.');
  return { eintrag, lesenachweis };
}

/**
 * `$add-emp-entry` — neues Arzneimittel (EMPMedication) oder Verweis auf eines aus Verordnung
 * oder Abgabe, dazu der Eintrag (EMPMedicationRequest).
 */
export async function empEintragAnlegen(
  kvnr: string,
  lesenachweis: string | null,
  mittel: { resource: Ressource } | { reference: string },
  eintrag: Ressource,
  /** Behandlungsgründe nach `EMPReasonCondition` (Parameter `reasonCondition`, 1.4.0). */
  gruende: readonly Ressource[] = [],
): Promise<EmpErgebnis> {
  // Der Eintrag verweist auf sein Arzneimittel (`medication[x]` 1..1, wie die Beispiele des IG).
  const neu =
    'resource' in mittel ? { ...mittel.resource, id: mittel.resource.id ?? neueKennung() } : null;
  eintrag = eintrag['medicationReference']
    ? eintrag
    : {
        ...eintrag,
        medicationReference: {
          reference: neu
            ? `Medication/${String(neu.id)}`
            : (mittel as { reference: string }).reference,
        },
      };
  if (neu) mittel = { resource: neu };
  const { inhalt } = await anfragen<{ parameter?: { name: string; resource?: Ressource }[] }>({
    methode: 'POST',
    pfad: `${MEDIKATION}/$add-emp-entry`,
    kvnr,
    koerper: {
      resourceType: 'Parameters',
      parameter: [
        ...(lesenachweis ? [{ name: 'acknowledgedChronologyId', valueId: lesenachweis }] : []),
        {
          name: 'medication',
          part: [
            'resource' in mittel
              ? { name: 'resource', resource: mittel.resource }
              : { name: 'reference', valueReference: { reference: mittel.reference } },
          ],
        },
        { name: 'empEntry', resource: eintrag },
        ...gruende.map((g) => ({ name: 'reasonCondition', resource: g })),
      ],
    },
    grundlage: GRUNDLAGE.empNeu,
  });
  return empErgebnis(inhalt, lesenachweis);
}

/**
 * `$update-emp-entry` — Dosierung, Grund, Status; beenden, absetzen, fehlerhaft. Einen
 * fehlerhaften Eintrag löscht der Dienst (IG-MED-BL-UPDATE-EMP-ENTRY-V3); dann fehlt er in der
 * Antwort.
 */
export async function empEintragAendern(
  kvnr: string,
  lesenachweis: string | null,
  eintrag: Ressource,
  gruende: readonly Ressource[] = [],
): Promise<EmpAenderung> {
  const { inhalt } = await anfragen<{ parameter?: { name: string; resource?: Ressource }[] }>({
    methode: 'POST',
    pfad: `${MEDIKATION}/$update-emp-entry`,
    kvnr,
    koerper: {
      resourceType: 'Parameters',
      parameter: [
        ...(lesenachweis ? [{ name: 'acknowledgedChronologyId', valueId: lesenachweis }] : []),
        {
          name: 'medicationPlanIdentifier',
          valueIdentifier: { system: EMP_IDENTIFIER, value: String(eintrag.id) },
        },
        { name: 'empEntry', resource: eintrag },
        ...gruende.map((g) => ({ name: 'reasonCondition', resource: g })),
      ],
    },
    grundlage: GRUNDLAGE.empAendern,
  });
  return empAenderung(inhalt, lesenachweis);
}

/** `$link-emp` — eML-Eintrag mit einem eMP-Eintrag verknüpfen. */
export async function empVerknuepfen(
  kvnr: string,
  lesenachweis: string | null,
  emlEintragId: string,
  empEintragId: string,
): Promise<EmpErgebnis> {
  const { inhalt } = await anfragen<{ parameter?: { name: string; resource?: Ressource }[] }>({
    methode: 'POST',
    pfad: `${MEDIKATION}/MedicationStatement/${emlEintragId}/$link-emp`,
    kvnr,
    koerper: {
      resourceType: 'Parameters',
      parameter: [
        ...(lesenachweis ? [{ name: 'acknowledgedChronologyId', valueId: lesenachweis }] : []),
        {
          name: 'medicationPlanIdentifier',
          valueIdentifier: { system: EMP_IDENTIFIER, value: empEintragId },
        },
      ],
    },
    grundlage: GRUNDLAGE.verknuepfen,
  });
  return empErgebnis(inhalt, lesenachweis);
}

/* ---------- Information Service ---------- */
