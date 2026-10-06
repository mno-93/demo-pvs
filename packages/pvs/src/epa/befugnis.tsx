import { useState, useSyncExternalStore } from 'react';
import { demoJetzt, deutschesDatum, jetztAlsIsoOrtszeit } from '@demo-pvs/kern';
import { ausfuehren, lesen, useAuswahl } from '../speicher/speicher.js';
import { vorgaenge } from '../speicher/vorgaenge.js';
import type { EpaBefugnis } from '../speicher/zustand.js';
import { Marker } from '../bausteine/Bausteine.js';
import {
  EpaFehler,
  befugnisRegistrieren,
  befugnisseEntziehen,
  beiFehlenderBefugnis,
  pruefungsnachweisBilden,
} from './klient.js';

/**
 * Befugnis der Praxis für die ePA einer Person (ADR 0017).
 *
 * Nach dem Konzept ePA 3.1.3 entsteht sie, wenn die eGK in der Einrichtung gesteckt wird: Das
 * Primärsystem registriert den Prüfungsnachweis aus VSDM (`setEntitlementPs`), die ePA
 * antwortet mit dem Ende der Befugnis. Sie gilt 90 Tage. Ohne sie antwortet jeder Fachdienst
 * mit 403 `notEntitled`.
 *
 * Das Praxissystem führt nur, was die ePA ihm geantwortet hat. Maßgeblich bleibt die ePA:
 * Meldet sie `notEntitled`, berichtigt das Praxissystem seinen Stand.
 */

export function useBefugnis(patientId: string): EpaBefugnis | null {
  return useAuswahl(
    (z) => z.epaBefugnisse.find((b) => b.patientId === patientId) ?? null,
    [patientId],
  );
}

/** Besteht nach eigenem Wissen eine Befugnis? Abgelaufen zählt nicht — die ePA löscht sie. */
export function istGueltig(befugnis: EpaBefugnis | null, jetzt: Date = demoJetzt()): boolean {
  return befugnis !== null && new Date(befugnis.gueltigBis) > jetzt;
}

/** Wird beim Start einmal eingerichtet: Eine fehlende Befugnis berichtigt den eigenen Stand. */
export function befugnisabgleichEinrichten(): void {
  beiFehlenderBefugnis((kvnr) => {
    const patient = lesen().patienten.find((p) => p.versicherung.kvnr === kvnr);
    if (patient) ausfuehren(vorgaenge.befugnisVerloren(patient.id));
  });
}

/**
 * Demo-Steuerung „Befugnisse entziehen" — wie nach Ablauf der 90 Tage. Dann weiß es auch das
 * Praxissystem: Es kennt das Ende jeder Befugnis selbst und muss nicht erst an einem 403 merken,
 * dass sie vorbei ist. Ohne diesen Schritt stünde im Kopf weiter „ePA-Befugnis bis …", solange
 * keine Ansicht einen befugnispflichtigen Weg aufruft.
 */
export async function befugnisseAblaufenLassen(): Promise<number> {
  const entzogen = await befugnisseEntziehen();
  for (const b of lesen().epaBefugnisse) ausfuehren(vorgaenge.befugnisVerloren(b.patientId));
  return entzogen;
}

/*
 * Zähler der erfolgreichen Einlesungen. Ansichten, die die ePA abfragen, nehmen ihn in ihre
 * Abhängigkeiten und fragen nach dem Einlesen neu ab — nicht aber, wenn eine Befugnis verloren
 * geht; das würde nur einen zweiten, gleichen Fehler erzeugen.
 */
let einlesungen = 0;
const hoerer = new Set<() => void>();

export function useEinlesungen(): number {
  return useSyncExternalStore(
    (h) => {
      hoerer.add(h);
      return () => {
        hoerer.delete(h);
      };
    },
    () => einlesungen,
    () => einlesungen,
  );
}

export type Einleseergebnis = { ok: true; gueltigBis: string } | { ok: false; text: string };

/**
 * Einlesen der eGK: Versichertendaten (simuliert) und Befugnis für die ePA in einem Schritt —
 * so, wie es im Wirkbetrieb beim Stecken der Karte geschieht.
 */
