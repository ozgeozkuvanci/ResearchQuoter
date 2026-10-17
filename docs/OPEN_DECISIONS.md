# Open Decisions

These items must be resolved by validation or explicit user decision. The implementation agent must not guess them or silently expand scope.

| ID | Decision | Current default/hypothesis | Resolution gate | Owner |
|---|---|---|---|---|
| OD-01 | Managed cloud platform and OIDC provider | Choose a simple managed EU-region-capable stack with PostgreSQL and private S3-compatible storage. | Before infrastructure implementation: compare cost, region, backups, OIDC integration, object range requests, and vendor lock-in. | User + developer |
| OD-02 | Exact local translation model/runtime | No model approved; provider port is approved. | Benchmark required language pairs, license, package size, memory, latency, and academic/Latin quality. | Developer, user validates quality |
| OD-03 | iPad local translation generation | Reading/editing synchronized translations is required; generation is not yet guaranteed. | Real iPad Safari test with chosen runtime/model. If infeasible, offer desktop generation and sync; do not enable remote transmission by default. | Developer + user |
| OD-04 | OCR engine/model | Local/server-side provider abstraction; no engine pinned. | Benchmark Spanish, Latin, Italian, English scans and record licenses/confidence/geometry quality. | Developer |
| OD-05 | Zotero import mechanism | Exported Zotero library/package first. | Obtain representative user export and attachment layout. Decide whether file import suffices or Zotero API authorization is materially needed. | User + developer |
| OD-06 | Footnote stream details | Author and citation notes share a numbering stream, reset by chapter or section according to project setting. | Validate DOCX and LaTeX rendering expectations with sample documents. | User |
| OD-07 | Offline cache retention on iPad | Explicit “available offline” assets with quota warning. | Test realistic 40-PDF project on target iPad/iPadOS; define minimum free-space threshold and eviction messaging. | Developer |
| OD-08 | Document version retention | Checkpoints on sync/export/restore/manual save; autosave recovery ring locally. | User chooses retention after storage estimates (recommended: keep manual/restore/export versions indefinitely, daily versions 90 days). | User |
| OD-09 | DOCX citation interoperability | Rendered citations are required; live Word citation-field integration is not assumed. | Prototype export and decide whether editable Word-native fields are valuable enough for later scope. | User + developer |
| OD-10 | Latin→Spanish translation support label | “Experimental where feasible.” | Quality evaluation must pass an agreed sample threshold before release claim. | User + developer |

## Resolved decisions

- Single-user; no collaboration or real-time editing.
- Managed cloud access is desired; self-hosting is not required for MVP.
- Work is local-first and cloud upload/sync is explicitly initiated by the user.
- Desktop first, iPad second, phone emergency editing third.
- PWA approved; no native client required.
- No Apple Pencil/freehand support.
- OCR is required for Spanish, Latin, Italian, and English.
- DOCX and LaTeX exports are required.
- Footnotes serve both citations and author notes with chapter/section numbering.
- Figure attribution is required; permission-clearance workflow is out of scope.

## Decision protocol

For each open decision, add a short record to `ARCHITECTURE.md` or replace this entry with a link to a dated ADR. Record evidence, chosen option, rejected alternatives, and consequences. A phase blocked by an unresolved gate may build only provider-neutral contracts/fixtures, not a speculative vendor-specific implementation.

