# PDF Annotation Model

## 1. Source immutability

The PDF viewer never writes annotations into the original PDF. `PdfAsset` is immutable and identified by SHA-256. Highlights, sticky notes, OCR text, page crops, thumbnails, and navigation state are separate records/derived assets.

If the user replaces a PDF, create a new `PdfAsset` and `SourceDocumentVersion`. Existing anchors remain attached to the old checksum until explicitly repaired.

## 2. Supported MVP annotation types

- `text_highlight`: one or more text rectangles with a user-selected accessible color.
- `sticky_note`: a point/region on a page plus note content.
- `region`: rectangular page selection used for a figure or evidence image.

Underline, strikeout, shapes, ink, and Apple Pencil input are out of scope.

## 3. Coordinate system

Persist geometry in normalized unrotated PDF page space:

```text
x = pdfX / mediaBoxWidth
y = pdfY / mediaBoxHeight
width = pdfWidth / mediaBoxWidth
height = pdfHeight / mediaBoxHeight
```

Values are in `[0,1]`, independent of zoom, viewport pixel density, and device size. Store the page media/crop box and rotation observed at capture for diagnostics. The viewer adapter handles PDF.js viewport transforms at render time.

For multi-line/multi-column selections, store an ordered array of rectangles, not one bounding box. Multi-page selection is represented by multiple anchors under one annotation, one per page.

## 4. Hybrid selectors

Text selections store:

- exact selected text and hash;
- normalized rectangles;
- PDF.js text item indexes/character offsets when available;
- prefix and suffix context;
- page text fingerprint;
- zero-based physical `pageIndex` and optional printed `pageLabel`;
- PDF checksum;
- selection extraction version.

Region selections store rectangle, page identity, checksum, crop rendering parameters, and derived asset checksum. Sticky notes store an anchor point or small rectangle plus note content.

The model is compatible in concept with W3C Web Annotation selectors, but internal IDs and PDF-specific selectors are authoritative.

## 5. Text selection and transfer flow

1. PDF.js emits selection ranges and text-layer items.
2. The viewer converts client rectangles to normalized PDF page coordinates.
3. The application builds and validates an anchor preview.
4. The user confirms highlight color/research note, or invokes **Insert into document** directly.
5. `CreateTextAnnotation` persists the source evidence.
6. `TransferEvidenceToDocument` creates the target block, provenance, and citation atomically.

Ctrl/Cmd+C writes provenance-aware internal clipboard data when selection originated in the PDF viewer. Because browser clipboard APIs can be restricted, the explicit **Insert into document** command is always offered and is the acceptance-test path.

## 6. OCR workflow

Required OCR input languages are Spanish, Latin, Italian, and English.

1. Detect pages with no usable text layer or allow user-requested OCR.
2. Queue an OCR job pinned to PDF checksum, page range, engine/model version, and selected language.
3. Produce page text, lines/words, normalized geometry, confidence, and reading order.
4. Store output as `OcrResult`; do not replace the PDF text layer permanently.
5. Overlay a selectable OCR layer in the viewer.
6. Mark low-confidence words/anchors and retain user corrections as separate revisions.

The OCR provider interface supports local server-side engines first. Browser-only OCR is optional after performance validation. Latin accuracy must be measured on representative historical typography; language support labels must reflect tested quality rather than engine claims.

## 7. Figure extraction

- User selects a region; source anchor is saved before crop rendering.
- Rendering uses a declared DPI/scale and color profile; derived PNG/WebP is checksum-addressed.
- `FigureSource` records source reference, PDF checksum, page label/index, region, source figure number, crop parameters, and derivation status.
- Re-cropping creates a new derived asset/source revision; it does not overwrite the original crop.
- Inserted figure blocks reference `Figure.id`, never an expiring object URL.

## 8. Navigation contract

`ResolveSourceLocation(provenanceLinkId)` returns:

```ts
interface ResolvedPdfLocation {
  sourceDocumentId: string;
  pdfAssetId: string;
  checksum: string;
  pageIndex: number;
  pageLabel?: string;
  rects: Array<{ x: number; y: number; width: number; height: number }>;
  resolution: "exact" | "approximate" | "unresolved";
  warning?: string;
}
```

The viewer loads the exact asset, opens the page, scrolls to the union of rectangles, draws a temporary focus overlay, and moves keyboard focus to the source context.

## 9. Performance and cache policy

- Virtualize PDF pages and render only visible/near-visible pages.
- Cache bounded thumbnails and text layers by PDF checksum/page/version.
- Do not download all PDFs automatically on iPad; user explicitly selects offline availability.
- Monitor storage quota and warn before eviction risk.
- Prefer range requests for remote viewing when the object service supports them.

## 10. Tests

- Same anchor at multiple zoom levels, rotations, DPRs, and desktop/iPad viewports.
- Multi-line, multi-column, ligature, hyphenation, RTL/non-ASCII, and multi-page selections.
- Text-based and OCR-backed anchors.
- Replaced PDF checksum does not resolve old anchors against new bytes.
- Clipboard internal payload validation and plain-text fallback.
- Figure crop source-to-output geometry.
- Exact source navigation from current and restored document versions.

