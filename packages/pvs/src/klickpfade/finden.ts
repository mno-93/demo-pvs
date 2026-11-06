import { computeAccessibleName, getRole } from 'dom-accessibility-api';
import type { Handlung, Schritt, Ziel } from './szenario.js';

/**
 * Elemente über Rolle und zugänglichen Namen finden — mit derselben Bibliothek, die die
 * Testing Library dafür nutzt (`dom-accessibility-api`). Der Rundgang und die Tests eines
 * Klickpfads sehen damit dieselben Elemente.
 */

/** Markiert die eigene Oberfläche des Rundgangs; sie wird nie als Ziel gefunden. */
export const KLICKPFAD_ATTRIBUT = 'data-klickpfad';

/** Vorauswahl je Rolle, damit nicht jedes Element der Seite benannt werden muss. */
const KANDIDATEN: Record<string, string> = {
  button: 'button, [role="button"], input[type="button"], input[type="submit"]',
  link: 'a[href], [role="link"]',
  combobox: 'select, input, [role="combobox"]',
  textbox: 'input, textarea, [role="textbox"]',
  checkbox: 'input[type="checkbox"], [role="checkbox"]',
  radio: 'input[type="radio"], [role="radio"]',
  option: 'option, [role="option"]',
  region: 'section, [role="region"]',
  dialog: 'dialog, [role="dialog"]',
  group: 'fieldset, [role="group"]',
  listitem: 'li, [role="listitem"]',
  heading: 'h1, h2, h3, h4, h5, h6, [role="heading"]',
  tab: '[role="tab"]',
  navigation: 'nav, [role="navigation"]',
};

