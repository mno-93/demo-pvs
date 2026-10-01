# Zusammenarbeit im Team

Wie mehrere Personen — jede mit eigenem Claude-Zugang — die Demo gemeinsam weiterentwickeln, ohne
dass Fachlichkeit, Gestaltung und Vertraulichkeit auseinanderlaufen.

## Rollen

| Rolle                  | Schwerpunkt                                                                                                         | Prüft im Review                                          |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| **Projektleitung**     | Zielbild, Spezifikationstreue der ePA-Wege (`packages/epa-sim`, `docs/QUELLEN.md`), Entscheidungen, Vertraulichkeit | jeden Pull Request; führt zusammen (Merge)               |
| **Gestaltung (UX/UI)** | Abläufe, Ansichten, Bausteine, Gestaltungsvariablen, UX-Grundsätze; Figma                                           | Änderungen an Oberfläche und Bedienung                   |
| **Medizin**            | Beispielbestand, klinische Plausibilität, Kataloge, fachliche Regeln (AMTS, Abrechnung), Vorführabläufe             | Änderungen an Daten, Codes, fachlichen Regeln und Texten |

Die Zuständigkeiten stehen auch in [`.github/CODEOWNERS`](../.github/CODEOWNERS); GitHub fordert
dann automatisch das passende Review an.

## Einrichten

