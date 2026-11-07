import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

// Pictures placed in the document are stored once each, named by their content's SHA-256, in an
// "images" folder next to the PDFs. The document refers to them by that file name only.

export type ImageFormat = "png" | "jpg" | "gif" | "webp";

export interface ImageInfo {
  format: ImageFormat;
  mimeType: string;
  width: number;
  height: number;
}

export const maxImageBytes = 20 * 1024 * 1024;

const mimeTypes: Record<ImageFormat, string> = { png: "image/png", jpg: "image/jpeg", gif: "image/gif", webp: "image/webp" };

export function isImageFileName(name: string): boolean {
  return /^[0-9a-f]{64}\.(png|jpg|gif|webp)$/.test(name);
}

export function imageMimeType(name: string): string {
  return mimeTypes[name.slice(name.lastIndexOf(".") + 1) as ImageFormat];
}

function imageRoot(): string {
  return resolve(process.env.LOCAL_ASSET_ROOT ?? join(/* turbopackIgnore: true */ process.cwd(), "../../.local-assets"), "images");
}

export async function storeImage(bytes: Uint8Array): Promise<{ file: string; info: ImageInfo }> {
  const info = readImageInfo(bytes);
  if (info === null) throw new Error("Only PNG, JPEG, GIF and WebP pictures can be added.");
  if (bytes.byteLength > maxImageBytes) throw new Error("The picture is larger than 20 MB.");
  const file = `${createHash("sha256").update(bytes).digest("hex")}.${info.format}`;
  await mkdir(imageRoot(), { recursive: true });
  try {
    await writeFile(join(imageRoot(), file), bytes, { flag: "wx" });
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "EEXIST")) throw error;
  }
  return { file, info };
}

export async function readImage(file: string): Promise<Uint8Array | null> {
  if (!isImageFileName(file)) return null;
  return readFile(join(imageRoot(), file)).catch(() => null);
}

// Recognises the format from the file's first bytes and reads its pixel size from the header.
export function readImageInfo(bytes: Uint8Array): ImageInfo | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const ascii = (start: number, length: number) => String.fromCharCode(...bytes.subarray(start, start + length));
  const info = (format: ImageFormat, width: number, height: number): ImageInfo | null =>
    width > 0 && height > 0 ? { format, mimeType: mimeTypes[format], width, height } : null;
  if (bytes.byteLength >= 24 && view.getUint32(0) === 0x89504e47 && ascii(12, 4) === "IHDR") {
    return info("png", view.getUint32(16), view.getUint32(20));
  }
  if (bytes.byteLength >= 10 && (ascii(0, 6) === "GIF87a" || ascii(0, 6) === "GIF89a")) {
    return info("gif", view.getUint16(6, true), view.getUint16(8, true));
  }
  if (bytes.byteLength >= 30 && ascii(0, 4) === "RIFF" && ascii(8, 4) === "WEBP") {
    const chunk = ascii(12, 4);
    if (chunk === "VP8 ") return info("webp", view.getUint16(26, true) & 0x3fff, view.getUint16(28, true) & 0x3fff);
    if (chunk === "VP8L") {
      const bits = view.getUint32(21, true);
      return info("webp", (bits & 0x3fff) + 1, ((bits >> 14) & 0x3fff) + 1);
    }
    if (chunk === "VP8X") return info("webp", (view.getUint32(24, true) & 0xffffff) + 1, (view.getUint32(27, true) & 0xffffff) + 1);
    return null;
  }
  if (bytes.byteLength >= 4 && view.getUint16(0) === 0xffd8) {
    // Walks the JPEG segments to the frame header that holds the size.
    let offset = 2;
    while (offset + 9 < bytes.byteLength) {
      if (bytes[offset] !== 0xff) return null;
      const marker = bytes[offset + 1] ?? 0;
      if (marker === 0xff) {
        offset += 1;
        continue;
      }
      const length = view.getUint16(offset + 2);
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return info("jpg", view.getUint16(offset + 7), view.getUint16(offset + 5));
      }
      offset += 2 + length;
    }
  }
  return null;
}
