/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Backend origin, inlined at build time. Unset means same-origin (local dev). */
  readonly VITE_API_BASE_URL?: string;
  /** Commit SHA embedded in the frontend bundle during deployment. */
  readonly VITE_BUILD_COMMIT?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
