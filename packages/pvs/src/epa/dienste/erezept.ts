import type { Ressource } from '@demo-pvs/kern';
import { ERP, GRUNDLAGE, base64, anfragen } from '../klient.js';

/**
 * E-Rezept-Fachdienst (gematik `api-erp`, ⚠ Demo-Ersatz): `Task/$create`, `$activate`, `$abort`
 * (ADR 0024). Er ist kein Teil der ePA; die Verschreibung erreicht die ePA über ihn.
 */

export interface ErpAufgabe {
  rezeptId: string;
  accessCode: string;
  status: string;
}

function aufgabeLesen(task: {
  id?: string;
  status?: string;
  identifier?: { system?: string; value?: string }[];
}): ErpAufgabe {
  return {
    rezeptId: String(task.id),
    accessCode:
      task.identifier?.find((i) => i.system?.endsWith('GEM_ERP_NS_AccessCode'))?.value ?? '',
    status: String(task.status ?? ''),
  };
}

/** `Task/$create` — Rezept-ID und AccessCode für ein neues E-Rezept (Flowtype 160, Muster 16). */
export async function erezeptErstellen(flowtype = '160'): Promise<ErpAufgabe> {
  const { inhalt } = await anfragen<Parameters<typeof aufgabeLesen>[0]>({
    methode: 'POST',
    pfad: `${ERP}/Task/$create`,
    koerper: {
      resourceType: 'Parameters',
      parameter: [
        {
          name: 'workflowType',
          valueCoding: {
            system: 'https://gematik.de/fhir/erp/CodeSystem/GEM_ERP_CS_FlowType',
            code: flowtype,
          },
        },
      ],
    },
    grundlage: GRUNDLAGE.erpErstellen,
  });
  return aufgabeLesen(inhalt);
}

/**
 * `Task/{id}/$activate` mit dem Verordnungsdatensatz. ⚠ Im Wirkbetrieb qualifiziert signiert
 * (PKCS#7 über den Konnektor mit dem eHBA); die Demo überträgt ihn unsigniert.
 */
export async function erezeptAktivieren(
  aufgabe: ErpAufgabe,
  datensatz: Ressource,
): Promise<ErpAufgabe> {
  const { inhalt } = await anfragen<Parameters<typeof aufgabeLesen>[0]>({
    methode: 'POST',
    pfad: `${ERP}/Task/${aufgabe.rezeptId}/$activate`,
    koerper: {
      resourceType: 'Parameters',
      parameter: [
        {
          name: 'ePrescription',
          resource: {
            resourceType: 'Binary',
            contentType: 'application/pkcs7-mime',
            data: base64(JSON.stringify(datensatz)),
          },
        },
      ],
    },
    zusatz: { 'X-AccessCode': aufgabe.accessCode },
    grundlage: GRUNDLAGE.erpAktivieren,
  });
  return { ...aufgabe, status: aufgabeLesen(inhalt).status };
}

/** `Task/{id}/$abort` — ein noch nicht eingelöstes Rezept löschen. */
export async function erezeptLoeschen(rezeptId: string, accessCode: string): Promise<void> {
  await anfragen({
    methode: 'POST',
    pfad: `${ERP}/Task/${rezeptId}/$abort`,
    koerper: {},
    zusatz: { 'X-AccessCode': accessCode },
    grundlage: GRUNDLAGE.erpLoeschen,
  });
}

/* ---------- Gemerktes über das Aktensystem ---------- */
