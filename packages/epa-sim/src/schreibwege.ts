import type { FastifyReply } from 'fastify';
import { base64ZuText } from './plattform.ts';
import type { Ressource } from '@demo-pvs/kern';
import { bestandFuer } from './bestand.ts';
import { EPA_DETAILS, TI_DETAILS, jetzt, neueId, operationOutcome } from './fhir-hilfen.ts';

/**
 * Gemeinsame Bausteine der schreibenden Wege der FHIR Data Services.
 *
 * Grundlage: Implementation Guide `de.gematik.epa` 1.3.2, „Generelle Prinzipien" —
 * Erkennung der Leistungserbringerinstitution über den Header `X-Requesting-Organization`
 * und Änderungseinträge nach `EPAActivityProvenance`. Der Medication Service
 * (`de.gematik.epa.medication` 1.3.5) nutzt beides; der vorgeschlagene Diagnose-Service
 * übernimmt es unverändert.
 */

export const TELEMATIK_ID = 'https://gematik.de/fhir/sid/telematik-id';
export const TI_ORGANIZATION = 'https://gematik.de/fhir/ti/StructureDefinition/ti-organization';
export const ACTIVITY_PROVENANCE =
  'https://gematik.de/fhir/epa/StructureDefinition/epa-activity-provenance';

/** Maximale Größe des Headers einschließlich Name, Doppelpunkt und Leerzeichen (8 KByte). */
const KOPF_GRENZE = 8 * 1024;

export interface Handelnde {
  telematikId: string;
  anzeige: string;
  /** Die übermittelte Organization, so wie sie der Dienst dedupliziert speichert. */
  organisation?: Ressource;
}

/**
 * Liest und prüft `X-Requesting-Organization`: Base64-kodierte FHIR-Organization nach
 * `TIOrganization`, deren Telematik-ID mit der Sitzung übereinstimmen muss.
 *
 * - zu groß → 431 `SVC_ORG_HEADER_TOO_LARGE`
 * - nicht lesbar oder nicht nach Profil → 422 `SVC_ORG_HEADER_PROFILE_MISMATCH`
 * - andere Telematik-ID als in der Sitzung → 403 `SVC_IDENTITY_MISMATCH`
 *
 * ⚠ Wie der Dienst auf einen fehlenden Header antwortet, legt der IG nicht fest; die Demo
 * behandelt ihn wie einen, der nicht dem Profil entspricht.
 */
export function organisationAusKopf(
  kopf: Record<string, unknown>,
  sitzung: string,
  antwort: FastifyReply,
): Handelnde | null {
  const roh = kopf['x-requesting-organization'];
  const wert = typeof roh === 'string' ? roh : '';
  if (`X-Requesting-Organization: ${wert}`.length > KOPF_GRENZE) {
    void antwort.code(431).send({ errorCode: 'SVC_ORG_HEADER_TOO_LARGE' });
    return null;
  }
  let org: Ressource | null = null;
  try {
    org = JSON.parse(base64ZuText(wert)) as Ressource;
  } catch {
    org = null;
  }
  const profil = ((org?.meta?.profile ?? []) as string[]).some((p) =>
    p.startsWith(TI_ORGANIZATION),
  );
  const kennung = (org?.['identifier'] as { system?: string; value?: string }[] | undefined)?.find(
    (i) => i.system === TELEMATIK_ID,
  )?.value;
  const name = org?.['name'];
  if (
    !org ||
    org.resourceType !== 'Organization' ||
    !profil ||
    !kennung ||
    typeof name !== 'string'
  ) {
    void antwort.code(422).send(
      operationOutcome(
        'error',
        'invalid',
        wert
          ? 'Die Organization im Header X-Requesting-Organization entspricht nicht dem Profil TIOrganization.'
          : 'Der Header X-Requesting-Organization fehlt.',
        {
          system: EPA_DETAILS,
          code: 'SVC_ORG_HEADER_PROFILE_MISMATCH',
          display: 'Profile mismatch in header Organization',
        },
      ),
    );
    return null;
  }
  if (kennung !== sitzung) {
    void antwort.code(403).send(
      operationOutcome(
        'error',
        'forbidden',
        'Die Telematik-ID im Header X-Requesting-Organization stimmt nicht mit der Sitzung überein.',
        {
          system: TI_DETAILS,
          code: 'SVC_IDENTITY_MISMATCH',
          display:
            'Identity mismatch: Access token or x-insurantid header does not match FHIR data (Telematik-ID / KVNR)',
        },
      ),
    );
    return null;
  }
  return { telematikId: kennung, anzeige: name, organisation: org };
}

