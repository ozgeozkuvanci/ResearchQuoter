import { randomUUID } from "node:crypto";

import { createDatabaseClient, type Prisma } from "@research/db";
import { NextResponse } from "next/server";

import { getDevelopmentProjectContext } from "../../../../../lib/development-context";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ projectId: string }> }): Promise<NextResponse> {
  const { projectId } = await context.params;
  return withDocument(projectId, async (document) => NextResponse.json({
    text: extractText(document.content),
    revision: document.revision,
    blocks: extractBlocks(document.content),
    evidence: document.provenanceLinks.map((link) => ({
      id: link.id,
      targetNodeId: link.targetDocumentBlock.nodeId,
      sourceDocumentId: link.sourceDocument.id,
      sourceTitle: link.sourceDocument.title,
      pageNumber: link.annotationAnchor.pageIndex + 1,
      selectedText: link.originalSelectedText
    }))
  }));
}

export async function PUT(request: Request, context: { params: Promise<{ projectId: string }> }): Promise<NextResponse> {
  const { projectId } = await context.params;
  const payload: unknown = await request.json();
  if (typeof payload !== "object" || payload === null || !("text" in payload) || typeof payload.text !== "string") {
    return NextResponse.json({ error: "Document text is required." }, { status: 400 });
  }
  const text = payload.text;
  if (text.length > 200_000) {
    return NextResponse.json({ error: "Document text exceeds the local editing limit." }, { status: 400 });
  }
  return withDocument(projectId, async (document, database) => {
    const content = buildDocumentContent(document.content, text);
    const updated = await database.prisma.mainDocument.update({
      where: { id: document.id },
      data: { content: content as Prisma.InputJsonValue, revision: { increment: 1 } },
      select: { revision: true }
    });
    return NextResponse.json({ text, revision: updated.revision });
  });
}

async function withDocument(
  projectId: string,
  handler: (document: {
    id: string;
    content: unknown;
    revision: number;
    provenanceLinks: Array<{ id: string; originalSelectedText: string; targetDocumentBlock: { nodeId: string }; sourceDocument: { id: string; title: string }; annotationAnchor: { pageIndex: number } }>;
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
                select: { id: true, originalSelectedText: true, targetDocumentBlock: { select: { nodeId: true } }, sourceDocument: { select: { id: true, title: true } }, annotationAnchor: { select: { pageIndex: true } } }
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

function extractText(content: unknown): string {
  return extractBlocks(content).map((block) => block.text).join("\n\n");
}

function extractBlocks(content: unknown): Array<{ nodeId: string; text: string }> {
  if (typeof content !== "object" || content === null || !("content" in content) || !Array.isArray(content.content)) return [];
  return (content.content as unknown[]).flatMap((block) => {
    if (typeof block !== "object" || block === null || !("attrs" in block) || typeof block.attrs !== "object" || block.attrs === null || !("id" in block.attrs) || typeof block.attrs.id !== "string") return [];
    const text = "content" in block && Array.isArray(block.content)
      ? block.content.map((node) => typeof node === "object" && node !== null && "text" in node && typeof node.text === "string" ? node.text : "").join("")
      : "";
    return [{ nodeId: block.attrs.id, text }];
  });
}

function buildDocumentContent(previousContent: unknown, text: string): Record<string, unknown> {
  const existingBlocks = extractBlocks(previousContent);
  const paragraphs = text.split(/\n{2,}/);
  return {
    type: "doc",
    content: paragraphs.map((paragraph, index) => ({
      type: "paragraph",
      attrs: { id: existingBlocks[index]?.nodeId ?? randomUUID() },
      ...(paragraph.length > 0 ? { content: [{ type: "text", text: paragraph }] } : {})
    }))
  };
}
