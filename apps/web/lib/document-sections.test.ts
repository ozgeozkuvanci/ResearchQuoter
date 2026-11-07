import { describe, expect, it } from "vitest";

import { appendToSection, readSections, replaceSectionBlocks, replaceSectionText, sectionLinkIds, withLegacyMarkers, writeSections } from "./document-sections";

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

  it("keeps a marker where it was put inside edited text", () => {
    const content = appendToSection(writeSections([{ id: "a", title: "Giriş", blocks: [] }]), "a", "n1", "“Quote” (Doe, 2020, p. 1)", "link-1");
    const section = readSections(content)[0] ?? { id: "missing", title: "", blocks: [] };
    expect(section.blocks[0]?.links).toEqual([{ linkId: "link-1", offset: 25 }]);

    const edited = replaceSectionBlocks(section, [{ nodeId: "n1", text: "Edited “Quote” (Doe, 2020, p. 1) and more", links: [{ linkId: "link-1", offset: 32 }] }]);
    expect(readSections(writeSections([edited]))[0]?.blocks).toEqual([{ nodeId: "n1", text: "Edited “Quote” (Doe, 2020, p. 1) and more", links: [{ linkId: "link-1", offset: 32 }] }]);
  });

  it("gives split paragraphs new ids and keeps one marker per link", () => {
    const section = { id: "a", title: "", blocks: [] };
    const edited = replaceSectionBlocks(section, [
      { nodeId: "n1", text: "First half", links: [{ linkId: "l1", offset: 99 }] },
      { nodeId: "n1", text: "Second half", links: [{ linkId: "l1", offset: 3 }] }
    ]);

    expect(edited.blocks[0]).toEqual({ nodeId: "n1", text: "First half", links: [{ linkId: "l1", offset: 10 }] });
    expect(edited.blocks[1]?.nodeId).not.toBe("n1");
    expect(edited.blocks[1]?.links).toBeUndefined();
    expect(sectionLinkIds(edited)).toEqual(["l1"]);
  });

  it("adds markers for links saved before markers existed", () => {
    const sections = [{ id: "a", title: "", blocks: [{ nodeId: "n1", text: "Old cited text" }, { nodeId: "n2", text: "x", links: [{ linkId: "new", offset: 1 }] }] }];

    const result = withLegacyMarkers(sections, [{ id: "old", targetNodeId: "n1" }, { id: "new", targetNodeId: "n2" }]);

    expect(result[0]?.blocks[0]?.links).toEqual([{ linkId: "old", offset: 14 }]);
    expect(result[0]?.blocks[1]?.links).toEqual([{ linkId: "new", offset: 1 }]);
  });

  it("keeps pictures with their captions through editing, appending and saving", () => {
    const image = `${"a".repeat(64)}.png`;
    const section = { id: "a", title: "", blocks: [] };
    const edited = replaceSectionBlocks(section, [{ nodeId: "n1", text: "Text" }, { text: "", image }, { nodeId: "f2", text: "Şekil 1", image, links: [{ linkId: "x", offset: 0 }] }]);
    const content = appendToSection(writeSections([edited]), "a", "n3", "Added");
    const blocks = readSections(content)[0]?.blocks ?? [];

    expect(blocks.map((block) => block.image)).toEqual([undefined, image, image, undefined]);
    expect(blocks[2]).toEqual({ nodeId: "f2", text: "Şekil 1", image });
  });
});
