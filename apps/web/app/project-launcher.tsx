"use client";

import type { FormEvent } from "react";
import { useEffect, useRef, useState } from "react";

interface ProjectResult {
  projectId: string;
  mainDocumentId: string;
}

interface Capture {
  annotationId: string;
  anchorId: string;
  pageNumber: number;
  selectedText: string;
  color: string | null;
  note: string;
}

interface Source {
  id: string;
  title: string;
  referenceTitle: string;
  author: string | null;
  filename: string | null;
  byteSize: string | null;
  pdfUrl: string;
  captures: Capture[];
}

interface EvidenceLink {
  id: string;
  targetNodeId: string;
  sourceDocumentId: string;
  sourceTitle: string;
  pageNumber: number;
  selectedText: string;
}

interface DocumentBlock {
  nodeId: string;
  text: string;
}

export function ProjectLauncher() {
  const [name, setName] = useState("");
  const [result, setResult] = useState<ProjectResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [projects, setProjects] = useState<Array<{ id: string; name: string }>>([]);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [sourceMessage, setSourceMessage] = useState<string | null>(null);
  const [documentText, setDocumentText] = useState("");
  const [documentMessage, setDocumentMessage] = useState<string | null>(null);
  const [evidence, setEvidence] = useState<EvidenceLink[]>([]);
  const [documentBlocks, setDocumentBlocks] = useState<DocumentBlock[]>([]);
  const [bibliography, setBibliography] = useState<string[]>([]);
  const [sources, setSources] = useState<Source[]>([]);
  const [sourceRefresh, setSourceRefresh] = useState(0);
  const [selectedSourceId, setSelectedSourceId] = useState("");
  const [viewerPage, setViewerPage] = useState(1);
  const [quoteText, setQuoteText] = useState("");
  const [quoteNote, setQuoteNote] = useState("");
  const [captureMessage, setCaptureMessage] = useState<string | null>(null);
  const [paraphraseAnnotationId, setParaphraseAnnotationId] = useState<string | null>(null);
  const [paraphraseText, setParaphraseText] = useState("");
  const documentTextRef = useRef("");

  useEffect(() => {
    void fetch("/api/projects")
      .then(async (response) => response.ok ? response.json() : [])
      .then((items: Array<{ id: string; name: string }>) => {
        setProjects(items);
        setSelectedProjectId((current) => {
          const remembered = window.localStorage.getItem("research-workspace.active-project");
          if (current && items.some((project) => project.id === current)) return current;
          if (remembered && items.some((project) => project.id === remembered)) return remembered;
          return items[0]?.id || "";
        });
      });
  }, [result]);

  useEffect(() => {
    if (selectedProjectId) window.localStorage.setItem("research-workspace.active-project", selectedProjectId);
  }, [selectedProjectId]);

  useEffect(() => {
    if (!selectedProjectId) {
      setDocumentText("");
      documentTextRef.current = "";
      setEvidence([]);
      setDocumentBlocks([]);
      return;
    }
    void fetch(`/api/projects/${selectedProjectId}/document`)
      .then(async (response) => response.ok ? response.json() : { text: "", evidence: [] })
      .then((payload: { text?: string; evidence?: EvidenceLink[]; blocks?: DocumentBlock[] }) => {
        setDocumentText(payload.text ?? "");
        documentTextRef.current = payload.text ?? "";
        setEvidence(payload.evidence ?? []);
        setDocumentBlocks(payload.blocks ?? []);
      });
  }, [selectedProjectId]);

  useEffect(() => {
    if (!selectedProjectId) {
      setBibliography([]);
      return;
    }
    void fetch(`/api/projects/${selectedProjectId}/bibliography`)
      .then(async (response) => response.ok ? response.json() : { entries: [] })
      .then((payload: { entries?: string[] }) => setBibliography(payload.entries ?? []));
  }, [selectedProjectId, evidence]);

  useEffect(() => {
    if (!selectedProjectId) {
      setSources([]);
      setSelectedSourceId("");
      return;
    }
    void fetch(`/api/projects/${selectedProjectId}/sources`)
      .then(async (response) => response.ok ? response.json() : [])
      .then((items: Source[]) => {
        setSources(items);
        setSelectedSourceId((current) => current && items.some((source) => source.id === current) ? current : items[0]?.id || "");
      });
  }, [selectedProjectId, sourceRefresh]);

  const selectedSource = sources.find((source) => source.id === selectedSourceId);

  async function refreshDocument(): Promise<void> {
    if (!selectedProjectId) return;
    const response = await fetch(`/api/projects/${selectedProjectId}/document`);
    if (!response.ok) return;
    const payload = await response.json() as { text?: string; evidence?: EvidenceLink[]; blocks?: DocumentBlock[] };
    setDocumentText(payload.text ?? "");
    documentTextRef.current = payload.text ?? "";
    setEvidence(payload.evidence ?? []);
    setDocumentBlocks(payload.blocks ?? []);
  }

  async function handleProjectSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);
    setResult(null);
    setIsSubmitting(true);
    try {
      const response = await fetch("/api/projects", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name }) });
      const payload: unknown = await response.json();
      if (!response.ok || !isProjectResult(payload)) {
        setError(getErrorMessage(payload));
        return;
      }
      setResult(payload);
      setSelectedProjectId(payload.projectId);
      setName("");
    } catch {
      setError("The local development server could not create the project.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function saveDocument(): Promise<void> {
    const response = await fetch(`/api/projects/${selectedProjectId}/document`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: documentTextRef.current }) });
    const payload: unknown = await response.json();
    setDocumentMessage(response.ok ? "Document saved locally." : getErrorMessage(payload));
    if (response.ok) await refreshDocument();
  }

  async function saveSource(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const form = event.currentTarget;
    if (!selectedProjectId) {
      setSourceMessage("Create or select a project first.");
      return;
    }
    const response = await fetch(`/api/projects/${selectedProjectId}/sources`, { method: "POST", body: new FormData(form) });
    const payload: unknown = await response.json();
    setSourceMessage(response.ok && typeof payload === "object" && payload !== null && "sourceDocumentId" in payload ? "PDF source saved. You can open and cite it below." : getErrorMessage(payload));
    if (response.ok) {
      form.reset();
      setSourceRefresh((current) => current + 1);
    }
  }

  async function captureQuote(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!selectedProjectId || !selectedSourceId) return;
    const response = await fetch(`/api/projects/${selectedProjectId}/sources/${selectedSourceId}/annotations`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ selectedText: quoteText, pageNumber: viewerPage, note: quoteNote, color: "yellow" })
    });
    const payload: unknown = await response.json();
    setCaptureMessage(response.ok ? "Quote and source location saved." : getErrorMessage(payload));
    if (response.ok) {
      setQuoteText("");
      setQuoteNote("");
      setSourceRefresh((current) => current + 1);
    }
  }

  async function insertCapture(sourceId: string, annotationId: string, paraphrase?: string): Promise<void> {
    if (!selectedProjectId) return;
    const response = await fetch(`/api/projects/${selectedProjectId}/sources/${sourceId}/annotations/${annotationId}/insert`, paraphrase === undefined
      ? { method: "POST" }
      : { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ paraphrase }) });
    const payload: unknown = await response.json();
    setDocumentMessage(response.ok ? (paraphrase === undefined ? "Quote inserted with an APA citation and a permanent source link." : "Paraphrase inserted with an APA citation and a permanent source link.") : getErrorMessage(payload));
    if (response.ok) {
      setParaphraseAnnotationId(null);
      setParaphraseText("");
      await refreshDocument();
    }
  }

  function openEvidence(link: EvidenceLink): void {
    setSelectedSourceId(link.sourceDocumentId);
    setViewerPage(link.pageNumber);
    document.getElementById("source-library")?.scrollIntoView({ behavior: "smooth" });
  }

  return (
    <section className="project-launcher" aria-labelledby="project-launcher-heading">
      <p className="eyebrow">Local development</p>
      <h1 id="project-launcher-heading">Academic research workspace</h1>
      <p>Create a project, add PDFs, preserve quote locations, then insert cited evidence into your main document.</p>
      <form onSubmit={handleProjectSubmit}>
        <label htmlFor="project-name">Project name</label>
        <input id="project-name" name="project-name" value={name} onChange={(event) => setName(event.target.value)} maxLength={160} required />
        <button type="submit" disabled={isSubmitting}>{isSubmitting ? "Creating…" : "Create project"}</button>
      </form>
      {result === null ? null : <p className="success" role="status">Project created.</p>}
      {error === null ? null : <p className="error" role="alert">{error}</p>}

      <section className="project-selector" aria-labelledby="project-selector-heading">
        <h2 id="project-selector-heading">Open a project</h2>
        <label htmlFor="active-project">Active project</label>
        <select id="active-project" value={selectedProjectId} onChange={(event) => setSelectedProjectId(event.target.value)}>
          <option value="">Select a project</option>
          {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
        </select>
      </section>

      <section className="document-editor" aria-labelledby="document-editor-heading">
        <h2 id="document-editor-heading">Main academic document</h2>
        <p>Write freely, save locally, and add captured evidence from the source library.</p>
        <div
          className="document-writing-area"
          aria-label="Main document text"
          aria-multiline="true"
          contentEditable={Boolean(selectedProjectId)}
          role="textbox"
          suppressContentEditableWarning
          onInput={(event) => { documentTextRef.current = event.currentTarget.innerText; }}
        >
          {(documentBlocks.length === 0 ? [{ nodeId: "unpersisted", text: documentText }] : documentBlocks).map((block) => {
            const sourceLink = evidence.find((link) => link.targetNodeId === block.nodeId);
            return sourceLink === undefined
              ? <p key={block.nodeId}>{block.text}</p>
              : <p key={block.nodeId}><button className="inline-evidence-token" type="button" contentEditable={false} disabled={!selectedProjectId} onMouseDown={(event) => { event.preventDefault(); event.stopPropagation(); openEvidence(sourceLink); }} onClick={(event) => { event.preventDefault(); event.stopPropagation(); }} title={`Open ${sourceLink.sourceTitle}, page ${sourceLink.pageNumber}`}>{block.text}</button></p>;
          })}
        </div>
        <button type="button" disabled={!selectedProjectId} onClick={() => void saveDocument()}>Save document</button>
        {selectedProjectId ? <p className="export-links">Export: <a href={`/api/projects/${selectedProjectId}/export?format=docx`}>DOCX</a> <a href={`/api/projects/${selectedProjectId}/export?format=latex`}>LaTeX</a></p> : null}
        {documentMessage === null ? null : <p className="success" role="status">{documentMessage}</p>}
        {evidence.length === 0 ? null : <div className="evidence-links" aria-label="Evidence links in document">
          <h3>Evidence links</h3>
          {evidence.map((link) => <button className="link-button" type="button" key={link.id} onClick={() => openEvidence(link)}>{link.sourceTitle}, p. {link.pageNumber}</button>)}
        </div>}
        {bibliography.length === 0 ? null : <div className="bibliography" aria-label="Generated bibliography">
          <h3>Bibliography (APA 7)</h3>
          {bibliography.map((entry, index) => <p key={`${entry}-${index}`}>{entry}</p>)}
        </div>}
      </section>

      <section className="source-intake" aria-labelledby="source-intake-heading">
        <h2 id="source-intake-heading">Add a source PDF</h2>
        <form onSubmit={saveSource}>
          <label htmlFor="source-title">Reference title</label>
          <input id="source-title" name="title" required maxLength={500} disabled={!selectedProjectId} />
          <label htmlFor="source-author">Author (optional)</label>
          <input id="source-author" name="author" maxLength={300} disabled={!selectedProjectId} />
          <label htmlFor="source-year">Year (optional)</label>
          <input id="source-year" name="year" inputMode="numeric" pattern="[0-9]{4}" disabled={!selectedProjectId} />
          <label htmlFor="source-file">PDF file</label>
          <input id="source-file" name="file" type="file" accept="application/pdf,.pdf" required disabled={!selectedProjectId} />
          <button type="submit" disabled={!selectedProjectId}>Save PDF source</button>
        </form>
        {sourceMessage === null ? null : <p className="success" role="status">{sourceMessage}</p>}
      </section>

      <section id="source-library" className="source-library" aria-labelledby="source-library-heading">
        <h2 id="source-library-heading">Source library and quote capture</h2>
        {selectedProjectId && sources.length === 0 ? <p>Add a PDF source to begin reading and capturing evidence.</p> : null}
        {sources.length === 0 ? null : <>
          <label htmlFor="active-source">PDF source</label>
          <select id="active-source" value={selectedSourceId} onChange={(event) => { setSelectedSourceId(event.target.value); setViewerPage(1); }}>
            {sources.map((source) => <option key={source.id} value={source.id}>{source.title}{source.author ? ` — ${source.author}` : ""}</option>)}
          </select>
          {selectedSource === undefined ? null : <>
            <p className="source-meta">{selectedSource.filename ?? "PDF"}{selectedSource.byteSize ? ` · ${Math.ceil(Number(selectedSource.byteSize) / 1024)} KB` : ""}</p>
            <div className="pdf-controls">
              <label htmlFor="viewer-page">Page</label>
              <input id="viewer-page" type="number" min="1" value={viewerPage} onChange={(event) => setViewerPage(Math.max(1, Number(event.target.value) || 1))} />
              <a href={`${selectedSource.pdfUrl}#page=${viewerPage}`} target="_blank" rel="noreferrer">Open PDF in a new tab</a>
            </div>
            <iframe className="pdf-viewer" title={`${selectedSource.title} PDF`} src={`${selectedSource.pdfUrl}#page=${viewerPage}`} />
            <form className="quote-capture" onSubmit={captureQuote}>
              <h3>Capture a quote</h3>
              <p>Copy a passage from the PDF, paste it here, and record its page. This creates an immutable link back to the PDF page.</p>
              <label htmlFor="quote-text">Copied passage</label>
              <textarea id="quote-text" value={quoteText} onChange={(event) => setQuoteText(event.target.value)} required rows={5} placeholder="Paste the exact passage here" />
              <label htmlFor="quote-note">Your note (optional)</label>
              <textarea id="quote-note" value={quoteNote} onChange={(event) => setQuoteNote(event.target.value)} rows={3} placeholder="Why this passage matters" />
              <button type="submit">Save quote and location</button>
            </form>
            {captureMessage === null ? null : <p className="success" role="status">{captureMessage}</p>}
            <div className="capture-list" aria-label="Captured quotes">
              <h3>Captured quotes</h3>
              {selectedSource.captures.length === 0 ? <p>No captured quotes for this source yet.</p> : selectedSource.captures.map((capture) => <article key={capture.anchorId}>
                <p>“{capture.selectedText}”</p>
                <p className="source-meta">Page {capture.pageNumber}{capture.note ? ` · ${capture.note}` : ""}</p>
                <button type="button" onClick={() => void insertCapture(selectedSource.id, capture.annotationId)}>Insert into document with citation</button>
                <button className="secondary-button" type="button" onClick={() => { setParaphraseAnnotationId(capture.annotationId); setParaphraseText(""); }}>Write a paraphrase</button>
                {paraphraseAnnotationId !== capture.annotationId ? null : <form className="paraphrase-form" onSubmit={(event) => { event.preventDefault(); void insertCapture(selectedSource.id, capture.annotationId, paraphraseText); }}>
                  <label htmlFor={`paraphrase-${capture.annotationId}`}>Your paraphrase</label>
                  <textarea id={`paraphrase-${capture.annotationId}`} value={paraphraseText} onChange={(event) => setParaphraseText(event.target.value)} required rows={4} placeholder="Restate the idea in your own academic wording" />
                  <button type="submit">Insert paraphrase with citation</button>
                </form>}
              </article>)}
            </div>
          </>}
        </>}
      </section>
    </section>
  );
}

function isProjectResult(value: unknown): value is ProjectResult {
  return typeof value === "object" && value !== null && "projectId" in value && typeof value.projectId === "string" && "mainDocumentId" in value && typeof value.mainDocumentId === "string";
}

function getErrorMessage(value: unknown): string {
  return typeof value === "object" && value !== null && "error" in value && typeof value.error === "string" ? value.error : "The request could not be completed.";
}
