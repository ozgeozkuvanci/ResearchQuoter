import { CitationJsProcessor } from "@research/citations";
import { createDatabaseClient } from "@research/db";
import { Document, Packer, Paragraph } from "docx";
import { NextResponse } from "next/server";

import { getDevelopmentProjectContext } from "../../../../../lib/development-context";
import { type DocumentSection, readSections } from "../../../../../lib/document-sections";

export const runtime = "nodejs";

interface ExportContent {
  sections: DocumentSection[];
  bibliography: string[];
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
    const document = new Document({
      sections: [{
        children: [
          ...content.sections.flatMap((section) => [
            ...(section.title.length === 0 ? [] : [new Paragraph({ text: section.title, heading: "Heading1" })]),
            ...section.blocks.filter((block) => block.text.trim().length > 0).map((block) => new Paragraph(block.text))
          ]),
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
    return { sections: readSections(project.mainDocument.content), bibliography };
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
    ...section.blocks.filter((block) => block.text.trim().length > 0).map((block) => escapeLatex(block.text))
  ].join("\n\n")).join("\n\n");
  const bibliography = content.bibliography.length === 0 ? "" : `\n\n\\section*{Bibliography}\n${content.bibliography.map((entry) => `\\noindent ${escapeLatex(entry)}\\par`).join("\n")}`;
  return `\\documentclass{article}\n\\usepackage[utf8]{inputenc}\n\\begin{document}\n${body}${bibliography}\n\\end{document}\n`;
}

function escapeLatex(value: string): string {
  return value.replaceAll("\\", "\\textbackslash{}").replaceAll("&", "\\&").replaceAll("%", "\\%").replaceAll("$", "\\$").replaceAll("#", "\\#").replaceAll("_", "\\_").replaceAll("{", "\\{").replaceAll("}", "\\}").replaceAll("~", "\\textasciitilde{}").replaceAll("^", "\\textasciicircum{}");
}
