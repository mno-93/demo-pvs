# 0006 — Der Zustandsspeicher speichert Auswahlergebnisse zwischen

**Datum:** 09.09.2026 · **Status:** angenommen · **Ergänzt** [0003](0003-eigener-zustandsspeicher.md)

## Zusammenhang

Die erste Fassung reichte die Auswahlfunktion ungefiltert an `useSyncExternalStore` weiter.
Eine Auswahl, die eine neue Liste erzeugt — `z.diagnosen.filter(...)` — lieferte damit bei
jedem Aufruf ein neues Objekt. React hielt das für eine Änderung und rannte in eine
Endlosschleife. Der Fehler trat erst beim Öffnen des ePA-Bereichs auf und war an der
Aufrufstelle nicht zu erkennen.

## Entscheidung

`useZustand` speichert das Auswahlergebnis gegen die Identität des Zustands zwischen.
Für Ableitungen, die zusätzlich von Werten der Komponente abhängen, gibt es `useAuswahl`
mit ausdrücklichen Abhängigkeiten.

## Begründung

Die Regel „Auswahlfunktionen müssen stabile Werte liefern" stand in der Dokumentation und
wurde trotzdem verletzt — von derselben Person, die sie geschrieben hatte. Eine Regel, die
man einhalten muss, ohne dass eine Verletzung auffällt, ist keine gute Regel. Der
Zwischenspeicher macht den häufigen Fall richtig; die seltenere Ableitung über Eigenschaften
bekommt eine eigene, sichtbar benannte Funktion.

## Verworfen

**Bei der Regel bleiben und die Aufrufstellen prüfen** — verlegt die Verantwortung auf
Aufmerksamkeit statt auf den Bau.
**Eine Zustandsbibliothek aufnehmen** — löste das Problem, aber Entscheidung 0003 gilt
weiter: Der Zustandsbedarf ist klein, und der Handlungszähler verlangt benannte Vorgänge.

## Folgen

`packages/pvs/src/speicher/speicher.test.tsx` hält den Fehler fern. Er wäre ohne
Oberflächentests unentdeckt geblieben — deshalb sind sie mit dieser Änderung eingeführt.
