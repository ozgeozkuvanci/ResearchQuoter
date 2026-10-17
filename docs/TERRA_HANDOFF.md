# Terra Developer Handoff

## 1. Mission and reading order

Implement the approved provenance-first academic research PWA as one developer. Do not redesign foundational choices during feature work. Read in this order:

1. `PRODUCT_REQUIREMENTS.md` and `MVP_SCOPE.md` — intent and boundaries.
2. `PROVENANCE_MODEL.md` and `DATA_MODEL.md` — critical integrity rules.
3. `ARCHITECTURE.md` — stack, modules, sync, ADRs.
4. `PDF_ANNOTATION_MODEL.md` and `CITATION_SYSTEM.md` — first vertical slice.
5. `SECURITY_AND_PRIVACY.md` and `TEST_STRATEGY.md` — cross-cutting constraints.
6. `TRANSLATION_ARCHITECTURE.md` and `OPEN_DECISIONS.md` — provider gates.
7. `IMPLEMENTATION_ROADMAP.md` and `ACCEPTANCE_CRITERIA.md` — delivery and proof.
8. `USER_JOURNEYS.md` — responsive workflow details.

If documents appear to conflict, preserve data/provenance/security first, then product scope, then implementation convenience. Record a new ADR for any material exception.

## 2. Approved stack

- TypeScript, strict mode; pnpm workspace monorepo.
- Next.js/React installable responsive PWA.
- Tiptap/ProseMirror with a custom versioned semantic schema.
- Mozilla PDF.js.
- PostgreSQL; Prisma plus explicit SQL/constraints where needed.
- Private S3-compatible object storage with SHA-256 verification.
- CSL-JSON canonical metadata and a pinned CSL-compatible processor.
- IndexedDB typed repository, Cache Storage/service worker.
- Zod boundary schemas.
- Vitest and Playwright; real database/object-store integration tests.
- Database-backed job runner in a separate process from the same modular-monolith codebase.

Do not introduce native apps, microservices, CRDTs, public asset buckets, or a vendor-specific translation type into domain code without a superseding ADR and demonstrated requirement.

## 3. Repository and module boundaries

Create the structure approved in `ARCHITECTURE.md`:

```text
apps/web, apps/worker
packages/domain, application, db, storage, editor, pdf, provenance,
         citations, translation, sync, export, contracts, test-support
```

Dependency rules:

- `domain` imports only platform-neutral utilities/types.
- `application` imports `domain` and declared ports.
- adapters (`db`, `storage`, provider packages) implement ports.
- `apps/web` performs presentation, input validation, authentication context, and use-case invocation; it does not contain domain decisions.
- module tables are accessed through their repository/use-case boundary. Cross-module atomic workflows live in `application` and use one transaction boundary.
- provider SDK DTOs never cross into `domain` or persisted canonical records.

Add automated dependency-boundary checks in Phase 0.

## 4. Coding standards

- Enable strict TypeScript, including unchecked-index awareness and exact optional semantics where practical.
- Prefer explicit domain types/value objects for checksums, normalized rectangles, language codes, revisions, and stable IDs.
- Parse all external input with versioned Zod schemas; never cast untrusted JSON.
- Use UTC instants in storage and ISO 8601 at boundaries; keep page indexes explicitly zero-based and UI labels separate.
- Commands are idempotent where a retry is possible. Updates use expected revisions.
- No boolean soup for lifecycle: use explicit state enums and validated transitions.
- Structured logs contain correlation IDs and safe metadata, never document/source/translation text.
- Keep editor/PDF/citation serialization fixtures under version control.
- Comments explain invariants and non-obvious constraints, not syntax.

## 5. Database rules

