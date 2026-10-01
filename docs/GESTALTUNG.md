# Gestaltung

Für alle, die Oberfläche und Bedienung der Demo weiterentwickeln — in Figma oder im Code. Was eine
Ansicht fachlich zeigt, steht in [SPEZIFIKATION.md](SPEZIFIKATION.md); die verbindlichen
UX-Grundsätze in deren Abschnitt 2.2. Diese Datei sagt, **womit** gestaltet wird.

## Grundhaltung

- Ruhig und sachlich wie ein Praxissystem; kein Nachbau eines realen Produkts.
- **Die Oberfläche erklärt sich durch Benutzung** (ADR 0020): Beschriftungen, Zustände, Marker. Keine
  Hinweisboxen mit Erklärtexten — was erklärt werden muss, steht in der Spezifikation.
- **Keine Aussage allein über Farbe.** Jede farbige Kennzeichnung trägt ein Wort oder Zeichen.
- **Barrierefreiheit ist Baubedingung:** Tastatur, sichtbarer Fokus, Beschriftung jedes
  Bedienelements, Regionen mit Namen.
- Schriften aus dem System, nichts von fremden Servern.

## Gestaltungsvariablen

Alle Farben, Radien und Schriften stehen als CSS-Variablen in
[`packages/pvs/src/stil/global.css`](../packages/pvs/src/stil/global.css) (`:root`). ▸ In Figma
sollten die Variablen **gleich heißen** — dann lässt sich jede Änderung eins zu eins übertragen.

| Variable                                        | Wert                              | Bedeutung                                            |
| ----------------------------------------------- | --------------------------------- | ---------------------------------------------------- |
| `--grund`                                       | `#eef1f5`                         | Seitenhintergrund                                    |
| `--flaeche` / `--flaeche2`                      | `#ffffff` / `#f7f9fb`             | Karten / abgesetzte Flächen (Mitte des Splitscreens) |
| `--linie` / `--linie-stark`                     | `#d7dee7` / `#b7c2d0`             | Trennlinien, Rahmen                                  |
| `--text` / `--text-leise` / `--text-sehr-leise` | `#16212e` / `#5b6b7e` / `#8494a6` | Fließtext / Nebenangaben / Vergangenes, Platzhalter  |
| `--akzent` / `--akzent-weich`                   | `#1d4ed8` / `#eaf0ff`             | **ePA** und Haupthandlungen                          |
| `--lokal` / `--lokal-weich`                     | `#0f766e` / `#e6f4f2`             | **Praxissystem** (lokaler Bestand)                   |
| `--warn` / `--warn-weich`                       | `#b45309` / `#fef3c7`             | zu klären, Befugnis fehlt, Hinweis mit Pflicht       |
| `--fehler` / `--fehler-weich`                   | `#b91c1c` / `#fee2e2`             | Fehler, berichtigt, gesperrt                         |
| `--gut` / `--gut-weich`                         | `#15803d` / `#dcfce7`             | abgeglichen, bestätigt, verfügbar                    |
| `--ps` / `--ps-weich` / `--ps-linie`            | `#6d28d9` / `#f3e8ff` / `#c4b5fd` | ✦ **nur Patient Summary**: ★, Markierung, Zähler     |
| `--radius`                                      | `8px`                             | Ecken von Karten                                     |
| `--schrift` / `--mono`                          | Systemschrift / Monospace         | Text / Codes (ICD-10-GM, SNOMED CT, Pfade)           |
| `--skala`                                       | `1` (Vorführmodus `1.15`)         | vergrößert alles für Beamer und Termine              |

**Zwei Bestände, zwei Farben.** Grün-Türkis (`--lokal`) ist immer das Praxissystem, Blau
(`--akzent`) immer die ePA — in Bändern, Spaltenköpfen und Rändern des Splitscreens. Neue Ansichten
übernehmen das.

## Bausteine

