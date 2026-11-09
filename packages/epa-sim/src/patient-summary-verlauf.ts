import type { SimAnwendung } from './schnittstelle.ts';
import {
  CODESYSTEM,
  ohneZeitzone,
  PS_ABSCHNITTE,
  PS_AENDERUNG_EXTENSION,
  type PsAbschnittSchluessel,
  type PsAenderungsart,
  type Ressource,
} from '@demo-pvs/kern';
import { bestandFuer } from './bestand.ts';
import { istChronologie } from './chronologie.ts';
import { LISTE } from './diagnosedienst.ts';
import { jetzt } from './fhir-hilfen.ts';
import { EMP, operationsparameterAbweisen } from './medikation.ts';
import { eintragsUuid, sichtbar } from './mhd.ts';
import { PATIENT_SUMMARY_BASIS, bezeichnung, teileBilden, type Teil } from './patient-summary.ts';

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
 * Antwort: Bundle `collection` mit je einer Provenance pro Änderung, jüngste zuerst — `recorded`
 * ist der Zeitpunkt und zugleich der Stand für `$summary?_at=…`; `agent` die Einrichtungen, die die
 * Quelle änderten; `entity` die Quelle; `target` die betroffenen Einträge in ihrer Fassung; je
 * Änderung die Extension `ps-change` mit Abschnitt, Art und Eintrag. Vorbild ist das
 * Änderungsprotokoll der Listen (`$…-list-log`) und des eMP.
 */

interface Ereignis {
  zeit: string;
  wer: { display?: string; identifier?: { system?: string; value?: string } };
  quelle: { reference: string; display: string };
}

/** Alle Zeitpunkte, an denen sich eine Quelle der Patient Summary änderte. */
function ereignisse(kvnr: string): Ereignis[] {
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
export function patientSummaryVerlauf(kvnr: string): Ressource {
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
    // Jede Einrichtung einmal, jede Quelle einmal.
    const wer = [
      ...new Map(gruppe.map((e) => [e.wer.identifier?.value ?? e.wer.display, e.wer])).values(),
    ];
    const quellen = [...new Map(gruppe.map((e) => [e.quelle.reference, e.quelle])).values()];
    eintraege.push({
      resourceType: 'Provenance',
      id: `ps-log-${eintraege.length + 1}`,
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
  return {
    resourceType: 'Bundle',
    meta: { lastUpdated: jetzt() },
    type: 'collection',
    total: eintraege.length,
    entry: [...eintraege].reverse().map((r) => ({ resource: r })),
  };
}

export function patientSummaryVerlaufEinhaengen(
  app: SimAnwendung,
  kvnrAus: (anfrage: { headers: Record<string, unknown> }) => string,
) {
  app.get(`${PATIENT_SUMMARY_BASIS}/Patient/$summary-log`, async (anfrage, antwort) => {
    if (operationsparameterAbweisen(anfrage, {}, antwort)) return antwort;
    return patientSummaryVerlauf(kvnrAus(anfrage));
  });
}
