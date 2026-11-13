import { szenario } from '../szenario.js';

/**
 * Was löst eine fremde Änderung in der eigenen Praxis aus, wenn Diagnosen automatisch in beide
 * Richtungen übertragen werden? (SPEZIFIKATION 6.4, ADR 0062)
 */
export default szenario({
  id: 'fremde-aenderung-automatisch',
  titel: 'Eine andere Praxis beendet eine Dauerdiagnose',
  frage:
    'Was passiert in meiner Praxis, wenn eine andere Einrichtung eine Dauerdiagnose beendet — und die Diagnosen automatisch in beide Richtungen übertragen werden?',
  aufgabe:
    'Frau Yildiz ist bei Ihnen wegen Bluthochdruck in Behandlung. Eine kardiologische Praxis beendet die Diagnose in der ePA. Finden Sie heraus, was sich dadurch in Ihrer Abrechnung und in Ihren Diagnosen geändert hat — und woran Sie das erkennen.',
  start: {
    ausbaustand: 'weiterentwicklung-3',
    patientId: 'p-yildiz',
    egkEinlesen: true,
    pfad: '/patient/p-yildiz/abrechnung',
    diagnosenweg: 'beidseitig',
  },
  schritte: [
    {
      ziel: { rolle: 'region', name: 'Diagnosen im Behandlungsfall' },
      pruefen: { text: 'Essentielle Hypertonie' },
      kurz: 'Hypertonie geht in die Abrechnung',
      lang: 'Die Abrechnung liest dieselben Diagnosen wie die Kartei. Die Hypertonie ist eine gesicherte, aktive Dauerdiagnose der Praxis und mit dem Eintrag der ✦ Diagnosenliste der ePA verknüpft.',
    },
    {
      ziel: { rolle: 'button', name: 'Konfiguration' },
      handlung: { art: 'klicken' },
      kurz: 'Demo-Steuerung öffnen',
      lang: 'Die Demo-Steuerung spielt die andere Einrichtung. „Diagnosen in die ePA“ steht hier auf „automatisch, in beide Richtungen“ — ✦ eine Einstellung des Praxissystems, nicht des Aktensystems.',
    },
    {
      ziel: {
        rolle: 'button',
        name: 'andere Einrichtung beendet Dauerdiagnose',
        in: { rolle: 'group', name: 'Yildiz, Meral' },
      },
      handlung: { art: 'klicken' },
      kurz: 'Die Kardiologie beendet die Hypertonie',
      lang: 'Eine kardiologische Praxis setzt den Eintrag in der Liste auf „behoben“. Sie ändert damit einen gemeinsamen Eintrag — in der eigenen Praxis hat niemand etwas getan.',
    },
    {
      ziel: { rolle: 'region', name: 'Diagnosen im Behandlungsfall' },
      pruefen: { text: 'Behoben' },
      kurz: 'Die Diagnose der Praxis ist behoben',
      lang: 'Das Praxissystem hat den Stand der ePA von selbst übernommen. Die Diagnose der Praxis ist beendet; das Zusatzkennzeichen „G“ ist das der Praxis geblieben und passt nicht mehr zum Status.',
    },
    {
      ziel: { rolle: 'region', name: 'Diagnosen im Behandlungsfall' },
      pruefen: { text: 'noch nicht angezeigt' },
      kurz: 'Ohne Handlung, noch nicht angezeigt',
      lang: 'Die Herkunft nennt die Einrichtung und dass die Änderung ohne Handlung kam. „Noch nicht angezeigt“ heißt: Das Praxissystem hat sie abgerufen und übernommen, aber niemand hat die Diagnosen seither geöffnet.',
    },
    {
      ziel: {
        rolle: 'link',
        name: 'Diagnosen und Allergien',
        in: { rolle: 'navigation', name: 'Bereiche der Patientenkartei' },
      },
      handlung: { art: 'klicken' },
      kurz: 'Diagnosen öffnen',
      lang: 'Erst hier bekommt die Praxis die Änderung zu sehen.',
    },
    {
      ziel: { rolle: 'group', name: 'Automatische Übertragung' },
      pruefen: { text: 'ePA-Stand übernommen' },
      kurz: 'Der Vermerk der Übertragung',
      lang: 'Das Band führt jeden Schritt, den das Praxissystem ohne Handlung ausgeführt hat: Zeitpunkt, Diagnose, Einrichtung und wann er zum ersten Mal angezeigt wurde. Im geführten Weg stünde hier „in der ePA geändert“ mit der Wahl, den Stand zu übernehmen oder den der Praxis zu behalten.',
    },
  ],
});
