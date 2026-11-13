/** Öffentliches Repository der Demo — Spezifikation, Entscheidungen, Anleitung. */
export const REPOSITORY = 'https://github.com/mno-93/demo-pvs';

/** Dokumentation der Demo im Repository. */
export const DOKUMENTATION = `${REPOSITORY}/tree/main/docs`;

/** Adresse einer Datei im Repository, etwa `docs/SPEZIFIKATION.md#44-klickpfade`. */
export function imRepository(pfad: string): string {
  return `${REPOSITORY}/blob/main/${pfad}`;
}
