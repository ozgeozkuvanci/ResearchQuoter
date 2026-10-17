import { z } from "zod";

const unitInterval = z.number().finite().min(0).max(1);

export const normalizedRectSchema = z
  .object({
    x: unitInterval,
    y: unitInterval,
    width: unitInterval.positive(),
    height: unitInterval.positive()
  })
  .superRefine((rect, context) => {
    if (rect.x + rect.width > 1) {
      context.addIssue({ code: "custom", message: "Rectangle exceeds the page width." });
    }

    if (rect.y + rect.height > 1) {
      context.addIssue({ code: "custom", message: "Rectangle exceeds the page height." });
    }
  });

export type NormalizedRect = z.infer<typeof normalizedRectSchema>;

export interface PdfPageSize {
  width: number;
  height: number;
}

export interface PdfPageRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

function assertPositiveFiniteSize(page: PdfPageSize): void {
  if (!Number.isFinite(page.width) || !Number.isFinite(page.height) || page.width <= 0 || page.height <= 0) {
    throw new Error("PDF page dimensions must be positive finite numbers.");
  }
}

export function normalizePageRect(rect: PdfPageRect, page: PdfPageSize): NormalizedRect {
  assertPositiveFiniteSize(page);

  return normalizedRectSchema.parse({
    x: rect.x / page.width,
    y: rect.y / page.height,
    width: rect.width / page.width,
    height: rect.height / page.height
  });
}

export function denormalizePageRect(rect: NormalizedRect, page: PdfPageSize): PdfPageRect {
  assertPositiveFiniteSize(page);
  const validRect = normalizedRectSchema.parse(rect);

  return {
    x: validRect.x * page.width,
    y: validRect.y * page.height,
    width: validRect.width * page.width,
    height: validRect.height * page.height
  };
}

export function approximatelyEqualRect(
  first: PdfPageRect,
  second: PdfPageRect,
  tolerance = 0.000_001
): boolean {
  return (
    Math.abs(first.x - second.x) <= tolerance &&
    Math.abs(first.y - second.y) <= tolerance &&
    Math.abs(first.width - second.width) <= tolerance &&
    Math.abs(first.height - second.height) <= tolerance
  );
}