export function normalisiert(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function namePasst(name: string, soll: string | RegExp): boolean {
  return typeof soll === 'string' ? name === soll : soll.test(name);
}

function verborgen(e: Element): boolean {
  if (e.closest('[hidden], [aria-hidden="true"], [inert]')) return true;
  for (let x: Element | null = e; x; x = x.parentElement) {
    if (getComputedStyle(x).display === 'none') return true;
  }
  return false;
}

/** Alle passenden, sichtbaren Elemente — außerhalb der Oberfläche des Rundgangs. */
export function alleFinden(ziel: Ziel, wurzel: ParentNode = document): HTMLElement[] {
  const bereiche: ParentNode[] = ziel.in ? alleFinden(ziel.in, wurzel) : [wurzel];
  const auswahl = KANDIDATEN[ziel.rolle] ?? `[role="${ziel.rolle}"]`;
  const treffer = new Set<HTMLElement>();
  for (const bereich of bereiche) {
    for (const e of bereich.querySelectorAll<HTMLElement>(auswahl)) {
      if (e.closest(`[${KLICKPFAD_ATTRIBUT}]`)) continue;
      if (getRole(e) !== ziel.rolle) continue;
      if (!namePasst(normalisiert(computeAccessibleName(e)), ziel.name)) continue;
      if (verborgen(e)) continue;
      treffer.add(e);
    }
  }
  return [...treffer];
}

/** Namen aller sichtbaren Elemente einer Rolle — für Fehlermeldungen beim Schreiben eines Pfads. */
export function vorhandeneNamen(rolle: string): string[] {
  const auswahl = KANDIDATEN[rolle] ?? `[role="${rolle}"]`;
  return [...document.querySelectorAll<HTMLElement>(auswahl)]
    .filter((e) => getRole(e) === rolle && !verborgen(e) && !e.closest(`[${KLICKPFAD_ATTRIBUT}]`))
    .map((e) => normalisiert(computeAccessibleName(e)));
}

/** Das eine passende Element, sonst `null` (keins oder mehrdeutig). */
export function finden(ziel: Ziel): HTMLElement | null {
  const treffer = alleFinden(ziel);
  return treffer.length === 1 ? treffer[0]! : null;
}

const ROLLE_BEZEICHNUNG: Record<string, string> = {
  button: 'Knopf',
  link: 'Verweis',
  combobox: 'Feld',
  textbox: 'Feld',
  checkbox: 'Kästchen',
  option: 'Treffer',
  region: 'Bereich',
  dialog: 'Fenster',
  group: 'Gruppe',
};

/** Lesbare Beschreibung eines Ziels — für Protokoll und Fehlermeldungen. */
export function zielBeschreibung(ziel: Ziel): string {
  const name = typeof ziel.name === 'string' ? ziel.name : ziel.name.source;
  const selbst = `${ROLLE_BEZEICHNUNG[ziel.rolle] ?? ziel.rolle} „${name}“`;
  return ziel.in ? `${selbst} in ${zielBeschreibung(ziel.in)}` : selbst;
}

/** Rolle und Name des nächsten benannten Bedienelements um einen Klick — für das Protokoll. */
export function geklicktBeschreibung(e: Element | null): string {
  for (let x = e; x && x !== document.body; x = x.parentElement) {
    const rolle = getRole(x);
    if (
      rolle &&
      ['button', 'link', 'combobox', 'textbox', 'checkbox', 'option', 'tab'].includes(rolle)
    )
      return `${rolle}: ${normalisiert(computeAccessibleName(x)) || '(ohne Namen)'}`;
  }
  return 'Fläche';
}

/** Ist ein Eingabe- oder Auswahlschritt am Element schon erledigt? */
function wertErreicht(e: HTMLElement, h: Handlung): boolean {
  if (h.art === 'klicken') return false;
  const wert = (e as HTMLInputElement | HTMLSelectElement).value ?? '';
  return h.art === 'waehlen' ? wert === h.wert : normalisiert(wert) === normalisiert(h.wert);
}

/**
 * Ist der Schritt am gefundenen Element erfüllt? Prüfpunkte und Eingaben ja/nein; ein Klick
 * gilt erst durch den Klick selbst.
 */
export function erfuellt(schritt: Schritt, e: HTMLElement): boolean {
  if (schritt.handlung) return wertErreicht(e, schritt.handlung);
  const p = schritt.pruefen ?? {};
  if (p.text !== undefined && !normalisiert(e.textContent ?? '').includes(p.text)) return false;
  if (p.angehakt !== undefined && (e as HTMLInputElement).checked !== p.angehakt) return false;
  return true;
}

/** Sichtbarer Ausschnitt eines Elements auf dem Bildschirm. */
export interface Rahmen {
  top: number;
  left: number;
  bottom: number;
  right: number;
  width: number;
  height: number;
}

function rahmenAus(top: number, left: number, bottom: number, right: number): Rahmen {
  return { top, left, bottom, right, width: right - left, height: bottom - top };
}

/**
 * Was der Rundgang hervorhebt: das Element samt seiner Beschriftung (ein Kästchen allein ist zu
 * klein), beschnitten auf scrollende Vorfahren und das Fenster — sonst ragte die Hervorhebung
 * über Reiter und Köpfe. `null`, wenn nichts davon zu sehen ist.
 */
export function markierungsRahmen(e: HTMLElement): Rahmen | null {
  const teile = [e, ...((e as HTMLInputElement).labels ?? [])].map((x) =>
    x.getBoundingClientRect(),
  );
  let top = Math.min(...teile.map((r) => r.top));
  let left = Math.min(...teile.map((r) => r.left));
  let bottom = Math.max(...teile.map((r) => r.bottom));
  let right = Math.max(...teile.map((r) => r.right));
  for (let x = e.parentElement; x && x !== document.body; x = x.parentElement) {
    const stil = getComputedStyle(x);
    if (stil.overflowX === 'visible' && stil.overflowY === 'visible') continue;
    const r = x.getBoundingClientRect();
    top = Math.max(top, r.top);
    left = Math.max(left, r.left);
    bottom = Math.min(bottom, r.bottom);
    right = Math.min(right, r.right);
  }
  top = Math.max(top, 0);
  left = Math.max(left, 0);
  bottom = Math.min(bottom, window.innerHeight);
  right = Math.min(right, window.innerWidth);
  return bottom > top && right > left ? rahmenAus(top, left, bottom, right) : null;
}