| Baustein                                             | Datei                              | Wofür                                                                         |
| ---------------------------------------------------- | ---------------------------------- | ----------------------------------------------------------------------------- |
| `Karte`                                              | `bausteine/Bausteine.tsx`          | Abschnitt mit Titel und Werkzeugen rechts                                     |
| `Marker`                                             | `bausteine/Bausteine.tsx`          | Zustand als Pille; Töne `neutral`, `akzent`, `lokal`, `warn`, `gut`, `fehler` |
| `Bestandsband`                                       | `bausteine/Bausteine.tsx`          | sagt oben in jedem Bereich, welcher Bestand gezeigt wird (U1)                 |
| `Leer`                                               | `bausteine/Bausteine.tsx`          | Leerzustand — knapp, ohne Erklärung                                           |
| `Katalogsuche`, `Terminologiesuche`                  | `bausteine/`                       | Suche mit Auswahlliste (Kodierservice, Wertelisten, Kataloge)                 |
| `PsSchalter`, `PsMarke`                              | `bausteine/PsMarke.tsx`            | ★ Patient Summary — als Schalter oder als Marke, auch kompakt                 |
| `SplitBlock`                                         | `module/diagnosen/Splitscreen.tsx` | Splitscreen Praxis · Abgleich · ePA mit Ordnung und Aufklappen                |
| `Kompaktkarte`, `Listenwerkzeug`                     | `module/diagnosen/Splitscreen.tsx` | kompakte Listenzeile mit Details; Sortierung und „alle aufklappen"            |
| `SeitLetztemAufrufBand`, `NeuMarke`                  | `epa/gesehen.tsx`                  | „neu seit dem letzten Aufruf"                                                 |
| `Abrufstand`                                         | `epa/aktenstatus.tsx`              | „Stand hh:mm:ss" mit „↻ aktualisieren" an jeder Fernsicht (U22)               |
| `Befundansicht`, `Befundliste`, `DokumentBetrachter` | `bausteine/`                       | Laborbefunde und Dokumente                                                    |

Knöpfe: Klasse `knopf`, Varianten `stark` (Haupthandlung), `klein`; Umschalter mit
`aria-pressed`. Handlungen, die in die ePA schreiben, tragen einen Pfeil: „in die ePA ➜",
„⬅ in die Praxis".

## Muster

- **ePA als Fenster**, nicht als Reiter (ADR 0014): eigener Kopf, Zugriffsmarker, Aufrufprotokoll.
- **Splitscreen** für alles, was in Praxis und ePA geführt wird: links Praxis, Mitte Abgleich und
  Handlung, rechts ePA.
- **Kompakt zuerst, Einzelheiten auf Klick** (U29): die Bezeichnung ist der Schalter zum Aufklappen.
- **Herkunft unter dem Befund** (U6), in Listen beim Aufklappen.
- **Leer ist nicht gleich leer** (U7): „Information nicht verfügbar" gegen eine ausdrückliche Angabe.

## Von Figma in den Code

1. In Figma gestalten; Variablen wie oben benennen, Bausteine wie oben schneiden.
2. Issue mit der Vorlage „Gestaltung" anlegen: Link auf den Frame, betroffene Ansicht, welcher
   UX-Grundsatz berührt ist oder neu entsteht.
3. Umsetzung auf einem eigenen Branch — mit Claude Code, das den Figma-Frame über die
   Figma-Anbindung lesen kann, wenn sie eingerichtet ist ([ZUSAMMENARBEIT.md](ZUSAMMENARBEIT.md)).
4. Im Browser prüfen, Bildschirmfoto in den Pull Request, nicht ins Repository.
5. Neuer oder geänderter UX-Grundsatz → Spezifikation 2.2.

▸ Figma bleibt der Ort für Erkundung und Klick-Dummies; der Code ist der Ort, an dem eine Idee gegen
echte Abläufe, Daten und die Systemgrenze zur ePA geprüft wird. Was in der Demo funktioniert, ist
die Referenz — Figma wird danach nachgezogen, nicht umgekehrt.
