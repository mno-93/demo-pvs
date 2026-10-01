# 0017 — Zugriff auf die ePA nur mit Befugnis aus dem Einlesen der eGK

**Datum:** 11.09.2026 · **Status:** angenommen · **ersetzt:** den Demo-Schalter „ePA freigegeben"

## Zusammenhang

Bisher gab der Simulator jede Akte heraus, solange ein Demo-Schalter „ePA freigegeben" an war.
Das entspricht nicht der ePA für alle: Eine Einrichtung sieht eine Akte nur im
Behandlungskontext, und der entsteht durch das Stecken der eGK. Eine Demo, die diese Schwelle
weglässt, zeigt eine ePA, die es so nicht gibt — und verdeckt, dass der Zugriff an einem
Handgriff am Empfang hängt.

## Entscheidung

Der Simulator bildet das Befugnismanagement nach dem Release 3.1.3 nach:

| Regel                                                                                               | Grundlage                                                                         |
| --------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Beim Einlesen der eGK registriert das Primärsystem eine Befugnis mit dem Prüfungsnachweis           | Konzept 3.1.3, `entitlement_management.adoc`                                      |
| `POST /epa/basic/api/v1/ps/entitlements` (`setEntitlementPs`) mit `{jwt}`, Nutzlast `auditEvidence` | OpenAPI `I_Entitlement_Management.yaml` 1.8.0                                     |
| Antwort 201 `{validTo}`; Fehler 400, 403 `invalidToken` / `tokenReuse`, 404 `noHealthRecord`, 423   | ebd.                                                                              |
| Dauer 90 Tage, 3 Tage für Apotheken, ÖGD, Arbeits- und Betriebsmedizin                              | Konzept 3.1.3; Tabelle der OpenAPI                                                |
| `validTo` = Tag des Erteilens + Dauer − 1, 23:59:59 deutscher Zeit                                  | OpenAPI, mit den dortigen Beispielen als Test                                     |
| Eine bestehende Befugnis mit längerer Dauer bleibt                                                  | Konzept 3.1.3                                                                     |
| Abgelaufene Befugnisse werden gelöscht                                                              | Konzept 3.1.3                                                                     |
| Ohne gültige Befugnis: 403 `notEntitled` an jedem Fachdienst                                        | OpenAPI der Fachdienste, etwa `I_Consent_Decision_Management.yaml`, Fehlertabelle |

Alle Belege: Repository `ePA-Basic`, Branch `ePA-3.1.3`, Commit `3186ad2`.

Das **Praxissystem** führt je Person nur, was die ePA ihm beim Einlesen geantwortet hat
(`validTo`). Maßgeblich bleibt die ePA: Antwortet sie mit `notEntitled`, streicht das
Praxissystem seinen Eintrag. Ohne bekannte Befugnis fragen Kartei-Bereiche die ePA gar nicht
erst ab; wer die ePA ausdrücklich öffnet, bekommt die Antwort der ePA zu sehen. „eGK einlesen"
steht im Patientenkopf, in der Tagesübersicht, in den Stammdaten und an jeder Stelle, an der
die fehlende Befugnis sichtbar wird.

**Demo-Ersatz, gekennzeichnet:** Die Sitzung am Aktensystem (Authorization Service, ID-Token,
VAU) gibt es nicht; die Telematik-ID steht in der Kopfzeile `x-demo-sitzung`. Der
Prüfungsnachweis ist ein kleines JSON statt der VSDM-Prüfziffer, das JWT ist nicht signiert.
Beides steht im Quelltext und in der Übersicht des Simulators als ⚠.

**Nicht nachgebildet:** VSDM, Konnektor, Signaturprüfung im HSM, `hcv`, PoPP
(`setEntitlementPsV2` — nach dem Konzept künftig der einzige Weg), Befugnisse durch die
versicherte Person, Vertretungen, Blockliste, Mengenbegrenzung.

## Begründung

▸ Die Befugnis ist Teil der Aussage, nicht Zubehör. Sie erklärt, warum eine Praxis die Einträge
eines Klinikums erst nach dem Einlesen sieht, und warum die ePA ein fremdes System ist, das
antworten muss. Für die Patient Summary heißt das: Auch eine gute Liste nützt nur im
Behandlungskontext — außerhalb davon bleibt nur der Notfallzugriff, der hier nicht
nachgebildet ist.

▸ Das Praxissystem als Buchhalter der Befugnis, die ePA als Richterin: So bleibt die Anzeige
im Kopf („ePA-Befugnis bis …") ehrlich. Sie kann veralten — die Demo-Steuerung „Befugnisse
entziehen" führt das vor —, und die nächste Antwort der ePA berichtigt sie.

## Verworfen

**Den Schalter „ePA freigegeben" behalten** — einfacher, aber er simuliert eine Freigabe, die es
so nicht gibt, und lässt den wichtigsten Handgriff aus.
**Die Befugnis im Praxissystem selbst berechnen** (Einlesedatum plus 90 Tage) — das Primärsystem
kennt weder längere bestehende Befugnisse noch Löschungen durch die versicherte Person; es
würde Zugriff behaupten, den die ePA verweigert.
