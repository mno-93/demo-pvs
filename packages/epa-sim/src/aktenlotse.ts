import type { FastifyInstance, FastifyRequest } from 'fastify';
import {
  VORSCHLAGSFRAGEN,
  istLaborbefund,
  laborwerteAusBefund,
  lotseAntworten,
  medikationAbgleichen,
  medikationszeilenZerlegen,
  vorschlaegeAusText,
  type Ansprache,
  type Lesart,
  type Lotsenkontext,
  type Lotsenquelle,
  type Lotsenvorschlaege,
  type Quellentext,
  type Ressource,
} from '@demo-pvs/kern';
import { bestandFuer, type Dokument } from './bestand.ts';
import { jetzt } from './fhir-hilfen.ts';
import { IM_PLAN, istEmpEintrag } from './medikation.ts';
import { eintragsUuid, sichtbar } from './mhd.ts';

/**
 * ✦ VORSCHLAG — Aktenlotse. Nicht spezifiziert.
 *
 * Ein Dienst der Telematikinfrastruktur, der Fragen an den Aktenbestand beantwortet:
 * für Versicherte und Angehörige in Alltagssprache, für Behandelnde fachsprachlich.
 * Dieselbe Grundlage, dieselben Belege, zwei Lesarten.
 *
 * **Die vier Prinzipien sind hier umgesetzt, nicht nur beschrieben:**
 *
 * 1. *Keine eigenen Rechte.* Der Dienst hängt an derselben Prüfkette wie jeder andere Weg
 *    (`wege.ts`): ohne gültige Befugnis für die aufrufende Einrichtung antwortet er nicht.
 *    Er liest ausschließlich den Bestand der Akte, die in `x-insurantid` steht, und sieht
 *    dort nur, was im aktuellen Ausbaustand sichtbar ist (`sichtbar`). Einen Zugriff über
 *    Akten hinweg gibt es nicht — `alleBestaende` wird hier bewusst nicht verwendet.
 * 2. *Die Daten bleiben drin.* Die Auswertung läuft im Dienst. Nichts wird gespeichert,
 *    nichts verlässt den Aufruf; es gibt keinen Schreibweg.
 * 3. *Belegpflicht.* Jede Aussage trägt die Zeile, aus der sie stammt, samt Dokument.
 *    Gebildet wird sie in `@demo-pvs/kern` (`fachlogik/lotse.ts`), das keinen freien Text
 *    erzeugen kann.
 * 4. *Keine Bewertung.* Der Dienst nennt Werte, Verläufe und Abweichungen. Er ordnet sie
 *    nicht ein, setzt keine Dringlichkeit und gibt keine Empfehlung.
 *
 * ⚠ Die Antworten entstehen **regelbasiert**, nicht mit einem Sprachmodell. Die Demo soll
 * den Umgang prüfbar machen — Belegführung, Umfangsangabe, Rechteerbung, Grenze zur
 * Bewertung —, nicht die Sprachleistung eines Modells.
 *
 * Antwortet erst ab dem Ausbaustand „Weiterentwicklung 4" (ADR 0032, 0034). Die Antworten sind
 * kein FHIR: Der Dienst bildet keine Ressource ab, sondern eine Auskunft über vorhandene.
 */

export const AKTENLOTSE_BASIS = '/epa/vorschlag/aktenlotse/api/v1';

/* ---------- Quellen aus dem Aktenbestand ---------- */

function datumVon(d: Dokument): string {
  return (d.eingestellt ?? d.erstellt).slice(0, 10);
}

/** Lesbare Zeilen eines Laborbefunds — aus dem strukturierten Inhalt, nicht aus dem PDF. */
function laborzeilen(d: Dokument): string[] {
  if (!d.inhalt || !istLaborbefund(d.inhalt)) return [];
  return laborwerteAusBefund(d.inhalt, 'demo', {
    bestand: 'epa',
    quelle: d.einrichtung,
    zeitpunkt: d.erstellt,
    verantwortlich: d.autor,
    dokumentId: d.id,
  }).map((w) => `${w.bezeichnung}: ${w.wert} ${w.einheit}`);
}

