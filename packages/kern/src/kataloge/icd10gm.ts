// Erzeugt aus daten/kataloge/icd10gm-auszug.json — nicht von Hand ändern.
// Neu erzeugen mit: node werkzeuge/kataloge-erzeugen.mjs
import type { IcdEintrag, Katalogkopf } from './typen.js';

export const icd10gmKopf: Katalogkopf = {
  "_katalog": "ICD-10-GM",
  "_art": "Auszug für die Demo, nicht amtlich",
  "_hinweis": "Zusammenstellung häufiger Schlüssel der hausärztlichen Versorgung. Die Bezeichnungen sind sinngemäß gekürzt und geben nicht den amtlichen Wortlaut wieder. Nicht als Katalog weitergeben und nicht für die Abrechnung verwenden.",
  "_zusatzkennzeichen": [
    {
      "code": "G",
      "bezeichnung": "gesicherte Diagnose"
    },
    {
      "code": "V",
      "bezeichnung": "Verdacht auf"
    },
    {
      "code": "Z",
      "bezeichnung": "Zustand nach"
    },
    {
      "code": "A",
      "bezeichnung": "ausgeschlossen"
    }
  ],
  "_seitenlokalisation": [
    {
      "code": "R",
      "bezeichnung": "rechts"
    },
    {
      "code": "L",
      "bezeichnung": "links"
    },
    {
      "code": "B",
      "bezeichnung": "beidseitig"
    }
  ]
};

