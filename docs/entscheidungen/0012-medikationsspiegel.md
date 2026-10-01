# 0012 — Lokaler Spiegel des Medikationsplans

**Datum:** 09.09.2026 · **Status:** angenommen

## Zusammenhang

Der Medikationsplan liegt in der ePA. Zeigt das Praxissystem ihn nur als Fernsicht, steht
bei einer Störung nichts da — auch nicht das, was gestern galt.

## Entscheidung

Das Praxissystem hält einen **lokalen Spiegel** des Plans, der bei jedem erfolgreichen
Abgleich fortgeschrieben wird. Ein Band über der Liste sagt immer, woran man ist:

- **grün** — mit der ePA abgeglichen, mit Zeitpunkt;
- **gelb** — nicht abgeglichen, angezeigt wird der Spiegel vom …, seither kann sich der
  Plan geändert haben. Schreibende Aktionen sind dann gesperrt.

## Begründung

▸ Das ist bewusst ein **anderes** Verhalten als im Bereich ePA, und der Unterschied gehört
zur Aussage der Demo: Die ePA-Ansicht ist eine Fernsicht und zeigt bei fehlender Verbindung
nichts, auch nichts Veraltetes. Der Medikationsspiegel ist eine lokale Kopie und zeigt den
letzten Stand — datiert, damit ihn niemand für aktuell hält.

Beides ist richtig, weil beides eine andere Frage beantwortet: „Was steht jetzt in der ePA?"
gegen „Was weiß ich über die Medikation dieser Patientin?". Ein System, das den Unterschied
verwischt, ist gefährlicher als eines, das gar nichts zeigt.

## Verworfen

**Nur Fernsicht** — im Sprechzimmer bei einer Störung wertlos.
**Spiegel ohne Datumsangabe** — die schlechteste Möglichkeit: veraltete Angaben, die wie
aktuelle aussehen.
