import type { FastifyInstance } from 'fastify';
import {
  ADRESSBUCH,
  KIM_DIENSTKENNUNG,
  KIM_GRENZE_BYTES,
  KIM_PRAXIS,
  kimNachrichtLesen,
} from '@demo-pvs/kern';
import { jetzt } from './fhir-hilfen.ts';

/**
 * Demo-Ersatz für das **KIM-Clientmodul** — keine KIM-Schnittstelle.
 *
 * Im Wirkbetrieb übergibt das Praxissystem die Client-Mail per SMTP an das Clientmodul; das
 * Clientmodul prüft den Absender gegen den SMTP-Benutzernamen (A_21519-02), sucht die
 * Zertifikate der Empfangenden im Verzeichnisdienst, signiert und verschlüsselt nach S/MIME und
 * reicht die Nachricht an den Fachdienst weiter (`gemSpec_CM_KOMLE` V1.16.6). Ein Browser
 * spricht kein SMTP. Die Demo nimmt die Client-Mail deshalb per HTTP entgegen — als
 * `message/rfc822`, Byte für Byte die Nachricht, die über SMTP ginge — und antwortet mit dem
 * SMTP-Statuscode, den das Clientmodul gäbe.
 *
 * Geprüft wird: Absender ist die eigene Adresse; jede Empfangsadresse steht im Verzeichnis
 * (sonst 550, wie ein Clientmodul ohne Zertifikat für den Empfänger); die Nachricht ist nicht
 * größer als 15 MiB (darüber ginge sie über den Anhangsdienst, ⚠ nicht nachgebildet). Fehlt
 * `X-KIM-Dienstkennung`, setzt das Clientmodul den Standardwert (A_19488-02).
 *
 * ⚠ Nicht nachgebildet: S/MIME, Verzeichnisdienst (LDAP), Anhangsdienst, Empfangsseite und
 * Eingangsbestätigung. Zugestellte Nachrichten liegen in einem Postausgang der Demo-Steuerung.
 */

export const KIM_WEG = '/kim/demo/clientmodul/smtp';
export const KIM_POSTAUSGANG = '/verwaltung/kim/postausgang';

export interface Zustellung {
  zeitpunkt: string;
  von: string;
  an: string[];
  betreff: string;
  dienstkennung: string;
  sendersystem: string;
  anhaenge: { dateiname: string; mimeType: string; bytes: number }[];
  groesseBytes: number;
}

const postausgang: Zustellung[] = [];

export function postausgangLeeren(): void {
  postausgang.length = 0;
}

const adresse = (t: string) => /<([^>]+)>/.exec(t)?.[1] ?? t.trim();

export function kimEinhaengen(app: FastifyInstance): void {
  app.post(KIM_WEG, async (anfrage, antwort) => {
    const roh = typeof anfrage.body === 'string' ? anfrage.body : '';
    const smtp = (code: number, http: number, text: string) =>
      antwort
        .code(http)
        .header('content-type', 'text/plain; charset=utf-8')
        .send(`${code} ${text}`);
    if (!String(anfrage.headers['content-type'] ?? '').startsWith('message/rfc822') || !roh)
      return smtp(500, 400, '5.5.2 Erwartet wird eine Nachricht als message/rfc822.');
    if (roh.length > KIM_GRENZE_BYTES)
      return smtp(
        552,
        413,
        '5.3.4 Größer als 15 MiB — Versand über den Anhangsdienst nicht nachgebildet.',
      );

    let n;
    try {
      n = kimNachrichtLesen(roh);
    } catch {
      return smtp(500, 400, '5.6.0 Nachricht nicht lesbar.');
    }
    const von = adresse(n.kopf['from'] ?? '');
    if (von !== KIM_PRAXIS)
      return smtp(
        553,
        403,
        `5.7.1 Absender ${von || '(leer)'} passt nicht zum angemeldeten Konto.`,
      );
    const an = (n.kopf['to'] ?? '').split(',').map(adresse).filter(Boolean);
    if (an.length === 0) return smtp(554, 422, '5.5.1 Keine Empfangsadresse.');
    const bekannt = new Set(ADRESSBUCH.map((e) => e.kim).filter(Boolean));
    const unbekannt = an.filter((a) => !bekannt.has(a));
    if (unbekannt.length > 0)
      return smtp(550, 422, `5.1.1 Kein Eintrag im Verzeichnisdienst für ${unbekannt.join(', ')}.`);

    postausgang.unshift({
      zeitpunkt: jetzt(),
      von,
      an,
      betreff: n.kopf['subject'] ?? '',
      dienstkennung: n.kopf['x-kim-dienstkennung'] ?? KIM_DIENSTKENNUNG.standard,
      sendersystem: n.kopf['x-kim-sendersystem'] ?? '',
      anhaenge: n.anhaenge.map((a) => ({
        dateiname: a.dateiname,
        mimeType: a.mimeType,
        bytes: Math.floor((a.base64.length * 3) / 4),
      })),
      groesseBytes: roh.length,
    });
    return smtp(250, 200, '2.0.0 Nachricht angenommen und zugestellt.');
  });

  app.get(KIM_POSTAUSGANG, async () => postausgang);
}
