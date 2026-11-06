import { szenario } from '../szenario.js';

/** Wie kommt eine neue Dauerdiagnose in die Patient Summary? (SPEZIFIKATION 6.1, „In der Erfassung“) */
export default szenario({
  id: 'diagnose-in-ps',
  titel: 'Eine Diagnose in die Patient Summary bringen',
  frage:
    'Wie kommt eine neue Dauerdiagnose in die Patient Summary — und was kostet das die Praxis?',
  aufgabe:
    'Frau Hoffmann hat seit Jahren Migräne. Dokumentieren Sie das als Dauerdiagnose und prüfen Sie, ob es in ihrer Patient Summary steht.',
  start: {
    ausbaustand: 'weiterentwicklung-3',
    patientId: 'p-hoffmann',
    egkEinlesen: true,
    pfad: '/patient/p-hoffmann/diagnosen',
  },
  schritte: [
    {
      ziel: { rolle: 'combobox', name: 'Diagnose suchen — Kodierservice' },
      handlung: { art: 'eingeben', wert: 'Migräne' },
      kurz: '„Migräne“ suchen',
      lang: 'Die Erfassung liegt in der Kartei, wo die Praxis ohnehin dokumentiert. Der ✦ Kodierservice findet Begriffe, Synonyme und Codes.',
    },
    {
      ziel: { rolle: 'option', name: /^Migräne/ },
      handlung: { art: 'klicken' },
      kurz: 'Treffer übernehmen',
      lang: 'Ein Treffer hinterlegt ICD-10-GM und SNOMED CT zugleich — niemand kodiert zweimal.',
    },
    {
      ziel: { rolle: 'combobox', name: 'Kategorie' },
      handlung: { art: 'waehlen', wert: 'dauer', anzeige: 'Dauerdiagnose' },
      kurz: 'Kategorie „Dauerdiagnose“',
      lang: 'Von der Kategorie hängt die Vorbelegung ab: Dauerdiagnosen gehören in der Regel in die Liste und in die Patient Summary, Akutdiagnosen nicht.',
    },
    {
      ziel: { rolle: 'checkbox', name: /^Relevant für die Patient Summary/ },
      pruefen: { angehakt: true },
      kurz: 'Schon angehakt',
      lang: '„In der Diagnosenliste der ePA führen“ und „Relevant für die Patient Summary“ sind vorbelegt. Die Relevanz entsteht im regulären Vorgang, nicht in einem zweiten Dokumentationsschritt (UX-Grundsätze U10, U20).',
    },
    {
      ziel: { rolle: 'button', name: 'Diagnose speichern' },
      handlung: { art: 'klicken' },
      kurz: 'Speichern',
      lang: 'Die Diagnose steht danach in der Kartei und in der ✦ Diagnosenliste der ePA, markiert für die Patient Summary. Die Aufrufe an die ePA stehen unten.',
    },
    {
      ziel: {
        rolle: 'button',
        name: 'Patient Summary',
        in: { rolle: 'group', name: 'Patientenkopf' },
      },
      handlung: { art: 'klicken' },
      kurz: 'Patient Summary öffnen',
      lang: 'Die ✦ Patient Summary ist aus der Kartei mit einem Klick erreichbar.',
    },
    {
      ziel: {
        rolle: 'region',
        name: 'Diagnosen',
        in: { rolle: 'dialog', name: 'Elektronische Patientenakte' },
      },
      pruefen: { text: 'Migräne' },
      kurz: 'Migräne steht in der Patient Summary',
      lang: 'Die Patient Summary wird aus den ärztlich geführten Listen gebildet. Die neue Diagnose steht darin, ohne dass jemand die Patient Summary bearbeitet hat.',
    },
  ],
});