1. Client-generatable UUIDs support offline creation.
2. Every owned row carries and validates `workspaceId`; project rows also carry `academicProjectId`.
3. Use restrictive foreign keys. Cascades are allowed only for disposable projections/caches.
4. PDFs, derived assets, document versions, reference revisions, anchor revisions, translation raw outputs, and audit events are immutable.
5. User deletion creates tombstones; hard purge follows retention/reachability checks.
6. Canonical references contain structured CSL-compatible data; rendered citations are cache data.
7. Store object checksums, never permanent URLs.
8. Use database/application enforcement for provenance completeness and matching tenant/project/PDF checksum.
9. Every schema migration includes forward migration, compatibility test, backup fixture, and deployment recovery note. Never silently drop an editor node or provenance field.
10. Transactions that create source-derived content also create citation/provenance relations before commit.

## 6. Non-negotiable provenance rules

- The original PDF is immutable and identified by checksum.
- Every source-derived active block has a valid `ProvenanceLink` and exact source identity.
- A transfer is atomic: target block + citation usage + provenance edge + document revision.
- Target edits change status; they do not erase the source edge.
- Replacement PDFs never retarget old anchors automatically.
- Cross-workspace/cross-project edges are invalid.
- Export/restore/sync runs provenance validation and reports failures; it never flattens away missing attribution.
- Workspace backup, not DOCX/LaTeX, is the lossless provenance portability format.

## 7. Implementation phases

### Phase 0 — Foundations and risk spikes

**Objective:** establish executable architecture boundaries and resolve feasibility risks.

**Scope:** workspace setup, CI, type/lint/test commands, local test services, adapter ports, dependency rules, editor/PDF/CSL/IndexedDB spikes, representative Zotero acquisition, OCR/translation benchmark harness, real iPad PWA/storage test plan.

**Likely modules/files:** root workspace configuration; `apps/web`; `packages/domain`, `application`, `contracts`, `test-support`; architecture spike notes/ADRs under `docs/`.

**Dependencies:** access to a target iPad; representative public/synthetic PDFs; user-provided or synthetic Zotero export; cloud/platform decision OD-01 can remain open for local development.

**Acceptance criteria:** architecture import rules run in CI; a PDF selection maps round-trip to page geometry; semantic editor nodes retain stable IDs after serialization; selected CSL processor renders a reviewed APA 7 fixture; IndexedDB transaction survives reload; benchmark results update OD-02/04/05/07. Supports later AC-010, AC-020, AC-030.

**Required tests:** test-service smoke tests; boundary-rule failure fixture; editor serialization; coordinate round-trip; CSL fixture; IndexedDB reload; iPad manual evidence.

**Prohibited shortcuts:** selecting providers/models by popularity alone; using viewport pixels as persisted anchors; embedding vendor SDK types in contracts; skipping real iPad validation.

**Completion checklist:**

- [ ] Commands and CI are reproducible.
- [ ] Repository boundaries are enforced.
- [ ] High-risk spikes have recorded evidence/ADR updates.
- [ ] Required fixture corpus starts with licensing recorded.
- [ ] No production feature breadth was added before risks were tested.

### Phase 1 — Provenance vertical slice

**Objective:** deliver the complete PDF passage → cited document → exact source loop on desktop.

**Scope:** identity mapping, workspace/project, main document, PDF staged upload/finalization, PDF.js rendering, reference candidate/confirmation, text annotation/anchor, highlight/research note, editor quotation/citation nodes, evidence transfer transaction, APA 7 processing, cited bibliography, back-navigation, audit.

**Likely modules/files:** `apps/web`; `packages/domain`, `application`, `db`, `storage`, `editor`, `pdf`, `provenance`, `citations`, `contracts`, `test-support`.

**Dependencies:** Phase 0; local OIDC test strategy; PostgreSQL/S3-compatible test services; approved PDF and CSL fixtures.

**Acceptance criteria:** AC-001–005, AC-010–023, AC-030, AC-033, AC-080–083 relevant to this slice.

