import { kimNachrichtErzeugen, type KimNachricht, WEG } from '@demo-pvs/kern';
import { GRUNDLAGE, anfragen } from '../klient.js';

/**
 * KIM-Clientmodul (⚠ Demo-Ersatz): Nachricht als `message/rfc822` per HTTP statt SMTP. KIM ist kein
 * Teil der ePA; der Arztbrief geht auf diesem Weg an die mitbehandelnde Praxis.
 */

/** ✦ Demo-Ersatz für SMTP an das KIM-Clientmodul — siehe `epa-sim/src/kim.ts`. */
export const KIM_CLIENTMODUL = WEG.kim;

/** Übergibt eine Client-Mail an das Clientmodul. Antwort: die SMTP-Statuszeile. */
export async function kimSenden(nachricht: KimNachricht): Promise<string> {
  const { inhalt } = await anfragen<string>({
    methode: 'POST',
    pfad: KIM_CLIENTMODUL,
    grundlage: GRUNDLAGE.kim,
    roh: { inhaltstyp: 'message/rfc822', text: kimNachrichtErzeugen(nachricht) },
  });
  return inhalt;
}

/* ---------- ✦ Patient Summary ---------- */
