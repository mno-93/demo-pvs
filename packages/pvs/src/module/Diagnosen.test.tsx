import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  PS_RELEVANT_EXTENSION,
  diagnoseNachFhir,
  psRelevanzSetzen,
  type Diagnose,
  type Ressource,
} from '@demo-pvs/kern';
import { App } from '../App.js';
import { startzustand } from '../daten/startdaten.js';
import { lesen, speicherStarten } from '../speicher/speicher.js';
import { epaFensterSchliessen } from '../epa/fenster.js';
import { klientZuruecksetzen } from '../epa/klient.js';
import {
  KLINIKUM,
  PRAXIS,
  dauerhafteBefugnis,
  epaAttrappe,
  provenance,
  suchergebnis,
  type Aufzeichnung,
  type Attrappenantwort,
} from '../testhilfe/epa-attrappe.js';

/**
 * Splitscreen aus den Listen der ePA und den Einträgen der Praxis (✦ Diagnose-Service,
 * ADR 0018).
 */

const DIENST = '/epa/vorschlag/diagnosis/api/v1/fhir';
const BASIS = 'https://example.org/demo-pvs/fhir/StructureDefinition';

/** Chronologieeintrag einer Liste — sein Kennzeichen macht ihn zum Lesenachweis. */
function chronologie(art: 'condition' | 'allergy', id: string): Ressource {
  return {
    resourceType: 'Provenance',
    id,
    extension: [{ url: `${BASIS}/is-${art}-list-chronology`, valueBoolean: true }],
    target: [{ reference: 'Patient/pat' }],
    recorded: '2026-09-01T10:00:00+02:00',
  };
}

/** Antwort einer schreibenden Operation: Eintrag, Änderungseintrag, neuer Chronologieeintrag. */
function geschrieben(eintrag: Ressource, art: 'condition' | 'allergy'): Attrappenantwort {
  return {
    status: 200,
    inhalt: {
      resourceType: 'Parameters',
      parameter: [
        { name: 'entry', resource: eintrag },
        { name: 'relatedChronology', resource: chronologie(art, `chron-${art}-2`) },
      ],
    },
  };
}

function öffne(pfad: string) {
  return render(
    <MemoryRouter initialEntries={[pfad]}>
      <App />
    </MemoryRouter>,
  );
}

/** Condition, wie sie der Dienst liefert — aus einem Eintrag gebaut, mit Kennung und Fassung. */
function condition(d: Diagnose, id: string, kvnr: string, fassung = '1'): Ressource {
  return { ...diagnoseNachFhir({ ...d, id }, kvnr), meta: { versionId: fassung } };
}

/** Aktensystem mit Diagnose-Service; Listen und Schreibantworten nach Vorgabe. */
function dienst(
  listen: { diagnosen: Ressource[]; allergien: Ressource[]; provenance: Ressource[] },
  schreiben: (a: Aufzeichnung) => Attrappenantwort | undefined = () => undefined,
) {
  return epaAttrappe((a) => {
    if (a.pfad === `${DIENST}/metadata`) {
      return { status: 200, inhalt: { resourceType: 'CapabilityStatement', status: 'draft' } };
    }
    if (a.pfad === `${DIENST}/$condition-list`) {
      return {
        status: 200,
        inhalt: suchergebnis(listen.diagnosen, [
          ...listen.provenance,
          chronologie('condition', 'chron-condition-1'),
        ]),
      };
    }
    if (a.pfad === `${DIENST}/$allergy-list`) {
      return {
        status: 200,
        inhalt: suchergebnis(listen.allergien, [
          ...listen.provenance,
          chronologie('allergy', 'chron-allergy-1'),
        ]),
      };
    }
    return schreiben(a);
  });
}

