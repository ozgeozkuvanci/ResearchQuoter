import { randomUUID } from "node:crypto";

import { createDatabaseClient, type Prisma } from "@research/db";
import { NextResponse } from "next/server";

import { getDevelopmentProjectContext } from "../../../../../lib/development-context";
import { readSections, replaceSectionText, sectionText, writeSections } from "../../../../../lib/document-sections";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ projectId: string }> }): Promise<NextResponse> {
  const { projectId } = await context.params;
  return withDocument(projectId, async (document) => {
    const sections = readSections(document.content);
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
  if ((payload.text?.length ?? 0) > 200_000 || (payload.title?.length ?? 0) > 300) {
    return NextResponse.json({ error: "Document text exceeds the local editing limit." }, { status: 400 });
  }
  return withDocument(projectId, async (document, database) => {
    const sections = readSections(document.content);
    let section = sections.find((candidate) => candidate.id === payload.sectionId);
    if (payload.sectionId !== undefined && section === undefined) {
      return NextResponse.json({ error: "Section not found." }, { status: 404 });
    }
    section ??= { id: randomUUID(), title: payload.title ?? `Bölüm ${sections.length + 1}`, blocks: [] };
    const updatedSection = {
      ...(payload.text === undefined ? section : replaceSectionText(section, payload.text)),
      title: payload.title ?? section.title
    };
    const nextSections = sections.some((candidate) => candidate.id === updatedSection.id)
      ? sections.map((candidate) => candidate.id === updatedSection.id ? updatedSection : candidate)
      : [...sections, updatedSection];
    const updated = await database.prisma.mainDocument.update({
      where: { id: document.id },
      data: { content: writeSections(nextSections) as Prisma.InputJsonValue, revision: { increment: 1 } },
      select: { revision: true }
    });
    return NextResponse.json({ section: updatedSection, revision: updated.revision });
  });
}

export async function DELETE(request: Request, context: { params: Promise<{ projectId: string }> }): Promise<NextResponse> {
  const { projectId } = await context.params;
  const sectionId = new URL(request.url).searchParams.get("sectionId");
  if (sectionId === null) return NextResponse.json({ error: "A section is required." }, { status: 400 });
  return withDocument(projectId, async (document, database) => {
    const sections = readSections(document.content);
    if (sections.length <= 1) return NextResponse.json({ error: "A document needs at least one section." }, { status: 400 });
    const updated = await database.prisma.mainDocument.update({
      where: { id: document.id },
      data: { content: writeSections(sections.filter((section) => section.id !== sectionId)) as Prisma.InputJsonValue, revision: { increment: 1 } },
      select: { revision: true }
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
    provenanceLinks: Array<{ id: string; originalSelectedText: string; status: string; researchNote: { content: string } | null; targetDocumentBlock: { nodeId: string }; sourceDocument: { id: string; title: string }; annotationAnchor: { pageIndex: number } }>;
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
                select: { id: true, originalSelectedText: true, status: true, researchNote: { select: { content: true } }, targetDocumentBlock: { select: { nodeId: true } }, sourceDocument: { select: { id: true, title: true } }, annotationAnchor: { select: { pageIndex: true } } }
              }
            }
          }
        }
      });
      if (project?.mainDocument === null || project === null) return NextResponse.json({ error: "Project not found." }, { status: 404 });
      return handler(project.mainDocument, database);
    } finally { await database.close(); }
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Document request failed." }, { status: 500 });
  }
}

function isSectionUpdate(value: unknown): value is { sectionId?: string; title?: string; text?: string } {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  const optionalString = (key: string) => record[key] === undefined || typeof record[key] === "string";
  return optionalString("sectionId") && optionalString("title") && optionalString("text") && (record.title !== undefined || record.text !== undefined);
}
