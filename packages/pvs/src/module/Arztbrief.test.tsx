import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ITI41_AKTION,
  diagnoseNachFhir,
  kimNachrichtLesen,
  provideAndRegisterLesen,
  registryResponseErzeugen,
} from '@demo-pvs/kern';
import { App } from '../App.js';
import { diagnosen, startzustand } from '../daten/startdaten.js';
import { ausfuehren, lesen, speicherStarten } from '../speicher/speicher.js';
import { vorgaenge } from '../speicher/vorgaenge.js';
import { epaFensterSchliessen } from '../epa/fenster.js';
import { klientZuruecksetzen } from '../epa/klient.js';
import { entwuerfeLeeren } from './arztbrief/entwurf.js';
import {
  dauerhafteBefugnis,
  epaAttrappe,
  suchergebnis,
  type Aufzeichnung,
} from '../testhilfe/epa-attrappe.js';

/**
 * ✦ Arztbrief: Alles Strukturierte aus Praxis und ePA steht je Abschnitt im Menü; Neues kommt
 * über seine Quelle. Nach der Unterschrift geht derselbe Brief über ITI-41 in die ePA und als
 * Client-Mail an das KIM-Clientmodul.
 */

const XDS = '/epa/xds-document/api/I_Document_Management';
const KIM = '/kim/demo/clientmodul/smtp';
const DIENST = '/epa/vorschlag/diagnosis/api/v1/fhir';

const PLAN = {
  resourceType: 'Bundle',
  type: 'collection',
  entry: [
    {
      resource: {
        resourceType: 'MedicationRequest',
        id: 'mr-1',
        status: 'active',
        intent: 'plan',
        medicationReference: { reference: 'Medication/med-1' },
        dosageInstruction: [{ text: '1-0-1-0' }],
        reasonCode: [{ text: 'Vorhofflimmern' }],
      },
    },
    {
      resource: {
        resourceType: 'Medication',
        id: 'med-1',
        code: { text: 'Apixaban 5 mg Filmtabletten' },
      },
    },
  ],
};

/** Ein Eintrag, der nur in der Diagnosenliste der ePA steht. */
const VORHOFFLIMMERN = diagnoseNachFhir(
  {
    ...diagnosen[0]!,
    id: 'cond-vhf',
    code: 'I48.1',
    bezeichnung: 'Vorhofflimmern, persistierend',
    snomed: null,
  },
  'A123456780',
);

/** Antwort einer schreibenden Operation der Diagnosenliste: Eintrag und Chronologieeintrag. */
function geschrieben(id: string, version: string) {
  return {
    status: 200,
    inhalt: {
      resourceType: 'Parameters',
      parameter: [
        {
          name: 'entry',
          resource: { resourceType: 'Condition', id, meta: { versionId: version } },
        },
        {
          name: 'relatedChronology',
          resource: {
            resourceType: 'Provenance',
            id: 'chron-2',
            extension: [
              {
                url: 'https://example.org/demo-pvs/fhir/StructureDefinition/is-condition-list-chronology',
                valueBoolean: true,
              },
            ],
            target: [{ reference: 'Patient/pat' }],
            recorded: '2026-09-01T10:00:00+02:00',
          },
        },
      ],
    },
  };
}

function attrappe(xds: 'erfolg' | 'fehler' = 'erfolg') {
  return epaAttrappe((a: Aufzeichnung) => {
    if (a.pfad === `${DIENST}/$add-condition-entry`) return geschrieben('cond-mig', '1');
    if (a.pfad === `${DIENST}/$update-condition-entry`) return geschrieben('cond-vhf', '2');
    if (a.pfad.endsWith('/patient-summary/api/v1/fhir/metadata'))
      return { status: 200, inhalt: { resourceType: 'CapabilityStatement' } };
    if (a.pfad === `${DIENST}/metadata`)
      return { status: 200, inhalt: { resourceType: 'CapabilityStatement' } };
    if (a.pfad === `${DIENST}/$condition-list`)
      return { status: 200, inhalt: suchergebnis([VORHOFFLIMMERN]) };
    if (a.pfad === `${DIENST}/$allergy-list`) return { status: 200, inhalt: suchergebnis([]) };
    if (a.pfad.includes('$medication-plan')) return { status: 200, inhalt: PLAN };
    if (a.pfad.includes('$medication-list')) return { status: 200, inhalt: suchergebnis([]) };
    if (a.pfad.startsWith('/epa/mhd/api/v1/fhir/DocumentReference'))
      return { status: 200, inhalt: suchergebnis([]) };
    if (a.pfad === XDS)
      return {
        status: 200,
        inhalt: registryResponseErzeugen(
          xds === 'erfolg'
            ? []
            : [{ code: 'XDSRegistryMetadataError', text: 'formatCode unbekannt' }],
          'x',
        ),
        kopf: { 'content-type': 'application/soap+xml; charset=utf-8' },
      };
    if (a.pfad === KIM)
      return {
        status: 200,
        inhalt: '250 2.0.0 Nachricht angenommen und zugestellt.',
        kopf: { 'content-type': 'text/plain; charset=utf-8' },
      };
    return undefined;
  });
}