export const icd10gm: readonly IcdEintrag[] = [
  {
    "code": "I10.90",
    "bezeichnung": "Essentielle Hypertonie, ohne Angabe einer hypertensiven Krise",
    "gruppe": "Kreislauf"
  },
  {
    "code": "I10.00",
    "bezeichnung": "Benigne essentielle Hypertonie, ohne Angabe einer hypertensiven Krise",
    "gruppe": "Kreislauf"
  },
  {
    "code": "I25.9",
    "bezeichnung": "Chronische ischämische Herzkrankheit, nicht näher bezeichnet",
    "gruppe": "Kreislauf"
  },
  {
    "code": "I48.0",
    "bezeichnung": "Vorhofflimmern, paroxysmal",
    "gruppe": "Kreislauf"
  },
  {
    "code": "I48.1",
    "bezeichnung": "Vorhofflimmern, persistierend",
    "gruppe": "Kreislauf"
  },
  {
    "code": "I48.2",
    "bezeichnung": "Vorhofflimmern, permanent",
    "gruppe": "Kreislauf"
  },
  {
    "code": "I50.9",
    "bezeichnung": "Herzinsuffizienz, nicht näher bezeichnet",
    "gruppe": "Kreislauf"
  },
  {
    "code": "I63.9",
    "bezeichnung": "Hirninfarkt, nicht näher bezeichnet",
    "gruppe": "Kreislauf"
  },
  {
    "code": "I65.2",
    "bezeichnung": "Verschluss und Stenose der Arteria carotis",
    "gruppe": "Kreislauf"
  },
  {
    "code": "I83.9",
    "bezeichnung": "Varizen der unteren Extremitäten ohne Ulzeration oder Entzündung",
    "gruppe": "Kreislauf"
  },
  {
    "code": "E11.90",
    "bezeichnung": "Diabetes mellitus, Typ 2: Ohne Komplikationen, nicht als entgleist bezeichnet",
    "gruppe": "Stoffwechsel"
  },
  {
    "code": "E11.74",
    "bezeichnung": "Diabetes mellitus, Typ 2: Mit multiplen Komplikationen, nicht als entgleist bezeichnet",
    "gruppe": "Stoffwechsel"
  },
  {
    "code": "E78.0",
    "bezeichnung": "Reine Hypercholesterinämie",
    "gruppe": "Stoffwechsel"
  },
  {
    "code": "E78.2",
    "bezeichnung": "Gemischte Hyperlipidämie",
    "gruppe": "Stoffwechsel"
  },
  {
    "code": "E03.9",
    "bezeichnung": "Hypothyreose, nicht näher bezeichnet",
    "gruppe": "Stoffwechsel"
  },
  {
    "code": "E05.9",
    "bezeichnung": "Hyperthyreose, nicht näher bezeichnet",
    "gruppe": "Stoffwechsel"
  },
  {
    "code": "E66.9",
    "bezeichnung": "Adipositas, nicht näher bezeichnet",
    "gruppe": "Stoffwechsel"
  },
  {
    "code": "E79.0",
    "bezeichnung": "Hyperurikämie ohne Zeichen von entzündlicher Arthritis und tophischer Gicht",
    "gruppe": "Stoffwechsel"
  },
  {
    "code": "J06.9",
    "bezeichnung": "Akute Infektion der oberen Atemwege, nicht näher bezeichnet",
    "gruppe": "Atemwege"
  },
  {
    "code": "J20.9",
    "bezeichnung": "Akute Bronchitis, nicht näher bezeichnet",
    "gruppe": "Atemwege"
  },
  {
    "code": "J01.9",
    "bezeichnung": "Akute Sinusitis, nicht näher bezeichnet",
    "gruppe": "Atemwege"
  },
  {
    "code": "J03.9",
    "bezeichnung": "Akute Tonsillitis, nicht näher bezeichnet",
    "gruppe": "Atemwege"
  },
  {
    "code": "J18.9",
    "bezeichnung": "Pneumonie, nicht näher bezeichnet",
    "gruppe": "Atemwege"
  },
  {
    "code": "J44.99",
    "bezeichnung": "Chronische obstruktive Lungenkrankheit, nicht näher bezeichnet",
    "gruppe": "Atemwege"
  },
  {
    "code": "J45.9",
    "bezeichnung": "Asthma bronchiale, nicht näher bezeichnet",
    "gruppe": "Atemwege"
  },
  {
    "code": "J30.1",
    "bezeichnung": "Allergische Rhinopathie durch Pollen",
    "gruppe": "Atemwege"
  },
  {
    "code": "M54.5",
    "bezeichnung": "Kreuzschmerz",
    "gruppe": "Bewegungsapparat"
  },
  {
    "code": "M54.2",
    "bezeichnung": "Zervikalneuralgie",
    "gruppe": "Bewegungsapparat"
  },
  {
    "code": "M17.9",
    "bezeichnung": "Gonarthrose, nicht näher bezeichnet",
    "gruppe": "Bewegungsapparat"
  },
  {
    "code": "M16.9",
    "bezeichnung": "Koxarthrose, nicht näher bezeichnet",
    "gruppe": "Bewegungsapparat"
  },
  {
    "code": "M25.56",
    "bezeichnung": "Gelenkschmerz: Unterschenkel (Kniegelenk)",
    "gruppe": "Bewegungsapparat"
  },
  {
    "code": "M81.99",
    "bezeichnung": "Osteoporose, nicht näher bezeichnet",
    "gruppe": "Bewegungsapparat"
  },
  {
    "code": "M10.09",
    "bezeichnung": "Idiopathische Gicht, nicht näher bezeichnete Lokalisation",
    "gruppe": "Bewegungsapparat"
  },
  {
    "code": "M06.99",
    "bezeichnung": "Chronische Polyarthritis, nicht näher bezeichnet",
    "gruppe": "Bewegungsapparat"
  },
  {
    "code": "K21.0",
    "bezeichnung": "Gastroösophageale Refluxkrankheit mit Ösophagitis",
    "gruppe": "Verdauung"
  },
  {
    "code": "K21.9",
    "bezeichnung": "Gastroösophageale Refluxkrankheit ohne Ösophagitis",
    "gruppe": "Verdauung"
  },
  {
    "code": "K29.7",
    "bezeichnung": "Gastritis, nicht näher bezeichnet",
    "gruppe": "Verdauung"
  },
  {
    "code": "K58.9",
    "bezeichnung": "Reizdarmsyndrom ohne Diarrhoe",
    "gruppe": "Verdauung"
  },
  {
    "code": "K59.09",
    "bezeichnung": "Obstipation, nicht näher bezeichnet",
    "gruppe": "Verdauung"
  },
  {
    "code": "K80.20",
    "bezeichnung": "Gallenblasenstein ohne Cholezystitis, ohne Gallenwegsobstruktion",
    "gruppe": "Verdauung"
  },
  {
    "code": "K57.30",
    "bezeichnung": "Divertikulose des Dickdarmes ohne Perforation oder Abszess",
    "gruppe": "Verdauung"
  },
  {
    "code": "N39.0",
    "bezeichnung": "Harnwegsinfektion, Lokalisation nicht näher bezeichnet",
    "gruppe": "Niere und Harnwege"
  },
  {
    "code": "N30.0",
    "bezeichnung": "Akute Zystitis",
    "gruppe": "Niere und Harnwege"
  },
  {
    "code": "N18.3",
    "bezeichnung": "Chronische Nierenkrankheit, Stadium 3",
    "gruppe": "Niere und Harnwege"
  },
  {
    "code": "N18.4",
    "bezeichnung": "Chronische Nierenkrankheit, Stadium 4",
    "gruppe": "Niere und Harnwege"
  },
  {
    "code": "N40",
    "bezeichnung": "Prostatahyperplasie",
    "gruppe": "Niere und Harnwege"
  },
  {
    "code": "F32.1",
    "bezeichnung": "Mittelgradige depressive Episode",
    "gruppe": "Psyche und Nerven"
  },
  {
    "code": "F32.9",
    "bezeichnung": "Depressive Episode, nicht näher bezeichnet",
    "gruppe": "Psyche und Nerven"
  },
  {
    "code": "F41.9",
    "bezeichnung": "Angststörung, nicht näher bezeichnet",
    "gruppe": "Psyche und Nerven"
  },
  {
    "code": "F45.9",
    "bezeichnung": "Somatoforme Störung, nicht näher bezeichnet",
    "gruppe": "Psyche und Nerven"
  },
  {
    "code": "F17.2",
    "bezeichnung": "Psychische und Verhaltensstörungen durch Tabak: Abhängigkeitssyndrom",
    "gruppe": "Psyche und Nerven"
  },
  {
    "code": "G43.9",
    "bezeichnung": "Migräne, nicht näher bezeichnet",
    "gruppe": "Psyche und Nerven"
  },
  {
    "code": "G47.0",
    "bezeichnung": "Ein- und Durchschlafstörungen",
    "gruppe": "Psyche und Nerven"
  },
  {
    "code": "G62.9",
    "bezeichnung": "Polyneuropathie, nicht näher bezeichnet",
    "gruppe": "Psyche und Nerven"
  },
  {
    "code": "G56.0",
    "bezeichnung": "Karpaltunnel-Syndrom",
    "gruppe": "Psyche und Nerven"
  },
  {
    "code": "L20.9",
    "bezeichnung": "Atopisches Ekzem, nicht näher bezeichnet",
    "gruppe": "Haut"
  },
  {
    "code": "L23.0",
    "bezeichnung": "Allergische Kontaktdermatitis durch Metalle",
    "gruppe": "Haut"
  },
  {
    "code": "L30.9",
    "bezeichnung": "Dermatitis, nicht näher bezeichnet",
    "gruppe": "Haut"
  },
  {
    "code": "L40.9",
    "bezeichnung": "Psoriasis, nicht näher bezeichnet",
    "gruppe": "Haut"
  },
  {
    "code": "D50.9",
    "bezeichnung": "Eisenmangelanämie, nicht näher bezeichnet",
    "gruppe": "Blut"
  },
  {
    "code": "D64.9",
    "bezeichnung": "Anämie, nicht näher bezeichnet",
    "gruppe": "Blut"
  },
  {
    "code": "R42",
    "bezeichnung": "Schwindel und Taumel",
    "gruppe": "Symptome"
  },
  {
    "code": "R10.4",
    "bezeichnung": "Sonstige und nicht näher bezeichnete Bauchschmerzen",
    "gruppe": "Symptome"
  },
  {
    "code": "R55",
    "bezeichnung": "Synkope und Kollaps",
    "gruppe": "Symptome"
  },
  {
    "code": "T78.4",
    "bezeichnung": "Allergie, nicht näher bezeichnet",
    "gruppe": "Symptome"
  },
  {
    "code": "Z00.0",
    "bezeichnung": "Ärztliche Allgemeinuntersuchung",
    "gruppe": "Vorsorge und Status"
  },
  {
    "code": "Z25.1",
    "bezeichnung": "Notwendigkeit der Impfung gegen Grippe",
    "gruppe": "Vorsorge und Status"
  },
  {
    "code": "Z95.0",
    "bezeichnung": "Vorhandensein eines kardialen elektronischen Gerätes",
    "gruppe": "Vorsorge und Status"
  }
];
