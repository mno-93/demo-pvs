import type {
  Lesart,
  Lotsenantwort,
  Lotsenkontext,
  Lotsenvorschlaege,
  Quellentext,
  Ressource,
} from '@demo-pvs/kern';
import {
  MHD,
  PATIENT_SUMMARY,
  AKTENLOTSE,
  angebotMerken,
  GRUNDLAGE,
  EpaFehler,
  anfragen,
  Bundle,
  treffer,
} from '../klient.js';
import { type Kontakteintrag } from '@demo-pvs/kern';

/**
 * ✦ Patient Summary (ADR 0021): Sicht aus den Diensten der ePA, `Patient/$summary`, und die
 * erzeugte ePS. ✦ Aktenlotse (ab Weiterentwicklung 4) mit Kontext, Vorschlägen, Fragen,
 * Beschriftung und Quellen; Kontaktsuche für den Arztbrief.
 */

/** Bietet das Aktensystem die Patient Summary an? Antwort aus seinem CapabilityStatement. */
/** Gemerkte Antwort, ob das Aktensystem die Patient Summary anbietet. */
let summaryAngeboten: boolean | null = null;
angebotMerken(() => {
  summaryAngeboten = null;
});

export async function patientSummaryVerfuegbar(): Promise<boolean> {
  if (summaryAngeboten !== null) return summaryAngeboten;
  try {
    await anfragen({ pfad: `${PATIENT_SUMMARY}/metadata`, grundlage: GRUNDLAGE.summary });
    summaryAngeboten = true;
  } catch (f) {
    if (!(f instanceof EpaFehler && f.status === 404)) throw f;
    summaryAngeboten = false;
  }
  return summaryAngeboten;
}

/**
 * Die ePA European Patient Summary des Aktensystems (Vorschau ePA 3.2, Ballots): ITI-67 nach
 * `type=http://loinc.org|60591-5` und `status=current` — die Suche erzeugt sie —, dann ITI-68 über
 * die Abrufadresse (IG-MHD35244MFP, SOLL). `null`, wenn das Aktensystem keine liefert, wie im
 * Release 3.1.3.
 */
export async function epaPatientSummarySuchen(
  kvnr: string,
): Promise<{ verweis: Ressource; inhalt: unknown } | null> {
  const suche = new URLSearchParams({
    'patient.identifier': `http://fhir.de/sid/gkv/kvid-10|${kvnr}`,
    type: 'http://loinc.org|60591-5',
    status: 'current',
  });
  const { inhalt } = await anfragen<Bundle>({
    pfad: `${MHD}/DocumentReference?${suche.toString()}`,
    kvnr,
    grundlage: GRUNDLAGE.iti67Eps,
  });
  const verweis = treffer(inhalt)[0];
  if (!verweis) return null;
  const url = (verweis['content'] as { attachment?: { url?: string } }[] | undefined)?.[0]
    ?.attachment?.url;
  if (!url) throw new EpaFehler(0, 'Der Dokumentverweis nennt keine Abrufadresse.');
  const abruf = await anfragen<unknown>({
    pfad: url,
    kvnr,
    grundlage: GRUNDLAGE.iti68Eps,
    datei: true,
  });
  return { verweis, inhalt: abruf.inhalt };
}

/**
 * Die Patient Summary — bei jeder Abfrage aus den Diensten der ePA gebildet. Mit `stand` ✦ ein
 * früherer Stand: die Kennung eines Eintrags aus dem Verlauf, wie `$medication-plan?provenance=…`.
 */
export async function patientSummaryAbrufen(kvnr: string, stand?: string): Promise<unknown> {
  const { inhalt } = await anfragen<unknown>({
    pfad: `${PATIENT_SUMMARY}/Patient/$summary${stand ? `?provenance=${encodeURIComponent(stand)}` : ''}`,
    kvnr,
    grundlage: stand ? GRUNDLAGE.summaryStand : GRUNDLAGE.summary,
  });
  return inhalt;
}

/** ✦ Änderungsverlauf der Patient Summary: je Änderung Zeitpunkt, Einrichtung, Quelle, Einträge. */
export async function patientSummaryVerlaufAbrufen(kvnr: string): Promise<unknown> {
  const { inhalt } = await anfragen<unknown>({
    pfad: `${PATIENT_SUMMARY}/Patient/$summary-log`,
    kvnr,
    grundlage: GRUNDLAGE.summaryVerlauf,
  });
  return inhalt;
}

/* ---------- ✦ Aktenlotse (Vorschlag, ab Ausbaustand „Weiterentwicklung 4") ---------- */

/**
 * Der Lotse läuft über dieselbe Prüfkette wie jeder andere ePA-Weg: dieselbe Sitzung,
 * dieselbe Befugnis, dieselbe Akte. Er bekommt dadurch keine eigenen Rechte — er sieht
 * genau so viel wie das aufrufende System.
 */
