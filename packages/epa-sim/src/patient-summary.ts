import type { SimAnwendung } from './schnittstelle.ts';
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
  alsOrtszeit,
  ohneZeitzone,
  vollUrl,
  type PsAbschnittSchluessel,
  type PsQuelle,
  type Ressource,
  neueId,
  WEG,
} from '@demo-pvs/kern';
import { bestandFuer, type Dokument } from './bestand.ts';
import { abStufe, betriebslage } from './betrieb.ts';
import { istChronologie, type Chronologieart } from './chronologie.ts';
import { KEINE_BEKANNTE_ALLERGIE, LISTE } from './diagnosedienst.ts';
import { jetzt } from './fhir-hilfen.ts';
import { EMP, MSG, istEmpEintrag, melden, operationsparameterAbweisen } from './medikation.ts';
import { zeitZurKennung } from './patient-summary-ereignisse.ts';
import { eintragsUuid, sichtbar } from './mhd.ts';
import { uuidAus } from './plattform.ts';
import { archivierteKennungen, fassung, fassungen, patientFuer } from './schreibwege.ts';

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
 *
 * ✦ Frühere Stände (`_at`): Die Patient Summary bleibt eine Sicht und wird nicht gespeichert. Ein
 * früherer Stand entsteht aus dem, was die Quellen damals führten — die Listen und der eMP über
 * den Chronologieeintrag, der zum Zeitpunkt galt, mit den Einträgen in ihrer damaligen Fassung
 * (wie `$medication-plan` zu einem Chronologieeintrag, IG-MED04510JHX); Dokumente, die bis dahin
 * eingestellt waren. Die Demo-Steuerung (Quellen, Ausbaustand) und Widersprüche gelten wie beim
 * Abruf: Zugriffsregeln wirken auf den Zeitpunkt des Lesens, nicht auf den gelesenen Stand.
 */

export const PATIENT_SUMMARY_BASIS = WEG.patientSummary;

/** Kennung eines Stands aus dem Verlauf (UUID, wie `provenance` an `$medication-plan`). */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Zeitpunkt mit Uhrzeit und Zeitzone (FHIR `instant`, Sekundenbruchteile erlaubt). */
const ZEITPUNKT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

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

/**
 * Stand, zu dem die Patient Summary gebildet wird (✦ `_at`), als deutsche Ortszeit ohne Zone wie
 * im Bestand (`kern/uhr.ts`); `null` heißt jetzt.
 */
export type Stand = string | null;

/** Lag der Zeitpunkt bis zum Stand? Ohne Stand immer; verglichen ohne Zone, wie `imZeitraum`. */
function bis(zeit: unknown, stand: Stand): boolean {
  return stand === null || ohneZeitzone(String(zeit ?? '')) <= stand;
}

/** Der Chronologieeintrag einer Quelle, der zum Stand galt — der jüngste bis dahin. */
function chronologieZum(
  ablage: readonly Ressource[],
  art: Chronologieart,
  stand: string,
): Ressource | undefined {
  return ablage.filter((r) => istChronologie(r, art) && bis(r['recorded'], stand)).pop();
}

/**
 * Einträge einer geführten Quelle zum Stand: jetzt die, die `jetzt` auswählt; früher die des
 * damals geltenden Chronologieeintrags in ihrer damaligen Fassung.
 */
function gefuehrteEintraege(
  ablage: Ressource[],
  art: Chronologieart,
  stand: Stand,
  jetzt: (r: Ressource) => boolean,
): Ressource[] {
  if (stand === null) return ablage.filter(jetzt);
  const chronologie = chronologieZum(ablage, art, stand);
  return (
    ((chronologie?.['target'] as { reference?: string }[] | undefined) ?? [])
      .map((z) => String(z.reference ?? '').split('/'))
      // Gilt die Fassung noch, ist die heutige Instanz maßgeblich; sonst die gesicherte Fassung.
      .map(([typ, id, , v]) =>
        typ && id && v
          ? (ablage.find(
              (r) =>
                r.resourceType === typ && r.id === id && String(r.meta?.versionId ?? '1') === v,
            ) ?? fassung(ablage, typ, id, v))
          : undefined,
      )
      .filter((r): r is Ressource => !!r && jetzt(r))
  );
}

