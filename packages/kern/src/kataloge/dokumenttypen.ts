// Erzeugt aus daten/kataloge/dokumenttypen-epa.json — nicht von Hand ändern.
// Neu erzeugen mit: node werkzeuge/kataloge-erzeugen.mjs
import type { DokumenttypEintrag, Katalogkopf } from './typen.js';

export const dokumenttypenKopf: Katalogkopf = {
  "_katalog": "Registrierte Dokumenttypen des XDS Document Service",
  "_art": "aus ePA-XDS-Document übernommen",
  "_hinweis": "Automatisch übernommen, nicht von Hand ändern. Ein Dokumenttyp, der hier fehlt, ist im Release nicht registriert — etwa der strukturierte Krankenhausentlassbrief und der Laborbefund nach dgLP.",
  "_stand": {
    "repository": "gematik/ePA-XDS-Document",
    "branch": "ePA-3.1.3",
    "commit": "c88635c",
    "commitDatum": "2026-07-15",
    "quelle": "src/implementation_guides/"
  }
};

export const dokumenttypen: readonly DokumenttypEintrag[] = [
  {
    "datei": "ig-eau.json",
    "bezeichnung": "Incapacity to Work Certificate",
    "element": "Incapacity to Work Certificate",
    "formatCode": "urn:gematik:ig:Arbeitsunfaehigkeitsbescheinigung:r4.0",
    "formatSystem": "1.3.6.1.4.1.19376.3.276.1.5.6",
    "formatAnzeige": "Arbeitsunfähigkeitsbescheinigung (gematik)",
    "mimeTypes": [
      "application/fhir+xml",
      "application/pkcs7-mime"
    ],
    "classCode": {
      "code": "ADM",
      "system": "1.3.6.1.4.1.19376.3.276.1.5.8",
      "anzeige": "Administratives Dokument"
    },
    "typeCode": {
      "code": "BESC",
      "system": "1.3.6.1.4.1.19376.3.276.1.5.9",
      "anzeige": "Ärztliche Bescheinigungen"
    }
  },
  {
    "datei": "ig-eau_V_1_1-1.json",
    "bezeichnung": "Incapacity to Work Certificate Version 1.1",
    "element": "Incapacity to Work Certificate",
    "formatCode": "urn:gematik:ig:Arbeitsunfaehigkeitsbescheinigung:v1.1",
    "formatSystem": "1.3.6.1.4.1.19376.3.276.1.5.6",
    "formatAnzeige": "Arbeitsunfähigkeitsbescheinigung (gematik) v1.1",
    "mimeTypes": [
      "application/pkcs7-mime"
    ],
    "classCode": {
      "code": "ADM",
      "system": "1.3.6.1.4.1.19376.3.276.1.5.8",
      "anzeige": "Administratives Dokument"
    },
    "typeCode": {
      "code": "BESC",
      "system": "1.3.6.1.4.1.19376.3.276.1.5.9",
      "anzeige": "Ärztliche Bescheinigungen"
    }
  },
  {
    "datei": "ig-eau_V_1_1.json",
    "bezeichnung": "Incapacity to Work Certificate Version 1.1",
    "element": "Incapacity to Work Certificate",
    "formatCode": "urn:gematik:ig:Arbeitsunfaehigkeitsbescheinigung:v1.1",
    "formatSystem": "1.3.6.1.4.1.19376.3.276.1.5.6",
    "formatAnzeige": "Arbeitsunfähigkeitsbescheinigung (gematik) v1.1",
    "mimeTypes": [
      "application/fhir+xml",
      "application/pkcs7-mime"
    ],
    "classCode": {
      "code": "ADM",
      "system": "1.3.6.1.4.1.19376.3.276.1.5.8",
      "anzeige": "Administratives Dokument"
    },
    "typeCode": {
      "code": "BESC",
      "system": "1.3.6.1.4.1.19376.3.276.1.5.9",
      "anzeige": "Ärztliche Bescheinigungen"
    }
  },
  {
    "datei": "ig-eau_V_1_2.json",
    "bezeichnung": "Incapacity to Work Certificate Version 1.2",
    "element": "Incapacity to Work Certificate",
    "formatCode": "urn:gematik:ig:Arbeitsunfaehigkeitsbescheinigung:v1.2",
    "formatSystem": "1.3.6.1.4.1.19376.3.276.1.5.6",
    "formatAnzeige": "Arbeitsunfähigkeitsbescheinigung (gematik) v1.2",
    "mimeTypes": [
      "application/pkcs7-mime"
    ],
    "classCode": {
      "code": "ADM",
      "system": "1.3.6.1.4.1.19376.3.276.1.5.8",
      "anzeige": "Administratives Dokument"
    },
    "typeCode": {
      "code": "BESC",
      "system": "1.3.6.1.4.1.19376.3.276.1.5.9",
      "anzeige": "Ärztliche Bescheinigungen"
    }
  },
  {
    "datei": "ig-eab.json",
    "bezeichnung": "Discharge Letter",
    "element": "eArztbrief",
    "formatCode": "urn:gematik:ig:Arztbrief:r3.1",
    "formatSystem": "1.3.6.1.4.1.19376.3.276.1.5.6",
    "formatAnzeige": "Arztbrief § 291f SGB V",
    "mimeTypes": [
      "application/xml"
    ],
    "classCode": {
      "code": "BRI",
      "system": "1.3.6.1.4.1.19376.3.276.1.5.8",
      "anzeige": "Brief"
    },
    "typeCode": {
      "code": "BERI",
      "system": "1.3.6.1.4.1.19376.3.276.1.5.9",
      "anzeige": "Arztberichte"
    }
  },
  {
    "datei": "ig-dpe.json",
    "bezeichnung": "Personal Explanation Record",
    "element": "Personal Explanation Record",
    "formatCode": "urn:gematik:ig:DatensatzPersoenlicheErklaerungen:r3.1",
    "formatSystem": "1.3.6.1.4.1.19376.3.276.1.5.6",
    "formatAnzeige": "Datensatz für persönliche Erklärungen (gematik)",
    "mimeTypes": [
      "application/xml"
    ],
    "classCode": {
      "code": "ADM",
      "system": "1.3.6.1.4.1.19376.3.276.1.5.8",
      "anzeige": "Administratives Dokument"
    },
    "typeCode": {
      "code": "PATD",
      "system": "1.3.6.1.4.1.19376.3.276.1.5.9",
      "anzeige": "Patienteneigene Dokumente"
    }
  },
  {
    "datei": "ig-diga_V_1_1.json",
    "bezeichnung": "DiGA Toolkit",
    "element": "KBV_PR_MIO_DIGA_Bundle",
    "formatCode": "urn:gematik:ig:diga:v1.1",
    "formatSystem": "1.3.6.1.4.1.19376.3.276.1.5.6",
    "formatAnzeige": "DiGA (gematik) v1.1",
    "mimeTypes": [
      "application/fhir+xml",
      "application/pdf"
    ],
    "classCode": {
      "code": "DUR",
      "system": "1.3.6.1.4.1.19376.3.276.1.5.8",
      "anzeige": "Durchführungsprotokoll"
    },
    "typeCode": {
      "code": "PATD",
      "system": "1.3.6.1.4.1.19376.3.276.1.5.9",
      "anzeige": "Patienteneigene Dokumente"
    }
  },
  {
    "datei": "ig-dmp_asthma_V_4.json",
    "bezeichnung": "eDMP-Datensatz Asthma",
    "element": "eDMP record for asthma",
    "formatCode": "urn:gematik:ig:DMP-Asthma:v4",
    "formatSystem": "1.3.6.1.4.1.19376.3.276.1.5.6",
    "formatAnzeige": "eDMP Asthma (gematik)",
    "mimeTypes": [
      "application/hl7-v3"
    ],
    "classCode": {
      "code": "BRI",
      "system": "1.3.6.1.4.1.19376.3.276.1.5.8",
      "anzeige": "Brief"
    },
    "typeCode": {
      "code": "FPRO",
      "system": "1.3.6.1.4.1.19376.3.276.1.5.9",
      "anzeige": "Therapiedokumentation"
    }
  },
  {
    "datei": "ig-dmp_brk_V_4.json",
    "bezeichnung": "eDMP-Datensatz Brustkrebs",
    "element": "eDMP record for breast cancer",
    "formatCode": "urn:gematik:ig:DMP-BRK:v4",
    "formatSystem": "1.3.6.1.4.1.19376.3.276.1.5.6",
    "formatAnzeige": "eDMP Brustkrebs (gematik)",
    "mimeTypes": [
      "application/hl7-v3"
    ],
    "classCode": {
      "code": "BRI",
      "system": "1.3.6.1.4.1.19376.3.276.1.5.8",
      "anzeige": "Brief"
    },
    "typeCode": {
      "code": "FPRO",
      "system": "1.3.6.1.4.1.19376.3.276.1.5.9",
      "anzeige": "Therapiedokumentation"
    }
  },
  {
    "datei": "ig-dmp_copd_V_4.json",
    "bezeichnung": "eDMP-Datensatz COPD",
    "element": "eDMP record for chronic obstrusive pulmonary disease",
    "formatCode": "urn:gematik:ig:DMP-COPD:v4",
    "formatSystem": "1.3.6.1.4.1.19376.3.276.1.5.6",
    "formatAnzeige": "eDMP Chronic Obstrusive Pulmonary Disease (gematik)",
    "mimeTypes": [
      "application/hl7-v3"
    ],
    "classCode": {
      "code": "BRI",
      "system": "1.3.6.1.4.1.19376.3.276.1.5.8",
      "anzeige": "Brief"
    },
    "typeCode": {
      "code": "FPRO",
      "system": "1.3.6.1.4.1.19376.3.276.1.5.9",
      "anzeige": "Therapiedokumentation"
    }
  },
  {
    "datei": "ig-dmp_depression_V_1.json",
    "bezeichnung": "eDMP-Datensatz Depression",
    "element": "eDMP record for depression",
    "formatCode": "urn:gematik:ig:DMP-Depression:v1",
    "formatSystem": "1.3.6.1.4.1.19376.3.276.1.5.6",
    "formatAnzeige": "eDMP Depression (gematik)",
    "mimeTypes": [
      "application/hl7-v3"
    ],
    "classCode": {
      "code": "BRI",
      "system": "1.3.6.1.4.1.19376.3.276.1.5.8",
      "anzeige": "Brief"
    },
    "typeCode": {
      "code": "FPRO",
      "system": "1.3.6.1.4.1.19376.3.276.1.5.9",
      "anzeige": "Therapiedokumentation"
    }
  },
  {
    "datei": "ig-dmp_dm1_V_5.json",
    "bezeichnung": "eDMP-Datensatz Diabetes mellitus Typ 1",
    "element": "eDMP record for type 1 diabetes",
    "formatCode": "urn:gematik:ig:DMP-DM1:v5",
    "formatSystem": "1.3.6.1.4.1.19376.3.276.1.5.6",
    "formatAnzeige": "eDMP Diabetes mellitus Typ 1 (gematik)",
    "mimeTypes": [
      "application/hl7-v3"
    ],
    "classCode": {
      "code": "BRI",
      "system": "1.3.6.1.4.1.19376.3.276.1.5.8",
      "anzeige": "Brief"
    },
    "typeCode": {
      "code": "FPRO",
      "system": "1.3.6.1.4.1.19376.3.276.1.5.9",
      "anzeige": "Therapiedokumentation"
    }
  },
  {
    "datei": "ig-dmp_dm2_V_6.json",
    "bezeichnung": "eDMP-Datensatz Diabetes mellitus Typ 2",
    "element": "eDMP record for type 2 diabetes",
    "formatCode": "urn:gematik:ig:DMP-DM2:v6",
    "formatSystem": "1.3.6.1.4.1.19376.3.276.1.5.6",
    "formatAnzeige": "eDMP Diabetes mellitus Typ 2 (gematik)",
    "mimeTypes": [
      "application/hl7-v3"
    ],
    "classCode": {
      "code": "BRI",
      "system": "1.3.6.1.4.1.19376.3.276.1.5.8",
      "anzeige": "Brief"
    },
    "typeCode": {
      "code": "FPRO",
      "system": "1.3.6.1.4.1.19376.3.276.1.5.9",
      "anzeige": "Therapiedokumentation"
    }
  },
  {
    "datei": "ig-dmp_hi_V_1.json",
    "bezeichnung": "eDMP-Datensatz Herzinsuffizienz",
    "element": "eDMP record for chronic heart failure",
    "formatCode": "urn:gematik:ig:DMP-HI:v1",
    "formatSystem": "1.3.6.1.4.1.19376.3.276.1.5.6",
    "formatAnzeige": "eDMP Herzinsuffizienz (gematik)",
    "mimeTypes": [
      "application/hl7-v3"
    ],
    "classCode": {
      "code": "BRI",
      "system": "1.3.6.1.4.1.19376.3.276.1.5.8",
      "anzeige": "Brief"
    },
    "typeCode": {
      "code": "FPRO",
      "system": "1.3.6.1.4.1.19376.3.276.1.5.9",
      "anzeige": "Therapiedokumentation"
    }
  },
  {
    "datei": "ig-dmp_khk_V_4.json",
    "bezeichnung": "eDMP-Datensatz Koronare Herzkrankheit",
    "element": "eDMP record for coronary heart disease",
    "formatCode": "urn:gematik:ig:DMP-KHK:v4",
    "formatSystem": "1.3.6.1.4.1.19376.3.276.1.5.6",
    "formatAnzeige": "eDMP Koronare Herzkrankheit (gematik)",
    "mimeTypes": [
      "application/hl7-v3"
    ],
    "classCode": {
      "code": "BRI",
      "system": "1.3.6.1.4.1.19376.3.276.1.5.8",
      "anzeige": "Brief"
    },
    "typeCode": {
      "code": "FPRO",
      "system": "1.3.6.1.4.1.19376.3.276.1.5.9",
      "anzeige": "Therapiedokumentation"
    }
  },
  {
    "datei": "ig-dmp_ost_V_1.json",
    "bezeichnung": "eDMP-Datensatz Osteoporose",
    "element": "eDMP record for osteoporosis",
    "formatCode": "urn:gematik:ig:DMP-OST:v1",
    "formatSystem": "1.3.6.1.4.1.19376.3.276.1.5.6",
    "formatAnzeige": "eDMP Osteoporose (gematik)",
    "mimeTypes": [
      "application/hl7-v3"
    ],
    "classCode": {
      "code": "BRI",
      "system": "1.3.6.1.4.1.19376.3.276.1.5.8",
      "anzeige": "Brief"
    },
    "typeCode": {
      "code": "FPRO",
      "system": "1.3.6.1.4.1.19376.3.276.1.5.9",
      "anzeige": "Therapiedokumentation"
    }
  },
  {
    "datei": "ig-dmp_rheuma_V_1.json",
    "bezeichnung": "eDMP-Datensatz Rheumatoide Arthritis",
    "element": "eDMP record for rheumatoid arthritis",
    "formatCode": "urn:gematik:ig:DMP-Rheuma:v1",
    "formatSystem": "1.3.6.1.4.1.19376.3.276.1.5.6",
    "formatAnzeige": "eDMP Rheumatoide Arthritis (gematik)",
    "mimeTypes": [
      "application/hl7-v3"
    ],
    "classCode": {
      "code": "BRI",
      "system": "1.3.6.1.4.1.19376.3.276.1.5.8",
      "anzeige": "Brief"
    },
    "typeCode": {
      "code": "FPRO",
      "system": "1.3.6.1.4.1.19376.3.276.1.5.9",
      "anzeige": "Therapiedokumentation"
    }
  },
  {
    "datei": "ig-dmp_cr_V_1.json",
    "bezeichnung": "eDMP-Datensatz Rückenschmerz",
    "element": "eDMP record for chronic back pain",
    "formatCode": "urn:gematik:ig:DMP-Rueckenschmerz:v1",
    "formatSystem": "1.3.6.1.4.1.19376.3.276.1.5.6",
    "formatAnzeige": "eDMP Rückenschmerz (gematik)",
    "mimeTypes": [
      "application/hl7-v3"
    ],
    "classCode": {
      "code": "BRI",
      "system": "1.3.6.1.4.1.19376.3.276.1.5.8",
      "anzeige": "Brief"
    },
    "typeCode": {
      "code": "FPRO",
      "system": "1.3.6.1.4.1.19376.3.276.1.5.9",
      "anzeige": "Therapiedokumentation"
    }
  },
  {
    "datei": "ig-vaccination.json",
    "bezeichnung": "Vaccination Records",
    "element": "KBV_PR_MIO_Vaccination_Bundle_Entry",
    "formatCode": "urn:gematik:ig:Impfausweis:v1.1.0",
    "formatSystem": "1.3.6.1.4.1.19376.3.276.1.5.6",
    "formatAnzeige": "Impfausweis (gematik)",
    "mimeTypes": [
      "application/fhir+xml",
      "application/pkcs7-mime"
    ],
    "classCode": {
      "code": "AUS",
      "system": "1.3.6.1.4.1.19376.3.276.1.5.8",
      "anzeige": "Medizinischer Ausweis"
    },
    "typeCode": {
      "code": "MEDI",
      "system": "1.3.6.1.4.1.19376.3.276.1.5.9",
      "anzeige": "Medikamentöse Therapien"
    }
  },
  {
    "datei": "ig-childsrecord.json",
    "bezeichnung": "Child Medical Records",
    "element": "KBV_PR_MIO_PN_Bundle",
    "formatCode": "urn:gematik:ig:KinderuntersuchungsheftNotizen:v1.0.0",
    "formatSystem": "1.3.6.1.4.1.19376.3.276.1.5.6",
    "formatAnzeige": "Notizen Kinderuntersuchungsheft",
    "mimeTypes": [
      "application/fhir+xml"
    ],
    "classCode": {
      "code": "AUS",
      "system": "1.3.6.1.4.1.19376.3.276.1.5.8",
      "anzeige": "Medizinischer Ausweis"
    },
    "typeCode": {
      "code": "PATD",
      "system": "1.3.6.1.4.1.19376.3.276.1.5.9",
      "anzeige": "Patienteneigene Dokumente"
    }
  },
  {
    "datei": "ig-childsrecord_V1_0_1.json",
    "bezeichnung": "Child Medical Records",
    "element": "KBV_PR_MIO_PN_Bundle",
    "formatCode": "urn:gematik:ig:KinderuntersuchungsheftNotizen:v1.0.1",
    "formatSystem": "1.3.6.1.4.1.19376.3.276.1.5.6",
    "formatAnzeige": "Notizen Kinderuntersuchungsheft",
    "mimeTypes": [
      "application/fhir+xml"
    ],
    "classCode": {
      "code": "AUS",
      "system": "1.3.6.1.4.1.19376.3.276.1.5.8",
      "anzeige": "Medizinischer Ausweis"
    },
    "typeCode": {
      "code": "PATD",
      "system": "1.3.6.1.4.1.19376.3.276.1.5.9",
      "anzeige": "Patienteneigene Dokumente"
    }
  },
  {
    "datei": "ig-childsrecord.json",
    "bezeichnung": "Child Medical Records",
    "element": "KBV_PR_MIO_PC_Bundle",
    "formatCode": "urn:gematik:ig:KinderuntersuchungsheftTeilnahmekarte:v1.0.0",
    "formatSystem": "1.3.6.1.4.1.19376.3.276.1.5.6",
    "formatAnzeige": "Teilnahmekarte Kinderuntersuchungsheft",
    "mimeTypes": [
      "application/fhir+xml",
      "application/pkcs7-mime"
    ],
    "classCode": {
      "code": "AUS",
      "system": "1.3.6.1.4.1.19376.3.276.1.5.8",
      "anzeige": "Medizinischer Ausweis"
    },
    "typeCode": {
      "code": "BESC",
      "system": "1.3.6.1.4.1.19376.3.276.1.5.9",
      "anzeige": "Ärztliche Bescheinigungen"
    }
  },
  {
    "datei": "ig-childsrecord_V1_0_1.json",
    "bezeichnung": "Child Medical Records",
    "element": "KBV_PR_MIO_PC_Bundle",
    "formatCode": "urn:gematik:ig:KinderuntersuchungsheftTeilnahmekarte:v1.0.1",
    "formatSystem": "1.3.6.1.4.1.19376.3.276.1.5.6",
    "formatAnzeige": "Teilnahmekarte Kinderuntersuchungsheft",
    "mimeTypes": [
      "application/fhir+xml",
      "application/pkcs7-mime"
    ],
    "classCode": {
      "code": "AUS",
      "system": "1.3.6.1.4.1.19376.3.276.1.5.8",
      "anzeige": "Medizinischer Ausweis"
    },
    "typeCode": {
      "code": "BESC",
      "system": "1.3.6.1.4.1.19376.3.276.1.5.9",
      "anzeige": "Ärztliche Bescheinigungen"
    }
  },
  {
    "datei": "ig-childsrecord.json",
    "bezeichnung": "Child Medical Records",
    "element": "KBV_PR_MIO_CMR_Bundle",
    "formatCode": "urn:gematik:ig:KinderuntersuchungsheftUntersuchungen:v1.0.0",
    "formatSystem": "1.3.6.1.4.1.19376.3.276.1.5.6",
    "formatAnzeige": "Untersuchungen Kinderuntersuchungsheft",
    "mimeTypes": [
      "application/fhir+xml",
      "application/pkcs7-mime"
    ],
    "classCode": {
      "code": "AUS",
      "system": "1.3.6.1.4.1.19376.3.276.1.5.8",
      "anzeige": "Medizinischer Ausweis"
    },
    "typeCode": {
      "code": "BERI",
      "system": "1.3.6.1.4.1.19376.3.276.1.5.9",
      "anzeige": "Arztberichte"
    }
  },
  {
    "datei": "ig-childsrecord_V1_0_1.json",
    "bezeichnung": "Child Medical Records",
    "element": "KBV_PR_MIO_CMR_Bundle",
    "formatCode": "urn:gematik:ig:KinderuntersuchungsheftUntersuchungen:v1.0.1",
    "formatSystem": "1.3.6.1.4.1.19376.3.276.1.5.6",
    "formatAnzeige": "Untersuchungen Kinderuntersuchungsheft",
    "mimeTypes": [
      "application/fhir+xml",
      "application/pkcs7-mime"
    ],
    "classCode": {
      "code": "AUS",
      "system": "1.3.6.1.4.1.19376.3.276.1.5.8",
      "anzeige": "Medizinischer Ausweis"
    },
    "typeCode": {
      "code": "BERI",
      "system": "1.3.6.1.4.1.19376.3.276.1.5.9",
      "anzeige": "Arztberichte"
    }
  },
  {
    "datei": "ig-emp.json",
    "bezeichnung": "Medication Plan",
    "element": "Medication Plan",
    "formatCode": "urn:gematik:ig:Medikationsplan:r3.1",
    "formatSystem": "1.3.6.1.4.1.19376.3.276.1.5.6",
    "formatAnzeige": "Medikationsplan (gematik)",
    "mimeTypes": [
      "application/xml"
    ],
    "classCode": {
      "code": "PLA",
      "system": "1.3.6.1.4.1.19376.3.276.1.5.8",
      "anzeige": "Planungsdokument"
    },
    "typeCode": {
      "code": "MEDI",
      "system": "1.3.6.1.4.1.19376.3.276.1.5.9",
      "anzeige": "Medikamentöse Therapien"
    }
  },
  {
    "datei": "ig-mothersrecord.json",
    "bezeichnung": "Maternity Records",
    "element": "KBV_PR_MIO_MR_Bundle",
    "formatCode": "urn:gematik:ig:Mutterpass:v1.0.0",
    "formatSystem": "1.3.6.1.4.1.19376.3.276.1.5.6",
    "formatAnzeige": "Mutterpass (gematik)",
    "mimeTypes": [
      "application/fhir+xml",
      "application/pkcs7-mime"
    ],
    "classCode": {
      "code": "AUS",
      "system": "1.3.6.1.4.1.19376.3.276.1.5.8",
      "anzeige": "Medizinischer Ausweis"
    },
    "typeCode": {
      "code": "GEBU",
      "system": "1.3.6.1.4.1.19376.3.276.1.5.9",
      "anzeige": "Schwangerschafts- und Geburtsdokumentation"
    }
  },
  {
    "datei": "ig-mothersrecord_V_1_1_0.json",
    "bezeichnung": "Maternity Records",
    "element": "KBV_PR_MIO_MR_Bundle",
    "formatCode": "urn:gematik:ig:Mutterpass:v1.1.0",
    "formatSystem": "1.3.6.1.4.1.19376.3.276.1.5.6",
    "formatAnzeige": "Mutterpass (gematik)",
    "mimeTypes": [
      "application/fhir+xml",
      "application/pkcs7-mime"
    ],
    "classCode": {
      "code": "AUS",
      "system": "1.3.6.1.4.1.19376.3.276.1.5.8",
      "anzeige": "Medizinischer Ausweis"
    },
    "typeCode": {
      "code": "GEBU",
      "system": "1.3.6.1.4.1.19376.3.276.1.5.9",
      "anzeige": "Schwangerschafts- und Geburtsdokumentation"
    }
  },
  {
    "datei": "ig-nfd.json",
    "bezeichnung": "Emergency Record",
    "element": "Emergency Record",
    "formatCode": "urn:gematik:ig:Notfalldatensatz:r3.1",
    "formatSystem": "1.3.6.1.4.1.19376.3.276.1.5.6",
    "formatAnzeige": "Notfalldatensatz",
    "mimeTypes": [
      "application/xml"
    ],
    "classCode": {
      "code": "AUS",
      "system": "1.3.6.1.4.1.19376.3.276.1.5.8",
      "anzeige": "Medizinischer Ausweis"
    },
    "typeCode": null
  },
  {
    "datei": "ig-epka_V_1_0.json",
    "bezeichnung": "Patient Summary",
    "element": "KBV_PR_MIO_NFDxDPE_Bundle",
    "formatCode": "urn:gematik:ig:pka:v1.0",
    "formatSystem": "1.3.6.1.4.1.19376.3.276.1.5.6",
    "formatAnzeige": "Patientenkurzakte (gematik) v1.0",
    "mimeTypes": [
      "application/fhir+xml"
    ],
    "classCode": {
      "code": "AUS",
      "system": "1.3.6.1.4.1.19376.3.276.1.5.8",
      "anzeige": "Medizinischer Ausweis"
    },
    "typeCode": {
      "code": "BEFU",
      "system": "1.3.6.1.4.1.19376.3.276.1.5.9",
      "anzeige": "Ergebnisse Diagnostik"
    }
  },
  {
    "datei": "ig-dentalrecord.json",
    "bezeichnung": "Dental Records",
    "element": "KBV_PR_MIO_ZAEB_Bundle",
    "formatCode": "urn:gematik:ig:Zahnbonusheft:v1.1.0",
    "formatSystem": "1.3.6.1.4.1.19376.3.276.1.5.6",
    "formatAnzeige": "Zahnbonusheft (gematik)",
    "mimeTypes": [
      "application/fhir+xml",
      "application/pkcs7-mime"
    ],
    "classCode": {
      "code": "AUS",
      "system": "1.3.6.1.4.1.19376.3.276.1.5.8",
      "anzeige": "Medizinischer Ausweis"
    },
    "typeCode": {
      "code": "PATD",
      "system": "1.3.6.1.4.1.19376.3.276.1.5.9",
      "anzeige": "Patienteneigene Dokumente"
    }
  }
];
