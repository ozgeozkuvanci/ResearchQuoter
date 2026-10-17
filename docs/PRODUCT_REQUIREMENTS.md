# Product Requirements

## 1. Product statement

The product is a provenance-first academic research and writing workspace for one researcher working across desktop, iPad, and, secondarily, phone. It connects evidence captured from immutable source PDFs to a structured academic document while preserving a reversible, machine-readable path to the exact source location.

It is not a general reference-manager clone. The primary workflow is evidence capture, interpretation, reuse in writing, and automatic citation.

## 2. Target user and usage profile

- One authenticated researcher; collaboration and real-time co-editing are out of scope.
- Primary device order: desktop, iPad/tablet, phone.
- Phone supports emergency review and text editing, not feature parity with desktop PDF research.
- Typical project: 30–40 PDFs, usually 20–30 pages each.
- The user deliberately synchronizes local work to cloud storage; continuous connectivity is not required.

## 3. Product principles

1. **Provenance is data, not decoration.** A rendered citation string is never the source relationship.
2. **Source immutability.** Uploaded PDFs are content-addressed and never modified in place.
3. **Local-first work session.** Previously synchronized project data and assets remain usable offline.
4. **Explicit synchronization.** Autosave writes locally; the user initiates cloud synchronization and sees its result.
5. **Structured writing.** The main document is stored as typed editor content, not a mutable DOCX.
6. **Canonical metadata.** References use CSL-compatible structured metadata.
7. **Provider independence.** OCR and translation depend on application ports, not vendor SDK types.
8. **Recoverability.** Versions, backups, sync status, and failures are visible and actionable.

## 4. Functional requirements

### 4.1 Account and workspace

- Authenticate one user securely.
- Create and manage one or more workspaces and academic projects.
- Open the same synchronized project on desktop and iPad.
- Show local changes, last successful sync, pending uploads, and conflicts.
- Permit manual export and import of a complete workspace backup.

### 4.2 Source documents and PDFs

- Upload and organize PDF files.
- Import Zotero-managed references and attached PDFs through a documented import flow.
- Render PDFs with text selection and page navigation.
- Create multi-color text highlights and sticky notes.
- Copy a selected/highlighted passage into the main document while automatically creating provenance and citation linkage.
- Record page labels, page indexes, selected text, and page-space geometry.
- Reopen a source from a main-document block at the exact page and highlighted region.
- Preserve the original PDF checksum and immutable object.
- Detect image-only/scanned pages and optionally run OCR for Spanish, Latin, Italian, and English.

### 4.3 Research notes and classification

- Attach a note explaining why evidence was selected and how it may be used.
- Apply categories and tags to annotations, notes, and figures.
- Keep research notes distinct from author footnotes in the academic document.

### 4.4 Translation

- Support Spanish→English, Spanish→Turkish, English→Turkish, Turkish→English, Latin→English, Latin→Turkish, and Latin→Spanish where model quality permits.
- Prefer a free local model and never require a paid provider for the base workflow.
- Preserve original text, output, user edits, languages, provider/model metadata, timestamps, and provenance.
- Make translation optional; original text always remains available.

### 4.5 Main academic document

- Maintain one primary structured document per academic project.
- Support chapters, nested sections, configurable heading and paragraph categories, paragraphs, quotations, research-note blocks, citations, author footnotes, citation notes, endnotes, figures, captions, cross-references, and bibliography.
- Autosave locally and create durable versions at defined checkpoints.
- Restore an older version without overwriting history.
- Support chapter- or section-scoped note numbering as a document setting.
- Export DOCX and LaTeX in the MVP export phase.

### 4.6 References and citations

- Store reference metadata as normalized CSL-JSON-compatible data.
- Import Zotero data, BibTeX, RIS, CSL-JSON, DOI, and manual records; EndNote XML is post-MVP unless needed by a real import sample.
- Extract candidate metadata from PDFs, but require user confirmation before it becomes authoritative.
- Support APA 6, APA 7, Chicago author-date, and Chicago notes and bibliography.
- Regenerate in-text citations, citation notes, figure source attributions, and bibliography after style changes.
- Default bibliography membership to cited references, with an optional manually included set.

### 4.7 Figures

- Upload images or crop a PDF page region into a derived figure asset.
- Store source page, geometry, reference, caption, tags, and source locator.
- Insert a figure into the main document and render style-aware attribution.
- Do not manage permission clearance in the MVP; retain an optional free-text rights note for future compatibility.

## 5. Non-functional requirements

- **Integrity:** No document transfer operation may create a source-derived block without a valid provenance edge.
- **Offline:** Editing, annotation, search over cached metadata, and access to downloaded PDFs work without network access.
- **Performance targets:** open a cached project in under 2 seconds at p75; render first PDF page in under 2 seconds at p75 on a supported desktop; local autosave acknowledgement under 250 ms at p95.
- **Scale target:** at least 100 PDFs/project and 5,000 annotations/project without architectural redesign.
- **Accessibility:** keyboard navigation, visible focus, semantic controls, contrast-compliant highlight palette, and touch targets appropriate for iPad.
- **Browser support:** current and previous major versions of Chromium, Safari, and Firefox; installed PWA on iPadOS is supported subject to platform storage constraints.
- **Security:** private-by-default projects, encrypted transport, protected object access, least privilege, and no third-party translation disclosure without explicit configuration.
- **Recoverability:** no acknowledged local edit may be discarded silently; restore and backup operations are auditable.

## 6. Success measures

- A user completes the PDF-selection-to-cited-document workflow without manually entering page number or source title.
- Every source-derived document block passes a provenance integrity check.
- A project edited offline can be explicitly synchronized and opened on iPad with the same source links.
- Citation style switching does not change canonical reference data.
- A backup can reconstruct project content, references, provenance, and assets.

## 7. Constraints and assumptions

- A responsive PWA is approved for MVP; no mandatory Pencil, drawing, or background-sync requirement forces native development.
- Cloud deployment is managed for the user; self-hosting is not an MVP goal.
- Explicit sync means server changes are not merged continuously. The application still checks server revision before push to prevent overwrites.
- Local translation on iPad may be limited by memory and browser execution constraints; desktop local inference is the baseline. This remains an open validation item.
- Italian is an OCR input language but not currently a required translation pair.

