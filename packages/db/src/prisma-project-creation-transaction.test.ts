import { config } from "dotenv";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { createAcademicProject } from "@research/application";

import { createDatabaseClient, type DatabaseClient } from "./client";
import { PrismaTransactionRunner } from "./prisma-project-creation-transaction";

config({ path: ".env" });

const testConnectionString = process.env.TEST_DATABASE_URL ?? "";
const databaseIntegration = testConnectionString === "" ? describe.skip : describe;

databaseIntegration("PrismaProjectCreationTransaction", () => {
  let database: DatabaseClient;

  beforeEach(async () => {
    database ??= createDatabaseClient(testConnectionString);
    await database.prisma.$executeRawUnsafe('TRUNCATE TABLE "User", "CitationStyle" CASCADE');
  });

  afterAll(async () => {
    await database?.close();
  });

  it("persists a project, structured document, bibliography configuration, and audit event atomically", async () => {
    const user = await database.prisma.user.create({
      data: { oidcIssuer: "https://issuer.example", oidcSubject: "subject-1" }
    });
    const workspace = await database.prisma.workspace.create({ data: { ownerId: user.id, name: "Research" } });
    const style = await database.prisma.citationStyle.create({
      data: { styleKey: "apa-7", checksum: "a".repeat(64), cslXml: "<style />" }
    });
    const ids = [crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID()];

    const result = await createAcademicProject(
      {
        actorId: user.id,
        workspaceId: workspace.id,
        projectName: "Dissertation",
        defaultCitationStyleId: style.id,
        initialParagraphNodeId: crypto.randomUUID()
      },
      {
        transactionRunner: new PrismaTransactionRunner(database.prisma),
        idGenerator: { next: () => ids.shift() ?? crypto.randomUUID() }
      }
    );

    const project = await database.prisma.academicProject.findUniqueOrThrow({
      where: { id: result.projectId },
      include: { mainDocument: true, bibliographyConfiguration: true, auditEvents: true }
    });

    expect(project.workspaceId).toBe(workspace.id);
    expect(project.mainDocument?.id).toBe(result.mainDocumentId);
    expect(project.mainDocument?.content).toMatchObject({ type: "doc" });
    expect(project.bibliographyConfiguration?.id).toBe(result.bibliographyConfigurationId);
    expect(project.auditEvents).toHaveLength(1);
  });

  it("rolls back all writes when the citation style is invalid", async () => {
    const user = await database.prisma.user.create({
      data: { oidcIssuer: "https://issuer.example", oidcSubject: "subject-2" }
    });
    const workspace = await database.prisma.workspace.create({ data: { ownerId: user.id, name: "Research" } });
    const projectId = crypto.randomUUID();

    await expect(
      createAcademicProject(
        {
          actorId: user.id,
          workspaceId: workspace.id,
          projectName: "Invalid style project",
          defaultCitationStyleId: crypto.randomUUID(),
          initialParagraphNodeId: crypto.randomUUID()
        },
        {
          transactionRunner: new PrismaTransactionRunner(database.prisma),
          idGenerator: {
            next: () => projectId
          }
        }
      )
    ).rejects.toThrow();

    await expect(database.prisma.academicProject.findUnique({ where: { id: projectId } })).resolves.toBeNull();
  });
});
