/** Same body for unknown user and bad token — no enumeration. */

export const UNAUTHORIZED = "unauthorized";

export function unauthorized(): Response {
  return Response.json({ error: UNAUTHORIZED }, { status: 401 });
}

/** Signed-in but not on this room. Same body as 401 so we do not name the slug. */
export function forbidden(): Response {
  return Response.json({ error: UNAUTHORIZED }, { status: 403 });
}

export function tooLarge(): Response {
  return Response.json({ error: "too large" }, { status: 413 });
}

export function tooMany(): Response {
  return Response.json({ error: "rate" }, { status: 429 });
}

export function badFrame(): Response {
  return Response.json({ error: "bad frame" }, { status: 400 });
}

export function configError(): Response {
  return Response.json({ error: "config" }, { status: 503 });
}
