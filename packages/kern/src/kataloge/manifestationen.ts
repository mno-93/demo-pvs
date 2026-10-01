// Erzeugt aus daten/kataloge/allergie-manifestationen.json — nicht von Hand ändern.
// Neu erzeugen mit: node werkzeuge/kataloge-erzeugen.mjs
import type { SnomedWerteintrag, Katalogkopf } from './typen.js';

export const manifestationenKopf: Katalogkopf = {
  "_katalog": "KBV_VS_AllergyIntolerance_Manifestation_SNOMED_CT",
  "_art": "veröffentlichte Werteliste, Zentraler Terminologieserver (BfArM)",
  "_hinweis": "Übernommen mit werkzeuge/wertelisten-vom-zts.mjs, nicht von Hand ändern. Bindung extensible: Codes außerhalb der Liste sind zulässig. Synonyme und englische Anzeige sind Ergänzungen der Demo für die Suche.",
  "_stand": {
    "titel": "Allergien Überempfindlichkeitsreaktionen Manifestation",
    "quelle": "https://terminologien.bfarm.de/ValueSet-4c8eb7ff-4da6-5b04-8536-388bc1ba35a0.html",
    "kanonisch": "https://fhir.kbv.de/ValueSet/KBV_VS_AllergyIntolerance_Manifestation_SNOMED_CT",
    "version": "1.0.0",
    "stand": "2026-07-21",
    "snomedVersion": "http://snomed.info/sct/11000274103/version/20260515"
  }
};

