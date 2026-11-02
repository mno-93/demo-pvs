# 0051 — „Im Plan“ nur über die Verknüpfung

**Datum:** 02.11.2026 · **Status:** angenommen · **löst ab:** 0045 Punkt 3 · **ergänzt:** 0009, 0046

## Zusammenhang

Die Medikationsliste kennzeichnete einen Eintrag als „im Plan“, wenn er mit einem Planeintrag
verknüpft war **oder** ein Planeintrag denselben ATC-Code trug. Ebenso galt im Medikationsplan der
Praxis ein Rezept als „im Plan“, wenn ein gültiger Eintrag denselben Wirkstoff hatte (ADR 0045,
Punkt 3), und ein neues E-Rezept aus dem Katalog galt bei gleichem ATC-Code als „im Plan“.

Folge: Nach „In den Plan aufnehmen“ von Metformin 500 mg stand die Klinik-Verordnung Metformin
1000 mg in der Liste als „im Plan“, der Knopf „in den Plan“ verschwand. Eine andere Stärke, ein
anderes Präparat oder eine zweite Verordnung desselben Wirkstoffs ist aber gerade die Abweichung,
die der Abgleich von Liste und Plan zeigen soll. Der Medication Service kennt dafür die
Verknüpfung (`basedOn` mit `is-emp-extension`, gesetzt von `$link-emp`, von `$add-emp-entry` mit
Verweis auf ein vorhandenes Arzneimittel und beim E-Rezept mit eMP-Identifier).

## Entscheidung

1. **„Im Plan“ heißt verknüpft.** In der Medikationsliste: `basedOn` verweist auf einen Eintrag des
   eMP. Ist dieser beendet oder abgesetzt, steht „im Plan · beendet“ bzw. „· abgesetzt“. Im Plan
   der Praxis ohne Akte: Das Rezept ist einem gültigen Eintrag zugeordnet (`rezeptIds`). Ein
   E-Rezept aus dem Katalog ist nie „im Plan“.
2. **Derselbe Wirkstoff ist ein eigener Hinweis:** „Wirkstoff im Plan: ‹Bezeichnung›“ unter dem
   Marker „nicht im Plan“, im E-Rezept-Formular neben dem Marker und als vorbelegter Freigabehinweis
   der MFA. „Auch in den Medikationsplan aufnehmen“ ist dann nicht vorbelegt; die AMTS-Prüfung
   meldet die Doppelverordnung wie bisher.
3. **Die Praxis entscheidet mit einer benannten Handlung** (ADR 0008): in der Medikationsliste
   „verknüpfen“ (`$link-emp` mit dem Planeintrag desselben Wirkstoffs; der Dienst übernimmt dabei
   nach IG 1.4.0 Arzneimittel und Dosierung, wenn der Planeintrag nicht neuer ist) oder „in den
   Plan“ (neuer Eintrag); im Plan der Praxis „zuordnen“ oder „in den Plan“.
4. Regeln im Kern (`fachlogik/praxisplan.ts`: `planeintragZumRezept`,
   `planeintragGleicherWirkstoff`) und im Medikationsmodul (`planbezug`) mit Tests.

## Folgen

- Die Medikationsliste zeigt Lücken zwischen Liste und Plan auch bei gleichem Wirkstoff; Frau
  Hoffmanns Metformin-Verordnung bleibt „nicht im Plan“, bis die Praxis sie verknüpft oder aufnimmt.
- Der Abgleich zwischen Plan der Praxis und eMP (ADR 0046, „gleiches Mittel in der ePA“ →
  „verknüpfen“) bleibt unverändert: Dort verbindet die Praxis zwei Planeinträge, nicht einen
  Listeneintrag mit dem Plan.

## Verworfen

**Gleicher ATC-Code und gleiche Bezeichnung oder PZN gelten als „im Plan“.** Auch das gleiche
Präparat kann ein zweites Mal verordnet sein, etwa von einer anderen Einrichtung mit anderer
Dosierung; ob es derselbe Planeintrag ist, entscheidet die Praxis. Eine stille Gleichsetzung
nähme ihr die Entscheidung ab und wiche vom Datenstand der ePA ab.
**Den Hinweis weglassen.** Ohne ihn müsste die Praxis die Doppelung selbst erkennen; die AMTS-Prüfung
meldet sie erst beim Aufnehmen.
