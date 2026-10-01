import type { FastifyReply } from 'fastify';
import type { Ressource } from '@demo-pvs/kern';
import { betriebslage } from './betrieb.ts';
import { jetzt, neueId, operationOutcome, type Detailcode } from './fhir-hilfen.ts';
import {
  TELEMATIK_ID,
  organisationSpeichern,
  versionierterVerweis,
  type Handelnde,
} from './schreibwege.ts';

/**
 * Chronologie einer ärztlich geführten Liste — nach dem Muster des elektronischen
 * Medikationsplans (`de.gematik.epa.medication` 1.3.5).
 *
 * Jede Änderung erzeugt einen Chronologieeintrag (Provenance), der alle zu diesem Zeitpunkt
 * gültigen Einträge versioniert referenziert. Seine Kennung ist der Lesenachweis: Wer
 * schreibt, übergibt sie als `acknowledgedChronologyId`. Hat sich die Liste inzwischen
 * geändert, lehnt der Dienst mit 409 ab — so bemerkt ein Primärsystem die Änderung einer
 * anderen Einrichtung, statt sie zu überschreiben.
 */

export interface Chronologieart {
  /** Profil des Chronologieeintrags. */
  profil: string;
  /** Extension, die den Eintrag als Chronologie kennzeichnet. */
  kennzeichen: string;
  /** Gehört ein Eintrag zur aktuellen Liste? */
  gueltig: (r: Ressource) => boolean;
  /** Detailcode bei veraltetem Lesenachweis. */
  konflikt: Detailcode;
}

export function istChronologie(r: Ressource, art: Chronologieart): boolean {
  return (
    r.resourceType === 'Provenance' &&
    ((r.extension ?? []) as { url: string; valueBoolean?: boolean }[]).some(
      (e) => e.url === art.kennzeichen && e.valueBoolean === true,
    )
  );
}

export function chronologieVerlauf(ablage: readonly Ressource[], art: Chronologieart): Ressource[] {
  return ablage
    .filter((r) => istChronologie(r, art))
    .sort((a, b) => String(b['recorded']).localeCompare(String(a['recorded'])) || 0);
}

export function aktuelleChronologie(
  ablage: readonly Ressource[],
  art: Chronologieart,
): Ressource | null {
  // Die zuletzt angelegte zählt — bei gleichem Zeitpunkt entscheidet die Reihenfolge.
  const alle = ablage.filter((r) => istChronologie(r, art));
  return alle[alle.length - 1] ?? null;
}

export function chronologieAnlegen(
  ablage: Ressource[],
  art: Chronologieart,
  wer: Handelnde,
  zeitpunkt: string = jetzt(),
): Ressource {
  const orgId = organisationSpeichern(ablage, wer);
  const erste = !aktuelleChronologie(ablage, art);
  const eintrag: Ressource = {
    resourceType: 'Provenance',
    id: neueId('chron'),
    meta: { versionId: '1', lastUpdated: zeitpunkt, profile: [art.profil] },
    extension: [{ url: art.kennzeichen, valueBoolean: true }],
    target: ablage.filter(art.gueltig).map((r) => ({ reference: versionierterVerweis(r) })),
    occurredDateTime: zeitpunkt,
    recorded: zeitpunkt,
    activity: {
      coding: [
        {
          system: 'http://terminology.hl7.org/CodeSystem/v3-DataOperation',
          code: erste ? 'CREATE' : 'UPDATE',
        },
      ],
    },
    agent: [
      {
        type: {
          coding: [
            {
              system: 'http://terminology.hl7.org/CodeSystem/provenance-participant-type',
              code: 'author',
            },
          ],
        },
        who: {
          reference: `Organization/${orgId}`,
          identifier: { system: TELEMATIK_ID, value: wer.telematikId },
          display: wer.anzeige,
        },
      },
    ],
  };
  ablage.push(eintrag);
  return eintrag;
}

/** Eine andere Einrichtung, die in der Demo „zwischendurch" ändert. */
export const ANDERE_EINRICHTUNG: Handelnde = {
  telematikId: 'DEMO-KLINIKUM-SONNENSCHEIN',
  anzeige: 'Klinikum Sonnenschein',
};

/**
 * Prüft den Lesenachweis. Ist die Demo-Steuerung „Andere Einrichtung ändert zwischendurch"
 * gesetzt, entsteht vorher tatsächlich eine neue Fassung — der Konflikt ist dann echt.
 */
export function lesenachweisPruefen(
  ablage: Ressource[],
  art: Chronologieart,
  bestaetigt: string | undefined,
  antwort: FastifyReply,
): boolean {
  if (betriebslage.fremdeAenderungVorSchreibzugriff && aktuelleChronologie(ablage, art)) {
    betriebslage.fremdeAenderungVorSchreibzugriff = false;
    chronologieAnlegen(ablage, art, ANDERE_EINRICHTUNG);
  }
  const aktuell = aktuelleChronologie(ablage, art);
  if (aktuell && bestaetigt !== aktuell.id) {
    void antwort
      .code(409)
      .send(
        operationOutcome(
          'error',
          'conflict',
          `Der Lesenachweis ${bestaetigt ?? '(fehlt)'} ist nicht der aktuelle Stand ${String(aktuell.id)}. Die Liste neu abrufen und den Vorgang wiederholen.`,
          art.konflikt,
        ),
      );
    return false;
  }
  return true;
}
