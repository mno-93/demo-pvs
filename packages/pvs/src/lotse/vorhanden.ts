/**
 * ✦ Ob der Aktenlotse im eingestellten Ausbaustand antwortet.
 *
 * Der Lotse ist ein Vorschlag und erscheint deshalb erst, wenn die Demo-Steuerung auf
 * „Weiterentwicklung 4" steht — in der aktuellen Spezifikation gibt es ihn nicht. Die
 * Abfrage wiederholt sich bei jeder Umstellung der Demo-Steuerung; die gemerkte Antwort
 * verfällt dort ohnehin (`betriebsstandErhoehen`).
 */
import { useEffect, useState } from 'react';
import { useBetriebsstand } from '../epa/epa-bestand.js';
import { lotseVorhanden } from '../epa/klient.js';

export function useLotseVorhanden(): boolean | null {
  const stand = useBetriebsstand();
  const [vorhanden, setzeVorhanden] = useState<boolean | null>(null);

  useEffect(() => {
    let abgebrochen = false;
    void lotseVorhanden()
      .then((v) => {
        if (!abgebrochen) setzeVorhanden(v);
      })
      .catch(() => {
        if (!abgebrochen) setzeVorhanden(false);
      });
    return () => {
      abgebrochen = true;
    };
  }, [stand]);

  return vorhanden;
}
