import { createHash } from "node:crypto";

import { getInstalledCitationStyle } from "@research/citations";
import { createDatabaseClient } from "@research/db";

const localIssuer = "urn:research-workspace:local-development";
const localSubject = "local-researcher";

export interface DevelopmentProjectContext {
  actorId: string;
  workspaceId: string;
  citationStyleId: string;
}

export interface DevelopmentProjectSummary {
  id: string;
  name: string;
}

function requireDatabaseUrl(): string {
  if (process.env.NODE_ENV === "production" && process.env.RESEARCH_DESKTOP !== "1") {
    throw new Error("Local development identity is disabled in production.");
  }

  const connectionString = process.env.DATABASE_URL;
  if (connectionString === undefined) {
    throw new Error("DATABASE_URL is required.");
  }

  return connectionString;
}

export async function getDevelopmentProjectContext(): Promise<DevelopmentProjectContext> {
  const database = createDatabaseClient(requireDatabaseUrl());

  try {
    const user = await database.prisma.user.upsert({
      where: { oidcIssuer_oidcSubject: { oidcIssuer: localIssuer, oidcSubject: localSubject } },
      update: {},
      create: { oidcIssuer: localIssuer, oidcSubject: localSubject }
    });
    const existingWorkspace = await database.prisma.workspace.findFirst({
      where: { ownerId: user.id, name: "Local research workspace", deletedAt: null },
      select: { id: true }
    });
    const workspaceId = existingWorkspace?.id ?? (await database.prisma.workspace.create({
      data: { ownerId: user.id, name: "Local research workspace" },
      select: { id: true }
    })).id;
    const installedStyle = getInstalledCitationStyle("apa-7");
    const checksum = createHash("sha256").update(installedStyle.cslXml).digest("hex");
    const citationStyle = await database.prisma.citationStyle.upsert({
      where: { styleKey_checksum: { styleKey: installedStyle.styleKey, checksum } },
      update: {},
      create: { styleKey: installedStyle.styleKey, checksum, cslXml: installedStyle.cslXml },
      select: { id: true }
    });

    return { actorId: user.id, workspaceId, citationStyleId: citationStyle.id };
  } finally {
    await database.close();
  }
}

export async function listDevelopmentProjects(): Promise<DevelopmentProjectSummary[]> {
  const context = await getDevelopmentProjectContext();
  const database = createDatabaseClient(requireDatabaseUrl());
  try {
    return database.prisma.academicProject.findMany({
      where: { workspaceId: context.workspaceId, deletedAt: null },
      orderBy: { createdAt: "desc" },
      select: { id: true, name: true }
    });
  } finally {
    await database.close();
  }
}
