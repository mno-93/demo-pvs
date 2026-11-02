import { EINRICHTUNG, GRUNDLAGE, anfragen, betriebsstandErhoehen } from '../epa/klient.js';
import { type Ausbaustand } from '@demo-pvs/kern';

/**
 * Demo-Steuerung des Simulators (`/verwaltung`) — keine Schnittstelle der ePA, sondern die
 * Bedienung der Demo: Betriebslage und Ausbaustand, Akten, Befugnisse, fremde Einträge, die
 * Apotheke des E-Rezept-Ersatzes und das Zurücksetzen. Getrennt vom ePA-Klienten, damit dessen
 * Grenze die der ePA bleibt (ARCHITEKTUR).
 */

export type { Ausbaustand };

export interface Betriebslage {
  verzoegerungMs: number;
  ausbaustand: Ausbaustand;
  fremdeAenderungVorSchreibzugriff: boolean;
  /** ✦ Woraus die Patient Summary gebildet wird — ärztlich geführte Listen oder nur Automatik. */
  patientSummaryQuellen: 'listen' | 'automatisch';
  /** Dauer, bis der E-Rezept-Fachdienst Verschreibung oder Abgabe in die ePA übertragen hat. */
  erezeptVerzoegerungMs: number;
}

export async function betriebslageLesen(): Promise<Betriebslage> {
  return (
    await anfragen<Betriebslage>({
      pfad: '/verwaltung/betriebslage',
      grundlage: GRUNDLAGE.verwaltung,
    })
  ).inhalt;
}

export async function betriebslageSetzen(teil: Partial<Betriebslage>): Promise<Betriebslage> {
  const { inhalt } = await anfragen<Betriebslage>({
    methode: 'POST',
    pfad: '/verwaltung/betriebslage',
    koerper: teil,
    grundlage: GRUNDLAGE.verwaltung,
  });
  if (teil.ausbaustand !== undefined || teil.patientSummaryQuellen !== undefined) {
    betriebsstandErhoehen();
  }
  return inhalt;
}

/** Ein E-Rezept, wie es die Demo-Steuerung aus Sicht der Apotheke zeigt. */
export interface ApothekenRezept {
  id: string;
  kvnr: string | null;
  status: string;
  arzneimittel: string;
  authoredOn: string;
  epa: string;
  abgabe: string;
  empId: string | null;
}

export async function apothekenRezepteLesen(): Promise<ApothekenRezept[]> {
  return (
    await anfragen<ApothekenRezept[]>({
      pfad: '/verwaltung/erezepte',
      grundlage: GRUNDLAGE.verwaltung,
    })
  ).inhalt;
}

export type Abgabeart = 'wie-verordnet' | 'austausch' | 'mehrfach';

/** Die Apotheke gibt ab — die Abgabe erreicht die ePA über den E-Rezept-Fachdienst. */
export async function apothekeGibtAb(id: string, art: Abgabeart): Promise<void> {
  await anfragen({
    methode: 'POST',
    pfad: `/verwaltung/erezepte/${id}/abgabe`,
    koerper: { art },
    grundlage: GRUNDLAGE.verwaltung,
  });
}

export async function apothekeStorniertAbgabe(id: string): Promise<void> {
  await anfragen({
    methode: 'POST',
    pfad: `/verwaltung/erezepte/${id}/abgabe-storno`,
    koerper: {},
    grundlage: GRUNDLAGE.verwaltung,
  });
}

export interface Aktenlage {
  kvnr: string;
  status: 'ACTIVATED' | 'SUSPENDED';
  widersprueche: { medication: 'permit' | 'deny'; 'erp-submission': 'permit' | 'deny' };
}

export async function aktenLesen(): Promise<Aktenlage[]> {
  return (
    await anfragen<Aktenlage[]>({ pfad: '/verwaltung/bestand', grundlage: GRUNDLAGE.verwaltung })
  ).inhalt;
}

/** Zustand oder Widerspruch einer Akte umstellen — wie es die versicherte Person täte. */
export async function akteSetzen(
  kvnr: string,
  teil: { status?: 'ACTIVATED' | 'SUSPENDED'; medication?: 'permit' | 'deny' },
): Promise<void> {
  await anfragen({
    methode: 'POST',
    pfad: '/verwaltung/akte',
    koerper: { kvnr, ...teil },
    grundlage: GRUNDLAGE.verwaltung,
  });
  betriebsstandErhoehen();
}

/** Eine andere Einrichtung trägt jetzt in die Listen ein — für „neu seit dem letzten Aufruf". */
export async function fremdeEintraegeAnlegen(kvnr: string): Promise<void> {
  await anfragen({
    methode: 'POST',
    pfad: '/verwaltung/fremde-eintraege',
    koerper: { kvnr },
    grundlage: GRUNDLAGE.verwaltung,
  });
  betriebsstandErhoehen();
}

export async function aktensystemZuruecksetzen(): Promise<void> {
  await anfragen({
    methode: 'POST',
    pfad: '/verwaltung/zuruecksetzen',
    koerper: {},
    grundlage: GRUNDLAGE.verwaltung,
  });
  betriebsstandErhoehen();
}

export interface Aktenbefugnis {
  kvnr: string;
  befugnisse: {
    telematikId: string;
    anzeige: string;
    gueltigBis: string;
    erteiltAm: string;
    weg: string;
  }[];
}

export async function befugnisseLesen(): Promise<Aktenbefugnis[]> {
  return (
    await anfragen<Aktenbefugnis[]>({
      pfad: '/verwaltung/befugnisse',
      grundlage: GRUNDLAGE.verwaltung,
    })
  ).inhalt;
}

/** Wie nach Ablauf der 90 Tage: Die Praxis verliert alle Befugnisse. */
export async function befugnisseEntziehen(): Promise<number> {
  const { inhalt } = await anfragen<{ entzogen: number }>({
    methode: 'POST',
    pfad: '/verwaltung/befugnisse/entziehen',
    koerper: { telematikId: EINRICHTUNG.telematikId },
    grundlage: GRUNDLAGE.verwaltung,
  });
  // Wie jede Umstellung der Demo-Steuerung: Offene Ansichten fragen neu, bekommen 403
  // `notEntitled` und berichtigen darüber den Stand des Praxissystems (ADR 0017). Ohne das
  // stünde im Kopf noch „ePA-Befugnis bis …" neben Daten, die es nicht mehr geben dürfte.
  betriebsstandErhoehen();
  return inhalt.entzogen;
}

/* ---------- Befugnis ---------- */
