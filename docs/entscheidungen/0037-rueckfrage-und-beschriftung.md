# 0037 — Rückfrage beim Verfasser; Prüfung unklarer Beschriftung

**Datum:** 07.10.2026 · **Status:** angenommen · **ergänzt:** 0032, 0035, 0036

## Zusammenhang

Zwei Lücken der Versichertensicht und der Akte selbst:

- Wer in einem Dokument etwas nicht versteht oder für falsch hält, kommt aus der App nicht weiter.
  Der Lotse darf „Was bedeutet das für mich?" nicht beantworten (ADR 0036) — aber dann muss die
  Frage irgendwohin.
- Viele ePA-Dokumente sind unbrauchbar beschriftet: Scannerdateiname als Titel, „Befund",
  Hochladedatum statt Dokumentdatum, Abkürzungen als Einrichtung. In der Liste öffnet sie niemand.

## Entscheidung

1. **✦ Rückfrage mit Weiche.** Erst das Anliegen, dann der Adressat: Bedeutung → behandelnde
   Praxis; „Stimmt das?" und „Da fehlt etwas" → Einrichtung aus den Metadaten.
2. **Zeiger statt Inhalt.** Eine Nachricht nennt Dokument und Datum, nicht den Inhalt.
3. **Telefon als Grundweg, TI-Messenger nur bei Erreichbarkeit** laut ✦ Kontaktauskunft. Die Demo
   bereitet Nachrichten vor und versendet nichts.
4. **✦ Kontaktauskunft als Stellvertreter des Verzeichnisdienstes**, unter `/epa/vorschlag/…`,
   ohne Aktenbezug, exakte Suche über die Bezeichnung aus den Metadaten.
5. **✦ Prüfung der Beschriftung** im Kern, als Musterregeln; Ausgabe über den Lotsen in beiden
   Sichten. Sie berichtigt nichts.
6. **Drei unklar beschriftete Unterlagen** im Startbestand (B22–B24), damit beides vorführbar ist.

## Begründung

▸ Die Weiche verhindert den naheliegenden Fehler, jede Frage an den Verfasser zu schicken — ein
Krankenhaus ist selten der richtige Adressat für „Was heißt das für mich?".

▸ Exakte Suche statt unscharfer: Eine Kontaktauskunft, die „AGP" zur Augenpraxis macht, würde die
Lücke verdecken, die die Demo zeigen soll.

▸ Die Prüfung der Beschriftung gehört zum Lotsen, weil sie dieselbe Grundlage hat — den lesbaren
Inhalt — und dieselbe Grenze: Sie gibt wieder, was im Dokument steht, und bewertet nicht.

## Folgen

- Der Umfang für Frau Hoffmann steigt auf „9 von 10 Unterlagen gelesen". Die Antworten zu
  Nierenwerten (zwei Befunde) und Unverträglichkeiten (zwei) bleiben gleich; ein Test sichert das.
- ⚠ Ob Versicherte über den TI-Messenger Einrichtungen von sich aus anschreiben dürfen, ist nicht
  belegt. Der Messenger-Weg ist deshalb ausdrücklich Vorschlag.

## Verworfen

**Unscharfe Suche im Verzeichnis** — verdeckt das Problem unklarer Metadaten.

**Die Akte berichtigen lassen** — Metadaten gehören der einstellenden Einrichtung; ein Dienst, der
sie überschreibt, schriebe in die Akte (Verbotsliste).

**Nachricht mit Dokumentauszug** — gibt Akteninhalt in einen weiteren Kanal, ohne Nutzen: Der
Verfasser hat das Dokument.
