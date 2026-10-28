# 0046 — Medikationsplan der Praxis für alle, mit Abgleich gegen den eMP

**Datum:** 28.10.2026 · **Status:** angenommen · **löst ab:** 0012 · **erweitert:** 0045

## Zusammenhang

Nach ADR 0012 war der Plan des Praxissystems ein datierter Spiegel des eMP, nach ADR 0045 gab es
einen eigenen Plan der Praxis nur, wenn das Aktensystem keine Akte kennt. Dazwischen blieb eine
Lücke, die im Praxisalltag die häufigste ist: Die Person hat eine Akte, die eGK ist aber noch nicht
eingelesen — etwa bei der ersten Vorstellung (Frau Hoffmann). Dann zeigte die Medikation einen
leeren Plan und erlaubte weder „neuer Planeintrag" noch „Auch in den Medikationsplan aufnehmen".
Was die Praxis über die Medikation weiß, hing an der Befugnis für die ePA.

Ein Praxissystem führt den Plan aber auch ohne Zugriff. Der Ballot zu ePA 3.2 verlangt das
ausdrücklich (SPEZIFIKATION 5.12: Darstellung des eMP ohne Zugriff, auch aus lokaler
Datenhaltung), und DATENMODELL, Abschnitt 7, führte es als offenen Punkt.

## Entscheidung

1. **Der Medikationsplan der Praxis ist für jede Person der Primärbestand** (`praxisplan`). Ohne
   Akte, ohne eingelesene eGK, bei Widerspruch und bei Störung steht er da und ist ergänzbar.
2. **Verknüpft mit dem eMP.** Ein Eintrag trägt die Kennung seines eMP-Eintrags (`epaId`) und
   dessen Stand beim letzten Abgleich (`epaStand`: Fassung, Dosierung, Grund, Status). Daran zeigt
   sich, welche Seite seither geändert hat (`kern/fachlogik/planabgleich.ts`).
3. **Abgleich beim Einlesen der eGK und bei jedem Laden der Medikation.** Automatisch geschieht nur,
   was eindeutig ist: neue eMP-Einträge kommen verknüpft in den Plan der Praxis, eMP-Änderungen
   werden übernommen, wo die Praxis nichts geändert hat. Fehlerhafte eMP-Einträge kommen nicht neu
   hinzu.
4. **Was die Praxis geändert hat, geht nie ohne Handlung in die ePA.** Eintrag nur der Praxis:
   „in die ePA →" (`$add-emp-entry`). Ohne Zugriff geändert: „Änderung in die ePA →"
   (`$update-emp-entry`) oder „← ePA-Stand". Haben beide Seiten geändert, steht der Stand des eMP
   unter dem Eintrag, und die Ärztin entscheidet. Unverknüpft beide mit demselben ATC-Code:
   „verknüpfen" statt eines zweiten Eintrags.
5. **Mit Zugriff wird in den eMP geschrieben**, der Plan der Praxis folgt im Abgleich: neuer
   Planeintrag, pausieren, absetzen, fehlerhaft, „in den Plan" aus der Medikationsliste, „Auch in
   den Medikationsplan aufnehmen". Ohne Zugriff wirken dieselben Handlungen im Plan der Praxis.
6. **Der Spiegel entfällt.** Karteikarte und ✦ Arztbrief lesen nur den Plan der Praxis; der
   Arztbrief bietet eMP-Einträge zusätzlich an, solange sie nicht verknüpft sind. Das Band über
   dem Plan nennt „Abgeglichen" mit Zeitpunkt und offenen Unterschieden oder „Nicht abgeglichen"
   mit Grund und Stand des letzten Abgleichs.

## Begründung

▸ Dasselbe Muster wie bei Diagnosen, Allergien und Impfungen: Die Praxis pflegt ihren Bestand, die
zentrale Liste wird gegen ihn geführt. Der Unterschied zum Splitscreen dort ist bewusst: Der eMP
ist ein gemeinsam gepflegter Plan, Änderungen anderer Einrichtungen sollen ohne Klick ankommen,
solange sie nichts überschreiben.

▸ U3 bleibt gewahrt: Der Plan der Praxis ist kein stiller Ersatz für den eMP. Jede Zeile nennt
ihre Lage, das Band den Stand des letzten Abgleichs.

## Folgen

- `medikationsspiegel` ist aus dem Zustand entfernt; an seine Stelle tritt `planabgleiche`
  (Zeitpunkt und Lesenachweis je Person).
- Die Medikationsliste bleibt eine reine ePA-Sicht. Ohne Zugriff steht dort „Ohne Zugriff auf die
  ePA." statt „Keine Verordnungen".
- Widersprüche gegen Versorgungsprozesse fragt das Praxissystem unverändert vor dem Einlesen ab —
  `getConsentDecisionInformation` ist ohne Befugnis und ohne Anmeldung vorgesehen
  (I_Information_Service 1.5.1; gemKPT_ePAfuerAlle 3.1.3, Abschnitt Widerspruchsmanagement).
- ⚠ Ein Eintrag, den eine andere Einrichtung im eMP als fehlerhaft kennzeichnet, wird im Plan der
  Praxis übernommen, wenn die Praxis ihn nicht geändert hat. Ob das ohne Rückfrage geschehen soll,
  ist fachlich zu prüfen.

## Verworfen

**Spiegel und Plan der Praxis nebeneinander** — zwei lokale Bestände derselben Medikation, die man
auseinanderhalten muss; der Arztbrief müsste wählen.

**Alles bestätigen wie im Splitscreen der Diagnosen** — jede Änderung einer anderen Einrichtung
bräuchte einen Klick; der gemeinsam gepflegte Plan käme nur verzögert an.

**Alles automatisch in beide Richtungen** — eigene Änderungen ohne Zugriff landeten ohne Handlung
im eMP; bei Konflikten entschiede die Uhr statt der Ärztin.