/** War die Instanz zum Stand gelöscht? Ein Änderungseintrag DELETE bis dahin sagt es. */
function geloeschtZum(
  ablage: readonly Ressource[],
  typ: string,
  id: string,
  stand: string,
): boolean {
  return ablage.some(
    (p) =>
      p.resourceType === 'Provenance' &&
      code(p, 'activity') === 'DELETE' &&
      bis(p['recorded'], stand) &&
      (p['target'] as { reference?: string }[] | undefined)?.some((z) =>
        String(z.reference ?? '').startsWith(`${typ}/${id}/`),
      ),
  );
}

/** Eine Instanz zum Stand: die jüngste Fassung bis dahin — keine, wenn sie gelöscht war. */
function zumStand(
  ablage: Ressource[],
  typ: string,
  id: string,
  stand: Stand,
): Ressource | undefined {
  const aktuell = ablage.find((r) => r.resourceType === typ && r.id === id);
  if (stand === null) return aktuell;
  if (geloeschtZum(ablage, typ, id, stand)) return undefined;
  return [...fassungen(ablage, typ, id), ...(aktuell ? [aktuell] : [])]
    .filter((f) => bis(f.meta?.lastUpdated, stand))
    .pop();
}

/** Alle Instanzen eines Typs zum Stand — auch solche, die es heute nicht mehr gibt. */
function alleZumStand(ablage: Ressource[], typ: string, stand: Stand): Ressource[] {
  if (stand === null) return ablage.filter((r) => r.resourceType === typ);
  const kennungen = new Set([
    ...ablage.filter((r) => r.resourceType === typ).map((r) => String(r.id)),
    ...archivierteKennungen(ablage, typ),
  ]);
  return [...kennungen]
    .map((id) => zumStand(ablage, typ, id, stand))
    .filter((r): r is Ressource => !!r);
}

/** Dokumente, die zum Stand sichtbar und eingestellt waren. */
function dokumenteZum(kvnr: string, stand: Stand): Dokument[] {
  return bestandFuer(kvnr).dokumente.filter(
    (d) => sichtbar(d) && d.inhalt && bis(d.eingestellt ?? d.erstellt, stand),
  );
}

const TELEMATIK_ID = 'https://gematik.de/fhir/sid/telematik-id';

/**
 * ✦ Herkunft eines Eintrags, den der Dienst aus einem Dokument übernimmt: Provenance mit dem
 * Dokument als Quelle, der einstellenden Einrichtung als Urheberin und dem Dienst, der die
 * Übersicht zusammenstellt. Kein EPAActivityProvenance — den Eintrag hat niemand in einem Dienst
 * geschrieben.
 */
function herkunftAusDokument(eintrag: Ressource, d: Dokument): Ressource {
  return {
    resourceType: 'Provenance',
    id: `herkunft-${String(eintrag.id)}`,
    target: [{ reference: `${eintrag.resourceType}/${String(eintrag.id)}` }],
    occurredDateTime: d.erstellt,
    recorded: d.eingestellt ?? d.erstellt,
    activity: {
      coding: [
        { system: 'http://terminology.hl7.org/CodeSystem/v3-DataOperation', code: 'CREATE' },
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
          ...(d.einrichtungTelematikId
            ? { identifier: { system: TELEMATIK_ID, value: d.einrichtungTelematikId } }
            : {}),
          display: d.einrichtung,
        },
      },
      {
        type: {
          coding: [
            {
              system: 'http://terminology.hl7.org/CodeSystem/provenance-participant-type',
              code: 'assembler',
            },
          ],
        },
        who: { reference: 'Device/ps-dienst', display: 'Patient-Summary-Dienst der ePA' },
      },
    ],
    entity: [
      {
        role: 'source',
        what: {
          reference: `DocumentReference/${eintragsUuid(d)}`,
          display: `${d.titel}, ${d.einrichtung}`,
        },
      },
    ],
  };
}

