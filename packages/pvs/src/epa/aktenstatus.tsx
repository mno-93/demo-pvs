import { deutschesDatum, type Patient } from '@demo-pvs/kern';
import { Marker } from '../bausteine/Bausteine.js';
import { istGueltig, useBefugnis, useEinlesungen } from './befugnis.js';
import { aktenstatusLesen, type Aktenstatus } from './klient.js';
import { useBetriebsstand, useEpaAbfrage, type Ladezustand } from './epa-bestand.js';

/**
 * Zustand des ePA-Zugangs für eine Person (ADR 0023).
 *
 * Das Praxissystem fragt den Information Service, bevor es etwas aus der Akte liest — ohne
 * Befugnis und ohne Anmeldung (`getRecordStatus`, `getConsentDecisionInformation`). Daraus und
 * aus der eigenen Befugnis ergibt sich genau ein Zustand, den der Patientenkopf zeigt:
 *
 * | Zustand | Anzeige |
 * |---|---|
 * | Akte nicht vorhanden (404 `noHealthRecord`) | keine ePA |
 * | Akte vorübergehend gesperrt (409 `statusMismatch`) | ePA gesperrt |
 * | Aktensystem nicht erreichbar | ePA nicht erreichbar |
 * | Akte vorhanden, keine Befugnis | keine ePA-Befugnis |
 * | Akte vorhanden, Befugnis | ePA-Befugnis bis … |
 *
 * Dazu, unabhängig davon, ein Widerspruch gegen den Medikationsprozess.
 */

export function useAktenstatus(patient: Patient | undefined): Ladezustand<Aktenstatus> {
  const kvnr = patient?.versicherung.kvnr ?? '';
  const betriebsstand = useBetriebsstand();
  const einlesungen = useEinlesungen();
  return useEpaAbfrage(() => aktenstatusLesen(kvnr), [kvnr, betriebsstand, einlesungen], !!kvnr);
}

export type Zugangszustand =
  'pruefung' | 'keine' | 'gesperrt' | 'unerreichbar' | 'ohne-befugnis' | 'befugt';

export function zugangszustand(status: Ladezustand<Aktenstatus>, befugt: boolean): Zugangszustand {
  if (status.fehler) return 'unerreichbar';
  if (!status.daten) return 'pruefung';
  if (status.daten.akte === 'keine') return 'keine';
  if (status.daten.akte === 'gesperrt') return 'gesperrt';
  return befugt ? 'befugt' : 'ohne-befugnis';
}

/** Marker im Patientenkopf: ein Zustand, dazu der Widerspruch gegen den Medikationsprozess. */
export function EpaZugang({
  patient,
  status,
}: {
  patient: Patient;
  status: Ladezustand<Aktenstatus>;
}) {
  const befugnis = useBefugnis(patient.id);
  const zustand = zugangszustand(status, istGueltig(befugnis));
  return (
    <>
      {zustand === 'pruefung' && <Marker ton="neutral">ePA wird geprüft …</Marker>}
      {zustand === 'keine' && (
        <Marker ton="neutral" titel="Das Aktensystem meldet keine Akte (404 noHealthRecord).">
          keine ePA
        </Marker>
      )}
      {zustand === 'gesperrt' && (
        <Marker ton="warn" titel="Die Akte ist vorübergehend nicht nutzbar (409 statusMismatch).">
          ePA vorübergehend gesperrt
        </Marker>
      )}
      {zustand === 'unerreichbar' && (
        <Marker ton="fehler" titel={status.fehler?.text}>
          ePA nicht erreichbar
        </Marker>
      )}
      {zustand === 'ohne-befugnis' && (
        <Marker ton="warn" titel="Die ePA gibt Daten erst nach dem Einlesen der eGK frei.">
          keine ePA-Befugnis
        </Marker>
      )}
      {zustand === 'befugt' && (
        <Marker
          ton="gut"
          titel={`Erteilt beim Einlesen der eGK am ${deutschesDatum(befugnis!.erteiltAm.slice(0, 10))}; 90 Tage nach Konzept ePA 3.1.3`}
        >
          ePA-Befugnis bis {deutschesDatum(befugnis!.gueltigBis.slice(0, 10))}
        </Marker>
      )}
      {status.daten?.medikationGesperrt && (
        <Marker
          ton="warn"
          titel="Medikationsliste und Medikationsplan sind für Einrichtungen gesperrt. E-Rezepte gelangen weiter in die Akte."
        >
          Widerspruch Medikationsprozess
        </Marker>
      )}
    </>
  );
}

const UHRZEIT = new Intl.DateTimeFormat('de-DE', {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

/** „Stand hh:mm:ss" und „aktualisieren" — für jede Ansicht, die aus der ePA liest. */
export function Abrufstand({
  geladenUm,
  laedt,
  neuLaden,
}: {
  geladenUm: Date | null;
  laedt: boolean;
  neuLaden: () => void;
}) {
  return (
    <span className="abrufstand">
      {laedt ? 'wird geladen …' : geladenUm ? `Stand ${UHRZEIT.format(geladenUm)}` : '—'}
      <button
        type="button"
        className="knopf klein"
        onClick={neuLaden}
        disabled={laedt}
        aria-label="Aus der ePA neu laden"
      >
        ↻ aktualisieren
      </button>
    </span>
  );
}
