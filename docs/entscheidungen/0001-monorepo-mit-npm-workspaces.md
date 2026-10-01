# 0001 — Monorepo mit npm-Workspaces

**Datum:** 09.09.2026 · **Status:** angenommen

## Zusammenhang

Drei Bestandteile — Praxisverwaltung, ePA-Simulator, gemeinsamer fachlicher Kern — die dieselben
Typen und dieselbe FHIR-Abbildung verwenden und sich gemeinsam weiterentwickeln.

## Entscheidung

Ein Repository mit npm-Workspaces. Kein Zusatzwerkzeug für die Paketverwaltung.

## Begründung

Die Typen des fachlichen Kerns ändern sich in derselben Bewegung wie beide Anwendungen. Getrennte
Repositories erzwängen eine Versionierung zwischen ihnen, die nichts trägt, solange nur ein Team daran
arbeitet. npm-Workspaces sind ohne Zusatzinstallation überall vorhanden — für ein Projekt, das
möglicherweise an Dritte übergeht, wiegt das mehr als der Komfort spezialisierter Werkzeuge.

## Verworfen

**Getrennte Repositories** — Versionierungsaufwand ohne Nutzen bei einem Team.
**pnpm oder Turborepo** — schneller und mächtiger, aber eine weitere Voraussetzung auf jedem Rechner,
der das Projekt bauen soll.
