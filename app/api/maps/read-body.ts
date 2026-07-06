/** Read a request body into a string, aborting as soon as it exceeds `max`.
 *
 *  App Router route handlers impose no body-size limit of their own, so
 *  `await request.text()` would buffer an arbitrarily large payload into
 *  memory before any check could run — a trivial DoS for an authenticated
 *  caller. This reads the stream chunk-by-chunk and bails the moment the
 *  decoded length crosses the cap (and fast-rejects a client that declares
 *  an oversized Content-Length up front). Returns null when too large. */
export async function readCappedText(
  request: Request,
  max: number,
): Promise<string | null> {
  const declared = request.headers.get("content-length");
  if (declared != null && Number(declared) > max) return null;

  const reader = request.body?.getReader();
  if (!reader) {
    const text = await request.text();
    return text.length > max ? null : text;
  }

  const decoder = new TextDecoder();
  let text = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    text += decoder.decode(value, { stream: true });
    if (text.length > max) {
      await reader.cancel();
      return null;
    }
  }
  text += decoder.decode();
  return text;
}
