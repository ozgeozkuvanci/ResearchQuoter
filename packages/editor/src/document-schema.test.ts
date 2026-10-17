import { describe, expect, it } from "vitest";

import {
  assertStableBlockIds,
  deserializeDocument,
  researchDocumentSchema,
  serializeDocument
} from "./document-schema";

describe("research document schema", () => {
  it("preserves semantic node IDs through ProseMirror serialization", () => {
    const citation = researchDocumentSchema.node("citation", { id: "citation-node", citationUsageId: "usage-1" });
    const quotation = researchDocumentSchema.node(
      "quotation",
      { id: "quotation-node" },
      [researchDocumentSchema.text("Primary evidence "), citation]
    );
    const document = researchDocumentSchema.node("doc", undefined, [quotation]);

    const restored = deserializeDocument(serializeDocument(document));

    expect(restored.toJSON()).toEqual(document.toJSON());
    expect(restored.firstChild?.attrs.id).toBe("quotation-node");
  });

  it("rejects source-relevant blocks without IDs", () => {
    const document = researchDocumentSchema.node("doc", undefined, [researchDocumentSchema.node("paragraph")]);

    expect(() => assertStableBlockIds(document)).toThrow("Node paragraph requires a stable id.");
  });

  it("rejects duplicate stable block IDs", () => {
    const document = researchDocumentSchema.node("doc", undefined, [
      researchDocumentSchema.node("paragraph", { id: "same-id" }),
      researchDocumentSchema.node("quotation", { id: "same-id" })
    ]);

    expect(() => assertStableBlockIds(document)).toThrow("Duplicate stable block id: same-id");
  });
});
