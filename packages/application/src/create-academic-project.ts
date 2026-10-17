export interface CreateAcademicProjectInput {
  actorId: string;
  workspaceId: string;
  projectName: string;
  defaultCitationStyleId: string;
  initialParagraphNodeId: string;
}

export interface CreateAcademicProjectResult {
  projectId: string;
  mainDocumentId: string;
  bibliographyConfigurationId: string;
}

export interface ProjectCreationTransaction {
  assertWorkspaceOwner(input: { actorId: string; workspaceId: string }): Promise<void>;
  createProject(input: { id: string; workspaceId: string; name: string }): Promise<void>;
  createMainDocument(input: {
    id: string;
    academicProjectId: string;
    schemaVersion: number;
    content: Record<string, unknown>;
  }): Promise<void>;
  createBibliographyConfiguration(input: {
    id: string;
    academicProjectId: string;
    citationStyleId: string;
    locale: string;
    includeMode: "cited_only";
    noteNumberingScope: "chapter";
  }): Promise<void>;
  appendAuditEvent(input: {
    workspaceId: string;
    academicProjectId: string;
    actorId: string;
    eventType: "PROJECT_CREATED";
    targetType: "AcademicProject";
    targetId: string;
  }): Promise<void>;
}

export interface TransactionRunner {
  withinTransaction<Result>(work: (transaction: ProjectCreationTransaction) => Promise<Result>): Promise<Result>;
}

export interface IdGenerator {
  next(): string;
}

function createInitialDocumentContent(paragraphNodeId: string): Record<string, unknown> {
  return {
    type: "doc",
    content: [
      {
        type: "paragraph",
        attrs: { id: paragraphNodeId }
      }
    ]
  };
}

export async function createAcademicProject(
  input: CreateAcademicProjectInput,
  dependencies: { transactionRunner: TransactionRunner; idGenerator: IdGenerator }
): Promise<CreateAcademicProjectResult> {
  if (input.projectName.trim().length === 0) {
    throw new Error("Project name is required.");
  }

  return dependencies.transactionRunner.withinTransaction(async (transaction) => {
    await transaction.assertWorkspaceOwner({ actorId: input.actorId, workspaceId: input.workspaceId });

    const projectId = dependencies.idGenerator.next();
    const mainDocumentId = dependencies.idGenerator.next();
    const bibliographyConfigurationId = dependencies.idGenerator.next();

    await transaction.createProject({ id: projectId, workspaceId: input.workspaceId, name: input.projectName.trim() });
    await transaction.createMainDocument({
      id: mainDocumentId,
      academicProjectId: projectId,
      schemaVersion: 1,
      content: createInitialDocumentContent(input.initialParagraphNodeId)
    });
    await transaction.createBibliographyConfiguration({
      id: bibliographyConfigurationId,
      academicProjectId: projectId,
      citationStyleId: input.defaultCitationStyleId,
      locale: "en-US",
      includeMode: "cited_only",
      noteNumberingScope: "chapter"
    });
    await transaction.appendAuditEvent({
      workspaceId: input.workspaceId,
      academicProjectId: projectId,
      actorId: input.actorId,
      eventType: "PROJECT_CREATED",
      targetType: "AcademicProject",
      targetId: projectId
    });

    return { projectId, mainDocumentId, bibliographyConfigurationId };
  });
}
