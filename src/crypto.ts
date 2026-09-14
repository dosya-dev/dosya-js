import { DosyaError } from "./errors.js";

let fallback: Promise<SubtleCrypto> | undefined;

/**
 * WebCrypto's SubtleCrypto. Global on Node >= 19, Deno, Bun, Workers and
 * browsers; Node 18 only exposes it as `require("node:crypto").webcrypto`.
 */
export function getSubtle(): Promise<SubtleCrypto> {
  const subtle = globalThis.crypto?.subtle;
  if (subtle) return Promise.resolve(subtle);

  fallback ??= (async () => {
    // A variable specifier keeps browser bundlers from trying to resolve it.
    const specifier = "node:crypto";
    try {
      const mod = (await import(/* @vite-ignore */ /* webpackIgnore: true */ specifier)) as {
        webcrypto?: { subtle?: SubtleCrypto };
      };
      if (mod.webcrypto?.subtle) return mod.webcrypto.subtle;
    } catch {
      // Not Node, or no node:crypto; fall through.
    }
    fallback = undefined;
    throw new DosyaError("WebCrypto (crypto.subtle) is not available in this runtime");
  })();
  return fallback;
}
