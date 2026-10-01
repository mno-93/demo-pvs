/**
 * Schlanke FHIR-Typen, nur so weit, wie die Demo sie braucht.
 *
 * Bewusst keine Abhängigkeit auf eine vollständige FHIR-Typbibliothek: Die Demo erzeugt
 * eine Handvoll Ressourcen, und eine vollständige Typmenge würde mehr verdecken als klären.
 */

export interface Coding {
  system?: string;
  version?: string;
  code?: string;
  display?: string;
  extension?: Extension[];
}

export interface CodeableConcept {
  coding?: Coding[];
  text?: string;
}

export interface Reference {
  reference?: string;
  display?: string;
  identifier?: { system?: string; value?: string };
}

export interface Extension {
  url: string;
  valueReference?: Reference;
  valueString?: string;
  valueCoding?: Coding;
  valueIdentifier?: { system?: string; value?: string };
  valueCode?: string;
  valueBoolean?: boolean;
  valueDateTime?: string;
  valuePositiveInt?: number;
  valueInteger?: number;
  valueMarkdown?: string;
  valuePeriod?: { start?: string; end?: string };
  valueAnnotation?: { text?: string };
  extension?: Extension[];
}

export interface Ressource {
  resourceType: string;
  id?: string;
  meta?: { profile?: string[]; versionId?: string; lastUpdated?: string };
  extension?: Extension[];
  [weitere: string]: unknown;
}