/** Speichert die Organization dedupliziert — je Telematik-ID eine Instanz. */
export function organisationSpeichern(ablage: Ressource[], wer: Handelnde): string {
  const vorhanden = ablage.find(
    (r) =>
      r.resourceType === 'Organization' &&
      (r['identifier'] as { value?: string }[] | undefined)?.some(
        (i) => i.value === wer.telematikId,
      ),
  );
  if (vorhanden) return String(vorhanden.id);
  const org: Ressource = {
    ...(wer.organisation ?? {}),
    resourceType: 'Organization',
    id: neueId('org'),
    meta: { versionId: '1', lastUpdated: jetzt(), profile: [TI_ORGANIZATION] },
    identifier: [{ system: TELEMATIK_ID, value: wer.telematikId }],
    name: wer.anzeige,
  };
  ablage.push(org);
  return String(org.id);
}

/**
 * Änderungseintrag nach `EPAActivityProvenance`: versionierte Ziele, fachlicher und
 * technischer Zeitpunkt, Art der Änderung, verantwortliche Organisation mit Referenz,
 * Telematik-ID und Anzeigename.
 */
export function aktivitaetAnlegen(
  ablage: Ressource[],
  ziele: string[],
  wer: Handelnde,
  taetigkeit: 'CREATE' | 'UPDATE' | 'DELETE',
  zeitpunkt: string = jetzt(),
): Ressource {
  const orgId = organisationSpeichern(ablage, wer);
  const provenance: Ressource = {
    resourceType: 'Provenance',
    id: neueId('prov'),
    meta: { versionId: '1', lastUpdated: zeitpunkt, profile: [ACTIVITY_PROVENANCE] },
    target: ziele.map((z) => ({ reference: z })),
    occurredDateTime: zeitpunkt,
    recorded: zeitpunkt,
    activity: {
      coding: [
        { system: 'http://terminology.hl7.org/CodeSystem/v3-DataOperation', code: taetigkeit },
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
  ablage.push(provenance);
  fassungenSichern(ablage, ziele);
  return provenance;
}

/* ---------- Fassungen ---------- */

/**
 * Fassungsarchiv je Ablage: jede Fassung, auf die ein Änderungseintrag verweist, als Kopie. Der
 * Medication Service 1.4.0-ballot.1 setzt die Instanzhistorie voraus — für `_history` der Common
 * Query API, für den Stand zum Bezugszeitpunkt in `$medication-plan` (IG-MED04510JHX) und für die
 * Rücksetzlogik von `$unlink-emp` und `$cancel-eml-entry`.
 */
const ARCHIV = new WeakMap<Ressource[], Map<string, Ressource[]>>();

function archivVon(ablage: Ressource[]): Map<string, Ressource[]> {
  let a = ARCHIV.get(ablage);
  if (!a) {
    a = new Map();
    ARCHIV.set(ablage, a);
  }
  return a;
}

/** Sichert die Fassungen, auf die versionierte Verweise zeigen, sofern sie aktuell sind. */
export function fassungenSichern(ablage: Ressource[], verweise: readonly string[]): void {
  const archiv = archivVon(ablage);
  for (const v of verweise) {
    const [typ, id, , fassung] = v.split('/');
    const r = ablage.find((x) => x.resourceType === typ && x.id === id);
    if (!r || !fassung || String(r.meta?.versionId ?? '1') !== fassung) continue;
    const schluessel = `${String(typ)}/${String(id)}`;
    const liste = archiv.get(schluessel) ?? [];
    if (!liste.some((f) => f.meta?.versionId === fassung)) liste.push(structuredClone(r));
    archiv.set(schluessel, liste);
  }
}

/** Alle gesicherten Fassungen einer Instanz, älteste zuerst. */
export function fassungen(ablage: Ressource[], typ: string, id: string): Ressource[] {
  return [...(archivVon(ablage).get(`${typ}/${id}`) ?? [])].sort((x, y) => version(x) - version(y));
}

/** Eine bestimmte Fassung, sonst `undefined`. */
export function fassung(
  ablage: Ressource[],
  typ: string,
  id: string,
  versionId: string,
): Ressource | undefined {
  return fassungen(ablage, typ, id).find((f) => f.meta?.versionId === versionId);
}

/** Die Fassung, die zum Zeitpunkt galt — die jüngste mit `lastUpdated` bis dahin. */
export function fassungZum(
  ablage: Ressource[],
  typ: string,
  id: string,
  zeitpunkt: string,
): Ressource | undefined {
  return fassungen(ablage, typ, id)
    .filter((f) => String(f.meta?.lastUpdated ?? '') <= zeitpunkt)
    .pop();
}

/** Sicherung und Wiederherstellung des Archivs — für atomare Stapel (`$batch-emp`). */
export function archivSichern(ablage: Ressource[]): Map<string, Ressource[]> {
  return new Map([...archivVon(ablage)].map(([k, v]) => [k, [...v]]));
}
export function archivWiederherstellen(ablage: Ressource[], stand: Map<string, Ressource[]>): void {
  ARCHIV.set(ablage, stand);
}

export function version(r: Ressource): number {
  return Number(r.meta?.versionId ?? '1');
}

export function fortschreiben(r: Ressource, zeitpunkt: string = jetzt()): void {
  r.meta = { ...(r.meta ?? {}), versionId: String(version(r) + 1), lastUpdated: zeitpunkt };
}

export function versionierterVerweis(r: Ressource): string {
  return `${r.resourceType}/${String(r.id)}/_history/${version(r)}`;
}

export function patientFuer(kvnr: string): Ressource {
  const d = bestandFuer(kvnr).demographie;
  return {
    resourceType: 'Patient',
    id: `pat-${kvnr}`,
    meta: { profile: ['https://gematik.de/fhir/epa/StructureDefinition/epa-patient'] },
    identifier: [{ system: 'http://fhir.de/sid/gkv/kvid-10', value: kvnr }],
    // EPAPatient verlangt im Slice `Name` die Verwendung (`use` 1..1).
    ...(d
      ? {
          name: [{ use: 'official', family: d.nachname, given: [d.vorname] }],
          birthDate: d.geburtsdatum,
        }
      : {}),
  };
}

/** Verweis auf die Person über die KVNR, wie ihn die Profile verlangen (`subject.identifier` 1..1). */
export function subjektFuer(kvnr: string) {
  return {
    reference: `Patient/pat-${kvnr}`,
    identifier: { system: 'http://fhir.de/sid/gkv/kvid-10', value: kvnr },
  };
}

/** Wer eine Ressource angelegt hat — aus der Provenance mit der Tätigkeit CREATE. */
export function anlegende(ablage: readonly Ressource[], typ: string, id: string): Handelnde | null {
  const anlage = ablage.find(
    (r) =>
      r.resourceType === 'Provenance' &&
      (r['target'] as { reference: string }[]).some((t) =>
        t.reference.startsWith(`${typ}/${id}/`),
      ) &&
      (r['activity'] as { coding: { code: string }[] }).coding[0]?.code === 'CREATE',
  );
  const who = (
    anlage?.['agent'] as { who: { identifier: { value: string }; display: string } }[] | undefined
  )?.[0]?.who;
  return who ? { telematikId: who.identifier.value, anzeige: who.display } : null;
}

/* ---------- Löschen ---------- */

const GELOESCHT = new WeakMap<Ressource[], Set<string>>();

/**
 * Löscht eine Instanz aus der Ablage; ihre Fassungen bleiben im Archiv abrufbar (FHIR delete).
 * Ein späterer Zugriff erkennt sie als gelöscht (410 `MSG_DELETED`) statt als unbekannt (404).
 */
export function loeschen(ablage: Ressource[], r: Ressource): void {
  const i = ablage.indexOf(r);
  if (i >= 0) ablage.splice(i, 1);
  const s = GELOESCHT.get(ablage) ?? new Set<string>();
  s.add(`${r.resourceType}/${String(r.id)}`);
  GELOESCHT.set(ablage, s);
}

export function istGeloescht(ablage: Ressource[], typ: string, id: string): boolean {
  return GELOESCHT.get(ablage)?.has(`${typ}/${id}`) ?? false;
}