/**
 * Der Medikationsplan als Quelle. Er ist kein Dokument, aber die geführte Antwort auf
 * „Welche Medikamente nehme ich und wofür?" — der Grund steht nur dort (`reasonCode`).
 */
function medikationsplanQuelle(kvnr: string, heute: string): Lotsenquelle | null {
  // Nach Widerspruch gegen den Medikationsprozess ist der Plan gesperrt (`wege.ts`, 423) — der
  // Lotse darf ihn nicht über einen Umweg lesen. Er zählt ihn aber als übergangen, damit die
  // Umfangsangabe sagt, was fehlt (wie die Patient Summary: `zurueckgehalten`).
  if (medikationGesperrt(kvnr)) {
    return {
      id: 'medikationsplan',
      titel: 'Medikationsplan (eMP)',
      datum: heute,
      einrichtung: 'elektronische Patientenakte',
      zeilen: [],
      nichtLesbar: 'nach Widerspruch gegen den Medikationsprozess nicht einbezogen',
    };
  }
  const zeilen = planEintraege(kvnr).map(({ mittel, dosis, grund }) =>
    [mittel, dosis, grund ? `wegen ${grund}` : ''].filter(Boolean).join(' — '),
  );
  if (zeilen.length === 0) return null;
  return {
    id: 'medikationsplan',
    titel: 'Medikationsplan (eMP)',
    datum: heute,
    einrichtung: 'elektronische Patientenakte',
    zeilen,
  };
}

/** Widerspruch gegen den Medikationsprozess — dieselbe Sperre wie im Medication Service. */
function medikationGesperrt(kvnr: string): boolean {
  return bestandFuer(kvnr).widersprueche.medication === 'deny';
}

/**
 * Bildet die Quellenliste für eine Akte. Jedes sichtbare Dokument wird zu genau einer
 * Quelle — auch wenn es keinen lesbaren Text hat. Gerade die zählen: Sie erscheinen in der
 * Umfangsangabe und machen sichtbar, was der Lotse **nicht** gelesen hat. Dazu der
 * Medikationsplan, soweit er geführt wird.
 */
export function quellenFuer(kvnr: string): Lotsenquelle[] {
  const bestand = bestandFuer(kvnr);
  const dokumente = bestand.dokumente.filter(sichtbar).map((d) => {
    const zeilen = d.textzeilen ?? laborzeilen(d);
    return {
      id: eintragsUuid(d),
      titel: d.titel,
      datum: datumVon(d),
      einrichtung: d.einrichtung,
      zeilen,
      ...(zeilen.length === 0
        ? {
            nichtLesbar:
              d.mimeType === 'application/pdf'
                ? 'PDF ohne hinterlegte Textebene'
                : 'kein auswertbarer Text',
          }
        : {}),
    };
  });
  const juengstes =
    dokumente
      .map((d) => d.datum)
      .sort()
      .at(-1) ?? jetzt().slice(0, 10);
  const plan = medikationsplanQuelle(kvnr, juengstes);
  return plan ? [...dokumente, plan] : dokumente;
}

/**
 * Bezeichnungen der Mittel im Medikationsplan (eMP) — Vergleichsgrundlage für den Abgleich.
 *
 * Der Planeintrag trägt den Namen nicht selbst: Ein `MedicationRequest` verweist über
 * `medicationReference` auf die `Medication`, die ihn führt. Gezählt werden nur Einträge, die
 * den gültigen Plan bilden (aktiv oder pausiert) — dieselbe Abgrenzung wie im Medication Service.
 */
