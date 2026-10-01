import { istGegenwaertig, type Diagnose } from '../typen/diagnose.js';
import type { Leistungsziffer } from '../typen/leistung.js';

/**
 * Abrechnungsprüfung in stark vereinfachter Form.
 *
 * Der EBM kennt hunderte Ausschluss- und Kombinationsregeln. Hier sind nur die wenigen
 * abgebildet, die im Demo-Ablauf vorkommen und deren Verletzung eine sichtbare Rückmeldung
 * erzeugen soll. Das genügt, um zu zeigen, dass ein Praxissystem beim Erfassen mitdenkt —
 * es ersetzt keine Abrechnungsprüfung und darf nicht so verstanden werden.
 */

export type Meldungsart = 'fehler' | 'hinweis';

export interface Pruefmeldung {
  art: Meldungsart;
  text: string;
}

export interface Pruefumgebung {
  /** Bereits im selben Behandlungsfall erfasste Ziffern. */
  bestehende: readonly Leistungsziffer[];
  /** Diagnosen der Patientin oder des Patienten. */
  diagnosen: readonly Diagnose[];
  /** ISO-Datum der zu erfassenden Leistung. */
  datum: string;
}

const NUR_EINMAL_JE_FALL = new Set(['03000', '03220', '03221', '01732']);

export function pruefeLeistung(ziffer: string, umgebung: Pruefumgebung): Pruefmeldung[] {
  const meldungen: Pruefmeldung[] = [];
  const vorhanden = (z: string) => umgebung.bestehende.some((l) => l.ziffer === z);

  if (NUR_EINMAL_JE_FALL.has(ziffer) && vorhanden(ziffer)) {
    meldungen.push({
      art: 'fehler',
      text: `Die Ziffer ${ziffer} ist im Behandlungsfall nur einmal ansetzbar.`,
    });
  }

  if ((ziffer === '03220' || ziffer === '03221') && !vorhanden('03000')) {
    meldungen.push({
      art: 'fehler',
      text: `Die Ziffer ${ziffer} setzt die Versichertenpauschale 03000 im selben Fall voraus.`,
    });
  }

  if (ziffer === '03220') {
    const dauerdiagnosen = umgebung.diagnosen.filter(
      (d) =>
        d.art === 'dauer' && istGegenwaertig(d.klinischerStatus) && d.zusatzkennzeichen === 'G',
    );
    if (dauerdiagnosen.length === 0) {
      meldungen.push({
        art: 'fehler',
        text: 'Der Chronikerzuschlag setzt mindestens eine gesicherte, aktive Dauerdiagnose voraus.',
      });
    }
  }

  if (ziffer === '03221' && !vorhanden('03220')) {
    meldungen.push({
      art: 'fehler',
      text: 'Die Ziffer 03221 ist nur zusätzlich zur 03220 ansetzbar.',
    });
  }

  if (ziffer === '01411') {
    const besuchAmSelbenTag = umgebung.bestehende.some(
      (l) => l.ziffer === '01410' && l.datum === umgebung.datum,
    );
    if (besuchAmSelbenTag) {
      meldungen.push({
        art: 'fehler',
        text: 'Dringender Besuch (01411) und Besuch (01410) sind am selben Tag nicht nebeneinander ansetzbar.',
      });
    }
  }

  if (ziffer === '03230') {
    meldungen.push({
      art: 'hinweis',
      text: 'Das Gespräch ist je vollendete zehn Minuten ansetzbar. Dauer im Karteitext festhalten.',
    });
  }

  return meldungen;
}

export function istAnsetzbar(ziffer: string, umgebung: Pruefumgebung): boolean {
  return !pruefeLeistung(ziffer, umgebung).some((m) => m.art === 'fehler');
}
