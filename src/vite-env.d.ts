/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_DISBOX_SERVER_URL?: string;
  readonly VITE_DOWNLOAD_PROXY_URL?: string;
  readonly VITE_DISBOX_EXTENSION_ID?: string;
  readonly VITE_DISBOX_EXTENSION_IDS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
