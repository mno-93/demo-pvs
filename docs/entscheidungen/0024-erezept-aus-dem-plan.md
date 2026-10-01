# 0024 — E-Rezept aus dem Plan: Fachdienst-Ersatz und Verknüpfung über den eMP-Identifier

**Datum:** 29.09.2026 · **Status:** angenommen für die Demo · **baut auf:** 0013, 0019

## Zusammenhang

Die Demo zeigte, was nach einer Verordnung in der ePA steht, nicht das Verordnen selbst. Im
digital gestützten Medikationsprozess ist aber gerade die Verordnung die Stelle, an der Plan
und Liste zusammenfinden: Das Primärsystem gibt dem E-Rezept optional den eMP-Identifier des
Planeintrags mit; der E-Rezept-Fachdienst überträgt die Verschreibung asynchron in den
Medication Service, der sie mit dem Planeintrag verknüpft. Nach der Abgabe verweist der
Planeintrag auf das abgegebene Arzneimittel, bei Austausch mit geänderter Dosierung; bei
mehreren abgegebenen Arzneimitteln aktualisiert er sich nicht, und das Primärsystem muss
darauf hinweisen (IG `de.gematik.epa.medication` 1.3.5).

Praxissysteme lösen den Aufwand beim Verordnen heute vor allem durch Sammeln und Delegieren:
Die MFA bereitet vor, die Ärztin signiert gesammelt.

## Entscheidung

1. Der Simulator erhält einen **Demo-Ersatz des E-Rezept-Fachdienstes** unter `/erp` nach
   gematik `api-erp`: `Task/$create`, `Task/{id}/$activate` (mit `X-AccessCode`),
   `Task/{id}/$abort`. ⚠ Ohne VAU und ohne QES; der Verordnungsdatensatz kommt unsigniert.
2. Der Fachdienst-Ersatz überträgt **asynchron** über eine Warteschlange in den Medication
   Service — nach den Anwendungsfällen von `$provide-prescription-erp`,
   `$provide-dispensation-erp`, `$cancel-prescription-erp`, `$cancel-dispensation-erp`. Von
   außen sind diese Operationen für Primärsysteme gesperrt (403). Die Verzögerung ist
   einstellbar; der Fachdienst prüft vorher, ob eine Akte besteht und ob dem Einstellen
   widersprochen wurde.
3. Im PVS: **„Rezept"** am Planeintrag (mit eMP-Identifier), an Verordnungen der
   Medikationsliste (erneut verordnen; ist das Mittel nicht im Plan, auf Wunsch zugleich in
   den Plan) und **„neues E-Rezept"** aus dem Katalog. Das Formular zeigt die **Reichweite**.
4. **Rollen:** Die Ärztin signiert und sendet sofort oder legt in den Signaturstapel; die MFA
   bereitet vor und setzt eine Freigabe — freigegeben, mit Hinweis, gesperrt — mit Text. Die
   Seite **„Rezepte"** zeigt den Stapel der Praxis und signiert die Auswahl in einem Schritt.
5. Den Stand eines Rezepts liest das PVS **aus der ePA**: Übertragung ausstehend, in der
   Medikationsliste, eingelöst mit den abgegebenen Arzneimitteln. Am Planeintrag stehen letzte
   Verordnung und Abgabe; bei mehreren abgegebenen Arzneimitteln ein Warnhinweis.
6. Die Demo-Steuerung spielt die **Apotheke**: abgeben, mit Austausch, zwei Arzneimittel,
   Abgabe stornieren.

## Begründung

▸ Aufwand sinkt nicht durch Sammeln allein, sondern durch **Verknüpfen**: Wer aus dem Plan
verordnet, pflegt Plan und Liste in einem Schritt, und der Plan zeigt danach das tatsächlich
abgegebene Präparat. Sammeln und Delegieren bleiben nötig, aber sie ersetzen die Verknüpfung
nicht.

▸ Den Stand aus der ePA zu lesen statt aus dem Fachdienst entspricht der Rollenverteilung: Die
verordnende Praxis sieht die Einlösung nur über die Medikationsliste.

▸ Die Reichweite vor dem Senden beantwortet die häufigste Rückfrage bei Folgerezepten, ohne
einen Bildschirm zu wechseln.

## Verworfen

**E-Rezepte weiter nur im Startbestand** — zeigt das Ergebnis, nicht den Ablauf, und nicht die
Verknüpfung. **Signatur-Workflows in voller Breite** (Komfortsignatur, Weiterbildung,
Vertretung) — zeigen Praxisorganisation statt Spezifikation. **Verknüpfung nachträglich über
`$link-emp`** als Regelweg — möglich, aber doppelte Arbeit; bleibt für Nachträge.

## Offen

⚠ Stornierung einer Verschreibung: Der IG nennt an einer Stelle Löschen, an anderer
`entered-in-error`; die Demo folgt dem Anwendungsfall. ⚠ Zurücksetzen des Planeintrags nach
Stornierung einer Abgabe ist nicht ausdrücklich geregelt. Weitere Flowtypes (Direktzuweisung,
DiGA, T-Rezept), Mehrfachverordnung, Komfortsignatur, Ausdruck des Tokens.
