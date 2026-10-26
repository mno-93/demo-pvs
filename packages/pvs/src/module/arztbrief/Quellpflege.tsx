import { useEffect, useRef, useState } from 'react';
import type { Allergie, Diagnose, Patient } from '@demo-pvs/kern';
import { useZustand } from '../../speicher/speicher.js';
import type { Ladezustand } from '../../epa/epa-bestand.js';
import type { EpaListen, Listenlage } from '../../epa/listen.js';
import { DiagnoseFormular, leererEntwurf } from '../diagnosen/DiagnoseFormular.js';
import { AllergieFormular, leererAllergieentwurf } from '../diagnosen/AllergieFormular.js';
import { useListenpflege, type Pflegeart } from '../diagnosen/listenpflege.js';
import type { Angebot } from './angebote.js';

/**
 * Pop-up an der Quelle: Diagnose oder Allergie aus dem Arztbrief heraus anlegen oder ändern.
 *
 * Erfasst wird nicht im Brief, sondern in der Liste, aus der der Brief schöpft — mit derselben
 * Maske und denselben Regeln wie in „Diagnosen und Allergien" (`listenpflege.ts`): Eintrag der
 * Praxis, auf Wunsch in die ✦ Liste der ePA. Ein Eintrag, der nur in der ePA-Liste steht, wird
 * dafür verknüpft in die Praxis übernommen und die Änderung zurück in die Liste übertragen. Was
 * neu angelegt wurde, ist im Brief danach ausgewählt.
 */

export interface Pflegeziel {
  art: Pflegeart;
  /** `null`: neuer Eintrag. */
  angebot: Angebot | null;
}

export function Quellpflege({
  patient,
  epaListen,
  ziel,
  schliessen,
}: {
  patient: Patient;
  epaListen: { lage: Listenlage; abfrage: Ladezustand<EpaListen> };
  ziel: Pflegeziel;
  schliessen: () => void;
}) {
  const heute = useZustand((z) => z.heute);
  const nutzer = useZustand((z) => z.nutzer);
  const pflege = useListenpflege(patient, epaListen);
  const [sendet, setzeSendet] = useState(false);
  const rahmen = useRef<HTMLDivElement>(null);

  const { art, angebot } = ziel;
  const vorhanden: Diagnose | Allergie | undefined =
    art === 'diagnose' ? angebot?.diagnose : angebot?.allergie;
  const nurEpa = angebot?.bestand === 'epa';
  // Ausgang der Maske: ohne die Kennung der ePA, die sonst die des übernommenen Eintrags überschriebe.
  const ausgang = vorhanden && nurEpa ? ohneKennung(vorhanden, patient.id) : vorhanden;
  const name = art === 'diagnose' ? 'Diagnose' : 'Allergie';
  const titel = !angebot
    ? `${name} dokumentieren`
    : nurEpa
      ? `${name} aus der ePA ändern`
      : `${name} bearbeiten`;

  // Escape schließt; der Fokus bleibt im Pop-up.
  const zu = useRef(schliessen);
  zu.current = schliessen;
  useEffect(() => {
    if (!rahmen.current?.contains(document.activeElement)) rahmen.current?.focus();
    const taste = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.defaultPrevented) {
        e.preventDefault();
        zu.current();
      }
    };
    document.addEventListener('keydown', taste);
    return () => document.removeEventListener('keydown', taste);
  }, []);

  async function speichern(
    ablegen: (id?: string) => Promise<{ gelungen: boolean }>,
  ): Promise<void> {
    // Nur in der ePA-Liste: erst verknüpft übernehmen, dann ändern und zurück übertragen.
    const id = nurEpa && vorhanden ? pflege.inDiePraxis(art, vorhanden)?.id : vorhanden?.id;
    setzeSendet(true);
    const { gelungen } = await ablegen(id);
    if (gelungen) schliessen();
  }

  const fehler = pflege.meldung?.art === 'fehler' ? pflege.meldung.text : null;

  return (
    <div
      className="brief-pflege-hintergrund"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !pflege.laeuft) schliessen();
      }}
    >
      <div
        ref={rahmen}
        className="brief-pflege"
        role="dialog"
        aria-modal="true"
        aria-label={titel}
        tabIndex={-1}
      >
        {sendet ? (
          <div className="brief-pflege-stand" role="status">
            <p className={fehler ? 'hinweisbox fehler' : 'leise-klein'}>
              {fehler ?? pflege.meldung?.text ?? 'Gespeichert.'}
            </p>
            {fehler && (
              <button type="button" className="knopf" onClick={schliessen}>
                Schließen
              </button>
            )}
          </div>
        ) : art === 'diagnose' ? (
          <DiagnoseFormular
            titel={titel}
            ausgang={
              (ausgang as Diagnose | undefined) ?? leererEntwurf(patient.id, heute, nutzer.name)
            }
            kvnr={patient.versicherung.kvnr}
            heute={heute}
            person={nutzer.name}
            liste={pflege.listenoption('diagnose', vorhanden)}
            beiSpeichern={(e, inListe, ps) =>
              void speichern((id) => pflege.diagnoseSpeichern(e, inListe, ps, id))
            }
            beiAbbruch={schliessen}
          />
        ) : (
          <AllergieFormular
            titel={titel}
            ausgang={
              (ausgang as Allergie | undefined) ??
              leererAllergieentwurf(patient.id, heute, nutzer.name)
            }
            kvnr={patient.versicherung.kvnr}
            heute={heute}
            person={nutzer.name}
            liste={pflege.listenoption('allergie', vorhanden)}
            beiSpeichern={(e, inListe, ps) =>
              void speichern((id) => pflege.allergieSpeichern(e, inListe, ps, id))
            }
            beiAbbruch={schliessen}
          />
        )}
      </div>
    </div>
  );
}

function ohneKennung<T extends Diagnose | Allergie>(e: T, patientId: string): T {
  const kopie: Record<string, unknown> = { ...e, patientId };
  delete kopie['id'];
  delete kopie['herkunft'];
  delete kopie['fallId'];
  return kopie as T;
}