export async function lotseFragen(
  kvnr: string,
  frage: string,
  lesart: Lesart = 'fach',
  /** Gesetzt, wenn nicht die Praxis fragt, sondern die versicherte Person oder ihre Vertretung. */
  alsVersicherte?: string,
): Promise<Lotsenantwort> {
  const { inhalt } = await anfragen<Lotsenantwort>({
    methode: 'POST',
    pfad: `${AKTENLOTSE}/frage`,
    kvnr,
    koerper: { frage, lesart },
    inhaltstyp: 'application/json',
    grundlage: alsVersicherte ? `${GRUNDLAGE.lotse} · Versichertenzugang` : GRUNDLAGE.lotse,
    ...(alsVersicherte ? { zusatz: { 'x-demo-versicherte': alsVersicherte } } : {}),
  });
  return inhalt;
}

/** Kontext zum Anlass des Kontakts, mit Hinweis auf auseinandergehende Angaben. */
export async function lotseKontext(kvnr: string, anlass: string): Promise<Lotsenkontext> {
  const { inhalt } = await anfragen<Lotsenkontext>({
    pfad: `${AKTENLOTSE}/kontext?anlass=${encodeURIComponent(anlass)}`,
    kvnr,
    inhaltstyp: 'application/json',
    grundlage: GRUNDLAGE.lotse,
  });
  return inhalt;
}

/** Was eine strukturierte Liste aus dem unstrukturierten Bestand aufnehmen könnte. */
export async function lotseVorschlaege(kvnr: string): Promise<Lotsenvorschlaege> {
  const { inhalt } = await anfragen<Lotsenvorschlaege>({
    pfad: `${AKTENLOTSE}/vorschlaege`,
    kvnr,
    inhaltstyp: 'application/json',
    grundlage: GRUNDLAGE.lotse,
  });
  return inhalt;
}

/** ✦ Ein Dokument, dessen Metadaten nicht sagen, worum es geht — und was laut Inhalt darin steht. */
export interface Beschriftungsbefund {
  quelleId: string;
  titel: string;
  gruende: string[];
  lautInhalt: string | null;
  datumLautInhalt: string | null;
  beleg: string | null;
}

/** ✦ Unklar beschriftete Dokumente der Akte. */
export async function lotseBeschriftung(
  kvnr: string,
  alsVersicherte?: string,
): Promise<Beschriftungsbefund[]> {
  const { inhalt } = await anfragen<Beschriftungsbefund[]>({
    pfad: `${AKTENLOTSE}/beschriftung`,
    kvnr,
    inhaltstyp: 'application/json',
    grundlage: alsVersicherte ? `${GRUNDLAGE.lotse} · Versichertenzugang` : GRUNDLAGE.lotse,
    ...(alsVersicherte ? { zusatz: { 'x-demo-versicherte': alsVersicherte } } : {}),
  });
  return inhalt;
}

export type { Kontakteintrag };

/**
 * ✦ Kontaktauskunft zu einer Einrichtung, gesucht über die Bezeichnung aus den Metadaten.
 * Kein Treffer ist eine Antwort, kein Fehler: `null`.
 */
export async function kontaktSuchen(name: string): Promise<Kontakteintrag | null> {
  try {
    const { inhalt } = await anfragen<Kontakteintrag>({
      pfad: `/epa/vorschlag/kontakt/api/v1/einrichtung?name=${encodeURIComponent(name)}`,
      inhaltstyp: 'application/json',
      grundlage: GRUNDLAGE.kontakt,
    });
    return inhalt;
  } catch (f) {
    if (f instanceof EpaFehler && f.status === 404) return null;
    throw f;
  }
}

/** Eine Unterlage öffnen und nachlesen — der Weg, auf den die Quellenangabe einer Antwort zeigt. */
export async function lotseQuelle(
  kvnr: string,
  quelleId: string,
  alsVersicherte?: string,
): Promise<Quellentext> {
  const { inhalt } = await anfragen<Quellentext>({
    pfad: `${AKTENLOTSE}/quelle/${encodeURIComponent(quelleId)}`,
    kvnr,
    inhaltstyp: 'application/json',
    grundlage: GRUNDLAGE.lotse,
    ...(alsVersicherte ? { zusatz: { 'x-demo-versicherte': alsVersicherte } } : {}),
  });
  return inhalt;
}

/** Ob der Ausbaustand den Lotsen anbietet. */
let lotseAngeboten: boolean | null = null;
angebotMerken(() => {
  lotseAngeboten = null;
});

export async function lotseVorhanden(): Promise<boolean> {
  if (lotseAngeboten !== null) return lotseAngeboten;
  try {
    await anfragen({
      pfad: `${AKTENLOTSE}/metadata`,
      inhaltstyp: 'application/json',
      grundlage: GRUNDLAGE.lotse,
    });
    lotseAngeboten = true;
  } catch (f) {
    if (!(f instanceof EpaFehler && f.status === 404)) throw f;
    lotseAngeboten = false;
  }
  return lotseAngeboten;
}
