/**
 * pdf-parse / pdfjs-dist expect browser canvas APIs. Polyfill before importing pdf-parse on Node/Vercel.
 */
export function ensurePdfServerPolyfills(): void {
  if (typeof globalThis.DOMMatrix !== "undefined") return

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const canvas = require("@napi-rs/canvas") as {
      DOMMatrix: typeof globalThis.DOMMatrix
      ImageData: typeof globalThis.ImageData
      Path2D: typeof globalThis.Path2D
    }

    globalThis.DOMMatrix = canvas.DOMMatrix as typeof globalThis.DOMMatrix
    globalThis.ImageData = canvas.ImageData as typeof globalThis.ImageData
    globalThis.Path2D = canvas.Path2D as typeof globalThis.Path2D
  } catch (err) {
    console.warn("[pdf] @napi-rs/canvas unavailable — PDF rendering may fail:", err)
  }
}

ensurePdfServerPolyfills()