1. **GitHub:** Zugang zum Repository von der Projektleitung.
2. **Claude:** eigener Zugang mit Claude Code — in der Desktop-App (Bereich „Code") oder im
   Terminal. Repository klonen und dort die Sitzung starten.
3. **Node 22** (siehe `.nvmrc`). Dann `npm install` und `npm run dev`. In der Desktop-App startet
   Claude die Vorschau selbst (`.claude/launch.json`, Eintrag `demo-pvs`).
4. **`.vertraulich-muster`** von der Projektleitung erhalten — auf direktem Weg, nicht über GitHub —
   und ins Wurzelverzeichnis legen. Git ignoriert die Datei.

Für die Mitarbeit braucht niemand Programmierkenntnisse: Claude liest `CLAUDE.md`, setzt um, prüft
und zeigt das Ergebnis in der Vorschau. Wichtig ist, **was** gewollt ist und **warum** — das gehört
in das Issue.

## Arbeitsablauf

```
Issue  →  Branch  →  Umsetzung mit Claude  →  Prüfen  →  Pull Request  →  Review  →  Merge
```

1. **Issue** mit einer der Vorlagen: _Gestaltung_, _Fachlicher Beitrag_ oder _Fehler_. Ein Thema je
   Issue.
2. **Branch** je Issue, nie auf `main` arbeiten: `ux/<kurz>`, `fach/<kurz>`, `fix/<kurz>`.
   Beispiel: `ux/kompakte-impfliste`.
3. **Umsetzen mit Claude.** Zu Beginn der Sitzung den Link oder Text des Issues geben. Für größere
   Änderungen erst einen Plan erstellen lassen. Claude schreibt Spezifikation und Änderungsverlauf
   mit (`CLAUDE.md`).
4. **Prüfen:** `npm run pruefen`, Ablauf im Browser, betroffene Zeilen der Prüfliste
   ([ENTWICKLUNG.md](ENTWICKLUNG.md)).
5. **Pull Request** mit der Vorlage: was, warum, Bildschirmfoto, Häkchen der Checkliste.
6. **Review** durch die zuständige Rolle und die Projektleitung. Anmerkungen im Pull Request.
7. **Merge** durch die Projektleitung, als Squash — ein Commit je Thema auf `main`.

**Kleine Schritte.** Ein Pull Request, der eine Sache ändert, ist in Minuten geprüft. Große Dateien
(`docs/SPEZIFIKATION.md`, `stil/global.css`) ändern viele gleichzeitig: Vor dem Pull Request
`main` einarbeiten lassen; Konflikte im Änderungsverlauf löst Claude, indem beide Zeilen stehen
bleiben.

**Vorführstände.** Was in einem Termin gezeigt wird, bekommt ein Tag (`vorfuehrung-JJJJ-MM-TT`),
damit sich der Stand später wiederfinden lässt.

## Gestaltung (UX/UI)

- Figma für Erkundung und Klick-Dummies; der Code für die Prüfung gegen echte Abläufe.
  Gestaltungsvariablen und Bausteine in [GESTALTUNG.md](GESTALTUNG.md) — in Figma gleich benennen.
- Im Issue den **Frame verlinken** und den betroffenen UX-Grundsatz nennen (Spezifikation 2.2).
  Keine Bildschirmfotos aus internen Figma-Dateien hochladen.
- Claude kann Figma-Frames lesen, wenn die Figma-Anbindung (MCP-Server von Figma) in Claude
  eingerichtet ist. ⚠ Voraussetzungen auf Seiten von Figma (Plan, Dev Mode) vorher klären. Ohne
  Anbindung: Frame beschreiben oder ein Bild in die Sitzung geben — nicht ins Repository.
- Neue Bausteine nach `packages/pvs/src/bausteine/`, neue Farben nur als Variable.

## Medizin

| Was                                                 | Wo                                                                     |
| --------------------------------------------------- | ---------------------------------------------------------------------- |
| Personen, Termine, Einträge der Praxis              | `packages/pvs/src/daten/startdaten.ts`                                 |
| Einträge in der ePA (Dokumente, Listen, Medikation) | `packages/epa-sim/src/startbestand.ts`                                 |
| Kataloge (ICD-10-GM, Arzneimittel, Impfstoffe …)    | `daten/kataloge/*.json`, danach `node werkzeuge/kataloge-erzeugen.mjs` |
| Fachliche Regeln                                    | `packages/kern/src/fachlogik/` (etwa `amts.ts`, `abrechnung.ts`)       |
| Wozu ein Beispiel da ist                            | `docs/SPEZIFIKATION.md`, Abschnitt 3.1 — jedes Beispiel mit Zweck      |

- Alles ist **erfunden**, aber klinisch plausibel. Keine echten Fälle, auch nicht anonymisiert.
- Codes nur aus den Katalogen oder mit Quelle; ungeprüfte Zuordnungen kennzeichnen (⚠).
- Ein neues Beispiel zeigt etwas, das die Demo vorher nicht zeigen konnte — sonst weglassen.
- Fachliche Bewertungen als ▸ kennzeichnen, damit sie prüfbar bleiben.

## Vertraulichkeit

Das Repository, seine Issues und Pull Requests liegen auf GitHub; die Demo kann öffentlich gehostet
werden. Was in `CLAUDE.md` unter „Was nie ins Repository darf" steht, gilt deshalb auch für
**Issues, Kommentare, Branch-Namen und Commit-Betreffe**.

- Interne Hintergründe — Termine, Positionen, Entwürfe, Planungen — bleiben in den internen
  Kanälen. Im Issue steht die Anforderung, nicht ihre interne Herkunft.
- **Keine internen Unterlagen in eine Claude-Sitzung geben, die am Repository arbeitet.** Was
  Claude liest, kann in Code, Kommentare oder Dokumentation einfließen.
- `npm run pruefen` enthält die Vertraulichkeitsprüfung; im Workflow läuft sie mit der
  Repository-Variable `VERTRAULICH_MUSTER`.

## Was Claude sich merkt — und was nicht

Jede Person hat ihren eigenen Claude-Zugang. Was Claude in einer Sitzung lernt, bleibt bei dieser
Person. **Gemeinsames Wissen gehört ins Repository:** Regeln in `CLAUDE.md`, Fachliches in der
Spezifikation, Entscheidungen in `docs/entscheidungen/`. Wer eine neue Regel vereinbart, trägt sie
dort ein — dann gilt sie für alle Sitzungen.
