import { GEWISSHEIT_BEZEICHNUNG, reaktionenAlsText, type Allergie } from '../typen/allergie.js';
import {
  DIAGNOSEART_BEZEICHNUNG,
  KLINISCHER_STATUS_BEZEICHNUNG,
  type Diagnose,
} from '../typen/diagnose.js';
import type { Karteikarteneintrag, Kuerzel } from '../typen/karteikarte.js';
import type { Laborwert } from '../typen/labor.js';
import type { LokalesDokument } from '../typen/dokument.js';
import type { Rezept } from '../typen/rezept.js';
import type { Impfung } from '../typen/impfung.js';
import { TERMINART_BEZEICHNUNG, type Termin } from '../typen/termin.js';
import { deutschesDatum } from './datum.js';

/**
 * Der Verlauf der Karteikarte.
 *
 * Er entsteht nicht aus gespeicherten Texten allein, sondern zu großen Teilen **aus den
 * Datenbeständen**: Eine Diagnose erscheint im Verlauf, weil sie in der Diagnosenliste
 * steht — nicht, weil beim Anlegen ein Text mitgeschrieben wurde. Wird die Diagnose
 * geändert, ändert sich der Verlaufseintrag mit.
 *
 * ▸ Das ist mehr als eine Bequemlichkeit. Eine mitgeschriebene Textfassung wäre eine
 * zweite Wahrheit, die beim ersten Ändern veraltet — genau der Fehler, der bei der
 * Patient Summary vermieden werden soll. Die Karteikarte führt hier vor, was dort
 * gefordert wird: eine Sicht, kein Duplikat.
 */

export type Verlaufsursprung =
  'notiz' | 'diagnose' | 'allergie' | 'labor' | 'medikation' | 'rezept' | 'dokument' | 'impfung';

/**
 * Bezug eines Eintrags zur ePA: aus ihr übernommen oder in ihr geführt — auch über den
 * E-Rezept-Fachdienst. Ohne Bezug `null`.
 */
export type EpaKennzeichen = 'aus-epa' | 'in-epa';

export const EPA_KENNZEICHEN_BEZEICHNUNG: Record<EpaKennzeichen, string> = {
  'aus-epa': 'aus der ePA',
  'in-epa': 'in der ePA',
};

/** Bereich, in dem der zugrunde liegende Datensatz gepflegt wird. */
export type Pflegebereich =
  'diagnosen' | 'medikation' | 'labor' | 'dokumente' | 'impfungen' | 'epa' | null;

export interface Verlaufseintrag {
  id: string;
  /** ISO-Zeitpunkt. */
  zeitpunkt: string;
  kuerzel: Kuerzel;
  text: string;
  /** Ergänzende Zeile, etwa Codierung und Status. */
  zusatz: string | null;
  verfasser: string;
  ursprung: Verlaufsursprung;
  /** Kennung des zugrunde liegenden Datensatzes, sofern abgeleitet. */
  quelleId: string | null;
  bereich: Pflegebereich;
  /** In welchem Bestand der Datensatz liegt. */
  bestand: 'lokal' | 'epa';
  /** Bezug zur ePA, für Kennzeichen und Filter. */
  epa: EpaKennzeichen | null;
}

export interface Verlaufsquellen {
  notizen: readonly Karteikarteneintrag[];
  diagnosen: readonly Diagnose[];
  allergien: readonly Allergie[];
  laborwerte: readonly Laborwert[];
  /** Einträge des Medikationsplans, bereits auf das Nötige verdichtet. */
  medikation: readonly {
    id: string;
    bezeichnung: string;
    dosierung: string;
    zeitpunkt: string;
    verantwortlich: string;
    status: string;
  }[];
  /** Dokumente der Praxisablage — übernommen, eingescannt oder vom Labor. */
  dokumente?: readonly LokalesDokument[];
  /** E-Rezepte der Praxis. */
  rezepte?: readonly Rezept[];
  /** Impfungen der Praxis. */
  impfungen?: readonly Impfung[];
}

