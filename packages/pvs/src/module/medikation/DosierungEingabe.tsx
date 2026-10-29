import { useId, useMemo } from 'react';
import {
  DOSIEREINHEITEN,
  STUECK,
  WOCHENTAGE,
  WOCHENTAG_KURZ,
  alsTabelle,
  dosierungNachFhir,
  dosierungAlsText,
  dosierungPruefen,
  mitHinweis,
  mitZeitraum,
  type Dosierschema,
  type Dosierung,
  type Intervalleinheit,
} from '@demo-pvs/kern';

/**
 * Strukturierte Dosierung nach `DosageDgMP` (Medication IG DE 2.0.0-ballot): Schema wählen,
 * Angaben erfassen, der Text nach Algorithmus 2.0.0 steht darunter — so, wie er auf dem
 * Medikationsplan erscheint und wie ihn der Medication Service nachrechnet.
 */

type Art = Dosierschema['art'];

const ARTEN: [Art, string][] = [
  ['tageszeiten', 'morgens-mittags-abends-nachts'],
  ['uhrzeiten', 'Uhrzeiten'],
  ['wochentage', 'Wochentage'],
  ['intervall', 'Intervall'],
  ['bedarf', 'bei Bedarf'],
  ['freitext', 'Freitext'],
];

const INTERVALL: [Intervalleinheit, string][] = [
  ['h', 'Stunden'],
  ['d', 'Tage'],
  ['wk', 'Wochen'],
  ['mo', 'Monate'],
];

const ABSCHNITT = ['morgens', 'mittags', 'abends', 'nachts'] as const;

export const DOSIERUNG_VORGABE: Dosierung = {
  schema: { art: 'tageszeiten', mengen: [1, 0, 0, 0] },
  einheit: STUECK,
};

function schemaFuer(art: Art, vorher: Dosierschema): Dosierschema {
  const menge =
    vorher.art === 'tageszeiten'
      ? (vorher.mengen.find((m) => m > 0) ?? 1)
      : vorher.art === 'intervall' || vorher.art === 'bedarf'
        ? vorher.menge
        : vorher.art === 'freitext'
          ? 1
          : (vorher.gaben[0]?.menge ?? 1);
  switch (art) {
    case 'tageszeiten':
      return { art, mengen: [menge, 0, 0, 0] };
    case 'uhrzeiten':
      return { art, gaben: [{ uhrzeit: '08:00', menge }] };
    case 'wochentage':
      return { art, gaben: [{ tag: 'mon', menge }] };
    case 'intervall':
      return { art, alle: 8, einheit: 'h', menge };
    case 'bedarf':
      return { art, menge };
    case 'freitext':
      return { art, text: '' };
  }
}

