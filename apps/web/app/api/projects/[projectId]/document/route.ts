import { randomUUID } from "node:crypto";

import { createDatabaseClient, type Prisma } from "@research/db";
import { NextResponse } from "next/server";

import { getDevelopmentProjectContext } from "../../../../../lib/development-context";
import { isImageFileName } from "../../../../../lib/document-images";
import { type EvidenceMarker, readSections, replaceSectionBlocks, replaceSectionText, sectionLinkIds, sectionText, withLegacyMarkers, writeSections } from "../../../../../lib/document-sections";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ projectId: string }> }): Promise<NextResponse> {
  const { projectId } = await context.params;
  return withDocument(projectId, async (document) => {
    const sections = documentSections(document);
    return NextResponse.json({
      text: sections.map(sectionText).join("\n\n"),
      revision: document.revision,
      sections,
      blocks: sections.flatMap((section) => section.blocks),
      evidence: document.provenanceLinks.map((link) => ({
        id: link.id,
        targetNodeId: link.targetDocumentBlock.nodeId,
        sourceDocumentId: link.sourceDocument.id,
        sourceTitle: link.sourceDocument.title,
        pageNumber: link.annotationAnchor.pageIndex + 1,
        selectedText: link.originalSelectedText,
        status: link.status,
        note: link.researchNote?.content ?? ""
      }))
    });
  });
}

// Saves one section: creates it when `sectionId` is absent, otherwise updates its title and/or text.
export async function PUT(request: Request, context: { params: Promise<{ projectId: string }> }): Promise<NextResponse> {
  const { projectId } = await context.params;
  const payload: unknown = await request.json();
  if (!isSectionUpdate(payload)) {
    return NextResponse.json({ error: "A section title or text is required." }, { status: 400 });
  }
  const textLength = payload.text?.length ?? payload.paragraphs?.reduce((total, paragraph) => total + paragraph.text.length, 0) ?? 0;
  if (textLength > 200_000 || (payload.title?.length ?? 0) > 300) {
    return NextResponse.json({ error: "Document text exceeds the local editing limit." }, { status: 400 });
  }
  return withDocument(projectId, async (document, database) => {
    const sections = documentSections(document);
    let section = sections.find((candidate) => candidate.id === payload.sectionId);
    if (payload.sectionId !== undefined && section === undefined) {
      return NextResponse.json({ error: "Section not found." }, { status: 404 });
    }
    section ??= { id: randomUUID(), title: payload.title ?? `Bölüm ${sections.length + 1}`, blocks: [] };
    // Markers for links that no longer exist (pasted after deletion) are dropped.
    const knownLinks = new Set(document.provenanceLinks.map((link) => link.id));
    const paragraphs = payload.paragraphs?.map((paragraph) => ({ ...paragraph, links: paragraph.links?.filter((link) => knownLinks.has(link.linkId)) ?? [] }));
    const edited = paragraphs !== undefined ? replaceSectionBlocks(section, paragraphs) : payload.text !== undefined ? replaceSectionText(section, payload.text) : section;
    const updatedSection = { ...edited, title: payload.title ?? section.title };
    const nextSections = sections.some((candidate) => candidate.id === updatedSection.id)
      ? sections.map((candidate) => candidate.id === updatedSection.id ? updatedSection : candidate)
      : [...sections, updatedSection];
    // A marker deleted from the text deletes its link, unless it moved to another section.
    const kept = new Set(nextSections.flatMap(sectionLinkIds));
    const removedLinkIds = paragraphs === undefined ? [] : sectionLinkIds(section).filter((linkId) => !kept.has(linkId));
    const updated = await database.prisma.$transaction(async (transaction) => {
      if (removedLinkIds.length > 0) await removeLinks(transaction, document.provenanceLinks.filter((link) => removedLinkIds.includes(link.id)));
      return transaction.mainDocument.update({
        where: { id: document.id },
        data: { content: writeSections(nextSections) as Prisma.InputJsonValue, revision: { increment: 1 } },
        select: { revision: true }
      });
    });
    return NextResponse.json({ section: updatedSection, revision: updated.revision, removedLinkIds });
  });
}

// The quote leaves the document's citations and the PDF's highlights along with its marker.
async function removeLinks(transaction: Prisma.TransactionClient, links: ReadonlyArray<{ id: string; annotationId: string; targetDocumentBlock: { id: string } }>): Promise<void> {
  const deletedAt = new Date();
  const blockIds = links.map((link) => link.targetDocumentBlock.id);
  await transaction.provenanceLink.deleteMany({ where: { id: { in: links.map((link) => link.id) } } });
  await transaction.citationUsage.updateMany({ where: { documentBlockId: { in: blockIds }, deletedAt: null }, data: { deletedAt } });
  await transaction.documentBlock.updateMany({ where: { id: { in: blockIds }, deletedAt: null }, data: { deletedAt } });
  await transaction.annotation.updateMany({ where: { id: { in: links.map((link) => link.annotationId) }, deletedAt: null }, data: { deletedAt } });
}

