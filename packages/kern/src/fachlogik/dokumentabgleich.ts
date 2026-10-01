import type { Abgleichstatus, LokalesDokument } from '../typen/dokument.js';
import { befundkopfLesen } from './laborbefund.js';

/**
 * Abgleich zwischen dem Dokumentenbestand der ePA und dem des Praxissystems.
 *
 * Die Frage, die diese Ansicht beantworten muss, ist die des Praxisalltags: Was ist neu?
 * Deshalb ist der Abgleich eine eigene Funktion mit Tests und keine Filterlogik in der
 * Oberfläche — er trägt die Aussage, auf die sich die Anwendenden verlassen.
 */

/** Ein Dokument, wie es in der ePA verzeichnet ist. */
export interface EpaDokument {
  id: string;
  titel: string;
  art: string;
  datum: string;
  einrichtung: string;
  autor: string;
  /** XDS-uniqueId aus `DocumentReference.masterIdentifier`, sofern angegeben. */
  uniqueId?: string | null;
}

/**
 * Wandelt eine UUID in eine OID unter dem Bogen 2.25 (ITU-T X.667): die UUID als eine
 * einzige Dezimalzahl. So entsteht aus der Kennung eines Befunds eine XDS-uniqueId, ohne
 * dass es eine eigene Vergabestelle braucht.
 */
export function uuidAlsOid(uuid: string): string {
  return `urn:oid:2.25.${BigInt(`0x${uuid.replace(/-/g, '')}`).toString(10)}`;
}

/**
 * Dokumentkennung eines lokalen Dokuments, soweit sie sich aus dem Inhalt ergibt. Heute gilt
 * das für Laborbefunde nach dgLP: Ihre versionsunabhängige UUID steht im Befund selbst.
 *
 * ⚠ Dass das Labor diese UUID auch als XDS-uniqueId verwendet, ist eine Annahme der Demo.
 * Das Fachkonzept dgLP legt die Kennung des Laborgesamtbefunds fest, nicht die Abbildung
 * auf die Metadaten des Dokuments.
 */
export function dokumentkennungLokal(dokument: LokalesDokument): string | null {
  const kopf = befundkopfLesen(dokument.inhalt);
  return kopf?.uuid ? uuidAlsOid(kopf.uuid) : null;
}

export interface Abgleichzeile {
  /** Stabile Kennung für die Anzeige: die Aktenkennung, sonst die lokale. */
  schluessel: string;
  titel: string;
  art: string;
  datum: string;
  einrichtung: string;
  autor: string;
  status: Abgleichstatus;
  epaDokument: EpaDokument | null;
  lokal: LokalesDokument | null;
  /**
   * Woran das lokale Dokument als dasselbe erkannt wurde: an der Aktenkennung, weil es von
   * dort übernommen oder dorthin eingestellt wurde, oder an der Dokumentkennung, weil es auf
   * einem anderen Weg — etwa direkt vom Labor — in die Praxis kam.
   */
  erkanntUeber: 'aktenkennung' | 'dokumentkennung' | null;
}

export function dokumenteAbgleichen(
  epaDokumente: readonly EpaDokument[],
  lokaleDokumente: readonly LokalesDokument[],
): Abgleichzeile[] {
  const lokalNachEpaId = new Map<string, LokalesDokument>();
  const lokalNachKennung = new Map<string, LokalesDokument>();
  for (const d of lokaleDokumente) {
    if (d.epaId) lokalNachEpaId.set(d.epaId, d);
    const kennung = dokumentkennungLokal(d);
    if (kennung) lokalNachKennung.set(kennung, d);
  }

  const zugeordnet = new Set<string>();
  const zeilen: Abgleichzeile[] = epaDokumente.map((akte) => {
    const ueberAkte = lokalNachEpaId.get(akte.id) ?? null;
    const ueberKennung =
      !ueberAkte && akte.uniqueId ? (lokalNachKennung.get(akte.uniqueId) ?? null) : null;
    const lokal = ueberAkte ?? ueberKennung;
    if (lokal) zugeordnet.add(lokal.id);
    return {
      schluessel: akte.id,
      titel: akte.titel,
      art: akte.art,
      datum: akte.datum,
      einrichtung: akte.einrichtung,
      autor: akte.autor,
      // Ein lokal erzeugtes und eingestelltes Dokument bleibt als solches erkennbar.
      status: lokal
        ? lokal.ursprung === 'praxis'
          ? 'lokal-eingestellt'
          : 'in-beiden'
        : 'nur-in-epa',
      epaDokument: akte,
      lokal,
      erkanntUeber: ueberAkte ? 'aktenkennung' : ueberKennung ? 'dokumentkennung' : null,
    };
  });

  for (const lokal of lokaleDokumente) {
    if (zugeordnet.has(lokal.id)) continue;
    zeilen.push({
      schluessel: lokal.id,
      titel: lokal.titel,
      art: lokal.art,
      datum: lokal.datum,
      einrichtung: lokal.einrichtung,
      autor: lokal.autor,
      status: 'nur-lokal',
      epaDokument: null,
      lokal,
      erkanntUeber: null,
    });
  }

  return zeilen.sort(
    (a, b) => b.datum.localeCompare(a.datum) || a.titel.localeCompare(b.titel, 'de'),
  );
}

/** Zählt, was der Abgleich ergeben hat — Grundlage für die Kurzfassung im Kopf der Ansicht. */
export function abgleichZaehlen(zeilen: readonly Abgleichzeile[]) {
  return {
    gesamt: zeilen.length,
    nurInEpa: zeilen.filter((z) => z.status === 'nur-in-epa').length,
    lokalVorhanden: zeilen.filter(
      (z) => z.status === 'in-beiden' || z.status === 'lokal-eingestellt',
    ).length,
    nurLokal: zeilen.filter((z) => z.status === 'nur-lokal').length,
  };
}
