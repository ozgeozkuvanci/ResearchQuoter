import { join } from "node:path";

import { createDatabaseClient } from "@research/db";
import { LocalPdfStorage } from "@research/storage";
import { NextResponse } from "next/server";

import { getDevelopmentProjectContext } from "../../../../../lib/development-context";

export const runtime = "nodejs";

const maxPdfBytes = 100 * 1024 * 1024;

export async function GET(_request: Request, context: { params: Promise<{ projectId: string }> }): Promise<NextResponse> {
  const { projectId } = await context.params;
  try {
    const developmentContext = await getDevelopmentProjectContext();
    const connectionString = process.env.DATABASE_URL;
    if (connectionString === undefined) throw new Error("DATABASE_URL is required.");
    const database = createDatabaseClient(connectionString);
    try {
      const project = await database.prisma.academicProject.findFirst({
        where: { id: projectId, workspaceId: developmentContext.workspaceId, deletedAt: null },
        select: {
          sourceDocuments: {
            where: { deletedAt: null },
            orderBy: { createdAt: "desc" },
            select: {
              id: true,
              title: true,
              reference: { select: { id: true, title: true, contributors: { orderBy: { position: "asc" }, select: { literalName: true, familyName: true } } } },
              versions: { orderBy: { versionNumber: "desc" }, take: 1, select: { pdfAsset: { select: { originalFilename: true, byteSize: true } } } },
              annotations: {
                where: { deletedAt: null },
                orderBy: { createdAt: "desc" },
                select: { id: true, color: true, anchors: { select: { id: true, pageIndex: true, selectedText: true } }, researchNotes: { where: { deletedAt: null }, select: { content: true } } }
              }
            }
          }
        }
      });
      if (project === null) return NextResponse.json({ error: "Project not found." }, { status: 404 });
      return NextResponse.json(project.sourceDocuments.map((source) => ({
        id: source.id,
        title: source.title,
        referenceTitle: source.reference?.title ?? source.title,
        author: source.reference?.contributors[0]?.literalName ?? source.reference?.contributors[0]?.familyName ?? null,
        filename: source.versions[0]?.pdfAsset.originalFilename ?? null,
        byteSize: source.versions[0]?.pdfAsset.byteSize.toString() ?? null,
        pdfUrl: `/api/projects/${projectId}/sources/${source.id}/pdf`,
        captures: source.annotations.flatMap((annotation) => annotation.anchors.map((anchor) => ({
          annotationId: annotation.id,
          anchorId: anchor.id,
          pageNumber: anchor.pageIndex + 1,
          selectedText: anchor.selectedText ?? "",
          color: annotation.color,
          note: annotation.researchNotes[0]?.content ?? ""
        })))
      })));
    } finally {
      await database.close();
    }
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Source listing failed." }, { status: 500 });
  }
}

export async function POST(request: Request, context: { params: Promise<{ projectId: string }> }): Promise<NextResponse> {
  const { projectId } = await context.params;
  const formData = await request.formData();
  const title = formData.get("title");
  const author = formData.get("author");
  const year = formData.get("year");
  const uploadedFile = formData.get("file");
  if (typeof title !== "string" || title.trim().length === 0 || !(uploadedFile instanceof File)) {
    return NextResponse.json({ error: "A reference title and PDF file are required." }, { status: 400 });
  }

  try {
    const developmentContext = await getDevelopmentProjectContext();
    const connectionString = process.env.DATABASE_URL;
    if (connectionString === undefined) {
      throw new Error("DATABASE_URL is required.");
    }
    const storage = new LocalPdfStorage(process.env.LOCAL_ASSET_ROOT ?? join(process.cwd(), "../../.local-assets"));
    const storedAsset = await storage.putImmutablePdf({ bytes: new Uint8Array(await uploadedFile.arrayBuffer()), maxBytes: maxPdfBytes });
    const database = createDatabaseClient(connectionString);
    try {
      const source = await database.prisma.$transaction(async (transaction) => {
        const project = await transaction.academicProject.findFirst({
          where: { id: projectId, workspaceId: developmentContext.workspaceId, deletedAt: null },
          select: { id: true }
        });
        if (project === null) {
          throw new Error("Project access denied.");
        }
        const reference = await transaction.reference.create({
          data: {
            workspaceId: developmentContext.workspaceId,
            status: "CONFIRMED",
            title: title.trim(),
            cslData: { id: crypto.randomUUID(), type: "article-journal", title: title.trim(), author: author ? [{ literal: String(author) }] : [], issued: year ? { "date-parts": [[Number(year)]] } : undefined }
          }
        });
        if (typeof author === "string" && author.trim().length > 0) {
          await transaction.contributor.create({ data: { referenceId: reference.id, role: "author", position: 0, literalName: author.trim() } });
        }
        const asset = await transaction.pdfAsset.upsert({
          where: { workspaceId_checksum: { workspaceId: developmentContext.workspaceId, checksum: storedAsset.checksum } },
          update: {},
          create: { workspaceId: developmentContext.workspaceId, objectKey: storedAsset.objectKey, checksum: storedAsset.checksum, byteSize: storedAsset.byteSize, mimeType: storedAsset.mimeType, originalFilename: uploadedFile.name, status: "AVAILABLE", verifiedAt: new Date() }
        });
        const sourceDocument = await transaction.sourceDocument.create({ data: { academicProjectId: project.id, referenceId: reference.id, title: title.trim() } });
        await transaction.sourceDocumentVersion.create({ data: { sourceDocumentId: sourceDocument.id, pdfAssetId: asset.id, versionNumber: 1 } });
        await transaction.auditEvent.create({ data: { workspaceId: developmentContext.workspaceId, academicProjectId: project.id, actorId: developmentContext.actorId, eventType: "PDF_REGISTERED", targetType: "SourceDocument", targetId: sourceDocument.id } });
        return { sourceDocumentId: sourceDocument.id, pdfAssetId: asset.id, referenceId: reference.id, checksum: asset.checksum };
      });
      return NextResponse.json(source, { status: 201 });
    } finally { await database.close(); }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Source upload failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
