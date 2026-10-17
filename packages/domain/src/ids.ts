export type Brand<Value, Name extends string> = Value & { readonly __brand: Name };

export type WorkspaceId = Brand<string, "WorkspaceId">;
export type AcademicProjectId = Brand<string, "AcademicProjectId">;
export type ReferenceId = Brand<string, "ReferenceId">;
export type SourceDocumentId = Brand<string, "SourceDocumentId">;
export type PdfAssetId = Brand<string, "PdfAssetId">;
export type AnnotationId = Brand<string, "AnnotationId">;
export type AnnotationAnchorId = Brand<string, "AnnotationAnchorId">;
export type DocumentBlockId = Brand<string, "DocumentBlockId">;

function asUuid<Value extends string>(value: string): Brand<string, Value> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new Error("Expected a UUID-compatible identifier.");
  }

  return value as Brand<string, Value>;
}

export const id = {
  workspace: (value: string): WorkspaceId => asUuid<"WorkspaceId">(value),
  academicProject: (value: string): AcademicProjectId => asUuid<"AcademicProjectId">(value),
  reference: (value: string): ReferenceId => asUuid<"ReferenceId">(value),
  sourceDocument: (value: string): SourceDocumentId => asUuid<"SourceDocumentId">(value),
  pdfAsset: (value: string): PdfAssetId => asUuid<"PdfAssetId">(value),
  annotation: (value: string): AnnotationId => asUuid<"AnnotationId">(value),
  annotationAnchor: (value: string): AnnotationAnchorId => asUuid<"AnnotationAnchorId">(value),
  documentBlock: (value: string): DocumentBlockId => asUuid<"DocumentBlockId">(value)
};