/** Zahl aus einem Eingabefeld; Komma wie Punkt. */
const zahl = (s: string) => {
  const n = Number(s.replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};
const feldwert = (n: number | null | undefined) => (n ? String(n).replace('.', ',') : '');

function Mengenfeld({
  id,
  wert,
  setze,
  beschriftung,
}: {
  id: string;
  wert: number | null | undefined;
  setze: (n: number) => void;
  beschriftung: string;
}) {
  return (
    <div className="feldzeile" style={{ flex: '0 1 88px' }}>
      <label htmlFor={id}>{beschriftung}</label>
      <input
        id={id}
        type="text"
        inputMode="decimal"
        value={feldwert(wert)}
        placeholder="0"
        onChange={(e) => setze(zahl(e.target.value))}
      />
    </div>
  );
}

export function DosierungEingabe({
  wert,
  setze,
}: {
  wert: Dosierung;
  setze: (d: Dosierung) => void;
}) {
  const id = useId();
  const s = wert.schema;
  const neu = (schema: Dosierschema) => setze({ ...wert, schema });
  const befunde = useMemo(() => dosierungPruefen(wert), [wert]);
  const text = useMemo(() => {
    try {
      return befunde.length === 0 ? dosierungAlsText(wert) : null;
    } catch {
      return null;
    }
  }, [wert, befunde]);

  return (
    <fieldset className="feldgruppe" aria-describedby={`${id}-text`}>
      <legend>Dosierung</legend>
      <div className="feldreihe">
        <div className="feldzeile" style={{ flex: '1 1 200px' }}>
          <label htmlFor={`${id}-art`}>Schema</label>
          <select
            id={`${id}-art`}
            value={s.art}
            onChange={(e) => {
              const art = e.target.value as Art;
              setze({
                ...wert,
                schema: schemaFuer(art, s),
                ...(mitZeitraum(schemaFuer(art, s)) ? {} : { von: null, bis: null }),
              });
            }}
          >
            {ARTEN.map(([a, b]) => (
              <option key={a} value={a}>
                {b}
              </option>
            ))}
          </select>
        </div>
        {s.art !== 'freitext' && (
          <div className="feldzeile" style={{ flex: '0 1 160px' }}>
            <label htmlFor={`${id}-einheit`}>Einheit</label>
            <select
              id={`${id}-einheit`}
              value={wert.einheit.code}
              onChange={(e) =>
                setze({
                  ...wert,
                  einheit: DOSIEREINHEITEN.find((x) => x.code === e.target.value) ?? STUECK,
                })
              }
            >
              {DOSIEREINHEITEN.map((x) => (
                <option key={x.code} value={x.code}>
                  {x.anzeige}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {s.art === 'tageszeiten' && (
        <div className="feldreihe">
          {ABSCHNITT.map((b, i) => (
            <Mengenfeld
              key={b}
              id={`${id}-${b}`}
              beschriftung={b}
              wert={s.mengen[i]}
              setze={(n) =>
                neu({
                  ...s,
                  mengen: s.mengen.map((m, j) => (j === i ? n : m)) as unknown as [
                    number,
                    number,
                    number,
                    number,
                  ],
                })
              }
            />
          ))}
        </div>
      )}

      {s.art === 'uhrzeiten' && (
        <>
          {s.gaben.map((g, i) => (
            <div className="feldreihe" key={i}>
              <div className="feldzeile" style={{ flex: '0 1 120px' }}>
                <label htmlFor={`${id}-zeit-${i}`}>Uhrzeit</label>
                <input
                  id={`${id}-zeit-${i}`}
                  type="time"
                  value={g.uhrzeit}
                  onChange={(e) =>
                    neu({
                      ...s,
                      gaben: s.gaben.map((x, j) =>
                        j === i ? { ...x, uhrzeit: e.target.value } : x,
                      ),
                    })
                  }
                />
              </div>
              <Mengenfeld
                id={`${id}-zeitmenge-${i}`}
                beschriftung="Menge"
                wert={g.menge}
                setze={(n) =>
                  neu({ ...s, gaben: s.gaben.map((x, j) => (j === i ? { ...x, menge: n } : x)) })
                }
              />
              {s.gaben.length > 1 && (
                <button
                  type="button"
                  className="knopf klein"
                  style={{ alignSelf: 'flex-end' }}
                  aria-label={`Uhrzeit ${g.uhrzeit} entfernen`}
                  onClick={() => neu({ ...s, gaben: s.gaben.filter((_, j) => j !== i) })}
                >
                  entfernen
                </button>
              )}
            </div>
          ))}
          <button
            type="button"
            className="knopf klein"
            onClick={() =>
              neu({
                ...s,
                gaben: [...s.gaben, { uhrzeit: '20:00', menge: s.gaben[0]?.menge ?? 1 }],
              })
            }
          >
            + Uhrzeit
          </button>
        </>
      )}

      {s.art === 'wochentage' && (
        <div className="feldreihe">
          {WOCHENTAGE.map((tag) => (
            <Mengenfeld
              key={tag}
              id={`${id}-${tag}`}
              beschriftung={WOCHENTAG_KURZ[tag]}
              wert={s.gaben.find((g) => g.tag === tag)?.menge}
              setze={(n) =>
                neu({
                  ...s,
                  gaben: [
                    ...s.gaben.filter((g) => g.tag !== tag),
                    ...(n > 0 ? [{ tag, menge: n }] : []),
                  ],
                })
              }
            />
          ))}
        </div>
      )}

      {s.art === 'intervall' && (
        <div className="feldreihe">
          <div className="feldzeile" style={{ flex: '0 1 88px' }}>
            <label htmlFor={`${id}-alle`}>alle</label>
            <input
              id={`${id}-alle`}
              type="number"
              min={1}
              step={1}
              value={s.alle}
              onChange={(e) => neu({ ...s, alle: zahl(e.target.value) })}
            />
          </div>
          <div className="feldzeile" style={{ flex: '0 1 140px' }}>
            <label htmlFor={`${id}-takt`}>Zeiteinheit</label>
            <select
              id={`${id}-takt`}
              value={s.einheit}
              onChange={(e) => neu({ ...s, einheit: e.target.value as Intervalleinheit })}
            >
              {INTERVALL.map(([c, b]) => (
                <option key={c} value={c}>
                  {b}
                </option>
              ))}
            </select>
          </div>
          <Mengenfeld
            id={`${id}-imenge`}
            beschriftung="Menge je Gabe"
            wert={s.menge}
            setze={(n) => neu({ ...s, menge: n })}
          />
        </div>
      )}

      {s.art === 'bedarf' && (
        <>
          <div className="feldreihe">
            <div className="feldzeile" style={{ flex: '2 1 200px' }}>
              <label htmlFor={`${id}-anlass`}>Anlass</label>
              <input
                id={`${id}-anlass`}
                type="text"
                value={s.anlass ?? ''}
                placeholder="z. B. Schmerzen"
                onChange={(e) => neu({ ...s, anlass: e.target.value })}
              />
            </div>
            <Mengenfeld
              id={`${id}-bmenge`}
              beschriftung="Menge je Gabe"
              wert={s.menge}
              setze={(n) => neu({ ...s, menge: n })}
            />
            <Mengenfeld
              id={`${id}-bbis`}
              beschriftung="bis"
              wert={s.mengeBis}
              setze={(n) => neu({ ...s, mengeBis: n || null })}
            />
          </div>
          <div className="feldreihe">
            <Mengenfeld
              id={`${id}-abstand`}
              beschriftung="Abstand mind. (Std.)"
              wert={s.mindestabstandStunden}
              setze={(n) => neu({ ...s, mindestabstandStunden: n || null })}
            />
            <Mengenfeld
              id={`${id}-max`}
              beschriftung="höchstens pro Tag"
              wert={s.hoechstensProTag}
              setze={(n) => neu({ ...s, hoechstensProTag: n || null })}
            />
          </div>
        </>
      )}

      {s.art === 'freitext' && (
        <div className="feldzeile">
          <label htmlFor={`${id}-frei`}>Text</label>
          <input
            id={`${id}-frei`}
            type="text"
            value={s.text}
            onChange={(e) => neu({ ...s, text: e.target.value })}
          />
        </div>
      )}

      {(mitZeitraum(s) || mitHinweis(s)) && (
        <div className="feldreihe">
          {mitZeitraum(s) && (
            <>
              <div className="feldzeile" style={{ flex: '0 1 150px' }}>
                <label htmlFor={`${id}-von`}>ab</label>
                <input
                  id={`${id}-von`}
                  type="date"
                  value={wert.von ?? ''}
                  onChange={(e) => setze({ ...wert, von: e.target.value || null })}
                />
              </div>
              <div className="feldzeile" style={{ flex: '0 1 150px' }}>
                <label htmlFor={`${id}-bis`}>bis</label>
                <input
                  id={`${id}-bis`}
                  type="date"
                  value={wert.bis ?? ''}
                  onChange={(e) => setze({ ...wert, bis: e.target.value || null })}
                />
              </div>
            </>
          )}
          {mitHinweis(s) && (
            <div className="feldzeile" style={{ flex: '2 1 220px' }}>
              <label htmlFor={`${id}-hinweis`}>Hinweis für Patient:in</label>
              <input
                id={`${id}-hinweis`}
                type="text"
                value={wert.hinweis ?? ''}
                placeholder="z. B. nach dem Essen"
                onChange={(e) => setze({ ...wert, hinweis: e.target.value || null })}
              />
            </div>
          )}
        </div>
      )}

      <div id={`${id}-text`} className="reihe" style={{ gap: 6, marginTop: 4 }}>
        {text !== null ? (
          <>
            <span className="leise-klein">auf dem Plan</span>
            <span className="code" data-testid="dosierungstext">
              {text}
            </span>
          </>
        ) : (
          befunde.map((b) => (
            <span key={b} className="marker fehler">
              {b}
            </span>
          ))
        )}
      </div>
    </fieldset>
  );
}

/** Ob die Dosierung aufgenommen werden kann. */
export function dosierungGueltig(d: Dosierung): boolean {
  return dosierungPruefen(d).length === 0;
}

const ABSCHNITT_KURZ = ['mo', 'mi', 'ab', 'na'] as const;

/**
 * Dosierung im Plan: einfache Tagesschemata als morgens-mittags-abends-nachts-Tabelle, alles
 * andere als erzeugter Text („Darstellung von Dosierungsinformationen", IG 1.4.0-ballot.1).
 */
export function DosierungAnzeige({ text, dosis }: { text: string; dosis?: Dosierung | null }) {
  const werte = dosis ? alsTabelle(dosierungNachFhir(dosis)) : null;
  if (!werte || !dosis) return <span className="code dosistext">{text}</span>;
  const zahl = (n: number) => String(n).replace('.', ',');
  return (
    <span className="dosisschema" title={text}>
      <table aria-label={text}>
        <thead>
          <tr>
            {ABSCHNITT_KURZ.map((a) => (
              <th key={a} scope="col">
                {a}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            {werte.map((w, i) => (
              <td key={i}>{zahl(w)}</td>
            ))}
          </tr>
        </tbody>
      </table>
      <span className="leise-klein">{dosis.einheit.anzeige}</span>
    </span>
  );
}
