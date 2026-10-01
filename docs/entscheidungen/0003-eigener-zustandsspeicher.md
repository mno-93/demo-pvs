# 0003 — Eigener Zustandsspeicher statt Bibliothek

**Datum:** 09.09.2026 · **Status:** angenommen

## Entscheidung

Ein kleiner Speicher auf Grundlage von `useSyncExternalStore`, rund fünfzig Zeilen, statt Redux,
Zustand oder MobX. Änderungen laufen ausschließlich über benannte Vorgänge.

## Begründung

Der Zustandsbedarf ist überschaubar und die Anforderung ungewöhnlich: Ab M4 müssen **Handlungen zählbar**
sein, weil der Aufwandszähler das Kernargument des Projekts trägt. Benannte Vorgänge an einer Stelle
leisten das unmittelbar. Eine Bibliothek brächte eine Abhängigkeit, die in fünf Jahren gepflegt sein will,
für einen Nutzen, der hier klein ist.

## Verworfen

**Zustand oder Redux Toolkit** — bewährt und gut dokumentiert, aber jede Abhängigkeit ist eine Wette auf
ihre Pflege. Bei einem Demonstrator, der Jahre überdauern soll, wird diese Wette nur eingegangen, wo sie
sich lohnt.
