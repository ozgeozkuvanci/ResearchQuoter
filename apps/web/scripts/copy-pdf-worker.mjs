import { cp, copyFile, mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";

// pdf.js renders in a web worker that has to be served as a static file next to the app, and loads
// fonts, character maps, colour profiles and image decoders (scanned pages) from static folders too.
const webRoot = resolve(import.meta.dirname, "..");
const worker = createRequire(import.meta.url).resolve("pdfjs-dist/legacy/build/pdf.worker.min.mjs");
const packageRoot = resolve(dirname(worker), "..", "..");
await mkdir(resolve(webRoot, "public", "pdfjs"), { recursive: true });
await copyFile(worker, resolve(webRoot, "public", "pdf.worker.min.mjs"));
for (const folder of ["cmaps", "standard_fonts", "wasm", "iccs"]) {
  await cp(resolve(packageRoot, folder), resolve(webRoot, "public", "pdfjs", folder), { recursive: true });
}
