import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const SIMULATOR = 'http://localhost:8787';

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
    },
  },
  build: {
    outDir: 'dist',
    // Die gehostete Demo ist öffentlich, das Repository privat: dort keine Quelltext-Karten.
    sourcemap: process.env['VITE_SIMULATOR'] !== 'browser',
    // Bibliotheken und Kern getrennt vom Anwendungscode: kleinere Pakete, besseres Caching.
    rollupOptions: {
      output: {
        manualChunks: (id) =>
          id.includes('node_modules') ? 'bibliotheken' : id.includes('/kern/') ? 'kern' : undefined,
      },
    },
  },
});
