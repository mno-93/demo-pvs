/**
 * Absolute `fullUrl` für Einträge in Bundles der Demo.
 *
 * FHIR R4, Bundle, „Resolving references in Bundles": Ein relativer Verweis wie `Patient/x`
 * löst sich gegen die Basis der `fullUrl` des verweisenden Eintrags auf. Mit `urn:uuid:` als
 * `fullUrl` gibt es keine Basis — und `urn:uuid:` verlangt eine echte UUID. Die Demo führt
 * deshalb eine feste, erfundene Basis im eigenen Namensraum; die Verweise bleiben relativ.
 */
export const DEMO_FHIR_BASIS = 'https://example.org/demo-pvs/fhir';

export function vollUrl(r: { resourceType: string; id?: unknown }): string {
  return `${DEMO_FHIR_BASIS}/${r.resourceType}/${String(r.id)}`;
}
