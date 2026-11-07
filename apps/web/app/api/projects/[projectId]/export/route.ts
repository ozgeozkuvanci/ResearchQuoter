import { CitationJsProcessor } from "@research/citations";
import { createDatabaseClient } from "@research/db";
import { AlignmentType, Document, ImageRun, Packer, Paragraph, SimpleField, TextRun } from "docx";
import { NextResponse } from "next/server";

import { getDevelopmentProjectContext } from "../../../../../lib/development-context";
import { readAppSettings } from "../../../../../lib/app-settings";
import { readImage, readImageInfo } from "../../../../../lib/document-images";
import { type FigureLabel, figureNumbers, isFigureLabel } from "../../../../../lib/figure-numbers";
import { type DocumentParagraph, type DocumentSection, readSections } from "../../../../../lib/document-sections";

export const runtime = "nodejs";

interface ExportContent {
  sections: DocumentSection[];
  bibliography: string[];
  figureLabel: FigureLabel;
}

interface FigureCaption {
  label: FigureLabel;
  chapter: number;
  index: number;
}

export async function GET(request: Request, context: { params: Promise<{ projectId: string }> }): Promise<NextResponse> {
  const { projectId } = await context.params;
  const format = new URL(request.url).searchParams.get("format");
  if (format !== "docx" && format !== "latex") return NextResponse.json({ error: "Choose docx or latex export." }, { status: 400 });
  try {
    const content = await loadExportContent(projectId);
    if (format === "latex") {
      return new NextResponse(renderLatex(content), {
        headers: { "content-type": "application/x-latex; charset=utf-8", "content-disposition": "attachment; filename=research-document.tex" }
      });
    }
    const numbers = figureNumbers(content.sections);
    const sectionParagraphs = await Promise.all(content.sections.map(async (section) => [
      ...(section.title.length === 0 ? [] : [new Paragraph({ text: section.title, heading: "Heading1" })]),
      ...(await Promise.all(section.blocks.map((block) => {
        const number = numbers.get(block.nodeId);
        return docxBlock(block, number === undefined ? undefined : { label: content.figureLabel, ...number });
      }))).flat()
    ]));
    const document = new Document({
      // Word's own caption style, so captions show as "Resim Yazısı" and feed a table of figures.
      styles: {
        paragraphStyles: [{
          id: "Caption",
          name: "caption",
          basedOn: "Normal",
          next: "Normal",
          quickFormat: true,
          paragraph: { spacing: { before: 60, after: 240 } },
          run: { italics: true, size: 18, color: "44546A" }
        }]
      },
      sections: [{
        children: [
          ...sectionParagraphs.flat(),
          ...(content.bibliography.length === 0 ? [] : [new Paragraph({ text: "Bibliography", heading: "Heading1" }), ...content.bibliography.map((entry) => new Paragraph(entry))])
        ]
      }]
    });
    const bytes = await Packer.toBuffer(document);
    const body = new Uint8Array(bytes.byteLength);
    body.set(bytes);
    return new NextResponse(body, {
      headers: { "content-type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "content-disposition": "attachment; filename=research-document.docx" }
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Export failed." }, { status: 500 });
  }
}

// Word page width is about 6.3 inches between margins; larger pictures are scaled down to fit.
const maxPictureWidth = 600;

async function docxBlock(block: DocumentParagraph, figure: FigureCaption | undefined): Promise<Paragraph[]> {
  if (block.image === undefined) return block.text.trim().length === 0 ? [] : [new Paragraph(block.text)];
  const caption = figure === undefined ? [] : [captionParagraph(block.text.trim(), figure)];
  const bytes = await readImage(block.image);
  const info = bytes === null ? null : readImageInfo(bytes);
  if (bytes === null || info === null || info.format === "webp") {
    return [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "[Resim Word'e aktarılamadı]", italics: true })] }), ...caption];
  }
  const scale = Math.min(1, maxPictureWidth / info.width);
  return [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      keepNext: true,
      children: [new ImageRun({ type: info.format, data: bytes, transformation: { width: Math.round(info.width * scale), height: Math.round(info.height * scale) }, altText: { name: "Resim", description: block.text, title: block.text } })]
    }),
    ...caption
  ];
}