**Required tests:** domain invariants; real DB constraints; upload failure/finalization; `TransferEvidenceToDocument` rollback at each failure point; editor round-trip/undo; PDF zoom/navigation; cross-workspace denial; mandatory desktop Playwright vertical slice.

**Prohibited shortcuts:** formatted citation as reference; block without provenance; public asset URL; annotation embedded into PDF bytes; hard-coded APA punctuation; editor HTML as canonical content.

**Completion checklist:**

- [ ] Vertical slice passes from a clean database.
- [ ] Provenance validator reports valid after insert/edit/reload.
- [ ] Clicking source opens exact checksum/page/region.
- [ ] Failed transaction leaves no orphan source-derived block.
- [ ] Security logs contain no content text.

### Phase 2 — Local-first autosave and explicit sync

**Objective:** support complete offline sessions and deliberate cross-device synchronization.

**Scope:** IndexedDB replica/schema migration, local autosave/recovery ring, asset offline manifest, operation outbox, device IDs, applied-operation ledger, project/entity revisions, pull-before-push, conflict records/copies, sync status UI, PWA manifest/service worker, second-device onboarding.

**Likely modules/files:** `apps/web`; `packages/sync`, `storage`, `application`, `db`, `contracts`, `editor`, `test-support`.

**Dependencies:** Phase 1 stable commands and serialization; OD-01 cloud choice before managed deployment; OD-07 storage thresholds before release language.

**Acceptance criteria:** AC-022 and AC-040–046.

**Required tests:** offline Playwright; crash/reload; duplicate/reordered batch; asset-before-metadata; expired session; divergent document conflict; independent entity merge; quota/migration failure; clean second browser; real iPad PWA manual suite.

**Prohibited shortcuts:** localStorage for core data; silent background content upload; last-write-wins main document; marking “cloud saved” after local save; depending solely on service-worker cache for records.

**Completion checklist:**

- [ ] UI distinguishes local, pending, syncing, synced, and conflict states.
- [ ] Operations retry idempotently.
- [ ] No newer server document can be overwritten silently.
- [ ] Offline-selected PDFs are checksum-verified locally.
- [ ] iPad evidence and storage warnings are documented.

### Phase 3 — Source library and imports

**Objective:** make realistic source collections manageable and import existing Zotero material.

**Scope:** source list/search/filter, tags/categories, multiple highlight colors, sticky notes, reference revisions/merge, BibTeX/RIS/CSL-JSON/DOI/manual adapters, Zotero exported library/package and attachment matching, PDF metadata candidate extraction, deduplication review.

**Likely modules/files:** `apps/web`; `packages/domain`, `application`, `db`, `pdf`, `citations`, `contracts`, `test-support`; import adapter area within references/sources.

**Dependencies:** Phase 2 sync semantics for new entities; OD-05 representative Zotero data.

**Acceptance criteria:** AC-012–013, AC-050–051 plus reference revision/deduplication behavior in `CITATION_SYSTEM.md`.

**Required tests:** parser fixtures and malicious imports; repeated Zotero import; duplicate DOI/title ambiguity; missing attachment; metadata correction/revision; tags/categories offline sync; 40-source performance.

**Prohibited shortcuts:** overwriting confirmed metadata silently; auto-merging ambiguous references; assuming Zotero file paths are portable; trusting imported HTML/filenames; discarding raw importer payload.

**Completion checklist:**

- [ ] Representative Zotero library imports with PDFs.
- [ ] Repeat import is controlled/idempotent.
- [ ] User confirmation is required for uncertain metadata.
- [ ] Import errors identify affected items without aborting all valid items unnecessarily.
- [ ] Raw input and field provenance are retained.

### Phase 4 — OCR and translation

**Objective:** enable scanned and multilingual evidence workflows with local-first privacy.

**Scope:** OCR job/provider/overlay/revisions for four languages; translation port/capability registry; benchmark-approved local desktop adapter; model artifact management; translation revisions, review, editor transfer; iPad read/edit and optional generation if validated.

