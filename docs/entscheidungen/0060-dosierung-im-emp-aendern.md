# 0060 — Dosierung im eMP ändern: drei Wege nach dem IG

**Datum:** 03.11.2026 · **Status:** angenommen · **ergänzt:** 0054, 0055

## Zusammenhang

Im Praxisalltag ändert sich die Dosierung einer laufenden Medikation oft. In der Demo ging das nicht:
Die Planzeile bot nur „pausieren“, „absetzen“ und „fehlerhaft“. Ein Rezept aus der Planzeile mit
neuer Dosierung erschien in der Medikationsliste, der Plan blieb unverändert, und aus der Liste ließ
sich der Eintrag nicht übernehmen — „in den Plan“ hätte einen zweiten Eintrag angelegt.

Der IG `de.gematik.epa.medication` 1.4.0-ballot.1 sieht drei Wege vor:

- **Editieren von eMP-Einträgen** — `$update-emp-entry`; das Primärsystem MUSS das Aktualisieren
  ermöglichen, bei einer Dosierungsänderung bestätigt der Anwender den Abschluss.
- **Pflege des eMP im Rahmen der Rezeptierung – Aktualisieren eines eMP-Eintrags** — beim
  Verschreiben aus dem eMP wird der Eintrag mit angepasst; das Primärsystem schreibt ihn selbst
  fort, der E-Rezept-Fachdienst verknüpft die Verordnung nur.
- **Pflege des eMP aus der eML – Aktualisierung eines eMP-Eintrags** — `$link-emp` übernimmt
  Arzneimittel und Dosierung des Listeneintrags, wenn der Eintrag nicht schon Neueres aufgenommen
  hat.

Zwei Abweichungen des Simulators standen dem entgegen: `$link-emp` brach ab, sobald `basedOn` des
Listeneintrags schon auf den Planeintrag zeigte, und die Abgabe übernahm auch ohne Austausch die
Dosierung der Verordnung in den Plan.

## Entscheidung

1. **„Dosierung ändern“ an der Planzeile** mit derselben Dosierungseingabe; „Dosierung übernehmen“
   ist die Bestätigung. Mit eMP `$update-emp-entry` (gelesene Fassung, Lesenachweis), ohne eMP im
   Plan der Praxis.
2. **„Dosierung im Plan anpassen“ im Rezeptformular**, sobald die Dosierung eines Rezepts aus dem
   Plan vom Startwert abweicht; vorausgewählt. Beim Signieren erst `$update-emp-entry`, dann die
   Verordnung. Im eMP nur ärztlich; im Plan der Praxis immer.
3. **„Plan aktualisieren“ in der Medikationsliste** für einen verknüpften Listeneintrag mit
   abweichender Dosierung, den der Planeintrag noch nicht in `extension[activity]` führt
   (`$link-emp`). Nur, wenn der Listeneintrag jünger ist als der Planeintrag: Eine ältere
   Verordnung böte sonst an, eine spätere Änderung des Plans zurückzudrehen.
4. **Simulator nach den Diagrammen:** `$link-emp` antwortet nur dann ohne Änderung, wenn der Eintrag
   den Listeneintrag schon aufgenommen hat (IG-MED-BL-LINK-EMP-ENTRY-V2); die Abgabe übernimmt die
   Dosierung nur bei `substitution.wasSubstituted` (IG-MED-BL-PROVIDE-DISPENSATION-ERP-V4).
5. Das Dosierungsfeld heißt „Dosierungstext“: Im Rezept ist es der Text der Verordnung.

## Verworfene Alternativen

- **Den Plan beim Verschreiben immer mitändern.** Eine abweichende Dosierung auf einem Rezept kann
  gewollt einmalig sein (etwa eine Startpackung); der IG lässt die Anpassung beim Verschreiben offen.
- **„in den Plan“ auch für verknüpfte Einträge.** `$add-emp-entry` legt einen neuen Eintrag an; beim
  selben Arzneimittel wäre das eine Doppelung, und der Dienst lehnte es ab
  (`MEDSVC_EMP_ENTRY_ALREADY_EXISTS`).
- **Nur den Simulator korrigieren.** Weg 3 allein verlangt einen Umweg über Rezept und Liste für eine
  Änderung, die im Praxisalltag direkt am Plan erfolgt.

## Nachtrag (08.11.2026)

- **Zu 2:** Die Anpassung ist eine ärztliche Entscheidung — im eMP wie im Plan der Praxis nur
  ärztlich. Sie gilt mit dem Rezept der Ärztin, gleich ob signiert oder in den eigenen
  Signaturstapel gelegt; die Planänderung beim Signieren aus dem Stapel nachzuholen hieße, sie am
  vorbereiteten Rezept zu speichern. Fehlt der Planeintrag im geladenen Stand, bricht der Vorgang
  ab, statt nur zu verordnen.
- **Zu 3:** Angeboten nach der Bedingung des Dienstes (kein Aktivitätsnachweis später als der
  Listeneintrag) und nur, wenn der Plan seitdem nicht von Hand geändert wurde; gleiche
  Zeitstempel — etwa nach dem Storno einer Abgabe — schließen es nicht mehr aus. Verglichen wird das
  Dosierungsschema, nicht der Text.
- **Zu 4:** Storniert die Apotheke eine Abgabe ohne Austausch, deren Verordnung eine andere
  Dosierung trug als der Plan, setzt der Dienst den Planeintrag nach REMOVE-DISPENSATION-V2 nicht
  zurück: Die „stop version“ verlangt gleiches Arzneimittel und gleiche Dosierung, die Abgabe
  übernahm aber nur das Arzneimittel. Der Simulator folgt dem IG wörtlich (▸ Lücke im Ballot).
