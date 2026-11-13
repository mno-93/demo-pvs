import type { SimAnwendung } from './schnittstelle.ts';
import {
  CODESYSTEM,
  PS_ABSCHNITTE,
  PS_AENDERUNG_EXTENSION,
  type PsAbschnittSchluessel,
  type PsAenderungsart,
  type Ressource,
} from '@demo-pvs/kern';
import { suchergebnis } from './fhir-hilfen.ts';
import { ZAHL, operationsparameterAbweisen } from './medikation.ts';
import { PATIENT_SUMMARY_BASIS, bezeichnung, teileBilden, type Teil } from './patient-summary.ts';
import { ereignisse, verlaufskennung, type Ereignis } from './patient-summary-ereignisse.ts';

/**
 * ✦ VORSCHLAG — Änderungsverlauf der Patient Summary (`Patient/$summary-log`). Nicht spezifiziert.
 *
 * Die Patient Summary wird nicht gespeichert; ihr Verlauf entsteht wie jeder frühere Stand aus den
 * Quellen. Jeder Zeitpunkt, an dem eine Quelle sich änderte — ein Chronologieeintrag einer Liste
 * oder des eMP, ein Änderungseintrag der Medikationsliste, ein eingestelltes strukturiertes
 * Dokument —, ist ein Kandidat. Der Dienst bildet die Abschnitte vor und nach dem Zeitpunkt und
 * nennt, was sich in der Patient Summary geändert hat: neue, geänderte (neue Fassung) und
 * entfallene Einträge. Zeitpunkte, an denen sie gleich blieb — etwa eine Änderung an einem nicht
 * markierten Listeneintrag —, erscheinen nicht.
 *
 * Antwort wie `$medication-plan-log`: Bundle `searchset` mit `total`, jüngste zuerst, `_count`
 * (Standard 50) und `_offset`. Je Änderung eine Provenance — ihre `id` (UUID) ist der Stand für
 * `$summary?provenance=…` wie beim eMP, `recorded` der Zeitpunkt (auch für ✦ `_at`); `agent` die
 * Einrichtungen, die die Quelle änderten; `entity` die Quelle; `target` die betroffenen Einträge in
 * ihrer Fassung; je Änderung die Extension `ps-change` mit Abschnitt, Art und Eintrag. Anders als
 * ein Chronologieeintrag des eMP, der den ganzen Stand nennt, nennt sie die Änderung — den ganzen
 * Stand liefert `$summary` zu ihrer Kennung.
 */

interface Gezeigt {
  abschnitt: PsAbschnittSchluessel;
  verweis: string;
  fassung: string;
  bezeichnung: string;
}

/** Was die Patient Summary zum Stand zeigt — je Eintrag Abschnitt, Fassung und Bezeichnung. */
function gezeigt(teile: Record<PsAbschnittSchluessel, Teil>): Map<string, Gezeigt> {
  const alle = Object.values(teile).flatMap((t) => [...t.eintraege, ...t.dazu]);
  const karte = new Map<string, Gezeigt>();
  for (const [abschnitt, t] of Object.entries(teile) as [PsAbschnittSchluessel, Teil][])
    for (const e of t.eintraege) {
      const verweis = `${e.resourceType}/${String(e.id)}`;
      karte.set(`${abschnitt}|${verweis}`, {
        abschnitt,
        verweis,
        fassung: String(e.meta?.versionId ?? '1'),
        bezeichnung: bezeichnung(e, alle),
      });
    }
  return karte;
}

function aenderung(g: Gezeigt, art: PsAenderungsart) {
  const d = PS_ABSCHNITTE.find((x) => x.schluessel === g.abschnitt)!;
  return {
    url: PS_AENDERUNG_EXTENSION,
    extension: [
      {
        url: 'section',
        valueCoding: { system: CODESYSTEM.loinc, code: d.loinc, display: d.titel },
      },
      { url: 'change', valueCode: art },
      {
        url: 'entry',
        valueReference: {
          reference: `${g.verweis}/_history/${g.fassung}`,
          display: g.bezeichnung,
        },
      },
    ],
  };
}

const AKTEUR = 'http://terminology.hl7.org/CodeSystem/provenance-participant-type';

