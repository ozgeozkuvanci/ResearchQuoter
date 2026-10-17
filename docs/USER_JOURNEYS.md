# User Journeys

## Journey 1: First project and source

**Goal:** create a research project and establish a trustworthy source.

1. The user signs in and creates an `AcademicProject`.
2. The application creates its `MainDocument` and local working replica.
3. The user uploads a PDF or imports a Zotero item with its attachment.
4. The client computes a SHA-256 checksum before upload.
5. The system creates `SourceDocument`, immutable `PdfAsset`, and a draft `Reference` candidate.
6. Extracted metadata is shown for confirmation rather than silently accepted.
7. The source becomes available in the project library and is queued for explicit cloud sync.

**Failure/recovery:** duplicate checksum offers linking to the existing asset; interrupted upload resumes or restarts without creating a false completed asset.

## Journey 2: Select, explain, and preserve evidence

**Goal:** capture text with its exact origin.

1. The user opens a PDF and selects one or more text ranges on a page.
2. The viewer records normalized page-space rectangles, text offsets where available, selected text, surrounding text fingerprints, page index, and printed page label.
3. The user chooses a highlight color and adds a research note explaining relevance.
4. The application stores an `Annotation`, one or more `AnnotationAnchor` records, and an optional `ResearchNote`.
5. The annotation appears in both the PDF and source evidence list.

**Success:** reopening the annotation scrolls to the page and displays the correct region even after a viewport-size change.

## Journey 3: Copy evidence into the academic document

**Goal:** make provenance automatic during normal copy-to-writing behavior.

1. The user invokes **Copy to document** or copies a selection in the PDF workspace and pastes into the in-app editor.
2. The clipboard payload includes an internal provenance MIME payload plus plain text fallback.
3. The editor creates a `quotation` or `paragraph` block and a `CitationUsage` linked to the source reference.
4. A `ProvenanceLink` connects the target `DocumentBlock` to the originating annotation and anchor.
5. The editor renders the citation using the active style.
6. Clicking the source indicator opens the PDF at the saved location and highlights the anchor.

**Guardrail:** plain text pasted from outside the application is never falsely marked as source-linked evidence.

## Journey 4: Work offline and synchronize deliberately

**Goal:** continue research without continuous connectivity.

1. Before leaving, the user marks a project/PDFs as available offline and runs **Sync now**.
2. Project entities, editor snapshots, and selected assets are cached in IndexedDB/Cache Storage.
3. Offline edits receive client-generated UUIDs and append to a local operation/outbox log.
4. Autosave confirms local durability only; the UI states “Saved on this device.”
5. The user later selects **Sync now**.
6. The server compares the base project revision. Non-conflicting changes upload; conflicts pause finalization and show both versions.
7. After success, the UI states the server revision and sync timestamp.

**Guardrail:** closing the application with unsynchronized work shows persistent status on the next open; it does not claim cloud backup.

## Journey 5: OCR a scanned source

1. The viewer detects a missing/insufficient PDF text layer.
2. The user selects OCR language: Spanish, Latin, Italian, or English.
3. The OCR job derives page text and word/line geometry without modifying the PDF.
4. OCR output records engine, model/version, language, confidence, and PDF checksum.
5. The user selects OCR text and follows the normal annotation workflow.

**Fallback:** low-confidence output is visibly marked and remains editable/confirmable.

## Journey 6: Translate evidence locally

1. The user opens an annotation and selects a supported language pair.
2. The application selects a configured local `TranslationProvider` and displays model availability.
3. The translation is generated and stored as a new immutable output revision.
4. User edits create another revision while preserving raw provider output.
5. Either original or translated text may be inserted into the document; both point to the same source annotation.

## Journey 7: Insert a sourced figure

1. The user draws a rectangular region on a PDF page.
2. The application records the anchor before rendering a derived image.
3. The user adds a caption and optional source figure number.
4. The `Figure`, `FigureSource`, derived asset, and reference link are saved.
5. Insertion creates a figure block plus style-aware source attribution.
6. Clicking the figure source returns to the source region.

## Journey 8: Footnotes and citation styles

1. The user adds an author footnote or inserts a citation that a notes style renders as a citation note.
2. Notes have distinct semantic types but share a configurable chapter/section numbering stream.
3. The user changes APA 7 to Chicago notes and bibliography.
4. The citation processor regenerates renderings and bibliography; reference records and provenance do not change.

## Journey 9: Version recovery and backup

1. Local autosave stores current editor state frequently.
2. Explicit sync, export, restore, and significant checkpoints create `DocumentVersion` records.
3. The user previews an older version and chooses **Restore as new version**.
4. The system never deletes the version being replaced.
5. A workspace backup exports a manifest, structured records, assets, checksums, and schema version.

## Responsive behavior

- **Desktop:** simultaneous source viewer, evidence panel, and editor; full import/export administration.
- **iPad:** two-pane viewer/editor where space permits; otherwise fast pane switching; full research workflow without Pencil assumptions.
- **Phone:** single-pane navigation, citation/source inspection, and emergency text edits. Region cropping and bulk imports may be read-only or deferred.

