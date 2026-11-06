## Was und warum

<!-- Kurz. Bezug: Closes #… -->

## Bildschirmfoto

<!-- Vorher / nachher, aus der laufenden Demo. Keine Bilder aus internen Unterlagen. -->

## Checkliste

- [ ] `npm run pruefen` grün — mit `.vertraulich-muster` im Wurzelverzeichnis
- [ ] Im Browser geprüft; betroffene Zeilen der Prüfliste (`docs/ENTWICKLUNG.md`), Konsole ohne Fehler
- [ ] Simulator oder Build berührt → `BASIS=/demo-pvs/ npm run build:gehostet`
- [ ] `docs/SPEZIFIKATION.md` fortgeschrieben, Änderungsverlauf ergänzt
- [ ] Neue Beispiele mit Zweck in Spezifikation 3.1, neue Abläufe in Abschnitt 11, neue Funktionen in der Prüfliste
- [ ] Klickpfade mitgezogen: Abbild weicht ab → Texte des Klickpfads geprüft, dann `npm run klickpfade:abbilden`; betroffene Klickpfade im Browser angesehen (`docs/KLICKPFADE.md`)
- [ ] Keine Erklärtexte in der Oberfläche; Farben nur über Variablen; per Tastatur bedienbar
- [ ] Nur erfundene Daten, keine internen Bezüge, keine Herstellernamen
