import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { HERKUNFT_EXTENSION, type EpaDokument, type Ressource } from '@demo-pvs/kern';
import { EpaFehler, betriebsstandAbonnieren, betriebsstandLesen } from './klient.js';

/**
 * Laden und Lesen von ePA-Beständen für die Anzeige.
 *
 * Bewusst als ausdrücklicher Ladevorgang mit sichtbaren Zuständen — laden, Fehler, Bestand.
 * Ein Praxissystem, das ePA-Daten unbemerkt und immer verfügbar hätte, würde die
 * entscheidende Eigenschaft verdecken: Die Akte ist ein fremdes System, das antworten muss.
 */

/** Fehlerlage einer Abfrage; `code` trägt den Fehlercode der Basisdienste, etwa `notEntitled`. */
export interface Abfragefehler {
  status: number;
  text: string;
  code: string | null;
}

export interface Ladezustand<T> {
  laedt: boolean;
  fehler: Abfragefehler | null;
  daten: T | null;
  /** Wann die Daten zuletzt aus der ePA kamen — Uhrzeit der letzten erfolgreichen Abfrage. */
  geladenUm: Date | null;
  neuLaden: () => void;
}

/**
 * Führt eine ePA-Abfrage aus, sobald sich die Abhängigkeiten ändern, und hält ihren Zustand.
 * Mit `aktiv = false` wartet sie, bis sie gebraucht wird — etwa bis ein Bereich geöffnet wird.
 */
export function useEpaAbfrage<T>(
  laden: () => Promise<T>,
  abhaengigkeiten: readonly unknown[],
  aktiv = true,
): Ladezustand<T> {
  const [laedt, setzeLaedt] = useState(aktiv);
  const [fehler, setzeFehler] = useState<Ladezustand<T>['fehler']>(null);
  const [daten, setzeDaten] = useState<T | null>(null);
  const [geladenUm, setzeGeladenUm] = useState<Date | null>(null);
  const [zaehler, setzeZaehler] = useState(0);
  const neuLaden = useCallback(() => setzeZaehler((z) => z + 1), []);

  useEffect(() => {
    if (!aktiv) return;
    let abgebrochen = false;
    setzeLaedt(true);
    setzeFehler(null);
    laden()
      .then((ergebnis) => {
        if (abgebrochen) return;
        setzeDaten(ergebnis);
        setzeGeladenUm(new Date());
        setzeLaedt(false);
      })
      .catch((f: unknown) => {
        if (abgebrochen) return;
        const epa = f instanceof EpaFehler ? f : null;
        setzeFehler({
          status: epa?.status ?? 0,
          text: epa?.diagnose ?? 'Unbekannter Fehler',
          code: epa?.code ?? null,
        });
        setzeDaten(null);
        setzeLaedt(false);
      });
    return () => {
      abgebrochen = true;
    };
    // `laden` ist bei jedem Rendern neu; maßgeblich sind die angegebenen Abhängigkeiten.
  }, [...abhaengigkeiten, zaehler, aktiv]);

  return { laedt, fehler, daten, geladenUm, neuLaden };
}

/** Fehlt der Praxis die Befugnis für diese Akte? (403 `notEntitled`, ADR 0017) */
export function ohneBefugnis(fehler: { status: number; code?: string | null } | null): boolean {
  return fehler?.status === 403 && fehler.code === 'notEntitled';
}

/** Stand der Demo-Steuerung — ändert sich, wenn Ausbaustand oder Bestand umgestellt werden. */
export function useBetriebsstand(): number {
  return useSyncExternalStore(betriebsstandAbonnieren, betriebsstandLesen, betriebsstandLesen);
}

/** Kurztext zu einer Fehlerlage der ePA, für Überschriften. */
export function fehlerTitel(fehler: { status: number; code?: string | null }): string {
  if (ohneBefugnis(fehler)) return 'Keine Befugnis für die ePA dieser Person.';
  if (fehler.status === 404 && fehler.code === 'noHealthRecord')
    return 'Für diese Person besteht keine ePA.';
  if (fehler.status === 409 && fehler.code === 'statusMismatch')
    return 'Die ePA ist vorübergehend gesperrt.';
  if (fehler.status === 423)
    return 'Die versicherte Person hat dem Medikationsprozess widersprochen.';
  if (fehler.status === 403) return 'Kein Zugriff auf die ePA dieser Person.';
  if (fehler.status === 0) return 'Die ePA ist nicht erreichbar.';
  return `Die ePA antwortete mit ${fehler.status}.`;
}

/* ---------- DocumentReference nach MHD ---------- */

interface Kodewert {
  code: string;
  anzeige: string;
}

export interface Dokumentverweis {
  id: string;
  titel: string;
  datum: string;
  autor: string;
  /** Die einstellende Einrichtung laut Metadaten (Autor vom Typ Organization), sonst leer. */
  einrichtung: string;
  klasse: Kodewert | null;
  typ: Kodewert | null;
  /** formatCode — fehlt, wenn der Dokumenttyp im Release nicht registriert ist. */
  format: Kodewert | null;
  mimeType: string;
  groesse: number | null;
  uniqueId: string | null;
  ressource: Ressource;
}

function kodewert(konzept: unknown): Kodewert | null {
  const k = (konzept as { coding?: { code?: string; display?: string }[] } | undefined)
    ?.coding?.[0];
  return k?.code ? { code: k.code, anzeige: k.display ?? k.code } : null;
}

/**
 * Dokumentenlisten zeigen das Neueste oben — in jeder Sicht gleich. Die ePA liefert die
 * Einträge ohne zugesicherte Reihenfolge.
 */
