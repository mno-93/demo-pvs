# 0063 — Jede Änderung eine Fassung, Löschen mit Spur

**Datum:** 16.11.2026 · **Status:** angenommen · **ergänzt:** 0004, 0022, 0049, 0062

## Zusammenhang

Frühere Stände der Patient Summary entstehen aus der Geschichte der Quellen (ADR 0062). Das trägt
nur, wenn jede Änderung an einem Eintrag eine neue Fassung ist und jede Löschung eine Spur
hinterlässt. Drei Stellen hielten das nicht ein:

- **Startbestand.** Er setzte die Markierung `ps-relevant` nachträglich an der Instanz, ohne neue
  Fassung. Die gesicherte Fassung 1 trug sie nicht. Hob jemand die Markierung auf oder änderte den
  Eintrag, fiel er rückwirkend aus allen früheren Ständen; der Verlauf meldete die Entfernung nicht.
- **Löschen.** Die Löschung selbst hatte keinen Zeitpunkt; `_history` der Common Query API zeigte sie
  nicht. Zwei Löschstellen (Arzneimittel nach Storno, entfallene Behandlungsgründe) sicherten die
  letzte Fassung nicht.
- **Widerspruch gegen das Einstellen der E-Rezept-Daten.** Er leerte die Ablage an der gemeinsamen
  Schreibmechanik vorbei. Fassungsarchiv und Löschmarken blieben stehen; nach erneuter Zustimmung
  kamen die gelöschten Fassungen über `_history` und frühere Stände zurück.

Dazu liefen die Demo-Uhren von Praxissystem und Simulator nach Mitternacht auseinander (ADR 0049).

## Entscheidung

1. **Die Markierung gehört zur Fassung.** Der Startbestand markiert beim Anlegen
   (`BEIM_ANLEGEN_RELEVANT` in `startbestand.ts`); `$update-…-entry` übernimmt sie aus dem Bestand
   (ADR 0022). Jede Änderung danach ist eine neue Fassung mit Änderungs- und Chronologieeintrag.
2. **Löschen hinterlässt eine Spur.** `loeschen()` sichert die letzte Fassung, hält den Zeitpunkt fest,
   und `_history` (Instanz und Typ) nennt den Löscheintrag: `request.method` DELETE, ohne Ressource
   (FHIR http#history).
3. **Vernichten ist etwas anderes als Löschen.** Wo das Konzept die Daten löscht, nicht nur einzelne
   Einträge (Widerspruch gegen das Einstellen, Konzept 3.1.3), leert `ablageLeeren()` Ablage,
   Fassungsarchiv und Löschmarken zusammen. Danach gibt es keine Geschichte mehr — auch keine
   früheren Stände der Patient Summary für diese Daten.
4. **Eine Uhr nach dem Zurücksetzen.** Beim Zurücksetzen beginnen die Demo-Uhren von Simulator und
   Praxissystem neu (`demoUhrNeuBeginnen`); der heutige Tag ist wieder der Demo-Tag.

## Verworfene Alternativen

**Die Archivfassung des Startbestands nachträglich überschreiben.** Hielte die Rekonstruktion
richtig, aber das Archiv wäre nicht mehr unveränderlich — genau die Eigenschaft, auf der ADR 0062
beruht.

**Fassungsarchiv und Löschmarken als Felder am Bestand statt an der Ablage.** Sauberer als die
Bindung an das Array (`WeakMap`), aber ein Umbau aller Schreibwege. ▸ Bei einer echten Persistenz
wäre das der erste Schritt: Fassungen und Löschzeitpunkte als Teil des Datensatzes, geschrieben nur
transaktional über einen Weg.

**Eine gemeinsame Uhr im Simulator, vom Praxissystem abgefragt.** Schon in ADR 0049 verworfen; die
Uhr ist Demo-Steuerung, keine Schnittstelle der ePA.

## Folgen

- Ein Test hält fest, dass frühere Stände gleich bleiben, wenn ein markierter Eintrag des
  Startbestands entmarkiert wird; ohne Punkt 1 schlägt er fehl.
- Wer künftig an der Ablage vorbei schreibt — `push`, `splice` oder Zuweisung außerhalb von
  `schreibwege.ts` und den Diensten, die über Änderungseinträge schreiben —, bricht die
  Rekonstruktion. Die Regel steht in ARCHITEKTUR.md.
