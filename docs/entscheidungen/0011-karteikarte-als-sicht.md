# 0011 — Die Karteikarte ist eine Sicht, kein Duplikat

**Datum:** 09.09.2026 · **Status:** angenommen

## Zusammenhang

Bisher schrieb das Anlegen einer Diagnose zusätzlich einen Karteikarteneintrag mit dem
Diagnosetext. Das entspricht dem, was Praxissysteme tun, hat aber eine Folge: Wird die
Diagnose später geändert, bleibt der Karteitext auf dem alten Stand stehen.

## Entscheidung

Strukturierte Sachverhalte werden **nicht** als Karteitext gespeichert. Der Verlauf der
Karteikarte entsteht aus zwei Quellen:

- **freie Notizen** unter den Kürzeln A, B, T und S — sie werden gespeichert;
- **abgeleitete Einträge** aus Diagnosen, Allergien, Laborwerten und dem Medikationsplan
  (D, AL, L, M) — sie werden bei jeder Anzeige aus dem jeweiligen Bestand gebildet
  (`verlaufBilden` im fachlichen Kern).

Jeder abgeleitete Eintrag nennt seinen Bestand und führt über einen Verweis dorthin, wo er
gepflegt wird.

## Begründung

Eine mitgeschriebene Textfassung wäre eine zweite Wahrheit, die beim ersten Ändern
veraltet. ▸ Das ist derselbe Fehler, der bei der Patient Summary vermieden werden soll —
die Karteikarte führt im Kleinen vor, was dort im Großen gefordert wird: eine Sicht, kein
Duplikat. Damit ist die Architekturempfehlung nicht nur behauptet, sondern im eigenen Bau
angewandt.

## Verworfen

**Text mitschreiben und bei Änderung nachziehen** — verlangt, an jede Änderung zu denken;
genau das misslingt in der Praxis.
**Diagnosen als Freitext auf der Karteikarte zulassen** — bequem, aber dann gäbe es
Diagnosen, die in keiner Liste stehen.

## Folgen

Die Kürzelmenge ist um `AL` für Allergien erweitert. Die Schnellerfassung bietet nur noch
die Freitextkürzel an und verweist für alles Übrige in den zuständigen Bereich.