// "Şekil 1.2. Caption", where 2 is a Word SEQ field that restarts in each section, so Word keeps
// renumbering pictures that are added later and can list them in a table of figures.
function captionParagraph(text: string, { label, chapter, index }: FigureCaption): Paragraph {
  return new Paragraph({
    style: "Caption",
    alignment: AlignmentType.CENTER,
    children: [
      new TextRun(`${label} ${chapter}.`),
      new SimpleField(`SEQ ${label} \\* ARABIC${index === 1 ? " \\r 1" : ""}`, String(index)),
      new TextRun(text.length === 0 ? "." : `. ${text}`)
    ]
  });
}

async function loadExportContent(projectId: string): Promise<ExportContent> {
  const developmentContext = await getDevelopmentProjectContext();
  const connectionString = process.env.DATABASE_URL;
  if (connectionString === undefined) throw new Error("DATABASE_URL is required.");
  const database = createDatabaseClient(connectionString);
  try {
    const project = await database.prisma.academicProject.findFirst({
      where: { id: projectId, workspaceId: developmentContext.workspaceId, deletedAt: null },
      select: {
        bibliographyConfiguration: { select: { citationStyle: { select: { styleKey: true } } } },
        mainDocument: {
          select: {
            content: true,
            citations: { where: { deletedAt: null }, select: { reference: { select: { id: true, cslData: true } } } }
          }
        }
      }
    });
    if (project === null || project.mainDocument === null || project.bibliographyConfiguration === null) throw new Error("Project export data not found.");
    const references = uniqueReferences(project.mainDocument.citations.map((citation) => citation.reference));
    const bibliography = references.length === 0 ? [] : [...await new CitationJsProcessor().renderBibliography({ styleId: project.bibliographyConfiguration.citationStyle.styleKey, references })];
    const figureLabel = (await readAppSettings()).figureLabel;
    return { sections: readSections(project.mainDocument.content), bibliography, figureLabel: isFigureLabel(figureLabel) ? figureLabel : "Şekil" };
  } finally {
    await database.close();
  }
}

function uniqueReferences(references: ReadonlyArray<{ id: string; cslData: unknown }>): Record<string, unknown>[] {
  const seen = new Set<string>();
  return references.flatMap((reference) => {
    if (seen.has(reference.id) || typeof reference.cslData !== "object" || reference.cslData === null || Array.isArray(reference.cslData)) return [];
    seen.add(reference.id);
    return [reference.cslData as Record<string, unknown>];
  });
}

function renderLatex(content: ExportContent): string {
  const body = content.sections.map((section) => [
    ...(section.title.length === 0 ? [] : [`\\section{${escapeLatex(section.title)}}`]),
    ...section.blocks.filter((block) => block.image !== undefined || block.text.trim().length > 0).map((block) => block.image === undefined
      ? escapeLatex(block.text)
      // Pictures are referenced from an images folder beside the .tex file.
      : `\\begin{figure}[h]\n\\centering\n\\includegraphics[width=\\linewidth]{images/${block.image}}\n\\caption{${escapeLatex(block.text.trim())}}\n\\end{figure}`)
  ].join("\n\n")).join("\n\n");
  const bibliography = content.bibliography.length === 0 ? "" : `\n\n\\section*{Bibliography}\n${content.bibliography.map((entry) => `\\noindent ${escapeLatex(entry)}\\par`).join("\n")}`;
  return `\\documentclass{article}\n\\usepackage[utf8]{inputenc}\n\\usepackage{graphicx}\n\\counterwithin{figure}{section}\n${content.figureLabel === "Şekil" ? "\\renewcommand{\\figurename}{Şekil}\n" : ""}\\begin{document}\n${body}${bibliography}\n\\end{document}\n`;
}

function escapeLatex(value: string): string {
  return value.replaceAll("\\", "\\textbackslash{}").replaceAll("&", "\\&").replaceAll("%", "\\%").replaceAll("$", "\\$").replaceAll("#", "\\#").replaceAll("_", "\\_").replaceAll("{", "\\{").replaceAll("}", "\\}").replaceAll("~", "\\textasciitilde{}").replaceAll("^", "\\textasciicircum{}");
}
