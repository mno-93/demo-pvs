// Erzeugt aus daten/kataloge/impfstoffe-auszug.json — nicht von Hand ändern.
// Neu erzeugen mit: node werkzeuge/kataloge-erzeugen.mjs
import type { ImpfstoffEintrag, Katalogkopf } from './typen.js';

export const impfstoffeKopf: Katalogkopf = {
  "_katalog": "Impfstoffe",
  "_art": "Auszug für die Demo, keine amtliche Arzneimitteldatenbank",
  "_hinweis": "Wie beim Arzneimittelauszug keine Handelsnamen; PZN fiktiv und fortlaufend, ATC real. Die Zielkrankheiten sind als SNOMED CT angegeben — ⚠ nicht gegen einen Terminologieserver geprüft. Keine Grundlage für Impfentscheidungen."
};

export const impfstoffe: readonly ImpfstoffEintrag[] = [
  {
    "pzn": "90900100",
    "bezeichnung": "Tetanus-Diphtherie-Impfstoff (Td), adsorbiert",
    "atc": "J07AM51",
    "atcVersion": "2026",
    "zielkrankheiten": [
      {
        "code": "76902006",
        "anzeige": "Tetanus"
      },
      {
        "code": "397430003",
        "anzeige": "Diphtherie"
      }
    ]
  },
  {
    "pzn": "90900101",
    "bezeichnung": "Tetanus-Diphtherie-Pertussis-Impfstoff (Tdap), adsorbiert",
    "atc": "J07AJ52",
    "atcVersion": "2026",
    "zielkrankheiten": [
      {
        "code": "76902006",
        "anzeige": "Tetanus"
      },
      {
        "code": "397430003",
        "anzeige": "Diphtherie"
      },
      {
        "code": "27836007",
        "anzeige": "Pertussis"
      }
    ]
  },
  {
    "pzn": "90900102",
    "bezeichnung": "Influenza-Impfstoff, inaktiviert, saisonal",
    "atc": "J07BB02",
    "atcVersion": "2026",
    "zielkrankheiten": [
      {
        "code": "6142004",
        "anzeige": "Influenza"
      }
    ]
  },
  {
    "pzn": "90900103",
    "bezeichnung": "COVID-19-mRNA-Impfstoff, variantenangepasst",
    "atc": "J07BN01",
    "atcVersion": "2026",
    "zielkrankheiten": [
      {
        "code": "840539006",
        "anzeige": "COVID-19"
      }
    ]
  },
  {
    "pzn": "90900104",
    "bezeichnung": "Pneumokokken-Konjugatimpfstoff",
    "atc": "J07AL02",
    "atcVersion": "2026",
    "zielkrankheiten": [
      {
        "code": "16814004",
        "anzeige": "Pneumokokken-Infektion"
      }
    ]
  },
  {
    "pzn": "90900105",
    "bezeichnung": "Herpes-zoster-Totimpfstoff, rekombinant",
    "atc": "J07BK03",
    "atcVersion": "2026",
    "zielkrankheiten": [
      {
        "code": "4740000",
        "anzeige": "Herpes zoster"
      }
    ]
  },
  {
    "pzn": "90900106",
    "bezeichnung": "FSME-Impfstoff, inaktiviert",
    "atc": "J07BA01",
    "atcVersion": "2026",
    "zielkrankheiten": [
      {
        "code": "712986001",
        "anzeige": "Frühsommer-Meningoenzephalitis (FSME)"
      }
    ]
  },
  {
    "pzn": "90900107",
    "bezeichnung": "Hepatitis-B-Impfstoff, rekombinant",
    "atc": "J07BC01",
    "atcVersion": "2026",
    "zielkrankheiten": [
      {
        "code": "66071002",
        "anzeige": "Hepatitis B"
      }
    ]
  },
  {
    "pzn": "90900108",
    "bezeichnung": "Masern-Mumps-Röteln-Lebendimpfstoff (MMR)",
    "atc": "J07BD52",
    "atcVersion": "2026",
    "zielkrankheiten": [
      {
        "code": "14189004",
        "anzeige": "Masern"
      },
      {
        "code": "36989005",
        "anzeige": "Mumps"
      },
      {
        "code": "36653000",
        "anzeige": "Röteln"
      }
    ]
  }
];
