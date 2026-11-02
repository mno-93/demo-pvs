# 0057 — Ausschnitt-Memo im Zustandsspeicher, parallele Abrufe

**Datum:** 02.11.2026 · **Status:** angenommen · **ergänzt:** [0006](0006-zustandsspeicher-mit-zwischenspeicher.md), 0050

## Zusammenhang

Die Demo ist klein, rechnete und wartete aber an einigen Stellen mehr als nötig:

- **`useAuswahl` abonnierte den ganzen Zustand.** Jede Änderung, auch eine technische (Lesezeichen,
  Merker „gesehen“, Abgleich), rechnete alle Ableitungen neu und renderte ihre Komponenten. Die
  Medikation las so bei jedem Lesezeichen alle lokalen Dokumente neu. Technische Vorgänge
  erzeugten auch dann einen neuen Zustand, wenn sich nichts geändert hatte.
- **Abrufe nacheinander:** Dokumentinhalte im ePA-Fenster und die Laborbefunde der Arztbrief-
  Angebote einzeln, die Frage „was ist neu seit …“ der Medikation in drei Schritten. Mit der
  einstellbaren Antwortzeit vervielfachte sich die Wartezeit.
- **Nachfragen beim E-Rezept:** ein Zähler für alle Rezepte, nur beim Senden aus dem Formular
  zurückgesetzt. Nach zwanzig Runden fragte das Modul auch für später gesendete Rezepte nicht
  mehr nach.
- **Simulator je Antwort:** Jede FHIR-Antwort wurde serialisiert, für die Zeitzonen wieder
  geparst, kopiert und erneut serialisiert. Die Volltextsuche baute je Dokument und Suchwort
  einen Text und einen regulären Ausdruck, die entryUUID wurde bei jedem Zugriff per SHA-256
  berechnet.

## Entscheidung

1. **Ausschnitt-Memo.** `useAuswahl` merkt sich über einen Proxy, welche Felder des Zustands die
   Auswahl liest, und rechnet erst neu, wenn sich eines davon ändert (Identität) oder eine
   Abhängigkeit. Sonst bleibt das Ergebnis dasselbe Objekt, und die Komponente rendert nicht.
   `useZustand` ist `useAuswahl` ohne Abhängigkeiten. Eine Auswahl, die den ganzen Zustand
   liefert, rechnet bei jeder Änderung neu.
2. **Vorgänge ohne Änderung geben den alten Zustand zurück**: Lesezeichen, „gesehen“,
   Listenordnung, Befugnis, Rolle, Verknüpfungen. Ein Abgleich ohne Übernahmen lässt den Plan
   dasselbe Objekt; nur sein Zeitpunkt ändert sich.
3. **Unabhängige Abrufe parallel** (`Promise.all`); abhängige bleiben nacheinander, etwa der
   frühere Plan nach der Chronologie.
4. **Nachfragen je Rezept:** höchstens zwanzig für jedes Rezept, das noch nicht in der
   Medikationsliste steht.
5. **Zeitzonen vor dem Serialisieren:** Die Schnittstelle des Simulators bekommt einen
   `serialisierHaken` (Fastify: `preSerialization`, Browser-Adapter: vor `JSON.stringify`).
6. **Volltextsuche:** je Suchwort ein Ausdruck, je Dokument ein Text; abgeleitete entryUUIDs
   werden je Kennung gemerkt.

## Folgen

- Eine Auswahl, die eine Abhängigkeit nicht nennt, bleibt jetzt sichtbar stehen, statt bei der
  nächsten Änderung zufällig neu gerechnet zu werden. Der Aktenlotse las die Person über
  `useZustand` mit einer Kennung der Komponente; er nutzt jetzt `useAuswahl`.
- Tests: kein Rendern bei Änderungen an ungelesenen Feldern, unveränderter Zustand nach
  technischen Vorgängen ohne Änderung.
- Nicht umgesetzt: ein Index je Ablage im Simulator statt linearer Suche. Bei Dutzenden bis
  wenigen Hundert Ressourcen je Akte lohnt er nicht.

## Verworfen

**Felder ausdrücklich angeben** (`useAuswahl(['diagnosen'], …)`). Eine vergessene Angabe fiele
erst zur Laufzeit als veraltete Anzeige auf — derselbe Fehlertyp, den 0006 beseitigt hat.
**Eine Zustandsbibliothek mit Selektoren** bleibt nach 0003 und 0006 verworfen. **Ergebnisse
inhaltlich vergleichen** (tiefer Vergleich nach jeder Berechnung) spart das Rendern, aber nicht
die Berechnung — und kostet bei großen Listen selbst.
