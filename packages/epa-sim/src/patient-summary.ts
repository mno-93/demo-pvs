import type { FastifyInstance } from 'fastify';
import {
  CODESYSTEM,
  EPS,
  LISTE_LEER,
  PS_ABSCHNITTE,
  PS_QUELLE_BEZEICHNUNG,
  PS_QUELLE_EXTENSION,
  PS_QUELLE_SYSTEM,
  PS_WEITERE_EXTENSION,
  istPsRelevant,
  type PsAbschnittSchluessel,
  type PsQuelle,
  type Ressource,
} from '@demo-pvs/kern';
import { bestandFuer } from './bestand.ts';
import { abStufe, betriebslage } from './betrieb.ts';
import { istChronologie } from './chronologie.ts';
import { KEINE_BEKANNTE_ALLERGIE, LISTE } from './diagnosedienst.ts';
import { jetzt, neueId } from './fhir-hilfen.ts';
import { EMP, istEmpEintrag } from './medikation.ts';
import { eintragsUuid, sichtbar } from './mhd.ts';
import { patientFuer } from './schreibwege.ts';

/**
 * ✦ VORSCHLAG — Patient Summary als Sicht der ePA. Nicht spezifiziert.
 *
 * Die Patient Summary wird bei jeder Abfrage aus den Diensten der ePA gebildet und nicht
 * gespeichert; sie wird nie selbst bearbeitet. Jede Section nennt ihre Quelle
 * (`ps-section-source`) — dort, im Diagnose-Service oder im Medication Service, wird sie
 * gepflegt. Abschnitte ohne Quelle tragen `emptyReason`.
 *
 * Operation nach dem Muster von `Patient/$summary` (HL7 IPS); Inhalt nach der European
 * Patient Summary (`hl7.fhir.eu.eps` 1.0.0-ballot): Bundle `document`, Composition mit
 * LOINC 60591-5, Sections mit Einträgen oder `emptyReason`.
 *
 * Quellen je Section:
 * - Allergien, Diagnosen: ✦ Allergienliste und Diagnosenliste — gültige Einträge, die als
 *   relevant markiert sind (`ps-relevant`); die übrigen zählt `ps-section-further-entries`;
 * - Medikation: eMP (aktiv, pausiert); ohne Plan die Medikationsliste (automatisch);
 * - Laborwerte: je Untersuchung der jüngste Wert aus strukturierten Laborbefunden;
 * - Impfungen, Prozeduren, Implantate, persönliche Erklärungen: keine Quelle — `emptyReason`
 *   `unavailable`.
 *
 * Demo-Steuerung `patientSummaryQuellen = automatisch` bildet den Stand ohne ärztlich
 * geführte Listen nach: nur Medikationsliste und Laborwerte.
 */

export const PATIENT_SUMMARY_BASIS = '/epa/vorschlag/patient-summary/api/v1/fhir';

const AUTOR = {
  resourceType: 'Device',
  id: 'ps-dienst',
  deviceName: [{ name: 'Patient-Summary-Dienst der ePA (Vorschlag)', type: 'user-friendly-name' }],
};

function code(r: Ressource, feld: string): string {
  return (r[feld] as { coding?: { code?: string }[] } | undefined)?.coding?.[0]?.code ?? '';
}

function gueltig(r: Ressource): boolean {
  const v = code(r, 'verificationStatus');
  return v !== 'refuted' && v !== 'entered-in-error';
}

function istKeineBekannte(r: Ressource): boolean {
  return (r['code'] as { coding?: { code?: string }[] } | undefined)?.coding?.some(
    (c) => c.code === KEINE_BEKANNTE_ALLERGIE,
  )
    ? true
    : false;
}

function aenderungen(ablage: readonly Ressource[], ziele: readonly Ressource[]): Ressource[] {
  const praefixe = ziele.map((z) => `${z.resourceType}/${String(z.id)}/`);
  return ablage.filter(
    (r) =>
      r.resourceType === 'Provenance' &&
      !istChronologie(r, LISTE.Condition) &&
      !istChronologie(r, LISTE.AllergyIntolerance) &&
      !istChronologie(r, EMP) &&
      (r['target'] as { reference: string }[]).some((t) =>
        praefixe.some((p) => t.reference.startsWith(p)),
      ),
  );
}

interface Teil {
  quelle: PsQuelle;
  eintraege: Ressource[];
  dazu: Ressource[];
  /** Gültige Einträge der Quelle, die nicht als relevant markiert sind. */
  weitere?: number;
  /** Leer, weil die Angabe zurückgehalten wird — etwa nach Widerspruch (`withheld`). */
  zurueckgehalten?: boolean;
}

