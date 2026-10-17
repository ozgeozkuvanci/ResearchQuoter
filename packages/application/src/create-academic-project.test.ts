import { describe, expect, it } from "vitest";

import {
  createAcademicProject,
  type IdGenerator,
  type ProjectCreationTransaction,
  type TransactionRunner
} from "./create-academic-project";

function createRecordingTransaction(): { transaction: ProjectCreationTransaction; calls: string[] } {
  const calls: string[] = [];

  return {
    calls,
    transaction: {
      assertWorkspaceOwner: async () => {
        calls.push("authorize");
      },
      createProject: async () => {
        calls.push("project");
      },
      createMainDocument: async () => {
        calls.push("document");
      },
      createBibliographyConfiguration: async () => {
        calls.push("bibliography");
      },
      appendAuditEvent: async () => {
        calls.push("audit");
      }
    }
  };
}

describe("CreateAcademicProject", () => {
  it("creates the project, structured document, bibliography configuration, and audit event in one transaction", async () => {
    const recording = createRecordingTransaction();
    const transactionRunner: TransactionRunner = {
      withinTransaction: async (work) => work(recording.transaction)
    };
    const ids = ["project-id", "document-id", "bibliography-id"];
    const idGenerator: IdGenerator = {
      next: () => {
        const id = ids.shift();
        if (id === undefined) {
          throw new Error("Unexpected ID request.");
        }
        return id;
      }
    };

    await expect(
      createAcademicProject(
        {
          actorId: "user-id",
          workspaceId: "workspace-id",
          projectName: "  Thesis research  ",
          defaultCitationStyleId: "apa-7-style-id",
          initialParagraphNodeId: "initial-paragraph"
        },
        { transactionRunner, idGenerator }
      )
    ).resolves.toEqual({
      projectId: "project-id",
      mainDocumentId: "document-id",
      bibliographyConfigurationId: "bibliography-id"
    });
    expect(recording.calls).toEqual(["authorize", "project", "document", "bibliography", "audit"]);
  });

  it("rejects an empty project name before opening a transaction", async () => {
    const transactionRunner: TransactionRunner = {
      withinTransaction: async () => {
        throw new Error("Transaction should not be opened.");
      }
    };

    await expect(
      createAcademicProject(
        {
          actorId: "user-id",
          workspaceId: "workspace-id",
          projectName: "   ",
          defaultCitationStyleId: "apa-7-style-id",
          initialParagraphNodeId: "initial-paragraph"
        },
        { transactionRunner, idGenerator: { next: () => "unused" } }
      )
    ).rejects.toThrow("Project name is required.");
  });
});
