/**
 * ✦ VORSCHLAG — Prüfung der Beschriftung eines Dokuments. Nicht spezifiziert.
 *
 * Viele Dokumente in der ePA sind in der Versorgung nicht nutzbar, weil ihre Metadaten nicht
 * sagen, worum es geht: der Dateiname des Scanners als Titel, „Befund“ ohne alles, das Datum
 * des Hochladens statt des Dokumentdatums, eine Abkürzung als Einrichtung. Wer die Liste liest,
 * öffnet so ein Dokument nicht — und übersieht, was darin steht.
 *
 * Diese Prüfung vergleicht die Metadaten mit dem, was im Dokument selbst steht, und sagt, was
 * nicht passt. Sie berichtigt nichts: Die Metadaten gehören der einstellenden Einrichtung.
 *
 * ⚠ Regelbasiert, über einfache Muster. Ein Dokument ohne lesbaren Text (Scan) lässt sich nur
 * an seinen Metadaten prüfen.
 */

/** Die Metadaten, wie sie die Dokumentenliste zeigt. */
export interface Beschriftungsangabe {
  titel: string;
  autor: string;
  einrichtung: string;
  /** ISO-Datum oder -Zeitpunkt der Erstellung laut Metadaten. */
  datum: string;
  /** Anzeige des classCode. */
  klasse?: string;
}

export interface Beschriftung {
  /** Mindestens ein Grund, warum die Metadaten nicht sagen, worum es geht. */
  unklar: boolean;
  gruende: string[];
  /** Was das Dokument über sich selbst sagt — sein Betreff, ohne den Namen der Person. */
  lautInhalt: string | null;
  /** Datum aus dem Betreff, als ISO-Datum. */
  datumLautInhalt: string | null;
  /** Die Zeile, aus der `lautInhalt` stammt — zum Markieren beim Öffnen. */
  beleg: string | null;
}

/** Titel, die nichts über den Inhalt sagen. */
const NICHTSSAGEND =
  /^(scan|img|image|foto|dokument|document|datei|befund|bericht|brief|anlage|unbenannt|neu|upload)\b[\s_\-.0-9]*$/i;
/** Dateinamen: lange Ziffernfolgen, Dateiendungen, Scannerpräfixe. */
const DATEINAME = /(^|[_-])\d{6,}|\.(pdf|jpe?g|tiff?|png)$|^(scan|img|dsc)[_-]/i;
/** Einrichtungen und Personen, die keine sind. */
const PLATZHALTER = /^(|unbekannt|praxis|klinik|mvz|anwender\s*\d*|benutzer\s*\d*|user\s*\d*)$/i;

/** Abkürzungen, die jede Praxis kennt — Rechts- und Kooperationsformen, keine Rätsel. */
const GELAEUFIG = new Set(['MVZ', 'BAG', 'ÜBAG']);

const DATUM = /(?<!geb\.\s?)(\d{2})\.(\d{2})\.(\d{4})/;

function tag(iso: string): string {
  return `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`;
}

function tageZwischen(a: string, b: string): number {
  return Math.abs(Date.parse(a.slice(0, 10)) - Date.parse(b.slice(0, 10))) / 86_400_000;
}

/** Der Betreff eines Dokuments: die erste Zeile mit Text, ohne den Teil mit dem Namen. */
function betreff(zeilen: readonly string[]): { text: string; zeile: string } | null {
  const zeile = zeilen.find((z) => z.trim());
  if (!zeile) return null;
  const teile = zeile.split(' — ').map((t) => t.trim());
  // Beginnt der Betreff mit der Person („Frau …, geb. …“), trägt der Rest den Inhalt.
  const text = /^(frau|herr)\b/i.test(teile[0] ?? '') ? (teile[1] ?? teile[0]!) : teile[0]!;
  return { text, zeile: zeile.trim() };
}

export function beschriftungPruefen(
  angabe: Beschriftungsangabe,
  zeilen: readonly string[],
): Beschriftung {
  const gruende: string[] = [];
  const titel = angabe.titel.trim();
  if (!titel || NICHTSSAGEND.test(titel) || DATEINAME.test(titel)) {
    gruende.push(`Der Titel „${titel || '—'}“ sagt nichts über den Inhalt`);
  }

  const autor = angabe.autor.trim();
  const einrichtung = angabe.einrichtung.trim();
  if (PLATZHALTER.test(autor) && PLATZHALTER.test(einrichtung)) {
    gruende.push('Verfasser und Einrichtung sind nicht erkennbar');
  } else if (PLATZHALTER.test(einrichtung)) {
    gruende.push('Die Einrichtung ist nicht erkennbar');
  } else {
    const abkuerzung = /^[A-ZÄÖÜ]{2,5}\b/.exec(einrichtung)?.[0];
    if (
      abkuerzung &&
      !GELAEUFIG.has(abkuerzung) &&
      abkuerzung.length === einrichtung.split(/\s+/)[0]!.length
    ) {
      gruende.push(`Die Einrichtung steht nur als Abkürzung da („${abkuerzung}“)`);
    }
  }

  const b = betreff(zeilen);
  const datum = b ? DATUM.exec(b.text) : null;
  const datumLautInhalt = datum ? `${datum[3]}-${datum[2]}-${datum[1]}` : null;

  if (datumLautInhalt && tageZwischen(angabe.datum, datumLautInhalt) > 31) {
    gruende.push(
      `Das Datum der Metadaten (${tag(angabe.datum)}) passt nicht zum Dokument (${tag(datumLautInhalt)})`,
    );
  } else if (/-01-01(T00:00(:00)?)?$/.test(angabe.datum)) {
    gruende.push(`Das Datum ${tag(angabe.datum)} wirkt wie ein Platzhalter`);
  }

  if (
    angabe.klasse === 'Administratives Dokument' &&
    b &&
    /befund|untersuchung|screening|sonographie|bericht|brief/i.test(b.text)
  ) {
    gruende.push('Die Dokumentklasse „Administratives Dokument“ passt nicht zum Inhalt');
  }

  return {
    unklar: gruende.length > 0,
    gruende,
    lautInhalt: b?.text ?? null,
    datumLautInhalt,
    beleg: b?.zeile ?? null,
  };
}
