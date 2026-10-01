import type { Befundangabe } from './fachlogik/laborbefund.js';

/**
 * Beispielbefunde der Demo — erfunden, aber im Simulator und im Praxissystem dieselben.
 *
 * Beide Seiten bauen daraus denselben Laborbefund mit derselben Befundkennung. Nur so
 * erkennt der Dokumentabgleich einen Befund, der auf zwei Wegen ankommt — vom Labor direkt
 * und über die ePA —, als ein und dasselbe Dokument.
 */

/**
 * Der Tag, den Praxis und Aktensystem der Demo als „heute" führen. Beide schreiben Zeitpunkte
 * mit diesem Datum und der tatsächlichen Uhrzeit — so fallen Einträge der Praxis und der ePA in
 * denselben Besuch. Auch Befugnisse laufen nach dieser Uhr ab — sonst veraltete der Startbestand
 * mit dem Kalender.
 */
export const DEMO_HEUTE = '2026-09-09';

/** „Jetzt" der Demo: der Tag `DEMO_HEUTE` mit der tatsächlichen Uhrzeit. */
export function demoJetzt(): Date {
  const d = new Date();
  const [jahr, monat, tag] = DEMO_HEUTE.split('-').map(Number);
  d.setFullYear(jahr!, monat! - 1, tag!);
  return d;
}

/** Frau Hoffmann: von der Vorbehandlung beauftragt, liegt nur in der ePA. */
export const BEFUND_HOFFMANN: Befundangabe = {
  uuid: 'f81d4fae-7dec-11d0-a765-00a0c91e6bf6',
  auftragsnummer: 'L-2026-08-12-0047',
  kvnr: 'A123456780',
  patientName: { vorname: 'Renate', nachname: 'Hoffmann' },
  geburtsdatum: '1958-03-14',
  labor: 'Laborgemeinschaft Nordwest',
  freigebendePerson: 'Dr. rer. nat. Kai Petersen',
  // Frau Hoffmann kam erst am 30.08. in die Praxis; den Befund hatte die Vorbehandlung beauftragt.
  auftraggeber: 'Hausarztpraxis Dr. Kolbe, Oldenburg (Vorbehandlung)',
  entnahme: '2026-08-12T08:10:00',
  freigabe: '2026-08-12T11:00:00',
  probenart: 'Serum',
  beurteilung: 'Eingeschränkte Nierenfunktion (eGFR 38). Diabeteseinstellung nicht im Zielbereich.',
  gruppen: [
    {
      bezeichnung: 'Nierenfunktion',
      werte: [
        {
          loinc: '2160-0',
          bezeichnung: 'Kreatinin im Serum',
          wert: 1.42,
          einheit: 'mg/dl',
          ucum: 'mg/dL',
          referenzNiedrig: 0.51,
          referenzHoch: 0.95,
          referenzText: '0,51–0,95 mg/dl',
        },
        {
          loinc: '62238-1',
          bezeichnung: 'eGFR nach CKD-EPI',
          wert: 38,
          einheit: 'ml/min/1,73 m²',
          ucum: 'mL/min/{1.73_m2}',
          referenzNiedrig: 90,
          referenzHoch: null,
          referenzText: '> 90 ml/min/1,73 m²',
        },
      ],
    },
    {
      bezeichnung: 'Elektrolyte',
      werte: [
        {
          loinc: '2823-3',
          bezeichnung: 'Kalium im Serum',
          wert: 4.2,
          einheit: 'mmol/l',
          ucum: 'mmol/L',
          referenzNiedrig: 3.5,
          referenzHoch: 5.1,
          referenzText: '3,5–5,1 mmol/l',
        },
      ],
    },
    {
      bezeichnung: 'Stoffwechsel',
      werte: [
        {
          loinc: '4548-4',
          bezeichnung: 'HbA1c',
          wert: 7.8,
          einheit: '%',
          ucum: '%',
          referenzNiedrig: null,
          referenzHoch: 5.7,
          referenzText: '< 5,7 %',
        },
      ],
    },
  ],
};

/** Frau Yildiz: von der Praxis beauftragt, vom Labor übermittelt und in die ePA eingestellt. */
export const BEFUND_YILDIZ: Befundangabe = {
  uuid: '3b1c9a52-5c4e-4f0b-9d47-2e8f61a0c7d3',
  auftragsnummer: 'L-2026-07-02-0112',
  kvnr: 'M555123402',
  patientName: { vorname: 'Meral', nachname: 'Yildiz' },
  geburtsdatum: '1969-06-25',
  labor: 'Laborgemeinschaft Nordwest',
  freigebendePerson: 'Dr. rer. nat. Kai Petersen',
  auftraggeber: 'Hausarztpraxis am Stadtgarten',
  entnahme: '2026-07-02T08:30:00',
  freigabe: '2026-07-02T13:40:00',
  probenart: 'Serum',
  beurteilung: null,
  gruppen: [
    {
      bezeichnung: 'Schilddrüse',
      werte: [
        {
          loinc: '3016-3',
          bezeichnung: 'TSH basal',
          wert: 3.1,
          einheit: 'mU/l',
          ucum: 'm[IU]/L',
          referenzNiedrig: 0.4,
          referenzHoch: 4.0,
          referenzText: '0,4–4,0 mU/l',
        },
      ],
    },
  ],
};

/**
 * Frau Hoffmann, Vorbefund aus der Vorbehandlung (März 2026). Zeigt den Verlauf: Kreatinin
 * steigt, eGFR fällt. Die Patient Summary führt nur den jüngeren Wert; der Kumulativbefund der
 * Praxis zeigt beide — sofern die Befunde strukturiert vorliegen.
 */
export const BEFUND_HOFFMANN_MAERZ: Befundangabe = {
  uuid: '9a3e6c10-2b7d-4e8f-a1c5-6d0f2b9e4a71',
  auftragsnummer: 'K-2026-03-18-0213',
  kvnr: 'A123456780',
  patientName: { vorname: 'Renate', nachname: 'Hoffmann' },
  geburtsdatum: '1958-03-14',
  labor: 'MVZ Labor Oldenburg',
  freigebendePerson: 'Dr. med. Hanna Voss',
  auftraggeber: 'Hausarztpraxis Dr. Kolbe, Oldenburg (Vorbehandlung)',
  entnahme: '2026-03-18T07:50:00',
  freigabe: '2026-03-18T14:20:00',
  probenart: 'Serum',
  beurteilung: 'Nierenfunktion leicht eingeschränkt (eGFR 46).',
  gruppen: [
    {
      bezeichnung: 'Nierenfunktion',
      werte: [
        {
          loinc: '2160-0',
          bezeichnung: 'Kreatinin im Serum',
          wert: 1.21,
          einheit: 'mg/dl',
          ucum: 'mg/dL',
          referenzNiedrig: 0.51,
          referenzHoch: 0.95,
          referenzText: '0,51–0,95 mg/dl',
        },
        {
          loinc: '62238-1',
          bezeichnung: 'eGFR nach CKD-EPI',
          wert: 46,
          einheit: 'ml/min/1,73 m²',
          ucum: 'mL/min/{1.73_m2}',
          referenzNiedrig: 90,
          referenzHoch: null,
          referenzText: '> 90 ml/min/1,73 m²',
        },
      ],
    },
    {
      bezeichnung: 'Stoffwechsel',
      werte: [
        {
          loinc: '4548-4',
          bezeichnung: 'HbA1c',
          wert: 7.4,
          einheit: '%',
          ucum: '%',
          referenzNiedrig: null,
          referenzHoch: 5.7,
          referenzText: '< 5,7 %',
        },
      ],
    },
  ],
};
