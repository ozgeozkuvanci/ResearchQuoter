# Acceptance Criteria

IDs are stable and should be referenced by tests, issues, and phase completion reports.

## Project and source

- **AC-001:** An authenticated user can create a project; exactly one main document and bibliography configuration are created atomically.
- **AC-002:** Uploading a valid PDF stores immutable bytes, SHA-256, verified size/type, and a private asset record.
- **AC-003:** Re-uploading identical bytes does not create an unnecessary duplicate object.
- **AC-004:** Replacing a source PDF creates a new version and does not retarget existing annotations.
- **AC-005:** A reference candidate extracted/imported from a PDF is editable and requires confirmation before authoritative citation use.

## PDF annotations and provenance

- **AC-010:** Text selection records exact text, physical page index, optional page label, PDF checksum, and normalized rectangles.
- **AC-011:** Multi-line and multi-page selections preserve ordered rectangles/anchors.
- **AC-012:** The user can apply distinguishable highlight colors and create a sticky note without modifying the PDF.
- **AC-013:** A research note can record why evidence was selected and remains linked to the annotation.
- **AC-014:** Explicit insert/copy from the PDF creates a target block, citation usage, and provenance link in one atomic operation.
- **AC-015:** An active source-derived block cannot exist without a valid source reference, PDF checksum, annotation/figure source, and target link.
- **AC-016:** Clicking a source indicator opens the exact PDF checksum/page and focuses the saved region.
- **AC-017:** Zoom, viewport, and supported-device changes do not alter anchor meaning.
- **AC-018:** Editing inserted text retains provenance and marks substantive changes as `target_modified`/paraphrase rather than exact quotation.
- **AC-019:** A checksum mismatch or unresolvable anchor is reported; the system never silently links another passage.

## Structured document

- **AC-020:** Main-document content is stored as schema-versioned structured JSON with stable block IDs, not DOCX.
- **AC-021:** Chapters, nested sections, paragraphs, quotations, research-note blocks, citations, notes, figures, cross-references, and bibliography placeholders survive serialization.
- **AC-022:** Autosave acknowledges only after a durable local IndexedDB transaction.
- **AC-023:** Unknown editor schema/node versions are migrated or block editing; content is never silently dropped.

## Citations and bibliography

- **AC-030:** Canonical references are structured CSL-compatible records; rendered strings are disposable.
- **AC-031:** APA 6, APA 7, Chicago author-date, and Chicago notes/bibliography render representative approved fixtures.
- **AC-032:** Switching style regenerates citations, notes, figure attribution, and bibliography without changing canonical reference/provenance hashes.
- **AC-033:** Bibliography defaults to currently cited references and can optionally include selected uncited references.
- **AC-034:** Author footnotes and citation notes can be added/removed and numbered by configured chapter or section scope.

## Offline and synchronization

- **AC-040:** A project marked offline is usable for cached PDF reading, annotation, research notes, and document editing without network.
- **AC-041:** Local save and cloud sync states are visually distinct.
- **AC-042:** Cloud content upload occurs only after user-initiated sync, except a non-mutating revision check.
- **AC-043:** Sync operations are idempotent and retries do not duplicate records or assets.
- **AC-044:** A stale device cannot silently overwrite a newer main document; a conflict copy/resolution is created.
- **AC-045:** After successful sync, a clean second device can open the same project and navigate document evidence to its source.
- **AC-046:** Quota/session/network failures preserve local changes and show actionable status.

## Import, OCR, and translation

- **AC-050:** A representative Zotero export imports structured references and linked PDFs and supports repeat import without uncontrolled duplication.
- **AC-051:** BibTeX, RIS, CSL-JSON, DOI, and manual reference paths normalize into candidate records while preserving raw input.
- **AC-052:** OCR produces selectable text/geometry for supported Spanish, Latin, Italian, and English fixtures without changing original PDFs.
- **AC-053:** Low-confidence OCR is visible and remains tied to engine/model/version.
- **AC-054:** Translation stores original/output/edits, languages, source anchor, provider/model/version, execution location, and timestamps.
- **AC-055:** Translation adapters can be replaced without changing domain records; unsupported local capabilities return explicit states.
- **AC-056:** No source/translated text is written to diagnostic logs.

## Figures

- **AC-060:** A PDF region can become an immutable derived figure while retaining checksum/page/rectangle/reference.
- **AC-061:** Inserted figures render captions and style-aware source attribution.
- **AC-062:** Clicking a figure source returns to the original PDF region.
- **AC-063:** Style switching does not destroy figure source metadata.

## Versions, exports, and backup

- **AC-070:** Sync, export, restore, and manual checkpoint create immutable document versions pinned to schema/content checksum.
- **AC-071:** Restoring an older version creates a new version and retains intervening history.
- **AC-072:** DOCX and LaTeX exports are generated from an exact version and contain headings, quotations, citations/notes, figures, and bibliography.
- **AC-073:** Exported documents are not imported as current source-of-truth implicitly.
- **AC-074:** Workspace backup contains a schema-versioned manifest, structured data, required assets, and checksums.
- **AC-075:** Backup restore round-trip preserves record counts, asset checksums, document content, citations, and every provenance edge.

## Security, accessibility, and performance

- **AC-080:** Cross-workspace requests and asset URLs are rejected server-side.
- **AC-081:** PDFs/imports/rich text are handled as untrusted content; executable PDF content and unsafe markup are not run.
- **AC-082:** Private object URLs are short-lived and never persisted in editor/source data.
- **AC-083:** Core workflows are keyboard accessible, touch targets are appropriate for iPad, and highlights have non-color identifiers.
- **AC-084:** A 100-PDF/5,000-annotation project meets documented performance targets or measured exceptions approved before release.
- **AC-085:** Desktop and iPad P0 E2E suites pass; phone can open and edit text in the main document.

## Critical release blockers

Any failure of AC-014–019, AC-023, AC-032, AC-043–046, AC-070–075, or AC-080 is release-blocking. No waiver may convert silent data loss, false attribution, or cross-workspace exposure into a known limitation.