function allergien(kvnr: string, mitListen: boolean): Teil {
  if (!mitListen) return { quelle: 'none', eintraege: [], dazu: [] };
  const ablage = bestandFuer(kvnr).diagnosedienst;
  const alle = ablage.filter((r) => r.resourceType === 'AllergyIntolerance' && gueltig(r));
  const echte = alle.filter((r) => !istKeineBekannte(r));
  const markiert = echte.filter(istPsRelevant);
  // „Keine bekannte Allergie" ist eine Aussage über die ganze Liste — sie gilt nur, solange
  // keine gültige Allergie dagegen steht, und braucht keine Markierung.
  const eintraege = echte.length > 0 ? markiert : alle.filter(istKeineBekannte);
  return {
    quelle: 'allergy-list',
    eintraege,
    dazu: aenderungen(ablage, eintraege),
    weitere: echte.length - markiert.length,
  };
}

function diagnosen(kvnr: string, mitListen: boolean): Teil {
  if (!mitListen) return { quelle: 'none', eintraege: [], dazu: [] };
  const ablage = bestandFuer(kvnr).diagnosedienst;
  const alle = ablage.filter((r) => r.resourceType === 'Condition' && gueltig(r));
  const eintraege = alle.filter(istPsRelevant);
  return {
    quelle: 'condition-list',
    eintraege,
    dazu: aenderungen(ablage, eintraege),
    weitere: alle.length - eintraege.length,
  };
}

function medikation(kvnr: string, mitListen: boolean): Teil {
  // Nach Widerspruch gegen den Medikationsprozess ist die Medikation für Einrichtungen
  // gesperrt; die Patient Summary darf sie nicht über einen Umweg zeigen.
  if (bestandFuer(kvnr).widersprueche.medication === 'deny') {
    return { quelle: 'none', eintraege: [], dazu: [], zurueckgehalten: true };
  }
  const ablage = bestandFuer(kvnr).medikation;
  const mittel = (r: Ressource) => {
    const id = String(
      (r['medicationReference'] as { reference?: string } | undefined)?.reference ?? '',
    ).split('/')[1];
    return ablage.find((m) => m.resourceType === 'Medication' && m.id === id);
  };
  const plan = mitListen ? ablage.filter((r) => EMP.gueltig(r) && istEmpEintrag(r)) : [];
  const eintraege =
    plan.length > 0
      ? plan
      : // Ohne Plan: die Medikationsliste, wie sie automatisch entsteht — alles, was nicht
        // beendet oder berichtigt ist (Einträge aus Verordnungen tragen den Status `unknown`).
        ablage.filter(
          (r) =>
            r.resourceType === 'MedicationStatement' &&
            !['entered-in-error', 'stopped', 'completed', 'not-taken'].includes(
              String(r['status']),
            ),
        );
  const mittelListe = eintraege.map(mittel).filter((m): m is Ressource => !!m);
  return {
    quelle: plan.length > 0 ? 'medication-plan' : 'medication-list',
    eintraege,
    dazu: [...new Set(mittelListe), ...aenderungen(ablage, eintraege)],
  };
}

/** Je Untersuchung der jüngste Wert aus den sichtbaren strukturierten Laborbefunden. */
function laborwerte(kvnr: string): Teil {
  const juengste = new Map<string, Ressource>();
  for (const d of bestandFuer(kvnr).dokumente.filter((x) => sichtbar(x) && x.inhalt)) {
    const eintraege = ((d.inhalt as { entry?: { resource: Ressource }[] }).entry ?? []).map(
      (e) => e.resource,
    );
    for (const o of eintraege.filter(
      (r) => r.resourceType === 'Observation' && r['valueQuantity'],
    )) {
      const loinc = (o['code'] as { coding?: { system?: string; code?: string }[] }).coding?.find(
        (c) => c.system === CODESYSTEM.loinc,
      )?.code;
      if (!loinc) continue;
      const zeit = String(o['effectiveDateTime'] ?? '');
      const bisher = juengste.get(loinc);
      if (bisher && String(bisher['effectiveDateTime'] ?? '') >= zeit) continue;
      juengste.set(loinc, {
        ...o,
        id: `${String(o.id)}-${d.id}`,
        extension: [
          ...(o.extension ?? []),
          {
            url: 'https://example.org/demo-pvs/fhir/StructureDefinition/source-document',
            valueReference: {
              reference: `DocumentReference/${eintragsUuid(d)}`,
              display: `${d.titel}, ${d.einrichtung}`,
            },
          },
        ],
      });
    }
  }
  return { quelle: 'lab-documents', eintraege: [...juengste.values()], dazu: [] };
}

