// Where pdf.js finds the support files copied into public/ by scripts/copy-pdf-worker.mjs. Without
// them, scanned pages (JPEG 2000 / JBIG2 images) and PDFs relying on non-embedded fonts render blank.
export const pdfAssetOptions = {
  cMapUrl: "/pdfjs/cmaps/",
  cMapPacked: true,
  standardFontDataUrl: "/pdfjs/standard_fonts/",
  wasmUrl: "/pdfjs/wasm/",
  iccUrl: "/pdfjs/iccs/"
};
