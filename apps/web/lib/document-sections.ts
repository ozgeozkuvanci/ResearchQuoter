import { randomUUID } from "node:crypto";

// The main document is stored as `{ type: "doc", content: [section, ...] }`, where every section
// carries its own title and paragraphs. Documents saved before sections existed hold paragraphs
// directly under the root; they are read as a single untitled section.

export interface DocumentParagraph {
  nodeId: string;
  text: string;
}

export interface DocumentSection {
  id: string;
  title: string;
  blocks: DocumentParagraph[];
}

const defaultSectionTitle = "Bölüm 1";

export function readSections(content: unknown): DocumentSection[] {
  const nodes = rootNodes(content);
  const sections: DocumentSection[] = [];
  let looseParagraphs: DocumentParagraph[] = [];
  for (const node of nodes) {
    if (!isRecord(node)) continue;
    if (node.type === "section") {
      const attrs = isRecord(node.attrs) ? node.attrs : {};
      sections.push({
        id: typeof attrs.id === "string" ? attrs.id : randomUUID(),
        title: typeof attrs.title === "string" ? attrs.title : "",
        blocks: Array.isArray(node.content) ? node.content.flatMap(readParagraph) : []
      });
    } else {
      looseParagraphs = [...looseParagraphs, ...readParagraph(node)];
    }
  }
  if (looseParagraphs.length > 0 || sections.length === 0) {
    sections.unshift({ id: legacySectionId(content), title: defaultSectionTitle, blocks: looseParagraphs });
  }
  return sections;
}

export function writeSections(sections: readonly DocumentSection[]): Record<string, unknown> {
  return {
    type: "doc",
    content: sections.map((section) => ({
      type: "section",
      attrs: { id: section.id, title: section.title },
      content: section.blocks.map((block) => ({
        type: "paragraph",
        attrs: { id: block.nodeId },
        ...(block.text.length > 0 ? { content: [{ type: "text", text: block.text }] } : {})
      }))
    }))
  };
}

// Paragraph ids are kept by position so that cited paragraphs keep their provenance links.
export function replaceSectionText(section: DocumentSection, text: string): DocumentSection {
  const paragraphs = text.split(/\n{2,}/);
  return {
    ...section,
    blocks: paragraphs.map((paragraph, index) => ({ nodeId: section.blocks[index]?.nodeId ?? randomUUID(), text: paragraph }))
  };
}

export function appendToSection(content: unknown, sectionId: string | undefined, nodeId: string, text: string): Record<string, unknown> {
  const sections = readSections(content);
  const target = sections.find((section) => section.id === sectionId) ?? sections[sections.length - 1];
  return writeSections(sections.map((section) => section === target
    ? { ...section, blocks: [...section.blocks.filter((block) => block.text.length > 0), { nodeId, text }] }
    : section));
}

export function sectionText(section: DocumentSection): string {
  return section.blocks.map((block) => block.text).join("\n\n");
}

function readParagraph(node: unknown): DocumentParagraph[] {
  if (!isRecord(node) || !isRecord(node.attrs) || typeof node.attrs.id !== "string") return [];
  const text = Array.isArray(node.content)
    ? node.content.map((child) => isRecord(child) && typeof child.text === "string" ? child.text : "").join("")
    : "";
  return [{ nodeId: node.attrs.id, text }];
}

function rootNodes(content: unknown): unknown[] {
  return isRecord(content) && Array.isArray(content.content) ? content.content : [];
}

// A stable id for the implicit first section of an old document, so repeated reads agree on it.
function legacySectionId(content: unknown): string {
  const first = rootNodes(content).find((node) => isRecord(node) && isRecord(node.attrs) && typeof node.attrs.id === "string");
  return isRecord(first) && isRecord(first.attrs) && typeof first.attrs.id === "string" ? `section-${first.attrs.id}` : "section-initial";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