/** Bezug eines Datensatzes aus Praxis oder ePA: übernommen, eingestellt oder keiner. */
function bezugZurEpa(
  bestand: 'lokal' | 'epa',
  epaId: string | null | undefined,
): EpaKennzeichen | null {
  if (bestand === 'epa') return 'aus-epa';
  return epaId ? 'in-epa' : null;
}

export function verlaufBilden(quellen: Verlaufsquellen): Verlaufseintrag[] {
  const eintraege: Verlaufseintrag[] = [];

  for (const n of quellen.notizen) {
    eintraege.push({
      id: n.id,
      zeitpunkt: n.zeitpunkt,
      kuerzel: n.kuerzel,
      text: n.text,
      zusatz: null,
      verfasser: n.verfasser,
      ursprung: 'notiz',
      quelleId: null,
      bereich: null,
      bestand: 'lokal',
      epa: null,
    });
  }

  for (const d of quellen.diagnosen) {
    const zeitraum = d.ende
      ? `${deutschesDatum(d.beginn)} bis ${deutschesDatum(d.ende)}`
      : `seit ${deutschesDatum(d.beginn)}`;
    eintraege.push({
      id: `v-${d.id}`,
      zeitpunkt: d.herkunft.zeitpunkt,
      kuerzel: 'D',
      text: `${d.code} ${d.zusatzkennzeichen} — ${d.bezeichnung}`,
      // Liegt SNOMED CT vor, steht die Mehrfachkodierung im Zusatz — sichtbar, nicht nur im Datensatz.
      zusatz: `${DIAGNOSEART_BEZEICHNUNG[d.art]} · ${KLINISCHER_STATUS_BEZEICHNUNG[d.klinischerStatus]} · ${zeitraum}${d.snomed ? ` · SNOMED CT ${d.snomed.code}` : ''}${d.epaId ? ' · in der Diagnosenliste der ePA' : ''}`,
      verfasser: d.herkunft.verantwortlich,
      ursprung: 'diagnose',
      quelleId: d.id,
      bereich: 'diagnosen',
      bestand: d.herkunft.bestand,
      epa: bezugZurEpa(d.herkunft.bestand, d.epaId),
    });
  }

  for (const a of quellen.allergien) {
    eintraege.push({
      id: `v-${a.id}`,
      zeitpunkt: a.herkunft.zeitpunkt,
      kuerzel: 'AL',
      text: `${a.typ} gegen ${a.substanz}`,
      zusatz: `${GEWISSHEIT_BEZEICHNUNG[a.gewissheit]} · ${a.kritikalitaet}${a.reaktionen.length ? ` · ${reaktionenAlsText(a.reaktionen)}` : ''}${a.snomed ? ` · SNOMED CT ${a.snomed.code}` : ''}${a.epaId ? ' · in der Allergienliste der ePA' : ''}`,
      verfasser: a.herkunft.verantwortlich,
      ursprung: 'allergie',
      quelleId: a.id,
      bereich: 'diagnosen',
      bestand: a.herkunft.bestand,
      epa: bezugZurEpa(a.herkunft.bestand, a.epaId),
    });
  }

  // Die Werte eines Laborbefunds werden zu einem Eintrag zusammengefasst — so steht es auch
  // in der Praxis auf der Karteikarte, nicht als eine Zeile je Analyt. Laborwerte entstehen
  // nur aus Befunden (siehe laborwerteAusBefund); der Eintrag führt deshalb zum Befund.
  const nachBefund = new Map<string, Laborwert[]>();
  for (const l of quellen.laborwerte) {
    const schluessel = l.herkunft.dokumentId ?? l.erhobenAm;
    const liste = nachBefund.get(schluessel) ?? [];
    liste.push(l);
    nachBefund.set(schluessel, liste);
  }
  for (const [schluessel, werte] of nachBefund) {
    const auffaellig = werte.filter((w) => w.bewertung !== 'normal');
    const erster = werte[0];
    if (!erster) continue;
    eintraege.push({
      id: `v-labor-${schluessel}`,
      zeitpunkt: erster.herkunft.zeitpunkt,
      kuerzel: 'L',
      text: werte.map((w) => `${w.bezeichnung} ${w.wert} ${w.einheit}`).join(' · '),
      zusatz: `Laborbefund ${erster.herkunft.quelle} · ${
        auffaellig.length > 0
          ? `${auffaellig.length} von ${werte.length} Werten außerhalb des Referenzbereichs`
          : werte.length === 1
            ? '1 Wert, im Referenzbereich'
            : `${werte.length} Werte, alle im Referenzbereich`
      }`,
      verfasser: erster.herkunft.verantwortlich,
      ursprung: 'labor',
      quelleId: erster.herkunft.dokumentId,
      bereich: 'labor',
      bestand: erster.herkunft.bestand,
      epa: erster.herkunft.bestand === 'epa' ? 'aus-epa' : null,
    });
  }

  for (const m of quellen.medikation) {
    eintraege.push({
      id: `v-${m.id}`,
      zeitpunkt: m.zeitpunkt,
      kuerzel: 'M',
      text: `${m.bezeichnung} ${m.dosierung}`,
      zusatz: `Medikationsplan in der ePA · ${m.status}`,
      verfasser: m.verantwortlich,
      ursprung: 'medikation',
      quelleId: m.id,
      bereich: 'medikation',
      bestand: 'epa',
      epa: 'in-epa',
    });
  }

  for (const d of quellen.dokumente ?? []) {
    eintraege.push({
      id: `v-dok-${d.id}`,
      zeitpunkt: d.gespeichertAm,
      kuerzel: 'DK',
      text: d.titel,
      zusatz: `${d.einrichtung} · ${deutschesDatum(d.datum.slice(0, 10))}`,
      verfasser: d.gespeichertVon,
      ursprung: 'dokument',
      quelleId: d.id,
      bereich: 'dokumente',
      bestand: 'lokal',
      epa: d.ursprung === 'akte' ? 'aus-epa' : d.epaId ? 'in-epa' : null,
    });
  }

  for (const r of quellen.rezepte ?? []) {
    if (r.status === 'vorbereitet') continue;
    eintraege.push({
      id: `v-rezept-${r.id}`,
      zeitpunkt: r.geloeschtAm ?? r.gesendetAm ?? r.erstelltAm,
      kuerzel: 'R',
      text: `${r.arzneimittel.bezeichnung} · ${r.packungen} × ${r.normgroesse} · ${r.dosierung}`,
      zusatz: `E-Rezept ${r.rezeptId ?? ''}${r.status === 'geloescht' ? ' · gelöscht' : ''}${r.empId ? ' · aus dem Medikationsplan' : ''}`,
      verfasser: r.signiertVon ?? r.vorbereitetVon,
      ursprung: 'rezept',
      quelleId: r.id,
      bereich: 'medikation',
      bestand: 'lokal',
      epa: r.status === 'gesendet' ? 'in-epa' : null,
    });
  }

  for (const i of quellen.impfungen ?? []) {
    eintraege.push({
      id: `v-impfung-${i.id}`,
      zeitpunkt: i.herkunft.zeitpunkt,
      kuerzel: 'I',
      text: `${i.impfstoff.bezeichnung}${i.dosis ? ` · ${i.dosis}. Dosis` : ''}`,
      zusatz: `${i.zielkrankheiten.map((k) => k.anzeige).join(', ')} · geimpft ${deutschesDatum(i.datum)}${i.charge ? ` · Charge ${i.charge}` : ''}${i.status === 'fehlerhaft' ? ' · fehlerhaft' : ''}${i.epaId ? ' · in der Impfliste der ePA' : ''}`,
      verfasser: i.herkunft.verantwortlich,
      ursprung: 'impfung',
      quelleId: i.id,
      bereich: 'impfungen',
      bestand: i.herkunft.bestand,
      epa: bezugZurEpa(i.herkunft.bestand, i.epaId),
    });
  }

  return eintraege.sort((a, b) => b.zeitpunkt.localeCompare(a.zeitpunkt));
}

