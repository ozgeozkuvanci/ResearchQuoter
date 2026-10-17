import { describe, expect, it } from "vitest";

import { approximatelyEqualRect, denormalizePageRect, normalizePageRect } from "./anchors";

describe("PDF annotation coordinates", () => {
  it("round-trips a page-space rectangle through normalized coordinates", () => {
    const page = { width: 612, height: 792 };
    const original = { x: 72, y: 144, width: 288, height: 72 };

    const normalized = normalizePageRect(original, page);
    const restored = denormalizePageRect(normalized, page);

    expect(restored).toEqual(original);
  });

  it("preserves a source location across differently sized viewports", () => {
    const pdfPage = { width: 612, height: 792 };
    const original = { x: 102, y: 216, width: 204, height: 36 };
    const normalized = normalizePageRect(original, pdfPage);

    const desktopViewport = denormalizePageRect(normalized, { width: 1224, height: 1584 });
    const tabletViewport = denormalizePageRect(normalized, { width: 918, height: 1188 });

    expect(approximatelyEqualRect(desktopViewport, { x: 204, y: 432, width: 408, height: 72 })).toBe(true);
    expect(approximatelyEqualRect(tabletViewport, { x: 153, y: 324, width: 306, height: 54 })).toBe(true);
    expect(approximatelyEqualRect(denormalizePageRect(normalized, pdfPage), original)).toBe(true);
  });

  it("rejects rectangles that fall outside the PDF page", () => {
    expect(() => normalizePageRect({ x: 600, y: 20, width: 20, height: 10 }, { width: 612, height: 792 })).toThrow(
      "Rectangle exceeds the page width."
    );
  });
});
