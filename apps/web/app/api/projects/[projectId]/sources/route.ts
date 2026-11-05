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
                select: { id: true, type: true, color: true, createdAt: true, anchors: { select: { id: true, pageIndex: true, selectedText: true } }, researchNotes: { where: { deletedAt: null }, select: { content: true } } }
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
        captures: source.annotations.filter((annotation) => annotation.type !== "STICKY_NOTE").flatMap((annotation) => annotation.anchors.map((anchor) => ({
          annotationId: annotation.id,
          anchorId: anchor.id,
          pageNumber: anchor.pageIndex + 1,
          selectedText: anchor.selectedText ?? "",
          color: annotation.color,
          note: annotation.researchNotes[0]?.content ?? ""
        }))),
        // Reading notes: what the reader wrote on a page, with the passage it is about when one was selected.
        notes: source.annotations.filter((annotation) => annotation.type === "STICKY_NOTE").flatMap((annotation) => annotation.anchors.slice(0, 1).map((anchor) => ({
          id: annotation.id,
          pageNumber: anchor.pageIndex + 1,
          selectedText: anchor.selectedText ?? "",
          content: annotation.researchNotes[0]?.content ?? "",
          createdAt: annotation.createdAt.toISOString()
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
  const doiField = formData.get("doi");
  const doi = typeof doiField === "string" && /^10\.\d{4,9}\/\S+$/.test(doiField.trim()) ? doiField.trim() : undefined;
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
        const authors = parseAuthors(typeof author === "string" ? author : "");
        const reference = await transaction.reference.create({
          data: {
            workspaceId: developmentContext.workspaceId,
            status: "CONFIRMED",
            title: title.trim(),
            cslData: { id: crypto.randomUUID(), type: "article-journal", title: title.trim(), author: authors.map((name) => name.family === undefined ? { literal: name.literal } : { family: name.family, given: name.given }), issued: year ? { "date-parts": [[Number(year)]] } : undefined, ...(doi === undefined ? {} : { DOI: doi }) }
          }
        });
        for (const [position, name] of authors.entries()) {
          await transaction.contributor.create({
            data: name.family === undefined
              ? { referenceId: reference.id, role: "author", position, literalName: name.literal }
              : { referenceId: reference.id, role: "author", position, familyName: name.family, givenName: name.given }
          });
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

// "Soyad, Ad; Soyad, Ad" becomes structured names so APA cites only the family name.
// A name without a comma (for example an institution) stays a literal name.
function parseAuthors(value: string): Array<{ family?: string; given: string; literal: string }> {
  return value.split(";").map((name) => name.trim()).filter((name) => name.length > 0).map((name) => {
    const [family, ...given] = name.split(",");
    return given.length === 0 || family === undefined
      ? { given: "", literal: name }
      : { family: family.trim(), given: given.join(",").trim(), literal: name };
  });
}
