# Architektur

## Überblick

```
   ┌──────────────────────────┐   HTTP      ┌────────────────────────────┐
   │  @demo-pvs/pvs           │ ──────────► │  @demo-pvs/epa-sim         │
   │  Praxisverwaltung        │  Information│  ePA-Simulator, 3.1.3      │
   │                          │  Befugnis   │  (+ E-Rezept-Fachdienst,   │
   │                          │  E-Rezept   │   Demo-Ersatz)             │
   │  React 19, Vite          │  MHD ITI-67 │  Fastify, Daten im Speicher│
   │  eigener Datenbestand    │  MHD ITI-68 │  Befugnisse, Dokumente,    │
   │                          │  Medication │  Medikation                │
   │                          │  ✦ Listen   │  (+ ✦ Diagnose-Service)    │
   │                          │  ✦ Summary  │  (+ ✦ Patient Summary)     │
   │                          │ ◄────────── │                            │
   └────────────┬─────────────┘             └─────────────┬──────────────┘
                └───────────────┬────────────────────────┘
                     ┌──────────▼──────────┐
                     │  @demo-pvs/kern     │
                     │  Typen, Kataloge,   │
                     │  Fachlogik, FHIR    │
                     └─────────────────────┘
```

## Die Systemgrenze ist der Gegenstand

Die zentrale Aussage der Patient-Summary-Konzeption ist eine Aussage über eine Grenze: Was liegt im Primärsystem,
was in der Akte, wer darf was ändern. Liefe beides im selben Prozess, wäre diese Grenze ein Kommentar
im Quelltext. Über HTTP ist sie überprüfbar — was das PVS nicht abruft, hat es nicht.

Daraus folgen drei Regeln, die beim Weiterbauen einzuhalten sind:

1. **Das PVS greift nie direkt auf den Datenbestand des Simulators zu.** Jeder Zugriff läuft über den
   ePA-Client in `packages/pvs/src/epa/`.
2. **`kern` kennt weder React noch Fastify.** Alles, was in beiden Anwendungen gilt — Typen, Kataloge,
   Fachlogik, FHIR-Abbildung — liegt dort und ist ohne Oberfläche testbar.
3. **Jede Ansicht sagt, welchen Bestand sie zeigt.** Lokale Daten und ePA-Daten werden nie stillschweigend
   vermischt. Ein Datensatz wechselt die Seite nur durch eine benannte Handlung.
4. **Die Oberfläche erklärt nicht, die Dokumentation schon.** Keine Erklärtexte in Ansichten;
   was eine Ansicht zeigt, steht in [SPEZIFIKATION.md](SPEZIFIKATION.md) —
   [0020](entscheidungen/0020-selbsterklaerende-oberflaeche.md).

## Schnittstellen nach Release 3.1.3

Der Simulator folgt den Implementation Guides des Release ePA 3.1.3 —
[0013](entscheidungen/0013-epa-zugriffe-nach-release-3-1-3.md),
[0019](entscheidungen/0019-konformitaet-mit-den-implementation-guides.md). Dokumente über den
MHD Service (`epa-sim/src/mhd.ts`: ITI-67 mit Volltext, ITI-68), Medikation über den Medication
Service (`epa-sim/src/medikation.ts`: Liste, Plan, Plan-Log, EMP-Operationen, Nachtrag,
Verknüpfung). Gemeinsame Schreibmechanik in `epa-sim/src/schreibwege.ts`
(`X-Requesting-Organization`, `EPAActivityProvenance`, Versionierung) und
`epa-sim/src/chronologie.ts` (Chronologieeinträge, Lesenachweis, 409). Einzelne Diagnosen,
Allergien oder Laborwerte gibt es im Release nur in Dokumenten; das Praxissystem zerlegt sie
selbst (`kern/fachlogik/dokumentinhalt.ts`).

Der Simulator wird in `epa-sim/src/anwendung.ts` aufgebaut (`simulatorBauen()`), `server.ts`
startet ihn. Prüfkette und Wege stehen in `wege.ts`; sie hängen lokal am Fastify-Server und in
der gehosteten Demo an einem Browser-Adapter (`browser.ts`), der `Request`-Objekte beantwortet —
[0025](entscheidungen/0025-gehostete-demo-mit-simulator-im-browser.md). Tests prüfen den
Simulator über `inject` und den Adapter über `Request` ohne laufenden Dienst.

Im PVS sieht man die ePA in einem eigenen Fenster über der Kartei, nicht als Reiter —
[0014](entscheidungen/0014-epa-als-fenster.md).

## Befugnis

