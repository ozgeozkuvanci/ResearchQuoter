# Implementation Status

## Windows desktop status (2026-08-06)

- Converted the application into an installable Windows desktop program using Electron 43 with context isolation, renderer sandboxing, restricted navigation, and denied runtime permissions.
- Added a self-contained production runtime: packaged Next.js standalone server, bundled PostgreSQL 17, first-launch user-data cluster initialization, seed database restoration, and seed PDF restoration.
- Added reproducible desktop development, unpacked bundle, and NSIS installer commands. Produced and installed `Research-Workspace-Setup-0.1.0.exe` with desktop and Start menu shortcuts.
- Verified a clean first launch outside the source tree: `Project1` and `TestProject` loaded, document revision 7 exposed five blocks and four evidence links, and three PDF assets were present.
- Current automated result: lint and typecheck pass; 14 unit tests pass and the dedicated PostgreSQL integration suite remains opt-in through `TEST_DATABASE_URL`.
- The next product-development step remains PDF.js selection anchoring and the structured academic editor; the desktop conversion does not claim those pending features are complete.

## Current phase

**Phase 1 — Provenance vertical slice: database and application-command foundation in progress**

Phase 0 engineering work is complete. Real iPad PWA/storage validation remains an external pre-release requirement.

The repository had no application implementation before this phase. The initial workspace, strict TypeScript configuration, quality gates, module boundaries, and risk-spike tests are being established.

## Completed items

- Inspected all planning documents in the required order.
- Confirmed the repository contains only planning documentation before implementation.
- Created the pnpm monorepo, strict TypeScript configuration, Next.js application shell, ESLint, Vitest, and CI workflow.
- Created the initial domain, application, contracts, test-support, PDF, editor, citations, and sync module boundaries.
- Added a dependency-boundary check that rejects adapter imports in `domain` and `application`.
- Validated normalized PDF page coordinates through a round-trip and cross-viewport test.
- Validated stable ProseMirror block IDs through schema serialization tests.
- Validated Citation.js `0.8.1` against reviewed APA 7 bibliography and in-text citation fixtures; recorded ADR-011.
- Validated IndexedDB persistence after closing and reopening a local replica.
- Added Prisma 7 PostgreSQL configuration, a normalized initial schema, generated Prisma client configuration, and explicit initial SQL migration `20260710235500_init`.
- Added provider-neutral `CreateAcademicProject` command with authorization-first transaction ordering, structured initial document content, default bibliography configuration, and audit event creation.
- Installed PostgreSQL 17 command-line/server binaries and created a local development-only PostgreSQL cluster bound to `127.0.0.1`.
- Applied and verified migration `20260710235500_init` against the local `research_workspace` PostgreSQL database.
- Added Prisma-backed transaction/client adapters and real PostgreSQL integration tests for successful project creation and rollback on invalid citation-style foreign keys.
- Updated CI to provision PostgreSQL 17, deploy migrations, and run integration tests.
- Added a local-development-only project creation API and browser form. It creates a local user/workspace and checksum-pinned bundled APA 7 CSL style only when `NODE_ENV` is not `production`.
- Manually verified project creation through the browser; the success state returned a persisted project ID from PostgreSQL.
- Added a `PdfStoragePort` and local development adapter that validates PDF magic bytes and size, derives SHA-256 object keys, and preserves duplicate uploads as one immutable object.
- Added a local-development source intake flow: project listing, manual CSL-compatible reference metadata, PDF upload, immutable `PdfAsset`, `SourceDocumentVersion`, contributor, and audit-event persistence.
- Added a usable local provenance loop: project-scoped PDF listing, authorized inline PDF retrieval, manual quote capture with page anchor and research note, and immutable annotation/anchor/audit persistence.
- Added cited insertion from a captured quote into the main document. The insertion persists a `DocumentBlock`, APA 7 `CitationUsage`, and `ProvenanceLink`; the document now exposes evidence links that return the reader to the source PDF and recorded page.
- Added an APA 7 bibliography for cited sources and local DOCX/LaTeX export of the current document with that generated bibliography.
- Added manual paraphrase insertion for every captured quote. Paraphrased text retains the original quote/page anchor and citation while its provenance status is stored as `PARAPHRASE`.
- Added provenance-backed inline document links: quote and paraphrase blocks are visibly highlighted in the main writing area and open their exact source PDF/page on click.
- Isolated destructive PostgreSQL integration tests behind `TEST_DATABASE_URL`; a missing test database now skips those tests instead of truncating a user's development workspace. CI provisions and migrates that dedicated test database.

