/**
 * iOS Home Screen web apps hand Google's redirect to both the in-app browser
 * and the web app, so `/api/auth/callback/google` can land twice. The second
 * copy arrives without the state cookie or with a spent code. A 401 there
 * strands the phone on a JSON page even though the first copy signed it in,
 * so the callback bounces humans back to the door instead. Import-free: the
 * shell reads the flag too.
 */

export const AUTH_RETRY_QUERY = "auth";
export const AUTH_RETRY_VALUE = "retry";
export const AUTH_RETRY_LOCATION = `/?${AUTH_RETRY_QUERY}=${AUTH_RETRY_VALUE}`;

export function authRetryFromQuery(q: { get(name: string): string | null }): boolean {
  return q.get(AUTH_RETRY_QUERY) === AUTH_RETRY_VALUE;
}
