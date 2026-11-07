import { describe, expect, it } from "vitest";

import { isImageFileName, readImageInfo } from "./document-images";

describe("document images", () => {
  it("reads the format and size of PNG, GIF and JPEG headers", () => {
    const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 2, 0, 0, 0, 1, 0x2c]);
    const gif = Uint8Array.from([...Buffer.from("GIF89a"), 10, 0, 20, 0]);
    const jpeg = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 4, 0, 0, 0xff, 0xc0, 0, 17, 8, 0, 30, 0, 40, 3]);

    expect(readImageInfo(png)).toMatchObject({ format: "png", width: 512, height: 300 });
    expect(readImageInfo(gif)).toMatchObject({ format: "gif", width: 10, height: 20 });
    expect(readImageInfo(jpeg)).toMatchObject({ format: "jpg", width: 40, height: 30 });
    expect(readImageInfo(Uint8Array.from([1, 2, 3, 4]))).toBeNull();
  });

  it("accepts only stored picture names", () => {
    expect(isImageFileName(`${"0".repeat(64)}.jpg`)).toBe(true);
    expect(isImageFileName("../settings.json")).toBe(false);
    expect(isImageFileName(`${"0".repeat(64)}.svg`)).toBe(false);
  });
});
