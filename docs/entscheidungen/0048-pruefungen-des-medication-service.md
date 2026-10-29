# 0048 — Prüfungen des Medication Service wie im Aktensystem

**Datum:** 29.10.2026 · **Status:** angenommen · **ergänzt:** 0047

## Zusammenhang

Der Simulator soll sich beim Schreiben so verhalten wie der Medication Service nach dem IG
1.4.0-ballot.1. Ein Primärsystem, das gegen die Demo funktioniert, soll auch gegen das Aktensystem
funktionieren — und umgekehrt soll die Demo dieselben Fehler melden.

Der IG legt je Operation eine Geschäftslogik fest. Zuerst prüft der Dienst die Eingabe gegen die
Profile (`MEDSVC_NO_VALID_STRUCTURE`, 422), danach Status, Verweise und Verknüpfungen, jeweils mit
festem Code. Die Profile tragen viele Regeln: `EMPMedicationRequest` allein hat 81 Invarianten mit
Fehlerschwere, darunter die von `DosageDgMP` und `TimingDgMP`, dazu Kardinalitäten, Muster und
verpflichtende Wertelisten. Der Simulator prüfte bis dahin nur eine Handvoll davon von Hand und
meldete an mehreren Stellen eigene oder ältere Codes.

## Entscheidung

1. **Die Profilregeln kommen wörtlich aus den Paketen.** `werkzeuge/profilregeln-erzeugen.mjs`
   liest die Snapshots der Medikationsprofile aus dem Paketcache und schreibt Invarianten,
   Kardinalitäten, Muster und auflösbare Wertelisten mit Paket und Version nach
   `packages/kern/src/fhir/profilregeln.json`.
2. **Die Invarianten wertet FHIRPath.js aus** (`fhirpath` 5.2.1, HL7/NLM, BSD-artige Lizenz) —
   derselbe Ausdruck wie im Profil, keine Nachbildung von Hand. Es ist die erste
   Laufzeitabhängigkeit des Kerns; der gehostete Kern wächst um rund 100 kB (gepackt 14 kB).
3. **Der Simulator prüft jede Eingabe vor der Geschäftslogik**: Planeintrag, Arzneimittel,
   Behandlungsgründe und Nachtrag. Jeder Befund wird ein Eintrag im OperationOutcome mit dem
   Element als `expression`.
4. **Die Fehlerzweige folgen der Geschäftslogik** je Operation, mit den Codes des IG: HL7
   `operation-outcome` (`MSG_RESOURCE_ID_FAIL`, `MSG_DELETED`, `MSG_OP_NOT_ALLOWED`,
   `MSG_VERSION_AWARE_CONFLICT`, `MSG_PARAM_UNKNOWN`, `MSG_BAD_SYNTAX`), die Codes des Dienstes und
   `(UN)LINKING_NOT_SUCCESSFUL`. Ein stornierter Nachtrag wird gelöscht und bleibt über die
   Historie abrufbar; Zugriffe auf ihn ergeben 410.
5. **Die Common Query API prüft ihre Suchparameter** nach dem CapabilityStatement, einschließlich
   `_has`.
6. **Selbstprüfung:** Startbestand und Ausgaben des Kerns müssen die Profilregeln erfüllen
   (Tests). So fiel auf, dass der Startbestand Zeitpunkte ohne Zeitzone führte (`epa-datetime`) und
   dass der Planeintrag in der Eingabe auf sein Arzneimittel verweisen muss (`medication[x]` 1..1,
   wie die Beispiele des IG).

## Verworfene Alternativen

- **Die Invarianten von Hand nachbauen.** Über hundert Ausdrücke, jede Abweichung ein eigener
  Fehler, jeder neue Ballot ein Abgleich von Hand.
- **Den HL7-Validator im Simulator aufrufen.** Java im Browser geht nicht; die gehostete Fassung
  des Simulators (ADR 0025) bliebe ohne Prüfung.
- **Nur die Regeln prüfen, die das Praxissystem verletzen kann.** Dann verhielte sich die Demo
  gegenüber anderen Eingaben anders als das Aktensystem.

## Grenzen

⚠ Nicht geprüft: Slices (etwa einzelne Extensions eines Profils), Typ- und Profilangaben von
Verweisen, Wertelisten außerhalb der Pakete (UCUM, Sprachen, große Kataloge), Formate primitiver
Datentypen, `_sort` und `_include`. Die Codes `MSG_NO_MATCH` und `MSG_BAD_FORMAT` nennt der IG
ohne Bedingung; die Demo meldet sie nicht.
