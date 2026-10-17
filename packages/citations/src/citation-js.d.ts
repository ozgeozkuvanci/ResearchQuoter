declare module "citation-js" {
  export interface CitationJsFormatOptions {
    template: string;
    format: "text" | "html";
    lang: string;
  }

  export default class Cite {
    static plugins: {
      config: {
        get(pluginName: "@csl"): {
          styles: {
            data: Record<string, string>;
          };
        };
      };
    };

    constructor(input: ReadonlyArray<Record<string, unknown>>);

    format(kind: "bibliography" | "citation", options: CitationJsFormatOptions): string;
  }
}
