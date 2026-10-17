# MVP Scope

## 1. Definition of MVP

The MVP is complete when one researcher can install/use the web application, work through the full provenance vertical slice, explicitly synchronize it to cloud storage, and reopen the synchronized project on a second device.

## 2. Must-have vertical slice

1. Authenticate.
2. Create an academic project and its main document.
3. Upload one text-based PDF.
4. Create or confirm its structured reference.
5. Render the PDF.
6. Select text and save page/anchor/original text.
7. Add a colored highlight and research note.
8. Transfer the passage into a structured document block.
9. Create a `CitationUsage` and render an APA 7 in-text citation.
10. Generate the cited-only bibliography.
11. Click the document block source link and reopen the exact PDF region.
12. Autosave locally, explicitly sync, then reopen on a second device.
13. Verify the workflow end-to-end.

## 3. MVP capabilities by phase

### MVP Core

- Single-user authentication and authorization.
- Project/source/reference management.
- Immutable PDF upload and basic PDF.js viewer.
- Text highlight colors and sticky notes.
- Structured Tiptap/ProseMirror document.
- Provenance-aware transfer and navigation.
- APA 7 plus bibliography for the first slice; all four required styles before MVP release.
- Local IndexedDB replica, outbox, explicit sync, and conflict prevention.
- Local autosave and checkpoint versions.

### MVP Release completion

- Zotero import with attachments through an exported library/package flow; direct Zotero API connection is optional after validation.
- OCR for Spanish, Latin, Italian, and English scanned PDFs.
- Local translation baseline for required pairs where validated models exist.
- PDF region-to-figure extraction and attribution.
- APA 6, APA 7, Chicago author-date, Chicago notes and bibliography.
- Author and citation footnotes with chapter/section numbering.
- DOCX and LaTeX export.
- Workspace backup/export and restore.
- Desktop, iPad, and emergency phone editing validation.

## 4. Explicitly out of scope

- Multi-user collaboration, invitations, comments between users, and real-time co-editing.
- Native iOS, iPadOS, Android, or desktop applications.
- Apple Pencil/freehand ink, pressure input, and drawing tools.
- Automatic copyright clearance or permission workflow.
- Microservices, event streaming infrastructure, or independent service deployment.
- Continuous background cloud synchronization as a correctness dependency.
- Pixel-identical journal or university templates.
- Automated scholarly correctness guarantees for extracted metadata, OCR, or translation.
- EndNote XML unless a supplied real-world library makes it necessary.

## 5. Scope guardrails

- Do not add collaboration abstractions that complicate the single-user sync model.
- Do not store formatted citations as canonical data.
- Do not rely on the browser clipboard alone; provide an explicit **Insert into document** command as the reliable path.
- Do not advertise an asset as offline until its checksum-verified local copy exists.
- Do not make translation or OCR block the core capture workflow.
- Do not implement export by treating exported DOCX or LaTeX as editable source-of-truth.

## 6. Release gates

- All critical provenance acceptance criteria pass.
- Manual sync cannot overwrite a newer server revision silently.
- Restore-from-backup has been tested with PDFs and provenance navigation.
- Supported citation styles pass representative fixtures.
- OCR/translation limitations are surfaced in product language.
- Desktop and iPad end-to-end workflows pass; phone critical text edit passes.

