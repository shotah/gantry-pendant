import { PENDANT_MANIFEST } from "./lib/pwa";

/** Vinext metadata route → `/manifest.webmanifest` (`application/manifest+json`). */
export default function manifest() {
  return PENDANT_MANIFEST;
}
