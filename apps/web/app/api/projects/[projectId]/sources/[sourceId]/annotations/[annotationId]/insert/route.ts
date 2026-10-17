import { createHash, randomUUID } from "node:crypto";

import { CitationJsProcessor } from "@research/citations";
import { createDatabaseClient, type Prisma } from "@research/db";
import { NextResponse } from "next/server";

import { getDevelopmentProjectContext } from "../../../../../../../../../lib/development-context";

export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ projectId: string; sourceId: string; annotationId: string }> }): Promise<NextResponse> {
  const { projectId, sourceId, annotationId } = await context.params;
  const paraphrase = readParaphrase(await request.json().catch(() => undefined));
  if (paraphrase === null) return NextResponse.json({ error: "A paraphrase must contain between 1 and 20,000 characters." }, { status: 400 });
  try {
    const developmentContext = await getDevelopmentProjectContext();
    const connectionString = process.env.DATABASE_URL;
    if (connectionString === undefined) throw new Error("DATABASE_URL is required.");
    const database = createDatabaseClient(connectionString);
    try {
      const source = await database.prisma.sourceDocument.findFirst({
        where: { id: sourceId, academicProjectId: projectId, project: { workspaceId: developmentContext.workspaceId, deletedAt: null }, deletedAt: null },
        select: {
          reference: { select: { id: true, cslData: true } },
          versions: { orderBy: { versionNumber: "desc" }, take: 1, select: { pdfAsset: { select: { id: true, checksum: true } } } },
          annotations: { where: { id: annotationId, deletedAt: null }, select: { id: true, anchors: { orderBy: { createdAt: "asc" }, take: 1, select: { id: true, pageIndex: true, selectedText: true } }, researchNotes: { where: { deletedAt: null }, take: 1, select: { id: true } } } }
        }
      });
      const annotation = source?.annotations[0];
      const anchor = annotation?.anchors[0];
      const asset = source?.versions[0]?.pdfAsset;
      if (source?.reference === null || source?.reference === undefined || annotation === undefined || anchor === undefined || asset === undefined || anchor.selectedText === null) {
        return NextResponse.json({ error: "The selected quote is no longer available." }, { status: 404 });
      }

      const citation = await new CitationJsProcessor().renderCitation({ styleId: "apa-7", references: [asCslReference(source.reference.cslData)] });
      const referenceId = source.reference.id;
      const selectedText = anchor.selectedText;
      const citationWithPage = addPageLocator(citation, anchor.pageIndex + 1);
      const insertedText = paraphrase === undefined ? `“${selectedText}” ${citationWithPage}` : `${paraphrase} ${citationWithPage}`;
      const insertedTextHash = sha256(insertedText);
      const nodeId = randomUUID();
      const result = await database.prisma.$transaction(async (transaction) => {
        const project = await transaction.academicProject.findFirst({
          where: { id: projectId, workspaceId: developmentContext.workspaceId, deletedAt: null },
          select: { mainDocument: { select: { id: true, content: true } } }
        });
        if (project?.mainDocument === null || project === null) throw new Error("Main document not found.");
        const content = appendParagraph(project.mainDocument.content, nodeId, insertedText);
        const block = await transaction.documentBlock.create({
          data: { academicProjectId: projectId, mainDocumentId: project.mainDocument.id, nodeId, blockType: "paragraph", contentHash: insertedTextHash }
        });
        await transaction.mainDocument.update({
          where: { id: project.mainDocument.id },
          data: { content: content as Prisma.InputJsonValue, revision: { increment: 1 } }
        });
        await transaction.citationUsage.create({
          data: { mainDocumentId: project.mainDocument.id, documentBlockId: block.id, referenceId, nodeId, locatorLabel: "page", locatorValue: String(anchor.pageIndex + 1) }
        });
        const provenance = await transaction.provenanceLink.create({
          data: {
            academicProjectId: projectId,
            mainDocumentId: project.mainDocument.id,
            targetDocumentBlockId: block.id,
            referenceId,
            sourceDocumentId: sourceId,
            pdfAssetId: asset.id,
            pdfChecksum: asset.checksum,
            annotationId,
            annotationAnchorId: anchor.id,
            researchNoteId: annotation.researchNotes[0]?.id ?? null,
            originalSelectedText: selectedText,
            insertedTextHash,
            targetContentHashAtLink: insertedTextHash,
            status: paraphrase === undefined ? "VERBATIM" : "PARAPHRASE"
          }
        });
        await transaction.auditEvent.create({ data: { workspaceId: developmentContext.workspaceId, academicProjectId: projectId, actorId: developmentContext.actorId, eventType: "PROVENANCE_CREATED", targetType: "ProvenanceLink", targetId: provenance.id } });
        return { provenanceId: provenance.id, insertedText };
      });
      return NextResponse.json(result, { status: 201 });
    } finally {
      await database.close();
    }
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Document insertion failed." }, { status: 500 });
  }
}

function readParaphrase(value: unknown): string | undefined | null {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "object" || !("paraphrase" in value)) return undefined;
  if (typeof value.paraphrase !== "string") return null;
  const paraphrase = value.paraphrase.trim();
  return paraphrase.length > 0 && paraphrase.length <= 20_000 ? paraphrase : null;
}

function asCslReference(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("The source has invalid citation metadata.");
  return value as Record<string, unknown>;
}

function addPageLocator(citation: string, pageNumber: number): string {
  return citation.endsWith(")") ? `${citation.slice(0, -1)}, p. ${pageNumber})` : `${citation}, p. ${pageNumber}`;
}

function appendParagraph(content: unknown, nodeId: string, text: string): Record<string, unknown> {
  const current = typeof content === "object" && content !== null && "type" in content && content.type === "doc" && "content" in content && Array.isArray(content.content)
    ? content.content
    : [];
  return { type: "doc", content: [...current, { type: "paragraph", attrs: { id: nodeId }, content: [{ type: "text", text }] }] };
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
