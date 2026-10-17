import Cite from "citation-js";

export interface InstalledCitationStyle {
  styleKey: "apa-7";
  cslXml: string;
}

export function getInstalledCitationStyle(styleKey: "apa-7"): InstalledCitationStyle {
  const cslXml = Cite.plugins.config.get("@csl").styles.data.apa;
  if (cslXml === undefined) {
    throw new Error("Citation.js APA style template is unavailable.");
  }

  return { styleKey, cslXml };
}
