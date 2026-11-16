import { szenario } from '../szenario.js';

const PATIENTENKOPF = { rolle: 'group', name: 'Patientenkopf' };
const EPA = { rolle: 'dialog', name: 'Elektronische Patientenakte' };
const BAND = { rolle: 'group', name: 'Automatische Übertragung' };
const SPLIT = { rolle: 'region', name: 'Diagnosen' };
const ADR = 'docs/entscheidungen/0063-diagnosen-automatisch-uebertragen.md';
const SPEZ = 'docs/SPEZIFIKATION.md#64--diagnosen-automatisch-übertragen-adr-0063';

/**
 * Was der automatische Upload der Diagnosen in die ePA bewirkt — vom ersten Abgleich bis zur
 * ersten Änderung durch eine andere Einrichtung (SPEZIFIKATION 6.4, ADR 0063). Das Gegenstück zu
 * `fremde-aenderung-automatisch`, das den Weg in beide Richtungen zeigt.
 */
export default szenario({
  id: 'diagnosen-hochladen',
  titel: 'Diagnosen automatisch in die ePA hochladen',
  frage:
    'Was kommt in der ePA an, wenn das Praxissystem seine Diagnosen von selbst hochlädt — und was geschieht, wenn eine andere Einrichtung einen hochgeladenen Eintrag ändert?',
  aufgabe:
    'Frau Hoffmann ist neu in der Praxis, ihre Dauerdiagnosen stehen nur im Praxissystem. Stellen Sie die Übertragung auf „automatisch, nur in die ePA“ und finden Sie heraus, was dadurch in der Diagnosenliste und in der Patient Summary steht — und was passiert, wenn danach eine kardiologische Praxis einen dieser Einträge ändert.',
  start: {
    ausbaustand: 'weiterentwicklung-3',
    patientId: 'p-hoffmann',
    egkEinlesen: true,
    pfad: '/patient/p-hoffmann/diagnosen',
  },
  schritte: [
    {
      kapitel: 'Worum es geht',
      kurz: 'Der Gegenentwurf zum geführten Abgleich',
      lang: `Im geführten Weg entscheidet die Ärztin je Diagnose, ob sie in die ✦ Diagnosenliste der ePA geht und ob sie in die Patient Summary gehört — vorbelegt für Dauerdiagnosen, im Splitscreen gegen die Liste abgeglichen.

Der Gegenentwurf kommt ohne diese Entscheidung aus: Das Praxissystem lädt seine Diagnosen von selbst hoch. Die Demo kennt zwei Spielarten — „nur in die ePA“ (dieser Klickpfad) und „in beide Richtungen“ (Klickpfad „Eine andere Praxis beendet eine Dauerdiagnose“).

✦ Beides ist eine Einstellung des Praxissystems, nicht des Aktensystems: Es nutzt nur die vorhandenen Operationen des Diagnose-Service. Einen neuen Weg an der ePA gibt es nicht.`,
      mehr: [
        { text: 'Spezifikation 6.4', pfad: SPEZ },
        { text: 'ADR 0063', pfad: ADR },
      ],
    },
    {
      kapitel: 'Ausgangslage: geführt',
      ziel: SPLIT,
      pruefen: { text: 'gleicher Eintrag, nicht verknüpft' },
      kurz: 'Diabetes zweimal kodiert',
      lang: `Links die Diagnosen der Praxis, rechts die Diagnosenliste der ePA. Das Klinikum hat bei der Entlassung vier Diagnosen eingetragen, darunter den Diabetes als E11.74. Die Praxis führt ihn als E11.90.

Der Abgleich erkennt „gleicher Eintrag, nicht verknüpft“ und schlägt „verknüpfen“ vor. Hypertonie und Nierenkrankheit stehen „nur in der Praxis“. Im geführten Weg geschieht nichts davon ohne Handlung.`,
      mehr: [{ text: 'Splitscreen', pfad: 'docs/SPEZIFIKATION.md#61-splitscreen-im-pvs' }],
    },
    {
      kapitel: 'Umschalten',
      ziel: { rolle: 'button', name: 'Konfiguration' },
      handlung: { art: 'klicken' },
      kurz: 'Demo-Steuerung öffnen',
      lang: 'Die Einstellung „Diagnosen in die ePA“ steht in der Demo-Steuerung, damit sich beide Wege am selben Bestand vergleichen lassen. In einem echten Praxissystem wäre sie eine Einstellung der Praxis.',
    },
    {
      ziel: { rolle: 'combobox', name: 'Diagnosen in die ePA ✦' },
      handlung: { art: 'waehlen', wert: 'hochladen', anzeige: 'automatisch, nur in die ePA' },
      kurz: '„automatisch, nur in die ePA“',
      lang: `Umfang: gegenwärtige Dauerdiagnosen. Ab jetzt lädt das Praxissystem hoch, sobald die Kartei offen ist und die Listen geladen sind — auch wenn niemand die Diagnosen ansieht. Aus der ePA übernimmt es nichts von selbst.`,
    },
    {
      ziel: { rolle: 'button', name: 'Konfiguration schließen' },
      handlung: { art: 'klicken' },
      kurz: 'Demo-Steuerung schließen',
    },
    {
      kapitel: 'Der erste Upload',
      ziel: BAND,
      pruefen: { text: 'in die ePA übertragen' },
      kurz: 'Drei Dauerdiagnosen hochgeladen',
      lang: `Das Band führt jeden Schritt, den das Praxissystem ohne Handlung getan hat. Der erste Abgleich überträgt den ganzen Bestand im Umfang — ungeprüft, mit dem Datum der Übertragung als Einstelldatum.

Der Handlungszähler im Kopf bleibt stehen: Automatische Schritte sind keine Handlung der Praxis. Gerade darin liegt die Aussage — und die Frage, wer für einen Eintrag einsteht, den niemand eingetragen hat.`,
    },
    {
      ziel: SPLIT,
      pruefen: { text: '7 in der ePA' },
      kurz: 'Sieben Einträge, der Diabetes doppelt',
      lang: `„Nur in die ePA“ verknüpft nicht mit fremden Einträgen: Jede Einrichtung führt ihren eigenen. Der Diabetes steht jetzt zweimal in der Liste — E11.74 vom Klinikum, E11.90 von der Praxis, mit unterschiedlicher Kodiertiefe.

▸ Die Liste wird zur Sammlung der Einrichtungen, nicht zur Problemliste der Person. Wer sie liest, muss selbst erkennen, dass zwei Einträge eine Erkrankung meinen.`,
    },
    {
      kapitel: 'Was in der Patient Summary ankommt',
      ziel: { rolle: 'button', name: 'Patient Summary', in: PATIENTENKOPF },
      handlung: { art: 'klicken' },
      kurz: 'Patient Summary öffnen',
      lang: 'Der Upload markiert Dauerdiagnosen als relevant für die Patient Summary — wie die Vorbelegung im geführten Weg, nur dass niemand sie bestätigt.',
    },
    {
      ziel: { rolle: 'region', name: 'Diagnosen', in: EPA },
      pruefen: { text: 'E11.90' },
      kurz: 'Beide Diabetes-Einträge in der Übersicht',
      lang: `Fünf Diagnosen statt zwei: Zu Vorhofflimmern und Diabetes vom Klinikum kommen Nierenkrankheit, Diabetes und Hypertonie der Praxis. Der Diabetes steht zweimal in der Übersicht, die im Notfall oder im Ausland gelesen wird.

Die Auswahl für die Patient Summary ist im automatischen Weg keine ärztliche Entscheidung mehr, sondern eine Regel des Praxissystems.`,
      mehr: [{ text: 'Patient Summary', pfad: 'docs/SPEZIFIKATION.md#7--patient-summary' }],
    },
    {
      ziel: { rolle: 'region', name: 'Diagnosen', in: EPA },
      pruefen: { text: 'eingetragen von Hausarztpraxis am Stadtgarten' },
      kurz: 'Eingetragen von … — wem?',
      lang: `Die Herkunftszeile nennt die Praxis, das Datum der Übertragung und die angemeldete Person. Eingetragen hat aber niemand: Das Praxissystem hat hochgeladen, während die Kartei offen war.

▸ Offen ist, wer als Urheber eines automatisch hochgeladenen Eintrags gelten soll — die Einrichtung allein, die angemeldete Person oder die verantwortliche Ärztin. Die Demo setzt die angemeldete Person ein und macht die Frage damit sichtbar.`,
    },
    {
      ziel: { rolle: 'button', name: 'ePA schließen', in: EPA },
      handlung: { art: 'klicken' },
      kurz: 'ePA-Fenster schließen',
    },
    {
      kapitel: 'Eine andere Einrichtung ändert',
      ziel: { rolle: 'button', name: 'Konfiguration' },
      handlung: { art: 'klicken' },
      kurz: 'Demo-Steuerung öffnen',
      lang: 'Die Demo-Steuerung spielt die andere Einrichtung.',
    },
    {
      ziel: {
        rolle: 'button',
        name: 'andere Einrichtung beendet Dauerdiagnose',
        in: { rolle: 'group', name: 'Hoffmann, Renate' },
      },
      handlung: { art: 'klicken' },
      kurz: 'Die Kardiologie beendet die Hypertonie',
      lang: 'Eine kardiologische Praxis setzt die Hypertonie in der Liste auf „behoben“ — den Eintrag, den die Praxis eben hochgeladen hat. Der Diagnose-Service erlaubt das jeder befugten Einrichtung, wie die Berichtigung (Abschnitt 6).',
    },
    {
      ziel: { rolle: 'button', name: 'Konfiguration schließen' },
      handlung: { art: 'klicken' },
      kurz: 'Demo-Steuerung schließen',
    },
    {
      ziel: SPLIT,
      pruefen: { text: 'in der ePA geändert' },
      kurz: 'Ein Konflikt, auch ohne Rückweg',
      lang: `„Nur in die ePA“ übernimmt nichts aus der ePA — die Hypertonie bleibt in der Praxis aktiv, in der Liste ist sie behoben. Der Abgleich zeigt „in der ePA geändert“, und solange das so steht, lädt das Praxissystem auch eigene Änderungen an diesem Eintrag nicht mehr von selbst hoch.

▸ Konfliktfrei wäre dieser Weg nur, wenn allein die anlegende Einrichtung ihre Einträge ändern dürfte. Diese Regel hat der Diagnose-Service nicht (offene Frage „Schreibrechte“, Abschnitt 6.2) — und mit ihr könnte niemand mehr einen fremden Eintrag berichtigen.`,
      mehr: [
        {
          text: 'Offene Fragen des Vorschlags',
          pfad: 'docs/SPEZIFIKATION.md#62-offene-fragen-des-vorschlags',
        },
      ],
    },
    {
      ziel: BAND,
      pruefen: { text: '0 aus der ePA' },
      kurz: 'Nichts kam zurück',
      lang: 'Das Band vermerkt nur, was das Praxissystem selbst getan hat. Die fremde Änderung steht dort nicht — sie zeigt sich nur im Abgleich, und nur, wenn jemand die Diagnosen öffnet.',
    },
    {
      kapitel: 'Einordnung',
      kurz: 'Was der Upload spart und was er kostet',
      lang: `Gespart: die Entscheidung je Eintrag und die Markierung für die Patient Summary. Kein Klick, kein Handlungszähler.

Gekostet: Doppeleinträge je Einrichtung, eine Patient Summary, die niemand ausgewählt hat, Einträge ohne Person, die für sie einsteht — und Konflikte, sobald eine andere Einrichtung einen hochgeladenen Eintrag ändert.

„In beide Richtungen“ vermeidet die Doppeleinträge, holt dafür fremde Einträge und Änderungen ungesehen in die eigene Kartei und Abrechnung (Klickpfad „Eine andere Praxis beendet eine Dauerdiagnose“). ▸ Beide Spielarten verschieben dieselbe Frage: Wer verantwortet einen Eintrag, den niemand angesehen hat?`,
      mehr: [
        { text: 'Spezifikation 6.4', pfad: SPEZ },
        { text: 'ADR 0063', pfad: ADR },
        {
          text: 'Geführt gegen automatisch',
          pfad: 'docs/SPEZIFIKATION.md#75-geführt-gegen-automatisch',
        },
      ],
    },
    {
      kapitel: 'Ausblick',
      kurz: 'Wer darf ändern — und was dann aus dem Upload wird',
      lang: `Konfliktfrei wird der Upload erst mit einer Regel, die der Diagnose-Service offenlässt: Nur die anlegende Einrichtung ändert ihren Eintrag. Andere widersprechen mit einem eigenen Eintrag oder einer Rückfrage, nicht durch Überschreiben.

Gemeinsam bearbeitet wird dann nur die Auswahl: eine eigene, versionierte Summary-Liste je Abschnitt statt der Markierung am Eintrag. Der Upload wird so zur Vorstufe — er füllt die Gesamtliste, der Dienst bildet daraus einen Entwurf „automatisch zusammengestellt, ärztlich nicht bestätigt“, und erst die erste ärztliche Bearbeitung macht die Übersicht verantwortet. Danach erscheinen neue Einträge als Vorschläge, nicht von selbst.

✦ Nicht nachgebildet — zur Diskussion. Vorbild ist die österreichische e-Diagnose mit Gesamtansicht und Summary-Liste.`,
      mehr: [
        { text: 'Wer darf ändern?', pfad: 'docs/SPEZIFIKATION.md#-wer-darf-ändern' },
        {
          text: 'Automatische Liste als Vorstufe',
          pfad: 'docs/SPEZIFIKATION.md#-ausblick-die-automatische-liste-als-vorstufe-einer-summary-liste',
        },
        { text: 'ADR 0063, Nachtrag', pfad: ADR },
      ],
    },
  ],
});