/* ---------- Besuche ---------- */

/** Reihenfolge und Überschrift der Gruppen innerhalb eines Besuchs. */
const GRUPPEN: { titel: string; kuerzel: readonly Kuerzel[] }[] = [
  { titel: 'Notizen', kuerzel: ['A', 'B', 'T', 'S'] },
  { titel: 'Diagnosen', kuerzel: ['D'] },
  { titel: 'Allergien', kuerzel: ['AL'] },
  { titel: 'Impfungen', kuerzel: ['I'] },
  { titel: 'Medikationsplan', kuerzel: ['M'] },
  { titel: 'Rezepte', kuerzel: ['R'] },
  { titel: 'Labor', kuerzel: ['L'] },
  { titel: 'Dokumente', kuerzel: ['DK'] },
];

export interface Besuchsgruppe {
  titel: string;
  eintraege: Verlaufseintrag[];
}

/**
 * Ein Tag im Verlauf: ein Besuch der Person in der Praxis oder ein Eingang ohne Besuch
 * (Befund vom Labor, Eintrag einer anderen Einrichtung).
 */
export interface Besuch {
  /** ISO-Datum. */
  datum: string;
  art: 'besuch' | 'eingang';
  termin: { uhrzeit: string; art: string; anlass: string; status: string } | null;
  gruppen: Besuchsgruppe[];
  /** Personen, die an diesem Tag dokumentiert haben. */
  verfasser: string[];
  /** Wie viele Einträge an diesem Tag aus der ePA kamen oder in sie gingen. */
  epa: { aus: number; in: number };
}

