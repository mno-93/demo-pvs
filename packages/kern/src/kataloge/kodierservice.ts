// Erzeugt aus daten/kataloge/kodierservice-diagnosen.json — nicht von Hand ändern.
// Neu erzeugen mit: node werkzeuge/kataloge-erzeugen.mjs
import type { KodierserviceEintrag, Katalogkopf } from './typen.js';

export const kodierserviceKopf: Katalogkopf = {
  "_katalog": "Kodierservice Diagnosen",
  "_art": "Auszug für die Demo, nicht geprüft",
  "_hinweis": "Angelehnt an den zentralen Kodierservice in Österreich: Aus einem Suchbegriff werden SNOMED CT und ICD-10-GM zugleich hinterlegt. Die SNOMED-CT-Konzepte liegen in der Hierarchie „Clinical finding\" (404684003) und damit im Geltungsbereich von KBV_VS_Base_Diagnosis_SNOMED_CT. Die Zuordnungen sind nicht gegen einen Terminologieserver geprüft; Einträge mit unsicher=true sind aus dem Gedächtnis ergänzt und besonders zu verifizieren. Alpha-ID-Codes sind in der Demo nicht belegt."
};

export const kodierservice: readonly KodierserviceEintrag[] = [
  {
    "snomed": "59621000",
    "anzeigeEn": "Essential hypertension",
    "begriff": "Essentielle Hypertonie",
    "synonyme": [
      "Bluthochdruck",
      "Hypertonie",
      "Hochdruck",
      "arterielle Hypertonie"
    ],
    "icd10gm": "I10.90",
    "alphaId": null,
    "unsicher": false,
    "hinweis": null
  },
  {
    "snomed": "44054006",
    "anzeigeEn": "Diabetes mellitus type 2",
    "begriff": "Diabetes mellitus Typ 2",
    "synonyme": [
      "Zuckerkrankheit",
      "Zucker",
      "Altersdiabetes",
      "DM2",
      "T2DM"
    ],
    "icd10gm": "E11.90",
    "alphaId": null,
    "unsicher": false,
    "hinweis": null
  },
  {
    "snomed": "440028005",
    "anzeigeEn": "Persistent atrial fibrillation",
    "begriff": "Vorhofflimmern, persistierend",
    "synonyme": [
      "persistierendes Vorhofflimmern",
      "VHF persistierend"
    ],
    "icd10gm": "I48.1",
    "alphaId": null,
    "unsicher": true,
    "hinweis": null
  },
  {
    "snomed": "282825002",
    "anzeigeEn": "Paroxysmal atrial fibrillation",
    "begriff": "Vorhofflimmern, paroxysmal",
    "synonyme": [
      "paroxysmales Vorhofflimmern",
      "anfallsartiges Vorhofflimmern"
    ],
    "icd10gm": "I48.0",
    "alphaId": null,
    "unsicher": true,
    "hinweis": null
  },
  {
    "snomed": "440059007",
    "anzeigeEn": "Permanent atrial fibrillation",
    "begriff": "Vorhofflimmern, permanent",
    "synonyme": [
      "permanentes Vorhofflimmern",
      "Dauer-VHF"
    ],
    "icd10gm": "I48.2",
    "alphaId": null,
    "unsicher": true,
    "hinweis": null
  },
  {
    "snomed": "433144002",
    "anzeigeEn": "Chronic kidney disease stage 3",
    "begriff": "Chronische Nierenkrankheit, Stadium 3",
    "synonyme": [
      "Niereninsuffizienz Stadium 3",
      "CKD 3",
      "chronische Niereninsuffizienz"
    ],
    "icd10gm": "N18.3",
    "alphaId": null,
    "unsicher": false,
    "hinweis": null
  },
  {
    "snomed": "431857002",
    "anzeigeEn": "Chronic kidney disease stage 4",
    "begriff": "Chronische Nierenkrankheit, Stadium 4",
    "synonyme": [
      "Niereninsuffizienz Stadium 4",
      "CKD 4"
    ],
    "icd10gm": "N18.4",
    "alphaId": null,
    "unsicher": true,
    "hinweis": null
  },
  {
    "snomed": "195967001",
    "anzeigeEn": "Asthma",
    "begriff": "Asthma bronchiale",
    "synonyme": [
      "Asthma",
      "Bronchialasthma"
    ],
    "icd10gm": "J45.9",
    "alphaId": null,
    "unsicher": false,
    "hinweis": null
  },
  {
    "snomed": "21719001",
    "anzeigeEn": "Allergic rhinitis due to pollen",
    "begriff": "Allergische Rhinitis durch Pollen",
    "synonyme": [
      "Heuschnupfen",
      "Pollenallergie",
      "Pollinosis"
    ],
    "icd10gm": "J30.1",
    "alphaId": null,
    "unsicher": false,
    "hinweis": null
  },
  {
    "snomed": "40930008",
    "anzeigeEn": "Hypothyroidism",
    "begriff": "Hypothyreose",
    "synonyme": [
      "Schilddrüsenunterfunktion"
    ],
    "icd10gm": "E03.9",
    "alphaId": null,
    "unsicher": false,
    "hinweis": null
  },
  {
    "snomed": "34486009",
    "anzeigeEn": "Hyperthyroidism",
    "begriff": "Hyperthyreose",
    "synonyme": [
      "Schilddrüsenüberfunktion"
    ],
    "icd10gm": "E05.9",
    "alphaId": null,
    "unsicher": false,
    "hinweis": null
  },
  {
    "snomed": "68566005",
    "anzeigeEn": "Urinary tract infectious disease",
    "begriff": "Harnwegsinfektion",
    "synonyme": [
      "Harnwegsinfekt",
      "HWI"
    ],
    "icd10gm": "N39.0",
    "alphaId": null,
    "unsicher": false,
    "hinweis": null
  },
  {
    "snomed": "10509002",
    "anzeigeEn": "Acute bronchitis",
    "begriff": "Akute Bronchitis",
    "synonyme": [
      "Bronchitis"
    ],
    "icd10gm": "J20.9",
    "alphaId": null,
    "unsicher": false,
    "hinweis": null
  },
  {
    "snomed": "54150009",
    "anzeigeEn": "Upper respiratory infection",
    "begriff": "Akute Infektion der oberen Atemwege",
    "synonyme": [
      "Erkältung",
      "grippaler Infekt",
      "Atemwegsinfekt"
    ],
    "icd10gm": "J06.9",
    "alphaId": null,
    "unsicher": false,
    "hinweis": null
  },
  {
    "snomed": "84114007",
    "anzeigeEn": "Heart failure",
    "begriff": "Herzinsuffizienz",
    "synonyme": [
      "Herzschwäche"
    ],
    "icd10gm": "I50.9",
    "alphaId": null,
    "unsicher": false,
    "hinweis": null
  },
  {
    "snomed": "414545008",
    "anzeigeEn": "Ischemic heart disease",
    "begriff": "Ischämische Herzkrankheit",
    "synonyme": [
      "Koronare Herzkrankheit",
      "KHK"
    ],
    "icd10gm": "I25.9",
    "alphaId": null,
    "unsicher": false,
    "hinweis": null
  },
  {
    "snomed": "13644009",
    "anzeigeEn": "Hypercholesterolemia",
    "begriff": "Hypercholesterinämie",
    "synonyme": [
      "erhöhtes Cholesterin"
    ],
    "icd10gm": "E78.0",
    "alphaId": null,
    "unsicher": false,
    "hinweis": null
  },
  {
    "snomed": "55822004",
    "anzeigeEn": "Hyperlipidemia",
    "begriff": "Hyperlipidämie",
    "synonyme": [
      "Fettstoffwechselstörung",
      "gemischte Hyperlipidämie"
    ],
    "icd10gm": "E78.2",
    "alphaId": null,
    "unsicher": false,
    "hinweis": null
  },
  {
    "snomed": "90560007",
    "anzeigeEn": "Gout",
    "begriff": "Gicht",
    "synonyme": [
      "Arthritis urica"
    ],
    "icd10gm": "M10.09",
    "alphaId": null,
    "unsicher": false,
    "hinweis": null
  },
  {
    "snomed": "239873007",
    "anzeigeEn": "Osteoarthritis of knee",
    "begriff": "Gonarthrose",
    "synonyme": [
      "Kniearthrose",
      "Arthrose des Kniegelenks"
    ],
    "icd10gm": "M17.9",
    "alphaId": null,
    "unsicher": false,
    "hinweis": null
  },
  {
    "snomed": "239872002",
    "anzeigeEn": "Osteoarthritis of hip",
    "begriff": "Koxarthrose",
    "synonyme": [
      "Hüftarthrose",
      "Arthrose des Hüftgelenks"
    ],
    "icd10gm": "M16.9",
    "alphaId": null,
    "unsicher": true,
    "hinweis": null
  },
  {
    "snomed": "279039007",
    "anzeigeEn": "Low back pain",
    "begriff": "Kreuzschmerz",
    "synonyme": [
      "Rückenschmerzen",
      "Lumbago",
      "LWS-Syndrom"
    ],
    "icd10gm": "M54.5",
    "alphaId": null,
    "unsicher": false,
    "hinweis": null
  },
  {
    "snomed": "35489007",
    "anzeigeEn": "Depressive disorder",
    "begriff": "Depressive Episode",
    "synonyme": [
      "Depression"
    ],
    "icd10gm": "F32.9",
    "alphaId": null,
    "unsicher": false,
    "hinweis": null
  },
  {
    "snomed": "37796009",
    "anzeigeEn": "Migraine",
    "begriff": "Migräne",
    "synonyme": [
      "Migräneattacke"
    ],
    "icd10gm": "G43.9",
    "alphaId": null,
    "unsicher": false,
    "hinweis": null
  },
  {
    "snomed": "235595009",
    "anzeigeEn": "Gastroesophageal reflux disease",
    "begriff": "Gastroösophageale Refluxkrankheit",
    "synonyme": [
      "Refluxkrankheit",
      "Sodbrennen",
      "GERD"
    ],
    "icd10gm": "K21.9",
    "alphaId": null,
    "unsicher": false,
    "hinweis": null
  },
  {
    "snomed": "13645005",
    "anzeigeEn": "Chronic obstructive lung disease",
    "begriff": "Chronisch obstruktive Lungenerkrankung",
    "synonyme": [
      "COPD",
      "chronische Bronchitis mit Obstruktion"
    ],
    "icd10gm": "J44.99",
    "alphaId": null,
    "unsicher": false,
    "hinweis": null
  },
  {
    "snomed": "233604007",
    "anzeigeEn": "Pneumonia",
    "begriff": "Pneumonie",
    "synonyme": [
      "Lungenentzündung"
    ],
    "icd10gm": "J18.9",
    "alphaId": null,
    "unsicher": false,
    "hinweis": null
  },
  {
    "snomed": "87522002",
    "anzeigeEn": "Iron deficiency anemia",
    "begriff": "Eisenmangelanämie",
    "synonyme": [
      "Blutarmut durch Eisenmangel"
    ],
    "icd10gm": "D50.9",
    "alphaId": null,
    "unsicher": false,
    "hinweis": null
  },
  {
    "snomed": "414916001",
    "anzeigeEn": "Obesity",
    "begriff": "Adipositas",
    "synonyme": [
      "Übergewicht",
      "Fettleibigkeit"
    ],
    "icd10gm": "E66.9",
    "alphaId": null,
    "unsicher": false,
    "hinweis": null
  },
  {
    "snomed": "64859006",
    "anzeigeEn": "Osteoporosis",
    "begriff": "Osteoporose",
    "synonyme": [
      "Knochenschwund"
    ],
    "icd10gm": "M81.99",
    "alphaId": null,
    "unsicher": false,
    "hinweis": null
  },
  {
    "snomed": "230690007",
    "anzeigeEn": "Cerebrovascular accident",
    "begriff": "Schlaganfall",
    "synonyme": [
      "Apoplex",
      "Hirninfarkt",
      "Insult"
    ],
    "icd10gm": "I63.9",
    "alphaId": null,
    "unsicher": false,
    "hinweis": null
  },
  {
    "snomed": "197480006",
    "anzeigeEn": "Anxiety disorder",
    "begriff": "Angststörung",
    "synonyme": [
      "Angsterkrankung"
    ],
    "icd10gm": "F41.9",
    "alphaId": null,
    "unsicher": false,
    "hinweis": null
  },
  {
    "snomed": "193462001",
    "anzeigeEn": "Insomnia",
    "begriff": "Ein- und Durchschlafstörung",
    "synonyme": [
      "Schlafstörung",
      "Insomnie"
    ],
    "icd10gm": "G47.0",
    "alphaId": null,
    "unsicher": false,
    "hinweis": null
  },
  {
    "snomed": "42345000",
    "anzeigeEn": "Polyneuropathy",
    "begriff": "Polyneuropathie",
    "synonyme": [
      "PNP"
    ],
    "icd10gm": "G62.9",
    "alphaId": null,
    "unsicher": false,
    "hinweis": null
  },
  {
    "snomed": "24079001",
    "anzeigeEn": "Atopic dermatitis",
    "begriff": "Atopisches Ekzem",
    "synonyme": [
      "Neurodermitis",
      "endogenes Ekzem"
    ],
    "icd10gm": "L20.9",
    "alphaId": null,
    "unsicher": false,
    "hinweis": null
  },
  {
    "snomed": "9014002",
    "anzeigeEn": "Psoriasis",
    "begriff": "Psoriasis",
    "synonyme": [
      "Schuppenflechte"
    ],
    "icd10gm": "L40.9",
    "alphaId": null,
    "unsicher": false,
    "hinweis": null
  },
  {
    "snomed": "57406009",
    "anzeigeEn": "Carpal tunnel syndrome",
    "begriff": "Karpaltunnelsyndrom",
    "synonyme": [
      "KTS"
    ],
    "icd10gm": "G56.0",
    "alphaId": null,
    "unsicher": false,
    "hinweis": null
  },
  {
    "snomed": "44054006",
    "anzeigeEn": "Diabetes mellitus type 2",
    "begriff": "Diabetes mellitus Typ 2 mit multiplen Komplikationen",
    "synonyme": [
      "Diabetes mit Komplikationen"
    ],
    "icd10gm": "E11.74",
    "alphaId": null,
    "unsicher": false,
    "hinweis": "SNOMED CT kennt kein vorkoordiniertes Konzept für „multiple Komplikationen\". Hinterlegt wird das Grundkonzept; die Komplikationen wären gesondert zu kodieren. Die ICD-10-GM ist hier gröber und feiner zugleich — ein Beispiel dafür, warum eine Abbildung zwischen beiden fachlich zu prüfen ist."
  }
];