describe('Splitscreen Diagnosen und Allergien', () => {
  beforeEach(() => {
    klientZuruecksetzen();
    epaFensterSchliessen();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('zeigt ohne Befugnis nur die Praxisseite und fragt die ePA nicht ab', () => {
    const aufrufe = epaAttrappe(() => undefined);
    speicherStarten(startzustand());
    öffne('/patient/p-hoffmann/diagnosen');
    expect(screen.getByText('Keine Befugnis für die ePA.')).toBeDefined();
    expect(screen.getAllByText('Keine Befugnis.').length).toBe(2);
    // Keine Abfrage einer Akte (x-insurantid); die Fähigkeiten des Aktensystems sind aktenfrei.
    expect(
      aufrufe.filter((a) => a.pfad.startsWith('/epa/') && a.kopf['x-insurantid']),
    ).toHaveLength(0);
  });

  it('gleicht gegen die Diagnosenliste ab und übernimmt einen Eintrag des Klinikums', async () => {
    const z = { ...startzustand(), epaBefugnisse: [dauerhafteBefugnis('p-yildiz')] };
    const kvnr = z.patienten.find((p) => p.id === 'p-yildiz')!.versicherung.kvnr;
    const eigene = z.diagnosen.filter((d) => d.patientId === 'p-yildiz');
    const verknuepfte = eigene.map((d) => condition(d, d.epaId!, kvnr));
    const fremd = condition(
      {
        ...eigene[0]!,
        code: 'J45.9',
        bezeichnung: 'Asthma bronchiale, nicht näher bezeichnet',
        snomed: {
          system: 'http://snomed.info/sct',
          code: '195967001',
          anzeige: 'Asthma bronchiale',
        },
        beginn: '2026-06-01',
        epaId: null,
      },
      'cond-k-1',
      kvnr,
    );
    dienst({
      diagnosen: [...verknuepfte, fremd],
      allergien: [],
      provenance: [
        ...verknuepfte.map((r) => provenance(r, PRAXIS, '2026-07-02T09:05:00')),
        provenance(fremd, KLINIKUM, '2026-08-20T15:00:00'),
      ],
    });
    speicherStarten(z);
    öffne('/patient/p-yildiz/diagnosen');

    expect(await screen.findByText(/Listen der ePA/)).toBeDefined();
    const block = screen.getByRole('region', { name: 'Diagnosen' });
    expect(within(block).getAllByText('abgeglichen')).toHaveLength(2);
    expect(within(block).getByText('nur in der ePA')).toBeDefined();
    // Kompakt und nach Einstellung geordnet: der jüngste Eintrag — der des Klinikums — oben.
    const titel = () =>
      [...block.querySelectorAll('tbody tr')].map((t) =>
        t.querySelector('.kompakt-taste')?.textContent?.trim(),
      );
    expect(titel()[0]).toBe('Asthma bronchiale, nicht näher bezeichnet');
    expect(within(block).queryByText(/eingetragen von/)).toBeNull();
    fireEvent.click(within(block).getByRole('button', { name: 'alle aufklappen' }));
    const herkunft = within(block)
      .getAllByText(/eingetragen von/)
      .map((e) => e.textContent ?? '');
    expect(herkunft.some((t) => t.includes('Klinikum Sonnenschein'))).toBe(true);
    expect(herkunft.some((t) => t.includes('Hausarztpraxis am Stadtgarten'))).toBe(true);

    fireEvent.click(within(block).getByRole('button', { name: '← in die Praxis' }));
    const neu = lesen().diagnosen.find((d) => d.patientId === 'p-yildiz' && d.epaId === 'cond-k-1');
    expect(neu?.code).toBe('J45.9');
    expect(neu?.herkunft.quelle).toContain('Klinikum Sonnenschein');
    expect(within(block).getAllByText('abgeglichen')).toHaveLength(3);
  });

  it('nimmt einen Eintrag der Praxis mit Lesenachweis und Organisation in die Diagnosenliste auf', async () => {
    const aufrufe = dienst({ diagnosen: [], allergien: [], provenance: [] }, (a) =>
      a.pfad === `${DIENST}/$add-condition-entry`
        ? geschrieben(
            { resourceType: 'Condition', id: 'cond-neu', meta: { versionId: '1' } },
            'condition',
          )
        : undefined,
    );
    speicherStarten({ ...startzustand(), epaBefugnisse: [dauerhafteBefugnis('p-krueger')] });
    öffne('/patient/p-krueger/diagnosen');

    const block = await screen.findByRole('region', { name: 'Diagnosen' });
    const knoepfe = await within(block).findAllByRole('button', { name: 'in die ePA →' });
    fireEvent.click(knoepfe[0]!);

    expect(await screen.findByText(/in die Diagnosenliste der ePA aufgenommen/)).toBeDefined();
    const aufruf = aufrufe.find((a) => a.pfad.endsWith('/$add-condition-entry'))!;
    const parameter = (aufruf.koerper as { parameter: Record<string, unknown>[] }).parameter;
    // Lesenachweis: die Kennung des Chronologieeintrags, der beim Lesen galt.
    expect(parameter.find((p) => p['name'] === 'acknowledgedChronologyId')?.['valueId']).toBe(
      'chron-condition-1',
    );
    // Die Einrichtung steht im Header, als Base64-kodierte TIOrganization.
    const org = JSON.parse(atob(aufruf.kopf['X-Requesting-Organization']!)) as Ressource;
    expect(JSON.stringify(org['identifier'])).toContain('DEMO-PRAXIS-STADTGARTEN');
    const eingang = parameter.find((p) => p['name'] === 'conditionEntry') as {
      resource: Ressource;
    };
    const sct = (
      eingang.resource['code'] as { coding: { system: string; version?: string }[] }
    ).coding.find((k) => k.system === 'http://snomed.info/sct');
    // Ohne Versionsangabe würde der Dienst die SNOMED-CT-Kodierung abweisen (ti-condition-diagnosis).
    expect(sct?.version).toBeDefined();
    expect(lesen().diagnosen.some((d) => d.epaId === 'cond-neu')).toBe(true);
  });

  it('bietet „Keine bekannten Allergien" nur an, wo weder Praxis noch ePA eine Allergie führen', async () => {
    const aufrufe = dienst({ diagnosen: [], allergien: [], provenance: [] }, (a) =>
      a.pfad === `${DIENST}/$add-allergy-entry`
        ? geschrieben(
            { resourceType: 'AllergyIntolerance', id: 'allg-nka', meta: { versionId: '1' } },
            'allergy',
          )
        : undefined,
    );
    const z = startzustand();
    speicherStarten({
      ...z,
      allergien: z.allergien.filter((a) => a.patientId !== 'p-krueger'),
      epaBefugnisse: [dauerhafteBefugnis('p-krueger')],
    });
    öffne('/patient/p-krueger/diagnosen');

    fireEvent.click(
      await screen.findByRole('button', {
        name: '„Keine bekannten Allergien" in die ePA eintragen',
      }),
    );
    expect(await screen.findByText(/in die Allergienliste der ePA eingetragen/)).toBeDefined();
    const aufruf = aufrufe.find((a) => a.pfad.endsWith('/$add-allergy-entry'))!;
    expect(JSON.stringify(aufruf.koerper)).toContain('716186003');
  });

  it('sagt im Release 3.1.3, dass es die Listen nicht gibt', async () => {
    epaAttrappe((a) =>
      a.pfad === `${DIENST}/metadata`
        ? { status: 404, inhalt: { resourceType: 'OperationOutcome', issue: [] } }
        : undefined,
    );
    speicherStarten({ ...startzustand(), epaBefugnisse: [dauerhafteBefugnis('p-krueger')] });
    öffne('/patient/p-krueger/diagnosen');
    expect(await screen.findByText('Release 3.1.3:')).toBeDefined();

    fireEvent.change(screen.getByRole('combobox', { name: /Diagnose suchen/ }), {
      target: { value: 'Migräne' },
    });
    fireEvent.click(within(screen.getByRole('listbox')).getAllByRole('option')[0]!);
    const kaestchen = screen.getByRole('checkbox', {
      name: /In der Diagnosenliste der ePA führen/,
    }) as HTMLInputElement;
    expect(kaestchen.disabled).toBe(true);
    expect(screen.getByText('Release 3.1.3: keine Liste in der ePA.')).toBeDefined();
  });
});

describe('Erfassung mit der Diagnosenliste', () => {
  beforeEach(() => {
    klientZuruecksetzen();
    epaFensterSchliessen();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('belegt das Kästchen für Dauerdiagnosen vor und erlaubt bei „Aktiv" nur einen Beginn', async () => {
    const aufrufe = dienst({ diagnosen: [], allergien: [], provenance: [] }, (a) =>
      a.pfad === `${DIENST}/$add-condition-entry`
        ? geschrieben(
            { resourceType: 'Condition', id: 'cond-mig', meta: { versionId: '1' } },
            'condition',
          )
        : undefined,
    );
    speicherStarten({ ...startzustand(), epaBefugnisse: [dauerhafteBefugnis('p-krueger')] });
    öffne('/patient/p-krueger/diagnosen');
    await screen.findByText(/Listen der ePA/);

    fireEvent.change(screen.getByRole('combobox', { name: /Diagnose suchen/ }), {
      target: { value: 'Migräne' },
    });
    fireEvent.click(within(screen.getByRole('listbox')).getAllByRole('option')[0]!);

    const kaestchen = () =>
      screen.getByRole('checkbox', {
        name: /In der Diagnosenliste der ePA führen/,
      }) as HTMLInputElement;
    expect(kaestchen().disabled).toBe(false);
    expect(kaestchen().checked).toBe(false);
    fireEvent.change(screen.getByLabelText('Kategorie'), { target: { value: 'dauer' } });
    expect(kaestchen().checked).toBe(true);
    // Mit der Dauerdiagnose ist auch die Relevanz für die Patient Summary vorbelegt.
    const relevanz = screen.getByRole('checkbox', {
      name: /Relevant für die Patient Summary/,
    }) as HTMLInputElement;
    expect(relevanz.checked).toBe(true);

    expect((screen.getByLabelText('Zeitraum bis') as HTMLInputElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Klinischer Status'), { target: { value: 'behoben' } });
    expect((screen.getByLabelText('Zeitraum bis') as HTMLInputElement).disabled).toBe(false);
    fireEvent.change(screen.getByLabelText('Klinischer Status'), { target: { value: 'aktiv' } });

    // Speichern mit Kästchen: eine Handlung, zwei Wirkungen — Praxis und Liste.
    fireEvent.click(screen.getByRole('button', { name: 'Diagnose speichern' }));
    expect(await screen.findByText(/in die Diagnosenliste der ePA aufgenommen/)).toBeDefined();
    const aufruf = aufrufe.find((a) => a.pfad.endsWith('/$add-condition-entry'))!;
    expect(JSON.stringify(aufruf.koerper)).toContain(PS_RELEVANT_EXTENSION);
    expect(lesen().diagnosen.find((d) => d.epaId === 'cond-mig')?.art).toBe('dauer');
    expect(lesen().handlungen).toBe(1);
  });
});

describe('Relevanz für die Patient Summary', () => {
  beforeEach(() => {
    klientZuruecksetzen();
    epaFensterSchliessen();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('markiert einen Eintrag der Liste, ohne ihn aus der Liste zu nehmen', async () => {
    const z = { ...startzustand(), epaBefugnisse: [dauerhafteBefugnis('p-yildiz')] };
    const kvnr = z.patienten.find((p) => p.id === 'p-yildiz')!.versicherung.kvnr;
    const [erste, zweite] = z.diagnosen.filter((d) => d.patientId === 'p-yildiz');
    const markiert = psRelevanzSetzen(condition(erste!, erste!.epaId!, kvnr), true);
    const offen = condition(zweite!, zweite!.epaId!, kvnr);
    const aufrufe = dienst(
      {
        diagnosen: [markiert, offen],
        allergien: [],
        provenance: [markiert, offen].map((r) => provenance(r, PRAXIS, '2026-07-02T09:05:00')),
      },
      (a) =>
        a.pfad === `${DIENST}/$flag-condition-entry`
          ? geschrieben(psRelevanzSetzen({ ...offen, meta: { versionId: '2' } }, true), 'condition')
          : undefined,
    );
    speicherStarten(z);
    öffne('/patient/p-yildiz/diagnosen');

    const block = await screen.findByRole('region', { name: 'Diagnosen' });
    expect(await within(block).findByText(/1 in der Patient Summary/)).toBeDefined();
    const schalter = within(block).getAllByRole('button', { name: /Patient Summary/ });
    expect(schalter.map((b) => b.getAttribute('aria-pressed')).sort()).toEqual(['false', 'true']);
    // Farblich hervorgehoben ist nur der markierte Eintrag.
    expect(block.querySelectorAll('.split-karte.ps-markiert')).toHaveLength(1);

    fireEvent.click(schalter.find((b) => b.getAttribute('aria-pressed') === 'false')!);
    expect(await screen.findByText(/für die Patient Summary markiert/)).toBeDefined();
    const aufruf = aufrufe.find((a) => a.pfad.endsWith('/$flag-condition-entry'))!;
    const parameter = (aufruf.koerper as { parameter: Record<string, unknown>[] }).parameter;
    expect(parameter.find((p) => p['name'] === 'psRelevant')?.['valueBoolean']).toBe(true);
    expect(parameter.find((p) => p['name'] === 'acknowledgedChronologyId')?.['valueId']).toBe(
      'chron-condition-1',
    );
    expect(
      (parameter.find((p) => p['name'] === 'entry')?.['valueReference'] as { reference: string })
        .reference,
    ).toBe(`Condition/${String(offen.id)}`);
  });
});

describe('Kompakte Listen und ihre Ordnung', () => {
  beforeEach(() => {
    klientZuruecksetzen();
    epaFensterSchliessen();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('klappt einen Eintrag auf und merkt sich eine eigene Reihenfolge', async () => {
    const z = { ...startzustand(), epaBefugnisse: [dauerhafteBefugnis('p-yildiz')] };
    const kvnr = z.patienten.find((p) => p.id === 'p-yildiz')!.versicherung.kvnr;
    const eigene = z.diagnosen.filter((d) => d.patientId === 'p-yildiz');
    const verknuepfte = eigene.map((d) => condition(d, d.epaId!, kvnr));
    dienst({
      diagnosen: verknuepfte,
      allergien: [],
      provenance: [
        provenance(verknuepfte[0]!, PRAXIS, '2026-07-02T09:05:00'),
        provenance(verknuepfte[1]!, PRAXIS, '2026-07-03T09:05:00'),
      ],
    });
    speicherStarten(z);
    öffne('/patient/p-yildiz/diagnosen');
    await screen.findByText(/Listen der ePA/);
    const block = screen.getByRole('region', { name: 'Diagnosen' });
    const titel = () =>
      [...block.querySelectorAll('tbody tr')].map((t) =>
        t.querySelector('.kompakt-taste')?.textContent?.trim(),
      );
    const vorher = titel();
    expect(vorher[0]).toBe(eigene[1]!.bezeichnung);

    // Eine Zeile aufklappen: Details beider Seiten, darunter „bearbeiten".
    expect(within(block).queryByRole('button', { name: 'bearbeiten' })).toBeNull();
    const [taste] = within(block).getAllByRole('button', { name: eigene[1]!.bezeichnung });
    fireEvent.click(taste!);
    expect(taste!.getAttribute('aria-expanded')).toBe('true');
    expect(within(block).getAllByRole('button', { name: 'bearbeiten' })).toHaveLength(1);

    // Eigene Reihenfolge: den oberen Eintrag nach unten schieben.
    fireEvent.change(within(block).getByRole('combobox', { name: 'Sortierung' }), {
      target: { value: 'eigene' },
    });
    fireEvent.click(within(block).getAllByRole('button', { name: 'nach unten' })[0]!);
    expect(titel()).toEqual([vorher[1], vorher[0]]);
    const ordnung = lesen().listenordnung.find(
      (o) => o.patientId === 'p-yildiz' && o.liste === 'Condition',
    );
    expect(ordnung?.sortierung).toBe('eigene');
    expect(ordnung?.reihenfolge).toEqual([eigene[0]!.epaId, eigene[1]!.epaId]);
    // Die Reihenfolge ist eine Ansicht — keine Handlung.
    expect(lesen().handlungen).toBe(0);

    fireEvent.change(within(block).getByRole('combobox', { name: 'Sortierung' }), {
      target: { value: 'bezeichnung' },
    });
    expect(titel()).toEqual([...vorher].sort((x, y) => x!.localeCompare(y!, 'de')));
  });
});
