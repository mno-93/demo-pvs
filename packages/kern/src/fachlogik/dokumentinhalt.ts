import type { Ressource } from '../fhir/typen.js';
import { CODESYSTEM } from '../typen/kodierung.js';
import type { DokumentierteAllergie } from './amts.js';
import { atcFuerSubstanz } from './amts.js';
import { istLaborbefund } from './laborbefund.js';

/**
 * Inhalte strukturierter Dokumente, clientseitig gelesen.
 *
 * Im Release ePA 3.1.3 gibt es keine Abfrage einzelner Diagnosen oder Allergien: Die FHIR
 * Data Services führen nur Medikation und Versicherteninformation, alles andere liegt in
 * Dokumenten. Ein Primärsystem, das Einträge aus einem strukturierten Dokument zeigen will,
 * muss das Dokument abrufen (MHD ITI-68) und selbst zerlegen — genau das tut diese Funktion.
 */

export type Dokumentinhaltsart = 'Laborbefund' | 'Entlassbrief' | 'strukturiert' | 'unstrukturiert';

export interface Dokumentinhalt {
  art: Dokumentinhaltsart;
  diagnosen: Ressource[];
  allergien: Ressource[];
  prozeduren: Ressource[];
  beobachtungen: Ressource[];
}

function ressourcen(bundle: unknown): Ressource[] {
  const e = (bundle as { entry?: { resource?: Ressource }[] } | null)?.entry ?? [];
  return e.map((x) => x.resource).filter((r): r is Ressource => !!r);
}

export function dokumentinhaltLesen(bundle: unknown): Dokumentinhalt {
  const r = ressourcen(bundle);
  const komposition = r.find((x) => x.resourceType === 'Composition');
  const typ = JSON.stringify(komposition?.['type'] ?? '');
  const art: Dokumentinhaltsart = !komposition
    ? 'unstrukturiert'
    : istLaborbefund(bundle)
      ? 'Laborbefund'
      : typ.includes('18842-5')
        ? 'Entlassbrief'
        : 'strukturiert';
  return {
    art,
    diagnosen: r.filter((x) => x.resourceType === 'Condition'),
    allergien: r.filter((x) => x.resourceType === 'AllergyIntolerance'),
    prozeduren: r.filter((x) => x.resourceType === 'Procedure'),
    beobachtungen: r.filter((x) => x.resourceType === 'Observation' && !!x['valueQuantity']),
  };
}

const GEWISSHEIT_AUS_CODE: Record<string, string> = {
  confirmed: 'bestätigt',
  unconfirmed: 'unbestätigt',
  presumed: 'unbestätigt',
  refuted: 'widerlegt',
  'entered-in-error': 'irrtümlich',
};

/**
 * Bringt eine AllergyIntolerance aus einem Dokument in die Form der AMTS-Prüfung. Trägt die
 * Ressource selbst ATC-Kodierungen, werden sie genommen; sonst die Demo-Zuordnung über SNOMED CT.
 */
export function allergieAusFhir(r: Ressource, quelle: string): DokumentierteAllergie {
  const code =
    (r['code'] as { coding?: { system?: string; code?: string }[]; text?: string }) ?? {};
  const kodierungen = code.coding ?? [];
  const snomed = kodierungen.find((k) => k.system === CODESYSTEM.snomed)?.code ?? null;
  const eigeneAtc = kodierungen.filter((k) => k.system === CODESYSTEM.atc).map((k) => k.code ?? '');
  const gewissheitCode =
    (r['verificationStatus'] as { coding?: { code?: string }[] } | undefined)?.coding?.[0]?.code ??
    '';
  return {
    substanz: code.text ?? '(ohne Bezeichnung)',
    snomed,
    atc: eigeneAtc.length > 0 ? eigeneAtc : atcFuerSubstanz(snomed),
    typ: r['type'] === 'intolerance' ? 'Unverträglichkeit' : 'Allergie',
    gewissheit: GEWISSHEIT_AUS_CODE[gewissheitCode] ?? 'unbestätigt',
    quelle,
  };
}
