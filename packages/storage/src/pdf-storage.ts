import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";

export interface StoredPdfAsset {
  objectKey: string;
  checksum: string;
  byteSize: bigint;
  mimeType: "application/pdf";
}

export interface PdfStoragePort {
  putImmutablePdf(input: { bytes: Uint8Array; maxBytes: number }): Promise<StoredPdfAsset>;
}

export class LocalPdfStorage implements PdfStoragePort {
  constructor(private readonly rootDirectory: string) {}

  async putImmutablePdf(input: { bytes: Uint8Array; maxBytes: number }): Promise<StoredPdfAsset> {
    validatePdfBytes(input.bytes, input.maxBytes);

    const checksum = createHash("sha256").update(input.bytes).digest("hex");
    const objectKey = `pdf/${checksum}.pdf`;
    const rootPath = resolve(this.rootDirectory);
    const objectPath = resolve(rootPath, objectKey);
    const relativeObjectPath = relative(rootPath, objectPath);
    if (relativeObjectPath.startsWith("..") || isAbsolute(relativeObjectPath)) {
      throw new Error("Resolved object path falls outside the storage root.");
    }

    await mkdir(dirname(objectPath), { recursive: true });
    try {
      await writeFile(objectPath, input.bytes, { flag: "wx" });
    } catch (error) {
      if (!(isNodeError(error) && error.code === "EEXIST")) {
        throw error;
      }
    }

    return {
      objectKey,
      checksum,
      byteSize: BigInt(input.bytes.byteLength),
      mimeType: "application/pdf"
    };
  }
}

export function validatePdfBytes(bytes: Uint8Array, maxBytes: number): void {
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) {
    throw new Error("Maximum PDF size must be a positive safe integer.");
  }
  if (bytes.byteLength === 0 || bytes.byteLength > maxBytes) {
    throw new Error("PDF file size is invalid.");
  }
  if (bytes.byteLength < 5 || String.fromCharCode(...bytes.slice(0, 5)) !== "%PDF-") {
    throw new Error("Uploaded file is not a PDF.");
  }
}

function isNodeError(value: unknown): value is { code?: string } {
  return typeof value === "object" && value !== null && "code" in value;
}
