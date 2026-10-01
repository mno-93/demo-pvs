import {
  deutschesDatum,
  verordnungsdatensatzBauen,
  type Rezept,
  type Ressource,
} from '@demo-pvs/kern';
import { ausfuehren, lesen } from '../../speicher/speicher.js';
import { vorgaenge } from '../../speicher/vorgaenge.js';
import {
  EINRICHTUNG,
  EpaFehler,
  erezeptAktivieren,
  erezeptErstellen,
  erezeptLoeschen,
  type Medikationsliste,
} from '../../epa/klient.js';

/**
 * E-Rezept aus Sicht des Praxissystems (ADR 0024).
 *
 * Senden heißt: Rezept-ID holen (`Task/$create`), Verordnungsdatensatz bilden, signieren,
 * aktivieren (`Task/$activate`). ⚠ Die qualifizierte Signatur mit dem eHBA bildet die Demo nur
 * als Schritt ab. Der Fachdienst stellt die Verschreibung danach selbst in die ePA — die Praxis
 * schreibt dafür nichts in die Akte.
 */

/** Signiert und sendet ein vorbereitetes Rezept. Nur mit ärztlicher Rolle. */
export async function rezeptSenden(rezept: Rezept): Promise<void> {
  const z = lesen();
  const patient = z.patienten.find((p) => p.id === rezept.patientId);
  if (!patient) throw new EpaFehler(0, 'Die Person gibt es nicht.');
  if (z.nutzer.rolle !== 'aerztin') {
    throw new EpaFehler(0, 'Signieren kann nur eine Ärztin oder ein Arzt.');
  }
  const aufgabe = await erezeptErstellen('160');
  const datensatz = verordnungsdatensatzBauen(rezept, {
    kvnr: patient.versicherung.kvnr,
    vorname: patient.vorname,
    nachname: patient.nachname,
    geburtsdatum: patient.geburtsdatum,
    kostentraeger: patient.versicherung.kostentraeger,
    kostentraegerkennung: patient.versicherung.kostentraegerkennung,
    arzt: { name: z.nutzer.name, lanr: z.nutzer.lanr ?? '' },
    praxis: { name: EINRICHTUNG.anzeige, telematikId: EINRICHTUNG.telematikId },
    rezeptId: aufgabe.rezeptId,
    authoredOn: z.heute,
  });
  await erezeptAktivieren(aufgabe, datensatz);
  ausfuehren(vorgaenge.rezeptGesendet(rezept.id, aufgabe.rezeptId, aufgabe.accessCode));
}

/** Löscht ein gesendetes, noch nicht eingelöstes Rezept im Fachdienst. */
export async function rezeptLoeschen(rezept: Rezept): Promise<void> {
  if (!rezept.rezeptId || !rezept.accessCode) return;
  await erezeptLoeschen(rezept.rezeptId, rezept.accessCode);
  ausfuehren(vorgaenge.rezeptGeloescht(rezept.id));
}

/** Was die ePA über ein gesendetes Rezept verrät. */
export interface RezeptInEpa {
  art: 'ausstehend' | 'in-liste' | 'eingeloest' | 'nicht-sichtbar' | 'geloescht' | 'vorbereitet';
  text: string;
  /** Abgegebene Arzneimittel, wenn eingelöst. */
  abgaben: string[];
}

function mittelText(r: Ressource | undefined): string {
  return String((r?.['code'] as { text?: string } | undefined)?.text ?? '');
}

/**
 * Ordnet einem Rezept seinen Stand in der Medikationsliste zu — über die Prozesskennung
 * (`RxPrescriptionProcessIdentifier` = Rezept-ID und Ausstellungsdatum).
 */
export function rezeptInEpa(
  rezept: Rezept,
  liste: Medikationsliste | null,
  gesperrt: boolean,
): RezeptInEpa {
  if (rezept.status === 'vorbereitet')
    return { art: 'vorbereitet', text: 'nicht gesendet', abgaben: [] };
  if (rezept.status === 'geloescht') return { art: 'geloescht', text: 'gelöscht', abgaben: [] };
  if (gesperrt || !liste) {
    return { art: 'nicht-sichtbar', text: 'in der ePA für die Praxis nicht sichtbar', abgaben: [] };
  }
  const praefix = `${rezept.rezeptId}_`;
  const traegt = (r: Ressource) =>
    ((r['identifier'] as { value?: string }[] | undefined) ?? []).some((i) =>
      String(i.value ?? '').startsWith(praefix),
    );
  const aussage = liste.eintraege.find(traegt);
  if (!aussage)
    return { art: 'ausstehend', text: 'Übertragung in die ePA ausstehend', abgaben: [] };
  const abgaben = ((aussage['derivedFrom'] as { reference?: string }[] | undefined) ?? [])
    .map((d) => String(d.reference ?? '').split('/'))
    .filter(([typ]) => typ === 'MedicationDispense')
    .map(([, id]) =>
      liste.einschluesse.find((r) => r.resourceType === 'MedicationDispense' && r.id === id),
    )
    .filter((r): r is Ressource => !!r);
  if (abgaben.length === 0)
    return { art: 'in-liste', text: 'in der Medikationsliste', abgaben: [] };
  const mittel = abgaben.map((a) =>
    mittelText(
      liste.einschluesse.find(
        (r) =>
          r.resourceType === 'Medication' &&
          `Medication/${String(r.id)}` ===
            (a['medicationReference'] as { reference?: string })?.reference,
      ),
    ),
  );
  return {
    art: 'eingeloest',
    text: `eingelöst am ${deutschesDatum(String(abgaben[0]!['whenHandedOver'] ?? '').slice(0, 10))}`,
    abgaben: mittel,
  };
}
