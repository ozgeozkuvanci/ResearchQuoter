import { randomUUID } from "node:crypto";

import { createAcademicProject } from "@research/application";
import { createProjectRequestSchema } from "@research/contracts";
import { createDatabaseClient, PrismaTransactionRunner } from "@research/db";
import { NextResponse } from "next/server";

import { getDevelopmentProjectContext, listDevelopmentProjects } from "../../../lib/development-context";

export const runtime = "nodejs";

export async function GET(): Promise<NextResponse> {
  try {
    return NextResponse.json(await listDevelopmentProjects());
  } catch (error) {
    const message = error instanceof Error ? error.message : "Project listing failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  const parsed = createProjectRequestSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Project name is required." }, { status: 400 });
  }

  try {
    const context = await getDevelopmentProjectContext();
    const connectionString = process.env.DATABASE_URL;
    if (connectionString === undefined) {
      throw new Error("DATABASE_URL is required.");
    }
    const database = createDatabaseClient(connectionString);

    try {
      const result = await createAcademicProject(
        {
          actorId: context.actorId,
          workspaceId: context.workspaceId,
          projectName: parsed.data.name,
          defaultCitationStyleId: context.citationStyleId,
          initialParagraphNodeId: randomUUID()
        },
        { transactionRunner: new PrismaTransactionRunner(database.prisma), idGenerator: { next: randomUUID } }
      );

      return NextResponse.json(result, { status: 201 });
    } finally {
      await database.close();
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Project creation failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