export async function egkEinlesen(patientId: string): Promise<Einleseergebnis> {
  const patient = lesen().patienten.find((p) => p.id === patientId);
  if (!patient) return { ok: false, text: 'Diese Person gibt es in der Demo nicht.' };
  ausfuehren(vorgaenge.karteEinlesen(patientId));
  const kvnr = patient.versicherung.kvnr;
  try {
    const { validTo } = await befugnisRegistrieren(kvnr, pruefungsnachweisBilden(kvnr));
    ausfuehren(vorgaenge.befugnisErhalten(patientId, validTo, jetztAlsIsoOrtszeit(demoJetzt())));
    einlesungen += 1;
    hoerer.forEach((h) => h());
    return { ok: true, gueltigBis: validTo };
  } catch (f) {
    if (f instanceof EpaFehler && f.status === 404) {
      return {
        ok: false,
        text: 'Karte eingelesen. Für diese Person besteht keine ePA — es gibt nichts zu befugen.',
      };
    }
    if (f instanceof EpaFehler && f.status === 423) {
      return { ok: false, text: 'Karte eingelesen. Die ePA ist gesperrt (423 locked).' };
    }
    return {
      ok: false,
      text: `Karte eingelesen, Befugnis nicht erteilt: ${f instanceof EpaFehler ? f.diagnose : 'unbekannter Fehler'}`,
    };
  }
}

/** Kurzangabe für Köpfe und Listen. */
export function BefugnisMarker({ patientId }: { patientId: string }) {
  const befugnis = useBefugnis(patientId);
  if (!istGueltig(befugnis)) {
    return (
      <Marker ton="warn" titel="Die ePA gibt Daten erst nach dem Einlesen der eGK frei.">
        keine ePA-Befugnis
      </Marker>
    );
  }
  return (
    <Marker
      ton="gut"
      titel={`Erteilt beim Einlesen der eGK am ${deutschesDatum(befugnis!.erteiltAm.slice(0, 10))}; 90 Tage nach Konzept ePA 3.1.3`}
    >
      ePA-Befugnis bis {deutschesDatum(befugnis!.gueltigBis.slice(0, 10))}
    </Marker>
  );
}

/** Knopf „eGK einlesen" mit Rückmeldung daneben. */
export function EgkKnopf({
  patientId,
  stark = false,
  klein = true,
  beschriftung = 'eGK einlesen',
}: {
  patientId: string;
  stark?: boolean;
  klein?: boolean;
  beschriftung?: string;
}) {
  const [laeuft, setzeLaeuft] = useState(false);
  const [meldung, setzeMeldung] = useState<Einleseergebnis | null>(null);
  return (
    <span className="egk">
      <button
        type="button"
        className={['knopf', klein ? 'klein' : '', stark ? 'stark' : ''].join(' ').trim()}
        disabled={laeuft}
        title="Simuliert: Karte stecken, Prüfungsnachweis bilden, Befugnis in der ePA registrieren"
        onClick={async () => {
          setzeLaeuft(true);
          setzeMeldung(await egkEinlesen(patientId));
          setzeLaeuft(false);
        }}
      >
        {laeuft ? 'Karte wird gelesen …' : beschriftung}
      </button>
      {meldung && !meldung.ok && (
        <span className="egk-meldung" role="status">
          {meldung.text}
        </span>
      )}
    </span>
  );
}

/** Hinweis an der Stelle, an der ePA-Daten stünden. */
export function BefugnisHinweis({ patientId, was }: { patientId: string; was?: string }) {
  const befugnis = useBefugnis(patientId);
  return (
    <div className="hinweisbox warn" role="note">
      <b>Keine Befugnis für die ePA dieser Person.</b>
      {(was || befugnis) && (
        <div className="leise-klein" style={{ margin: '4px 0 8px' }}>
          {was}
          {was && befugnis ? ' · ' : ''}
          {befugnis ? `abgelaufen am ${deutschesDatum(befugnis.gueltigBis.slice(0, 10))}` : ''}
        </div>
      )}
      <EgkKnopf patientId={patientId} stark />
    </div>
  );
}
