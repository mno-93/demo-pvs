/**
 * Betriebsschalter des Simulators — Demo-Steuerung, keine ePA-Schnittstelle.
 *
 * Ein Aktensystem, das immer sofort und fehlerfrei antwortet, taugt nicht für
 * Architekturgespräche. Über diese Schalter lassen sich die Lagen herstellen, über die
 * im Projekt gestritten wird: fehlende Befugnis, gleichzeitige Änderung, Latenz.
 */
/**
 * Ausbaustand der ePA. `release-3.1.3` bildet nur ab, was spezifiziert ist (ADR 0013).
 * `weiterentwicklung` schaltet zusätzlich die Vorschau auf ePA 3.2 (strukturierte
 * Laborbefunde), den vorgeschlagenen Diagnose-Service (ADR 0018) und die Patient Summary
 * (ADR 0021) frei.
 */
export type Ausbaustand = 'release-3.1.3' | 'weiterentwicklung' | 'weiterentwicklung-2';

/**
 * Stufen in aufsteigender Reihenfolge; jede enthält die vorige. Stufe 1: ✦ Listen für Allergien
 * und Diagnosen, Patient Summary, strukturierte Laborbefunde. Stufe 2: zusätzlich ✦ die
 * Impfliste (ADR 0026).
 */
export const STUFE: Record<Ausbaustand, number> = {
  'release-3.1.3': 0,
  weiterentwicklung: 1,
  'weiterentwicklung-2': 2,
};

export function abStufe(stufe: number): boolean {
  return STUFE[betriebslage.ausbaustand] >= stufe;
}

export interface Betriebslage {
  verzoegerungMs: number;
  ausbaustand: Ausbaustand;
  /**
   * Wenn wahr, ändert vor dem nächsten schreibenden Zugriff eine andere Einrichtung die
   * Liste. Der Lesenachweis des Primärsystems ist dann veraltet — 409, wie im Wirkbetrieb.
   */
  fremdeAenderungVorSchreibzugriff: boolean;
  /**
   * ✦ Woraus die Patient Summary gebildet wird: `listen` — aus den ärztlich geführten Listen
   * und dem Medikationsplan; `automatisch` — nur aus automatisch entstehenden Daten
   * (Medikationsliste, Laborbefunde). Zeigt den Unterschied zwischen beiden Wegen.
   */
  patientSummaryQuellen: 'listen' | 'automatisch';
  /**
   * Wie lange der E-Rezept-Fachdienst braucht, bis Verschreibung oder Abgabe in der ePA stehen.
   * Die Übertragung ist asynchron (IG `de.gematik.epa.medication` 1.3.5); 0 überträgt sofort.
   */
  erezeptVerzoegerungMs: number;
}

export const STANDARD_BETRIEBSLAGE: Betriebslage = {
  verzoegerungMs: 0,
  ausbaustand: 'weiterentwicklung-2',
  fremdeAenderungVorSchreibzugriff: false,
  patientSummaryQuellen: 'listen',
  erezeptVerzoegerungMs: 3000,
};

export const betriebslage: Betriebslage = { ...STANDARD_BETRIEBSLAGE };