**Likely modules/files:** `apps/web`, `apps/worker`; `packages/pdf`, `translation`, `application`, `db`, `storage`, `provenance`, `editor`, `contracts`, `test-support`.

**Dependencies:** Phases 2–3; OD-02/03/04 and relevant licensing decisions resolved before provider release.

**Acceptance criteria:** AC-052–056.

**Required tests:** engine/provider contract suites; language corpus quality/geometry benchmarks; low confidence UI; model absent/resource error; translation edit revisions; original-to-translation provenance; log redaction; offline reading; real iPad capability test.

**Prohibited shortcuts:** sending text to remote provider by default; modifying PDF; claiming Latin quality without corpus evidence; overwriting raw translation output; synchronizing model binaries as project assets.

**Completion checklist:**

- [ ] Provider/model/license/checksum decisions are recorded.
- [ ] Supported language claims match benchmark results.
- [ ] Original text remains visible and immutable.
- [ ] Translation insertion cites the scholarly source.
- [ ] Unsupported device states are explicit and non-destructive.

### Phase 5 — Figures, complete citations, and notes

**Objective:** complete figure provenance and required academic style behavior.

**Scope:** page-region crop/derived assets, uploaded images, figure metadata/caption/tags, figure insertion/back-navigation/attribution, all four styles, style switching, author/citation footnotes, endnotes where style/config requires, chapter/section numbering, manually included uncited references.

**Likely modules/files:** `apps/web`, `apps/worker`; `packages/pdf`, `storage`, `provenance`, `editor`, `citations`, `application`, `db`, `contracts`, `test-support`.

**Dependencies:** Phase 3 reference quality; Phase 4 worker framework; OD-06 note-stream validation.

**Acceptance criteria:** AC-031–034 and AC-060–063.

**Required tests:** crop geometry/checksum; figure navigation; citation golden fixtures; same-author disambiguation; note numbering after move/delete; style-switch canonical hash property; bibliography manual inclusion; responsive figure workflow.

**Prohibited shortcuts:** caption string as sole figure source; hand-coded style punctuation; mutable derived image replacement; using display note numbers as stable IDs; losing provenance on style switch.

**Completion checklist:**

- [ ] Four styles pass reviewed fixtures.
- [ ] Figures carry source/checksum/page/region/reference.
- [ ] Author and citation notes are semantically distinct.
- [ ] Chapter/section reset behavior matches approved sample.
- [ ] Style changes affect only derived rendering.

### Phase 6 — Versions, exports, backup, and recovery

**Objective:** provide reproducible outputs and lossless recovery/portability.

**Scope:** immutable document checkpoints, preview/restore-as-new, retention setting, document intermediate representation, pinned export jobs, DOCX and LaTeX exporters, full workspace backup manifest/archive, safe restore/migrations, operational backup drill.

**Likely modules/files:** `apps/web`, `apps/worker`; `packages/editor`, `export`, `provenance`, `citations`, `storage`, `db`, `application`, `contracts`, `test-support`.

**Dependencies:** Phases 4–5; OD-08 retention and OD-09 Word field decision (rendered citations remain minimum).

**Acceptance criteria:** AC-070–075.

**Required tests:** version parent/checksum; restore-as-new; historical provenance resolution; DOCX structure inspection/render smoke; LaTeX escaping/compile smoke in controlled environment; export retry/input pinning; corrupted/path-traversal backup rejection; complete backup round-trip.

**Prohibited shortcuts:** overwriting a restored version; treating DOCX as canonical; exporting current mutable state without pinning; omitting assets/provenance from backup; unsafe LaTeX/raw archive extraction.

**Completion checklist:**

- [ ] Restore never destroys later history.
- [ ] Exports reproduce pinned version/style/assets.
- [ ] Backup manifest includes schemas, counts, checksums.
- [ ] Clean restore passes provenance validation.
- [ ] Retention and failure behavior are documented.