function documentSections(document: { content: unknown; provenanceLinks: ReadonlyArray<{ id: string; targetDocumentBlock: { nodeId: string } }> }) {
  return withLegacyMarkers(readSections(document.content), document.provenanceLinks.map((link) => ({ id: link.id, targetNodeId: link.targetDocumentBlock.nodeId })));
}

export async function DELETE(request: Request, context: { params: Promise<{ projectId: string }> }): Promise<NextResponse> {
  const { projectId } = await context.params;
  const sectionId = new URL(request.url).searchParams.get("sectionId");
  if (sectionId === null) return NextResponse.json({ error: "A section is required." }, { status: 400 });
  return withDocument(projectId, async (document, database) => {
    const sections = documentSections(document);
    if (sections.length <= 1) return NextResponse.json({ error: "A document needs at least one section." }, { status: 400 });
    const removed = sections.find((section) => section.id === sectionId);
    const removedLinkIds = removed === undefined ? [] : sectionLinkIds(removed);
    const updated = await database.prisma.$transaction(async (transaction) => {
      if (removedLinkIds.length > 0) await removeLinks(transaction, document.provenanceLinks.filter((link) => removedLinkIds.includes(link.id)));
      return transaction.mainDocument.update({
        where: { id: document.id },
        data: { content: writeSections(sections.filter((section) => section.id !== sectionId)) as Prisma.InputJsonValue, revision: { increment: 1 } },
        select: { revision: true }
      });
    });
    return NextResponse.json({ revision: updated.revision });
  });
}

async function withDocument(
  projectId: string,
  handler: (document: {
    id: string;
    content: unknown;
    revision: number;
    provenanceLinks: Array<{ id: string; annotationId: string; originalSelectedText: string; status: string; researchNote: { content: string } | null; targetDocumentBlock: { id: string; nodeId: string }; sourceDocument: { id: string; title: string }; annotationAnchor: { pageIndex: number } }>;
  }, database: ReturnType<typeof createDatabaseClient>) => Promise<NextResponse>
): Promise<NextResponse> {
  try {
    const context = await getDevelopmentProjectContext();
    const connectionString = process.env.DATABASE_URL;
    if (connectionString === undefined) throw new Error("DATABASE_URL is required.");
    const database = createDatabaseClient(connectionString);
    try {
      const project = await database.prisma.academicProject.findFirst({
        where: { id: projectId, workspaceId: context.workspaceId, deletedAt: null },
        include: {
          mainDocument: {
            select: {
              id: true,
              content: true,
              revision: true,
              provenanceLinks: {
                orderBy: { createdAt: "desc" },
                select: { id: true, annotationId: true, originalSelectedText: true, status: true, researchNote: { select: { content: true } }, targetDocumentBlock: { select: { id: true, nodeId: true } }, sourceDocument: { select: { id: true, title: true } }, annotationAnchor: { select: { pageIndex: true } } }
              }
            }
          }
        }
      });
      if (project?.mainDocument === null || project === null) return NextResponse.json({ error: "Project not found." }, { status: 404 });
      return await handler(project.mainDocument, database);
    } finally { await database.close(); }
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Document request failed." }, { status: 500 });
  }
}

function isSectionUpdate(value: unknown): value is { sectionId?: string; title?: string; text?: string; paragraphs?: Array<{ nodeId?: string; text: string; links?: EvidenceMarker[]; image?: string }> } {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  const optionalString = (key: string) => record[key] === undefined || typeof record[key] === "string";
  const paragraphsValid = record.paragraphs === undefined || (Array.isArray(record.paragraphs) && record.paragraphs.length <= 5000 && record.paragraphs.every(isParagraph));
  return optionalString("sectionId") && optionalString("title") && optionalString("text") && paragraphsValid
    && (record.title !== undefined || record.text !== undefined || record.paragraphs !== undefined);
}

function isParagraph(value: unknown): boolean {
  if (typeof value !== "object" || value === null) return false;
  const paragraph = value as Record<string, unknown>;
  return typeof paragraph.text === "string"
    && (paragraph.nodeId === undefined || typeof paragraph.nodeId === "string")
    && (paragraph.image === undefined || (typeof paragraph.image === "string" && isImageFileName(paragraph.image)))
    && (paragraph.links === undefined || (Array.isArray(paragraph.links) && paragraph.links.every((link: unknown) =>
      typeof link === "object" && link !== null && typeof (link as Record<string, unknown>).linkId === "string" && typeof (link as Record<string, unknown>).offset === "number")));
}
