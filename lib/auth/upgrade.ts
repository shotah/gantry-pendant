/** Browser Origin must match the request URL origin. Missing Origin (Go crane) is allowed. */
export function upgradeOriginOk(originHeader: string | null, urlOrigin: string): boolean {
  if (originHeader === null) {
    return true;
  }
  return originHeader === urlOrigin;
}

/** Authenticated `/ws/` must not reach avatar / allow / push HTTP via a spoofed op. */
export function stripUpgradeOp(headers: Headers): void {
  headers.delete("X-Pendant-Op");
}