export const manifestationen: readonly SnomedWerteintrag[] = [
  {
    "snomed": "1251376007",
    "anzeigeEn": "Acute pustular eruption of skin (disorder)",
    "bezeichnung": "Akutes pustulöses Exanthem",
    "synonyme": [
      "Akuter pustulöser Hautausschlag",
      "Akute pustulöse Hauteruption"
    ],
    "system": "http://snomed.info/sct",
    "bindung": "extensible"
  },
  {
    "snomed": "126485001",
    "anzeigeEn": "Urticaria (disorder)",
    "bezeichnung": "Urtikaria",
    "synonyme": [
      "Nesselsucht",
      "Nesselfieber"
    ],
    "system": "http://snomed.info/sct",
    "bindung": "extensible"
  },
  {
    "snomed": "195967001",
    "anzeigeEn": "Asthma (disorder)",
    "bezeichnung": "Asthma bronchiale",
    "synonyme": [
      "Hyperreaktivität der Atemwege",
      "Bronchiale Hyperreagibilität",
      "Asthma",
      "Bronchiale Hypersensitivität",
      "Bronchialasthma",
      "Bronchiale Hyperreaktivität"
    ],
    "system": "http://snomed.info/sct",
    "bindung": "extensible"
  },
  {
    "snomed": "23924001",
    "anzeigeEn": "Tight chest (finding)",
    "bezeichnung": "Engegefühl im Brustkorb",
    "synonyme": [
      "Engegefühl im Thorax",
      "Einengung im Brustkorb",
      "Eingeengtes Gefühl im Brustkorb"
    ],
    "system": "http://snomed.info/sct",
    "bindung": "extensible"
  },
  {
    "snomed": "247471006",
    "anzeigeEn": "Maculopapular eruption (disorder)",
    "bezeichnung": "Makulopapulöses Exanthem",
    "synonyme": [
      "Makulopapulöser Ausschlag",
      "Makulopapulöse Eruption",
      "Makulopapulöser Hautausschlag"
    ],
    "system": "http://snomed.info/sct",
    "bindung": "extensible"
  },
  {
    "snomed": "247472004",
    "anzeigeEn": "Wheal (finding)",
    "bezeichnung": "Quaddel",
    "synonyme": [],
    "system": "http://snomed.info/sct",
    "bindung": "extensible"
  },
  {
    "snomed": "267036007",
    "anzeigeEn": "Dyspnea (finding)",
    "bezeichnung": "Dyspnoe",
    "synonyme": [
      "Kurzatmigkeit",
      "Atemlosigkeit",
      "Atemnot"
    ],
    "system": "http://snomed.info/sct",
    "bindung": "extensible"
  },
  {
    "snomed": "271757001",
    "anzeigeEn": "Papular eruption (disorder)",
    "bezeichnung": "Papulöses Exanthem",
    "synonyme": [
      "Papulöser Hautausschlag",
      "Papulöse Hauteruption",
      "Papulöser Ausschlag",
      "Knötchenförmiger Hautausschlag"
    ],
    "system": "http://snomed.info/sct",
    "bindung": "extensible"
  },
  {
    "snomed": "271759003",
    "anzeigeEn": "Bullous eruption (disorder)",
    "bezeichnung": "Bullöses Exanthem",
    "synonyme": [
      "Bullöse Hauteruption",
      "Bullöse Eruption",
      "Bullöser Hautausschlag",
      "Blasenbildende Hauteruption",
      "Blasenbildender Hautausschlag"
    ],
    "system": "http://snomed.info/sct",
    "bindung": "extensible"
  },
  {
    "snomed": "276444007",
    "anzeigeEn": "Generalized pruritus (finding)",
    "bezeichnung": "Generalisierter Juckreiz",
    "synonyme": [
      "Generalisiertes Jucken",
      "Generalisierter Pruritus"
    ],
    "system": "http://snomed.info/sct",
    "bindung": "extensible"
  },
  {
    "snomed": "301447009",
    "anzeigeEn": "Multimorphic rash (disorder)",
    "bezeichnung": "Multiformes Exanthem",
    "synonyme": [
      "Multimorphes Exanthem",
      "Multimorpher Hautausschlag"
    ],
    "system": "http://snomed.info/sct",
    "bindung": "extensible"
  },
  {
    "snomed": "31996006",
    "anzeigeEn": "Vasculitis (disorder)",
    "bezeichnung": "Vaskulitis",
    "synonyme": [
      "Angiitis",
      "Gefäßentzündung"
    ],
    "system": "http://snomed.info/sct",
    "bindung": "extensible"
  },
  {
    "snomed": "36715001",
    "anzeigeEn": "Erythema multiforme (disorder)",
    "bezeichnung": "Erythema exsudativum multiforme",
    "synonyme": [
      "EEM - Erythema exsudativum multiforme"
    ],
    "system": "http://snomed.info/sct",
    "bindung": "extensible"
  },
  {
    "snomed": "39579001",
    "anzeigeEn": "Anaphylaxis (disorder)",
    "bezeichnung": "Anaphylaktische Reaktion",
    "synonyme": [
      "Generalisierte Anaphylaxie",
      "Anaphylaxie",
      "Systemische Anaphylaxie"
    ],
    "system": "http://snomed.info/sct",
    "bindung": "extensible"
  },
  {
    "snomed": "410430005",
    "anzeigeEn": "Cardiorespiratory arrest (disorder)",
    "bezeichnung": "Kardiorespiratorischer Stillstand",
    "synonyme": [],
    "system": "http://snomed.info/sct",
    "bindung": "extensible"
  },
  {
    "snomed": "41291007",
    "anzeigeEn": "Angioedema (disorder)",
    "bezeichnung": "Angioödem",
    "synonyme": [
      "Quincke-Ödem",
      "Angioneurotisches Ödem"
    ],
    "system": "http://snomed.info/sct",
    "bindung": "extensible"
  },
  {
    "snomed": "418363000",
    "anzeigeEn": "Itching of skin (finding)",
    "bezeichnung": "Pruritus",
    "synonyme": [
      "Hautjucken",
      "Hautjuckreiz",
      "Juckreiz der Haut"
    ],
    "system": "http://snomed.info/sct",
    "bindung": "extensible"
  },
  {
    "snomed": "419045004",
    "anzeigeEn": "Loss of consciousness (finding)",
    "bezeichnung": "Verlust des Bewusstseins",
    "synonyme": [
      "Bewusstseinsverlust"
    ],
    "system": "http://snomed.info/sct",
    "bindung": "extensible"
  },
  {
    "snomed": "422400008",
    "anzeigeEn": "Vomiting (disorder)",
    "bezeichnung": "Erbrechen",
    "synonyme": [
      "Emesis",
      "Vomitus"
    ],
    "system": "http://snomed.info/sct",
    "bindung": "extensible"
  },
  {
    "snomed": "422587007",
    "anzeigeEn": "Nausea (finding)",
    "bezeichnung": "Übelkeit",
    "synonyme": [
      "Nausea"
    ],
    "system": "http://snomed.info/sct",
    "bindung": "extensible"
  },
  {
    "snomed": "427461000",
    "anzeigeEn": "Near syncope (disorder)",
    "bezeichnung": "Präsynkope",
    "synonyme": [
      "Beinahe-Synkope"
    ],
    "system": "http://snomed.info/sct",
    "bindung": "extensible"
  },
  {
    "snomed": "43116000",
    "anzeigeEn": "Eczema (disorder)",
    "bezeichnung": "Ekzem",
    "synonyme": [
      "Juckflechte"
    ],
    "system": "http://snomed.info/sct",
    "bindung": "extensible"
  },
  {
    "snomed": "4386001",
    "anzeigeEn": "Bronchospasm (finding)",
    "bezeichnung": "Bronchospasmus",
    "synonyme": [
      "Bronchialkrampf"
    ],
    "system": "http://snomed.info/sct",
    "bindung": "extensible"
  },
  {
    "snomed": "45007003",
    "anzeigeEn": "Low blood pressure (disoder)",
    "bezeichnung": "Hypotonie",
    "synonyme": [
      "Arterielle Hypotonie",
      "Niedriger Blutdruck"
    ],
    "system": "http://snomed.info/sct",
    "bindung": "extensible"
  },
  {
    "snomed": "49727002",
    "anzeigeEn": "Cough (finding)",
    "bezeichnung": "Husten",
    "synonyme": [],
    "system": "http://snomed.info/sct",
    "bindung": "extensible"
  },
  {
    "snomed": "51599000",
    "anzeigeEn": "Edema of larynx (disorder)",
    "bezeichnung": "Larynxödem",
    "synonyme": [
      "Kehlkopfödem",
      "Larynx-Ödem",
      "Ödem des Larynx",
      "Ödem des Kehlkopfs",
      "Laryngeales Ödem"
    ],
    "system": "http://snomed.info/sct",
    "bindung": "extensible"
  },
  {
    "snomed": "62315008",
    "anzeigeEn": "Diarrhea (finding)",
    "bezeichnung": "Diarrhö",
    "synonyme": [
      "Diarrhoe",
      "Durchfall"
    ],
    "system": "http://snomed.info/sct",
    "bindung": "extensible"
  },
  {
    "snomed": "698247007",
    "anzeigeEn": "Cardiac arrhythmia (disorder)",
    "bezeichnung": "Herzrhythmusstörung",
    "synonyme": [
      "Kardiale Arrhythmie"
    ],
    "system": "http://snomed.info/sct",
    "bindung": "extensible"
  },
  {
    "snomed": "70076002",
    "anzeigeEn": "Rhinitis (disorder)",
    "bezeichnung": "Rhinitis",
    "synonyme": [
      "Reizung der Nase",
      "Nasenschleimhautentzündung",
      "Nasenschleimhautreizung"
    ],
    "system": "http://snomed.info/sct",
    "bindung": "extensible"
  },
  {
    "snomed": "702809001",
    "anzeigeEn": "Drug reaction with eosinophilia and systemic symptoms (disorder)",
    "bezeichnung": "DRESS-Syndrom",
    "synonyme": [
      "Arzneimittelexanthem mit Eosinophilie und systemischen Symptomen",
      "DRESS (Drug Rash with Eosinophilia and Systemic Symptoms)-Syndrom",
      "Medikamentöses Hypersensitivitätssyndrom (HSS)"
    ],
    "system": "http://snomed.info/sct",
    "bindung": "extensible"
  },
  {
    "snomed": "725119006",
    "anzeigeEn": "Generalized rash (disorder)",
    "bezeichnung": "Generalisierter Ausschlag",
    "synonyme": [
      "Generalisiertes Exanthem",
      "Generalisierter Hautausschlag",
      "Generalisiertes Erythem"
    ],
    "system": "http://snomed.info/sct",
    "bindung": "extensible"
  },
  {
    "snomed": "73442001",
    "anzeigeEn": "Stevens-Johnson syndrome (disorder)",
    "bezeichnung": "Stevens-Johnson-Syndrom",
    "synonyme": [
      "Baader'sche Dermatostomatitis",
      "Fiessinger-Rendu-Syndrom"
    ],
    "system": "http://snomed.info/sct",
    "bindung": "extensible"
  },
  {
    "snomed": "76067001",
    "anzeigeEn": "Sneezing (finding)",
    "bezeichnung": "Niesen",
    "synonyme": [],
    "system": "http://snomed.info/sct",
    "bindung": "extensible"
  },
  {
    "snomed": "768962006",
    "anzeigeEn": "Lyell syndrome (disorder)",
    "bezeichnung": "Lyell-Syndrom",
    "synonyme": [
      "Toxische epidermale Nekrolyse",
      "Epidermolysis acuta toxica"
    ],
    "system": "http://snomed.info/sct",
    "bindung": "extensible"
  },
  {
    "snomed": "781682005",
    "anzeigeEn": "Hyperemia of eye (finding)",
    "bezeichnung": "Augenrötung",
    "synonyme": [
      "Blutunterlaufenes Auge",
      "Hyperämie des Auges",
      "Okuläre Hyperämie"
    ],
    "system": "http://snomed.info/sct",
    "bindung": "extensible"
  },
  {
    "snomed": "91175000",
    "anzeigeEn": "Seizure (finding)",
    "bezeichnung": "Krampfanfall",
    "synonyme": [
      "Konvulsion"
    ],
    "system": "http://snomed.info/sct",
    "bindung": "extensible"
  },
  {
    "snomed": "9826008",
    "anzeigeEn": "Conjunctivitis (disorder)",
    "bezeichnung": "Konjunktivitis",
    "synonyme": [
      "Bindehautentzündung",
      "Conjunktivitis"
    ],
    "system": "http://snomed.info/sct",
    "bindung": "extensible"
  }
];