/** Der Änderungsverlauf als Bundle `collection` mit einer Provenance je Änderung. */
export function patientSummaryVerlauf(
  kvnr: string,
  { anzahl = 50, ab = 0 }: { anzahl?: number; ab?: number } = {},
): Ressource {
  // Gleiche Zeitpunkte gehören zusammen: eine Schreiboperation legt oft Änderungs- und
  // Chronologieeintrag zugleich an.
  const gruppen = new Map<string, Ereignis[]>();
  for (const e of ereignisse(kvnr)) gruppen.set(e.zeit, [...(gruppen.get(e.zeit) ?? []), e]);
  let vorher = new Map<string, Gezeigt>();
  const eintraege: Ressource[] = [];
  for (const [zeit] of [...gruppen].sort(([a], [b]) => a.localeCompare(b))) {
    const gruppe = gruppen.get(zeit)!;
    const jetzt_ = gezeigt(teileBilden(kvnr, zeit));
    const neu = [...jetzt_].filter(([k]) => !vorher.has(k)).map(([, g]) => g);
    const weg = [...vorher].filter(([k]) => !jetzt_.has(k)).map(([, g]) => g);
    // Derselbe Eintrag aus einer anderen Quelle — ein jüngerer Laborwert, der Plan statt der
    // Liste — ist eine Änderung, weder Wegfall noch neuer Eintrag.
    const gleich = (a: Gezeigt, b: Gezeigt) =>
      a.abschnitt === b.abschnitt && a.bezeichnung === b.bezeichnung;
    const ersetzt = neu.filter((g) => weg.some((w) => gleich(w, g)));
    const aenderungen = [
      ...neu.filter((g) => !ersetzt.includes(g)).map((g) => ({ g, art: 'added' as const })),
      ...ersetzt.map((g) => ({ g, art: 'changed' as const })),
      ...[...jetzt_]
        .filter(([k, g]) => vorher.has(k) && vorher.get(k)!.fassung !== g.fassung)
        .map(([, g]) => ({ g, art: 'changed' as const })),
      ...weg
        .filter((w) => !ersetzt.some((g) => gleich(w, g)))
        .map((g) => ({ g, art: 'removed' as const })),
    ];
    vorher = jetzt_;
    if (aenderungen.length === 0) continue;
    // Jede Einrichtung einmal — nach Name, damit dieselbe mit und ohne Telematik-ID nicht doppelt
    // steht; die Angabe mit Kennung gewinnt. Jede Quelle einmal.
    const wer = [
      ...gruppe
        .reduce((karte, e) => {
          const name = e.wer.display ?? e.wer.identifier?.value ?? 'unbekannt';
          if (!karte.get(name)?.identifier) karte.set(name, e.wer);
          return karte;
        }, new Map<string, Ereignis['wer']>())
        .values(),
    ];
    const quellen = [...new Map(gruppe.map((e) => [e.quelle.reference, e.quelle])).values()];
    eintraege.push({
      resourceType: 'Provenance',
      id: verlaufskennung(kvnr, zeit),
      extension: aenderungen.map(({ g, art }) => aenderung(g, art)),
      target: aenderungen.map(({ g }) => ({ reference: `${g.verweis}/_history/${g.fassung}` })),
      occurredDateTime: zeit,
      recorded: zeit,
      activity: {
        coding: [
          {
            system: 'http://terminology.hl7.org/CodeSystem/v3-DataOperation',
            code: eintraege.length === 0 ? 'CREATE' : 'UPDATE',
          },
        ],
      },
      agent: wer.map((w) => ({
        type: { coding: [{ system: AKTEUR, code: 'author' }] },
        who: { ...w, display: w.display ?? 'unbekannt' },
      })),
      entity: quellen.map((q) => ({ role: 'source', what: q })),
    });
  }
  const neuesteZuerst = [...eintraege].reverse();
  return { ...suchergebnis(neuesteZuerst.slice(ab, ab + anzahl)), total: neuesteZuerst.length };
}

export function patientSummaryVerlaufEinhaengen(
  app: SimAnwendung,
  kvnrAus: (anfrage: { headers: Record<string, unknown> }) => string,
) {
  app.get(`${PATIENT_SUMMARY_BASIS}/Patient/$summary-log`, async (anfrage, antwort) => {
    if (operationsparameterAbweisen(anfrage, { _count: ZAHL, _offset: ZAHL }, antwort))
      return antwort;
    const q = anfrage.query as Record<string, string | undefined>;
    return patientSummaryVerlauf(kvnrAus(anfrage), {
      anzahl: Number(q['_count'] ?? 50),
      ab: Number(q['_offset'] ?? 0),
    });
  });
}
