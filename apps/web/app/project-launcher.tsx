"use client";

import type { FormEvent } from "react";
import { useCallback, useEffect, useRef, useState } from "react";

import { type PdfDetails, readPdfDetails } from "./pdf-metadata";
import { readStorage, writeStorage } from "./browser-storage";
import { PdfReader, type SelectionAction } from "./pdf-reader";
import { type ReadingNote, ReadingView } from "./reading-view";

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
  notes: ReadingNote[];
}

interface EvidenceLink {
  id: string;
  targetNodeId: string;
  sourceDocumentId: string;
  sourceTitle: string;
  pageNumber: number;
  selectedText: string;
  status: string;
  note: string;
}

interface DocumentBlock {
  nodeId: string;
  text: string;
  links?: Array<{ linkId: string; offset: number }>;
  // A picture block: the stored picture's file name; the text is its caption.
  image?: string;
}

// A paragraph as read back from the writing area; nodeId is missing for paragraphs typed there.
interface EditorParagraph {
  nodeId?: string;
  text: string;
  links: Array<{ linkId: string; offset: number }>;
  image?: string;
}

interface DocumentSection {
  id: string;
  title: string;
  blocks: DocumentBlock[];
}

interface PendingSelection {
  action: Exclude<SelectionAction, "note">;
  text: string;
  pageNumber: number;
  sourceId: string;
}

interface Alternative {
  style: string;
  text: string;
}

const activeProjectKey = "research-workspace.active-project";
const readerWidthKey = "research-workspace.reader-width";
const viewKey = "research-workspace.view";
// The section and PDF last open in each project, so the app reopens where work stopped.
const sectionKey = (projectId: string) => `research-workspace.section.${projectId}`;
const sourceKey = (projectId: string) => `research-workspace.source.${projectId}`;

async function fetchBibliography(projectId: string): Promise<string[]> {
  const response = await fetch(`/api/projects/${projectId}/bibliography`);
  const payload = response.ok ? await response.json() as { entries?: string[] } : {};
  return payload.entries ?? [];
}

