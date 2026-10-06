import { useEffect, useMemo, useRef } from 'react';
import { pdfSeitenLesen, type Seite } from '@demo-pvs/kern';

/**
 * Ein PDF seitengetreu, mit markierten Stellen.
 *
 * Wer aus einer Antwort ins Dokument springt, will die Stelle sehen, auf der sie beruht — im
 * Dokument selbst, nicht in einem Auszug. Der eingebettete PDF-Betrachter des Browsers kann
 * nicht markieren; diese Ansicht zeichnet die Seiten aus der Datei nach und hinterlegt die
 * Zeilen, die zur Antwort gehören. Gelesen wird die Textebene des PDFs (`pdfSeitenLesen`).
 */
export function Seitenansicht({ seiten, markieren }: { seiten: Seite[]; markieren: string[] }) {
  const erste = useRef<SVGRectElement | null>(null);
  const rahmen = useRef<HTMLDivElement | null>(null);
  const muster = useMemo(
    () =>
      markieren
        .map(normal)
        .filter((m) => m.length >= 4)
        .map((m) => ({ ganz: m, fenster: wortfenster(m) })),
    [markieren],
  );
  // Eine Zeile der Seite ist markiert, wenn sie Teil einer belegenden Zeile ist, diese ganz
  // enthält oder mit ihr vier Wörter am Stück teilt — ein Satz kann über den Zeilenumbruch gehen.
  const markiert = (text: string) => {
    const t = normal(text);
    return (
      t.length >= 4 &&
      muster.some(
        (m) => m.ganz.includes(t) || t.includes(m.ganz) || m.fenster.some((f) => t.includes(f)),
      )
    );
  };

  // Zur ersten Markierung — nur innerhalb der Seitenansicht, nicht die Umgebung mitscrollen.
  useEffect(() => {
    const ziel = erste.current;
    const kasten = rahmen.current;
    if (!ziel || !kasten || typeof ziel.getBoundingClientRect !== 'function') return;
    const z = ziel.getBoundingClientRect();
    const k = kasten.getBoundingClientRect();
    kasten.scrollTop += z.top - k.top - k.height / 3;
    kasten.scrollLeft += Math.max(0, z.left - k.left - 16);
  }, [seiten, muster]);

  let ersteGesetzt = false;
  return (
    <div ref={rahmen} className="seitenansicht" aria-label="Dokument, Stellen zur Antwort markiert">
      {seiten.map((s, i) => (
        <svg
          key={i}
          className="seite"
          viewBox={`0 0 ${s.breite} ${s.hoehe}`}
          role="img"
          aria-label={`Seite ${i + 1} von ${seiten.length}`}
        >
          <rect width={s.breite} height={s.hoehe} fill="#ffffff" />
          {s.elemente.map((e, j) => {
            if (e.art === 'linie') {
              return (
                <line
                  key={j}
                  x1={e.x1}
                  y1={s.hoehe - e.y1}
                  x2={e.x2}
                  y2={s.hoehe - e.y2}
                  stroke={grauwert(e.grau)}
                  strokeWidth={0.5}
                />
              );
            }
            const mark = markiert(e.text);
            const setzeRef = mark && !ersteGesetzt;
            if (setzeRef) ersteGesetzt = true;
            return (
              <g key={j}>
                {mark && (
                  <rect
                    ref={setzeRef ? erste : undefined}
                    className="seiten-markierung"
                    x={e.x - 2}
                    y={s.hoehe - e.y - e.groesse * 0.85}
                    width={e.text.length * e.groesse * 0.5 + 4}
                    height={e.groesse * 1.15}
                    rx={1.5}
                  />
                )}
                <text
                  x={e.x}
                  y={s.hoehe - e.y}
                  fontSize={e.groesse}
                  fontWeight={e.fett ? 700 : 400}
                  fill={grauwert(e.grau)}
                  fontFamily="Helvetica, Arial, sans-serif"
                  xmlSpace="preserve"
                >
                  {e.text}
                </text>
              </g>
            );
          })}
        </svg>
      ))}
    </div>
  );
}

/** Folgen von vier Wörtern — kürzere Belege werden nur als Ganzes gesucht. */
function wortfenster(text: string): string[] {
  const woerter = text.split(' ');
  if (woerter.length < 4) return [];
  return woerter.slice(0, -3).map((_, i) => woerter.slice(i, i + 4).join(' '));
}

function normal(text: string): string {
  return text.replace(/\s+/g, ' ').trim().toLowerCase();
}

function grauwert(g: number): string {
  const v = Math.round(Math.min(Math.max(g, 0), 1) * 255);
  return `rgb(${v}, ${v}, ${v})`;
}

/** Liest eine PDF-Datei (Bytes als Zeichenkette) — `null`, wenn sie sich nicht nachzeichnen lässt. */
export function seitenAus(pdf: string | null): Seite[] | null {
  return pdf ? pdfSeitenLesen(pdf) : null;
}
