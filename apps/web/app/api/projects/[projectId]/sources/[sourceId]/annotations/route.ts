import { createHash } from "node:crypto";

import { createDatabaseClient } from "@research/db";
import { NextResponse } from "next/server";

import { getDevelopmentProjectContext } from "../../../../../../../lib/development-context";

export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ projectId: string; sourceId: string }> }): Promise<NextResponse> {
  const { projectId, sourceId } = await context.params;
  const body: unknown = await request.json();
  if (!isCaptureRequest(body)) return NextResponse.json({ error: "A quote and a valid page number are required." }, { status: 400 });
  const isNote = body.kind === "note";

  try {
    const developmentContext = await getDevelopmentProjectContext();
    const connectionString = process.env.DATABASE_URL;
    if (connectionString === undefined) throw new Error("DATABASE_URL is required.");
    const database = createDatabaseClient(connectionString);
    try {
      const capture = await database.prisma.$transaction(async (transaction) => {
        const source = await transaction.sourceDocument.findFirst({
          where: { id: sourceId, academicProjectId: projectId, project: { workspaceId: developmentContext.workspaceId, deletedAt: null }, deletedAt: null },
          select: {
            id: true,
            versions: { orderBy: { versionNumber: "desc" }, take: 1, select: { pdfAsset: { select: { id: true, checksum: true } } } }
          }
        });
        const asset = source?.versions[0]?.pdfAsset;
        if (source === null || source === undefined || asset === undefined) throw new Error("Source PDF not found.");
        const annotation = await transaction.annotation.create({
          data: { academicProjectId: projectId, sourceDocumentId: source.id, pdfAssetId: asset.id, type: isNote ? "STICKY_NOTE" : "TEXT_HIGHLIGHT", color: body.color ?? (isNote ? "green" : "yellow") }
        });
        const anchor = await transaction.annotationAnchor.create({
          data: {
            annotationId: annotation.id,
            pdfAssetId: asset.id,
            pdfChecksum: asset.checksum,
            pageIndex: body.pageNumber - 1,
            pageLabel: String(body.pageNumber),
            selectorType: "TEXT",
            rects: [],
            selectedText: body.selectedText.length === 0 ? null : body.selectedText,
            selectedTextHash: body.selectedText.length === 0 ? null : createHash("sha256").update(body.selectedText).digest("hex")
          }
        });
        const note = body.note.length === 0 ? null : await transaction.researchNote.create({ data: { annotationId: annotation.id, content: body.note } });
        await transaction.auditEvent.create({ data: { workspaceId: developmentContext.workspaceId, academicProjectId: projectId, actorId: developmentContext.actorId, eventType: "ANNOTATION_CREATED", targetType: "Annotation", targetId: annotation.id } });
        return { annotationId: annotation.id, anchorId: anchor.id, pageNumber: body.pageNumber, selectedText: body.selectedText, note: note?.content ?? "", color: annotation.color };
      });
      return NextResponse.json(capture, { status: 201 });
    } finally {
      await database.close();
    }
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Quote capture failed." }, { status: 500 });
  }
}

// A quote needs the selected passage; a reading note needs its text and may or may not be about a passage.
function isCaptureRequest(value: unknown): value is { selectedText: string; pageNumber: number; note: string; color?: string; kind?: "note" } {
  if (typeof value !== "object" || value === null || !("pageNumber" in value)) return false;
  const kind = "kind" in value ? value.kind : undefined;
  const selectedText = "selectedText" in value ? value.selectedText : "";
  const pageNumber = value.pageNumber;
  const note = "note" in value ? value.note : "";
  const color = "color" in value ? value.color : undefined;
  if (kind !== undefined && kind !== "note") return false;
  if (typeof selectedText !== "string" || typeof note !== "string") return false;
  const hasContent = kind === "note" ? note.trim().length > 0 : selectedText.trim().length > 0;
  return hasContent && selectedText.length <= 20_000 && typeof pageNumber === "number" && Number.isInteger(pageNumber) && pageNumber > 0 && pageNumber <= 10_000 && note.length <= 20_000 && (color === undefined || typeof color === "string");
}
