// Erzeugt aus daten/kataloge/loinc-auszug.json — nicht von Hand ändern.
// Neu erzeugen mit: node werkzeuge/kataloge-erzeugen.mjs
import type { LoincEintrag, Katalogkopf } from './typen.js';

export const loincKopf: Katalogkopf = {
  "_katalog": "LOINC",
  "_art": "Auszug für die Demo",
  "_hinweis": "Enthält die im AMTS-Zusammenhang bedeutsamen Analyten (Kreatinin, eGFR, Kalium) sowie gängige hausärztliche Parameter. Referenzbereiche sind gerundete Orientierungswerte und ersetzen keine Laborangabe."
};

export const loinc: readonly LoincEintrag[] = [
  {
    "loinc": "2160-0",
    "bezeichnung": "Kreatinin im Serum",
    "einheit": "mg/dl",
    "referenz": "0,51–0,95",
    "gruppe": "Niere"
  },
  {
    "loinc": "62238-1",
    "bezeichnung": "eGFR nach CKD-EPI",
    "einheit": "ml/min/1,73 m²",
    "referenz": "> 90",
    "gruppe": "Niere"
  },
  {
    "loinc": "2823-3",
    "bezeichnung": "Kalium im Serum",
    "einheit": "mmol/l",
    "referenz": "3,5–5,1",
    "gruppe": "Elektrolyte"
  },
  {
    "loinc": "2951-2",
    "bezeichnung": "Natrium im Serum",
    "einheit": "mmol/l",
    "referenz": "136–145",
    "gruppe": "Elektrolyte"
  },
  {
    "loinc": "4548-4",
    "bezeichnung": "HbA1c",
    "einheit": "%",
    "referenz": "< 5,7",
    "gruppe": "Stoffwechsel"
  },
  {
    "loinc": "2345-7",
    "bezeichnung": "Glukose im Serum",
    "einheit": "mg/dl",
    "referenz": "70–100",
    "gruppe": "Stoffwechsel"
  },
  {
    "loinc": "2093-3",
    "bezeichnung": "Cholesterin gesamt",
    "einheit": "mg/dl",
    "referenz": "< 200",
    "gruppe": "Fettstoffwechsel"
  },
  {
    "loinc": "2085-9",
    "bezeichnung": "HDL-Cholesterin",
    "einheit": "mg/dl",
    "referenz": "> 45",
    "gruppe": "Fettstoffwechsel"
  },
  {
    "loinc": "2089-1",
    "bezeichnung": "LDL-Cholesterin",
    "einheit": "mg/dl",
    "referenz": "< 116",
    "gruppe": "Fettstoffwechsel"
  },
  {
    "loinc": "2571-8",
    "bezeichnung": "Triglyceride",
    "einheit": "mg/dl",
    "referenz": "< 150",
    "gruppe": "Fettstoffwechsel"
  },
  {
    "loinc": "718-7",
    "bezeichnung": "Hämoglobin",
    "einheit": "g/dl",
    "referenz": "12,0–15,6",
    "gruppe": "Blutbild"
  },
  {
    "loinc": "6690-2",
    "bezeichnung": "Leukozyten",
    "einheit": "/nl",
    "referenz": "4,0–10,0",
    "gruppe": "Blutbild"
  },
  {
    "loinc": "777-3",
    "bezeichnung": "Thrombozyten",
    "einheit": "/nl",
    "referenz": "150–400",
    "gruppe": "Blutbild"
  },
  {
    "loinc": "1742-6",
    "bezeichnung": "ALT (GPT)",
    "einheit": "U/l",
    "referenz": "< 35",
    "gruppe": "Leber"
  },
  {
    "loinc": "1920-8",
    "bezeichnung": "AST (GOT)",
    "einheit": "U/l",
    "referenz": "< 35",
    "gruppe": "Leber"
  },
  {
    "loinc": "3016-3",
    "bezeichnung": "TSH basal",
    "einheit": "mU/l",
    "referenz": "0,4–4,0",
    "gruppe": "Schilddrüse"
  },
  {
    "loinc": "1988-5",
    "bezeichnung": "CRP",
    "einheit": "mg/l",
    "referenz": "< 5",
    "gruppe": "Entzündung"
  },
  {
    "loinc": "3084-1",
    "bezeichnung": "Harnsäure",
    "einheit": "mg/dl",
    "referenz": "2,6–6,0",
    "gruppe": "Stoffwechsel"
  }
];
