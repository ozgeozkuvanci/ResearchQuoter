import { createDatabaseClient, type Prisma } from "@research/db";
import { NextResponse } from "next/server";

import { getDevelopmentProjectContext } from "../../../../../../../../lib/development-context";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ projectId: string; sourceId: string; annotationId: string }> };

// Changes the text of a reading note.
export async function PATCH(request: Request, context: RouteContext): Promise<NextResponse> {
  const body: unknown = await request.json().catch(() => undefined);
  const content = typeof body === "object" && body !== null && "note" in body && typeof body.note === "string" ? body.note.trim() : "";
  if (content.length === 0 || content.length > 20_000) return NextResponse.json({ error: "A note must contain between 1 and 20,000 characters." }, { status: 400 });
  return withReadingNote(context, async (transaction, annotationId) => {
    const existing = await transaction.researchNote.findFirst({ where: { annotationId, deletedAt: null }, orderBy: { createdAt: "asc" }, select: { id: true } });
    if (existing === null) await transaction.researchNote.create({ data: { annotationId, content } });
    else await transaction.researchNote.update({ where: { id: existing.id }, data: { content, revision: { increment: 1 } } });
    await transaction.annotation.update({ where: { id: annotationId }, data: { revision: { increment: 1 } } });
    return { id: annotationId, content };
  });
}

// Removes a reading note. Quotes are not removed here: they go away with their marker in the text.
export async function DELETE(_request: Request, context: RouteContext): Promise<NextResponse> {
  return withReadingNote(context, async (transaction, annotationId) => {
    const deletedAt = new Date();
    await transaction.researchNote.updateMany({ where: { annotationId, deletedAt: null }, data: { deletedAt } });
    await transaction.annotation.update({ where: { id: annotationId }, data: { deletedAt } });
    return { id: annotationId };
  });
}

async function withReadingNote(context: RouteContext, handler: (transaction: Prisma.TransactionClient, annotationId: string) => Promise<object>): Promise<NextResponse> {
  const { projectId, sourceId, annotationId } = await context.params;
  try {
    const developmentContext = await getDevelopmentProjectContext();
    const connectionString = process.env.DATABASE_URL;
    if (connectionString === undefined) throw new Error("DATABASE_URL is required.");
    const database = createDatabaseClient(connectionString);
    try {
      const result = await database.prisma.$transaction(async (transaction) => {
        const annotation = await transaction.annotation.findFirst({
          where: { id: annotationId, sourceDocumentId: sourceId, academicProjectId: projectId, type: "STICKY_NOTE", deletedAt: null, project: { workspaceId: developmentContext.workspaceId, deletedAt: null } },
          select: { id: true }
        });
        if (annotation === null) return null;
        return await handler(transaction, annotation.id);
      });
      return result === null ? NextResponse.json({ error: "Note not found." }, { status: 404 }) : NextResponse.json(result);
    } finally {
      await database.close();
    }
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Note update failed." }, { status: 500 });
  }
}
