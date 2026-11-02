# 0052 — Dosierung strukturiert ins Rezept, verlustfrei aus FHIR

**Datum:** 02.11.2026 · **Status:** angenommen · **ergänzt:** 0039, 0047, 0048

## Zusammenhang

Seit ADR 0047 erfasst das Praxissystem Dosierungen als Schema nach `DosageDgMP`. An drei Stellen
ging die Struktur danach wieder verloren:

1. **E-Rezept.** Das Formular übernahm aus dem Plan den erzeugten Text („täglich: 1-0-0-0 Stück“)
   in ein Textfeld. `tagesmenge()` und `dosierungAusText()` erkannten nur das nackte Muster
   „1-0-0-0“: Die Reichweite fehlte, und der Verordnungsdatensatz trug Freitext mit Viererschema
   (Warnregel `DosageFourSlotPatternInTextWarning`). „Einmal dokumentieren“ (ADR 0039) galt für die
   Dosierung nicht.
2. **Rückweg aus FHIR.** `dosierungAusFhir` las fremde Dosierungen nur teilweise und lieferte eine
   verkürzte statt keiner — „3 x täglich: je 1 Stück“ wurde „täglich: je 1 Stück“. Über den Abgleich
   kam sie in den Plan der Praxis; „Änderung in die ePA →“ schrieb sie samt neu erzeugtem Text in
   den fremden eMP-Eintrag zurück und löschte dabei auch dessen Behandlungsgrund.
3. **Schreibweise.** JavaScript liest `1.0` als `1`. Die Referenz von HL7 Deutschland liest
   Dezimalzahlen mit ihrer Schreibweise und schreibt „1,0“; der Simulator lehnte einen solchen,
   richtig erzeugten Text eines anderen Systems ab.

## Entscheidung

1. **Das Rezept trägt die strukturierte Dosierung** (`Rezept.dosis`). Das Formular nutzt dieselbe
   Eingabe wie der Plan und beginnt mit der Dosierung des Plan- oder Listeneintrags; ein
   Viererschema, das nur als Freitext vorliegt, wird zum Schema. Der Verordnungsdatensatz bildet
   `dosageInstruction` aus ihr; nur ältere Rezepte ohne sie aus dem Text.
2. **Reichweite aus der Struktur** (`tagesmengeVon`): Tageszeiten und Uhrzeiten als Summe,
   Wochentage und Intervalle gemittelt (⚠ Monat = 30 Tage), keine bei Bedarf. Nur in Stück, weil
   die Normgrößen in Stück angenommen sind.
3. **Text zu Struktur, wo es eindeutig ist:** `dosierungAusText` erkennt das Viererschema auch mit
   Leerzeichen, Brüchen (1/2, 1/3, 2/3, 1/4, 3/4), dem Vorsatz „täglich:“ und einer Dosiereinheit
   aus `KBV_CS_SFHIR_BMP_DOSIEREINHEIT`. Eine unbekannte Einheit oder ein anderer Bruch bleibt
   Freitext.
4. **Aus FHIR nur verlustfrei:** `dosierungAusFhir` liefert ein Schema nur, wenn daraus genau
   dieselben `Dosage`-Elemente entstehen; sonst `null`, und das Praxissystem zeigt den Text.
   Wer fortschreibt, ohne die Dosierung zu ändern, lässt sie unverändert
   (`planeintragFortschreiben` mit `dosierung: null`); ebenso den Behandlungsgrund einer anderen
   Einrichtung, solange die Praxis keinen eigenen wählt. „In den Plan“ übernimmt die Elemente
   eines Listeneintrags, die sich nicht als Schema lesen lassen, unverändert.
5. **Eingabe so streng wie das Profil:** höchstens zwei Nachkommastellen und der Anteil exakt
   ,25 ,33 ,5 ,66 ,75 (ohne Rundung), jeder Wochentag einmal, Tageshöchstmenge nicht unter der
   Einzeldosis.
6. **Schreibweise wie die Referenz:** Der Simulator liest Körper mit `jsonMitSchreibweise`
   (`kern/fhir/schreibweise.ts`, Quelltext der Zahl über den Reviver von `JSON.parse`); der
   Dosierungstext schreibt solche Zahlen wie gelesen. ⚠ Gespeichert gilt die Zahl.
7. **Falldatei reproduzierbar:** `werkzeuge/dosierungsfaelle-erzeugen.py` erzeugt Texte und
   Meldungen mit der Referenzimplementierung; ein eigener Job der CI prüft sie gegen den festen
   Commit.

## Folgen

- Das E-Rezept aus dem Plan zeigt wieder eine Reichweite; der Verordnungsdatensatz trägt dieselbe
  Struktur wie der Planeintrag.
- Fremde Dosierungen erscheinen im Plan der Praxis als Text, nicht als Tabelle. Ändern kann die
  Praxis sie nur, indem sie eine eigene Dosierung erfasst.
- Ein `Rezept` im Zustand hat ein Feld mehr; ältere Zustände ohne `dosis` gelten weiter.

## Verworfen

**Den Text des Plans strukturieren** (den erzeugten Text zurückparsen). Er ist eine Ausgabe des
Algorithmus, keine Eingabe; für Uhrzeiten, Wochentage, Intervalle und Bedarf gäbe es mehrdeutige
Fälle.
**Fremde Dosierungen so weit wie möglich lesen** und die Lücken dokumentieren. Jede Lücke wäre eine
stille Änderung am eMP einer anderen Einrichtung.
**Zahlen im Vergleich des Simulators normalisieren** („1,0“ = „1“). Der Simulator nähme dann Texte
an, die der Dienst ablehnt, und umgekehrt.