function aenderungen(
  ablage: readonly Ressource[],
  ziele: readonly Ressource[],
  stand: Stand = null,
): Ressource[] {
  const praefixe = ziele.map((z) => `${z.resourceType}/${String(z.id)}/`);
  return ablage.filter(
    (r) =>
      r.resourceType === 'Provenance' &&
      bis(r['recorded'], stand) &&
      !istChronologie(r, LISTE.Condition) &&
      !istChronologie(r, LISTE.AllergyIntolerance) &&
      !istChronologie(r, EMP) &&
      (r['target'] as { reference: string }[]).some((t) =>
        praefixe.some((p) => t.reference.startsWith(p)),
      ),
  );
}

export interface Teil {
  quelle: PsQuelle;
  eintraege: Ressource[];
  dazu: Ressource[];
  /** Gültige Einträge der Quelle, die nicht als relevant markiert sind. */
  weitere?: number;
  /** Leer, weil die Angabe zurückgehalten wird — etwa nach Widerspruch (`withheld`). */
  zurueckgehalten?: boolean;
}

/*
 * Ohne geführte Listen („nur automatische Daten") entsteht jeder Abschnitt aus dem, was in der
 * Akte strukturiert vorliegt — wie eine on-the-fly gebildete Patient Summary. Allergien,
 * Diagnosen und Impfungen kommen dann aus strukturierten Dokumenten: ungeprüft, ohne
 * Relevanzauswahl, mit dem Stand des Dokuments (ADR 0031).
 */

function allergien(kvnr: string, mitListen: boolean, stand: Stand): Teil {
  if (!mitListen) {
    return ausDokumenten(
      kvnr,
      'AllergyIntolerance',
      (r) => String(r['onsetDateTime'] ?? ''),
      stand,
    );
  }
  const ablage = bestandFuer(kvnr).diagnosedienst;
  const alle = gefuehrteEintraege(
    ablage,
    LISTE.AllergyIntolerance,
    stand,
    (r) => r.resourceType === 'AllergyIntolerance',
  ).filter(gueltig);
  const echte = alle.filter((r) => !istKeineBekannte(r));
  const markiert = echte.filter(istPsRelevant);
  // „Keine bekannte Allergie" ist eine Aussage über die ganze Liste — sie gilt nur, solange
  // keine gültige Allergie dagegen steht, und braucht keine Markierung.
  const eintraege = echte.length > 0 ? markiert : alle.filter(istKeineBekannte);
  return {
    quelle: 'allergy-list',
    eintraege,
    dazu: aenderungen(ablage, eintraege, stand),
    weitere: echte.length - markiert.length,
  };
}

function diagnosen(kvnr: string, mitListen: boolean, stand: Stand): Teil {
  if (!mitListen) {
    return ausDokumenten(
      kvnr,
      'Condition',
      (r) => String(r['onsetDateTime'] ?? r['recordedDate'] ?? ''),
      stand,
    );
  }
  const ablage = bestandFuer(kvnr).diagnosedienst;
  const alle = gefuehrteEintraege(
    ablage,
    LISTE.Condition,
    stand,
    (r) => r.resourceType === 'Condition',
  ).filter(gueltig);
  const eintraege = alle.filter(istPsRelevant);
  return {
    quelle: 'condition-list',
    eintraege,
    dazu: aenderungen(ablage, eintraege, stand),
    weitere: alle.length - eintraege.length,
  };
}