Jeder Fachdienst verlangt eine gültige Befugnis der Einrichtung, sonst 403 `notEntitled`. Sie
entsteht beim Einlesen der eGK (`setEntitlementPs`, 90 Tage) —
[0017](entscheidungen/0017-befugnis-ueber-behandlungskontext.md). Im Simulator:
`epa-sim/src/befugnis.ts` und die Prüfkette im `onRequest`-Haken von `anwendung.ts` (Useragent
→ Sitzung → Akte → Befugnis). Im PVS: `pvs/src/epa/befugnis.tsx` — Einlesen, Anzeige, Abgleich mit der
Antwort der ePA. Die Sitzung am Aktensystem ersetzt die Demo durch die Kopfzeile
`x-demo-sitzung`; das ist keine ePA-Schnittstelle.

## Zustand der Akte

Vor jedem Zugriff fragt das PVS den Information Service (`epa-sim/src/information.ts`:
`getRecordStatus`, `getConsentDecisionInformation`) — ohne Befugnis, unter `/information/` statt
`/epa/` und deshalb mit eigener Prüfung. Die Akte trägt im Simulator Zustand und Widersprüche
(`bestand.ts`); die Prüfkette antwortet für eine gesperrte Akte mit 409 und am Medication Service
bei Widerspruch mit 423. Im PVS bildet `pvs/src/epa/aktenstatus.tsx` daraus den Zugangszustand
im Kopf und stellt `Abrufstand` („Stand hh:mm:ss / ↻ aktualisieren") bereit —
[0023](entscheidungen/0023-aktenstatus-und-widerspruch.md).

## E-Rezept

`epa-sim/src/erezept.ts` ist ein Demo-Ersatz des E-Rezept-Fachdienstes unter `/erp/` — kein Teil
der ePA, sondern der Weg, auf dem Verschreibung und Abgabe in sie gelangen. Er hält die Tasks im
Speicher, reiht Übertragungen in eine Warteschlange und wendet die Anwendungsfälle der
Fachdienst-Operationen des Medication Service direkt auf den Bestand an; von außen sind diese
Operationen gesperrt. Den Verordnungsdatensatz baut `kern/fhir/erezept.ts`; das PVS sendet über
`pvs/src/module/medikation/rezepte.ts` und zeigt Formular, Rezeptkarte und Stapel in
`medikation/RezeptUi.tsx` und `module/Rezeptstapel.tsx`. Rezepte sind lokaler Zustand
(`zustand.rezepte`); ihren Stand in der ePA liest das PVS aus der Medikationsliste —
[0024](entscheidungen/0024-erezept-aus-dem-plan.md).

## ✦ Weiterentwicklung: Diagnose-Service

Ab Ausbaustand „Weiterentwicklung 3" bietet der Simulator zusätzlich einen Dienst mit
Allergienliste und Diagnosenliste nach dem Muster des Medication Service und der
österreichischen e-Diagnose — [0018](entscheidungen/0018-diagnose-service-als-weiterentwicklung.md),
[0019](entscheidungen/0019-konformitaet-mit-den-implementation-guides.md). Er teilt die
Schreibmechanik mit dem Medication Service (Organisation, Änderungseintrag, Chronologie,
Lesenachweis) und nutzt für eigene Kennzeichen den Namensraum `https://example.org/demo-pvs/fhir/`.
Im PVS liest `pvs/src/epa/listen.ts` die Listen samt Chronik und Lesenachweis; `kern/fachlogik/listenabgleich.ts`
gleicht sie mit den eigenen Einträgen ab, `kern/fhir/lesen.ts` bildet FHIR auf die
Domänentypen zurück. Der Splitscreen liegt in `pvs/src/module/diagnosen/Splitscreen.tsx`.

## ✦ Patient Summary als Sicht

`epa-sim/src/patient-summary.ts` bildet die Patient Summary bei jeder Abfrage
(`Patient/$summary`) aus dem Diagnose-Service, dem Medication Service und den strukturierten
Dokumenten — Laborwerte, Prozeduren und Implantate ([0031](entscheidungen/0031-prozeduren-und-implantate-aus-dokumenten.md)) — [0021](entscheidungen/0021-patient-summary-als-sicht.md). Abschnitte und ihre
Codes legt `kern/fhir/patient-summary.ts` fest; dort liest das PVS das Bundle auch wieder. Die
Ansicht liegt in `pvs/src/epa/PatientSummary.tsx`; sie hat keine Eingabe, sondern führt über die
Quelle je Abschnitt in den pflegenden Bereich der Kartei.

Welche Einträge der Listen die Patient Summary zeigt, bestimmt die Relevanzmarkierung am
Listeneintrag (`ps-relevant`, gesetzt über `$flag-…-entry`) —
[0022](entscheidungen/0022-relevanzmarkierung-in-den-listen.md). Im PVS liegen Schalter und Marke
in `pvs/src/bausteine/PsMarke.tsx`; die Farbe steht als `--ps` in `stil/global.css`.

✦ Die Impfliste (`epa-sim/src/diagnosedienst.ts`, `impflisteEinhaengen`) nutzt dieselben
Listenwege wie Allergien und Diagnosen, unter eigener Basis und ebenfalls ab „Weiterentwicklung 3"
([0026](entscheidungen/0026-impfliste-als-zentrale-liste.md)); im PVS lesen und schreiben
`pvs/src/epa/impfliste.ts` und `pvs/src/module/Impfungen.tsx`.

„Neu seit dem letzten Aufruf" liegt ganz im PVS: `kern/fachlogik/aenderungen.ts` vergleicht
Kennung und Fassung je Eintrag mit dem gemerkten Stand, `pvs/src/epa/gesehen.tsx` merkt ihn je
Person und Sicht im Zustand (`epaGesehen`) und zeichnet Band und Marke —
[0027](entscheidungen/0027-neu-seit-dem-letzten-aufruf.md). Den Verlauf je Besuch bildet
`kern/fachlogik/verlauf.ts` (`besucheBilden`) —
[0028](entscheidungen/0028-verlauf-nach-besuchen.md).

**Abfrage „seit".** Medikation und Dokumente fragen Änderungen mit den spezifizierten Parametern
ab (`epa/klient.ts`: `planaenderungenSeit`, `medikationslisteSeit`, `dokumenteSeit`); das
Lesezeichen merkt `epa/lesezeichen.ts` je Person und Bestand, den Vergleich zweier Planstände
`kern/fachlogik/aenderungen.ts` (`staendeVergleichen`). Im Simulator stehen die Parameter in
`medikation.ts` und `mhd.ts`, der Datumsvergleich in `fhir-hilfen.ts` (`imZeitraum`) —
[0030](entscheidungen/0030-abfrage-seit-nach-spezifikation.md).

**Ordnung der Listen.** `kern/fachlogik/listenordnung.ts` ordnet Einträge nach Einstellung,
Beginn, Bezeichnung oder eigener Reihenfolge; `pvs/src/module/diagnosen/ordnung.ts` merkt sie je
Person und Liste im Zustand (`listenordnung`), `Splitscreen.tsx` stellt kompakte, aufklappbare
Zeilen bereit — [0029](entscheidungen/0029-kompakte-listen-und-ordnung.md).

**Demo-Uhr.** `DEMO_HEUTE` und `demoJetzt()` im Kern sind das „heute" beider Seiten: Zeitpunkte
von Einträgen, Befugnisende und Ablaufprüfung rechnen damit, im PVS wie im Simulator.

Der Ausbaustand ist Demo-Steuerung (`POST /verwaltung/betriebslage`). Im Release 3.1.3 antwortet
der Dienst mit 404; das PVS erkennt das am CapabilityStatement und sagt es.

## Terminologie und Befunde

Diagnosen und Allergien werden nach dem Informationsmodell der Patient Summary erfasst. SNOMED CT
kommt im Hintergrund dazu: über einen Kodierservice-Auszug bei Diagnosen, über die national
abgestimmte Werteliste bei Allergien — [0015](entscheidungen/0015-terminologie-im-hintergrund.md).
Die Allergie-Wertelisten übernimmt `werkzeuge/wertelisten-vom-zts.mjs` vom Zentralen
Terminologieserver, die registrierten Dokumenttypen `werkzeuge/formatcodes-aus-xds.mjs` aus dem Repository ePA-XDS-Document.

Laborwerte werden nicht erfasst, sondern aus Laborbefunden nach dgLP gelesen —
[0016](entscheidungen/0016-laborwerte-nur-aus-befunden.md). Im Release 3.1.3 liegen Befunde als
PDF vor (`kern/fachlogik/pdf.ts` erzeugt sie); das PVS zeigt sie an, liest aber keine Werte daraus.

## Zustand im PVS

Ein kleiner Speicher auf `useSyncExternalStore` statt einer Bibliothek — siehe
[0003](entscheidungen/0003-eigener-zustandsspeicher.md). Der Zustand ist ein einziges unveränderliches
Objekt; Änderungen laufen über benannte Vorgänge in `packages/pvs/src/speicher/vorgaenge.ts`.
Das hält die Handlungen der Anwendung an einer Stelle auf und macht sie zählbar — Grundlage für den
Aufwandszähler ab M4.

## Was bewusst fehlt

Anmeldung am Aktensystem (ID-Token, VAU), Befugnisse durch die versicherte Person, das
Widerspruchsverfahren selbst (die Demo setzt Widersprüche über die Demo-Steuerung), Protokollierung,
QES, VSDM, PoPP, NCPeH, die Erzeugung der Patient Summary. Diese
Teile sind für die Fragestellung nicht nötig und würden den Simulator zu einem Vorhaben eigener
Größe machen. Wo eine Vereinfachung fachlich relevant ist, steht sie in
[SPEZIFIKATION.md](SPEZIFIKATION.md) mit ⚠.
