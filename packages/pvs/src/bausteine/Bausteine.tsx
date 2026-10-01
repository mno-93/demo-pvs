import type { ReactNode } from 'react';

type Ton = 'neutral' | 'akzent' | 'lokal' | 'warn' | 'gut' | 'fehler';

export function Marker({
  ton = 'neutral',
  titel,
  children,
}: {
  ton?: Ton;
  /** Erläuterung beim Überfahren — ergänzt, ersetzt aber nie den sichtbaren Text. */
  titel?: string;
  children: ReactNode;
}) {
  return (
    <span className={`marker ${ton}`} title={titel}>
      {children}
    </span>
  );
}

export function Leer({ children }: { children: ReactNode }) {
  return <div className="leer">{children}</div>;
}

export function Karte({
  titel,
  werkzeuge,
  children,
}: {
  titel?: string;
  werkzeuge?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="karte">
      {(titel || werkzeuge) && (
        <div className="reihe" style={{ marginBottom: 10 }}>
          {titel && <h3>{titel}</h3>}
          {werkzeuge && <div className="rechts reihe">{werkzeuge}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

export type Bestandslage = 'lokal' | 'epa' | 'beides';

const BESTANDSTEXT: Record<Bestandslage, { titel: string; farbe: string }> = {
  lokal: { titel: 'Praxissystem', farbe: 'lokal' },
  epa: { titel: 'elektronische Patientenakte (ePA)', farbe: 'epa' },
  beides: { titel: 'Praxissystem und ePA', farbe: 'beides' },
};

/**
 * Sagt auf jedem Bildschirm, in welchem Bestand gerade gearbeitet wird.
 *
 * Ohne diese Angabe ist die Anwendung an der entscheidenden Stelle stumm: Zwei Bestände
 * mit ähnlich aussehenden Listen sind nur dann auseinanderzuhalten, wenn es jemand sagt.
 * Die Farbe allein trägt die Aussage nicht — sie steht immer zusammen mit dem Wort.
 */
export function Bestandsband({ lage, children }: { lage: Bestandslage; children?: ReactNode }) {
  const angabe = BESTANDSTEXT[lage];
  return (
    <div className={`bestandsband ${angabe.farbe}`}>
      <span className="bestandsband-titel">{angabe.titel}</span>
      {children && <span className="bestandsband-text">{children}</span>}
    </div>
  );
}
