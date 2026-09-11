import { blobRequestPath, readJpegUpload, type BlobRequestOpts, type UploadResult } from "../avatar/http";
import { BACKDROP_MAX_BYTES, BACKDROP_TOO_LARGE } from "./store";

/** `/api/backdrop?slug=kit&v=<rev>` — relative, for same-origin fetch. */
export function backdropRequestPath(opts: BlobRequestOpts): string {
  return blobRequestPath("/api/backdrop", opts);
}

export async function readBackdropUpload(req: Request): Promise<UploadResult> {
  return readJpegUpload(req, { maxBytes: BACKDROP_MAX_BYTES, tooLarge: BACKDROP_TOO_LARGE });
}
