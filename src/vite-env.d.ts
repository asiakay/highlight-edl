/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** OAuth client ID (Web application) for Google Drive. */
  readonly VITE_GOOGLE_CLIENT_ID?: string;
  /** Browser API key, restricted to this site and the Google Picker API. */
  readonly VITE_GOOGLE_API_KEY?: string;
  /** Google Cloud project number; lets drive.file cover files chosen in the Picker. */
  readonly VITE_GOOGLE_APP_ID?: string;
}
