// Erzeugt aus daten/kataloge/allergie-amts-zuordnung.json — nicht von Hand ändern.
// Neu erzeugen mit: node werkzeuge/kataloge-erzeugen.mjs
import type { AmtsZuordnungEintrag, Katalogkopf } from './typen.js';

export const amtsZuordnungKopf: Katalogkopf = {
  "_katalog": "Zuordnung auslösender Substanzen zu ATC für die AMTS-Prüfung",
  "_art": "Demo-Zuordnung, fachlich nicht geprüft",
  "_hinweis": "Erzeugt mit werkzeuge/amts-zuordnung-bilden.mjs aus allergie-substanzen.json und arzneimittel-auszug.json. Nur Arzneimittelsubstanzen, und nur solche, für die der Arzneimittelauszug ein Mittel führt oder eine Gruppe von Hand hinterlegt ist. Die Zuordnung wird nicht in FHIR-Ressourcen geschrieben — sie ist keine Übersetzung, sondern ein Prüfhilfsmittel."
};

export const amtsZuordnung: readonly AmtsZuordnungEintrag[] = [
  {
    "snomed": "108476002",
    "bezeichnung": "Torasemid",
    "atc": [
      "C03CA04"
    ],
    "weg": "Wirkstoffname",
    "hinweis": null
  },
  {
    "snomed": "1348311005",
    "bezeichnung": "Gadoliniumhaltiges Kontrastmittel",
    "atc": [
      "V08CA"
    ],
    "weg": "Gruppe",
    "hinweis": "Paramagnetische Kontrastmittel mit Gadolinium."
  },
  {
    "snomed": "372478003",
    "bezeichnung": "Doxycyclin",
    "atc": [
      "J01AA02"
    ],
    "weg": "Wirkstoffname",
    "hinweis": null
  },
  {
    "snomed": "372512008",
    "bezeichnung": "Candesartan",
    "atc": [
      "C09CA06"
    ],
    "weg": "Wirkstoffname",
    "hinweis": null
  },
  {
    "snomed": "372567009",
    "bezeichnung": "Metformin",
    "atc": [
      "A10BA02"
    ],
    "weg": "Wirkstoffname",
    "hinweis": null
  },
  {
    "snomed": "372594008",
    "bezeichnung": "Sertralin",
    "atc": [
      "N06AB06"
    ],
    "weg": "Wirkstoffname",
    "hinweis": null
  },
  {
    "snomed": "372687004",
    "bezeichnung": "Amoxicillin",
    "atc": [
      "J01CA04",
      "J01CR02"
    ],
    "weg": "Wirkstoffname",
    "hinweis": null
  },
  {
    "snomed": "372725003",
    "bezeichnung": "Phenoxymethylpenicillin",
    "atc": [
      "J01CE02"
    ],
    "weg": "Wirkstoffname",
    "hinweis": null
  },
  {
    "snomed": "372826007",
    "bezeichnung": "Metoprolol",
    "atc": [
      "C07AB02"
    ],
    "weg": "Wirkstoffname",
    "hinweis": null
  },
  {
    "snomed": "372833007",
    "bezeichnung": "Cefuroxim",
    "atc": [
      "J01DC02"
    ],
    "weg": "Wirkstoffname",
    "hinweis": null
  },
  {
    "snomed": "372840008",
    "bezeichnung": "Ciprofloxacin",
    "atc": [
      "J01MA02"
    ],
    "weg": "Wirkstoffname",
    "hinweis": null
  },
  {
    "snomed": "372877000",
    "bezeichnung": "Heparin",
    "atc": [
      "B01AB"
    ],
    "weg": "Gruppe",
    "hinweis": "Heparingruppe."
  },
  {
    "snomed": "373444002",
    "bezeichnung": "Atorvastatin",
    "atc": [
      "C10AA05"
    ],
    "weg": "Wirkstoffname",
    "hinweis": null
  },
  {
    "snomed": "373543005",
    "bezeichnung": "Nitrofurantoin",
    "atc": [
      "J01XE01"
    ],
    "weg": "Wirkstoffname",
    "hinweis": null
  },
  {
    "snomed": "373562008",
    "bezeichnung": "Tilidin",
    "atc": [
      "N02AX51"
    ],
    "weg": "Wirkstoffname",
    "hinweis": null
  },
  {
    "snomed": "386847004",
    "bezeichnung": "Mirtazapin",
    "atc": [
      "N06AX11"
    ],
    "weg": "Wirkstoffname",
    "hinweis": null
  },
  {
    "snomed": "386864001",
    "bezeichnung": "Amlodipin",
    "atc": [
      "C08CA01"
    ],
    "weg": "Wirkstoffname",
    "hinweis": null
  },
  {
    "snomed": "386868003",
    "bezeichnung": "Bisoprolol",
    "atc": [
      "C07AB07"
    ],
    "weg": "Wirkstoffname",
    "hinweis": null
  },
  {
    "snomed": "386872004",
    "bezeichnung": "Ramipril",
    "atc": [
      "C09AA05"
    ],
    "weg": "Wirkstoffname",
    "hinweis": null
  },
  {
    "snomed": "387135004",
    "bezeichnung": "Allopurinol",
    "atc": [
      "M04AA01"
    ],
    "weg": "Wirkstoffname",
    "hinweis": null
  },
  {
    "snomed": "387207008",
    "bezeichnung": "Ibuprofen",
    "atc": [
      "M01AE01"
    ],
    "weg": "Wirkstoffname",
    "hinweis": null
  },
  {
    "snomed": "387458008",
    "bezeichnung": "Acetylsalicylsäure",
    "atc": [
      "B01AC06",
      "N02BA01"
    ],
    "weg": "Gruppe und Wirkstoffname",
    "hinweis": "Acetylsalicylsäure steht in ATC zweimal: als Thrombozytenaggregationshemmer und als Analgetikum."
  },
  {
    "snomed": "387517004",
    "bezeichnung": "Paracetamol",
    "atc": [
      "N02BE01"
    ],
    "weg": "Wirkstoffname",
    "hinweis": null
  },
  {
    "snomed": "387525002",
    "bezeichnung": "Hydrochlorothiazid",
    "atc": [
      "C03AA03"
    ],
    "weg": "Wirkstoffname",
    "hinweis": null
  },
  {
    "snomed": "387584000",
    "bezeichnung": "Simvastatin",
    "atc": [
      "C10AA01"
    ],
    "weg": "Wirkstoffname",
    "hinweis": null
  },
  {
    "snomed": "395821003",
    "bezeichnung": "Pantoprazol",
    "atc": [
      "A02BC02"
    ],
    "weg": "Wirkstoffname",
    "hinweis": null
  },
  {
    "snomed": "395939008",
    "bezeichnung": "Clavulansäure",
    "atc": [
      "J01CR02"
    ],
    "weg": "Wirkstoffname",
    "hinweis": null
  },
  {
    "snomed": "426722004",
    "bezeichnung": "Iodhaltiges Kontrastmittel",
    "atc": [
      "V08A"
    ],
    "weg": "Gruppe",
    "hinweis": "Iodhaltige Röntgenkontrastmittel."
  },
  {
    "snomed": "7034005",
    "bezeichnung": "Diclofenac",
    "atc": [
      "M01AB05"
    ],
    "weg": "Wirkstoffname",
    "hinweis": null
  },
  {
    "snomed": "703894008",
    "bezeichnung": "Empagliflozin",
    "atc": [
      "A10BK03"
    ],
    "weg": "Wirkstoffname",
    "hinweis": null
  },
  {
    "snomed": "764146007",
    "bezeichnung": "Penicillin",
    "atc": [
      "J01C"
    ],
    "weg": "Gruppe",
    "hinweis": "ATC J01C umfasst alle Penicilline, auch in Kombination mit Beta-Lactamase-Hemmern."
  },
  {
    "snomed": "764147003",
    "bezeichnung": "Cephalosporin",
    "atc": [
      "J01DB",
      "J01DC",
      "J01DD",
      "J01DE",
      "J01DI"
    ],
    "weg": "Gruppe",
    "hinweis": "Cephalosporine verteilen sich in ATC auf fünf Gruppen; ein gemeinsamer Präfix existiert nicht."
  },
  {
    "snomed": "764148008",
    "bezeichnung": "Chinolon",
    "atc": [
      "J01MA",
      "J01MB"
    ],
    "weg": "Gruppe",
    "hinweis": "Chinolone: Fluorchinolone und andere Chinolone."
  },
  {
    "snomed": "780831000",
    "bezeichnung": "Metamizol",
    "atc": [
      "N02BB02"
    ],
    "weg": "Wirkstoffname",
    "hinweis": null
  }
];