export function ProjectLauncher() {
  const [projects, setProjects] = useState<Array<{ id: string; name: string }>>([]);
  const [projectsLoaded, setProjectsLoaded] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [newProjectName, setNewProjectName] = useState("");
  const [sections, setSections] = useState<DocumentSection[]>([]);
  const [documentRevision, setDocumentRevision] = useState(0);
  const [selectedSectionId, setSelectedSectionId] = useState("");
  const [evidence, setEvidence] = useState<EvidenceLink[]>([]);
  const [bibliography, setBibliography] = useState<string[]>([]);
  const [sources, setSources] = useState<Source[]>([]);
  const [selectedSourceId, setSelectedSourceId] = useState("");
  const [jumpToPage, setJumpToPage] = useState<{ page: number; token: number } | null>(null);
  const [openedEvidence, setOpenedEvidence] = useState<EvidenceLink | null>(null);
  const [showSourceForm, setShowSourceForm] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showProjectForm, setShowProjectForm] = useState(false);
  const [reading, setReading] = useState(false);
  const [readerWidth, setReaderWidth] = useState(0);
  const [hasApiKey, setHasApiKey] = useState(false);
  const [figureLabel, setFigureLabel] = useState("Şekil");
  const [pending, setPending] = useState<PendingSelection | null>(null);
  const [saveState, setSaveState] = useState<"saved" | "saving" | "unsaved">("saved");
  const [message, setMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const editorParagraphsRef = useRef<EditorParagraph[]>([]);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // Which project the loaded sections and sources belong to, so a selection is only remembered for
  // its own project while another one is still loading.
  const sectionsProjectRef = useRef("");
  const sourcesProjectRef = useRef("");
  const savingRef = useRef<Promise<boolean> | null>(null);
  const editorRootRef = useRef<HTMLDivElement | null>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const imageAnchorRef = useRef<Node | null>(null);
  const flushRef = useRef<() => Promise<void>>(async () => undefined);

  const selectedSection = sections.find((section) => section.id === selectedSectionId) ?? sections[0];
  const selectedSource = sources.find((source) => source.id === selectedSourceId);

  const loadProjects = useCallback(async (preferredId?: string) => {
    const response = await fetch("/api/projects");
    const items: Array<{ id: string; name: string }> = response.ok ? await response.json() : [];
    setProjects(items);
    setProjectsLoaded(true);
    setSelectedProjectId((current) => {
      const remembered = readStorage(activeProjectKey);
      for (const candidate of [preferredId, current, remembered]) {
        if (candidate && items.some((project) => project.id === candidate)) return candidate;
      }
      return items[0]?.id ?? "";
    });
  }, []);

  const loadDocument = useCallback(async (projectId: string) => {
    const response = await fetch(`/api/projects/${projectId}/document`);
    if (!response.ok) return;
    const payload = await response.json() as { sections?: DocumentSection[]; evidence?: EvidenceLink[]; revision?: number };
    sectionsProjectRef.current = projectId;
    setSections(payload.sections ?? []);
    setEvidence(payload.evidence ?? []);
    setDocumentRevision(payload.revision ?? 0);
    setSelectedSectionId((current) => {
      for (const candidate of [current, readStorage(sectionKey(projectId))]) {
        if (candidate && payload.sections?.some((section) => section.id === candidate)) return candidate;
      }
      return payload.sections?.[0]?.id ?? "";
    });
    setBibliography(await fetchBibliography(projectId));
  }, []);

  const loadSources = useCallback(async (projectId: string, preferredId?: string) => {
    const response = await fetch(`/api/projects/${projectId}/sources`);
    const items: Source[] = response.ok ? await response.json() : [];
    sourcesProjectRef.current = projectId;
    setSources(items);
    setSelectedSourceId((current) => {
      for (const candidate of [preferredId, current, readStorage(sourceKey(projectId))]) {
        if (candidate && items.some((source) => source.id === candidate)) return candidate;
      }
      return items[0]?.id ?? "";
    });
  }, []);

  useEffect(() => {
    setReaderWidth(Number(readStorage(readerWidthKey)) || 0);
    setReading(readStorage(viewKey) === "reading");
    void loadProjects();
    void fetch("/api/settings").then(async (response) => response.ok ? response.json() : { hasApiKey: false }).then((payload: { hasApiKey: boolean; figureLabel?: string }) => {
      setHasApiKey(payload.hasApiKey);
      if (payload.figureLabel !== undefined) setFigureLabel(payload.figureLabel);
    });
  }, [loadProjects]);

  useEffect(() => {
    if (!selectedProjectId) {
      setSections([]);
      setEvidence([]);
      setSources([]);
      setBibliography([]);
      return;
    }
    writeStorage(activeProjectKey, selectedProjectId);
    setOpenedEvidence(null);
    void loadDocument(selectedProjectId);
    void loadSources(selectedProjectId);
  }, [selectedProjectId, loadDocument, loadSources]);

  useEffect(() => {
    if (selectedProjectId && sectionsProjectRef.current === selectedProjectId && selectedSection !== undefined) writeStorage(sectionKey(selectedProjectId), selectedSection.id);
  }, [selectedProjectId, selectedSection?.id]);

  useEffect(() => {
    if (selectedProjectId && sourcesProjectRef.current === selectedProjectId && selectedSourceId) writeStorage(sourceKey(selectedProjectId), selectedSourceId);
  }, [selectedProjectId, selectedSourceId]);

  function notify(kind: "success" | "error", text: string): void {
    setMessage({ kind, text });
    if (kind === "success") setTimeout(() => setMessage((current) => current?.text === text ? null : current), 4000);
  }

  function saveSection(update: { title?: string; paragraphs?: EditorParagraph[] }, sectionId = selectedSection?.id): Promise<boolean> {
    const saving = sendSection(update, sectionId).finally(() => {
      if (savingRef.current === saving) savingRef.current = null;
    });
    savingRef.current = saving;
    return saving;
  }

  async function sendSection(update: { title?: string; paragraphs?: EditorParagraph[] }, sectionId: string | undefined): Promise<boolean> {
    if (!selectedProjectId || sectionId === undefined) return false;
    setSaveState("saving");
    const response = await fetch(`/api/projects/${selectedProjectId}/document`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sectionId, ...update })
    });
    if (!response.ok) {
      setSaveState("unsaved");
      notify("error", getErrorMessage(await response.json().catch(() => null)));
      return false;
    }
    const payload = await response.json() as { section: DocumentSection; removedLinkIds?: string[] };
    setSections((current) => current.map((section) => section.id === payload.section.id ? payload.section : section));
    setSaveState("saved");
    const removed = payload.removedLinkIds ?? [];
    if (removed.length > 0) {
      setEvidence((current) => current.filter((link) => !removed.includes(link.id)));
      setOpenedEvidence((current) => current !== null && removed.includes(current.id) ? null : current);
      notify("success", removed.length === 1 ? "Alıntı işareti silindi, PDF bağlantısı da kaldırıldı." : `${removed.length} alıntı işareti silindi, PDF bağlantıları da kaldırıldı.`);
      void loadSources(selectedProjectId);
      void fetchBibliography(selectedProjectId).then(setBibliography);
    }
    return true;
  }

  async function flushPendingSave(): Promise<void> {
    if (saveTimerRef.current === undefined) return;
    clearTimeout(saveTimerRef.current);
    saveTimerRef.current = undefined;
    await saveSection({ paragraphs: editorParagraphsRef.current });
  }
  flushRef.current = async () => {
    await flushPendingSave();
    await savingRef.current;
  };

  // Closing the window while a change is still waiting to be saved first saves it, then closes.
  useEffect(() => {
    let closing = false;
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (closing) return;
      // Leaving a field saves it (the section title saves on blur).
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
      if (saveTimerRef.current === undefined && savingRef.current === null) return;
      event.preventDefault();
      event.returnValue = "";
      void flushRef.current().finally(() => {
        closing = true;
        window.close();
      });
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, []);

  function handleEditorInput(paragraphs: EditorParagraph[]): void {
    editorParagraphsRef.current = paragraphs;
    setSaveState("unsaved");
    clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveTimerRef.current = undefined;
      void saveSection({ paragraphs: editorParagraphsRef.current });
    }, 800);
  }

  // Pictures go in after the paragraph holding the caret (or where they were dropped), or at the end.
  async function insertImages(files: File[], anchor: Node | null): Promise<void> {
    const pictures = files.filter((file) => file.type.startsWith("image/"));
    if (pictures.length === 0 || selectedSection === undefined) return;
    const stored: string[] = [];
    for (const picture of pictures) {
      const form = new FormData();
      form.append("file", picture);
      const response = await fetch("/api/images", { method: "POST", body: form });
      const payload: unknown = await response.json().catch(() => null);
      if (response.ok && typeof payload === "object" && payload !== null && "file" in payload && typeof payload.file === "string") stored.push(payload.file);
      else notify("error", `"${picture.name}" eklenemedi. PNG, JPEG, GIF ya da WebP biçiminde ve 20 MB'tan küçük olmalı.`);
    }
    const root = editorRootRef.current;
    if (stored.length === 0 || root === null) return;
    clearTimeout(saveTimerRef.current);
    saveTimerRef.current = undefined;
    const { paragraphs, insertAt } = readEditorBlocks(root, anchor);
    const figures = stored.map((file) => ({ text: "", links: [], image: file }));
    if (await saveSection({ paragraphs: [...paragraphs.slice(0, insertAt), ...figures, ...paragraphs.slice(insertAt)] })) {
      setDocumentRevision((revision) => revision + 1);
    }
  }

  async function openSection(sectionId: string): Promise<void> {
    await flushPendingSave();
    setSelectedSectionId(sectionId);
  }

  async function addSection(): Promise<void> {
    if (!selectedProjectId) return;
    await flushPendingSave();
    const response = await fetch(`/api/projects/${selectedProjectId}/document`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: `Bölüm ${sections.length + 1}`, paragraphs: [] })
    });
    if (!response.ok) {
      notify("error", getErrorMessage(await response.json().catch(() => null)));
      return;
    }
    const payload = await response.json() as { section: DocumentSection };
    setSections((current) => [...current, payload.section]);
    setSelectedSectionId(payload.section.id);
  }

  async function deleteSection(section: DocumentSection): Promise<void> {
    if (!selectedProjectId || !window.confirm(`"${section.title || "Başlıksız bölüm"}" silinsin mi? İçindeki yazılar da silinir.`)) return;
    const response = await fetch(`/api/projects/${selectedProjectId}/document?sectionId=${encodeURIComponent(section.id)}`, { method: "DELETE" });
    if (!response.ok) {
      notify("error", getErrorMessage(await response.json().catch(() => null)));
      return;
    }
    await loadDocument(selectedProjectId);
  }

  async function createProject(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const response = await fetch("/api/projects", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: newProjectName }) });
    const payload: unknown = await response.json();
    if (!response.ok || typeof payload !== "object" || payload === null || !("projectId" in payload) || typeof payload.projectId !== "string") {
      notify("error", getErrorMessage(payload));
      return;
    }
    setNewProjectName("");
    await loadProjects(payload.projectId);
  }

  async function saveSource(form: FormData): Promise<boolean> {
    const response = await fetch(`/api/projects/${selectedProjectId}/sources`, { method: "POST", body: form });
    const payload: unknown = await response.json();
    if (!response.ok || typeof payload !== "object" || payload === null || !("sourceDocumentId" in payload) || typeof payload.sourceDocumentId !== "string") {
      notify("error", getErrorMessage(payload));
      return false;
    }
    setShowSourceForm(false);
    await loadSources(selectedProjectId, payload.sourceDocumentId);
    notify("success", "PDF eklendi. Metni seçip sağ tıklayarak paraphrase yapabilirsiniz.");
    return true;
  }

  function openEvidence(link: EvidenceLink): void {
    setSelectedSourceId(link.sourceDocumentId);
    setOpenedEvidence(link);
    setJumpToPage({ page: link.pageNumber, token: Date.now() });
  }

  async function switchView(toReading: boolean): Promise<void> {
    if (toReading) await flushPendingSave();
    setReading(toReading);
    writeStorage(viewKey, toReading ? "reading" : "writing");
  }

  function handleSelection(action: SelectionAction, text: string, pageNumber: number): void {
    if (!selectedSourceId || action === "note") return;
    setPending({ action, text, pageNumber, sourceId: selectedSourceId });
  }

  async function insertSelection(selection: PendingSelection, note: string, sectionId: string, paraphrase?: string): Promise<boolean> {
    await flushPendingSave();
    const captureResponse = await fetch(`/api/projects/${selectedProjectId}/sources/${selection.sourceId}/annotations`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ selectedText: selection.text, pageNumber: selection.pageNumber, note, color: "yellow" })
    });
    const capture: unknown = await captureResponse.json();
    if (!captureResponse.ok || typeof capture !== "object" || capture === null || !("annotationId" in capture) || typeof capture.annotationId !== "string") {
      notify("error", getErrorMessage(capture));
      return false;
    }
    const insertResponse = await fetch(`/api/projects/${selectedProjectId}/sources/${selection.sourceId}/annotations/${capture.annotationId}/insert`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(paraphrase === undefined ? { sectionId } : { sectionId, paraphrase })
    });
    if (!insertResponse.ok) {
      notify("error", getErrorMessage(await insertResponse.json().catch(() => null)));
      return false;
    }
    setSelectedSectionId(sectionId);
    await Promise.all([loadDocument(selectedProjectId), loadSources(selectedProjectId)]);
    notify("success", "Metin, sayfa numaralı referansıyla bölüme eklendi.");
    return true;
  }

  if (projectsLoaded && projects.length === 0) {
    return (
      <section className="welcome">
        <h1>Research Workspace</h1>
        <p>Başlamak için bir proje oluşturun. Her projenin kendi bölümleri, PDF kaynakları ve kaynakçası olur.</p>
        <form className="inline-form" onSubmit={createProject}>
          <input aria-label="Proje adı" placeholder="Proje adı (ör. Tez)" value={newProjectName} onChange={(event) => setNewProjectName(event.target.value)} maxLength={160} required />
          <button type="submit">Proje oluştur</button>
        </form>
        {message === null ? null : <p className={message.kind} role="status">{message.text}</p>}
      </section>
    );
  }

  const highlights = evidence
    .filter((link) => link.sourceDocumentId === selectedSourceId)
    .map((link) => ({ id: link.id, pageNumber: link.pageNumber, text: link.selectedText, kind: link.status === "PARAPHRASE" ? "paraphrase" as const : "quote" as const }));

  // Paraphrasing and quoting work the same from the writing screen and the reading screen.
  const dialogs = <>
    {pending === null || selectedSection === undefined ? null : (
      <ParaphraseDialog
        key={`${pending.sourceId}-${pending.pageNumber}-${pending.text}`}
        selection={pending}
        sourceTitle={sources.find((source) => source.id === pending.sourceId)?.title ?? ""}
        sections={sections}
        defaultSectionId={selectedSection.id}
        hasApiKey={hasApiKey}
        onOpenSettings={() => setShowSettings(true)}
        onClose={() => setPending(null)}
        onInsert={async (note, sectionId, paraphrase) => {
          if (await insertSelection(pending, note, sectionId, paraphrase)) setPending(null);
        }}
      />
    )}

    {showSettings ? <SettingsDialog hasApiKey={hasApiKey} figureLabel={figureLabel} onFigureLabel={setFigureLabel} onClose={() => setShowSettings(false)} onSaved={(value) => { setHasApiKey(value); setShowSettings(false); }} /> : null}
  </>;

  if (reading && selectedProjectId) {
    return (
      <>
        <ReadingView
          projectId={selectedProjectId}
          sources={sources}
          sourceId={selectedSourceId}
          quoteHighlights={highlights}
          onSourceChange={setSelectedSourceId}
          onPassage={handleSelection}
          onClose={() => void switchView(false)}
          onNotesChanged={() => loadSources(selectedProjectId)}
          notify={notify}
        />
        {message === null ? null : <p className={`toast ${message.kind}`} role="status" onClick={() => setMessage(null)}>{message.text}</p>}
        {dialogs}
      </>
    );
  }

  const sectionLinkIds = new Set(selectedSection?.blocks.flatMap((block) => (block.links ?? []).map((link) => link.linkId)) ?? []);
  const sectionEvidence = evidence.filter((link) => sectionLinkIds.has(link.id));

  return (
    <div className="workspace" style={readerWidth > 0 ? { "--reader-width": `${readerWidth}px` } as React.CSSProperties : undefined}>
      <header className="topbar">
        <strong className="brand"><span className="brand-mark" aria-hidden="true">❞</span>Research Workspace</strong>
        <select aria-label="Aktif proje" value={selectedProjectId} onChange={(event) => setSelectedProjectId(event.target.value)}>
          {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
        </select>
        {showProjectForm ? (
          <form className="inline-form" onSubmit={(event) => { void createProject(event).then(() => setShowProjectForm(false)); }}>
            <input aria-label="Yeni proje adı" placeholder="Proje adı" value={newProjectName} onChange={(event) => setNewProjectName(event.target.value)} maxLength={160} required autoFocus />
            <button type="submit">Oluştur</button>
            <button className="ghost-button" type="button" onClick={() => setShowProjectForm(false)}>Vazgeç</button>
          </form>
        ) : <button className="ghost-button" type="button" onClick={() => setShowProjectForm(true)}>+ Yeni proje</button>}
        <span className="spacer" />
        {sources.length === 0 ? null : <button className="ghost-button" type="button" title="PDF'i tam ekran okuyup yanına not alın" onClick={() => void switchView(true)}>📖 Okuma ve notlar</button>}
        {selectedProjectId ? <span className="export-links"><span className="muted">Dışa aktar</span><a className="pill-link" href={`/api/projects/${selectedProjectId}/export?format=docx`}>Word</a><a className="pill-link" href={`/api/projects/${selectedProjectId}/export?format=latex`}>LaTeX</a></span> : null}
        <button className="ghost-button" type="button" onClick={() => setShowSettings(true)}>⚙ Ayarlar</button>
      </header>

      {message === null ? null : <p className={`toast ${message.kind}`} role="status" onClick={() => setMessage(null)}>{message.text}</p>}

      <aside className="app-sidebar">
        <div className="sidebar-heading">
          <h2>Bölümler</h2>
          <button className="icon-button" type="button" title="Yeni bölüm" onClick={() => void addSection()}>+</button>
        </div>
        <ul className="section-list">
          {sections.map((section) => (
            <li key={section.id} className={section.id === selectedSection?.id ? "active" : ""}>
              <button type="button" onClick={() => void openSection(section.id)}>{section.title || "Başlıksız bölüm"}</button>
              {sections.length > 1 ? <button className="delete-button" type="button" title="Bölümü sil" onClick={() => void deleteSection(section)}>×</button> : null}
            </li>
          ))}
        </ul>

        <div className="sidebar-heading">
          <h2>Kaynaklar</h2>
          <button className="icon-button" type="button" title="PDF ekle" onClick={() => setShowSourceForm((current) => !current)}>+</button>
        </div>
        {showSourceForm ? (
          <SourceForm onSubmit={saveSource} />
        ) : null}
        <ul className="source-list">
          {sources.length === 0 ? <li className="muted">Henüz PDF yok. + ile ekleyin.</li> : sources.map((source) => (
            <li key={source.id} className={source.id === selectedSourceId ? "active" : ""}>
              <button type="button" onClick={() => { setSelectedSourceId(source.id); setOpenedEvidence(null); }}>
                {source.title}
                <span className="muted">{[source.author, source.captures.length > 0 ? `${source.captures.length} alıntı` : undefined, source.notes.length > 0 ? `${source.notes.length} not` : undefined].filter(Boolean).join(" · ")}</span>
              </button>
            </li>
          ))}
        </ul>
      </aside>

      <main className="editor-column">
        {selectedSection === undefined ? null : <div className="editor-page">
          <input
            key={`title-${selectedSection.id}`}
            className="section-title"
            aria-label="Bölüm başlığı"
            defaultValue={selectedSection.title}
            placeholder="Bölüm başlığı"
            maxLength={300}
            onBlur={(event) => { if (event.target.value !== selectedSection.title) void saveSection({ title: event.target.value }); }}
            onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }}
          />
          <div className="editor-meta">
            <p className="save-state muted">{saveState === "saved" ? "Kaydedildi" : saveState === "saving" ? "Kaydediliyor…" : "Değişiklikler kaydedilecek…"}</p>
            <button
              className="ghost-button"
              type="button"
              title="Resim ekle (resmi yazının içine sürükleyip bırakabilir ya da yapıştırabilirsiniz)"
              onMouseDown={() => {
                const anchor = window.getSelection()?.anchorNode ?? null;
                imageAnchorRef.current = anchor !== null && editorRootRef.current?.contains(anchor) ? anchor : null;
              }}
              onClick={() => imageInputRef.current?.click()}
            >🖼 Resim ekle</button>
            <input
              ref={imageInputRef}
              type="file"
              accept="image/png,image/jpeg,image/gif,image/webp"
              multiple
              hidden
              onChange={(event) => {
                const files = [...(event.target.files ?? [])];
                event.target.value = "";
                void insertImages(files, imageAnchorRef.current);
              }}
            />
          </div>
          <EditorArea
            key={`${selectedSection.id}-${documentRevision}`}
            rootRef={editorRootRef}
            figurePrefix={`${figureLabel} ${sections.indexOf(selectedSection) + 1}.`}
            blocks={selectedSection.blocks}
            evidence={evidence}
            onInput={handleEditorInput}
            onBlur={() => void flushPendingSave()}
            onOpenEvidence={openEvidence}
            onInsertImages={(files, anchor) => void insertImages(files, anchor)}
          />
          {sectionEvidence.length === 0 ? null : <div className="evidence-links">
            <h3>Bu bölümdeki referanslar</h3>
            {sectionEvidence.map((link) => <button className="link-button" type="button" key={link.id} onClick={() => openEvidence(link)}>{link.sourceTitle}, s. {link.pageNumber}{link.note ? ` — ${link.note}` : ""}</button>)}
          </div>}
          {bibliography.length === 0 ? null : <details className="bibliography">
            <summary>Kaynakça (APA 7)</summary>
            {bibliography.map((entry, index) => <p key={`${entry}-${index}`}>{entry}</p>)}
          </details>}
        </div>}
      </main>

      <PaneSplitter onResize={(width) => { setReaderWidth(width); writeStorage(readerWidthKey, String(Math.round(width))); }} />

      <section className="reader-column" aria-label="PDF okuyucu">
        {openedEvidence === null ? null : (
          <div className="evidence-card">
            <button className="delete-button" type="button" title="Kapat" onClick={() => setOpenedEvidence(null)}>×</button>
            <p className="muted">{openedEvidence.sourceTitle}, sayfa {openedEvidence.pageNumber}</p>
            <blockquote>{openedEvidence.selectedText}</blockquote>
            {openedEvidence.note ? <p><strong>Neden aldım:</strong> {openedEvidence.note}</p> : null}
          </div>
        )}
        {selectedSource === undefined
          ? <p className="muted reader-empty">Bir PDF seçin ya da soldan + ile ekleyin.</p>
          : <PdfReader url={selectedSource.pdfUrl} jumpToPage={jumpToPage} highlights={highlights} onSelection={handleSelection} resumeKey={selectedSource.id} />}
      </section>

      {dialogs}
    </div>
  );
}

