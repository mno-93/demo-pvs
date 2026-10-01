/**
 * Typen des Browser-Simulators (`src/browser.ts`, ADR 0025) für Pakete, die ihn einbinden,
 * ohne die Quellen des Simulators mitzuprüfen.
 */
export interface BrowserSimulator {
  abrufen: (anfrage: Request) => Promise<Response>;
}
export function simulatorImBrowser(): BrowserSimulator;
