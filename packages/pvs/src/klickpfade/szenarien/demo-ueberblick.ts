import { szenario } from '../szenario.js';

const PATIENTENKOPF = { rolle: 'group', name: 'Patientenkopf' };
const KARTEI = { rolle: 'navigation', name: 'Bereiche der Patientenkartei' };

/**
 * Rundgang durch die Demo insgesamt — für alle, die sie zum ersten Mal sehen, auch im Team: was
 * sie kann, nach welchem Prinzip sie gebaut ist und was ePA- und FHIR-Arbeit davon haben. Eine
 * Mischung aus README, Spezifikation und Zeigen in der Demo (ADR 0061, „Rundgang“).
 */
export default szenario({
  id: 'demo-ueberblick',
  titel: 'Die Demo im Überblick',
  frage:
    'Was zeigt die Demo, nach welchem Prinzip ist sie gebaut — und was haben ePA- und FHIR-Arbeit davon?',
  aufgabe: 'Verschaffen Sie sich einen Überblick über die Demo.',
  modi: ['gefuehrt', 'frei'],
  start: {
    ausbaustand: 'release-3.1.3',
    patientId: 'p-hoffmann',
    egkEinlesen: false,
    pfad: '/',
  },
  schritte: [
    {
      kapitel: 'Worum es geht',
      kurz: 'Ein fiktives Praxissystem mit ePA-Simulator',
      lang: `Die Demo bildet den Alltag einer Hausarztpraxis so weit nach, dass sich eine Frage prüfen lässt: Was kostet eine ärztlich verantwortete Patient Summary — gemessen an der Dokumentation, die ohnehin stattfindet?

Dazu gehört ein ePA-Simulator nach den veröffentlichten Spezifikationen der gematik. Alle Personen, Einrichtungen und Befunde sind erfunden; die Demo ist kein Medizinprodukt und bildet kein Produkt nach.

Der Rundgang zeigt, was die Demo kann, wie sie gebaut ist und was ePA- und FHIR-Arbeit davon haben. Praxis und Akte stehen dafür im Startbestand.`,
      mehr: [
        { text: 'README', pfad: 'README.md' },
        { text: 'Zweck', pfad: 'docs/SPEZIFIKATION.md#1-zweck' },
      ],
    },
    {
      kurz: 'Drei Zeichen, die überall gelten',
      lang: `✦ — ein Vorschlag, nicht spezifiziert. Im Simulator liegt er unter /epa/vorschlag/… und nutzt einen eigenen Namensraum.

⚠ — unbelegt oder ein Demo-Ersatz, etwa für Anmeldung und Signatur.

▸ — eine Bewertung, etwa eine Lücke in einem Ballot.

Alles ohne Zeichen folgt einem veröffentlichten Implementation Guide. Kein erfundener Weg: Das Aufrufprotokoll nennt zu jedem Aufruf seine Grundlage.`,
      mehr: [
        { text: 'Grundsätze', pfad: 'docs/SPEZIFIKATION.md#2-grundsätze' },
        { text: 'Quellen', pfad: 'docs/QUELLEN.md' },
      ],
    },
    {
      ziel: { rolle: 'heading', name: 'Tagesübersicht' },
      kurz: 'Ein Praxistag',
      lang: `Die Sprechstunde am 9. September 2026 — die Uhr der Demo steht fest, jeder Durchlauf sieht gleich aus.

Jede Person im Bestand steht für eine Fragestellung: Frau Hoffmann ist nach einem Krankenhausaufenthalt neu in der Praxis, Herr Krüger hat dem Medikationsprozess widersprochen, Frau Weber hat keine ePA.`,
      mehr: [
        {
          text: 'Beispielbestand und wozu er dient',
          pfad: 'docs/SPEZIFIKATION.md#31-beispielbestand-und-wozu-er-dient',
        },
      ],
    },
    {
      kapitel: 'Praxisalltag mit der ePA',
      ziel: { rolle: 'link', name: 'Renate Hoffmann' },
      handlung: { art: 'klicken' },
      kurz: 'Frau Hoffmann öffnen',
      lang: 'Die Patientenkartei ist der Ort, an dem die Praxis ohnehin dokumentiert: Karteikarte, Diagnosen, Medikation, Befunde. Alles hier ist der Bestand des Praxissystems.',
    },
    {
      ziel: { rolle: 'button', name: 'eGK einlesen', in: PATIENTENKOPF },
      handlung: { art: 'klicken' },
      kurz: 'eGK einlesen',
      lang: `Ohne Befugnis gibt die ePA nichts heraus. Das Einlesen der eGK im Behandlungskontext erteilt sie für 90 Tage; danach steht „ePA-Befugnis bis …“ im Kopf.

Die Praxis führt die Befugnis nicht selbst: Antwortet die ePA mit 403, berichtigt sie ihren Stand.`,
      mehr: [{ text: 'Befugnis', pfad: 'docs/SPEZIFIKATION.md#52-befugnis' }],
    },
    {
      ziel: { rolle: 'link', name: 'Medikation', in: KARTEI },
      handlung: { art: 'klicken' },
      kurz: 'Medikation öffnen',
      lang: 'Hier treffen beide Bestände aufeinander: der Medikationsplan der Praxis und der elektronische Medikationsplan (eMP) in der ePA.',
    },
    {
      ziel: { rolle: 'region', name: 'Medikationsplan der Praxis' },
      kurz: 'Plan der Praxis, abgeglichen mit dem eMP',
      lang: `Jede Zeile sagt, ob sie mit dem eMP übereinstimmt, ob er sich geändert hat oder ob ein Eintrag nur hier steht. Ein Datensatz wechselt die Seite nur durch eine benannte Handlung — „in die ePA“, „Rezept“, „Dosierung ändern“.

Der Medication Service folgt schon dem Ballot ePA 3.2: Lesenachweis beim Schreiben, Plan und Liste über den eMP-Identifier verknüpft, E-Rezepte, die der Fachdienst in die Medikationsliste stellt.`,
      mehr: [
        {
          text: 'Medication Service',
          pfad: 'docs/SPEZIFIKATION.md#53-medication-service-ig-degematikepamedication-140-ballot1',
        },
        {
          text: 'ADR 0046',
          pfad: 'docs/entscheidungen/0046-medikationsplan-der-praxis-mit-abgleich.md',
        },
      ],
    },
    {
      kapitel: 'Steuerung und Aufrufe',
      ziel: { rolle: 'button', name: 'Konfiguration' },
      handlung: { art: 'klicken' },
      kurz: 'Konfiguration öffnen',
      lang: 'Die Konfiguration gehört nicht zum Praxissystem. Sie steuert die Demo und zeigt jeden Aufruf an die ePA.',
    },
    {
      ziel: { rolle: 'combobox', name: 'Ausbaustand' },
      handlung: {
        art: 'waehlen',
        wert: 'weiterentwicklung-3',
        anzeige: 'Weiterentwicklung 3',
      },
      kurz: 'Ausbaustand „Weiterentwicklung 3“',
      lang: `Die Demo beginnt im Release 3.1.3 — der ePA, wie sie spezifiziert ist: Briefe und Befunde als PDF, Medikation strukturiert. Jede Stufe darüber enthält die vorige:

1 · ePA 3.2: strukturierte Laborbefunde, Volltextsuche, die leere European Patient Summary. 2 · ✦ Arzt- und Entlassbriefe als FHIR-Dokument. 3 · ✦ Allergien-, Diagnosen- und Impfliste, die Patient Summary als Sicht darauf. 4 · ✦ der Aktenlotse.

So wird sichtbar, was eine Weiterentwicklung im Praxisalltag ändert — und was nicht.`,
      mehr: [
        {
          text: 'ADR 0034',
          pfad: 'docs/entscheidungen/0034-ausbaustaende-neu-geordnet.md',
        },
      ],
    },
    {
      ziel: { rolle: 'complementary', name: 'Konfiguration und Aufrufe an die ePA' },
      kurz: 'Jeder Aufruf mit seiner Grundlage',
      lang: `Unter der Steuerung steht jeder Aufruf an die ePA: Methode, Pfad, Status, Dauer und die Spezifikation, auf der er beruht. Aufgeklappt zeigt ein Eintrag Kopfzeilen und Körper.

Die Steuerung erzeugt Fehlerlagen auf Knopfdruck: Befugnis entzogen (403), Konflikt (409), Widerspruch (423), eine andere Einrichtung, die zwischendurch schreibt, eine Apotheke, die abgibt.`,
      mehr: [
        {
          text: 'Aufrufprotokoll und Demo-Steuerung',
          pfad: 'docs/SPEZIFIKATION.md#43-aufrufprotokoll-und-demo-steuerung',
        },
      ],
    },
    {
      ziel: { rolle: 'button', name: 'Konfiguration schließen' },
      handlung: { art: 'klicken' },
      kurz: 'Konfiguration schließen',
    },
    {
      kapitel: 'Listen und Patient Summary ✦',
      ziel: { rolle: 'link', name: 'Diagnosen und Allergien', in: KARTEI },
      handlung: { art: 'klicken' },
      kurz: 'Diagnosen und Allergien öffnen',
      lang: 'Ab Weiterentwicklung 3 führt die ePA ✦ Listen: Allergien, Diagnosen, Impfungen — gepflegt von allen behandelnden Einrichtungen, nach dem Muster des Medication Service.',
    },
    {
      ziel: { rolle: 'region', name: 'Diagnosen' },
      kurz: 'Links die Praxis, rechts die ePA',
      lang: `Der Splitscreen stellt beide Bestände nebeneinander. Der Abgleich in der Mitte zeigt, was nur in der Praxis steht, was nur in der ePA, was übereinstimmt und was zu klären ist.

Die Markierung ★ wählt aus, was in die Patient Summary gehört — die Liste selbst bleibt vollständig.`,
      mehr: [{ text: 'Splitscreen', pfad: 'docs/SPEZIFIKATION.md#61-splitscreen-im-pvs' }],
    },
    {
      ziel: { rolle: 'button', name: 'Patient Summary', in: PATIENTENKOPF },
      handlung: { art: 'klicken' },
      kurz: 'Patient Summary öffnen',
      lang: 'Die ePA öffnet sich als eigenes Fenster über der Kartei, nicht als Reiter: Sie ist ein fremdes System.',
    },
    {
      ziel: {
        rolle: 'region',
        name: 'Diagnosen',
        in: { rolle: 'dialog', name: 'Elektronische Patientenakte' },
      },
      kurz: 'Eine Sicht, kein eigenes Dokument',
      lang: `Die Patient Summary entsteht bei jedem Abruf aus den Diensten der ePA — aus den markierten Listeneinträgen, dem Medikationsplan und den Befunden. Bearbeitet wird sie nie; gepflegt wird in den Quellen, und jeder Block führt dorthin.

Das ist die Kernfrage der Demo: Die Patient Summary entsteht aus Dokumentation, die ohnehin stattfindet, nicht in einem zweiten Arbeitsschritt.`,
      mehr: [{ text: 'Patient Summary', pfad: 'docs/SPEZIFIKATION.md#7--patient-summary' }],
    },
    {
      ziel: { rolle: 'button', name: 'ePA schließen' },
      handlung: { art: 'klicken' },
      kurz: 'ePA schließen',
    },
    {
      kapitel: 'Für ePA- und FHIR-Arbeit',
      kurz: 'Was die ePA-Arbeit davon hat',
      lang: `Die Demo setzt die Implementation Guides der gematik um, wie sie geschrieben sind — Ballots eingeschlossen. Was dabei hakt, wird sichtbar: Abläufe, die sich widersprechen, Regeln mit Lücken, offene Fragen. Solche Befunde stehen mit ▸ in der Spezifikation.

Vorschläge (✦) nutzen die Mechanik bestehender Dienste. So zeigen sich Aufwand und Nutzen im Praxisalltag, bevor jemand sie spezifiziert.

Die Grenze zwischen Praxissystem und Akte ist eine HTTP-Grenze: Was das Praxissystem nicht abruft, hat es nicht.`,
      mehr: [
        {
          text: 'Systemgrenze',
          pfad: 'docs/ARCHITEKTUR.md#die-systemgrenze-ist-der-gegenstand',
        },
        {
          text: 'Abgleich mit dem Ballot',
          pfad: 'docs/SPEZIFIKATION.md#514-medication-service-nach-dem-ballot-140-29102026',
        },
      ],
    },
    {
      kurz: 'Was FHIR-Entwicklung davon hat',
      lang: `Jede Ressource der Demo folgt benannten Profilen — gematik, KBV, HL7 Europe — mit Pflichtelementen, Invarianten und Terminologie. Das Datenmodell zeigt die Abbildungen, etwa von der Diagnose zur Condition oder von der Dosierung zur Dosage.

Geprüft wird dreifach: bei jedem Testlauf gegen Pflichtelemente und Invarianten, im Simulator bei jedem Schreiben gegen das Profil, in der CI mit dem HL7 FHIR Validator.

Der Simulator läuft lokal als eigener Dienst — die Wege stehen unter GET / — oder im Browser. Eine gute Stelle, um Anfragen gegen einen Dienst nach dem IG auszuprobieren.`,
      mehr: [
        {
          text: 'Datenmodell und Prüfung',
          pfad: 'docs/DATENMODELL.md#6-prüfung-gegen-die-fhir-spezifikation',
        },
        { text: 'ADR 0041', pfad: 'docs/entscheidungen/0041-validator-in-der-ci.md' },
        { text: 'ADR 0056', pfad: 'docs/entscheidungen/0056-profilpruefung-nur-im-simulator.md' },
      ],
    },
    {
      kapitel: 'Weiter',
      ziel: { rolle: 'link', name: 'Dokumentation auf GitHub (öffnet ein neues Fenster)' },
      kurz: 'Alles Weitere in der Dokumentation',
      lang: `Spezifikation Ansicht für Ansicht, Architektur, Datenmodell, Quellen und jede Entscheidung mit ihrer verworfenen Alternative.

Weitere Klickpfade gehen je einer Frage nach, etwa „Wie kommt eine Diagnose in die Patient Summary?“ (?klickpfad=diagnose-in-ps). Mitgearbeitet wird über Issues und Pull Requests, auch mit Claude Code.`,
      mehr: [
        { text: 'Vorführung', pfad: 'docs/SPEZIFIKATION.md#11-vorführung' },
        { text: 'Klickpfade', pfad: 'docs/KLICKPFADE.md' },
        { text: 'Zusammenarbeit', pfad: 'docs/ZUSAMMENARBEIT.md' },
      ],
    },
  ],
});
