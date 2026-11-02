import type { Ressource } from '@demo-pvs/kern';
import {
  DIAGNOSEDIENST,
  IMPFLISTE,
  angebotMerken,
  GRUNDLAGE,
  EpaFehler,
  anfragen,
  Bundle,
  treffer,
  eingeschlossen,
  parameterRessource,
} from '../klient.js';

/**
 * ✦ Diagnose-Service (ADR 0018) und ✦ Impfliste: Vorschläge einer Weiterentwicklung, nur wenn das
 * Aktensystem sie anbietet (CapabilityStatement unter `metadata`). Listen lesen, Einträge anlegen,
 * ändern und als relevant für die Patient Summary markieren.
 */

export type Listenart = 'Condition' | 'AllergyIntolerance';
/** Alle zentral geführten Listen: dazu ✦ die Impfliste (Stufe 2). */
export type Dienstliste = Listenart | 'Immunization';

const LISTE: Record<
  Dienstliste,
  {
    basis: string;
    grundlage: string;
    lesen: string;
    anlegen: string;
    aendern: string;
    markieren: string;
    parameter: string;
  }
> = {
  Immunization: {
    basis: IMPFLISTE,
    grundlage: GRUNDLAGE.impfliste,
    lesen: '$immunization-list',
    anlegen: '$add-immunization-entry',
    aendern: '$update-immunization-entry',
    markieren: '',
    parameter: 'immunizationEntry',
  },
  Condition: {
    basis: DIAGNOSEDIENST,
    grundlage: GRUNDLAGE.dienst,
    lesen: '$condition-list',
    anlegen: '$add-condition-entry',
    aendern: '$update-condition-entry',
    markieren: '$flag-condition-entry',
    parameter: 'conditionEntry',
  },
  AllergyIntolerance: {
    basis: DIAGNOSEDIENST,
    grundlage: GRUNDLAGE.dienst,
    lesen: '$allergy-list',
    anlegen: '$add-allergy-entry',
    aendern: '$update-allergy-entry',
    markieren: '$flag-allergy-entry',
    parameter: 'allergyEntry',
  },
};

/** Bietet das Aktensystem den Diagnose-Service an? Antwort aus seinem CapabilityStatement. */
/** Gemerkte Antwort, ob das Aktensystem den Diagnose-Service anbietet. */
let dienstAngeboten: boolean | null = null;
angebotMerken(() => {
  dienstAngeboten = null;
});

export async function diagnosedienstVerfuegbar(): Promise<boolean> {
  if (dienstAngeboten !== null) return dienstAngeboten;
  try {
    await anfragen({ pfad: `${DIAGNOSEDIENST}/metadata`, grundlage: GRUNDLAGE.dienst });
    dienstAngeboten = true;
  } catch (f) {
    if (!(f instanceof EpaFehler && f.status === 404)) throw f;
    dienstAngeboten = false;
  }
  return dienstAngeboten;
}

/** Gemerkte Antwort, ob das Aktensystem die Impfliste anbietet (✦ Stufe 2). */
let impflisteAngeboten: boolean | null = null;
angebotMerken(() => {
  impflisteAngeboten = null;
});

export async function impflisteVerfuegbar(): Promise<boolean> {
  if (impflisteAngeboten !== null) return impflisteAngeboten;
  try {
    await anfragen({ pfad: `${IMPFLISTE}/metadata`, grundlage: GRUNDLAGE.impfliste });
    impflisteAngeboten = true;
  } catch (f) {
    if (!(f instanceof EpaFehler && f.status === 404)) throw f;
    impflisteAngeboten = false;
  }
  return impflisteAngeboten;
}

export interface EpaListe {
  eintraege: Ressource[];
  provenance: Ressource[];
  /** Kennung des aktuellen Chronologieeintrags — der Lesenachweis für Änderungen. */
  lesenachweis: string | null;
}

export async function listeLesen(kvnr: string, art: Dienstliste): Promise<EpaListe> {
  const { inhalt } = await anfragen<Bundle>({
    pfad: `${LISTE[art].basis}/${LISTE[art].lesen}`,
    kvnr,
    grundlage: LISTE[art].grundlage,
  });
  const dazu = eingeschlossen(inhalt).filter((r) => r.resourceType === 'Provenance');
  const chronologie = dazu.find((r) =>
    (r.extension ?? []).some((e) => /list-chronology$/.test(e.url) && e.valueBoolean === true),
  );
  return {
    eintraege: treffer(inhalt),
    provenance: dazu.filter((r) => r !== chronologie),
    lesenachweis: chronologie ? String(chronologie.id) : null,
  };
}

async function listenoperation(
  kvnr: string,
  art: Dienstliste,
  op: 'anlegen' | 'aendern',
  lesenachweis: string | null,
  ressource: Ressource,
): Promise<{ eintrag: Ressource; lesenachweis: string }> {
  const { inhalt } = await anfragen<{ parameter?: { name: string; resource?: Ressource }[] }>({
    methode: 'POST',
    pfad: `${LISTE[art].basis}/${LISTE[art][op]}`,
    kvnr,
    koerper: {
      resourceType: 'Parameters',
      parameter: [
        ...(lesenachweis ? [{ name: 'acknowledgedChronologyId', valueId: lesenachweis }] : []),
        { name: LISTE[art].parameter, resource: ressource },
      ],
    },
    grundlage: LISTE[art].grundlage,
  });
  const eintrag = parameterRessource(inhalt, 'entry');
  const chronologie = parameterRessource(inhalt, 'relatedChronology');
  if (!eintrag || !chronologie) throw new EpaFehler(0, 'Die Antwort ist unvollständig.');
  return { eintrag, lesenachweis: String(chronologie.id) };
}

export function listeneintragAnlegen(
  kvnr: string,
  art: Dienstliste,
  lesenachweis: string | null,
  ressource: Ressource,
) {
  return listenoperation(kvnr, art, 'anlegen', lesenachweis, ressource);
}

export function listeneintragAendern(
  kvnr: string,
  art: Dienstliste,
  lesenachweis: string | null,
  ressource: Ressource,
) {
  return listenoperation(kvnr, art, 'aendern', lesenachweis, ressource);
}

/* ---------- Einstellen (ITI-41) und KIM ---------- */

/** ✦ Markiert einen Listeneintrag als relevant für die Patient Summary oder hebt das auf. */
export async function listeneintragMarkieren(
  kvnr: string,
  art: Listenart,
  lesenachweis: string | null,
  id: string,
  psRelevant: boolean,
): Promise<{ eintrag: Ressource; lesenachweis: string }> {
  const { inhalt } = await anfragen<{ parameter?: { name: string; resource?: Ressource }[] }>({
    methode: 'POST',
    pfad: `${DIAGNOSEDIENST}/${LISTE[art].markieren}`,
    kvnr,
    koerper: {
      resourceType: 'Parameters',
      parameter: [
        ...(lesenachweis ? [{ name: 'acknowledgedChronologyId', valueId: lesenachweis }] : []),
        { name: 'entry', valueReference: { reference: `${art}/${id}` } },
        { name: 'psRelevant', valueBoolean: psRelevant },
      ],
    },
    grundlage: GRUNDLAGE.dienst,
  });
  const eintrag = parameterRessource(inhalt, 'entry');
  const chronologie = parameterRessource(inhalt, 'relatedChronology');
  if (!eintrag || !chronologie) throw new EpaFehler(0, 'Die Antwort ist unvollständig.');
  return { eintrag, lesenachweis: String(chronologie.id) };
}
