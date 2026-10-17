import { copyFile, mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve } from "node:path";

// pdf.js renders in a web worker that has to be served as a static file next to the app.
const webRoot = resolve(import.meta.dirname, "..");
const worker = createRequire(import.meta.url).resolve("pdfjs-dist/legacy/build/pdf.worker.min.mjs");
await mkdir(resolve(webRoot, "public"), { recursive: true });
await copyFile(worker, resolve(webRoot, "public", "pdf.worker.min.mjs"));