/** ✦ Impfungen aus der Impfliste — jede erfolgte Impfung, die jüngste zuerst (ab Stufe 2). */
function impfungen(kvnr: string, mitListen: boolean): Teil {
  if (!mitListen || !abStufe(2)) return { quelle: 'none', eintraege: [], dazu: [] };
  const ablage = bestandFuer(kvnr).diagnosedienst;
  const eintraege = ablage
    .filter((r) => r.resourceType === 'Immunization' && r['status'] === 'completed')
    .sort((a, b) =>
      String(b['occurrenceDateTime'] ?? '').localeCompare(String(a['occurrenceDateTime'] ?? '')),
    );
  return { quelle: 'immunization-list', eintraege, dazu: aenderungen(ablage, eintraege) };
}

/**
 * Einträge eines Typs aus den sichtbaren strukturierten Dokumenten — automatisch, wie die
 * Laborwerte. Jeder Eintrag trägt einen Verweis auf sein Quelldokument; derselbe Eintrag aus zwei
 * Dokumenten (gleicher Code, gleiches Datum) erscheint einmal. Unstrukturierte Dokumente (PDF,
 * eArztbrief ohne Einträge) tragen nichts bei.
 */
function ausDokumenten(
  kvnr: string,
  typ: 'Procedure' | 'DeviceUseStatement',
  datum: (r: Ressource) => string,
): Teil {
  const gesehen = new Set<string>();
  const eintraege: Ressource[] = [];
  const dazu: Ressource[] = [];
  const dokumente = bestandFuer(kvnr)
    .dokumente.filter((x) => sichtbar(x) && x.inhalt)
    .sort((a, b) => b.erstellt.localeCompare(a.erstellt));
  for (const d of dokumente) {
    const ressourcen = ((d.inhalt as { entry?: { resource: Ressource }[] }).entry ?? []).map(
      (e) => e.resource,
    );
    for (const r of ressourcen.filter((x) => x.resourceType === typ)) {
      const geraet =
        typ === 'DeviceUseStatement'
          ? ressourcen.find(
              (x) =>
                x.resourceType === 'Device' &&
                `Device/${String(x.id)}` ===
                  (r['device'] as { reference?: string } | undefined)?.reference,
            )
          : undefined;
      const schluessel = `${JSON.stringify((geraet ?? r)['code'] ?? (geraet ?? r)['type'] ?? '')}|${datum(r)}`;
      if (gesehen.has(schluessel)) continue;
      gesehen.add(schluessel);
      const id = `${String(r.id)}-${d.id}`;
      const quelle = {
        url: 'https://example.org/demo-pvs/fhir/StructureDefinition/source-document',
        valueReference: {
          reference: `DocumentReference/${eintragsUuid(d)}`,
          display: `${d.titel}, ${d.einrichtung}`,
        },
      };
      if (geraet) {
        const geraetId = `${String(geraet.id)}-${d.id}`;
        dazu.push({ ...geraet, id: geraetId });
        eintraege.push({
          ...r,
          id,
          device: { reference: `Device/${geraetId}` },
          extension: [...(r.extension ?? []), quelle],
        });
      } else {
        eintraege.push({ ...r, id, extension: [...(r.extension ?? []), quelle] });
      }
    }
  }
  return {
    quelle: eintraege.length > 0 ? 'structured-documents' : 'none',
    eintraege,
    dazu,
  };
}

function ohneQuelle(): Teil {
  return { quelle: 'none', eintraege: [], dazu: [] };
}

function erzaehlung(titel: string, zeilen: string[]): { status: string; div: string } {
  const text = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return {
    status: 'generated',
    div: `<div xmlns="http://www.w3.org/1999/xhtml"><p><b>${text(titel)}</b></p>${
      zeilen.length > 0 ? `<ul>${zeilen.map((z) => `<li>${text(z)}</li>`).join('')}</ul>` : ''
    }</div>`,
  };
}

function bezeichnung(r: Ressource, alle: readonly Ressource[]): string {
  const konzept = (r['code'] ?? r['vaccineCode'] ?? r['medicationCodeableConcept']) as
    { text?: string; coding?: { display?: string }[] } | undefined;
  if (konzept) return konzept.text ?? konzept.coding?.[0]?.display ?? r.resourceType;
  const id = String(
    (r['medicationReference'] as { reference?: string } | undefined)?.reference ?? '',
  ).split('/')[1];
  const m = alle.find((x) => x.resourceType === 'Medication' && x.id === id);
  return (m?.['code'] as { text?: string } | undefined)?.text ?? r.resourceType;
}