function öffne() {
  return render(
    <MemoryRouter initialEntries={['/patient/p-hoffmann/arztbrief']}>
      <App />
    </MemoryRouter>,
  );
}

const imBrief = (titel: string) => screen.getByRole('list', { name: `${titel} im Brief` });

describe('Arztbrief', () => {
  beforeEach(() => {
    klientZuruecksetzen();
    epaFensterSchliessen();
    entwuerfeLeeren();
    speicherStarten({ ...startzustand(), epaBefugnisse: [dauerhafteBefugnis('p-hoffmann')] });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('wählt das Aktuelle der Praxis und den Medikationsplan vor — Behobenes und Nur-ePA nicht', async () => {
    attrappe();
    öffne();
    await within(await screen.findByRole('list', { name: 'Medikation im Brief' })).findByText(
      /Apixaban 5 mg Filmtabletten — 1-0-1-0/,
    );
    const dx = imBrief('Diagnosen');
    expect(within(dx).getByText(/I10\.90 G Essentielle Hypertonie/)).toBeTruthy();
    expect(within(dx).queryByText(/J20\.9/)).toBeNull();
    expect(within(dx).queryByText(/Vorhofflimmern/)).toBeNull();
  });

  it('bietet im Menü Praxis und ePA nach Quelle an; ein ePA-Eintrag lässt sich übernehmen', async () => {
    attrappe();
    öffne();
    fireEvent.click(await screen.findByRole('button', { name: 'Diagnosen auswählen' }));
    const menue = screen.getByRole('dialog', { name: 'Diagnosen auswählen' });
    const epa = await within(menue).findByRole('group', { name: /Diagnosenliste/ });
    const vhf = within(epa).getByRole('checkbox', {
      name: /I48\.1 G Vorhofflimmern/,
    }) as HTMLInputElement;
    expect(vhf.checked).toBe(false);
    expect(
      (within(menue).getByRole('group', { name: /Praxis\s+Diagnosen/ }) as HTMLElement).textContent,
    ).toContain('J20.9');
    fireEvent.click(vhf);
    expect(within(imBrief('Diagnosen')).getByText(/Vorhofflimmern/)).toBeTruthy();

    // Escape schließt das Menü und gibt den Fokus an den Knopf zurück.
    fireEvent.keyDown(menue, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Diagnosen auswählen' })).toBeNull();
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Diagnosen auswählen');
  });

  it('führt Neues über die Quelle und behält den Entwurf — Neues ist bei der Rückkehr gewählt', async () => {
    attrappe();
    const erst = öffne();
    fireEvent.click(await screen.findByRole('button', { name: 'Befunde auswählen' }));
    const verweis = screen.getByRole('link', { name: /Befund in der Karteikarte notieren/ });
    expect(verweis.getAttribute('href')).toBe('/patient/p-hoffmann/karteikarte');
    fireEvent.change(screen.getByLabelText('Beurteilung'), { target: { value: 'Echo erbeten.' } });
    erst.unmount();

    // In der Karteikarte notiert, dann zurück.
    act(() =>
      ausfuehren(vorgaenge.karteneintragAnlegen('p-hoffmann', 'B', 'Beinödeme beidseits.')),
    );
    öffne();
    const befunde = await screen.findByRole('list', { name: 'Befunde im Brief' });
    expect(within(befunde).getByText(/Beinödeme beidseits/)).toBeTruthy();
    expect(within(befunde).getByText('neu')).toBeTruthy();
    expect((screen.getByLabelText('Beurteilung') as HTMLTextAreaElement).value).toBe(
      'Echo erbeten.',
    );
    expect(screen.getByRole('link', { name: 'Arztbrief ✦ · Entwurf' })).toBeTruthy();
  });

  it('stellt den unterschriebenen Brief über ITI-41 ein und sendet ihn per KIM', async () => {
    const aufrufe = attrappe();
    öffne();
    await within(await screen.findByRole('list', { name: 'Medikation im Brief' })).findByText(
      /Apixaban 5 mg Filmtabletten — 1-0-1-0/,
    );
    fireEvent.change(screen.getByLabelText('Beurteilung'), {
      target: { value: 'Echokardiographie erbeten.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Unterschreiben' }));
    expect(screen.getByText('unterschrieben')).toBeTruthy();
    // Unterschrieben ist unterschrieben: keine Auswahl mehr.
    expect(screen.queryByRole('button', { name: 'Diagnosen auswählen' })).toBeNull();

    const brief = lesen().dokumente.find((d) => d.art === 'Arztbrief');
    expect(brief?.titel).toBe('Arztbrief an Kardiologische Praxis am Wall');
    expect(brief?.epaId).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'In die ePA einstellen' }));
    expect(await screen.findByText('in der ePA')).toBeTruthy();
    const xds = aufrufe.find((a) => a.pfad === XDS)!;
    expect(xds.kopf['content-type']).toContain(`action="${ITI41_AKTION}"`);
    expect(xds.kopf['x-insurantid']).toBe('A123456780');
    const einreichung = provideAndRegisterLesen(String(xds.koerper));
    expect(einreichung.patientId).toBe('A123456780^^^&1.2.276.0.76.4.8&ISO');
    const dokument = einreichung.dokumente[0]!;
    expect(dokument.classCode.code).toBe('BRI');
    expect(dokument.mimeType).toBe('application/fhir+json');
    expect(lesen().dokumente.find((d) => d.id === brief!.id)?.epaId).toBe(dokument.entryUuid);

    fireEvent.click(screen.getByRole('button', { name: 'Per KIM senden' }));
    expect(await screen.findByText('per KIM zugestellt')).toBeTruthy();
    const mail = kimNachrichtLesen(String(aufrufe.find((a) => a.pfad === KIM)!.koerper));
    expect(mail.kopf['x-kim-dienstkennung']).toBe('Arztbrief;VHitG-Versand;V1.2');
    expect(mail.kopf['to']).toBe('kardiologie.am-wall@demo-anbieter.kim.telematik');
    expect(mail.anhaenge.map((x) => x.mimeType)).toEqual([
      'application/pdf',
      'application/fhir+json',
    ]);
    expect(
      lesen().leistungen.some((l) => l.ziffer === '86900' && l.patientId === 'p-hoffmann'),
    ).toBe(true);
  });

  it('zeigt eine Ablehnung des Aktensystems am Knopf, nicht als Erfolg', async () => {
    attrappe('fehler');
    öffne();
    fireEvent.click(await screen.findByRole('button', { name: 'Unterschreiben' }));
    fireEvent.click(screen.getByRole('button', { name: 'In die ePA einstellen' }));
    expect(await screen.findByText(/XDSRegistryMetadataError/)).toBeTruthy();
    expect(screen.queryByText('in der ePA')).toBeNull();
  });

  it('bietet KIM nur an, wenn der Empfänger eine KIM-Adresse hat', async () => {
    attrappe();
    öffne();
    fireEvent.change(await screen.findByLabelText('An'), { target: { value: 'adr-brinkmann' } });
    fireEvent.click(screen.getByRole('button', { name: 'Unterschreiben' }));
    expect(
      (screen.getByRole('button', { name: 'Per KIM senden' }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it('lässt nur Ärztinnen und Ärzte unterschreiben', async () => {
    attrappe();
    speicherStarten({
      ...startzustand(),
      nutzer: startzustand().nutzerliste[1]!,
      epaBefugnisse: [dauerhafteBefugnis('p-hoffmann')],
    });
    öffne();
    expect(
      ((await screen.findByRole('button', { name: 'Unterschreiben' })) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(screen.getByText('nur ärztlich')).toBeTruthy();
  });

  it('legt eine Diagnose im Pop-up an ihrer Quelle an — in Praxis und Diagnosenliste, im Brief gewählt', async () => {
    const aufrufe = attrappe();
    öffne();
    fireEvent.click(await screen.findByRole('button', { name: '+ Neue Diagnose' }));
    const popup = screen.getByRole('dialog', { name: 'Diagnose dokumentieren' });
    fireEvent.change(within(popup).getByRole('combobox', { name: /Diagnose suchen/ }), {
      target: { value: 'Migräne' },
    });
    fireEvent.click(within(within(popup).getByRole('listbox')).getAllByRole('option')[0]!);
    fireEvent.change(within(popup).getByLabelText('Kategorie'), { target: { value: 'dauer' } });
    const kaestchen = within(popup).getByRole('checkbox', {
      name: /In der Diagnosenliste der ePA führen/,
    }) as HTMLInputElement;
    expect(kaestchen.checked).toBe(true);
    fireEvent.click(within(popup).getByRole('button', { name: 'Diagnose speichern' }));

    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Diagnose dokumentieren' })).toBeNull(),
    );
    expect(aufrufe.some((a) => a.pfad === `${DIENST}/$add-condition-entry`)).toBe(true);
    const neu = lesen().diagnosen.find((d) => d.epaId === 'cond-mig');
    expect(neu?.art).toBe('dauer');
    const dx = imBrief('Diagnosen');
    expect(within(dx).getByText(/Migräne/)).toBeTruthy();
    expect(within(dx).getByText('neu')).toBeTruthy();
  });

  it('ändert einen Eintrag, der nur in der ePA-Liste steht, im Pop-up — verknüpft übernommen und zurück übertragen', async () => {
    const aufrufe = attrappe();
    öffne();
    fireEvent.click(await screen.findByRole('button', { name: 'Diagnosen auswählen' }));
    const menue = screen.getByRole('dialog', { name: 'Diagnosen auswählen' });
    fireEvent.click(
      await within(menue).findByRole('button', { name: /I48\.1 G Vorhofflimmern.* ändern/ }),
    );
    expect(screen.queryByRole('dialog', { name: 'Diagnosen auswählen' })).toBeNull();
    const popup = screen.getByRole('dialog', { name: 'Diagnose aus der ePA ändern' });
    expect(
      (
        within(popup).getByRole('checkbox', {
          name: /Änderung in die Diagnosenliste der ePA übertragen/,
        }) as HTMLInputElement
      ).checked,
    ).toBe(true);
    fireEvent.change(within(popup).getByLabelText('Kategorie'), { target: { value: 'dauer' } });
    fireEvent.click(within(popup).getByRole('button', { name: 'Diagnose speichern' }));

    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Diagnose aus der ePA ändern' })).toBeNull(),
    );
    expect(aufrufe.some((a) => a.pfad === `${DIENST}/$update-condition-entry`)).toBe(true);
    expect(aufrufe.some((a) => a.pfad === `${DIENST}/$add-condition-entry`)).toBe(false);
    const lokal = lesen().diagnosen.filter((d) => d.epaId === 'cond-vhf');
    expect(lokal).toHaveLength(1);
    expect(lokal[0]!.art).toBe('dauer');
    expect(lokal[0]!.id).not.toBe('cond-vhf');
    // Im Brief steht der Eintrag jetzt bei der Praxis.
    const zeile = within(imBrief('Diagnosen'))
      .getByText(/Vorhofflimmern/)
      .closest('li')!;
    expect(zeile.textContent).toContain('Praxis');
  });

  it('zeigt Anlegen und Ändern nur in ärztlicher Rolle', async () => {
    attrappe();
    speicherStarten({
      ...startzustand(),
      nutzer: startzustand().nutzerliste[1]!,
      epaBefugnisse: [dauerhafteBefugnis('p-hoffmann')],
    });
    öffne();
    await screen.findByRole('button', { name: 'Diagnosen auswählen' });
    expect(screen.queryByRole('button', { name: '+ Neue Diagnose' })).toBeNull();
    expect(screen.queryByRole('button', { name: /ändern$/ })).toBeNull();
  });
});
