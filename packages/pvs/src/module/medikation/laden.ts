import { useCallback, useEffect, useState } from 'react';
import type { Rezept } from '@demo-pvs/kern';
import { EpaFehler } from '../../epa/klient.js';
import {
  medikationslisteLesen,
  medikationsplanLesen,
  zwischenueberschriftenLesen,
  zwischenueberschriftenSetzen,
} from '../../epa/dienste/medikation.js';
import { useEinlesungen } from '../../epa/befugnis.js';
import { useBetriebsstand } from '../../epa/epa-bestand.js';
import { useLesezeichen } from '../../epa/lesezeichen.js';
import { eindeutigesAbgleichen, planzeilen } from './planabgleich.js';
import { rezeptInEpa } from './rezepte.js';
import { listenzeilen, seitAbfragen, type Medikationsstand, type SeitAbfrage } from './stand.js';

/**
 * Laden und Nachfragen der Medikation: Plan und Liste aus dem Medication Service, die Frage
 * „was ist neu seit …“, die Einstellung der Zwischenüberschriften und die Nachfragen nach
 * gesendeten E-Rezepten.
 */

/**
 * Plan und Liste der Akte, neu geladen nach jeder Handlung, Befugnis, Einlesung und Umstellung
 * der Betriebslage. Der Plan der Praxis übernimmt dabei, was eindeutig ist (ADR 0046); die
 * Abfrage „seit“ läuft gegen das Lesezeichen vom Öffnen der Ansicht.
 */
export function useMedikationsstand(patientId: string, kvnr: string, befugt: boolean) {
  const einlesungen = useEinlesungen();
  const betriebsstand = useBetriebsstand();
  const lesezeichen = useLesezeichen(patientId, 'medikation');
  const [zaehler, setzeZaehler] = useState(0);
  const neuLaden = useCallback(() => setzeZaehler((z) => z + 1), []);
  const [stand, setzeStand] = useState<Medikationsstand | null>(null);
  const [laedt, setzeLaedt] = useState(true);
  const [fehler, setzeFehler] = useState<EpaFehler | null>(null);
  const [seit, setzeSeit] = useState<SeitAbfrage | null>(null);

  useEffect(() => {
    let abgebrochen = false;
    if (!befugt) {
      setzeFehler(new EpaFehler(403, 'Keine Befugnis.', 'notEntitled'));
      setzeStand(null);
      setzeLaedt(false);
      return;
    }
    setzeLaedt(true);
    setzeFehler(null);
    Promise.all([medikationslisteLesen(kvnr), medikationsplanLesen(kvnr)])
      .then(([liste, plan]) => {
        if (abgebrochen) return;
        const zeilen = planzeilen(plan);
        // Der Plan der Praxis übernimmt, was eindeutig ist (ADR 0046).
        eindeutigesAbgleichen(patientId, plan);
        const listenZeilen = listenzeilen(liste, zeilen);
        setzeStand({ plan, zeilen, liste: listenZeilen, roh: liste });
        setzeLaedt(false);
        // Abfrage „seit" gegen das Lesezeichen vom Öffnen der Ansicht; danach das neue merken.
        const vorher = lesezeichen.vorher;
        if (vorher) {
          seitAbfragen(kvnr, vorher, zeilen, listenZeilen)
            .then((s) => {
              if (!abgebrochen) setzeSeit(s);
            })
            .catch(() => undefined);
        }
        lesezeichen.merken(plan.abgerufen || (liste.abgerufen ?? ''), plan.lesenachweis);
      })
      .catch((f: unknown) => {
        if (abgebrochen) return;
        setzeFehler(f instanceof EpaFehler ? f : new EpaFehler(0, 'Unbekannter Fehler'));
        setzeLaedt(false);
      });
    return () => {
      abgebrochen = true;
    };
  }, [kvnr, zaehler, patientId, befugt, einlesungen, betriebsstand]);

  return { stand, laedt, fehler, seit, neuLaden };
}

/**
 * Zwischenüberschriften des eMP (IG-MED09759K35-01, Render API): gelesen, sobald der eMP
 * erreichbar ist; umgeschaltet sofort in der Anzeige, bei einem Fehler zurück.
 */
export function useZwischenueberschriften(
  kvnr: string,
  mitEpa: boolean,
): [boolean, (wert: boolean) => void] {
  const [ueberschriften, setzeUeberschriften] = useState(true);
  useEffect(() => {
    if (!mitEpa) return;
    let gueltig = true;
    zwischenueberschriftenLesen(kvnr)
      .then((w) => gueltig && setzeUeberschriften(w))
      .catch(() => undefined);
    return () => {
      gueltig = false;
    };
  }, [kvnr, mitEpa]);
  function zwischenueberschriftenUmschalten(wert: boolean) {
    setzeUeberschriften(wert);
    void zwischenueberschriftenSetzen(kvnr, wert).then(setzeUeberschriften, () =>
      setzeUeberschriften(!wert),
    );
  }
  return [ueberschriften, zwischenueberschriftenUmschalten];
}

/**
 * Solange ein gesendetes Rezept noch nicht in der Medikationsliste steht, fragt das Modul
 * nach — der Fachdienst überträgt asynchron. Höchstens zwanzigmal je Rezept, dann bleibt es
 * beim Stand; ein später gesendetes Rezept bekommt seine eigenen Nachfragen (ADR 0057).
 */
export function useNachfragen(
  rezepte: readonly Rezept[],
  stand: Medikationsstand | null,
  gesperrt: boolean,
  laedt: boolean,
  neuLaden: () => void,
): void {
  const [nachfragen, setzeNachfragen] = useState<ReadonlyMap<string, number>>(new Map());
  const nachzufragen = rezepte
    .filter(
      (r) =>
        rezeptInEpa(r, stand?.roh ?? null, gesperrt).art === 'ausstehend' &&
        (nachfragen.get(r.id) ?? 0) < 20,
    )
    .map((r) => r.id);
  const nachzufragenSchluessel = nachzufragen.join('|');
  useEffect(() => {
    if (!nachzufragenSchluessel || laedt) return;
    const z = setTimeout(() => {
      setzeNachfragen((alt) => {
        const neu = new Map(alt);
        for (const id of nachzufragenSchluessel.split('|')) neu.set(id, (neu.get(id) ?? 0) + 1);
        return neu;
      });
      neuLaden();
    }, 1500);
    return () => clearTimeout(z);
  }, [nachzufragenSchluessel, laedt, nachfragen, neuLaden]);
}
