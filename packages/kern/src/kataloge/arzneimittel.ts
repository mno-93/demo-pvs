// Erzeugt aus daten/kataloge/arzneimittel-auszug.json — nicht von Hand ändern.
// Neu erzeugen mit: node werkzeuge/kataloge-erzeugen.mjs
import type { ArzneimittelEintrag, Katalogkopf } from './typen.js';

export const arzneimittelKopf: Katalogkopf = {
  "_katalog": "Arzneimittel",
  "_art": "Auszug für die Demo, keine amtliche Arzneimitteldatenbank",
  "_hinweis": "Bewusst keine Handelsnamen: aufgeführt sind Wirkstoff, Stärke und Darreichungsform, damit kein reales Präparat nachgebildet wird. Die PZN sind fiktiv und fortlaufend vergeben; sie zeigen auf kein existierendes Produkt. ATC-Codes sind real. Keine Grundlage für Verordnungen.",
  "_nierenhinweis": "Die Angaben zur Nierenfunktion sind vereinfachte Orientierungswerte für die Demo und ersetzen keine Fachinformation. Sie dienen dazu, den Mechanismus einer AMTS-Prüfung zu zeigen."
};

export const arzneimittel: readonly ArzneimittelEintrag[] = [
  {
    "pzn": "90900000",
    "wirkstoff": "Apixaban",
    "atc": "B01AF02",
    "staerke": "5 mg",
    "darreichung": "Filmtabletten",
    "allergiegruppen": [
      "Blutungsrisiko"
    ],
    "warnhinweis": "Nierenfunktion beachten",
    "bezeichnung": "Apixaban 5 mg Filmtabletten",
    "atcVersion": "2026",
    "nierengrenze": {
      "warnungAb": 30,
      "kontraindiziertAb": 15,
      "text": "Apixaban: Dosisreduktion bei eingeschränkter Nierenfunktion prüfen."
    }
  },
  {
    "pzn": "90900001",
    "wirkstoff": "Apixaban",
    "atc": "B01AF02",
    "staerke": "2,5 mg",
    "darreichung": "Filmtabletten",
    "allergiegruppen": [
      "Blutungsrisiko"
    ],
    "warnhinweis": "Dosisreduktion bei eingeschränkter Nierenfunktion",
    "bezeichnung": "Apixaban 2,5 mg Filmtabletten",
    "atcVersion": "2026",
    "nierengrenze": {
      "warnungAb": 30,
      "kontraindiziertAb": 15,
      "text": "Apixaban: Dosisreduktion bei eingeschränkter Nierenfunktion prüfen."
    }
  },
  {
    "pzn": "90900002",
    "wirkstoff": "Phenprocoumon",
    "atc": "B01AA04",
    "staerke": "3 mg",
    "darreichung": "Tabletten",
    "allergiegruppen": [
      "Blutungsrisiko"
    ],
    "warnhinweis": "INR-Kontrolle",
    "bezeichnung": "Phenprocoumon 3 mg Tabletten",
    "atcVersion": "2026",
    "nierengrenze": null
  },
  {
    "pzn": "90900003",
    "wirkstoff": "Acetylsalicylsäure",
    "atc": "B01AC06",
    "staerke": "100 mg",
    "darreichung": "Tabletten",
    "allergiegruppen": [
      "Blutungsrisiko"
    ],
    "warnhinweis": "",
    "bezeichnung": "Acetylsalicylsäure 100 mg Tabletten",
    "atcVersion": "2026",
    "nierengrenze": null
  },
  {
    "pzn": "90900004",
    "wirkstoff": "Clopidogrel",
    "atc": "B01AC04",
    "staerke": "75 mg",
    "darreichung": "Filmtabletten",
    "allergiegruppen": [
      "Blutungsrisiko"
    ],
    "warnhinweis": "",
    "bezeichnung": "Clopidogrel 75 mg Filmtabletten",
    "atcVersion": "2026",
    "nierengrenze": null
  },
  {
    "pzn": "90900005",
    "wirkstoff": "Metformin",
    "atc": "A10BA02",
    "staerke": "1000 mg",
    "darreichung": "Filmtabletten",
    "allergiegruppen": [],
    "warnhinweis": "Bei eGFR unter 45 Dosis prüfen, unter 30 kontraindiziert",
    "bezeichnung": "Metformin 1000 mg Filmtabletten",
    "atcVersion": "2026",
    "nierengrenze": {
      "warnungAb": 45,
      "kontraindiziertAb": 30,
      "text": "Metformin: unter 45 ml/min Dosis prüfen, unter 30 kontraindiziert."
    }
  },
  {
    "pzn": "90900006",
    "wirkstoff": "Metformin",
    "atc": "A10BA02",
    "staerke": "500 mg",
    "darreichung": "Filmtabletten",
    "allergiegruppen": [],
    "warnhinweis": "Bei eGFR unter 45 Dosis prüfen, unter 30 kontraindiziert",
    "bezeichnung": "Metformin 500 mg Filmtabletten",
    "atcVersion": "2026",
    "nierengrenze": {
      "warnungAb": 45,
      "kontraindiziertAb": 30,
      "text": "Metformin: unter 45 ml/min Dosis prüfen, unter 30 kontraindiziert."
    }
  },
  {
    "pzn": "90900007",
    "wirkstoff": "Empagliflozin",
    "atc": "A10BK03",
    "staerke": "10 mg",
    "darreichung": "Filmtabletten",
    "allergiegruppen": [],
    "warnhinweis": "",
    "bezeichnung": "Empagliflozin 10 mg Filmtabletten",
    "atcVersion": "2026",
    "nierengrenze": null
  },
  {
    "pzn": "90900008",
    "wirkstoff": "Insulin glargin",
    "atc": "A10AE04",
    "staerke": "100 E/ml",
    "darreichung": "Injektionslösung",
    "allergiegruppen": [],
    "warnhinweis": "",
    "bezeichnung": "Insulin glargin 100 E/ml Injektionslösung",
    "atcVersion": "2026",
    "nierengrenze": null
  },
  {
    "pzn": "90900009",
    "wirkstoff": "Ramipril",
    "atc": "C09AA05",
    "staerke": "5 mg",
    "darreichung": "Tabletten",
    "allergiegruppen": [],
    "warnhinweis": "Nierenfunktion und Kalium kontrollieren",
    "bezeichnung": "Ramipril 5 mg Tabletten",
    "atcVersion": "2026",
    "nierengrenze": {
      "warnungAb": 30,
      "kontraindiziertAb": null,
      "text": "ACE-Hemmer: Nierenfunktion und Kalium engmaschig kontrollieren."
    }
  },
  {
    "pzn": "90900010",
    "wirkstoff": "Ramipril",
    "atc": "C09AA05",
    "staerke": "2,5 mg",
    "darreichung": "Tabletten",
    "allergiegruppen": [],
    "warnhinweis": "Nierenfunktion und Kalium kontrollieren",
    "bezeichnung": "Ramipril 2,5 mg Tabletten",
    "atcVersion": "2026",
    "nierengrenze": {
      "warnungAb": 30,
      "kontraindiziertAb": null,
      "text": "ACE-Hemmer: Nierenfunktion und Kalium engmaschig kontrollieren."
    }
  },
  {
    "pzn": "90900011",
    "wirkstoff": "Candesartan",
    "atc": "C09CA06",
    "staerke": "8 mg",
    "darreichung": "Tabletten",
    "allergiegruppen": [],
    "warnhinweis": "",
    "bezeichnung": "Candesartan 8 mg Tabletten",
    "atcVersion": "2026",
    "nierengrenze": null
  },
  {
    "pzn": "90900012",
    "wirkstoff": "Amlodipin",
    "atc": "C08CA01",
    "staerke": "5 mg",
    "darreichung": "Tabletten",
    "allergiegruppen": [],
    "warnhinweis": "",
    "bezeichnung": "Amlodipin 5 mg Tabletten",
    "atcVersion": "2026",
    "nierengrenze": null
  },
  {
    "pzn": "90900013",
    "wirkstoff": "Bisoprolol",
    "atc": "C07AB07",
    "staerke": "2,5 mg",
    "darreichung": "Filmtabletten",
    "allergiegruppen": [],
    "warnhinweis": "",
    "bezeichnung": "Bisoprolol 2,5 mg Filmtabletten",
    "atcVersion": "2026",
    "nierengrenze": null
  },
  {
    "pzn": "90900014",
    "wirkstoff": "Bisoprolol",
    "atc": "C07AB07",
    "staerke": "5 mg",
    "darreichung": "Filmtabletten",
    "allergiegruppen": [],
    "warnhinweis": "",
    "bezeichnung": "Bisoprolol 5 mg Filmtabletten",
    "atcVersion": "2026",
    "nierengrenze": null
  },
  {
    "pzn": "90900015",
    "wirkstoff": "Metoprolol",
    "atc": "C07AB02",
    "staerke": "47,5 mg",
    "darreichung": "Retardtabletten",
    "allergiegruppen": [],
    "warnhinweis": "",
    "bezeichnung": "Metoprolol 47,5 mg Retardtabletten",
    "atcVersion": "2026",
    "nierengrenze": null
  },
  {
    "pzn": "90900016",
    "wirkstoff": "Torasemid",
    "atc": "C03CA04",
    "staerke": "10 mg",
    "darreichung": "Tabletten",
    "allergiegruppen": [],
    "warnhinweis": "Elektrolyte kontrollieren",
    "bezeichnung": "Torasemid 10 mg Tabletten",
    "atcVersion": "2026",
    "nierengrenze": null
  },
  {
    "pzn": "90900017",
    "wirkstoff": "Hydrochlorothiazid",
    "atc": "C03AA03",
    "staerke": "12,5 mg",
    "darreichung": "Tabletten",
    "allergiegruppen": [],
    "warnhinweis": "Natrium kontrollieren",
    "bezeichnung": "Hydrochlorothiazid 12,5 mg Tabletten",
    "atcVersion": "2026",
    "nierengrenze": null
  },
  {
    "pzn": "90900018",
    "wirkstoff": "Spironolacton",
    "atc": "C03DA01",
    "staerke": "25 mg",
    "darreichung": "Filmtabletten",
    "allergiegruppen": [],
    "warnhinweis": "Kalium kontrollieren",
    "bezeichnung": "Spironolacton 25 mg Filmtabletten",
    "atcVersion": "2026",
    "nierengrenze": {
      "warnungAb": 30,
      "kontraindiziertAb": null,
      "text": "Spironolacton: Hyperkaliämierisiko bei eingeschränkter Nierenfunktion."
    }
  },
  {
    "pzn": "90900019",
    "wirkstoff": "Atorvastatin",
    "atc": "C10AA05",
    "staerke": "40 mg",
    "darreichung": "Filmtabletten",
    "allergiegruppen": [],
    "warnhinweis": "",
    "bezeichnung": "Atorvastatin 40 mg Filmtabletten",
    "atcVersion": "2026",
    "nierengrenze": null
  },
  {
    "pzn": "90900020",
    "wirkstoff": "Simvastatin",
    "atc": "C10AA01",
    "staerke": "20 mg",
    "darreichung": "Filmtabletten",
    "allergiegruppen": [],
    "warnhinweis": "",
    "bezeichnung": "Simvastatin 20 mg Filmtabletten",
    "atcVersion": "2026",
    "nierengrenze": null
  },
  {
    "pzn": "90900021",
    "wirkstoff": "Pantoprazol",
    "atc": "A02BC02",
    "staerke": "40 mg",
    "darreichung": "Tabletten",
    "allergiegruppen": [],
    "warnhinweis": "",
    "bezeichnung": "Pantoprazol 40 mg Tabletten",
    "atcVersion": "2026",
    "nierengrenze": null
  },
  {
    "pzn": "90900022",
    "wirkstoff": "Pantoprazol",
    "atc": "A02BC02",
    "staerke": "20 mg",
    "darreichung": "Tabletten",
    "allergiegruppen": [],
    "warnhinweis": "",
    "bezeichnung": "Pantoprazol 20 mg Tabletten",
    "atcVersion": "2026",
    "nierengrenze": null
  },
  {
    "pzn": "90900023",
    "wirkstoff": "Levothyroxin",
    "atc": "H03AA01",
    "staerke": "75 µg",
    "darreichung": "Tabletten",
    "allergiegruppen": [],
    "warnhinweis": "",
    "bezeichnung": "Levothyroxin 75 µg Tabletten",
    "atcVersion": "2026",
    "nierengrenze": null
  },
  {
    "pzn": "90900024",
    "wirkstoff": "Levothyroxin",
    "atc": "H03AA01",
    "staerke": "100 µg",
    "darreichung": "Tabletten",
    "allergiegruppen": [],
    "warnhinweis": "",
    "bezeichnung": "Levothyroxin 100 µg Tabletten",
    "atcVersion": "2026",
    "nierengrenze": null
  },
  {
    "pzn": "90900025",
    "wirkstoff": "Allopurinol",
    "atc": "M04AA01",
    "staerke": "300 mg",
    "darreichung": "Tabletten",
    "allergiegruppen": [],
    "warnhinweis": "",
    "bezeichnung": "Allopurinol 300 mg Tabletten",
    "atcVersion": "2026",
    "nierengrenze": null
  },
  {
    "pzn": "90900026",
    "wirkstoff": "Ibuprofen",
    "atc": "M01AE01",
    "staerke": "400 mg",
    "darreichung": "Filmtabletten",
    "allergiegruppen": [],
    "warnhinweis": "Bei eingeschränkter Nierenfunktion meiden",
    "bezeichnung": "Ibuprofen 400 mg Filmtabletten",
    "atcVersion": "2026",
    "nierengrenze": {
      "warnungAb": 60,
      "kontraindiziertAb": 30,
      "text": "Nichtsteroidale Antirheumatika: bei eingeschränkter Nierenfunktion meiden."
    }
  },
  {
    "pzn": "90900027",
    "wirkstoff": "Ibuprofen",
    "atc": "M01AE01",
    "staerke": "600 mg",
    "darreichung": "Filmtabletten",
    "allergiegruppen": [],
    "warnhinweis": "Bei eingeschränkter Nierenfunktion meiden",
    "bezeichnung": "Ibuprofen 600 mg Filmtabletten",
    "atcVersion": "2026",
    "nierengrenze": {
      "warnungAb": 60,
      "kontraindiziertAb": 30,
      "text": "Nichtsteroidale Antirheumatika: bei eingeschränkter Nierenfunktion meiden."
    }
  },
  {
    "pzn": "90900028",
    "wirkstoff": "Diclofenac",
    "atc": "M01AB05",
    "staerke": "50 mg",
    "darreichung": "Tabletten",
    "allergiegruppen": [],
    "warnhinweis": "Bei eingeschränkter Nierenfunktion meiden",
    "bezeichnung": "Diclofenac 50 mg Tabletten",
    "atcVersion": "2026",
    "nierengrenze": {
      "warnungAb": 60,
      "kontraindiziertAb": 30,
      "text": "Nichtsteroidale Antirheumatika: bei eingeschränkter Nierenfunktion meiden."
    }
  },
  {
    "pzn": "90900029",
    "wirkstoff": "Metamizol",
    "atc": "N02BB02",
    "staerke": "500 mg",
    "darreichung": "Tabletten",
    "allergiegruppen": [],
    "warnhinweis": "Agranulozytoserisiko",
    "bezeichnung": "Metamizol 500 mg Tabletten",
    "atcVersion": "2026",
    "nierengrenze": null
  },
  {
    "pzn": "90900030",
    "wirkstoff": "Paracetamol",
    "atc": "N02BE01",
    "staerke": "500 mg",
    "darreichung": "Tabletten",
    "allergiegruppen": [],
    "warnhinweis": "",
    "bezeichnung": "Paracetamol 500 mg Tabletten",
    "atcVersion": "2026",
    "nierengrenze": null
  },
  {
    "pzn": "90900031",
    "wirkstoff": "Tilidin/Naloxon",
    "atc": "N02AX51",
    "staerke": "50/4 mg",
    "darreichung": "Retardtabletten",
    "allergiegruppen": [],
    "warnhinweis": "",
    "bezeichnung": "Tilidin/Naloxon 50/4 mg Retardtabletten",
    "atcVersion": "2026",
    "nierengrenze": null
  },
  {
    "pzn": "90900032",
    "wirkstoff": "Amoxicillin",
    "atc": "J01CA04",
    "staerke": "1000 mg",
    "darreichung": "Filmtabletten",
    "allergiegruppen": [
      "Penicilline"
    ],
    "warnhinweis": "",
    "bezeichnung": "Amoxicillin 1000 mg Filmtabletten",
    "atcVersion": "2026",
    "nierengrenze": null
  },
  {
    "pzn": "90900033",
    "wirkstoff": "Amoxicillin/Clavulansäure",
    "atc": "J01CR02",
    "staerke": "875/125 mg",
    "darreichung": "Filmtabletten",
    "allergiegruppen": [
      "Penicilline"
    ],
    "warnhinweis": "",
    "bezeichnung": "Amoxicillin/Clavulansäure 875/125 mg Filmtabletten",
    "atcVersion": "2026",
    "nierengrenze": null
  },
  {
    "pzn": "90900034",
    "wirkstoff": "Phenoxymethylpenicillin",
    "atc": "J01CE02",
    "staerke": "1,5 Mio. I.E.",
    "darreichung": "Filmtabletten",
    "allergiegruppen": [
      "Penicilline"
    ],
    "warnhinweis": "",
    "bezeichnung": "Phenoxymethylpenicillin 1,5 Mio. I.E. Filmtabletten",
    "atcVersion": "2026",
    "nierengrenze": null
  },
  {
    "pzn": "90900035",
    "wirkstoff": "Cefuroxim",
    "atc": "J01DC02",
    "staerke": "500 mg",
    "darreichung": "Filmtabletten",
    "allergiegruppen": [
      "Cephalosporine"
    ],
    "warnhinweis": "Kreuzreaktion mit Penicillinen möglich",
    "bezeichnung": "Cefuroxim 500 mg Filmtabletten",
    "atcVersion": "2026",
    "nierengrenze": null
  },
  {
    "pzn": "90900036",
    "wirkstoff": "Doxycyclin",
    "atc": "J01AA02",
    "staerke": "100 mg",
    "darreichung": "Tabletten",
    "allergiegruppen": [],
    "warnhinweis": "",
    "bezeichnung": "Doxycyclin 100 mg Tabletten",
    "atcVersion": "2026",
    "nierengrenze": null
  },
  {
    "pzn": "90900037",
    "wirkstoff": "Ciprofloxacin",
    "atc": "J01MA02",
    "staerke": "500 mg",
    "darreichung": "Filmtabletten",
    "allergiegruppen": [],
    "warnhinweis": "Sehnenbeschwerden, Dosisanpassung bei Niereninsuffizienz",
    "bezeichnung": "Ciprofloxacin 500 mg Filmtabletten",
    "atcVersion": "2026",
    "nierengrenze": {
      "warnungAb": 30,
      "kontraindiziertAb": null,
      "text": "Ciprofloxacin: Dosisanpassung bei eingeschränkter Nierenfunktion."
    }
  },
  {
    "pzn": "90900038",
    "wirkstoff": "Nitrofurantoin",
    "atc": "J01XE01",
    "staerke": "100 mg",
    "darreichung": "Retardkapseln",
    "allergiegruppen": [],
    "warnhinweis": "Bei eGFR unter 45 kontraindiziert",
    "bezeichnung": "Nitrofurantoin 100 mg Retardkapseln",
    "atcVersion": "2026",
    "nierengrenze": {
      "warnungAb": 60,
      "kontraindiziertAb": 45,
      "text": "Nitrofurantoin: unter 45 ml/min kontraindiziert."
    }
  },
  {
    "pzn": "90900039",
    "wirkstoff": "Fosfomycin",
    "atc": "J01XX01",
    "staerke": "3 g",
    "darreichung": "Granulat",
    "allergiegruppen": [],
    "warnhinweis": "",
    "bezeichnung": "Fosfomycin 3 g Granulat",
    "atcVersion": "2026",
    "nierengrenze": null
  },
  {
    "pzn": "90900040",
    "wirkstoff": "Salbutamol",
    "atc": "R03AC02",
    "staerke": "100 µg",
    "darreichung": "Dosieraerosol",
    "allergiegruppen": [],
    "warnhinweis": "",
    "bezeichnung": "Salbutamol 100 µg Dosieraerosol",
    "atcVersion": "2026",
    "nierengrenze": null
  },
  {
    "pzn": "90900041",
    "wirkstoff": "Budesonid/Formoterol",
    "atc": "R03AK07",
    "staerke": "160/4,5 µg",
    "darreichung": "Pulverinhalator",
    "allergiegruppen": [],
    "warnhinweis": "",
    "bezeichnung": "Budesonid/Formoterol 160/4,5 µg Pulverinhalator",
    "atcVersion": "2026",
    "nierengrenze": null
  },
  {
    "pzn": "90900042",
    "wirkstoff": "Cetirizin",
    "atc": "R06AE07",
    "staerke": "10 mg",
    "darreichung": "Filmtabletten",
    "allergiegruppen": [],
    "warnhinweis": "",
    "bezeichnung": "Cetirizin 10 mg Filmtabletten",
    "atcVersion": "2026",
    "nierengrenze": null
  },
  {
    "pzn": "90900043",
    "wirkstoff": "Sertralin",
    "atc": "N06AB06",
    "staerke": "50 mg",
    "darreichung": "Filmtabletten",
    "allergiegruppen": [],
    "warnhinweis": "",
    "bezeichnung": "Sertralin 50 mg Filmtabletten",
    "atcVersion": "2026",
    "nierengrenze": null
  },
  {
    "pzn": "90900044",
    "wirkstoff": "Mirtazapin",
    "atc": "N06AX11",
    "staerke": "15 mg",
    "darreichung": "Filmtabletten",
    "allergiegruppen": [],
    "warnhinweis": "",
    "bezeichnung": "Mirtazapin 15 mg Filmtabletten",
    "atcVersion": "2026",
    "nierengrenze": null
  },
  {
    "pzn": "90900045",
    "wirkstoff": "Colecalciferol",
    "atc": "A11CC05",
    "staerke": "20.000 I.E.",
    "darreichung": "Tabletten",
    "allergiegruppen": [],
    "warnhinweis": "",
    "bezeichnung": "Colecalciferol 20.000 I.E. Tabletten",
    "atcVersion": "2026",
    "nierengrenze": null
  }
];
