# 0007 — Der Simulator liest `application/fhir+json`

**Datum:** 09.09.2026 · **Status:** angenommen

## Zusammenhang

Der Klient sendete alle Anfragen mit `content-type: application/fhir+json`. Fastify kennt
ohne eigenen Leser nur `application/json` und wies schreibende Zugriffe mit **415** ab. Die
Prüfung mit `curl` hatte den Fehler nicht gezeigt, weil curl `application/json` sendet.

## Entscheidung

Der Simulator bekommt einen Leser für `application/fhir+json`. Der Klient unterscheidet:
fachliche Wege unter `/fhir` sprechen FHIR, die Verwaltungswege des Simulators nicht.

## Begründung

`application/fhir+json` ist der Inhaltstyp, den ein echtes Aktensystem erwartet. Ein
Simulator, der ihn ablehnt, würde Implementierende in die Irre führen. Die Unterscheidung im
Klienten hält zugleich auseinander, was fachlich ist und was zur Demo gehört.

## Folgen

▸ Der Fehler ist ein Beleg für den Nutzen des getrennten Dienstes (ADR 0002): In einem Modul
im Frontend hätte es keinen Inhaltstyp gegeben, an dem etwas hätte scheitern können — und
damit auch keinen Hinweis darauf, dass hier eine echte Schnittstelle liegt.
