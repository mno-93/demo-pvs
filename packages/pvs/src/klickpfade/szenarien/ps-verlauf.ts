import { szenario } from '../szenario.js';

const EPA = { rolle: 'dialog', name: 'Elektronische Patientenakte' };

/** Wie sah die Patient Summary früher aus — und wer hat sie seitdem geändert? (SPEZIFIKATION 7.9) */
export default szenario({
  id: 'ps-verlauf',
  titel: 'Eine frühere Patient Summary ansehen',
  frage: 'Wie sah die Patient Summary früher aus — und wer hat sie seitdem geändert?',
  aufgabe:
    'Finden Sie heraus, welche Medikation Frau Hoffmanns Patient Summary am 18. Juli um 16 Uhr zeigte, und kehren Sie dann zum heutigen Stand zurück.',
  start: {
    ausbaustand: 'weiterentwicklung-3',
    patientId: 'p-hoffmann',
    egkEinlesen: true,
    pfad: '/patient/p-hoffmann/karteikarte',
  },
  schritte: [
    {
      ziel: {
        rolle: 'button',
        name: 'Patient Summary',
        in: { rolle: 'group', name: 'Patientenkopf' },
      },
      handlung: { art: 'klicken' },
      kurz: 'Patient Summary öffnen',
    },
    {
      ziel: { rolle: 'button', name: 'Verlauf', in: EPA },
      handlung: { art: 'klicken' },
      kurz: 'Verlauf öffnen',
      lang: 'Die ✦ Patient Summary wird nicht gespeichert. Ihr Verlauf entsteht aus den Quellen: Listen und Medikationsplan führen Chronologieeinträge mit jeder Fassung, Dokumente ihren Einstellzeitpunkt.',
    },
    {
      ziel: { rolle: 'region', name: 'Änderungsverlauf der Patient Summary', in: EPA },
      kurz: 'Jede Änderung mit Zeitpunkt und Einrichtung',
      lang: 'Je Änderung: wann, welche Einrichtung, aus welcher Quelle und was in welchem Abschnitt neu, geändert oder entfallen ist. Änderungen an nicht markierten Listeneinträgen erscheinen nicht — sie ändern die Patient Summary nicht.',
      mehr: [
        {
          text: 'Frühere Stände und Verlauf',
          pfad: 'docs/SPEZIFIKATION.md#79--frühere-stände-und-änderungsverlauf',
        },
      ],
    },
    {
      ziel: { rolle: 'button', name: 'Stand vom 18.07.2026, 16:00 Uhr ansehen', in: EPA },
      handlung: { art: 'klicken' },
      kurz: 'Stand vom 18. Juli, 16:00 Uhr',
      lang: 'Am 18. Juli um 16:00 Uhr stand die Entlassmedikation erst in der Medikationsliste; den Plan legte das Klinikum fünf Minuten später an.',
    },
    {
      ziel: { rolle: 'region', name: 'Medikation', in: EPA },
      pruefen: { text: 'Metformin' },
      kurz: 'Damals mit Metformin',
      lang: 'Ohne Plan zeigte die Patient Summary die Medikationsliste — automatisch, mit allem, was verordnet war, auch Metformin. Im Plan des Klinikums fehlt es.',
    },
    {
      ziel: { rolle: 'button', name: 'zum aktuellen Stand', in: EPA },
      handlung: { art: 'klicken' },
      kurz: 'Zurück zum aktuellen Stand',
    },
    {
      ziel: { rolle: 'region', name: 'Medikation', in: EPA },
      pruefen: { text: 'Medikationsplan' },
      kurz: 'Heute aus dem Medikationsplan',
      lang: 'Heute stammt der Block aus dem Medikationsplan — ärztlich geführt. Ein früherer Stand verschiebt das Lesezeichen „seit dem letzten Aufruf“ nicht.',
    },
  ],
});