## Pending items

- Run the real iPad PWA/storage validation described in `TEST_STRATEGY.md` before Phase 2/release claims.
- Implement OIDC authentication/session integration before exposing project commands through HTTP routes.
- Implement structured reference confirmation and immutable staged PDF-asset registration commands with PostgreSQL integration tests.
- Connect `PdfStoragePort` to the source/reference registration transaction and upload route.
- Add the production S3-compatible storage adapter before production deployment; the local filesystem adapter is development-only.
- Acquire a representative Zotero export/package before Phase 3 import implementation.
- Benchmark and document OCR/translation provider candidates before Phase 4 adapter release.

## Tests added

- `packages/pdf/src/anchors.test.ts` — normalized page-coordinate round-trip, viewport independence, and bounds validation.
- `packages/editor/src/document-schema.test.ts` — stable semantic node IDs and invalid-document rejection.
- `packages/citations/src/citation-js-processor.test.ts` — APA 7 bibliography and in-text citation fixture.
- `packages/sync/src/local-replica.test.ts` — IndexedDB durability after reopening.
- `packages/application/src/create-academic-project.test.ts` — authorization-first, transaction-bound creation of project, document, bibliography configuration, and audit event.
- `packages/db/src/prisma-project-creation-transaction.test.ts` — real PostgreSQL persistence and rollback behavior.
- `packages/storage/src/pdf-storage.test.ts` — PDF validation, content-addressed immutable storage, and duplicate-byte deduplication.

## Tests passing

- `pnpm check:boundaries` — passing.
- `pnpm test` — 7 files, 16 tests passing.
- `pnpm typecheck` — passing.
- `pnpm lint` — passing.
- `pnpm build` — passing.
- `pnpm db:validate` and `pnpm db:generate` — passing with a configured PostgreSQL URL.

## Known limitations

- The implemented PDF viewer and provenance workflow are local-development features. They use the browser's native PDF renderer and a manually recorded page number; PDF.js selection geometry, automatic copy/paste anchoring, annotation colors beyond the stored default, and sticky-note editing are still pending.
- OIDC authentication, private object storage, Zotero import, rich structured editing, production citation-style selection, export, translation, and offline synchronization are not implemented yet.
- The current project creation screen is explicitly a local development bootstrap, not production authentication or a completed research dashboard.
- Cloud/OIDC platform, OCR engine, translation model/runtime, Zotero import source, and iPad capacity validation remain open decisions as recorded in `OPEN_DECISIONS.md`.
- Citation.js package postinstall and Next.js optional `sharp` build scripts are explicitly denied in `pnpm-workspace.yaml`; neither is required by the current validated foundation. Revisit this only if a future feature requires its build artifact.

## Assumptions

- Node.js 24 from the supplied workspace runtime is used for local development; project configuration requires Node.js 22 or newer.
- The Phase 0 foundation uses provider-neutral interfaces and does not select a cloud/OCR/translation vendor.
- Citation.js is a reversible infrastructure adapter, not a canonical citation data model or final style-coverage claim.
- The local PostgreSQL cluster uses `trust` authentication and is bound to `127.0.0.1` solely to support development automation. It must never be reused for staging or production.
- The filesystem PDF adapter is a local development substitute; it is not a production object-storage deployment.

## Technical debt

- None recorded at initialization.

## Next step

Implement PDF.js text/selection anchoring and a rich structured editor on top of the working local source-to-document provenance loop.
