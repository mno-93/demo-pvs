// Erzeugt aus daten/kataloge/ebm-auszug.json — nicht von Hand ändern.
// Neu erzeugen mit: node werkzeuge/kataloge-erzeugen.mjs
import type { EbmEintrag, Katalogkopf } from './typen.js';

export const ebmKopf: Katalogkopf = {
  "_katalog": "EBM",
  "_art": "Auszug für die Demo, nicht amtlich",
  "_hinweis": "Kleine Auswahl hausärztlicher Gebührenordnungspositionen. Bezeichnungen sinngemäß. Bewertungen (Punkte und Euro) sind bewusst nicht enthalten, weil sie sich quartalsweise ändern und in einer Demo nur falsche Sicherheit erzeugen würden. Nicht für die Abrechnung verwenden."
};

export const ebm: readonly EbmEintrag[] = [
  {
    "ziffer": "03000",
    "bezeichnung": "Versichertenpauschale (hausärztlich)",
    "hinweis": "Grundpauschale je Behandlungsfall"
  },
  {
    "ziffer": "03220",
    "bezeichnung": "Zuschlag für die Behandlung und Betreuung chronisch erkrankter Patient:innen I",
    "hinweis": "setzt Chronikerkriterien voraus"
  },
  {
    "ziffer": "03221",
    "bezeichnung": "Zuschlag für die Behandlung und Betreuung chronisch erkrankter Patient:innen II",
    "hinweis": "zusätzlich zu 03220"
  },
  {
    "ziffer": "03230",
    "bezeichnung": "Problemorientiertes ärztliches Gespräch",
    "hinweis": "je vollendete 10 Minuten"
  },
  {
    "ziffer": "01732",
    "bezeichnung": "Gesundheitsuntersuchung",
    "hinweis": "Check-up, Abstand nach Richtlinie"
  },
  {
    "ziffer": "01410",
    "bezeichnung": "Besuch",
    "hinweis": "Hausbesuch"
  },
  {
    "ziffer": "01411",
    "bezeichnung": "Dringender Besuch",
    "hinweis": "unverzüglich nach Bestellung"
  },
  {
    "ziffer": "01102",
    "bezeichnung": "Inanspruchnahme am Samstag",
    "hinweis": "zwischen 7 und 14 Uhr"
  },
  {
    "ziffer": "02100",
    "bezeichnung": "Infusion",
    "hinweis": "Dauer mindestens 10 Minuten"
  },
  {
    "ziffer": "01430",
    "bezeichnung": "Verwaltungskomplex",
    "hinweis": "ohne persönlichen Arzt-Patienten-Kontakt"
  }
];
