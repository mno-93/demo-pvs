import {
  ITI41_INHALTSTYP,
  XDS_DOKUMENTENDIENST,
  provideAndRegisterErzeugen,
  registryResponseLesen,
  type XdsEinreichung,
} from '@demo-pvs/kern';
import type { Ressource } from '@demo-pvs/kern';
import {
  MHD,
  GRUNDLAGE,
  angebotMerken,
  EpaFehler,
  anfragekennung,
  anfragen,
  Bundle,
  treffer,
  serverzeit,
  betriebsstandErhoehen,
} from '../klient.js';

/**
 * MHD Service (`de.gematik.epa.mhd` 1.1.3): ITI-67 suchen, auch im Volltext (ab Weiterentwicklung
 * 1, ADR 0034); ITI-68 abrufen. XDS Document Service (WSDL ePA 3.1.3): ITI-41 einstellen, SOAP 1.2
 * — der einzige Weg, auf dem ein Dokument in die Akte kommt.
 */

export async function dokumenteSuchen(
  kvnr: string,
  volltext?: string,
  /**
   * Gesetzt, wenn nicht die Praxis sucht, sondern die versicherte Person in ihrer eigenen
   * Anwendung. Derselbe Weg, dieselbe Antwort — nur ein anderer Zugang (✦ Demo-Ersatz).
   */
  alsVersicherte?: string,
): Promise<Ressource[]> {
  const suche = new URLSearchParams({ status: 'current' });
  if (volltext?.trim()) suche.set('_content', volltext.trim());
  const { inhalt } = await anfragen<Bundle>({
    pfad: `${MHD}/DocumentReference?${suche.toString()}`,
    kvnr,
    grundlage: GRUNDLAGE.iti67,
    ...(alsVersicherte ? { zusatz: { 'x-demo-versicherte': alsVersicherte } } : {}),
  });
  return treffer(inhalt);
}

/** Ob der Dokumentendienst die Volltextsuche (`_content`) anbietet — laut CapabilityStatement. */
let volltextAngeboten: boolean | null = null;
angebotMerken(() => {
  volltextAngeboten = null;
});
export async function volltextsucheVerfuegbar(): Promise<boolean> {
  if (volltextAngeboten !== null) return volltextAngeboten;
  const { inhalt } = await anfragen<{
    rest?: { resource?: { type?: string; searchParam?: { name?: string }[] }[] }[];
  }>({
    pfad: `${MHD}/metadata`,
    grundlage: GRUNDLAGE.iti67,
  });
  volltextAngeboten = (inhalt.rest ?? [])
    .flatMap((r) => r.resource ?? [])
    .filter((r) => r.type === 'DocumentReference')
    .some((r) => (r.searchParam ?? []).some((p) => p.name === '_content'));
  return volltextAngeboten;
}

/** Dokumentliste mit dem Zeitpunkt des Aktensystems. */
export async function dokumenteMitStand(
  kvnr: string,
): Promise<{ verweise: Ressource[]; stand: string }> {
  const { inhalt } = await anfragen<Bundle>({
    pfad: `${MHD}/DocumentReference?status=current`,
    kvnr,
    grundlage: GRUNDLAGE.iti67,
  });
  return { verweise: treffer(inhalt), stand: serverzeit(inhalt) };
}

/** Dokumente, die seit dem Lesezeichen eingestellt oder geändert wurden (`_lastUpdated`). */
export async function dokumenteSeit(kvnr: string, seit: string): Promise<Ressource[]> {
  const { inhalt } = await anfragen<Bundle>({
    pfad: `${MHD}/DocumentReference?status=current&_lastUpdated=gt${encodeURIComponent(seit)}`,
    kvnr,
    grundlage: GRUNDLAGE.iti67Seit,
  });
  return treffer(inhalt);
}

/** Ein unstrukturiertes Dokument (PDF, XML) als Datei. */
export interface EpaDatei {
  datei: Blob;
  mimeType: string;
}

export function istDatei(inhalt: unknown): inhalt is EpaDatei {
  return typeof inhalt === 'object' && inhalt !== null && 'datei' in inhalt;
}

/** ITI-68 über die URL aus `DocumentReference.content.attachment.url`. */
export async function dokumentAbrufen(
  kvnr: string,
  verweis: Ressource,
  alsVersicherte?: string,
): Promise<unknown> {
  const url = (verweis['content'] as { attachment?: { url?: string } }[] | undefined)?.[0]
    ?.attachment?.url;
  if (!url) throw new EpaFehler(0, 'Der Dokumentverweis nennt keine Abrufadresse.');
  const { inhalt } = await anfragen<unknown>({
    pfad: url,
    kvnr,
    grundlage: GRUNDLAGE.iti68,
    datei: true,
    ...(alsVersicherte ? { zusatz: { 'x-demo-versicherte': alsVersicherte } } : {}),
  });
  return inhalt;
}

/* ---------- Medication Service ---------- */

/**
 * Stellt Dokumente über ITI-41 in die Akte. Wirft bei einer RegistryResponse mit Fehlern; der
 * Fehlercode ist der des XDS-Dienstes, etwa `XDSRegistryMetadataError`.
 */
export async function dokumenteEinstellen(einreichung: XdsEinreichung): Promise<void> {
  const xml = provideAndRegisterErzeugen(einreichung, anfragekennung());
  const { inhalt } = await anfragen<string>({
    methode: 'POST',
    pfad: XDS_DOKUMENTENDIENST,
    kvnr: einreichung.kvnr,
    grundlage: GRUNDLAGE.iti41,
    roh: { inhaltstyp: ITI41_INHALTSTYP, text: xml },
  });
  const antwort = registryResponseLesen(inhalt);
  if (!antwort.erfolg) {
    const erster = antwort.fehler[0];
    throw new EpaFehler(
      200,
      erster ? `${erster.code}: ${erster.text}` : 'Abgelehnt.',
      erster?.code ?? null,
    );
  }
  betriebsstandErhoehen();
}
