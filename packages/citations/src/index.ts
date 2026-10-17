// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="./citation-js.d.ts" />

export interface CitationProcessorPort {
  renderBibliography(input: {
    styleId: string;
    references: ReadonlyArray<Record<string, unknown>>;
  }): Promise<ReadonlyArray<string>>;
}

export * from "./citation-js-processor";
export * from "./installed-styles";