function planEintraege(kvnr: string): { mittel: string; dosis: string; grund: string }[] {
  const bestand = bestandFuer(kvnr);
  const nachId = new Map(
    bestand.medikation
      .filter((r: Ressource) => r.resourceType === 'Medication')
      .map((r: Ressource) => [String(r.id), r] as const),
  );
  return bestand.medikation
    .filter((r: Ressource) => istEmpEintrag(r) && IM_PLAN.has(String(r['status'])))
    .map((r: Ressource) => {
      const verweis =
        (r['medicationReference'] as { reference?: string } | undefined)?.reference ?? '';
      const mittel = nachId.get(verweis.replace(/^Medication\//, ''));
      const code = mittel?.['code'] as
        { text?: string; coding?: { display?: string }[] } | undefined;
      return {
        mittel: code?.text ?? code?.coding?.[0]?.display ?? '',
        dosis: (r['dosageInstruction'] as { text?: string }[] | undefined)?.[0]?.text ?? '',
        grund: (r['reasonCode'] as { text?: string }[] | undefined)?.[0]?.text ?? '',
      };
    })
    .filter((e) => e.mittel);
}

/** Nur die Bezeichnungen — Vergleichsgrundlage für den Abgleich mit einem Dokument. */
function planMittel(kvnr: string): string[] {
  return planEintraege(kvnr).map((e) => e.mittel);
}

/* ---------- Kontext zum Anlass (S6) und Abweichungen (S4) ---------- */

const ENTLASSMEDIKATION = 'Entlassmedikation';

function abschnittZeilen(quelle: Lotsenquelle, ueberschrift: string): string[] {
  const start = quelle.zeilen.findIndex((z) => z.trim() === ueberschrift);
  if (start < 0) return [];
  const gesammelt: string[] = [];
  for (const zeile of quelle.zeilen.slice(start + 1)) {
    if (!zeile.trim()) break;
    gesammelt.push(zeile.trim());
  }
  return gesammelt;
}

export function kontextBilden(
  kvnr: string,
  anlass: string,
  ansprache: Ansprache = anspracheFuer(kvnr, false),
): Lotsenkontext {
  const quellen = quellenFuer(kvnr);
  const antwort = lotseAntworten(
    anlass || 'Was stand im Entlassbrief?',
    quellen,
    'fach',
    ansprache,
  );

  const brief = quellen
    .filter((q) => /entlassbrief/i.test(q.titel) && q.zeilen.length > 0)
    .sort((a, b) => b.datum.localeCompare(a.datum))[0];

  // Mehrfach dasselbe Mittel: Der Abgleich läuft gegen die Zeilen der Entlassmedikation.
  const briefzeilen = brief ? abschnittZeilen(brief, ENTLASSMEDIKATION) : [];
  const ausBrief = brief
    ? medikationszeilenZerlegen(briefzeilen).map((mittel) => ({
        zeile: mittel,
        fundstelle: {
          quelleId: brief.id,
          titel: brief.titel,
          datum: brief.datum,
          einrichtung: brief.einrichtung,
          // Die belegende Zeile ist die aus dem Brief, nicht das herausgelöste Mittel.
          zeile: briefzeilen.find((z) => z.includes(mittel)) ?? mittel,
        },
      }))
    : [];

  return {
    anlass: anlass || 'nach Krankenhausaufenthalt',
    verlauf: antwort.absaetze,
    // Ohne lesbaren Plan gibt es nichts abzugleichen: Jedes Mittel stünde sonst als „fehlt im
    // Plan" da, obwohl der Plan nur gesperrt ist.
    abweichungen:
      ausBrief.length > 0 && !medikationGesperrt(kvnr)
        ? medikationAbgleichen(ausBrief, planMittel(kvnr))
        : [],
    umfang: antwort.umfang,
  };
}

/* ---------- Vorschläge aus unstrukturiertem Text (S5) ---------- */

/** Text der Einträge, die in den ✦ Listen bereits geführt werden — gegen Doppelvorschläge. */
function bereitsGefuehrt(kvnr: string): string[] {
  return bestandFuer(kvnr)
    .diagnosedienst.map((r: Ressource) => {
      const code = r['code'] as { text?: string; coding?: { display?: string }[] } | undefined;
      return (code?.text ?? code?.coding?.[0]?.display ?? '').toLowerCase();
    })
    .filter(Boolean);
}

export function vorschlaegeBilden(kvnr: string): Lotsenvorschlaege {
  const quellen = quellenFuer(kvnr);
  const gefuehrt = bereitsGefuehrt(kvnr);
  const vorschlaege = quellen
    .flatMap((q) => vorschlaegeAusText(q))
    .map((v) => ({
      ...v,
      // Ein Vorschlag, der schon in der Liste steht, wird nicht unterschlagen, sondern
      // als bekannt markiert — so bleibt nachvollziehbar, was der Lotse gefunden hat.
      schonInListe: gefuehrt.some(
        (g) => v.text.toLowerCase().includes(g) || g.includes(v.text.toLowerCase()),
      ),
    }));
  return { vorschlaege, umfang: lotseAntworten('', quellen).umfang };
}

/* ---------- Wege ---------- */

function kvnrAus(anfrage: FastifyRequest): string {
  return String(anfrage.headers['x-insurantid'] ?? '');
}

/**
 * Wie der Lotse über die Person spricht, folgt aus dem Zugang: Wer als versicherte Person
 * fragt, wird angesprochen; fragt eine Einrichtung, steht der Name der versicherten Person.
 */
export function anspracheFuer(kvnr: string, alsVersicherte: boolean): Ansprache {
  if (alsVersicherte) return { art: 'versicherte' };
  const d = bestandFuer(kvnr).demographie;
  const name = d ? `${d.vorname} ${d.nachname}`.trim() : '';
  return { art: 'praxis', name: name || 'Die versicherte Person' };
}

function ansprache(anfrage: FastifyRequest): Ansprache {
  return anspracheFuer(kvnrAus(anfrage), Boolean(anfrage.headers['x-demo-versicherte']));
}

export function aktenlotseEinhaengen(app: FastifyInstance): void {
  app.get(`${AKTENLOTSE_BASIS}/metadata`, async () => ({
    dienst: 'Aktenlotse (Vorschlag)',
    stand: '✦ nicht spezifiziert, regelbasiert',
    lesarten: ['fach', 'alltag'],
    faehigkeiten: ['frage', 'kontext', 'vorschlaege'],
    vorschlagsfragen: VORSCHLAGSFRAGEN,
    grenzen: [
      'keine Triage und keine Dringlichkeitseinstufung',
      'keine Diagnose- oder Therapievorschläge',
      'keine Prognosen und keine Risikoscores',
      'kein Schreibweg in die Akte',
      'keine Auswertung über Akten hinweg',
    ],
  }));

  app.post(`${AKTENLOTSE_BASIS}/frage`, async (anfrage) => {
    const koerper = (anfrage.body ?? {}) as { frage?: string; lesart?: Lesart };
    const lesart: Lesart = koerper.lesart === 'alltag' ? 'alltag' : 'fach';
    return lotseAntworten(
      String(koerper.frage ?? ''),
      quellenFuer(kvnrAus(anfrage)),
      lesart,
      ansprache(anfrage),
    );
  });

  app.get(`${AKTENLOTSE_BASIS}/kontext`, async (anfrage) => {
    const { anlass } = anfrage.query as { anlass?: string };
    return kontextBilden(kvnrAus(anfrage), String(anlass ?? ''), ansprache(anfrage));
  });

  app.get(`${AKTENLOTSE_BASIS}/vorschlaege`, async (anfrage) =>
    vorschlaegeBilden(kvnrAus(anfrage)),
  );

  /*
   * Eine Unterlage öffnen und nachlesen. Der Lotse führt zur Quelle hin — dieser Weg ist die
   * Hintür dorthin, ohne die der Verweis unter einer Antwort folgenlos bliebe. Er liefert
   * nichts, was `quellenFuer` nicht ohnehin gelesen hat.
   */
  app.get(`${AKTENLOTSE_BASIS}/quelle/:id`, async (anfrage, antwort) => {
    const { id } = anfrage.params as { id: string };
    const quelle = quellenFuer(kvnrAus(anfrage)).find((q) => q.id === id);
    if (!quelle) {
      return antwort
        .code(404)
        .send({ errorCode: 'notFound', errorDetail: 'Diese Unterlage gibt es in der Akte nicht.' });
    }
    const text: Quellentext = {
      quelleId: quelle.id,
      titel: quelle.titel,
      datum: quelle.datum,
      einrichtung: quelle.einrichtung,
      zeilen: quelle.zeilen,
      nichtLesbar: quelle.nichtLesbar ?? null,
    };
    return text;
  });
}
