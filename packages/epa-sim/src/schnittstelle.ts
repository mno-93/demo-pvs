/**
 * Die Schnittstelle, an der die Wege des Simulators hängen (ADR 0050).
 *
 * Lokal erfüllt sie Fastify über eine dünne Hülle (`anwendung.ts`), in der gehosteten Demo der
 * Browser-Adapter (`browser.ts`). Die Wege kennen nur diese Schnittstelle, nicht Fastify: Benutzt
 * ein Weg etwas, das hier fehlt, meldet das die Typprüfung — der Browser-Adapter kann so nicht
 * still hinter dem Server zurückbleiben. Früher hingen die Wege an den Fastify-Typen, und der
 * Adapter wurde mit `as unknown as FastifyInstance` übergeben; so fiel nicht auf, dass ihm
 * `type()` fehlte.
 */

export type Kopfwert = string | string[] | undefined;

export interface SimAnfrage {
  readonly method: string;
  /** Pfad mit Suchteil, wie angefragt. */
  readonly url: string;
  /** Kopfzeilen mit kleingeschriebenen Namen. */
  readonly headers: Record<string, Kopfwert>;
  readonly params: unknown;
  readonly query: unknown;
  readonly body: unknown;
}

export interface SimAntwort {
  readonly sent: boolean;
  readonly statusCode: number;
  code(status: number): SimAntwort;
  header(name: string, wert: string | number): SimAntwort;
  getHeader(name: string): string | number | string[] | undefined;
  /** Setzt den Inhaltstyp der Antwort. */
  type(inhaltstyp: string): SimAntwort;
  send(koerper?: unknown): SimAntwort;
}

/** Gibt die Antwort zurück, wenn er selbst gesendet hat, sonst den Körper. */
export type SimHandler = (anfrage: SimAnfrage, antwort: SimAntwort) => unknown;
export type SimSendeHaken = (anfrage: SimAnfrage, antwort: SimAntwort, koerper: unknown) => unknown;

export interface SimAnwendung {
  get(pfad: string, handler: SimHandler): void;
  post(pfad: string, handler: SimHandler): void;
  put(pfad: string, handler: SimHandler): void;
  /** Läuft vor jedem Weg; hat er gesendet, entfällt der Weg. */
  anfrageHaken(haken: SimHandler): void;
  /** Läuft vor dem Senden und darf den Körper ersetzen. */
  sendeHaken(haken: SimSendeHaken): void;
  nichtGefunden(handler: SimHandler): void;
}

/** Größte Anfrage, die der Simulator annimmt: KIM erlaubt 15 MiB, dazu Kopf und Kodierung. */
export const KOERPER_GRENZE = 16 * 1024 * 1024;

/** Fehlerkörper der Basisdienste (OpenAPI ePA: `ErrorType`). */
export function fehlerKoerper(errorCode: string, errorDetail: string) {
  return { errorCode, errorDetail };
}