### Phase 7 — Responsive hardening and release

**Objective:** meet release quality on desktop/iPad and emergency phone editing.

**Scope:** desktop split workspace, iPad pane switching/touch, phone single-pane edit, accessibility, performance, storage pressure, security review, observability/operations, backup recovery drill, onboarding and limitation messaging.

**Likely modules/files:** primarily `apps/web`, plus all packages for measured defects; deployment/operations configuration after OD-01.

**Dependencies:** all prior phases; target devices and production-like staging.

**Acceptance criteria:** AC-080–085 and all critical blockers; success measures in `PRODUCT_REQUIREMENTS.md`.

**Required tests:** full P0 CI; real desktop/iPad/phone smoke; accessibility assistive-tech checks; target-scale load; malicious upload/import; CSP/session/access review; storage eviction/recovery; production backup restore; observability redaction.

**Prohibited shortcuts:** equating viewport emulation with real iPad evidence; public buckets; waiving provenance/data-loss/security blockers; claiming phone full parity; logging user content for debugging.

**Completion checklist:**

- [ ] All release-blocking criteria pass with traceable evidence.
- [ ] Target performance and accessibility results are recorded.
- [ ] Production backup/restore and incident steps are exercised.
- [ ] Known limitations match actual device/model support.
- [ ] No unresolved decision is hidden by an implicit default.

## 8. Security constraints for every phase

- Authenticate at the server and authorize ownership on every record/asset operation.
- Validate untrusted input and sanitize rich content.
- Keep buckets private and URLs short-lived.
- Never log source, note, document, OCR, or translation content.
- Apply size/rate/resource limits to uploads, imports, sync batches, and jobs.
- Preserve audit events for destructive/integrity operations.
- Follow the threat controls and verification checklist in `SECURITY_AND_PRIVACY.md`.

## 9. Testing requirements for every phase

- Add tests with implementation, not as a later stabilization task.
- Prefer domain unit tests and real-adapter integration tests; mock only true external boundaries.
- Maintain the mandatory Playwright vertical slice from Phase 1 onward.
- Add regression fixtures for every provenance, sync, citation, or migration defect.
- Keep schema-version compatibility and backup round-trip tests in CI.
- Do not mark a phase complete without recorded test commands/results and acceptance IDs.

## 10. Known risks

- iPad PWA storage eviction/background limits can undermine offline expectations.
- PDF text layers, OCR reading order, ligatures, and historical scans can make anchors approximate.
- Local translation model size/quality, particularly Latin, may not satisfy iPad constraints.
- ProseMirror transformations can orphan projections unless all edits use validated commands.
- Explicit sync allows device divergence and requires honest conflict UX.
- CSL/Word/LaTeX differences can create output edge cases.
- Zotero attachment exports vary by method/platform.

Mitigations are specified in architecture/test documents. Do not conceal these risks with optimistic UI copy.

## 11. Decisions that must not be guessed

Before related implementation is released, resolve the numbered items in `OPEN_DECISIONS.md`, especially cloud/OIDC platform, OCR engine, local translation model/runtime, iPad generation capability, Zotero import mechanism, note stream sample, version retention, and Word citation-field expectations. Provider-neutral work may proceed; vendor-specific commitments may not.

## 12. Overall completion criteria

Implementation is complete only when:

- every MVP release capability in `MVP_SCOPE.md` is implemented;
- every release-blocking acceptance criterion passes;
- the complete research-to-writing E2E succeeds on desktop and iPad;
- a second device receives explicitly synchronized work without provenance loss;
- all four citation styles and required note behavior pass reviewed fixtures;
- OCR/translation claims match measured supported languages/devices;
- DOCX/LaTeX export and workspace backup/restore pass;
- security, accessibility, and performance gates have recorded evidence;
- known risks/limitations and remaining decisions are visible, not silently assumed.

