// Pictures are numbered per section like Word's chapter-numbered captions: the second picture in
// the third section is 3.2. The writing area and both exports use the same numbers.

export type FigureLabel = "Şekil" | "Figure";

export const figureLabels: readonly FigureLabel[] = ["Şekil", "Figure"];

export function isFigureLabel(value: unknown): value is FigureLabel {
  return figureLabels.includes(value as FigureLabel);
}

export function figureNumbers(sections: ReadonlyArray<{ blocks: ReadonlyArray<{ nodeId: string; image?: string }> }>): Map<string, { chapter: number; index: number }> {
  const numbers = new Map<string, { chapter: number; index: number }>();
  sections.forEach((section, sectionIndex) => {
    let index = 0;
    for (const block of section.blocks) {
      if (block.image === undefined) continue;
      index += 1;
      numbers.set(block.nodeId, { chapter: sectionIndex + 1, index });
    }
  });
  return numbers;
}