/**
 * Fasst den Verlauf zu Besuchen zusammen: je Kalendertag ein Block, darin nach Art gruppiert.
 * Ein Tag mit Termin oder eigener Notiz ist ein Besuch, sonst ein Eingang. Ein Termin von heute
 * erscheint schon, bevor etwas dokumentiert ist — der Block sammelt, was während des Besuchs
 * entsteht.
 */
export function besucheBilden(
  verlauf: readonly Verlaufseintrag[],
  termine: readonly Termin[],
  heute: string,
): Besuch[] {
  const nachTag = new Map<string, Verlaufseintrag[]>();
  for (const e of verlauf) {
    const tag = e.zeitpunkt.slice(0, 10);
    nachTag.set(tag, [...(nachTag.get(tag) ?? []), e]);
  }
  const termin = new Map(
    termine
      .filter((t) => t.status !== 'abgesagt' && t.datum <= heute)
      .map((t) => [t.datum, t] as const),
  );
  for (const tag of termin.keys()) if (!nachTag.has(tag)) nachTag.set(tag, []);

  return [...nachTag.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([datum, eintraege]): Besuch => {
      const t = termin.get(datum) ?? null;
      const gruppen = GRUPPEN.map((g) => ({
        titel: g.titel,
        eintraege: eintraege
          .filter((e) => g.kuerzel.includes(e.kuerzel))
          .sort((a, b) => a.zeitpunkt.localeCompare(b.zeitpunkt)),
      })).filter((g) => g.eintraege.length > 0);
      return {
        datum,
        art: t || eintraege.some((e) => e.ursprung === 'notiz') ? 'besuch' : 'eingang',
        termin: t
          ? {
              uhrzeit: t.uhrzeit,
              art: TERMINART_BEZEICHNUNG[t.art],
              anlass: t.anlass,
              status: t.status,
            }
          : null,
        gruppen,
        verfasser: [...new Set(eintraege.map((e) => e.verfasser).filter(Boolean))],
        epa: {
          aus: eintraege.filter((e) => e.epa === 'aus-epa').length,
          in: eintraege.filter((e) => e.epa === 'in-epa').length,
        },
      };
    });
}
