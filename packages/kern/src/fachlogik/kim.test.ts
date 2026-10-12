import { describe, expect, it } from 'vitest';
import { KIM_DIENSTKENNUNG, kimNachrichtErzeugen, kimNachrichtLesen, mailDatum } from './kim.js';

const NACHRICHT = {
  von: 'praxis.stadtgarten@demo-anbieter.kim.telematik',
  an: ['kardiologie.am-wall@demo-anbieter.kim.telematik'],
  betreff: 'Arztbrief — Renate Hoffmann, geb. 14.03.1958',
  datum: '2026-09-09T11:00:00Z',
  nachrichtId: 'abc-123@demo-pvs',
  dienstkennung: KIM_DIENSTKENNUNG.arztbrief,
  sendersystem: 'Demo-PVS;V0.4.0',
  text: 'Sehr geehrter Herr Kollege,\nanbei der Arztbrief. Grüße',
  anhaenge: [
    {
      dateiname: 'arztbrief.pdf',
      mimeType: 'application/pdf',
      base64: btoa('%PDF-1.4 …'.replace('…', '...')),
    },
    {
      dateiname: 'arztbrief.json',
      mimeType: 'application/fhir+json',
      base64: btoa('{"resourceType":"Bundle"}'),
    },
  ],
};

describe('KIM Client-Mail', () => {
  it('trägt die Kopfzeilen der Spezifikation', () => {
    const roh = kimNachrichtErzeugen(NACHRICHT);
    expect(roh).toContain('X-KIM-Dienstkennung: Arztbrief;VHitG-Versand;V1.2\r\n');
    expect(roh).toContain('X-KIM-Sendersystem: Demo-PVS;V0.4.0\r\n');
    expect(roh).toContain('Date: Wed, 9 Sep 2026 11:00:00 +0000\r\n');
    // Umlaute im Betreff als „encoded word", nicht roh.
    expect(roh).toMatch(/Subject: =\?UTF-8\?B\?/);
  });

  it('liest Kopf, Text und Anhänge zurück', () => {
    const g = kimNachrichtLesen(kimNachrichtErzeugen(NACHRICHT));
    expect(g.kopf['x-kim-dienstkennung']).toBe('Arztbrief;VHitG-Versand;V1.2');
    expect(g.kopf['subject']).toBe(NACHRICHT.betreff);
    expect(g.text).toBe(NACHRICHT.text.replace(/\n/g, '\n'));
    expect(g.anhaenge.map((a) => [a.dateiname, a.mimeType])).toEqual([
      ['arztbrief.pdf', 'application/pdf'],
      ['arztbrief.json', 'application/fhir+json'],
    ]);
    expect(atob(g.anhaenge[1]!.base64)).toBe('{"resourceType":"Bundle"}');
  });

  it('schreibt das Datum nach RFC 5322', () => {
    expect(mailDatum('2026-01-02T03:04:05Z')).toBe('Fri, 2 Jan 2026 03:04:05 +0000');
  });
});
