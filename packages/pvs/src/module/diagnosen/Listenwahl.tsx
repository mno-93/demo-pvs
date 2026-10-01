/**
 * Die Fragen im laufenden Vorgang: Wird ein Eintrag in der Liste der ePA geführt — und gehört er
 * in die Patient Summary? ✦ Vorschlag (ADR 0018, 0022). Beides sind Kästchen in derselben Maske,
 * kein zweiter Dokumentationsschritt. Die Liste ist vollständig; die Markierung wählt aus, was
 * die Patient Summary zeigt.
 */

export interface Listenoption {
  /** Kann die Praxis jetzt in die Liste schreiben? */
  moeglich: boolean;
  /** Warum nicht — steht dann unter dem Kästchen. */
  grund: string | null;
  /** Der bearbeitete Eintrag ist mit der Liste verknüpft. */
  verknuepft: boolean;
  /** Einrichtung, die den verknüpften Eintrag in der ePA angelegt hat. */
  angelegtVon: string | null;
}

export const OHNE_LISTE: Listenoption = {
  moeglich: false,
  grund: null,
  verknuepft: false,
  angelegtVon: null,
};

export function Listenwahl({
  liste,
  option,
  gewaehlt,
  aendern,
  vorbelegung,
  markierung,
}: {
  /** „Diagnosenliste" oder „Allergienliste". */
  liste: string;
  option: Listenoption;
  gewaehlt: boolean;
  aendern: (wert: boolean) => void;
  /** Wofür das Kästchen von selbst angehakt ist, etwa „für Dauerdiagnosen". */
  vorbelegung: string;
  /** Relevanz für die Patient Summary — nur für neue Listeneinträge. */
  markierung?: { gewaehlt: boolean; aendern: (wert: boolean) => void; vorbelegung: string };
}) {
  const titel = option.verknuepft
    ? `Änderung in die ${liste} der ePA übertragen`
    : `In der ${liste} der ePA führen`;
  const text = !option.moeglich
    ? (option.grund ?? 'ePA nicht erreichbar.')
    : option.verknuepft
      ? `Angelegt von ${option.angelegtVon ?? 'unbekannt'}`
      : `Vorbelegt ${vorbelegung}`;
  const psMoeglich = option.moeglich && gewaehlt;
  return (
    <>
      <label className={`relevanzwahl ${option.moeglich ? '' : 'gesperrt'}`}>
        <input
          type="checkbox"
          checked={option.moeglich && gewaehlt}
          disabled={!option.moeglich}
          onChange={(ev) => aendern(ev.target.checked)}
        />
        <span>
          <b>{titel}</b> <span className="vorschlagsmarke">✦ Vorschlag</span>
          <small>{text}</small>
        </span>
      </label>
      {markierung && !option.verknuepft && (
        <label className={`relevanzwahl ps-wahl ${psMoeglich ? '' : 'gesperrt'}`}>
          <input
            type="checkbox"
            checked={psMoeglich && markierung.gewaehlt}
            disabled={!psMoeglich}
            onChange={(ev) => markierung.aendern(ev.target.checked)}
          />
          <span>
            <b>Relevant für die Patient Summary</b>
            <small>Vorbelegt {markierung.vorbelegung}</small>
          </span>
        </label>
      )}
    </>
  );
}
