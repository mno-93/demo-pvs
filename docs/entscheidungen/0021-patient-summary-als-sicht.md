# 0021 — ✦ Patient Summary als Sicht mit Quelle je Abschnitt

**Datum:** 28.09.2026 · **Status:** angenommen für die Demo · **Kennzeichnung:** ✦ Vorschlag, nicht
spezifiziert · **baut auf:** 0018, 0019 · **Auswahl der Einträge geändert durch:** 0022 (Markierung)

## Zusammenhang

Mit dem Diagnose-Service (0018) gibt es geführte Quellen für Allergien und Diagnosen, dazu den
Medikationsplan und strukturierte Laborbefunde. Die Patient Summary soll daraus entstehen, schnell
einen Überblick geben und direkt erreichbar sein. Offen war, wie sie Teil der ePA ist und zugleich
in bestimmten Abschnitten bearbeitbar — ohne einen zweiten Datenbestand zu schaffen.

Drei Möglichkeiten standen zur Wahl: ein bearbeitbares Dokument, eine automatisch erzeugte Sicht
aus allen Daten der ePA, oder eine Sicht auf geführte Quellen.

## Entscheidung

1. Die Patient Summary ist eine **Sicht**: Das Aktensystem bildet sie bei jeder Abfrage aus seinen
   Diensten (`Patient/$summary` nach dem Muster von HL7 IPS) als Bundle nach der European Patient
   Summary (`bundle-eu-eps`, `composition-eu-eps`). Sie wird nicht gespeichert.
2. Sie hat **keine eigene Eingabe**. Jeder Abschnitt nennt in einer Extension seine Quelle
   (`ps-section-source`); die Oberfläche führt von dort in den Bereich, in dem die Quelle gepflegt
   wird — Allergien und Diagnosen in den Splitscreen, Medikation in den Medikationsplan.
3. Quellen: Allergienliste und Diagnosenliste (gültig, aktuell), Medikationsplan (aktiv,
   pausiert; ohne Plan die Medikationsliste), strukturierte Laborbefunde (jüngster Wert je
   Untersuchung). Abschnitte ohne Quelle tragen `emptyReason`.
4. Die Oberfläche unterscheidet **geführte** und **automatische** Quellen und „Information nicht
   verfügbar" von „Keine bekannten Allergien".
5. Zugang mit einem Klick aus dem Patientenkopf; im ePA-Fenster der erste Reiter.
6. Eine Demo-Steuerung stellt die Sicht aus geführten Quellen der Sicht aus nur automatischen Daten
   gegenüber.

## Begründung

▸ Eine Sicht vermeidet Duplikate: Jede Angabe wird an genau einer Stelle gepflegt, und die
Patient Summary kann ihr nicht widersprechen. Die Quelle je Abschnitt macht sichtbar, **wer** eine
Angabe verantwortet — ärztlich geführte Liste oder automatische Ableitung — und **wo** sie zu
ändern ist. Damit ist die Patient Summary Teil der ePA und doch abschnittsweise bearbeitbar, ohne
selbst ein Formular zu sein.

▸ Die Gegenüberstellung „geführt gegen automatisch" zeigt am Beispiel, was eine rein automatisch
erzeugte Patient Summary heute leistet: Die sicherheitsrelevanten Blöcke Allergien und Diagnosen
bleiben leer.

## Verworfen

**Bearbeitbares Dokument** — schafft einen zweiten Bestand neben den Listen, der veraltet.
**Automatische Sicht aus allen Daten der ePA** — ohne Relevanzauswahl leer, wo es zählt, oder
überladen, wo Dokumente vorliegen; sie bleibt als Vergleich in der Demo-Steuerung.
**Eigener Bereich in der Patientenkartei** — die Patient Summary gehört zur ePA (0014).

## Offen

Gespeicherte Fassung für den Abruf aus dem Ausland, rechtliche Authentifizierung des Kopfs,
Umfang je Block, Quellen für Impfungen, Prozeduren und Implantate — siehe
[SPEZIFIKATION.md](../SPEZIFIKATION.md), Abschnitt 7.6.
