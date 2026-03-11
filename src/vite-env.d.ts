/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_NODEREAL_KEY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
