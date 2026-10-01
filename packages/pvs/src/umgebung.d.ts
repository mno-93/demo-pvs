/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** `browser`: Simulator im Browser für die gehostete Demo (ADR 0025); sonst eigener Dienst. */
  readonly VITE_SIMULATOR?: 'browser';
}
