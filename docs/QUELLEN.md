# Quellen

Öffentliche Spezifikationen, gegen die die Demo gebaut ist. Stand der Prüfung: 01.10.2026.

## ePA — Release 3.1.3

| Quelle                                 | Version / Stand                      | Verwendet für                                                                                                                                                                                  |
| -------------------------------------- | ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Repository `gematik/ePA-Basic`         | Branch `ePA-3.1.3`, Commit `3186ad2` | Konzept, Befugnismanagement, Consent Management, Push Notification Management, OpenAPI (`I_Entitlement_Management` 1.8.0, `I_Information_Service` 1.5.1), Kopfzeilen, Fehlercodes              |
| Repository `gematik/ePA-Medication`    | Branch `ePA-3.1.3`                   | Konzept Medication Service                                                                                                                                                                     |
| Repository `gematik/ePA-XDS-Document`  | Branch `ePA-3.1.3`, Commit `c88635c` | registrierte Dokumenttypen und formatCodes (`daten/kataloge/dokumenttypen-epa.json`)                                                                                                           |
| FHIR-Paket `de.gematik.epa`            | 1.3.2                                | Generelle Prinzipien: `X-Requesting-Organization`, `EPAActivityProvenance`, Fehlerformat                                                                                                       |
| FHIR-Paket `de.gematik.epa.medication` | 1.3.5                                | Operationen, Profile, Chronologie und Lesenachweis des Medication Service; technische Anwendungsfälle zu Verschreibung, Abgabe, Stornierung und eMP-Identifier; Statuscode 423 bei Widerspruch |
| FHIR-Paket `de.gematik.epa.mhd`        | 1.1.3                                | ITI-67/ITI-68, `EPAMHDDocumentReference`, `EPADocumentSearchResultBundle`                                                                                                                      |

## E-Rezept

| Quelle                                             | Version / Stand                       | Verwendet für                                                                                   |
| -------------------------------------------------- | ------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Repository `gematik/api-erp` (E-Rezept-Fachdienst) | laufender Stand, abgerufen 29.09.2026 | `Task/$create`, `$activate`, `$abort`, `X-AccessCode`, Flowtypes, Rezept-ID                     |
| KBV-Profile `kbv.ita.erp`                          | 1.4.0                                 | Verordnungsdatensatz, strukturierte Dosierung, eMP-Identifier unter `MedicationRequest.basedOn` |

⚠ Der Fachdienst ist in der Demo ein Ersatz ohne VAU und QES; der Datensatz ist vereinfacht.

## Weiterentwicklung

| Quelle                                                 | Version / Stand                                       | Verwendet für                                                                                                   |
| ------------------------------------------------------ | ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Fachkonzept „Digital gestützter Laborprozess" (dgLP)   | V1.0.0, ePA 3.2                                       | Einordnung des strukturierten Laborbefunds                                                                      |
| FHIR-Paket `de.gematik.epa.laboratory`                 | 1.0.0-ballot.1                                        | Profile des Laborbefunds (`bundle-dglp` u. a.)                                                                  |
| FHIR-Paket `de.gematik.ti`                             | 1.5.0-ballot.1                                        | `ti-condition-diagnosis`, `TIOrganization`, `sorting-number-extension`                                          |
| FHIR-Paket `hl7.fhir.eu.base` (EU Core)                | —                                                     | `condition-eu-core`, `allergyIntolerance-eu-core`, `immunization-eu-core` (Impfliste)                           |
| European Patient Summary, HL7 Europe (`hl7-eu/eps`)    | 1.0.0-ballot, Branch `1.0.0-ballot`, Commit `5a7a236` | `bundle-eu-eps`, `composition-eu-eps`, Pflicht-Sections, `emptyReason`, Section „Immunizations" (LOINC 11369-6) |
| International Patient Summary, HL7 (`hl7.fhir.uv.ips`) | —                                                     | Operation `$summary` als Muster                                                                                 |
| Xt-EHR EHDS Logical Information Models                 | 1.0.0                                                 | Patient Summary: Pflicht-Abschnitte, Kopf mit rechtlicher Authentifizierung (offene Frage 7.6)                  |

Die FHIR-Pakete sind über die FHIR-Paketregistrierung (etwa Simplifier) unter Name und Version
abrufbar.

## Terminologien

| Quelle                                                                                                                                     | Version                                                                                                                                         |
| ------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| SNOMED CT, deutsche Edition                                                                                                                | `http://snomed.info/sct/11000274103/version/20260515`                                                                                           |
| Zentraler Terminologieserver (BfArM): `KBV_VS_AllergyIntolerance_Substance_SNOMED_CT`, `KBV_VS_AllergyIntolerance_Manifestation_SNOMED_CT` | 1.0.0, Stand 21.07.2026; auslösende Substanzen (197) und Manifestationen (37) einer Allergie; Übernahme mit `werkzeuge/wertelisten-vom-zts.mjs` |
| KBV-Basisprofile, FHIR-Paket `kbv.basis`: `KBV_VS_Base_Route_of_Administration_SNOMED_CT`                                                  | 1.9.0; Expositionsweg einer Reaktion (63). ⚠ Inhalt nicht gegen das Paket abgeglichen                                                           |
| HL7 FHIR R4: `condition-severity`                                                                                                          | 4.0.1; Schweregrad einer Diagnose (3)                                                                                                           |
| LOINC                                                                                                                                      | 2.82                                                                                                                                            |
| ICD-10-GM, ATC, EBM                                                                                                                        | Auszüge, Fassung 2026, nicht amtlich                                                                                                            |

## Vorbilder für den ✦ Vorschlag

- **e-Diagnose (Österreich):** zentraler Dienst, über den Allergien und Diagnosen
  sektorenübergreifend geführt werden.
- **Zentraler Kodierservice (Österreich):** ein Suchbegriff, mehrere Kodierungen.
- **Medication Service (dgMP):** Mechanik aus Liste, Chronologie und Lesenachweis.
