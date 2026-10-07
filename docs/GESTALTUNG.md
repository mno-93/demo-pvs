# Gestaltung

Für alle, die Oberfläche und Bedienung der Demo weiterentwickeln — in Figma oder im Code. Was eine
Ansicht fachlich zeigt, steht in [SPEZIFIKATION.md](SPEZIFIKATION.md); die verbindlichen
UX-Grundsätze in deren Abschnitt 2.2. Diese Datei sagt, **womit** gestaltet wird.

## Grundhaltung

- Ruhig und sachlich wie ein Praxissystem; kein Nachbau eines realen Produkts. Neutrale Grautöne,
  gedämpfte Zustandsfarben, kleine Rundungen, keine Farbverläufe und keine Zierzeichen.
- **Farbe nur, wo gehandelt werden muss.** Zähler und Mengenangaben bleiben neutral; farbig wird,
  was eine Entscheidung verlangt („zu klären", „Befugnis fehlt") oder einen Bestand bezeichnet.
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

| Variable                                        | Wert                                          | Bedeutung                                                 |
| ----------------------------------------------- | --------------------------------------------- | --------------------------------------------------------- |
| `--grund`                                       | `#f2f3f5`                                     | Seitenhintergrund                                         |
| `--flaeche` / `--flaeche2`                      | `#ffffff` / `#f7f8fa`                         | Karten / abgesetzte Flächen (Mitte des Splitscreens)      |
| `--linie` / `--linie-stark`                     | `#dfe3e8` / `#c3c9d1`                         | Trennlinien, Rahmen                                       |
| `--text` / `--text-leise` / `--text-sehr-leise` | `#1b2430` / `#4a5563` / `#6b7480`             | Fließtext / Nebenangaben / Vergangenes, Platzhalter       |
| `--akzent` / `-dunkel` / `-weich` / `-linie`    | `#1d4a8a` / `#163a6c` / `#f0f4fa` / `#c9d6ea` | **ePA** und Haupthandlungen                               |
| `--lokal` / `-weich` / `-linie`                 | `#2c6b5c` / `#f0f6f4` / `#c5ddd6`             | **Praxissystem** (lokaler Bestand)                        |
| `--warn` / `-weich` / `-linie`                  | `#8f5300` / `#fdf6ea` / `#ead3a6`             | zu klären, Befugnis fehlt, Hinweis mit Pflicht            |
| `--fehler` / `-weich` / `-linie`                | `#a1261f` / `#fbf1f0` / `#ebc5c1`             | Fehler, berichtigt, gesperrt                              |
| `--gut` / `-weich` / `-linie`                   | `#2d6a3e` / `#f0f6f1` / `#c3dcc9`             | abgeglichen, bestätigt, verfügbar                         |
| `--ps` / `-weich` / `-linie`                    | `#5a4589` / `#f5f3f9` / `#d3cbe4`             | ✦ **nur Patient Summary**: ★, Markierung, Zähler          |
| `--kopf-grund` / `-text` / `-leise` / `-linie`  | `#1f2b3a` / `#e8ecf1` / `#a3aebb` / `#3a4859` | dunkle Kopfleiste des Systems                             |
| `--radius` / `--radius-klein`                   | `4px` / `3px`                                 | Karten, Knöpfe, Felder / Marker                           |
| `--schrift` / `--mono`                          | Systemschrift / Monospace                     | Text / Codes (ICD-10-GM, SNOMED CT, Pfade)                |
| `--skala`                                       | `1`                                           | Grundmaß aller Größen; für Beamer den Browser-Zoom nutzen |

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
`aria-pressed`. Handlungen, die in die ePA schreiben, tragen einen Pfeil: „in die ePA →",
„← in die Praxis".

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
