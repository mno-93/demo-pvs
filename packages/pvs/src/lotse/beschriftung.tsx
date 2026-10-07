/**
 * ✦ Hinweise des Aktenlotsen zu unklar beschrifteten Dokumenten — in jeder Dokumentenliste
 * dieselben: in der Versichertensicht, im ePA-Fenster und in den Dokumenten der Kartei.
 *
 * ▸ Die Listen lesen dieselbe ePA über denselben Weg (MHD ITI-67); dann müssen sie auch
 * dasselbe über ein Dokument sagen. Ein Hinweis, der nur in einer Sicht steht, wäre eine
 * zweite Wahrheit über dieselbe Akte.
 */
import { useEffect, useState } from 'react';
import { lotseBeschriftung, type Beschriftungsbefund } from '../epa/klient.js';
import { useBetriebsstand } from '../epa/epa-bestand.js';
import { useEinlesungen } from '../epa/befugnis.js';
import { useLotseVorhanden } from './vorhanden.js';

/**
 * Unklar beschriftete Dokumente der Akte, nach Dokumentkennung. Leer, solange der Lotse nicht
 * angeboten wird oder die ePA nicht antwortet — dann steht in der Liste schlicht nichts dazu.
 *
 * @param alsVersicherte gesetzt in der Versichertensicht (Versichertenzugang)
 */
export function useBeschriftung(
  kvnr: string,
  alsVersicherte?: string,
  aktiv = true,
): Map<string, Beschriftungsbefund> {
  const lotseDa = useLotseVorhanden() === true;
  const betriebsstand = useBetriebsstand();
  const einlesungen = useEinlesungen();
  const [befunde, setzeBefunde] = useState<Map<string, Beschriftungsbefund>>(new Map());

  useEffect(() => {
    if (!kvnr || !lotseDa || !aktiv) {
      setzeBefunde(new Map());
      return;
    }
    let abgebrochen = false;
    void lotseBeschriftung(kvnr, alsVersicherte)
      .then((liste) => {
        if (!abgebrochen) setzeBefunde(new Map(liste.map((b) => [b.quelleId, b])));
      })
      .catch(() => {
        if (!abgebrochen) setzeBefunde(new Map());
      });
    return () => {
      abgebrochen = true;
    };
  }, [kvnr, alsVersicherte, aktiv, lotseDa, betriebsstand, einlesungen]);

  return befunde;
}

/** „✦ laut Inhalt: …" unter dem Titel; die Gründe stehen im Tooltip. */
export function LautInhalt({ befund }: { befund: Beschriftungsbefund | undefined }) {
  if (!befund?.lautInhalt) return null;
  return (
    <span className="laut-inhalt" title={befund.gruende.join(' · ')}>
      ✦ laut Inhalt: {befund.lautInhalt}
    </span>
  );
}
