/**
 * @demo-pvs/kern — fachlicher Kern des Demo-Praxisverwaltungssystems.
 *
 * Enthält Domänentypen, Katalogauszüge, Fachlogik und die Abbildung nach FHIR.
 * Kennt weder Oberfläche noch Server: Alles hier ist ohne Laufzeitumgebung testbar.
 */
export * from './typen/index.js';
export * from './kataloge/index.js';
export * from './fachlogik/datum.js';
export * from './fachlogik/kvnr.js';
export * from './fachlogik/abrechnung.js';
export * from './fachlogik/suche.js';
export * from './fachlogik/dokumentabgleich.js';
export * from './fachlogik/amts.js';
export * from './fachlogik/verlauf.js';
export * from './fachlogik/aenderungen.js';
export * from './fachlogik/laborbefund.js';
export * from './fachlogik/dokumentinhalt.js';
export * from './fachlogik/listenabgleich.js';
export * from './fachlogik/listenordnung.js';
export * from './fachlogik/dosierungstext.js';
export * from './fachlogik/dosierung.js';
export * from './fachlogik/praxisplan.js';
export * from './fachlogik/planabgleich.js';
export * from './fachlogik/lotse.js';
export * from './fachlogik/pdf.js';
export * from './fachlogik/beschriftung.js';
export * from './fachlogik/briefansicht.js';
export * from './fachlogik/arztbrief.js';
export * from './fachlogik/xml.js';
export * from './fachlogik/xds.js';
export * from './fachlogik/kim.js';
export * from './fhir/typen.js';
export * from './fhir/vollurl.js';
export * from './fhir/pruefung.js';
export * from './fhir/profilpruefung.js';
export * from './fhir/zeit.js';
export * from './fhir/medikation.js';
export * from './fhir/abbildung.js';
export * from './fhir/lesen.js';
export * from './fhir/patient-summary.js';
export * from './fhir/erezept.js';
export * from './beispiele.js';
