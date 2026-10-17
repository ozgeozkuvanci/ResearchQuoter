import { readFile } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";

import { createDatabaseClient } from "@research/db";
import { NextResponse } from "next/server";

import { getDevelopmentProjectContext } from "../../../../../../../lib/development-context";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ projectId: string; sourceId: string }> }): Promise<NextResponse> {
  const { projectId, sourceId } = await context.params;
  try {
    const developmentContext = await getDevelopmentProjectContext();
    const connectionString = process.env.DATABASE_URL;
    if (connectionString === undefined) throw new Error("DATABASE_URL is required.");
    const database = createDatabaseClient(connectionString);
    try {
      const source = await database.prisma.sourceDocument.findFirst({
        where: { id: sourceId, academicProjectId: projectId, project: { workspaceId: developmentContext.workspaceId, deletedAt: null }, deletedAt: null },
        select: {
          versions: { orderBy: { versionNumber: "desc" }, take: 1, select: { pdfAsset: { select: { objectKey: true, originalFilename: true, mimeType: true } } } }
        }
      });
      const asset = source?.versions[0]?.pdfAsset;
      if (asset === undefined) return NextResponse.json({ error: "PDF source not found." }, { status: 404 });

      const rootDirectory = resolve(process.env.LOCAL_ASSET_ROOT ?? join(/* turbopackIgnore: true */ process.cwd(), "../../.local-assets"));
      const filePath = resolve(rootDirectory, asset.objectKey);
      const pathFromRoot = relative(rootDirectory, filePath);
      if (pathFromRoot.startsWith("..") || isAbsolute(pathFromRoot)) throw new Error("Invalid PDF object path.");
      const bytes = await readFile(filePath);
      return new NextResponse(bytes, {
        headers: {
          "content-type": asset.mimeType,
          "content-disposition": `inline; filename="${asset.originalFilename.replaceAll('"', "")}"`,
          "cache-control": "private, no-store"
        }
      });
    } finally {
      await database.close();
    }
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "PDF retrieval failed." }, { status: 500 });
  }
}
