import { describe, expect, it } from "vitest";

import { CitationJsProcessor } from "./citation-js-processor";

const articleReference = {
  id: "doe2024",
  type: "article-journal",
  title: "Provenance in Academic Writing",
  author: [{ family: "Doe", given: "Jane" }],
  issued: { "date-parts": [[2024]] },
  "container-title": "Journal of Research Systems",
  volume: "12",
  issue: "3",
  page: "45-60",
  DOI: "10.1000/example"
};

describe("Citation.js processor adapter", () => {
  it("renders a reviewed APA 7 bibliography fixture", async () => {
    const processor = new CitationJsProcessor();

    await expect(
      processor.renderBibliography({ styleId: "apa-7", references: [articleReference] })
    ).resolves.toEqual([
      "Doe, J. (2024). Provenance in Academic Writing. Journal of Research Systems, 12(3), 45–60. https://doi.org/10.1000/example"
    ]);
  });

  it("renders an APA 7 in-text citation from the same canonical CSL record", async () => {
    const processor = new CitationJsProcessor();

    await expect(processor.renderCitation({ styleId: "apa-7", references: [articleReference] })).resolves.toBe(
      "(Doe, 2024)"
    );
  });
});
