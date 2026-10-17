import Cite from "citation-js";

import type { CitationProcessorPort } from "./index";

export type SupportedCitationStyleId = "apa-7";

const citationJsTemplateByStyle: Record<SupportedCitationStyleId, string> = {
  "apa-7": "apa"
};

function templateFor(styleId: string): string {
  if (styleId !== "apa-7") {
    throw new Error(`Citation style is not installed: ${styleId}`);
  }

  return citationJsTemplateByStyle[styleId];
}

export class CitationJsProcessor implements CitationProcessorPort {
  async renderBibliography(input: {
    styleId: string;
    references: ReadonlyArray<Record<string, unknown>>;
  }): Promise<ReadonlyArray<string>> {
    const rendered = this.createCite(input.references).format("bibliography", {
      template: templateFor(input.styleId),
      format: "text",
      lang: "en-US"
    });

    return [rendered.trim()];
  }

  async renderCitation(input: {
    styleId: string;
    references: ReadonlyArray<Record<string, unknown>>;
  }): Promise<string> {
    return this.createCite(input.references)
      .format("citation", {
        template: templateFor(input.styleId),
        format: "text",
        lang: "en-US"
      })
      .trim();
  }

  private createCite(references: ReadonlyArray<Record<string, unknown>>): Cite {
    return new Cite([...references]);
  }
}
