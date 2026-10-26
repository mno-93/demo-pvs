# 0044 — Arztbrief: Diagnosen und Allergien im Pop-up an der Quelle pflegen

**Datum:** 26.10.2026 · **Status:** angenommen · **ergänzt:** 0038, 0018

## Zusammenhang

Nach ADR 0038 wird Neues nicht im Brief erfasst, sondern in seiner Quelle. Der Weg dorthin war ein
Verweis unten im Auswahlmenü: Reiter wechseln, in „Diagnosen und Allergien" erfassen, zurück in den
Brief. Der Entwurf überlebt das. Trotzdem ist es beim Briefschreiben der häufigste Umweg — eine
Diagnose fehlt, ist veraltet oder steht nur in der Diagnosenliste der ePA und soll für den Brief
präzisiert werden. Ändern ging aus dem Brief gar nicht.

## Entscheidung

1. **Diagnosen und Allergien legt die Ärztin im Brief an und ändert sie dort — in einem Pop-up, das
   die Maske der Liste ist.** „+ Neue Diagnose" und „+ Neue Allergie" stehen am Abschnitt und
   unten im Menü, „Ändern" an jedem gewählten Eintrag und an jedem Eintrag im Menü.
2. **Dieselben Regeln wie in der Liste.** Die Speicherlogik liegt in einem gemeinsamen Hook
   (`module/diagnosen/listenpflege.ts`), den „Diagnosen und Allergien" und das Pop-up
   (`module/arztbrief/Quellpflege.tsx`) teilen: Eintrag der Praxis, das Kästchen „In der
   Diagnosenliste der ePA führen" (✦, ADR 0018) und die Relevanz für die Patient Summary in
   derselben Maske.
3. **Ein Eintrag, der nur in der ePA-Liste steht, wird beim Speichern verknüpft in die Praxis
   übernommen** und die Änderung über `$update-condition-entry` bzw. `$update-allergy-entry` in die
   Liste zurück übertragen — wie „← in die Praxis" mit anschließendem Bearbeiten im Splitscreen.
   Abbrechen übernimmt nichts.
4. **Was angelegt oder geändert wurde, ist im Brief gewählt** und trägt „neu" — dieselbe Regel wie
   bei der Rückkehr aus einem anderen Reiter.
5. Nur in ärztlicher Rolle. Medikation, Impfungen und Karteikarte behalten den Verweis in ihren
   Reiter.

## Begründung

▸ U9 bleibt gewahrt: Es entsteht keine zweite Fassung im Brief. Das Pop-up schreibt dorthin, wo die
Diagnose geführt wird, und der Brief liest sie von dort.

▸ Die Liste ist der Weg in die Patient Summary. Wer beim Briefschreiben eine Diagnose ergänzt und
das Kästchen setzt, pflegt die Patient Summary mit — ohne zusätzlichen Schritt (ADR 0039).

## Folgen

- `useBriefangebote` nimmt die Lage der ✦ Listen als Parameter, damit Brief und Pop-up dieselbe
  Abfrage teilen und das Neuladen nach dem Schreiben beide erreicht.
- Gelingt das Schreiben in die ePA nicht, ist der Eintrag der Praxis gespeichert; das Pop-up
  zeigt die Ablehnung und schließt erst auf „Schließen".

## Verworfen

**Formular eingebettet im Brief** — der Brief würde zur zweiten Erfassungsmaske; was dort steht,
gehörte optisch zum Brief, nicht zur Liste.

**Nur der Verweis in den Reiter** (bisher) — für die häufigste Ergänzung ein Kontextwechsel;
Ändern aus dem Brief war gar nicht möglich.

**Einträge der ePA-Liste direkt ändern, ohne Praxiseintrag** — im Splitscreen gibt es diesen Weg
nicht: Die Praxis ändert immer ihren Eintrag und überträgt ihn. Ein zweiter Weg nur im Brief
würde die Regel brechen.
