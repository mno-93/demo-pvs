/**
 * Startet den ePA-Simulator (ADR 0002). Aufbau und Wege in `anwendung.ts`.
 */
import { simulatorBauen } from './anwendung.ts';

const PORT = Number(process.env['EPA_PORT'] ?? 8787);

const app = await simulatorBauen();
await app.listen({ port: PORT, host: '127.0.0.1' });
console.info(`ePA-Simulator auf http://localhost:${PORT} — ePA 3.1.3, fiktiv, ohne TI-Anbindung.`);
