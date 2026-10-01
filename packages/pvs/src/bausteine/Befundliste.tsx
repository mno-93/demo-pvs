import type { AmtsBefund } from '@demo-pvs/kern';

/** Ergebnis der AMTS-Prüfung: je Befund Schwere, Art, Text und Grundlage. */
export function Befundliste({ befunde }: { befunde: AmtsBefund[] }) {
  if (befunde.length === 0) return <div className="hinweisbox gut">AMTS: ohne Befund</div>;
  return (
    <>
      {befunde.map((b, i) => (
        <div
          key={i}
          className={`hinweisbox ${b.schwere === 'hinweis' ? '' : b.schwere === 'warnung' ? 'warn' : 'fehler'}`}
        >
          <b>
            {b.schwere === 'kontraindiziert'
              ? 'Kontraindiziert'
              : b.schwere === 'warnung'
                ? 'Warnung'
                : 'Hinweis'}{' '}
            · {b.art}.
          </b>{' '}
          {b.text}
          <div style={{ marginTop: 3, fontSize: '0.85em' }}>Grundlage: {b.grundlage}</div>
        </div>
      ))}
    </>
  );
}
