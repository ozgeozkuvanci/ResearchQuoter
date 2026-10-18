"use client";

import type { FormEvent } from "react";
import { useCallback, useEffect, useRef, useState } from "react";

import { type PdfDetails, readPdfDetails } from "./pdf-metadata";
import { PdfReader, type SelectionAction } from "./pdf-reader";

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
  status: string;
  note: string;
}

interface DocumentBlock {
  nodeId: string;
  text: string;
}

interface DocumentSection {
  id: string;
  title: string;
  blocks: DocumentBlock[];
}

interface PendingSelection {
  action: SelectionAction;
  text: string;
  pageNumber: number;
  sourceId: string;
}

interface Alternative {
  style: string;
  text: string;
}

const activeProjectKey = "research-workspace.active-project";

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
  const [hasApiKey, setHasApiKey] = useState(false);
  const [pending, setPending] = useState<PendingSelection | null>(null);
  const [saveState, setSaveState] = useState<"saved" | "saving" | "unsaved">("saved");
  const [message, setMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const editorTextRef = useRef("");
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

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
    setSections(payload.sections ?? []);
    setEvidence(payload.evidence ?? []);
    setDocumentRevision(payload.revision ?? 0);
    setSelectedSectionId((current) => payload.sections?.some((section) => section.id === current) ? current : payload.sections?.[0]?.id ?? "");
    const bibliographyResponse = await fetch(`/api/projects/${projectId}/bibliography`);
    const bibliographyPayload = bibliographyResponse.ok ? await bibliographyResponse.json() as { entries?: string[] } : {};
    setBibliography(bibliographyPayload.entries ?? []);
  }, []);

  const loadSources = useCallback(async (projectId: string, preferredId?: string) => {
    const response = await fetch(`/api/projects/${projectId}/sources`);
    const items: Source[] = response.ok ? await response.json() : [];
    setSources(items);
    setSelectedSourceId((current) => {
      for (const candidate of [preferredId, current]) {
        if (candidate && items.some((source) => source.id === candidate)) return candidate;
      }
      return items[0]?.id ?? "";
    });
  }, []);

  useEffect(() => {
    void loadProjects();
    void fetch("/api/settings").then(async (response) => response.ok ? response.json() : { hasApiKey: false }).then((payload: { hasApiKey: boolean }) => setHasApiKey(payload.hasApiKey));
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

  function notify(kind: "success" | "error", text: string): void {
    setMessage({ kind, text });
    if (kind === "success") setTimeout(() => setMessage((current) => current?.text === text ? null : current), 4000);
  }

  async function saveSection(update: { title?: string; text?: string }, sectionId = selectedSection?.id): Promise<boolean> {
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
    const payload = await response.json() as { section: DocumentSection };
    setSections((current) => current.map((section) => section.id === payload.section.id ? payload.section : section));
    setSaveState("saved");
    return true;
  }

  async function flushPendingSave(): Promise<void> {
    if (saveTimerRef.current === undefined) return;
    clearTimeout(saveTimerRef.current);
    saveTimerRef.current = undefined;
    await saveSection({ text: editorTextRef.current });
  }

  function handleEditorInput(text: string): void {
    editorTextRef.current = text;
    setSaveState("unsaved");
    clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveTimerRef.current = undefined;
      void saveSection({ text: editorTextRef.current });
    }, 800);
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
      body: JSON.stringify({ title: `Bölüm ${sections.length + 1}`, text: "" })
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

  function handleSelection(action: SelectionAction, text: string, pageNumber: number): void {
    if (!selectedSourceId) return;
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

  const sectionEvidence = evidence.filter((link) => selectedSection?.blocks.some((block) => block.nodeId === link.targetNodeId));

  return (
    <div className="workspace">
      <header className="topbar">
        <strong className="brand">Research Workspace</strong>
        <select aria-label="Aktif proje" value={selectedProjectId} onChange={(event) => setSelectedProjectId(event.target.value)}>
          {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
        </select>
        <form className="inline-form" onSubmit={createProject}>
          <input aria-label="Yeni proje adı" placeholder="Yeni proje" value={newProjectName} onChange={(event) => setNewProjectName(event.target.value)} maxLength={160} required />
          <button className="secondary-button" type="submit">Oluştur</button>
        </form>
        <span className="spacer" />
        {selectedProjectId ? <span className="export-links">Dışa aktar: <a href={`/api/projects/${selectedProjectId}/export?format=docx`}>Word</a> <a href={`/api/projects/${selectedProjectId}/export?format=latex`}>LaTeX</a></span> : null}
        <button className="secondary-button" type="button" onClick={() => setShowSettings(true)}>Ayarlar</button>
      </header>

      {message === null ? null : <p className={`toast ${message.kind}`} role="status" onClick={() => setMessage(null)}>{message.text}</p>}

      <aside className="sidebar">
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
                <span className="muted">{source.author ?? ""}{source.captures.length > 0 ? ` · ${source.captures.length} alıntı` : ""}</span>
              </button>
            </li>
          ))}
        </ul>
      </aside>

      <main className="editor-column">
        {selectedSection === undefined ? null : <>
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
          <p className="save-state muted">{saveState === "saved" ? "Kaydedildi" : saveState === "saving" ? "Kaydediliyor…" : "Değişiklikler kaydedilecek…"}</p>
          <EditorArea
            key={`${selectedSection.id}-${documentRevision}`}
            blocks={selectedSection.blocks}
            evidence={evidence}
            onInput={handleEditorInput}
            onBlur={() => void flushPendingSave()}
            onOpenEvidence={openEvidence}
          />
          {sectionEvidence.length === 0 ? null : <div className="evidence-links">
            <h3>Bu bölümdeki referanslar</h3>
            {sectionEvidence.map((link) => <button className="link-button" type="button" key={link.id} onClick={() => openEvidence(link)}>{link.sourceTitle}, s. {link.pageNumber}{link.note ? ` — ${link.note}` : ""}</button>)}
          </div>}
          {bibliography.length === 0 ? null : <details className="bibliography">
            <summary>Kaynakça (APA 7)</summary>
            {bibliography.map((entry, index) => <p key={`${entry}-${index}`}>{entry}</p>)}
          </details>}
        </>}
      </main>

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
          : <PdfReader url={selectedSource.pdfUrl} jumpToPage={jumpToPage} onSelection={handleSelection} />}
      </section>

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

      {showSettings ? <SettingsDialog hasApiKey={hasApiKey} onClose={() => setShowSettings(false)} onSaved={(value) => { setHasApiKey(value); setShowSettings(false); }} /> : null}
    </div>
  );
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
function EditorArea({ blocks, evidence, onInput, onBlur, onOpenEvidence }: {
  blocks: DocumentBlock[];
  evidence: EvidenceLink[];
  onInput: (text: string) => void;
  onBlur: () => void;
  onOpenEvidence: (link: EvidenceLink) => void;
}) {
  const [initialBlocks] = useState(blocks);
  return (
    <div
      className="document-writing-area"
      aria-label="Bölüm metni"
      aria-multiline="true"
      contentEditable
      role="textbox"
      suppressContentEditableWarning
      data-placeholder="Yazmaya başlayın. PDF'te bir metni seçip sağ tıklayarak paraphrase'ini buraya ekleyebilirsiniz."
      onInput={(event) => onInput(event.currentTarget.innerText)}
      onBlur={onBlur}
    >
      {initialBlocks.map((block) => {
        const link = evidence.find((candidate) => candidate.targetNodeId === block.nodeId);
        return link === undefined
          ? <p key={block.nodeId}>{block.text}</p>
          : <p key={block.nodeId}><button className={`inline-evidence-token ${link.status === "PARAPHRASE" ? "paraphrase" : "quote"}`} type="button" contentEditable={false} onMouseDown={(event) => { event.preventDefault(); event.stopPropagation(); onOpenEvidence(link); }} onClick={(event) => { event.preventDefault(); event.stopPropagation(); }} title={`${link.sourceTitle}, s. ${link.pageNumber} — tıklayınca kaynağı açar`}>{block.text}</button></p>;
      })}
    </div>
  );
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
      <form className="dialog" role="dialog" aria-modal="true" aria-labelledby="paraphrase-heading" onSubmit={submit}>
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
  updateStatus: { message: string; at: string } | null;
}

function SettingsDialog({ hasApiKey, onClose, onSaved }: { hasApiKey: boolean; onClose: () => void; onSaved: (hasApiKey: boolean) => void }) {
  const [apiKey, setApiKey] = useState("");
  const [updateToken, setUpdateToken] = useState("");
  const [updates, setUpdates] = useState<UpdateSettings>({ isDesktop: false, hasUpdateToken: false, updateStatus: null });
  const [updateMessage, setUpdateMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Polled while open so a check started by saving the token shows its outcome here.
  useEffect(() => {
    const load = () => void fetch("/api/settings").then(async (response) => response.ok ? response.json() : null).then((payload: Partial<UpdateSettings> | null) => {
      if (payload !== null) setUpdates({ isDesktop: payload.isDesktop === true, hasUpdateToken: payload.hasUpdateToken === true, updateStatus: payload.updateStatus ?? null });
    });
    load();
    const timer = setInterval(load, 4000);
    return () => clearInterval(timer);
  }, []);

  async function put(body: Record<string, string>): Promise<Record<string, unknown> | null> {
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

  return (
    <div className="dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="settings-heading">
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

function readStorage(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Remembering the last choice is a convenience only.
  }
}
