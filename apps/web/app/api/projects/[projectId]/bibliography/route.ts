import { CitationJsProcessor } from "@research/citations";
import { createDatabaseClient } from "@research/db";
import { NextResponse } from "next/server";

import { getDevelopmentProjectContext } from "../../../../../lib/development-context";

export const runtime = "nodejs";

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
          bibliographyConfiguration: { select: { citationStyle: { select: { styleKey: true } } } },
          mainDocument: { select: { citations: { where: { deletedAt: null }, select: { reference: { select: { id: true, cslData: true } } } } } }
        }
      });
      if (project === null || project.bibliographyConfiguration === null || project.mainDocument === null) return NextResponse.json({ error: "Project bibliography not found." }, { status: 404 });
      const references = uniqueReferences(project.mainDocument.citations.map((citation) => citation.reference));
      if (references.length === 0) return NextResponse.json({ entries: [] });
      const entries = await new CitationJsProcessor().renderBibliography({ styleId: project.bibliographyConfiguration.citationStyle.styleKey, references });
      return NextResponse.json({ entries });
    } finally {
      await database.close();
    }
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Bibliography rendering failed." }, { status: 500 });
  }
}

function uniqueReferences(references: ReadonlyArray<{ id: string; cslData: unknown }>): Record<string, unknown>[] {
  const seen = new Set<string>();
  return references.flatMap((reference) => {
    if (seen.has(reference.id)) return [];
    seen.add(reference.id);
    if (typeof reference.cslData !== "object" || reference.cslData === null || Array.isArray(reference.cslData)) return [];
    return [reference.cslData as Record<string, unknown>];
  });
}
