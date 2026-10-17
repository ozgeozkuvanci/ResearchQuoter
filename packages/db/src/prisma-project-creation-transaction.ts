import type {
  ProjectCreationTransaction,
  TransactionRunner
} from "@research/application";

import type { Prisma } from "./generated/client";
import type { PrismaClient } from "./generated/client";

export class PrismaProjectCreationTransaction implements ProjectCreationTransaction {
  constructor(private readonly prisma: Prisma.TransactionClient) {}

  async assertWorkspaceOwner(input: { actorId: string; workspaceId: string }): Promise<void> {
    const workspace = await this.prisma.workspace.findFirst({
      where: { id: input.workspaceId, ownerId: input.actorId, deletedAt: null },
      select: { id: true }
    });

    if (workspace === null) {
      throw new Error("Workspace access denied.");
    }
  }

  async createProject(input: { id: string; workspaceId: string; name: string }): Promise<void> {
    await this.prisma.academicProject.create({
      data: { id: input.id, workspaceId: input.workspaceId, name: input.name }
    });
  }

  async createMainDocument(input: {
    id: string;
    academicProjectId: string;
    schemaVersion: number;
    content: Record<string, unknown>;
  }): Promise<void> {
    await this.prisma.mainDocument.create({
      data: {
        id: input.id,
        academicProjectId: input.academicProjectId,
        schemaVersion: input.schemaVersion,
        content: input.content as Prisma.InputJsonValue
      }
    });
  }

  async createBibliographyConfiguration(input: {
    id: string;
    academicProjectId: string;
    citationStyleId: string;
    locale: string;
    includeMode: "cited_only";
    noteNumberingScope: "chapter";
  }): Promise<void> {
    await this.prisma.bibliographyConfiguration.create({ data: input });
  }

  async appendAuditEvent(input: {
    workspaceId: string;
    academicProjectId: string;
    actorId: string;
    eventType: "PROJECT_CREATED";
    targetType: "AcademicProject";
    targetId: string;
  }): Promise<void> {
    await this.prisma.auditEvent.create({ data: input });
  }
}

export class PrismaTransactionRunner implements TransactionRunner {
  constructor(private readonly prisma: PrismaClient) {}

  async withinTransaction<Result>(
    work: (transaction: ProjectCreationTransaction) => Promise<Result>
  ): Promise<Result> {
    return this.prisma.$transaction(async (transaction) => work(new PrismaProjectCreationTransaction(transaction)));
  }
}
