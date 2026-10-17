import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { LocalPdfStorage, validatePdfBytes } from "./pdf-storage";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("LocalPdfStorage", () => {
  it("stores immutable PDF bytes under a SHA-256 content-addressed object key", async () => {
    const directory = await mkdtemp(join(tmpdir(), `research-storage-${randomUUID()}-`));
    temporaryDirectories.push(directory);
    const bytes = new TextEncoder().encode("%PDF-1.7\nresearch source");
    const storage = new LocalPdfStorage(directory);

    const stored = await storage.putImmutablePdf({ bytes, maxBytes: 1024 });

    expect(stored.objectKey).toMatch(/^pdf\/[a-f0-9]{64}\.pdf$/);
    await expect(readFile(join(directory, stored.objectKey))).resolves.toEqual(Buffer.from(bytes));
  });

  it("deduplicates identical PDF bytes without rewriting the immutable object", async () => {
    const directory = await mkdtemp(join(tmpdir(), `research-storage-${randomUUID()}-`));
    temporaryDirectories.push(directory);
    const storage = new LocalPdfStorage(directory);
    const bytes = new TextEncoder().encode("%PDF-1.7\ndeduplicated source");

    const first = await storage.putImmutablePdf({ bytes, maxBytes: 1024 });
    const second = await storage.putImmutablePdf({ bytes, maxBytes: 1024 });

    expect(second).toEqual(first);
  });

  it("rejects invalid PDF content before storage", () => {
    expect(() => validatePdfBytes(new TextEncoder().encode("not a PDF"), 1024)).toThrow("Uploaded file is not a PDF.");
  });
});
