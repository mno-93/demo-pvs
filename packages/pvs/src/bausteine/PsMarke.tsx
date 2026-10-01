/**
 * ✦ Relevanz für die Patient Summary — überall in derselben Farbe, damit markierte Einträge in
 * Listen, Splitscreen und Patient Summary auf einen Blick zusammengehören (ADR 0022).
 */

/** Schalter an einem Listeneintrag: gehört er in die Patient Summary? */
export function PsSchalter({
  an,
  aendern,
  gesperrt = false,
  kompakt = false,
}: {
  an: boolean;
  aendern: (wert: boolean) => void;
  gesperrt?: boolean;
  /** Nur der Stern — für kompakte Listenzeilen. */
  kompakt?: boolean;
}) {
  return (
    <button
      type="button"
      className={`ps-schalter ${an ? 'an' : ''} ${kompakt ? 'kompakt' : ''}`}
      aria-pressed={an}
      aria-label={kompakt ? 'Patient Summary' : undefined}
      disabled={gesperrt}
      title={an ? 'Aus der Patient Summary nehmen' : 'Für die Patient Summary markieren'}
      onClick={() => aendern(!an)}
    >
      <span aria-hidden="true">{an ? '★' : '☆'}</span>
      {!kompakt && ' Patient Summary'}
    </button>
  );
}

/** Nur lesend: der Eintrag ist markiert. */
export function PsMarke({ kompakt = false }: { kompakt?: boolean }) {
  return (
    <span className="ps-marke" title="Patient Summary">
      <span aria-hidden="true">★</span>
      {kompakt ? <span className="unsichtbar"> Patient Summary</span> : ' Patient Summary'}
    </span>
  );
}
