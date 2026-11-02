import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const SIMULATOR = 'http://localhost:8787';

/** React und Router — das einzige, was das Praxissystem aus `node_modules` braucht. */
const REACT_UND_ROUTER =
  /[/\\]node_modules[/\\](react|react-dom|react-router|react-router-dom|scheduler|@remix-run|cookie|set-cookie-parser|turbo-stream)[/\\]/;

export default defineConfig({
  plugins: [react()],
  // Unterpfad der gehosteten Demo, etwa /demo-pvs/ auf GitHub Pages; lokal die Wurzel.
  base: process.env['BASIS'] ?? '/',
  server: {
    port: 5173,
    // Der ePA-Simulator läuft als eigener Dienst. Der Umweg über den Entwicklungsserver
    // erspart CORS-Konfiguration und hält die Adressen im Frontend relativ (siehe ADR 0002).
    // Die Pfade werden unverändert weitergereicht: Sie beginnen wie im Aktensystem mit /epa/
    // (ADR 0013). /verwaltung ist die Demo-Steuerung des Simulators, keine ePA-Schnittstelle.
    proxy: {
      '/epa': { target: SIMULATOR, changeOrigin: true },
      '/verwaltung': { target: SIMULATOR, changeOrigin: true },
      // Information Service des Aktensystems und der Demo-Ersatz des E-Rezept-Fachdienstes.
      '/information': { target: SIMULATOR, changeOrigin: true },
      '/erp': { target: SIMULATOR, changeOrigin: true },
      // Demo-Ersatz des KIM-Clientmoduls (im Wirkbetrieb SMTP, nicht HTTP).
      '/kim': { target: SIMULATOR, changeOrigin: true },
    },
  },
  build: {
    outDir: 'dist',
    // Die gehostete Demo ist öffentlich, das Repository privat: dort keine Quelltext-Karten.
    sourcemap: process.env['VITE_SIMULATOR'] !== 'browser',
    // Bibliotheken und Kern getrennt vom Anwendungscode: kleinere Pakete, besseres Caching. Was nur
    // der Simulator im Browser braucht — die Profilprüfung mit FHIRPath.js und seinen
    // Abhängigkeiten —, bleibt im Paket des Simulators, das erst die gehostete Fassung nachlädt
    // (ADR 0056).
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          if (REACT_UND_ROUTER.test(id)) return 'bibliotheken';
          if (id.includes('/kern/') && !/profilpruefung|profilregeln/.test(id)) return 'kern';
          return undefined;
        },
      },
    },
  },
});
