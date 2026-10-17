import { Schema, type Node as ProseMirrorNode } from "@tiptap/pm/model";

const stableNodeIdAttribute = { default: null };

export const stableBlockNodeNames = new Set([
  "chapter",
  "heading",
  "paragraph",
  "quotation",
  "researchNoteBlock",
  "figure",
  "bibliographyPlaceholder"
]);

export const researchDocumentSchema = new Schema({
  nodes: {
    doc: { content: "block+" },
    chapter: { group: "block", content: "block+", attrs: { id: stableNodeIdAttribute } },
    heading: { group: "block", content: "inline*", attrs: { id: stableNodeIdAttribute, level: { default: 1 } } },
    paragraph: { group: "block", content: "inline*", attrs: { id: stableNodeIdAttribute } },
    quotation: { group: "block", content: "inline*", attrs: { id: stableNodeIdAttribute } },
    researchNoteBlock: { group: "block", content: "inline*", attrs: { id: stableNodeIdAttribute } },
    figure: { group: "block", atom: true, attrs: { id: stableNodeIdAttribute, figureId: { default: null } } },
    bibliographyPlaceholder: { group: "block", atom: true, attrs: { id: stableNodeIdAttribute } },
    text: { group: "inline" },
    citation: {
      group: "inline",
      inline: true,
      atom: true,
      attrs: { id: stableNodeIdAttribute, citationUsageId: { default: null } }
    },
    footnote: { group: "inline", inline: true, atom: true, attrs: { id: stableNodeIdAttribute } },
    endnote: { group: "inline", inline: true, atom: true, attrs: { id: stableNodeIdAttribute } },
    crossReference: { group: "inline", inline: true, atom: true, attrs: { id: stableNodeIdAttribute } }
  },
  marks: {}
});

export function assertStableBlockIds(document: ProseMirrorNode): void {
  const observed = new Set<string>();

  document.descendants((node) => {
    if (!stableBlockNodeNames.has(node.type.name)) {
      return;
    }

    const id = node.attrs.id;
    if (typeof id !== "string" || id.length === 0) {
      throw new Error(`Node ${node.type.name} requires a stable id.`);
    }

    if (observed.has(id)) {
      throw new Error(`Duplicate stable block id: ${id}`);
    }

    observed.add(id);
  });
}

export function serializeDocument(document: ProseMirrorNode): string {
  assertStableBlockIds(document);
  return JSON.stringify(document.toJSON());
}

export function deserializeDocument(serialized: string): ProseMirrorNode {
  const parsed: unknown = JSON.parse(serialized);
  const document = researchDocumentSchema.nodeFromJSON(parsed);
  assertStableBlockIds(document);
  return document;
}
