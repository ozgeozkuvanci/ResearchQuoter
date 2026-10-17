# Test Strategy

## 1. Quality priorities

1. Provenance and source navigation integrity.
2. No data loss across autosave, offline work, sync, conflict, version restore, and backup.
3. Citation correctness and style-neutral metadata.
4. Editor schema stability and export fidelity.
5. PDF anchor accuracy across devices.
6. Security and tenant isolation.

## 2. Test layers

### Unit tests (Vitest)

- Domain invariants, value objects, checksums, normalized coordinates.
- Reference normalization/deduplication candidates.
- Citation input assembly and cache keys.
- Editor commands and schema migrations.
- Provenance status transitions (`verbatim` → `target_modified`, repair, tombstone).
- Sync merge classification and idempotency.
- Translation/OCR provider contract behavior with fakes.
- Note numbering and bibliography membership.

### Integration tests

- Real PostgreSQL constraints/transactions and Prisma repositories.
- S3-compatible staged upload/finalization/range download/checksum flow.
- Critical commands, especially `TransferEvidenceToDocument` atomicity.
- Worker claiming/retry/idempotency for OCR/export.
- CSL processor using pinned real style/locale fixtures.
- Backup export/restore and schema migration.
- Authorization scope and presigned asset access.

Mocks are not acceptable substitutes for database constraints, citation processor behavior, or PDF coordinate transforms in these suites.

### Component tests

- Editor semantic nodes and commands.
- PDF toolbar, highlight palette, sticky note, source-link states.
- Sync status/conflict UI and offline availability controls.
- Accessible keyboard/touch interactions.

### End-to-end tests (Playwright)

The first mandatory test performs the complete vertical slice:

1. sign in and create a project;
2. upload a fixture PDF and confirm its reference;
3. open/render it and select a known passage;
4. save anchor/page/text and research note;
5. transfer evidence to the document;
6. verify citation and bibliography;
7. click source and verify the correct page/region overlay;
8. go offline, edit, verify local autosave;
9. return online, explicitly sync;
10. open a clean second browser context and verify content/source navigation.

Additional E2E flows cover Zotero import, OCR selection, translation insertion, figure crop/attribution, style switching, notes numbering, DOCX/LaTeX export, conflict resolution, version restore, and backup round-trip.

## 3. Device matrix

| Priority | Environment | Required coverage |
|---|---|---|
| P0 | Desktop Chromium | all E2E workflows |
| P0 | Desktop Safari/WebKit equivalent plus manual Safari | core, sync, editor, PDF |
| P0 | iPad Safari real device | install/open, offline cache, viewer/editor, sync, storage pressure |
| P1 | Desktop Firefox | core vertical slice and exports |
| P1 | Phone Chromium/WebKit viewports + one real phone smoke test | open project, emergency text edit, sync status, source view |

Playwright emulation does not replace real iPad tests for storage eviction, PWA lifecycle, clipboard, and memory.

## 4. Fixture corpus

- Small deterministic text PDF with known page coordinates.
- Multi-column, rotated, ligature/hyphenation, accented Spanish/Italian, and Latin PDFs.
- Image-only scans at varying quality.
- Malformed, encrypted, oversized-boundary, and malicious PDF/import fixtures.
- Zotero export/package with duplicate references and attachments.
- CSL references covering articles, books, chapters, organizations, missing dates, same-year disambiguation.
- Editor documents for every schema version.
- Translation evaluation corpus reviewed or spot-checked by a qualified user for required pairs.

Fixtures containing copyrighted material must be licensed, public-domain, or synthetic.

## 5. Citation verification

- Pin CSL style and locale checksums in tests.
- Golden snapshots are reviewed fixtures, not blindly accepted after dependency updates.
- Test APA 6/7 differences, Chicago author-date, Chicago note forms, ibid/subsequent-note behavior supported by the processor, locators, multi-citations, and bibliography ordering.
- Style-switch property: canonical reference JSON and provenance graph hashes remain identical before/after.

## 6. Provenance property tests

Generate sequences of insert, edit, move, split, merge, undo, restore, sync, and export operations. Assert:

- every active source-derived block has at least one valid edge;
- source IDs/checksums never mutate;
- target modification changes status rather than deleting edges;
- historical versions remain resolvable;
- serialization round-trips stable block IDs.

## 7. Offline/sync fault testing

- Network interruption before/after asset upload and metadata commit.
- Duplicate/reordered batch delivery.
- Expired session during sync.
- Two devices editing different entities and the same document.
- Browser crash between local transaction and UI acknowledgement.
- IndexedDB quota exceeded/migration failure.
- Server failure during transaction and worker retry.

Success means no silent loss or false “synced” state; preserved conflict copies are acceptable.

## 8. Performance and accessibility

- Benchmark projects with 100 PDFs, 5,000 annotations, a 300-page document, and a 2,000-reference library.
- Track project open, editor input latency, autosave acknowledgement, PDF first page, anchor navigation, sync batch, and bibliography regeneration.
- Run automated accessibility checks plus keyboard-only and VoiceOver/NVDA smoke tests.
- Validate highlight distinctions without color alone and 44px-class touch targets on iPad.

## 9. CI gates

- Format/typecheck/lint and dependency boundary checks.
- Unit and integration suites.
- Migration/backup compatibility fixtures.
- P0 Playwright vertical slice.
- Security scans and no-secret check.
- Coverage thresholds emphasize domain/application branches; coverage percentage never replaces mandatory scenario tests.

## 10. Release evidence

Each phase records test command/results, fixture versions, manual device results, known limitations, and acceptance-criteria traceability. A release is blocked by any provenance-critical, data-loss, cross-workspace authorization, or unrecoverable sync defect.

