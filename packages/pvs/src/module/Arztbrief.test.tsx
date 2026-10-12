import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ITI41_AKTION,
  kimNachrichtLesen,
  provideAndRegisterLesen,
  registryResponseErzeugen,
} from '@demo-pvs/kern';
import { App } from '../App.js';
import { startzustand } from '../daten/startdaten.js';
import { lesen, speicherStarten } from '../speicher/speicher.js';
import { epaFensterSchliessen } from '../epa/fenster.js';
import { klientZuruecksetzen } from '../epa/klient.js';
import {
  dauerhafteBefugnis,
  epaAttrappe,
  suchergebnis,
  type Aufzeichnung,
} from '../testhilfe/epa-attrappe.js';

/**
 * ✦ Arztbrief: Was dokumentiert ist, steht zur Auswahl; nach der Unterschrift geht derselbe Brief
 * über ITI-41 in die ePA und als Client-Mail an das KIM-Clientmodul.
 */

const XDS = '/epa/xds-document/api/I_Document_Management';
const KIM = '/kim/demo/clientmodul/smtp';

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

function attrappe(xds: 'erfolg' | 'fehler' = 'erfolg') {
  return epaAttrappe((a: Aufzeichnung) => {
    if (a.pfad.endsWith('/patient-summary/api/v1/fhir/metadata'))
      return { status: 200, inhalt: { resourceType: 'CapabilityStatement' } };
    if (a.pfad.includes('$medication-plan')) return { status: 200, inhalt: PLAN };
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

describe('Arztbrief', () => {
  beforeEach(() => {
    klientZuruecksetzen();
    epaFensterSchliessen();
    speicherStarten({ ...startzustand(), epaBefugnisse: [dauerhafteBefugnis('p-hoffmann')] });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('wählt Dauerdiagnosen, aktive Allergien und den Medikationsplan vor — Behobenes nicht', async () => {
    attrappe();
    öffne();
    const diagnosen = await screen.findByRole('group', { name: 'Diagnosen' });
    expect(
      (within(diagnosen).getByLabelText(/I10\.90 G Essentielle Hypertonie/) as HTMLInputElement)
        .checked,
    ).toBe(true);
    expect(
      (within(diagnosen).getByLabelText(/J20\.9 G Akute Bronchitis/) as HTMLInputElement).checked,
    ).toBe(false);
    const medikation = screen.getByRole('group', { name: /Medikation/ });
    expect(
      (
        (await within(medikation).findByLabelText(
          'Apixaban 5 mg Filmtabletten — 1-0-1-0 — Grund: Vorhofflimmern',
          { exact: false },
        )) as HTMLInputElement
      ).checked,
    ).toBe(true);
  });

  it('stellt den unterschriebenen Brief über ITI-41 ein und sendet ihn per KIM', async () => {
    const aufrufe = attrappe();
    öffne();
    await screen.findByRole('group', { name: 'Diagnosen' });
    fireEvent.change(screen.getByLabelText('Beurteilung'), {
      target: { value: 'Echokardiographie erbeten.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Unterschreiben' }));
    expect(screen.getByText('unterschrieben')).toBeTruthy();

    // Abgelegt in der Praxis, bevor es irgendwohin geht.
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
    // Die Praxisablage kennt jetzt die entryUUID — „lokal, in ePA eingestellt".
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
    await screen.findByRole('group', { name: 'Diagnosen' });
    fireEvent.click(screen.getByRole('button', { name: 'Unterschreiben' }));
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
});