function medikation(kvnr: string, mitListen: boolean, stand: Stand): Teil {
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
    // Das Arzneimittel in der Fassung zum Stand; ohne gesicherte Fassung das heutige.
    return (
      zumStand(ablage, 'Medication', String(id), stand) ??
      ablage.find((m) => m.resourceType === 'Medication' && m.id === id)
    );
  };
  const plan = mitListen
    ? gefuehrteEintraege(ablage, EMP, stand, (r) => EMP.gueltig(r) && istEmpEintrag(r))
    : [];
  const eintraege =
    plan.length > 0
      ? plan
      : // Ohne Plan: die Medikationsliste, wie sie automatisch entsteht — alles, was nicht
        // beendet oder berichtigt ist (Einträge aus Verordnungen tragen den Status `unknown`).
        alleZumStand(ablage, 'MedicationStatement', stand).filter(
          (r) =>
            !['entered-in-error', 'stopped', 'completed', 'not-taken'].includes(
              String(r['status']),
            ),
        );
  const mittelListe = eintraege.map(mittel).filter((m): m is Ressource => !!m);
  return {
    quelle: plan.length > 0 ? 'medication-plan' : 'medication-list',
    eintraege,
    dazu: [...new Set(mittelListe), ...aenderungen(ablage, eintraege, stand)],
  };
}

/**
 * Je Untersuchung der jüngste Wert aus den sichtbaren strukturierten Laborbefunden.
 *
 * Im Befund ist der Wert eine Einzeluntersuchung nach dgLP; in der Patient Summary steht er als
 * Ergebnis nach EU Core (`medicalTestResult-eu-core`, wie ihn der Ergebnisabschnitt der EPS
 * verlangt) — mit dem Labor als Durchführendem, das deshalb mit ins Dokument kommt. Probe,
 * Gruppe und Freigabe bleiben im Befund; der Verweis auf das Quelldokument führt dorthin.
 */
