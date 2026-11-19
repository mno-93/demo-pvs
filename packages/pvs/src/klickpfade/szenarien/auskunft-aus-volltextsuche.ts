import { szenario } from '../szenario.js';

/**
 * ✦ Der Weg von der Volltextsuche zur belegten Auskunft — für die Übergabe an Dritte.
 *
 * Der Pfad folgt bewusst der Reihenfolge einer Ausbaustufe: erst zeigen, was die Suche heute
 * leistet (Treffer), dann dieselbe Frage als Auskunft mit Beleg und Umfangsangabe, dann die
 * Grenze zur Bewertung, zuletzt dieselbe Antwort in der Sicht der Versicherten.
 * (SPEZIFIKATION 8, ADR 0032, 0035, 0036)
 */
export default szenario({
  id: 'auskunft-aus-volltextsuche',
  titel: 'Von der Volltextsuche zur belegten Auskunft',
  frage:
    'Was leistet die Volltextsuche heute, was käme als nächste Stufe dazu — und wo hört sie auf?',
  aufgabe:
    'Finden Sie heraus, wie sich die Nierenwerte von Frau Hoffmann entwickelt haben, und weisen Sie nach, woher die Angabe stammt.',
  modi: ['gefuehrt', 'frei'],
  start: {
    ausbaustand: 'weiterentwicklung-4',
    patientId: 'p-hoffmann',
    egkEinlesen: true,
    pfad: '/patient/p-hoffmann/karteikarte',
  },
  schritte: [
    {
      kapitel: 'Heute: die Volltextsuche',
      ziel: { rolle: 'button', name: 'ePA öffnen' },
      handlung: { art: 'klicken' },
      kurz: 'Die ePA öffnen',
      lang: 'Die Akte liegt im Aktensystem; das Praxissystem zeigt sie in einem eigenen Fenster. Jeder Aufruf dorthin steht unten in der Konfiguration, mit der Spezifikation, auf der er beruht.',
      mehr: [{ text: 'Quellen der Aufrufe', pfad: 'docs/QUELLEN.md' }],
    },
    {
      ziel: {
        rolle: 'button',
        name: 'Dokumente',
        in: { rolle: 'navigation', name: 'Bereiche der ePA' },
      },
      handlung: { art: 'klicken' },
      kurz: 'Bereich „Dokumente“',
      lang: 'Die Dokumentenliste kommt über ITI-67 (Find Document References). Sie ist der Bestand, auf dem alles Weitere aufsetzt — es entsteht keine zweite Datenhaltung.',
    },
    {
      ziel: { rolle: 'searchbox', name: 'Volltextsuche in der ePA' },
      handlung: { art: 'eingeben', wert: 'niere' },
      kurz: '„niere“ eingeben',
      lang: 'Die Volltextsuche gibt es in der ePA bereits: ein Suchbegriff über den Inhalt der Dokumente, nicht nur über die Metadaten.',
    },
    {
      ziel: { rolle: 'button', name: 'Suchen' },
      handlung: { art: 'klicken' },
      kurz: 'Suchen',
      lang: `Das Ergebnis ist eine Trefferliste: welche Dokumente den Begriff enthalten, mit Textstelle und einem Maß für die Güte des Treffers.

Was sie nicht beantwortet: wie sich der Wert entwickelt hat. Dafür müsste jemand die Treffer öffnen und lesen.`,
    },
    {
      kapitel: 'Stufe 2: die belegte Auskunft ✦',
      ziel: {
        rolle: 'button',
        name: /^Aktenlotse/,
        in: { rolle: 'navigation', name: 'Bereiche der ePA' },
      },
      handlung: { art: 'klicken' },
      kurz: 'Bereich „Aktenlotse ✦“',
      lang: '✦ Vorschlag, nicht spezifiziert. Derselbe Bestand, dieselbe Prüfkette, dieselben Rechte — nur eine andere Frageform. In der Demo regelbasiert, damit nicht die Sprachleistung geprüft wird, sondern der Umgang.',
      mehr: [{ text: 'Aktenlotse', pfad: 'docs/SPEZIFIKATION.md#8--aktenlotse' }],
    },
    {
      ziel: { rolle: 'button', name: 'Wie haben sich die Nierenwerte entwickelt?' },
      handlung: { art: 'klicken' },
      kurz: 'Dieselbe Frage, anders gestellt',
      lang: 'Statt eines Suchbegriffs eine Frage. Die Antwort steht in zusammenhängenden Sätzen und nennt die Richtung, weil sie dasteht — aber sie ordnet nicht ein.',
    },
    {
      ziel: { rolle: 'dialog', name: 'Elektronische Patientenakte' },
      pruefen: { text: 'nicht gelesen' },
      kurz: 'Umfangsangabe an der Antwort',
      lang: `Jede Antwort sagt, wie viele Unterlagen gelesen wurden und welche nicht — mit Grund. Hier liegt ein eingescannter Vorbefund ohne Textebene in der Akte.

▸ Das ist der Teil, den es sonst nirgends gibt. Die gefährlichste Antwort ist die, die vollständig wirkt.`,
      mehr: [{ text: 'Umfangsangabe', pfad: 'docs/SPEZIFIKATION.md#8--aktenlotse' }],
    },
    {
      ziel: { rolle: 'region', name: 'Unklar beschriftet' },
      pruefen: { text: 'laut Inhalt' },
      kurz: 'Unterlagen, deren Metadaten nichts sagen',
      lang: `Drei Unterlagen heißen „Scan_20230914_0007“, „Befund“ und „Anlage 1“ — in einer Liste öffnet die niemand. Der Lotse nennt, was laut Inhalt darin steht, und die Gründe: Titel ohne Aussage, Verfasser nicht erkennbar, Platzhalterdatum.

▸ Er berichtigt nichts. Die Metadaten gehören der einstellenden Einrichtung; sichtbar machen ist etwas anderes als ändern.`,
      mehr: [
        { text: 'Unklar beschriftete Unterlagen', pfad: 'docs/SPEZIFIKATION.md#8--aktenlotse' },
      ],
    },
    {
      kapitel: 'Nachlesen',
      ziel: { rolle: 'button', name: 'Laborgesamtbefund, Laborgemeinschaft Nordwest, 12.08.2026' },
      handlung: { art: 'klicken' },
      kurz: 'Den Beleg öffnen',
      lang: 'Unter jeder Aussage steht die Unterlage, aus der sie stammt. Ein Klick öffnet sie rechts — über ITI-68, seitengetreu, mit der belegenden Zeile markiert. Eine Aussage über eine Akte ist nur so viel wert, wie ihre Quelle einen Klick entfernt ist (UX-Grundsatz U31).',
      mehr: [
        { text: 'UX-Grundsätze', pfad: 'docs/SPEZIFIKATION.md#22-ux-grundsätze--eine-blaupause' },
      ],
    },
    {
      ziel: { rolle: 'region', name: 'Geöffnete Unterlage' },
      pruefen: { text: 'eGFR' },
      kurz: 'Die Stelle ist markiert',
      lang: 'Nicht das Dokument als Ganzes, sondern die Zeile. ▸ Damit wird aus einer Behauptung ein Beleg — und aus einer Prüfung eine Messung: Ob eine Aussage zu ihrer Stelle passt, lässt sich an einem Prüfkorpus mit bekannter Wahrheit zählen.',
    },
    {
      kapitel: 'Die Grenze',
      ziel: { rolle: 'button', name: '← zurück zur Antwort' },
      handlung: { art: 'klicken' },
      kurz: 'Zurück zur Antwort',
      lang: 'Die Unterlage schließt, die Antwort bleibt stehen. Nachlesen ist ein Abstecher, kein Ortswechsel.',
    },
    {
      ziel: { rolle: 'textbox', name: 'Frage an die Akte' },
      handlung: { art: 'eingeben', wert: 'Werde ich wieder gesund?' },
      kurz: 'Eine bewertende Frage stellen',
      lang: 'Die wichtigste Funktion des Entwurfs ist eine Verbotsliste: keine Triage, keine Diagnose, keine Prognose, kein Risikoscore, keine Auswertung über Akten hinweg.',
    },
    {
      ziel: { rolle: 'button', name: 'Fragen' },
      handlung: { art: 'klicken' },
      kurz: 'Fragen',
      lang: `Die Frage wird sichtbar nicht beantwortet — und zwar bevor irgendetwas gelesen wird. Die Ablehnung ist kein Ausweichen, sondern ein eigener Antwortzustand mit Grund.

▸ Genau das macht die Grenze prüfbar: Ein Prüfkorpus kann messen, ob abgelehnt wird, was abgelehnt werden muss.`,
      mehr: [
        {
          text: 'Grenze zur Bewertung',
          pfad: 'docs/entscheidungen/0036-grenze-zur-bewertung-und-ein-stand.md',
        },
      ],
    },
    {
      kapitel: 'Dieselbe Antwort für Versicherte',
      ziel: { rolle: 'button', name: 'ePA schließen' },
      handlung: { art: 'klicken' },
      kurz: 'Die ePA schließen',
      lang: 'Das Praxissystem bleibt, wo es war. Die Akte ist ein Fenster darüber, kein zweiter Arbeitsplatz.',
    },
    {
      ziel: { rolle: 'button', name: 'Konfiguration' },
      handlung: { art: 'klicken' },
      kurz: 'Konfiguration öffnen',
      lang: 'Die Versichertensicht ist kein Teil des Praxissystems. Sie liefe im Frontend des Versicherten, der App der Krankenkasse — die Demo zeigt sie im selben Fenster, weil der Entwurf erst nebeneinander verständlich wird.',
    },
    {
      ziel: { rolle: 'link', name: 'Meine ePA öffnen' },
      handlung: { art: 'klicken' },
      kurz: 'In die Sicht der Versicherten',
      lang: 'Eigener Rahmen, keine Praxis, keine Navigation des Praxissystems. Der Einstieg ist die Dokumentenliste — das, was eine versicherte Person heute vorfindet.',
    },
    {
      ziel: { rolle: 'button', name: /^Scan_20230914_0007/ },
      pruefen: { text: 'laut Inhalt' },
      kurz: 'Dieselbe Aussage in der Dokumentenliste',
      lang: 'Der Hinweis steht nicht nur im Lotsen, sondern in jeder Dokumentenliste — hier, im ePA-Fenster und in der Kartei, aus derselben Quelle. Für die versicherte Person ist das oft der eigentliche Nutzen: Sie sieht zum ersten Mal, was in „Anlage 1“ steht.',
    },
    {
      ziel: {
        rolle: 'button',
        name: /^Aktenlotse/,
        in: { rolle: 'navigation', name: 'Bereiche der Akte' },
      },
      handlung: { art: 'klicken' },
      kurz: 'Bereich „Aktenlotse“',
      lang: 'Ein Bereich unter anderen, gekennzeichnet als neu. Er tritt nicht an die Stelle der Akte, er führt hinein.',
    },
    {
      ziel: { rolle: 'button', name: 'Was vertrage ich nicht?' },
      handlung: { art: 'klicken' },
      kurz: 'Dieselbe Maschinerie, andere Sprache',
      lang: `Dieselbe Antwortbildung, dieselben Belege, dieselbe Umfangsangabe — nur in Alltagssprache. Kein zweiter Dienst, eine andere Sprachebene.

▸ Das ist der Grund, warum beide Sichten in einer Festlegung stehen müssen: Wären es zwei Dienste, könnten sie auseinanderlaufen.`,
    },
    {
      ziel: { rolle: 'region', name: 'Antwort' },
      pruefen: { text: 'Hautausschlag' },
      kurz: 'Fachbegriff und Übersetzung zugleich',
      lang: `„Makulopapulöses Exanthem (fleckiger Hautausschlag)“ — die Umschreibung steht hinter dem Fachbegriff, nicht an seiner Stelle. In der Praxissicht fehlt sie; dort steht der Text wie im Dokument.

▸ Beides muss stehen bleiben: Wer im Originaldokument nachliest, findet dort den Fachbegriff wieder. Eine ersetzte Antwort wäre nicht mehr belegbar.`,
    },
    {
      kurz: 'Was daraus eine Festlegung macht',
      lang: `Der Entwurf ist gezeigt. Festzulegen wäre nicht der Ort, sondern das Ergebnis: die Antwort, die Belege mit Dokument und Stelle, die Umfangsangabe mit Grund, die Verbotsliste als eigener Antwortzustand und die Angabe, welches Modell geantwortet hat.

▸ Drei dieser fünf Felder gibt es in der ePA schon — Textstelle, Trefferzahl und die Prüfkette der Dokumentensuche. Neu sind die Umfangsangabe mit Grund und die Ablehnung.`,
      mehr: [{ text: 'Was der Dienst nicht tut', pfad: 'docs/SPEZIFIKATION.md#8--aktenlotse' }],
    },
  ],
});
