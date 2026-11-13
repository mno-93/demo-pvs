import { ohneZeitzone, type Ressource } from '@demo-pvs/kern';
import { bestandFuer } from './bestand.ts';
import { istChronologie } from './chronologie.ts';
import { LISTE } from './diagnosedienst.ts';
import { EMP } from './medikation.ts';
import { eintragsUuid, sichtbar } from './mhd.ts';
import { uuidAus } from './plattform.ts';

/**
 * ✦ Zeitpunkte, an denen sich eine Quelle der Patient Summary änderte — Grundlage des
 * Änderungsverlaufs (`$summary-log`) und der Kennung eines Stands (`$summary?provenance=…`).
 * Eigenes Modul, damit Patient Summary und Verlauf es nutzen, ohne einander zu importieren.
 */

export interface Ereignis {
  zeit: string;
  wer: { display?: string; identifier?: { system?: string; value?: string } };
  quelle: { reference: string; display: string };
}

/** Alle Zeitpunkte, an denen sich eine Quelle der Patient Summary änderte. */
export function ereignisse(kvnr: string): Ereignis[] {
  const bestand = bestandFuer(kvnr);
  const wer = (p: Ressource) =>
    ((p['agent'] as { who?: Ereignis['wer'] }[] | undefined) ?? [])[0]?.who ?? {};
  const listen = bestand.diagnosedienst
    .filter((r) => Object.values(LISTE).some((art) => istChronologie(r, art)))
    .map((p) => ({
      zeit: String(p['recorded']),
      wer: wer(p),
      quelle: {
        reference: `Provenance/${String(p.id)}`,
        display: 'Chronologieeintrag einer Liste',
      },
    }));
  const medikation = bestand.medikation
    .filter((r) => r.resourceType === 'Provenance')
    .map((p) => ({
      zeit: String(p['recorded']),
      wer: wer(p),
      quelle: {
        reference: `Provenance/${String(p.id)}`,
        display: istChronologie(p, EMP)
          ? 'Chronologieeintrag des eMP'
          : 'Änderungseintrag des Medication Service',
      },
    }));
  const dokumente = bestand.dokumente
    .filter((d) => sichtbar(d) && d.inhalt)
    .map((d) => ({
      zeit: d.eingestellt ?? d.erstellt,
      wer: {
        display: d.einrichtung,
        ...(d.einrichtungTelematikId
          ? {
              identifier: {
                system: 'https://gematik.de/fhir/sid/telematik-id',
                value: d.einrichtungTelematikId,
              },
            }
          : {}),
      },
      quelle: {
        reference: `DocumentReference/${eintragsUuid(d)}`,
        display: `${d.titel}, ${d.einrichtung}`,
      },
    }));
  // Wie der Bestand: deutsche Ortszeit ohne Zone — als Zeichenkette vergleichbar.
  return [...listen, ...medikation, ...dokumente]
    .filter((e) => /^\d{4}-\d{2}-\d{2}/.test(e.zeit))
    .map((e) => ({ ...e, zeit: ohneZeitzone(e.zeit) }));
}

/**
 * Kennung des Stands zu einem Zeitpunkt — die `id` der Provenance im Verlauf, als UUID wie der
 * Parameter `provenance` von `$medication-plan`. Aus Akte und Zeitpunkt gebildet, damit sie
 * stabil bleibt, auch wenn der Verlauf wächst.
 */
export function verlaufskennung(kvnr: string, zeit: string): string {
  return uuidAus(`ps-log:${kvnr}:${zeit}`);
}

/** Der Zeitpunkt zu einer Kennung aus dem Verlauf, sonst `null`. */
export function zeitZurKennung(kvnr: string, kennung: string): string | null {
  return ereignisse(kvnr).find((e) => verlaufskennung(kvnr, e.zeit) === kennung)?.zeit ?? null;
}
