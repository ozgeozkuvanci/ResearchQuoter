import { randomUUID } from "node:crypto";

// The main document is stored as `{ type: "doc", content: [section, ...] }`, where every section
// carries its own title and paragraphs. Documents saved before sections existed hold paragraphs
// directly under the root; they are read as a single untitled section.
//
// A paragraph's content is text nodes with `evidenceMarker` nodes between them. A marker stands for
// one provenance link: it travels with the surrounding text when that text is edited, and deleting
// the marker deletes the link.
//
// A picture is a `figure` block in the same list: its `image` attribute names the stored picture
// file and its text is the caption.

export interface EvidenceMarker {
  linkId: string;
  // Character position in the paragraph text where the marker sits.
  offset: number;
}

export interface DocumentParagraph {
  nodeId: string;
  text: string;
  links?: EvidenceMarker[];
  // Present on picture blocks: the stored picture's file name. The text is then its caption.
  image?: string;
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
      content: section.blocks.map((block) => {
        if (block.image !== undefined) {
          return { type: "figure", attrs: { id: block.nodeId, image: block.image }, ...(block.text.length > 0 ? { content: [{ type: "text", text: block.text }] } : {}) };
        }
        const inline = paragraphContent(block);
        return { type: "paragraph", attrs: { id: block.nodeId }, ...(inline.length > 0 ? { content: inline } : {}) };
      })
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

// Replaces a section's paragraphs with what the editor sent. Paragraph ids the editor duplicated
// (splitting a paragraph copies its id) or left out get fresh ones, and each link keeps only its
// first marker.
export function replaceSectionBlocks(section: DocumentSection, paragraphs: ReadonlyArray<{ nodeId?: string; text: string; links?: readonly EvidenceMarker[]; image?: string }>): DocumentSection {
  const seenNodes = new Set<string>();
  const seenLinks = new Set<string>();
  return {
    ...section,
    blocks: paragraphs.map((paragraph) => {
      const nodeId = paragraph.nodeId !== undefined && !seenNodes.has(paragraph.nodeId) ? paragraph.nodeId : randomUUID();
      seenNodes.add(nodeId);
      if (paragraph.image !== undefined) return { nodeId, text: paragraph.text, image: paragraph.image };
      const links = (paragraph.links ?? []).filter((link) => !seenLinks.has(link.linkId)).map((link) => {
        seenLinks.add(link.linkId);
        return { linkId: link.linkId, offset: Math.max(0, Math.min(paragraph.text.length, link.offset)) };
      });
      return { nodeId, text: paragraph.text, ...(links.length > 0 ? { links } : {}) };
    })
  };
}

export function appendToSection(content: unknown, sectionId: string | undefined, nodeId: string, text: string, linkId?: string): Record<string, unknown> {
  const sections = readSections(content);
  const target = sections.find((section) => section.id === sectionId) ?? sections[sections.length - 1];
  const block: DocumentParagraph = { nodeId, text, ...(linkId === undefined ? {} : { links: [{ linkId, offset: text.length }] }) };
  return writeSections(sections.map((section) => section === target
    ? { ...section, blocks: [...section.blocks.filter((existing) => existing.text.length > 0 || (existing.links?.length ?? 0) > 0 || existing.image !== undefined), block] }
    : section));
}

export function sectionLinkIds(section: DocumentSection): string[] {
  return section.blocks.flatMap((block) => (block.links ?? []).map((link) => link.linkId));
}

// Links made before markers existed are only tied to their paragraph id; they get a marker at the
// end of that paragraph so the editor shows them like any other.
export function withLegacyMarkers(sections: DocumentSection[], links: ReadonlyArray<{ id: string; targetNodeId: string }>): DocumentSection[] {
  const marked = new Set(sections.flatMap(sectionLinkIds));
  const legacy = links.filter((link) => !marked.has(link.id));
  if (legacy.length === 0) return sections;
  return sections.map((section) => ({
    ...section,
    blocks: section.blocks.map((block) => {
      const added = legacy.filter((link) => link.targetNodeId === block.nodeId).map((link) => ({ linkId: link.id, offset: block.text.length }));
      return added.length === 0 ? block : { ...block, links: [...(block.links ?? []), ...added] };
    })
  }));
}

export function sectionText(section: DocumentSection): string {
  return section.blocks.map((block) => block.text).join("\n\n");
}

function readParagraph(node: unknown): DocumentParagraph[] {
  if (!isRecord(node) || !isRecord(node.attrs) || typeof node.attrs.id !== "string") return [];
  if (node.type === "figure") {
    if (typeof node.attrs.image !== "string") return [];
    const caption = (Array.isArray(node.content) ? node.content : []).map((child) => isRecord(child) && typeof child.text === "string" ? child.text : "").join("");
    return [{ nodeId: node.attrs.id, text: caption, image: node.attrs.image }];
  }
  let text = "";
  const links: EvidenceMarker[] = [];
  for (const child of Array.isArray(node.content) ? node.content : []) {
    if (!isRecord(child)) continue;
    if (child.type === "evidenceMarker" && isRecord(child.attrs) && typeof child.attrs.linkId === "string") {
      links.push({ linkId: child.attrs.linkId, offset: text.length });
    } else if (typeof child.text === "string") {
      text += child.text;
    }
  }
  return [{ nodeId: node.attrs.id, text, ...(links.length > 0 ? { links } : {}) }];
}

function paragraphContent(block: DocumentParagraph): Array<Record<string, unknown>> {
  const nodes: Array<Record<string, unknown>> = [];
  let position = 0;
  for (const link of [...(block.links ?? [])].sort((a, b) => a.offset - b.offset)) {
    if (link.offset > position) nodes.push({ type: "text", text: block.text.slice(position, link.offset) });
    nodes.push({ type: "evidenceMarker", attrs: { linkId: link.linkId } });
    position = Math.max(position, link.offset);
  }
  if (position < block.text.length) nodes.push({ type: "text", text: block.text.slice(position) });
  return nodes;
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