export function dokumenteSortieren(verweise: readonly Dokumentverweis[]): Dokumentverweis[] {
  // Dieselbe Regel wie der Abgleich der Kartei (`dokumenteAbgleichen`): Datum, dann Titel.
  return [...verweise].sort(
    (a, b) => b.datum.localeCompare(a.datum) || a.titel.localeCompare(b.titel, 'de'),
  );
}

export function dokumentverweisLesen(r: Ressource): Dokumentverweis {
  const inhalt = (
    r['content'] as { attachment?: Record<string, unknown>; format?: unknown }[] | undefined
  )?.[0];
  const anhang = inhalt?.attachment ?? {};
  const format = inhalt?.format as { code?: string; display?: string } | undefined;
  return {
    id: String(r.id),
    titel: (r['description'] as string) ?? String(anhang['title'] ?? '(ohne Titel)'),
    datum: String(r['date'] ?? anhang['creation'] ?? ''),
    // Person und Einrichtung stehen als zwei Autoren; die Anzeige führt beide.
    autor: ((r['author'] as { display?: string }[] | undefined) ?? [])
      .map((a) => a.display)
      .filter(Boolean)
      .join(', '),
    einrichtung:
      ((r['author'] as { type?: string; display?: string }[] | undefined) ?? []).find(
        (a) => a.type === 'Organization',
      )?.display ?? '',
    klasse: kodewert((r['category'] as unknown[] | undefined)?.[0]),
    typ: kodewert(r['type']),
    format: format?.code ? { code: format.code, anzeige: format.display ?? format.code } : null,
    mimeType: String(anhang['contentType'] ?? ''),
    groesse: typeof anhang['size'] === 'number' ? (anhang['size'] as number) : null,
    uniqueId: (r['masterIdentifier'] as { value?: string } | undefined)?.value ?? null,
    ressource: r,
  };
}

/** Für den Abgleich mit der Praxisablage. */
export function alsEpaDokument(v: Dokumentverweis): EpaDokument {
  const [autor, ...einrichtung] = v.autor.split(', ');
  return {
    id: v.id,
    titel: v.titel,
    art: v.typ?.anzeige ?? v.klasse?.anzeige ?? 'Dokument',
    datum: v.datum,
    einrichtung: einrichtung.join(', ') || v.autor,
    autor: autor ?? '',
    uniqueId: v.uniqueId,
  };
}

/** Ein strukturiertes Dokument lässt sich abrufen und auslesen; PDF und XML nicht. */
export function istStrukturiert(v: Dokumentverweis): boolean {
  return v.mimeType.startsWith('application/fhir+');
}

/* ---------- Auslesen von FHIR-Ressourcen für die Anzeige ---------- */

export interface Herkunftsangabe {
  dokumentId: string | null;
  anzeige: string;
}

export function herkunftVon(ressource: Ressource): Herkunftsangabe {
  const extension = (ressource.extension ?? []).find((e) => e.url === HERKUNFT_EXTENSION);
  const verweis = extension?.valueReference;
  if (!verweis) {
    const quelle = ressource['informationSource'] as { display?: string } | undefined;
    return { dokumentId: null, anzeige: quelle?.display ?? 'ohne Dokumentbezug' };
  }
  return {
    dokumentId: verweis.reference?.replace('DocumentReference/', '') ?? null,
    anzeige: verweis.display ?? 'Quelldokument',
  };
}

type Konzept = { text?: string; coding?: { system?: string; code?: string; display?: string }[] };

export function textVon(ressource: Ressource, feld = 'code'): string {
  const konzept = (ressource[feld] ?? ressource['medicationCodeableConcept']) as
    Konzept | undefined;
  return konzept?.text ?? konzept?.coding?.[0]?.display ?? '(ohne Bezeichnung)';
}

export function codeVon(ressource: Ressource, feld = 'code', system?: string): string | null {
  const konzept = (ressource[feld] ?? ressource['medicationCodeableConcept']) as
    Konzept | undefined;
  const kodierungen = konzept?.coding ?? [];
  return (system ? kodierungen.find((k) => k.system === system) : kodierungen[0])?.code ?? null;
}

export function statusVon(ressource: Ressource): string {
  const status = ressource['clinicalStatus'] as { coding?: { code?: string }[] } | undefined;
  return status?.coding?.[0]?.code ?? (ressource['status'] as string) ?? '';
}

export function datumVon(ressource: Ressource): string {
  return (
    (ressource['recordedDate'] as string) ??
    (ressource['onsetDateTime'] as string) ??
    (ressource['effectiveDateTime'] as string) ??
    (ressource['performedDateTime'] as string) ??
    (ressource['timingDateTime'] as string) ??
    (ressource['authoredOn'] as string) ??
    (ressource['whenHandedOver'] as string) ??
    (ressource['date'] as string) ??
    ''
  );
}

export function autorVon(ressource: Ressource): string {
  const recorder = ressource['recorder'] as { display?: string } | undefined;
  const author = ressource['author'] as { display?: string }[] | undefined;
  return recorder?.display ?? author?.[0]?.display ?? '';
}

/** Medikament zu einer MedicationRequest, -Dispense oder -Statement, über den Verweis. */
export function medikamentZu(r: Ressource, medikamente: readonly Ressource[]): Ressource | null {
  const verweis = (r['medicationReference'] as { reference?: string } | undefined)?.reference ?? '';
  const id = verweis.split('/')[1];
  return medikamente.find((m) => m.id === id) ?? null;
}
