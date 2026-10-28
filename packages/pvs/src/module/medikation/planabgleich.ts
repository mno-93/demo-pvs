import {
  CODESYSTEM,
  EMP_STATUS_CODE,
  automatischerAbgleich,
  chronikLesen,
  jetztAlsIsoOrtszeit,
  planAbgleichen,
  type EmpStatus,
  type Ressource,
  type SpiegelEintrag,
} from '@demo-pvs/kern';
import { ausfuehren, lesen } from '../../speicher/speicher.js';
import { vorgaenge, type PlanausEpa } from '../../speicher/vorgaenge.js';
import { medikationsplanLesen, type Medikationsplan } from '../../epa/klient.js';
import { codeVon, textVon } from '../../epa/epa-bestand.js';

/**
 * Abgleich des Medikationsplans der Praxis mit dem eMP (ADR 0046) — beim Einlesen der eGK und
 * bei jedem Laden der Medikation.
 *
 * Der Plan der Praxis ist der Primärbestand. Der Abgleich übernimmt ohne Handlung nur, was
 * eindeutig ist: neue eMP-Einträge und eMP-Änderungen an Einträgen, die die Praxis seit dem
 * letzten Abgleich nicht geändert hat (`automatischerAbgleich` im Kern). Was die Praxis geändert
 * hat, bleibt stehen, bis die Ärztin es überträgt oder verwirft.
 */

const ATC = CODESYSTEM.atc;
const PZN = 'http://fhir.de/CodeSystem/ifa/pzn';

const STATUS_AUS_CODE: Record<string, EmpStatus> = Object.fromEntries(
  Object.entries(EMP_STATUS_CODE).map(([k, v]) => [v, k as EmpStatus]),
);

/** Ein Eintrag des eMP mit allem, was die Handlungen brauchen. */
export interface Planzeile extends SpiegelEintrag {
  eintrag: Ressource;
  angelegtVon: string;
  zuletztVon: string;
  zuletztVonTelematikId: string | null;
  atcVersion: string;
  pzn: string | null;
}

export function referenz(r: Ressource, feld = 'medicationReference'): string {
  return (
    String((r[feld] as { reference?: string } | undefined)?.reference ?? '').split('/')[1] ?? ''
  );
}

export function planzeilen(plan: Medikationsplan): Planzeile[] {
  const provenance = plan.ressourcen.filter((r) => r.resourceType === 'Provenance');
  return plan.eintraege.map((e) => {
    const mittel = plan.ressourcen.find(
      (r) => r.resourceType === 'Medication' && r.id === referenz(e),
    );
    const chronik = chronikLesen(e, provenance);
    const atcKodierung = (
      mittel?.['code'] as { coding?: { system?: string; version?: string }[] } | undefined
    )?.coding?.find((k) => k.system === ATC);
    return {
      id: String(e.id),
      eintrag: e,
      bezeichnung: mittel ? textVon(mittel) : '(ohne Bezeichnung)',
      atc: (mittel && codeVon(mittel, 'code', ATC)) ?? '',
      atcVersion: atcKodierung?.version ?? '',
      pzn: (mittel && codeVon(mittel, 'code', PZN)) ?? null,
      dosierung: (e['dosageInstruction'] as { text?: string }[] | undefined)?.[0]?.text ?? '—',
      grund: (e['reasonCode'] as { text?: string }[] | undefined)?.[0]?.text ?? null,
      status: STATUS_AUS_CODE[String(e['status'])] ?? 'aktiv',
      verantwortlich: chronik.zuletztVon,
      fassung: e.meta?.versionId ?? '1',
      angelegtVon: chronik.angelegtVon,
      zuletztVon: chronik.zuletztVon,
      zuletztVonTelematikId: chronik.zuletztVonTelematikId,
      geaendertAm: chronik.zuletztAm,
    };
  });
}

/** Wendet den eindeutigen Teil des Abgleichs an und hält den Zeitpunkt fest. */
export function eindeutigesAbgleichen(patientId: string, plan: Medikationsplan): void {
  const zeilen = planzeilen(plan);
  const lokal = lesen().praxisplan.filter((e) => e.patientId === patientId);
  const { aufnehmen, uebernehmen } = automatischerAbgleich(planAbgleichen(lokal, zeilen));
  const neu: PlanausEpa[] = aufnehmen.map((e) => {
    const z = zeilen.find((x) => x.id === e.id)!;
    return {
      id: z.id,
      bezeichnung: z.bezeichnung,
      atc: z.atc,
      atcVersion: z.atcVersion,
      pzn: z.pzn,
      dosierung: z.dosierung,
      grund: z.grund,
      status: z.status,
      verantwortlich: z.verantwortlich,
      fassung: z.fassung,
      ...(z.geaendertAm ? { geaendertAm: z.geaendertAm } : {}),
    };
  });
  ausfuehren(
    vorgaenge.planAbgleichen(
      patientId,
      plan.lesenachweis ?? '',
      jetztAlsIsoOrtszeit(),
      neu,
      uebernehmen,
    ),
  );
}

/**
 * Abgleich beim Einlesen der eGK: den eMP lesen und das Eindeutige übernehmen. Antwortet die ePA
 * nicht — Widerspruch, Sperre, Störung —, bleibt der Plan der Praxis, wie er ist.
 */
export async function beimEinlesenAbgleichen(patientId: string): Promise<void> {
  const patient = lesen().patienten.find((p) => p.id === patientId);
  if (!patient) return;
  try {
    eindeutigesAbgleichen(patientId, await medikationsplanLesen(patient.versicherung.kvnr));
  } catch {
    // Nichts abgeglichen: Die Medikation zeigt beim Öffnen, warum.
  }
}