function laborwerte(kvnr: string, stand: Stand): Teil {
  const juengste = new Map<string, Ressource>();
  const herkunft = new Map<string, Dokument>();
  const labore = new Map<string, Ressource>();
  for (const d of dokumenteZum(kvnr, stand)) {
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
      const laborVerweis = (o['performer'] as { reference?: string }[] | undefined)?.[0]?.reference;
      const labor = eintraege.find((r) => `${r.resourceType}/${String(r.id)}` === laborVerweis);
      const laborId = labor ? `${String(labor.id)}-${d.id}` : null;
      if (labor && laborId) labore.set(laborId, { ...labor, id: laborId });
      const ohneBefundbezug = Object.fromEntries(
        Object.entries(o).filter(([k]) => k !== 'specimen' && k !== 'performer'),
      ) as Ressource;
      herkunft.set(loinc, d);
      juengste.set(loinc, {
        ...ohneBefundbezug,
        id: `${String(o.id)}-${d.id}`,
        meta: { profile: [EPS.ergebnis] },
        ...(laborId ? { performer: [{ reference: `Organization/${laborId}` }] } : {}),
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
  const werte = [...juengste.values()];
  // Nur die Labore, deren Werte in der Übersicht stehen.
  const genutzt = new Set(
    werte.map((w) => (w['performer'] as { reference: string }[] | undefined)?.[0]?.reference),
  );
  return {
    quelle: 'lab-documents',
    eintraege: werte,
    dazu: [
      ...[...labore.values()].filter((l) => genutzt.has(`Organization/${String(l.id)}`)),
      ...[...juengste].map(([loinc, w]) => herkunftAusDokument(w, herkunft.get(loinc)!)),
    ],
  };
}

/** ✦ Impfungen aus der Impfliste — jede erfolgte Impfung, die jüngste zuerst (ab Stufe 2). */
function impfungen(kvnr: string, mitListen: boolean, stand: Stand): Teil {
  if (!mitListen) {
    return ausDokumenten(kvnr, 'Immunization', (r) => String(r['occurrenceDateTime'] ?? ''), stand);
  }
  if (!abStufe(3)) return { quelle: 'none', eintraege: [], dazu: [] };
  const ablage = bestandFuer(kvnr).diagnosedienst;
  const eintraege = gefuehrteEintraege(
    ablage,
    LISTE.Immunization,
    stand,
    (r) => r.resourceType === 'Immunization' && r['status'] === 'completed',
  ).sort((a, b) =>
    String(b['occurrenceDateTime'] ?? '').localeCompare(String(a['occurrenceDateTime'] ?? '')),
  );
  return { quelle: 'immunization-list', eintraege, dazu: aenderungen(ablage, eintraege, stand) };
}

/**
 * Einträge eines Typs aus den sichtbaren strukturierten Dokumenten — automatisch, wie die
 * Laborwerte. Für Prozeduren und Implantate immer, für Allergien, Diagnosen und Impfungen nur
 * ohne geführte Listen. Jeder Eintrag trägt einen Verweis auf sein Quelldokument; derselbe Eintrag aus zwei
 * Dokumenten (gleicher Code, gleiches Datum) erscheint einmal. Unstrukturierte Dokumente (PDF,
 * eArztbrief ohne Einträge) tragen nichts bei.
 */
function ausDokumenten(
  kvnr: string,
  typ: 'Procedure' | 'DeviceUseStatement' | 'Condition' | 'AllergyIntolerance' | 'Immunization',
  datum: (r: Ressource) => string,
  stand: Stand,
): Teil {
  const gesehen = new Set<string>();
  const eintraege: Ressource[] = [];
  const dazu: Ressource[] = [];
  const dokumente = dokumenteZum(kvnr, stand).sort((a, b) => b.erstellt.localeCompare(a.erstellt));
  for (const d of dokumente) {
    const ressourcen = ((d.inhalt as { entry?: { resource: Ressource }[] }).entry ?? []).map(
      (e) => e.resource,
    );
    // Widerlegte und irrtümliche Einträge fallen weg, behobene Diagnosen und inaktive Allergien
    // ebenso — alles Weitere übernimmt der Dienst so, wie das Dokument es angibt.
    const aktuell = (x: Ressource) =>
      gueltig(x) &&
      !['resolved', 'inactive', 'remission'].includes(code(x, 'clinicalStatus')) &&
      x['status'] !== 'entered-in-error' &&
      x['status'] !== 'not-done';
    for (const r of ressourcen.filter((x) => x.resourceType === typ && aktuell(x))) {
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
      dazu.push(herkunftAusDokument(eintraege[eintraege.length - 1]!, d));
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

export function bezeichnung(r: Ressource, alle: readonly Ressource[]): string {
  const konzept = (r['code'] ?? r['vaccineCode'] ?? r['medicationCodeableConcept']) as
    { text?: string; coding?: { display?: string }[] } | undefined;
  if (konzept) return konzept.text ?? konzept.coding?.[0]?.display ?? r.resourceType;
  // Ein Implantat heißt wie sein Gerät.
  const geraet = alle.find(
    (x) =>
      x.resourceType === 'Device' &&
      `Device/${String(x.id)}` === (r['device'] as { reference?: string } | undefined)?.reference,
  );
  if (geraet) {
    const typ = geraet['type'] as { text?: string; coding?: { display?: string }[] } | undefined;
    return typ?.text ?? typ?.coding?.[0]?.display ?? 'Implantat';
  }
  const id = String(
    (r['medicationReference'] as { reference?: string } | undefined)?.reference ?? '',
  ).split('/')[1];
  const m = alle.find((x) => x.resourceType === 'Medication' && x.id === id);
  return (m?.['code'] as { text?: string } | undefined)?.text ?? r.resourceType;
}

/** Die Abschnitte der Patient Summary zum Stand — auch für den Änderungsverlauf. */
export function teileBilden(
  kvnr: string,
  stand: Stand = null,
): Record<PsAbschnittSchluessel, Teil> {
  const mitListen = betriebslage.patientSummaryQuellen === 'listen';
  return {
    allergien: allergien(kvnr, mitListen, stand),
    diagnosen: diagnosen(kvnr, mitListen, stand),
    medikation: medikation(kvnr, mitListen, stand),
    laborwerte: laborwerte(kvnr, stand),
    impfungen: impfungen(kvnr, mitListen, stand),
    prozeduren: ausDokumenten(
      kvnr,
      'Procedure',
      (r) => String(r['performedDateTime'] ?? ''),
      stand,
    ),
    implantate: ausDokumenten(
      kvnr,
      'DeviceUseStatement',
      (r) => String(r['timingDateTime'] ?? ''),
      stand,
    ),
    erklaerungen: ohneQuelle(),
  };
}

/**
 * Die Patient Summary — jetzt oder ✦ zu einem früheren Stand. `Composition.date` ist der Stand,
 * den sie zeigt; `Bundle.timestamp` der Zeitpunkt, zu dem der Dienst sie gebildet hat.
 */
export function patientSummaryBilden(kvnr: string, stand: Stand = null): Ressource {
  const teile = teileBilden(kvnr, stand);
  const patient = { ...patientFuer(kvnr), meta: { profile: [EPS.patient] } };
  const alle = Object.values(teile).flatMap((t) => [...t.eintraege, ...t.dazu]);
  const zeit = jetzt();
  const kennung = neueId('ps');
  const komposition: Ressource = {
    resourceType: 'Composition',
    id: kennung,
    meta: { profile: [EPS.composition] },
    // composition-eu-eps: Kennung 1..1, als UUID.
    identifier: { system: 'urn:ietf:rfc:3986', value: `urn:uuid:${uuidAus(`ps:${kennung}`)}` },
    status: 'final',
    type: {
      coding: [{ system: CODESYSTEM.loinc, code: '60591-5', display: 'Patient summary Document' }],
    },
    subject: { reference: `Patient/${String(patient.id)}` },
    date: stand ?? zeit,
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
    // bdl-9: Kennung des Dokuments, als gültige UUID (die Ressourcen-IDs der Demo sind keine).
    identifier: { system: 'urn:ietf:rfc:3986', value: `urn:uuid:${uuidAus(`psb:${kennung}`)}` },
    type: 'document',
    timestamp: zeit,
    entry: ressourcen.map((r) => ({
      fullUrl: vollUrl(r),
      resource: r,
    })),
  };
}

export function patientSummaryEinhaengen(
  app: SimAnwendung,
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

  /*
   * ✦ Früherer Stand: `provenance` mit der Kennung eines Eintrags aus `$summary-log` — wie
   * `$medication-plan?provenance=…` — oder `_at` mit einem beliebigen Zeitpunkt (Datum, Uhrzeit,
   * Zeitzone, wie `_history?_at`). Ohne beide der Stand jetzt.
   */
  app.get(`${b}/Patient/$summary`, async (anfrage, antwort) => {
    if (operationsparameterAbweisen(anfrage, { _at: ZEITPUNKT, provenance: UUID }, antwort))
      return antwort;
    const q = anfrage.query as Record<string, string | undefined>;
    const kvnr = kvnrAus(anfrage);
    if (q['_at'] && q['provenance'])
      return melden(antwort, 400, 'invalid', 'Entweder _at oder provenance.', MSG.syntax);
    if (q['provenance']) {
      // Wie `$medication-plan?provenance=…`: der Stand zu einem Eintrag des Verlaufs.
      const zeit = zeitZurKennung(kvnr, q['provenance']);
      if (!zeit)
        return melden(antwort, 404, 'not-found', `Kein Stand ${q['provenance']}.`, MSG.unbekannt);
      return patientSummaryBilden(kvnr, zeit);
    }
    return patientSummaryBilden(kvnr, q['_at'] ? alsOrtszeit(q['_at']) : null);
  });
}
