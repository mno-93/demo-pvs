# 0035 — Nachlesen im Dokument: Markierung, PDF-Ansicht, Ansprache

**Datum:** 06.10.2026 · **Status:** angenommen · **ergänzt:** 0032, 0033

## Zusammenhang

Drei Rückmeldungen zum ✦ Aktenlotsen und zu den Briefen:

- In der Praxis sprach der Lotse die Patientin an („Sie waren …") — als säße sie vor dem Bildschirm.
- Für Versicherte gab es die Umschaltung „Einfach" / „Wie im Dokument". Wer es genau wissen will,
  will aber nicht eine zweite Fassung der Antwort lesen, sondern das Dokument — an der Stelle.
- Strukturierte Briefe ließen sich nur als Liste von Abschnitten und Einträgen ansehen. Einen Brief
  erkennen Menschen an seiner Form: Kopf, Anschrift, Abschnitte.

Dazu wirkte die Praxissicht als lange Spalte, in der Antwort und Beleg nicht nebeneinander standen.

## Entscheidung

1. **Ansprache folgt dem Zugang.** Der Dienst unterscheidet am Zugangsweg, wer fragt: mit
   Versichertenzugang (`x-demo-versicherte`) die Anrede „Sie", mit der Befugnis einer Einrichtung
   der Name aus den Stammdaten der Akte. Kein Parameter, den eine Oberfläche falsch setzen könnte.
2. **Jeder Absatz trägt seine Belegzeilen** (`Lotsenabsatz.belege`), je Unterlage.
3. **Nachlesen markiert.** Ein Verweis auf eine Unterlage öffnet das Dokument und hinterlegt die
   Belegzeilen. Dafür zeichnet das PVS das PDF seitengetreu nach (`pdfSeitenLesen`,
   `Seitenansicht`) — der eingebettete Betrachter des Browsers kann nicht markieren. Die Umschaltung
   „Wie im Dokument" entfällt; Versicherte lesen die Antwort in Alltagssprache und springen für den
   Wortlaut ins Dokument.
4. **PDF-Ansicht für strukturierte Dokumente.** Briefe werden aus Composition und Erzähltext als
   Brief-PDF dargestellt (`briefAusFhir`, `pdfAnsichtFuer`), Laborbefunde über ihr `presentedForm`.
   Es ist eine Ansicht, kein zweites Dokument; die Fußzeile sagt das.
5. **Praxissicht in zwei Spalten:** Überblick (Zu klären, Kontext, Vorschläge) und Nachlesen
   (Frage oder geöffnete Unterlage).

## Begründung

▸ Die Belegpflicht des Lotsen (ADR 0032) ist erst eingelöst, wenn der Beleg in Sekunden sichtbar
ist. Ein Verweis, der ein mehrseitiges Dokument öffnet und die Stelle suchen lässt, ist formal ein
Beleg und praktisch keiner.

▸ Nachzeichnen statt einer PDF-Bibliothek: Die PDFs der Demo sind einfach aufgebaut; eine Bibliothek
brächte Abhängigkeit und Gewicht für einen Fall, der hier vollständig beherrscht wird. Für fremde
PDFs gilt der Betrachter des Browsers — ohne Markierung, und das ist sichtbar.

▸ Die Ansprache gehört in den Dienst, nicht in die Oberfläche: Er weiß, wer fragt, weil er die
Rechte prüft.

## Folgen

- ⚠ Markiert wird über Textgleichheit: eine Zeile der Seite, die Teil einer Belegzeile ist, sie
  enthält oder vier Wörter am Stück mit ihr teilt. Umformulierte Stellen findet das nicht.
- Für den Wortlaut einer strukturierten Unterlage müssen Erzähltext und Brieftext übereinstimmen;
  die Demo bildet beide aus einer Quelle (`epa-sim/src/briefe.ts`).

## Verworfen

**PDF.js einbinden** — markiert beliebige PDFs, bringt aber rund zwei Megabyte und einen Worker in
eine Demo, deren PDFs vollständig bekannt sind.

**„Wie im Dokument" als zweite Lesart behalten** — zwei Fassungen derselben Antwort sind eine zu
viel; der Wortlaut steht im Dokument.

**Ansprache als Parameter der Anfrage** — die Oberfläche müsste wissen und richtig setzen, was der
Dienst ohnehin weiß.
