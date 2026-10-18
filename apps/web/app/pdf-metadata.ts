// Reads citation details out of a PDF before it is saved: the document properties, the largest
// text on the first page as a title guess, and a DOI. When a DOI is found, Crossref fills in the
// published title, authors and year. Every value is a suggestion the user can still edit.

import { pdfAssetOptions } from "./pdf-options";

export interface PdfDetails {
  title: string;
  authors: string;
  year: string;
  doi: string;
}

interface TextItem {
  str: string;
  transform: number[];
}

const doiPattern = /\b10\.\d{4,9}\/[^\s"<>]+/i;
const junkTitle = /^(untitled|microsoft word|document\d*|\s*)$|\.(docx?|pdf|tex|dvi)$|^microsoft word -/i;
const junkAuthor = /^(anonymous|unknown|admin(istrator)?|user|owner|author|\s*)$/i;

export async function readPdfDetails(file: File): Promise<PdfDetails> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()), ...pdfAssetOptions });
  try {
    const pdf = await task.promise;
    const { info } = await pdf.getMetadata().catch(() => ({ info: {} }));
    const properties = info as { Title?: unknown; Author?: unknown };
    const pages: TextItem[][] = [];
    for (let pageNumber = 1; pageNumber <= Math.min(2, pdf.numPages); pageNumber += 1) {
      const content = await (await pdf.getPage(pageNumber)).getTextContent();
      pages.push(content.items.flatMap((item) => "str" in item ? [{ str: item.str, transform: item.transform as number[] }] : []));
    }
    const firstPageText = (pages[0] ?? []).map((item) => item.str).join(" ");
    const allText = pages.flat().map((item) => item.str).join(" ");

    const metadataTitle = typeof properties.Title === "string" ? properties.Title.trim() : "";
    const author = typeof properties.Author === "string" ? properties.Author.trim() : "";
    const metadataAuthor = junkAuthor.test(author) ? "" : author;
    const doi = allText.match(doiPattern)?.[0].replace(/[.,;)\]]+$/, "") ?? "";
    const details: PdfDetails = {
      title: !junkTitle.test(metadataTitle) && metadataTitle.length > 3 ? metadataTitle : largestText(pages[0] ?? []),
      authors: formatAuthorList(metadataAuthor),
      year: likelyYear(firstPageText),
      doi
    };
    return doi ? { ...details, ...await lookUpDoi(doi) } : details;
  } finally {
    void task.destroy();
  }
}

// Titles are usually set in the biggest type on the first page.
function largestText(items: TextItem[]): string {
  const sized = items.filter((item) => item.str.trim().length > 0).map((item) => ({ text: item.str, size: Math.hypot(item.transform[2] ?? 0, item.transform[3] ?? 0) }));
  const largest = Math.max(0, ...sized.map((item) => item.size));
  if (largest === 0) return "";
  return sized.filter((item) => item.size >= largest - 0.5).map((item) => item.text.trim()).join(" ").replace(/\s+/g, " ").slice(0, 300);
}

function likelyYear(text: string): string {
  const now = new Date().getFullYear();
  const counts = new Map<string, number>();
  for (const match of text.matchAll(/\b(19[5-9]\d|20\d\d)\b/g)) {
    if (Number(match[1]) <= now) counts.set(match[1] ?? "", (counts.get(match[1] ?? "") ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || Number(b[0]) - Number(a[0]))[0]?.[0] ?? "";
}

// "Jane Doe, John Smith" or "Doe, Jane; Smith, John" both become "Doe, Jane; Smith, John".
function formatAuthorList(value: string): string {
  if (value.length === 0) return "";
  if (value.includes(";")) return value.split(";").map((name) => name.trim()).filter(Boolean).join("; ");
  return value.split(/,| and | ve | & /).map((name) => name.trim()).filter(Boolean).map((name) => {
    const parts = name.split(/\s+/);
    return parts.length < 2 ? name : `${parts[parts.length - 1]}, ${parts.slice(0, -1).join(" ")}`;
  }).join("; ");
}

async function lookUpDoi(doi: string): Promise<Partial<PdfDetails>> {
  try {
    const response = await fetch(`https://api.crossref.org/works/${encodeURIComponent(doi)}`, { signal: AbortSignal.timeout(6000) });
    if (!response.ok) return {};
    const { message } = await response.json() as { message?: { title?: string[]; author?: Array<{ family?: string; given?: string; name?: string }>; issued?: { "date-parts"?: number[][] } } };
    const title = message?.title?.[0]?.trim();
    const authors = (message?.author ?? []).map((author) => author.family ? [author.family, author.given].filter(Boolean).join(", ") : author.name ?? "").filter(Boolean).join("; ");
    const year = message?.issued?.["date-parts"]?.[0]?.[0];
    return { ...(title ? { title } : {}), ...(authors ? { authors } : {}), ...(year ? { year: String(year) } : {}) };
  } catch {
    // Offline or not a Crossref DOI: keep what was read from the file.
    return {};
  }
}
