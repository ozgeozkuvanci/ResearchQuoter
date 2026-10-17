import { describe, expect, it } from "vitest";

import { appendToSection, readSections, replaceSectionText, writeSections } from "./document-sections";

describe("document sections", () => {
  it("reads a document saved before sections as one stable section", () => {
    const legacy = { type: "doc", content: [{ type: "paragraph", attrs: { id: "p1" }, content: [{ type: "text", text: "Intro" }] }] };

    const [first, again] = [readSections(legacy), readSections(legacy)];

    expect(first).toEqual([{ id: "section-p1", title: "Bölüm 1", blocks: [{ nodeId: "p1", text: "Intro" }] }]);
    expect(again[0]?.id).toBe(first[0]?.id);
  });

  it("round-trips sections and keeps paragraph ids when the text is edited", () => {
    const section = { id: "s1", title: "Yöntem", blocks: [{ nodeId: "cited", text: "Cited paraphrase (Doe, 2020, p. 4)" }] };
    const edited = replaceSectionText(section, "Cited paraphrase (Doe, 2020, p. 4)\n\nNew paragraph");

    expect(edited.blocks[0]?.nodeId).toBe("cited");
    expect(edited.blocks).toHaveLength(2);
    expect(readSections(writeSections([edited]))).toEqual([edited]);
  });

  it("appends a cited paragraph to the requested section only", () => {
    const content = writeSections([
      { id: "a", title: "Giriş", blocks: [{ nodeId: "a1", text: "" }] },
      { id: "b", title: "Sonuç", blocks: [] }
    ]);

    const sections = readSections(appendToSection(content, "a", "n1", "Text (Doe, 2020, p. 1)"));

    expect(sections[0]?.blocks).toEqual([{ nodeId: "n1", text: "Text (Doe, 2020, p. 1)" }]);
    expect(sections[1]?.blocks).toEqual([]);
  });
});
