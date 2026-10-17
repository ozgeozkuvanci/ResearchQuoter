-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "PdfAssetStatus" AS ENUM ('STAGING', 'AVAILABLE', 'QUARANTINED', 'DELETED');

-- CreateEnum
CREATE TYPE "AnnotationType" AS ENUM ('TEXT_HIGHLIGHT', 'STICKY_NOTE', 'REGION');

-- CreateEnum
CREATE TYPE "AnnotationSelectorType" AS ENUM ('TEXT', 'REGION', 'OCR_TEXT');

-- CreateEnum
CREATE TYPE "ProvenanceStatus" AS ENUM ('VERBATIM', 'NORMALIZED', 'TARGET_MODIFIED', 'PARAPHRASE', 'SOURCE_ARCHIVED', 'UNRESOLVED');

-- CreateEnum
CREATE TYPE "ReferenceStatus" AS ENUM ('DRAFT', 'CONFIRMED', 'MERGED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "AuditEventType" AS ENUM ('PROJECT_CREATED', 'PDF_REGISTERED', 'REFERENCE_CONFIRMED', 'ANNOTATION_CREATED', 'PROVENANCE_CREATED', 'DOCUMENT_RESTORED');

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "oidcIssuer" TEXT NOT NULL,
    "oidcSubject" TEXT NOT NULL,
    "email" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Workspace" (
    "id" UUID NOT NULL,
    "ownerId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Workspace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AcademicProject" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "serverRevision" BIGINT NOT NULL DEFAULT 0,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "AcademicProject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MainDocument" (
    "id" UUID NOT NULL,
    "academicProjectId" UUID NOT NULL,
    "schemaVersion" INTEGER NOT NULL DEFAULT 1,
    "content" JSONB NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MainDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentVersion" (
    "id" UUID NOT NULL,
    "mainDocumentId" UUID NOT NULL,
    "parentVersionId" UUID,
    "schemaVersion" INTEGER NOT NULL,
    "content" JSONB NOT NULL,
    "contentChecksum" TEXT NOT NULL,
    "provenanceHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Section" (
    "id" UUID NOT NULL,
    "mainDocumentId" UUID NOT NULL,
    "parentSectionId" UUID,
    "nodeId" TEXT NOT NULL,
    "heading" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Section_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentBlock" (
    "id" UUID NOT NULL,
    "academicProjectId" UUID NOT NULL,
    "mainDocumentId" UUID NOT NULL,
    "sectionId" UUID,
    "nodeId" TEXT NOT NULL,
    "blockType" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "DocumentBlock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Reference" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "status" "ReferenceStatus" NOT NULL DEFAULT 'DRAFT',
    "cslData" JSONB NOT NULL,
    "title" TEXT,
    "doi" TEXT,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Reference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Contributor" (
    "id" UUID NOT NULL,
    "referenceId" UUID NOT NULL,
    "role" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "familyName" TEXT,
    "givenName" TEXT,
    "literalName" TEXT,

    CONSTRAINT "Contributor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PdfAsset" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "objectKey" TEXT NOT NULL,
    "checksum" TEXT NOT NULL,
    "byteSize" BIGINT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "originalFilename" TEXT NOT NULL,
    "status" "PdfAssetStatus" NOT NULL DEFAULT 'STAGING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verifiedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "PdfAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SourceDocument" (
    "id" UUID NOT NULL,
    "academicProjectId" UUID NOT NULL,
    "referenceId" UUID,
    "title" TEXT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "SourceDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SourceDocumentVersion" (
    "id" UUID NOT NULL,
    "sourceDocumentId" UUID NOT NULL,
    "pdfAssetId" UUID NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SourceDocumentVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Annotation" (
    "id" UUID NOT NULL,
    "academicProjectId" UUID NOT NULL,
    "sourceDocumentId" UUID NOT NULL,
    "pdfAssetId" UUID NOT NULL,
    "type" "AnnotationType" NOT NULL,
    "color" TEXT,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Annotation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnnotationAnchor" (
    "id" UUID NOT NULL,
    "annotationId" UUID NOT NULL,
    "pdfAssetId" UUID NOT NULL,
    "pdfChecksum" TEXT NOT NULL,
    "pageIndex" INTEGER NOT NULL,
    "pageLabel" TEXT,
    "selectorType" "AnnotationSelectorType" NOT NULL,
    "rects" JSONB NOT NULL,
    "selectedText" TEXT,
    "selectedTextHash" TEXT,
    "prefixText" TEXT,
    "suffixText" TEXT,
    "pageTextFingerprint" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnnotationAnchor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResearchNote" (
    "id" UUID NOT NULL,
    "annotationId" UUID NOT NULL,
    "content" TEXT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "ResearchNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CitationStyle" (
    "id" UUID NOT NULL,
    "styleKey" TEXT NOT NULL,
    "checksum" TEXT NOT NULL,
    "cslXml" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CitationStyle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BibliographyConfiguration" (
    "id" UUID NOT NULL,
    "academicProjectId" UUID NOT NULL,
    "citationStyleId" UUID NOT NULL,
    "locale" TEXT NOT NULL DEFAULT 'en-US',
    "includeMode" TEXT NOT NULL DEFAULT 'cited_only',
    "noteNumberingScope" TEXT NOT NULL DEFAULT 'chapter',
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BibliographyConfiguration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CitationUsage" (
    "id" UUID NOT NULL,
    "mainDocumentId" UUID NOT NULL,
    "documentBlockId" UUID NOT NULL,
    "referenceId" UUID NOT NULL,
    "nodeId" TEXT NOT NULL,
    "locatorLabel" TEXT,
    "locatorValue" TEXT,
    "prefix" TEXT,
    "suffix" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "CitationUsage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProvenanceLink" (
    "id" UUID NOT NULL,
    "academicProjectId" UUID NOT NULL,
    "mainDocumentId" UUID NOT NULL,
    "targetDocumentBlockId" UUID NOT NULL,
    "referenceId" UUID NOT NULL,
    "sourceDocumentId" UUID NOT NULL,
    "pdfAssetId" UUID NOT NULL,
    "pdfChecksum" TEXT NOT NULL,
    "annotationId" UUID NOT NULL,
    "annotationAnchorId" UUID NOT NULL,
    "researchNoteId" UUID,
    "originalSelectedText" TEXT NOT NULL,
    "insertedTextHash" TEXT NOT NULL,
    "targetContentHashAtLink" TEXT NOT NULL,
    "status" "ProvenanceStatus" NOT NULL DEFAULT 'VERBATIM',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProvenanceLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "academicProjectId" UUID,
    "actorId" UUID,
    "eventType" "AuditEventType" NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "User_email_idx" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_oidcIssuer_oidcSubject_key" ON "User"("oidcIssuer", "oidcSubject");

-- CreateIndex
CREATE INDEX "Workspace_ownerId_deletedAt_idx" ON "Workspace"("ownerId", "deletedAt");

-- CreateIndex
CREATE INDEX "AcademicProject_workspaceId_deletedAt_idx" ON "AcademicProject"("workspaceId", "deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "MainDocument_academicProjectId_key" ON "MainDocument"("academicProjectId");

-- CreateIndex
CREATE INDEX "DocumentVersion_mainDocumentId_createdAt_idx" ON "DocumentVersion"("mainDocumentId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Section_mainDocumentId_nodeId_key" ON "Section"("mainDocumentId", "nodeId");

-- CreateIndex
CREATE UNIQUE INDEX "Section_mainDocumentId_parentSectionId_sortOrder_key" ON "Section"("mainDocumentId", "parentSectionId", "sortOrder");

-- CreateIndex
CREATE INDEX "DocumentBlock_academicProjectId_deletedAt_idx" ON "DocumentBlock"("academicProjectId", "deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentBlock_mainDocumentId_nodeId_key" ON "DocumentBlock"("mainDocumentId", "nodeId");

-- CreateIndex
CREATE INDEX "Reference_workspaceId_deletedAt_idx" ON "Reference"("workspaceId", "deletedAt");

-- CreateIndex
CREATE INDEX "Reference_workspaceId_doi_idx" ON "Reference"("workspaceId", "doi");

-- CreateIndex
CREATE UNIQUE INDEX "Contributor_referenceId_role_position_key" ON "Contributor"("referenceId", "role", "position");

-- CreateIndex
CREATE UNIQUE INDEX "PdfAsset_objectKey_key" ON "PdfAsset"("objectKey");

-- CreateIndex
CREATE UNIQUE INDEX "PdfAsset_workspaceId_checksum_key" ON "PdfAsset"("workspaceId", "checksum");

-- CreateIndex
CREATE INDEX "SourceDocument_academicProjectId_deletedAt_idx" ON "SourceDocument"("academicProjectId", "deletedAt");

-- CreateIndex
CREATE INDEX "SourceDocument_referenceId_idx" ON "SourceDocument"("referenceId");

-- CreateIndex
CREATE UNIQUE INDEX "SourceDocumentVersion_sourceDocumentId_versionNumber_key" ON "SourceDocumentVersion"("sourceDocumentId", "versionNumber");

-- CreateIndex
CREATE UNIQUE INDEX "SourceDocumentVersion_sourceDocumentId_pdfAssetId_key" ON "SourceDocumentVersion"("sourceDocumentId", "pdfAssetId");

-- CreateIndex
CREATE INDEX "Annotation_academicProjectId_deletedAt_idx" ON "Annotation"("academicProjectId", "deletedAt");

-- CreateIndex
CREATE INDEX "Annotation_sourceDocumentId_pdfAssetId_idx" ON "Annotation"("sourceDocumentId", "pdfAssetId");

-- CreateIndex
CREATE INDEX "AnnotationAnchor_annotationId_pageIndex_idx" ON "AnnotationAnchor"("annotationId", "pageIndex");

-- CreateIndex
CREATE UNIQUE INDEX "CitationStyle_styleKey_checksum_key" ON "CitationStyle"("styleKey", "checksum");

-- CreateIndex
CREATE UNIQUE INDEX "BibliographyConfiguration_academicProjectId_key" ON "BibliographyConfiguration"("academicProjectId");

-- CreateIndex
CREATE INDEX "CitationUsage_documentBlockId_deletedAt_idx" ON "CitationUsage"("documentBlockId", "deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "CitationUsage_mainDocumentId_nodeId_key" ON "CitationUsage"("mainDocumentId", "nodeId");

-- CreateIndex
CREATE INDEX "ProvenanceLink_academicProjectId_targetDocumentBlockId_idx" ON "ProvenanceLink"("academicProjectId", "targetDocumentBlockId");

-- CreateIndex
CREATE INDEX "ProvenanceLink_annotationAnchorId_idx" ON "ProvenanceLink"("annotationAnchorId");

-- CreateIndex
CREATE INDEX "AuditEvent_workspaceId_createdAt_idx" ON "AuditEvent"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditEvent_academicProjectId_createdAt_idx" ON "AuditEvent"("academicProjectId", "createdAt");

-- AddForeignKey
ALTER TABLE "Workspace" ADD CONSTRAINT "Workspace_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AcademicProject" ADD CONSTRAINT "AcademicProject_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MainDocument" ADD CONSTRAINT "MainDocument_academicProjectId_fkey" FOREIGN KEY ("academicProjectId") REFERENCES "AcademicProject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentVersion" ADD CONSTRAINT "DocumentVersion_mainDocumentId_fkey" FOREIGN KEY ("mainDocumentId") REFERENCES "MainDocument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentVersion" ADD CONSTRAINT "DocumentVersion_parentVersionId_fkey" FOREIGN KEY ("parentVersionId") REFERENCES "DocumentVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Section" ADD CONSTRAINT "Section_mainDocumentId_fkey" FOREIGN KEY ("mainDocumentId") REFERENCES "MainDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Section" ADD CONSTRAINT "Section_parentSectionId_fkey" FOREIGN KEY ("parentSectionId") REFERENCES "Section"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentBlock" ADD CONSTRAINT "DocumentBlock_academicProjectId_fkey" FOREIGN KEY ("academicProjectId") REFERENCES "AcademicProject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentBlock" ADD CONSTRAINT "DocumentBlock_mainDocumentId_fkey" FOREIGN KEY ("mainDocumentId") REFERENCES "MainDocument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentBlock" ADD CONSTRAINT "DocumentBlock_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "Section"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reference" ADD CONSTRAINT "Reference_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contributor" ADD CONSTRAINT "Contributor_referenceId_fkey" FOREIGN KEY ("referenceId") REFERENCES "Reference"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PdfAsset" ADD CONSTRAINT "PdfAsset_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourceDocument" ADD CONSTRAINT "SourceDocument_academicProjectId_fkey" FOREIGN KEY ("academicProjectId") REFERENCES "AcademicProject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourceDocument" ADD CONSTRAINT "SourceDocument_referenceId_fkey" FOREIGN KEY ("referenceId") REFERENCES "Reference"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourceDocumentVersion" ADD CONSTRAINT "SourceDocumentVersion_sourceDocumentId_fkey" FOREIGN KEY ("sourceDocumentId") REFERENCES "SourceDocument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourceDocumentVersion" ADD CONSTRAINT "SourceDocumentVersion_pdfAssetId_fkey" FOREIGN KEY ("pdfAssetId") REFERENCES "PdfAsset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Annotation" ADD CONSTRAINT "Annotation_academicProjectId_fkey" FOREIGN KEY ("academicProjectId") REFERENCES "AcademicProject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Annotation" ADD CONSTRAINT "Annotation_sourceDocumentId_fkey" FOREIGN KEY ("sourceDocumentId") REFERENCES "SourceDocument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Annotation" ADD CONSTRAINT "Annotation_pdfAssetId_fkey" FOREIGN KEY ("pdfAssetId") REFERENCES "PdfAsset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnnotationAnchor" ADD CONSTRAINT "AnnotationAnchor_annotationId_fkey" FOREIGN KEY ("annotationId") REFERENCES "Annotation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnnotationAnchor" ADD CONSTRAINT "AnnotationAnchor_pdfAssetId_fkey" FOREIGN KEY ("pdfAssetId") REFERENCES "PdfAsset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResearchNote" ADD CONSTRAINT "ResearchNote_annotationId_fkey" FOREIGN KEY ("annotationId") REFERENCES "Annotation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BibliographyConfiguration" ADD CONSTRAINT "BibliographyConfiguration_academicProjectId_fkey" FOREIGN KEY ("academicProjectId") REFERENCES "AcademicProject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BibliographyConfiguration" ADD CONSTRAINT "BibliographyConfiguration_citationStyleId_fkey" FOREIGN KEY ("citationStyleId") REFERENCES "CitationStyle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CitationUsage" ADD CONSTRAINT "CitationUsage_mainDocumentId_fkey" FOREIGN KEY ("mainDocumentId") REFERENCES "MainDocument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CitationUsage" ADD CONSTRAINT "CitationUsage_documentBlockId_fkey" FOREIGN KEY ("documentBlockId") REFERENCES "DocumentBlock"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CitationUsage" ADD CONSTRAINT "CitationUsage_referenceId_fkey" FOREIGN KEY ("referenceId") REFERENCES "Reference"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProvenanceLink" ADD CONSTRAINT "ProvenanceLink_academicProjectId_fkey" FOREIGN KEY ("academicProjectId") REFERENCES "AcademicProject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProvenanceLink" ADD CONSTRAINT "ProvenanceLink_mainDocumentId_fkey" FOREIGN KEY ("mainDocumentId") REFERENCES "MainDocument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProvenanceLink" ADD CONSTRAINT "ProvenanceLink_targetDocumentBlockId_fkey" FOREIGN KEY ("targetDocumentBlockId") REFERENCES "DocumentBlock"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProvenanceLink" ADD CONSTRAINT "ProvenanceLink_referenceId_fkey" FOREIGN KEY ("referenceId") REFERENCES "Reference"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProvenanceLink" ADD CONSTRAINT "ProvenanceLink_sourceDocumentId_fkey" FOREIGN KEY ("sourceDocumentId") REFERENCES "SourceDocument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProvenanceLink" ADD CONSTRAINT "ProvenanceLink_pdfAssetId_fkey" FOREIGN KEY ("pdfAssetId") REFERENCES "PdfAsset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProvenanceLink" ADD CONSTRAINT "ProvenanceLink_annotationId_fkey" FOREIGN KEY ("annotationId") REFERENCES "Annotation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProvenanceLink" ADD CONSTRAINT "ProvenanceLink_annotationAnchorId_fkey" FOREIGN KEY ("annotationAnchorId") REFERENCES "AnnotationAnchor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProvenanceLink" ADD CONSTRAINT "ProvenanceLink_researchNoteId_fkey" FOREIGN KEY ("researchNoteId") REFERENCES "ResearchNote"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_academicProjectId_fkey" FOREIGN KEY ("academicProjectId") REFERENCES "AcademicProject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
