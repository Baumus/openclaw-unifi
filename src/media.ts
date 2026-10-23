import { readMediaBuffer, saveMediaBuffer } from "openclaw/plugin-sdk/media-store";
import { detectMime } from "openclaw/plugin-sdk/media-mime";
import { fail, UniFiError } from "./errors.js";
import type { MediaInput } from "./types.js";

export const MAX_MEDIA_BYTES = 5 * 1024 * 1024;
export const uploadMimes = ["image/gif","image/jpeg","image/png","audio/mpeg","audio/mp4","audio/wave","audio/x-caf"] as const;
const extensions: Record<string,string> = { "image/gif":"gif","image/jpeg":"jpg","image/png":"png","audio/mpeg":"mp3","audio/mp4":"m4a","audio/wave":"wav","audio/x-caf":"caf" };
export type MediaIO = {
  read: typeof readMediaBuffer;
  save: typeof saveMediaBuffer;
  detect: typeof detectMime;
};
export const hostMediaIO: MediaIO = {read:readMediaBuffer,save:saveMediaBuffer,detect:detectMime};
// IDs are issued by the host store. The only two namespaces are fixed, never paths.
// Original-filename host IDs end in ---UUID.ext; anonymous IDs are UUID.ext.
const refPattern = /^(inbound|unifi):((?:[A-Za-z0-9._-]{1,160}---)?[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[a-z0-9]{1,8})$/i;
export function validateMediaInput(input: unknown): asserts input is MediaInput {
  if (!input || typeof input !== "object" || Array.isArray(input) || Object.keys(input).some(k => !["ref","mime"].includes(k))) fail("invalid_media_input");
  const media = input as MediaInput;
  if (typeof media.ref !== "string" || !refPattern.test(media.ref) || !uploadMimes.includes(media.mime as any)) fail("invalid_media_input");
}
function normalizeMime(mime?: string) {
  return ({ "audio/wav":"audio/wave", "audio/x-wav":"audio/wave", "audio/vnd.wave":"audio/wave", "audio/x-m4a":"audio/mp4" } as Record<string,string>)[mime ?? ""] ?? mime;
}
export async function validateMediaBytes(buffer: Buffer, mime: string, io: MediaIO) {
  if (!buffer.length || buffer.length > MAX_MEDIA_BYTES) fail("invalid_media_size");
  // No filename/header hint: untrusted declarations cannot override sniffed bytes.
  const detected = normalizeMime(await io.detect({buffer}));
  if (detected !== mime) fail("media_mime_mismatch");
}
/** No URLs or file reads: SDK opens a bounded, pinned media-store ID only. */
export async function multipartFromMedia(input: MediaInput, io = hostMediaIO, assertCurrent: () => void = () => {}, callerSignal?: AbortSignal) {
  validateMediaInput(input);
  const timeout = AbortSignal.timeout(30_000);
  const signal = callerSignal ? AbortSignal.any([callerSignal,timeout]) : timeout;
  const check = () => { if(signal.aborted) throw new UniFiError(callerSignal?.aborted ? "cancelled" : "timeout"); assertCurrent(); };
  const wait = <T>(promise: Promise<T>): Promise<T> => new Promise((resolve,reject) => {
    const abort = () => { cleanup(); reject(new UniFiError(callerSignal?.aborted ? "cancelled" : "timeout")); };
    const cleanup = () => signal.removeEventListener("abort",abort);
    signal.addEventListener("abort",abort,{once:true});
    if(signal.aborted){abort();return;}
    promise.then(value=>{cleanup();resolve(value);},error=>{cleanup();reject(error);});
  });
  check();
  const [,scope,id] = refPattern.exec(input.ref)!;
  let stored;
  try { stored = await wait(io.read(id!, scope === "inbound" ? "inbound" : "unifi", MAX_MEDIA_BYTES)); }
  catch { check(); fail("media_unavailable"); }
  check();
  await wait(validateMediaBytes(stored.buffer, input.mime, io));
  check();
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(stored.buffer)], {type:input.mime}), "asset." + extensions[input.mime]);
  return form;
}
export async function storeImage(buffer: Buffer, mime: string, io = hostMediaIO, assertCurrent: () => void = () => {}) {
  if (!["image/jpeg","image/png"].includes(mime)) fail("unsupported_media_response");
  await validateMediaBytes(buffer,mime,io);
  assertCurrent();
  // Host creates a private directory and atomically publishes under a random ID.
  const saved = await io.save(buffer,mime,"unifi",MAX_MEDIA_BYTES,undefined,undefined,{assertCommitAllowed:assertCurrent});
  assertCurrent();
  if (!refPattern.test("unifi:" + saved.id)) fail("invalid_host_media_id");
  return {ref:"unifi:"+saved.id,mime,size:buffer.length};
}