export function patientSummaryBilden(kvnr: string): Ressource {
  const mitListen = betriebslage.patientSummaryQuellen === 'listen';
  const teile: Record<PsAbschnittSchluessel, Teil> = {
    allergien: allergien(kvnr, mitListen),
    diagnosen: diagnosen(kvnr, mitListen),
    medikation: medikation(kvnr, mitListen),
    laborwerte: laborwerte(kvnr),
    impfungen: impfungen(kvnr, mitListen),
    prozeduren: ausDokumenten(kvnr, 'Procedure', (r) => String(r['performedDateTime'] ?? '')),
    implantate: ausDokumenten(kvnr, 'DeviceUseStatement', (r) => String(r['timingDateTime'] ?? '')),
    erklaerungen: ohneQuelle(),
  };
  const patient = { ...patientFuer(kvnr), meta: { profile: [EPS.patient] } };
  const alle = Object.values(teile).flatMap((t) => [...t.eintraege, ...t.dazu]);
  const zeit = jetzt();
  const komposition: Ressource = {
    resourceType: 'Composition',
    id: neueId('ps'),
    meta: { profile: [EPS.composition] },
    status: 'final',
    type: {
      coding: [{ system: CODESYSTEM.loinc, code: '60591-5', display: 'Patient summary Document' }],
    },
    subject: { reference: `Patient/${String(patient.id)}` },
    date: zeit,
    author: [{ reference: 'Device/ps-dienst', display: 'Patient-Summary-Dienst der ePA' }],
    title: 'Patient Summary',
    section: PS_ABSCHNITTE.map((d) => {
      const t = teile[d.schluessel];
      return {
        extension: [
          {
            url: PS_QUELLE_EXTENSION,
            valueCoding: {
              system: PS_QUELLE_SYSTEM,
              code: t.quelle,
              display: PS_QUELLE_BEZEICHNUNG[t.quelle],
            },
          },
          ...(t.weitere ? [{ url: PS_WEITERE_EXTENSION, valueInteger: t.weitere }] : []),
        ],
        title: d.titel,
        code: { coding: [{ system: CODESYSTEM.loinc, code: d.loinc, display: d.loincAnzeige }] },
        text: erzaehlung(
          d.titel,
          t.eintraege.map((e) => bezeichnung(e, alle)),
        ),
        ...(t.eintraege.length > 0
          ? {
              entry: t.eintraege.map((e) => ({ reference: `${e.resourceType}/${String(e.id)}` })),
            }
          : {
              emptyReason: {
                coding: [
                  t.zurueckgehalten
                    ? { system: LISTE_LEER, code: 'withheld', display: 'Information Withheld' }
                    : { system: LISTE_LEER, code: 'unavailable', display: 'Unavailable' },
                ],
              },
            }),
      };
    }),
  };
  const ressourcen = [komposition, patient, AUTOR, ...new Set(alle)];
  return {
    resourceType: 'Bundle',
    id: neueId('psb'),
    meta: { profile: [EPS.bundle] },
    identifier: { system: 'urn:ietf:rfc:3986', value: `urn:uuid:${String(komposition.id)}` },
    type: 'document',
    timestamp: zeit,
    entry: ressourcen.map((r) => ({
      fullUrl: `urn:uuid:${String(r.id)}`,
      resource: r,
    })),
  };
}

export function patientSummaryEinhaengen(
  app: FastifyInstance,
  kvnrAus: (anfrage: { headers: Record<string, unknown> }) => string,
) {
  const b = PATIENT_SUMMARY_BASIS;
  app.get(`${b}/metadata`, async () => ({
    resourceType: 'CapabilityStatement',
    status: 'draft',
    kind: 'instance',
    fhirVersion: '4.0.1',
    format: ['application/fhir+json'],
    software: { name: 'ePA-Simulator — Patient Summary (Vorschlag, nicht spezifiziert)' },
    rest: [
      {
        mode: 'server',
        resource: [
          {
            type: 'Patient',
            operation: [
              {
                name: 'summary',
                definition: 'http://hl7.org/fhir/uv/ips/OperationDefinition/summary',
              },
            ],
          },
        ],
      },
    ],
  }));

  app.get(`${b}/Patient/$summary`, async (anfrage) => patientSummaryBilden(kvnrAus(anfrage)));
}
