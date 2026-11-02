/**
 * Dezimalzahlen mit ihrer Schreibweise.
 *
 * In FHIR trägt `decimal` seine Genauigkeit in der Schreibweise: „1.0“ ist nicht „1“ (R4,
 * Datentypen). JavaScript-Zahlen verlieren nachfolgende Nullen; die Referenz des
 * Dosierungstextes liest sie als Dezimalzahl und schreibt „1,0“. Wer JSON mit
 * `jsonMitSchreibweise` liest, findet die Schreibweise solcher Zahlen über
 * `schreibweise(objekt, feld)` — der Simulator rechnet damit den Text eines Primärsystems nach
 * wie der Dienst (ADR 0048).
 *
 * Die Schreibweise hängt am gelesenen Objekt. Wer es kopiert, verliert sie; dann gilt die Zahl.
 */

const SCHREIBWEISEN = new WeakMap<object, Map<string, string>>();

/** Wie `JSON.parse`; merkt sich Zahlen, deren Schreibweise JavaScript nicht wiedergibt. */
export function jsonMitSchreibweise(text: string): unknown {
  return JSON.parse(
    text,
    function (this: object, feld: string, wert: unknown, kontext?: { source?: string }) {
      // `kontext.source` gibt es ab Node 21 und in aktuellen Browsern; sonst bleibt es bei der Zahl.
      const quelle = kontext?.source;
      if (typeof wert === 'number' && quelle !== undefined && quelle !== String(wert)) {
        const zahlen = SCHREIBWEISEN.get(this) ?? new Map<string, string>();
        zahlen.set(feld, quelle);
        SCHREIBWEISEN.set(this, zahlen);
      }
      return wert;
    },
  );
}

/** Die Schreibweise der Zahl `objekt[feld]`, wenn sie beim Lesen von der Zahl abwich. */
export function schreibweise(objekt: unknown, feld: string): string | undefined {
  return typeof objekt === 'object' && objekt !== null
    ? SCHREIBWEISEN.get(objekt)?.get(feld)
    : undefined;
}
