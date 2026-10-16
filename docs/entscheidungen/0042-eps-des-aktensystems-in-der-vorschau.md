# 0042 — Die leere ePS des Aktensystems in der Vorschau auf ePA 3.2

**Datum:** 16.10.2026 · **Status:** angenommen · **ergänzt:** 0021, 0034, 0041

## Zusammenhang

Die gematik hat den MHD-IG `de.gematik.epa.mhd` 1.2.0-ballot.1 veröffentlicht, Ballot für ePA 3.2.0.
Mit ihm wird die ePA European Patient Summary über MHD greifbar:

- Eine Suche mit `type=http://loinc.org|60591-5` und `status=current` erzeugt sie samt
  DocumentReference (IG-MHD27048WTV).
- Primärsystem, FdV und NCPeH SOLLEN sie so abrufen (IG-MHD35244MFP).
- Clients DÜRFEN sie weder einstellen noch löschen noch ändern.
- Ihr Inhalt folgt `gemIG_ePA_ePS` 1.0.0-ballot.1: in der ersten Stufe leer — fünf Pflicht-Sections
  mit „Erforderliche Informationen können nicht ermittelt werden.“

Die Demo zeigte bisher nur die ✦ Patient Summary ab Weiterentwicklung 3 (ADR 0021). Was die
Spezifikation selbst liefert, war nicht zu sehen. Gerade dieser Vergleich trägt die Aussage der Demo:
Ohne geführte Quellen bleibt der Rahmen leer.

Zwei Hindernisse:

- Die Profile des Ballots kollidieren mit denen des Releases: `epa-mhd-document-reference` gibt es
  in 1.1.3 und in 1.2.0 unter derselben Adresse.
- Das Paket `de.gematik.epa.eps` liegt nicht in der FHIR-Registry. Ein Validator lädt es nicht von
  selbst.

## Entscheidung

1. **Die Vorschau bildet die ePS des Aktensystems nach** — ab Weiterentwicklung 1, der Vorschau auf
   ePA 3.2. Der MHD Service des Simulators erzeugt sie bei der Suche nach dem Ballot und liefert sie
   über ITI-68 aus. Inhalt wie das Beispiel des ePS-IG, leer. Release 3.1.3 kennt sie nicht.
2. **Das Praxissystem zeigt sie am Platz der Patient Summary**, solange es den ✦ Dienst nicht gibt
   (bis Weiterentwicklung 2). Gezeigt werden nur die Abschnitte, die sie führt, mit dem Marker „vom
   Aktensystem erzeugt · Ballot ePA 3.2“. Ab Weiterentwicklung 3 steht dort die ✦ Patient Summary.
3. **Nur die ePS folgt 1.2.0.** Alle übrigen MHD-Wege und Kennungen bleiben bei 1.1.3. Die erzeugte
   DocumentReference nennt ihr Profil mit Version (`|1.2.0`).
4. **Pflichtfelder, die die Vorschrift offenlässt, belegt die Demo wie beim dgLP-Befund** —
   `masterIdentifier` und Speicherort `epa`, gekennzeichnet mit ⚠. Der Befund geht in den Abgleich
   (SPEZIFIKATION 5.13).
5. **Vorschau-Lauf des Validators:** Ausgaben, deren Profil oder deren Einträge auf einen Ballot der
   Vorschau zeigen, prüft ein zweiter Lauf gegen die Ballot-Pakete. Das ePS-Paket kommt als Datei von
   gemspec mit fester Prüfsumme — in der CI vom Job geholt, lokal einmal abgelegt.

## Verworfene Alternativen

- **Den Inhalt der ✦ Patient Summary über den MHD-Weg ausliefern.** Ein spezifizierter Weg mit dem
  Inhalt eines Vorschlags vermischt beides und verstößt gegen „kein erfundener Weg“: Was ein
  Vorschlag ist, liegt unter `/epa/vorschlag/…`.
- **Beide nebeneinander zeigen, auch ab Weiterentwicklung 3.** Zwei Patient Summaries in einer Akte
  wären genau die Konkurrenz, die der Vorschlag vermeiden will. Die ✦ Patient Summary füllt den
  Rahmen des Aktensystems; sie steht nicht daneben.
- **Den ganzen MHD Service der Vorschau auf 1.2.0 heben.** Simplified Publish, neue Kennungen für
  alle Dokumente, Ablösung von ITI-41 — ein eigener Schritt mit Folgen für den Arztbrief (7.8), nicht
  Voraussetzung für den Vergleich.
- **Knopf im Patientenkopf auch für die ePS.** Er bräuchte bei jedem Öffnen der Kartei eine Suche,
  die jedes Mal eine neue ePS erzeugt — sichtbar im Aufrufprotokoll ohne fachlichen Anlass.
- **Ballot-Profile im Hauptlauf des Validators laden.** Zwei Fassungen desselben Profils in einem
  Lauf; unversionierte Verweise der 3.1.3-Wege würden gegen 1.2.0 geprüft.
- **Das ePS-Paket ins Repository legen.** Fremdes Binärpaket im öffentlichen Repository, ohne
  Gewähr, dass es dem veröffentlichten entspricht. Die Prüfsumme gegen die Quelle leistet dasselbe
  ohne Kopie.
