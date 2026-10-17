# Security and Privacy

## 1. Security posture

The application stores unpublished research, source documents, notes, and drafts. All content is private by default. Although MVP is single-user, authorization is enforced at every server boundary and must never rely on hidden UI controls.

## 2. Threat model priorities

- Cross-workspace/object access through guessed IDs or object keys.
- Theft of sessions or long-lived presigned URLs.
- Malicious PDFs, import files, citation styles, or document content.
- Data loss or overwrite during offline sync.
- Leakage of research text through translation/OCR logs or third parties.
- Supply-chain compromise in PDF/editor/model runtimes.
- Stored XSS through notes, metadata, captions, or imported HTML.
- Decompression bombs, oversized files, and resource exhaustion.

## 3. Authentication and sessions

- Use a maintained OIDC/passwordless authentication provider; do not implement password storage.
- Use secure, `HttpOnly`, `SameSite` cookies for web sessions and CSRF protection for state-changing requests.
- Apply recent-authentication checks to workspace purge, backup restore, device revocation, and bulk export.
- Server maps authenticated issuer/subject to `User.id`; client-supplied user IDs are never trusted.
- Offline access may continue to locally cached content within product policy, but server actions require a valid session.

## 4. Authorization

- Every repository query scopes by authenticated owner and `workspaceId`; project IDs alone are insufficient.
- Asset download/upload tokens are short-lived, method/size/content-type constrained, and issued only after authorization.
- Worker jobs re-check ownership/status from database rather than trusting queued payloads.
- Composite ownership constraints prevent cross-workspace links.
- Future collaboration must introduce an explicit membership/role model; it must not be approximated with shared credentials.

## 5. Data protection

- TLS is mandatory in transit.
- Use managed encryption at rest for PostgreSQL, object storage, and backups.
- Object buckets are private; block public ACLs and public bucket policies.
- Store random opaque object keys plus checksums, not user filenames as keys.
- Keep secrets in a managed secret store/environment injection and rotate them; never place them in repository or IndexedDB.
- Minimize local cache to projects/assets explicitly selected. Rely on OS/browser platform encryption but clearly state that browser cache is not an encrypted vault controlled by the application.
- Provide device/session revocation and instructions for clearing offline data.

## 6. Upload and content handling

- Enforce size limits, magic-byte/MIME validation, PDF parser sandboxing boundaries, and checksum verification.
- Quarantine failed or suspicious files; never execute PDF JavaScript or embedded files.
- Sanitize all rich-text/imported HTML through an allowlist; ProseMirror schema parsing is necessary but not sufficient.
- Treat BibTeX, RIS, CSL-JSON, CSL XML, Zotero exports, DOCX input artifacts, and backup archives as untrusted.
- Archive extraction rejects path traversal, symlinks, excessive compression ratios, and undeclared files.
- Generated DOCX/LaTeX escapes content by target context; LaTeX export must not emit arbitrary executable commands from user/imported text.

## 7. OCR and translation privacy

- Default local adapters do not transmit source text externally.
- Logs include IDs/error classes and metrics, never selected text, translated text, PDF contents, titles, or research notes.
- Any future remote provider is disabled until the user opts in after seeing provider, data sent, retention policy, and cost implications.
- Only the minimum selected text/pages are supplied to a provider.
- Model packages have verified checksums and recorded license/source.

## 8. Sync and integrity security

- Mutations require idempotency keys and expected revisions.
- Applied-operation ledgers prevent replay from duplicating changes.
- Main-document conflicts never use silent last-write-wins.
- Sync batches are bounded by count/bytes and validated as schemas before application.
- The server derives protected fields (owner, server revision, server timestamps).
- Backup manifests are signed or MAC-protected when feasible and always checksum-verified on restore.

## 9. Audit events

Record authentication anomalies, asset upload/finalization, import, export, backup/restore, sync conflict/resolution, document restore, provenance detach/repair, reference merge, device revocation, and destructive purge. Events use privacy-safe metadata and correlation IDs. Audit events are append-only and not included in ordinary user-edit APIs.

## 10. Retention and deletion

- Document versions, tombstones, audit records, and backups have explicit configurable retention.
- Workspace deletion uses a grace period before hard purge.
- Hard purge removes database rows and asset versions according to storage-provider lifecycle while retaining only legally/operationally required audit metadata in pseudonymized form.
- The UI distinguishes archive, remove from project, local-cache removal, and permanent account/workspace deletion.

## 11. Security verification checklist

- Authorization integration tests cover every object type and asset URL.
- Dependency, secret, and static analysis scans run in CI.
- CSP is strict; inline script exceptions are documented.
- Upload/import fuzz and malicious fixture tests are included.
- Restore/sync fault injection proves no acknowledged edit is silently lost.
- A pre-release manual review covers OWASP ASVS-inspired session, access control, input, storage, and logging controls.

