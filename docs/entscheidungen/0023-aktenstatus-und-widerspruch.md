# 0023 — Zustand der Akte vor dem Inhalt: Information Service und Widerspruch

**Datum:** 29.09.2026 · **Status:** angenommen für die Demo · **baut auf:** 0014, 0017

## Zusammenhang

Der Patientenkopf zeigte bisher nur die eigene Befugnis: „ePA-Befugnis bis …" oder „keine
ePA-Befugnis". Damit sah eine Person ohne Akte aus wie eine Person, deren Karte noch nicht
eingelesen ist, und ein Widerspruch gegen den Medikationsprozess fiel erst auf, wenn das
Medikationsmodul einen Fehler meldete. Praxissysteme zeigen den Zugang heute in mehreren
Zuständen, meist als Symbol im Patientenkopf.

Das Release 3.1.3 bietet dafür den Information Service (`I_Information_Service` 1.5.1): Er
beantwortet ohne Anmeldung und ohne Befugnis, ob eine Akte besteht und nutzbar ist
(`getRecordStatus`), und welche Widersprüche gegen Versorgungsprozesse bestehen
(`getConsentDecisionInformation`: `medication`, `erp-submission`).

## Entscheidung

1. Beim Öffnen einer Kartei fragt das PVS den Information Service. Daraus und aus der eigenen
   Befugnis ergibt sich **genau ein** Zugangszustand im Kopf:

   | Antwort              | Anzeige                    | Folge                                        |
   | -------------------- | -------------------------- | -------------------------------------------- |
   | 404 `noHealthRecord` | keine ePA                  | „ePA öffnen" gesperrt, keine Patient Summary |
   | 409 `statusMismatch` | ePA vorübergehend gesperrt | Fachdienste antworten ebenfalls 409          |
   | keine Antwort        | ePA nicht erreichbar       | —                                            |
   | 204, keine Befugnis  | keine ePA-Befugnis         | „eGK einlesen"                               |
   | 204, Befugnis        | ePA-Befugnis bis …         | —                                            |

2. Ein Widerspruch gegen den Medikationsprozess steht als eigener Marker daneben. Der
   Medication Service antwortet dann mit **423 `locked`** (IG 1.3.5, Statuscodes); die Patient
   Summary zeigt die Medikation als zurückgehalten (`emptyReason` `withheld`).
3. Jede Ansicht, die aus der ePA liest, zeigt **„Stand hh:mm:ss"** und **„↻ aktualisieren"** —
   im ePA-Fenster für den gewählten Reiter, in Dokumenten und Listen im Band darüber.
4. Die Karteikarte kennzeichnet jeden Eintrag mit Bezug zur ePA: **↓ aus der ePA**
   (übernommen) oder **↑ in der ePA** (eingestellt, in einer Liste geführt, über den
   E-Rezept-Fachdienst in die Medikationsliste). Ein Filter wählt danach aus.

## Begründung

▸ Zustand vor Inhalt: Wer weiß, dass es keine Akte gibt, sucht nicht nach Dokumenten; wer den
Widerspruch sieht, deutet eine leere Medikationsliste nicht als „keine Medikation". Der
Information Service ist genau dafür gemacht — leichtgewichtig und vor jeder Anmeldung.

▸ „Stand" macht sichtbar, dass die ePA eine Fernsicht ist. Ohne Uhrzeit hält man eine vor zehn
Minuten geladene Liste für aktuell.

▸ Die Pfeile beantworten in der Karteikarte die Frage „Was davon kennt die ePA?" ohne einen
zweiten Blick in die Akte.

## Verworfen

**Zustand aus Fehlern der Fachdienste ableiten** — erst nach einem fehlgeschlagenen Zugriff
bekannt und uneindeutig (403 kann Befugnis oder Widerspruch heißen).
**Mehrere Symbole für einen Zugang** — der Kopf soll einen Zustand zeigen, nicht einen
Zustandsautomaten.

## Offen

Anbieterwechsel als eigener Zustand (die Demo bildet ihn als `SUSPENDED` ab); Widerspruch gegen
einzelne Dokumente oder Dokumentarten in der Praxis dokumentieren und beim Einstellen
beachten; Kennzeichen „in der ePA nicht mehr vorhanden" für übernommene Dokumente.
