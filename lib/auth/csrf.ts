import { forbidden } from "./deny";
import { parseCookie, SESSION_COOKIE } from "./session";

const MUTATING = new Set(["POST", "PUT", "DELETE", "PATCH"]);

/**
 * Cookie CSRF, not Cab. Cab OkHttp POSTs the JWE on `Authorization` and
 * sends neither a session cookie nor `Sec-Fetch-Site`. A stolen cookie
 * used from another site is `cross-site` and has a foreign `Origin`.
 *
 * Only `/api/*` mutating methods. Vinext RSC POSTs to the page stay out.
 */
export function csrfOk(req: Request): boolean {
  const method = req.method.toUpperCase();
  if (!MUTATING.has(method)) {
    return true;
  }
  const path = new URL(req.url).pathname;
  if (!path.startsWith("/api/")) {
    return true;
  }
  if (!hasSessionCookie(req)) {
    return true;
  }
  return sameOriginMutating(req);
}

export function csrfDenied(): Response {
  return forbidden();
}

function hasSessionCookie(req: Request): boolean {
  return parseCookie(req.headers.get("Cookie"), SESSION_COOKIE) !== undefined;
}

function sameOriginMutating(req: Request): boolean {
  const site = req.headers.get("Sec-Fetch-Site")?.trim().toLowerCase();
  if (site === "same-origin" || site === "none") {
    return true;
  }
  const origin = req.headers.get("Origin");
  if (origin && origin === new URL(req.url).origin) {
    return true;
  }
  return false;
}