// Dragging the bar between the writing area and the PDF changes how wide the PDF is.
function PaneSplitter({ onResize }: { onResize: (readerWidth: number) => void }) {
  function startDrag(event: React.PointerEvent<HTMLDivElement>): void {
    event.preventDefault();
    const handle = event.currentTarget;
    handle.setPointerCapture(event.pointerId);
    // Leaves room for the sidebar (15.5rem) and the writing area's minimum width (24rem).
    const move = (moveEvent: PointerEvent) => onResize(Math.min(window.innerWidth - 660, Math.max(320, window.innerWidth - moveEvent.clientX)));
    const stop = () => {
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", stop);
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", stop);
  }
  return <div className="pane-splitter" role="separator" aria-orientation="vertical" title="Sürükleyerek PDF alanını genişletin" onPointerDown={startDrag} />;
}

// Choosing a PDF fills in its title, authors and year from the file (and Crossref, when it has a DOI);
// the fields stay editable because the guesses can be wrong.
function SourceForm({ onSubmit }: { onSubmit: (form: FormData) => Promise<boolean> }) {
  const [file, setFile] = useState<File | null>(null);
  const [details, setDetails] = useState<PdfDetails>({ title: "", authors: "", year: "", doi: "" });
  const [reading, setReading] = useState(false);
  const [saving, setSaving] = useState(false);

  async function chooseFile(chosen: File | null): Promise<void> {
    setFile(chosen);
    if (chosen === null) return;
    setReading(true);
    try {
      const found = await readPdfDetails(chosen);
      setDetails((current) => ({
        title: found.title || current.title || chosen.name.replace(/\.pdf$/i, ""),
        authors: found.authors || current.authors,
        year: found.year || current.year,
        doi: found.doi
      }));
    } catch {
      setDetails((current) => ({ ...current, title: current.title || chosen.name.replace(/\.pdf$/i, "") }));
    } finally {
      setReading(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (file === null) return;
    const form = new FormData();
    form.set("file", file);
    form.set("title", details.title);
    form.set("author", details.authors);
    form.set("year", details.year);
    if (details.doi) form.set("doi", details.doi);
    setSaving(true);
    await onSubmit(form);
    setSaving(false);
  }

  const update = (key: keyof PdfDetails) => (event: React.ChangeEvent<HTMLInputElement>) => setDetails((current) => ({ ...current, [key]: event.target.value }));

  return (
    <form className="source-form" onSubmit={submit}>
      <input type="file" accept="application/pdf,.pdf" required aria-label="PDF dosyası" onChange={(event) => void chooseFile(event.target.files?.[0] ?? null)} />
      {reading ? <p className="muted">PDF'teki bilgiler okunuyor…</p> : null}
      <input aria-label="Kaynak başlığı" placeholder="Kaynak başlığı" required maxLength={500} value={details.title} onChange={update("title")} />
      <input aria-label="Yazarlar" placeholder="Yazar: Soyad, Ad; Soyad, Ad" maxLength={300} value={details.authors} onChange={update("authors")} />
      <input aria-label="Yıl" placeholder="Yıl" inputMode="numeric" pattern="[0-9]{4}" value={details.year} onChange={update("year")} />
      {details.doi ? <p className="muted">DOI: {details.doi}</p> : null}
      {file !== null && !reading ? <p className="muted">Bilgiler PDF'ten alındı, kontrol edip düzeltebilirsiniz.</p> : null}
      <button type="submit" disabled={reading || saving}>{saving ? "Kaydediliyor…" : "PDF'i kaydet"}</button>
    </form>
  );
}

// The writing area keeps the paragraphs it was mounted with: autosaves must not re-render the text
// under the cursor. It remounts (via its key) when another section opens or a citation is inserted.
// Every quote ends in a marker that cannot be typed into: the text around it stays editable, and
// deleting the marker deletes the quote's link to the PDF.
function EditorArea({ rootRef, figurePrefix, blocks, evidence, onInput, onBlur, onOpenEvidence, onInsertImages }: {
  rootRef: React.RefObject<HTMLDivElement | null>;
  // "Şekil 3." for the third section; each picture's own number is added by a CSS counter, so it
  // stays right when pictures are removed or moved.
  figurePrefix: string;
  blocks: DocumentBlock[];
  evidence: EvidenceLink[];
  onInput: (paragraphs: EditorParagraph[]) => void;
  onBlur: () => void;
  onOpenEvidence: (link: EvidenceLink) => void;
  onInsertImages: (files: File[], anchor: Node | null) => void;
}) {
  const [initial] = useState(() => ({ blocks, evidence }));
  const evidenceRef = useRef(evidence);
  evidenceRef.current = evidence;

  function openMarker(target: EventTarget): boolean {
    const marker = target instanceof Element ? target.closest("[data-link-id]") : null;
    const link = evidenceRef.current.find((candidate) => candidate.id === marker?.getAttribute("data-link-id"));
    if (link !== undefined) onOpenEvidence(link);
    return marker !== null;
  }

  function pictureFiles(transfer: DataTransfer): File[] {
    return [...transfer.files].filter((file) => file.type.startsWith("image/"));
  }

  return (
    <div
      ref={rootRef}
      className="document-writing-area"
      aria-label="Bölüm metni"
      aria-multiline="true"
      contentEditable
      role="textbox"
      suppressContentEditableWarning
      data-placeholder="Yazmaya başlayın. PDF'te bir metni seçip sağ tıklayarak paraphrase'ini buraya ekleyebilirsiniz."
      onInput={(event) => onInput(readEditorParagraphs(event.currentTarget))}
      onMouseDown={(event) => { if (openMarker(event.target)) event.preventDefault(); }}
      onClick={(event) => {
        const remove = event.target instanceof Element ? event.target.closest("[data-remove-figure]") : null;
        if (remove === null) return;
        remove.closest("figure")?.remove();
        onInput(readEditorParagraphs(event.currentTarget));
      }}
      onKeyDown={(event) => {
        // A caption is one line.
        if (event.key === "Enter" && event.target instanceof Element && event.target.closest("figcaption") !== null) event.preventDefault();
      }}
      onPaste={(event) => {
        const files = pictureFiles(event.clipboardData);
        if (files.length === 0) return;
        event.preventDefault();
        onInsertImages(files, window.getSelection()?.anchorNode ?? null);
      }}
      onDragOver={(event) => { if (event.dataTransfer.types.includes("Files")) event.preventDefault(); }}
      onDrop={(event) => {
        const files = pictureFiles(event.dataTransfer);
        if (files.length === 0) return;
        event.preventDefault();
        onInsertImages(files, document.caretRangeFromPoint?.(event.clientX, event.clientY)?.startContainer ?? (event.target instanceof Node ? event.target : null));
      }}
      onBlur={onBlur}
    >
      {initial.blocks.map((block) => block.image !== undefined ? (
        <figure key={block.nodeId} className="doc-figure" data-node-id={block.nodeId} data-image={block.image} contentEditable={false}>
          <img src={`/api/images/${block.image}`} alt={block.text || "Resim"} draggable={false} />
          <div className="figure-caption-row">
            <span className="figure-number" data-prefix={figurePrefix} aria-hidden="true" />
            <figcaption contentEditable suppressContentEditableWarning data-placeholder="Resim açıklaması yazın">{block.text}</figcaption>
          </div>
          <button className="figure-remove" type="button" title="Resmi kaldır" data-remove-figure>×</button>
        </figure>
      ) : (
        <p key={block.nodeId} data-node-id={block.nodeId}>
          {paragraphParts(block).map((part, index) => typeof part === "string"
            ? part
            : <EvidenceMarkerChip key={`${part.linkId}-${index}`} linkId={part.linkId} link={initial.evidence.find((link) => link.id === part.linkId)} />)}
        </p>
      ))}
    </div>
  );
}

function EvidenceMarkerChip({ linkId, link }: { linkId: string; link: EvidenceLink | undefined }) {
  const kind = link?.status === "PARAPHRASE" ? "paraphrase" : "quote";
  return (
    <span
      className={`evidence-marker ${kind}`}
      contentEditable={false}
      data-link-id={linkId}
      title={link === undefined ? "Alıntı" : `${kind === "quote" ? "Alıntı" : "Paraphrase"}: ${link.sourceTitle}, s. ${link.pageNumber}. Tıklayınca PDF'te gösterir; silerseniz bağlantı da silinir.`}
    >
      ❞{link === undefined ? "" : ` s.${link.pageNumber}`}
    </span>
  );
}

function paragraphParts(block: DocumentBlock): Array<string | { linkId: string }> {
  const parts: Array<string | { linkId: string }> = [];
  let position = 0;
  for (const link of [...(block.links ?? [])].sort((a, b) => a.offset - b.offset)) {
    if (link.offset > position) parts.push(block.text.slice(position, link.offset));
    parts.push({ linkId: link.linkId });
    position = Math.max(position, link.offset);
  }
  if (position < block.text.length) parts.push(block.text.slice(position));
  return parts;
}

// Reads the writing area back into paragraphs, recording where each marker sits in the text.
function readEditorParagraphs(root: HTMLElement): EditorParagraph[] {
  return readEditorBlocks(root, null).paragraphs;
}

// Also reports where something inserted just after the anchor node's paragraph would go in the
// returned list: the end when there is no anchor.
function readEditorBlocks(root: HTMLElement, anchor: Node | null): { paragraphs: EditorParagraph[]; insertAt: number } {
  const blocks: Array<{ paragraph: EditorParagraph; node: Node }> = [];
  let loose: EditorParagraph | null = null;
  const collect = (node: Node, paragraph: EditorParagraph): void => {
    if (node.nodeType === Node.TEXT_NODE) {
      paragraph.text += (node.textContent ?? "").replace(/\u00a0/g, " ").replace(/\u200b/g, "");
      return;
    }
    if (!(node instanceof HTMLElement)) return;
    const linkId = node.getAttribute("data-link-id");
    if (linkId !== null) {
      paragraph.links.push({ linkId, offset: paragraph.text.length });
      return;
    }
    if (node.tagName === "BR" || node.tagName === "FIGURE") return;
    node.childNodes.forEach((child) => collect(child, paragraph));
  };
  root.childNodes.forEach((node) => {
    if (node instanceof HTMLElement && node.tagName === "FIGURE") {
      loose = null;
      const image = node.getAttribute("data-image");
      const nodeId = node.getAttribute("data-node-id");
      if (image === null) return;
      const caption = (node.querySelector("figcaption")?.textContent ?? "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
      blocks.push({ paragraph: { ...(nodeId === null ? {} : { nodeId }), text: caption, links: [], image }, node });
      return;
    }
    const isBlock = node instanceof HTMLElement && ["P", "DIV"].includes(node.tagName);
    if (!isBlock) {
      if (loose === null) {
        loose = { text: "", links: [] };
        blocks.push({ paragraph: loose, node });
      }
      collect(node, loose);
      return;
    }
    loose = null;
    const nodeId = node.getAttribute("data-node-id");
    const paragraph: EditorParagraph = { ...(nodeId === null ? {} : { nodeId }), text: "", links: [] };
    node.childNodes.forEach((child) => collect(child, paragraph));
    blocks.push({ paragraph, node });
  });
  const anchorBlock = anchor === null ? -1 : blocks.findIndex((block) => block.node === anchor || block.node.contains(anchor));
  const kept = blocks.filter((block) => block.paragraph.image !== undefined || block.paragraph.text.trim().length > 0 || block.paragraph.links.length > 0);
  const insertAt = anchorBlock < 0 ? kept.length : kept.filter((block) => blocks.indexOf(block) <= anchorBlock).length;
  return { paragraphs: kept.map((block) => block.paragraph), insertAt };
}

function ParaphraseDialog({ selection, sourceTitle, sections, defaultSectionId, hasApiKey, onOpenSettings, onClose, onInsert }: {
  selection: PendingSelection;
  sourceTitle: string;
  sections: DocumentSection[];
  defaultSectionId: string;
  hasApiKey: boolean;
  onOpenSettings: () => void;
  onClose: () => void;
  onInsert: (note: string, sectionId: string, paraphrase?: string) => Promise<void>;
}) {
  const isParaphrase = selection.action === "paraphrase";
  const [note, setNote] = useState("");
  const [sectionId, setSectionId] = useState(defaultSectionId);
  const [language, setLanguage] = useState(readStorage("research-workspace.paraphrase-language") ?? "tr");
  const [alternatives, setAlternatives] = useState<Alternative[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paraphrase, setParaphrase] = useState("");
  const [inserting, setInserting] = useState(false);
  const [copied, setCopied] = useState(false);

  async function copyRequest(): Promise<void> {
    writeStorage("research-workspace.paraphrase-language", language);
    await copyText(buildParaphraseRequest(selection.text, note, language));
    setCopied(true);
  }

  async function loadAlternatives(): Promise<void> {
    setLoading(true);
    setError(null);
    writeStorage("research-workspace.paraphrase-language", language);
    try {
      const response = await fetch("/api/paraphrase", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: selection.text, note, language }) });
      const payload: unknown = await response.json();
      if (!response.ok || typeof payload !== "object" || payload === null || !("alternatives" in payload) || !Array.isArray(payload.alternatives)) {
        setError(getErrorMessage(payload));
        return;
      }
      setAlternatives(payload.alternatives as Alternative[]);
    } catch {
      setError("Öneriler alınamadı.");
    } finally {
      setLoading(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setInserting(true);
    await onInsert(note.trim(), sectionId, isParaphrase ? paraphrase.trim() : undefined);
    setInserting(false);
  }

  return (
    <div className="dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <form className="app-dialog" role="dialog" aria-modal="true" aria-labelledby="paraphrase-heading" onSubmit={submit}>
        <div className="dialog-header">
          <h2 id="paraphrase-heading">{isParaphrase ? "Paraphrase" : "Alıntı ekle"}</h2>
          <button className="delete-button" type="button" title="Kapat" onClick={onClose}>×</button>
        </div>
        <p className="muted">{sourceTitle}, sayfa {selection.pageNumber}</p>
        <blockquote>{selection.text}</blockquote>

        <label htmlFor="paraphrase-note">Neden bu alıntıyı alıyorum? (sonradan hatırlamak için)</label>
        <textarea id="paraphrase-note" rows={2} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Ör. Giriş bölümünde yöntem seçimini desteklemek için" />

        {isParaphrase ? <>
          <div className="suggestion-controls">
            <select aria-label="Paraphrase dili" value={language} onChange={(event) => setLanguage(event.target.value)}>
              <option value="tr">Türkçe</option>
              <option value="en">İngilizce</option>
              <option value="source">Kaynağın dilinde</option>
            </select>
            <button className="secondary-button" type="button" onClick={() => void copyRequest()}>{copied ? "Kopyalandı" : "İsteği kopyala"}</button>
            {hasApiKey
              ? <button className="secondary-button" type="button" disabled={loading} onClick={() => void loadAlternatives()}>{loading ? "Öneriler hazırlanıyor…" : alternatives.length === 0 ? "Alternatifler öner" : "Yeniden öner"}</button>
              : <button className="link-like" type="button" onClick={onOpenSettings}>API anahtarım var</button>}
          </div>
          {copied ? <p className="muted">İsteği ChatGPT'ye ya da Claude'a yapıştırın, beğendiğiniz cevabı aşağıdaki kutuya yapıştırın.</p> : null}
          {error === null ? null : <p className="error" role="alert">{error}</p>}
          {alternatives.length === 0 ? null : <div className="alternatives">
            {alternatives.map((alternative, index) => (
              <button key={`${index}-${alternative.style}`} type="button" className={`alternative ${paraphrase === alternative.text ? "chosen" : ""}`} onClick={() => setParaphrase(alternative.text)}>
                <span className="alternative-style">{alternative.style}</span>
                {alternative.text}
              </button>
            ))}
          </div>}
          <label htmlFor="paraphrase-text">Benim paraphrase'im (yazın ya da bir öneriyi yapıştırıp düzenleyin)</label>
          <textarea id="paraphrase-text" rows={5} required value={paraphrase} onChange={(event) => setParaphrase(event.target.value)} placeholder="Fikri kendi akademik cümlelerinizle yazın" />
        </> : null}

        <div className="dialog-footer">
          <label htmlFor="paraphrase-section">Eklenecek bölüm</label>
          <select id="paraphrase-section" value={sectionId} onChange={(event) => setSectionId(event.target.value)}>
            {sections.map((section) => <option key={section.id} value={section.id}>{section.title || "Başlıksız bölüm"}</option>)}
          </select>
          <button type="submit" disabled={inserting || (isParaphrase && paraphrase.trim().length === 0)}>{inserting ? "Ekleniyor…" : "Referansla ekle"}</button>
        </div>
      </form>
    </div>
  );
}

interface UpdateSettings {
  isDesktop: boolean;
  hasUpdateToken: boolean;
  openAtLogin: boolean;
  updateStatus: { message: string; at: string } | null;
}

function SettingsDialog({ hasApiKey, figureLabel, onFigureLabel, onClose, onSaved }: { hasApiKey: boolean; figureLabel: string; onFigureLabel: (label: string) => void; onClose: () => void; onSaved: (hasApiKey: boolean) => void }) {
  const [apiKey, setApiKey] = useState("");
  const [updateToken, setUpdateToken] = useState("");
  const [updates, setUpdates] = useState<UpdateSettings>({ isDesktop: false, hasUpdateToken: false, openAtLogin: true, updateStatus: null });
  const [updateMessage, setUpdateMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Polled while open so a check started by saving the token shows its outcome here.
  useEffect(() => {
    const load = () => void fetch("/api/settings").then(async (response) => response.ok ? response.json() : null).then((payload: Partial<UpdateSettings> | null) => {
      if (payload !== null) setUpdates({ isDesktop: payload.isDesktop === true, hasUpdateToken: payload.hasUpdateToken === true, openAtLogin: payload.openAtLogin !== false, updateStatus: payload.updateStatus ?? null });
    });
    load();
    const timer = setInterval(load, 4000);
    return () => clearInterval(timer);
  }, []);

  async function put(body: Record<string, string | boolean>): Promise<Record<string, unknown> | null> {
    const response = await fetch("/api/settings", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const payload: unknown = await response.json();
    if (!response.ok || typeof payload !== "object" || payload === null || !("hasApiKey" in payload)) {
      setError(getErrorMessage(payload));
      return null;
    }
    return payload as Record<string, unknown>;
  }

  async function saveApiKey(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const payload = await put({ apiKey });
    if (payload !== null) onSaved(payload.hasApiKey === true);
  }

  async function saveUpdateToken(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const payload = await put({ updateToken });
    if (payload === null) return;
    setUpdates((current) => ({ ...current, hasUpdateToken: payload.hasUpdateToken === true }));
    setUpdateToken("");
    setUpdateMessage(payload.hasUpdateToken === true ? "Kaydedildi. Program güncellemeleri bu anahtarla kontrol edecek." : "Anahtar silindi.");
  }

  async function saveOpenAtLogin(openAtLogin: boolean): Promise<void> {
    setUpdates((current) => ({ ...current, openAtLogin }));
    const payload = await put({ openAtLogin });
    if (payload !== null) setUpdates((current) => ({ ...current, openAtLogin: payload.openAtLogin !== false }));
  }

  return (
    <div className="dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="app-dialog" role="dialog" aria-modal="true" aria-labelledby="settings-heading">
        <div className="dialog-header">
          <h2 id="settings-heading">Ayarlar</h2>
          <button className="delete-button" type="button" title="Kapat" onClick={onClose}>×</button>
        </div>
        <form className="settings-section" onSubmit={saveApiKey}>
          <h3>Paraphrase önerileri</h3>
          <p>Paraphrase önerileri Claude yapay zekâsıyla hazırlanır. Bunun için bir Anthropic API anahtarı gerekir (console.anthropic.com adresinden alınır). Anahtar yalnızca bu bilgisayarda saklanır; öneri isterken seçtiğiniz metin Anthropic'e gönderilir.</p>
          <p className="muted">{hasApiKey ? "Bir anahtar kayıtlı. Değiştirmek için yenisini girin, silmek için boş bırakıp kaydedin." : "Henüz anahtar girilmedi."}</p>
          <label htmlFor="api-key">Anthropic API anahtarı</label>
          <input id="api-key" type="password" autoComplete="off" value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder="sk-ant-..." />
          <div className="dialog-footer">
            <button type="submit">Kaydet</button>
          </div>
        </form>
        <div className="settings-section">
          <h3>Resim yazıları</h3>
          <label htmlFor="figure-label">Resimlerin altındaki numara</label>
          <select id="figure-label" value={figureLabel} onChange={(event) => {
            const label = event.target.value;
            onFigureLabel(label);
            void put({ figureLabel: label });
          }}>
            <option value="Şekil">Şekil 1.1, Şekil 1.2 …</option>
            <option value="Figure">Figure 1.1, Figure 1.2 …</option>
          </select>
          <p className="muted">İlk sayı bölümün sırası, ikincisi o bölümdeki resmin sırasıdır. Word'e aktarınca Word'ün kendi "Resim Yazısı" olarak gelir; Word'de şekiller listesi de oluşturabilirsiniz.</p>
        </div>
        {updates.isDesktop ? (
          <div className="settings-section">
            <h3>Açılış</h3>
            <label className="checkbox-row">
              <input type="checkbox" checked={updates.openAtLogin} onChange={(event) => void saveOpenAtLogin(event.target.checked)} />
              Bilgisayar açılınca programı başlat
            </label>
            <p className="muted">Program her açılışta en son çalıştığınız projeye, bölüme, PDF'e ve sayfaya döner. Yazdıklarınız ve notlarınız siz yazarken kaydedilir.</p>
          </div>
        ) : null}
        {updates.isDesktop ? (
          <form className="settings-section" onSubmit={saveUpdateToken}>
            <h3>Otomatik güncelleme</h3>
            <p>Güncellemeler gizli GitHub deposundan indirilir. Bunun için GitHub'da oluşturduğunuz, yalnızca okuma izni olan erişim anahtarını buraya bir kez girin. Anahtar yalnızca bu bilgisayarda saklanır.</p>
            <p className="muted">{updates.hasUpdateToken ? "Bir anahtar kayıtlı. Değiştirmek için yenisini girin, silmek için boş bırakıp kaydedin." : "Henüz anahtar girilmedi."}</p>
            <label htmlFor="update-token">GitHub erişim anahtarı</label>
            <input id="update-token" type="password" autoComplete="off" value={updateToken} onChange={(event) => setUpdateToken(event.target.value)} placeholder="github_pat_..." />
            {updateMessage === null ? null : <p className="success" role="status">{updateMessage}</p>}
            {updates.updateStatus === null ? null : <p className="muted">Son kontrol ({new Date(updates.updateStatus.at).toLocaleString("tr-TR")}): {updates.updateStatus.message}</p>}
            <div className="dialog-footer">
              <button type="submit">Kaydet</button>
            </div>
          </form>
        ) : null}
        {error === null ? null : <p className="error" role="alert">{error}</p>}
      </div>
    </div>
  );
}

// A ready-made request for any chat assistant, for people who use the app without an API key.
function buildParaphraseRequest(text: string, note: string, language: string): string {
  const target = language === "en" ? "İngilizce" : language === "source" ? "metnin kendi dilinde" : "Türkçe";
  return [
    `Aşağıdaki akademik alıntıyı ${target} olarak 4 farklı şekilde paraphrase et.`,
    "Anlamı, iddiaları ve temkinli ifadeleri aynen koru; yeni bilgi, örnek ya da yorum ekleme.",
    "Seçenekler yaklaşım olarak farklı olsun: yakın akademik ifade, cümle yapısı değiştirilmiş hali, kısa özet ve daha sade bir anlatım.",
    "Teknik terimler ve özel adlar dışında alıntıdan art arda dörtten fazla kelime kopyalama. Kaynak, tırnak işareti veya sayfa numarası ekleme.",
    ...(note.trim() ? [`Bu alıntıyı şu amaçla kullanıyorum: ${note.trim()}`] : []),
    "",
    "Alıntı:",
    `"${text}"`
  ].join("\n");
}

async function copyText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const area = document.createElement("textarea");
    area.value = text;
    document.body.append(area);
    area.select();
    document.execCommand("copy");
    area.remove();
  }
}

function getErrorMessage(value: unknown): string {
  return typeof value === "object" && value !== null && "error" in value && typeof value.error === "string" ? value.error : "İşlem tamamlanamadı.";
}
