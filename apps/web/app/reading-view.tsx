"use client";

import { useEffect, useRef, useState } from "react";

import { readStorage, writeStorage } from "./browser-storage";
import { type PdfHighlight, type PdfOutlineEntry, PdfReader, type SelectionAction } from "./pdf-reader";

export interface ReadingNote {
  id: string;
  pageNumber: number;
  selectedText: string;
  content: string;
  createdAt: string;
}

export interface ReadingSource {
  id: string;
  title: string;
  pdfUrl: string;
  notes: ReadingNote[];
}

interface ReadingViewProps {
  projectId: string;
  sources: ReadingSource[];
  sourceId: string;
  // Passages already paraphrased or quoted into the text, shown as in the writing screen.
  quoteHighlights: PdfHighlight[];
  onSourceChange: (sourceId: string) => void;
  // Paraphrase and quote open the same dialog as in the writing screen.
  onPassage: (action: SelectionAction, text: string, pageNumber: number) => void;
  onClose: () => void;
  onNotesChanged: () => Promise<void>;
  notify: (kind: "success" | "error", text: string) => void;
}

const zoomKey = "research-workspace.reading-zoom";
const notesOpenKey = "research-workspace.reading-notes-open";
const zoomSteps = [0.6, 0.75, 0.9, 1, 1.15, 1.3, 1.5, 1.75, 2];

// A quiet screen for reading one PDF and writing notes beside it. Each note belongs to the page it
// was written on and, when it was started from a selection, to that passage too.
export function ReadingView({ projectId, sources, sourceId, quoteHighlights, onSourceChange, onPassage, onClose, onNotesChanged, notify }: ReadingViewProps) {
  const source = sources.find((item) => item.id === sourceId) ?? sources[0];
  const [zoom, setZoom] = useState(1);
  const [showNotes, setShowNotes] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [info, setInfo] = useState<{ numPages: number; outline: PdfOutlineEntry[] }>({ numPages: 0, outline: [] });
  const [jumpToPage, setJumpToPage] = useState<{ page: number; token: number } | null>(null);
  const [draft, setDraft] = useState("");
  const [draftPassage, setDraftPassage] = useState<{ text: string; pageNumber: number } | null>(null);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null);
  const draftRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const storedZoom = Number(readStorage(zoomKey));
    if (zoomSteps.includes(storedZoom)) setZoom(storedZoom);
    if (readStorage(notesOpenKey) === "false") setShowNotes(false);
  }, []);

  useEffect(() => {
    setDraftPassage(null);
    setEditing(null);
    setInfo({ numPages: 0, outline: [] });
  }, [source?.id]);

  if (source === undefined) {
    return (
      <div className="reading-view">
        <header className="reading-bar">
          <button className="ghost-button" type="button" onClick={onClose}>← Yazmaya dön</button>
        </header>
        <p className="muted reader-empty">Okumak için önce soldaki Kaynaklar bölümünden bir PDF ekleyin.</p>
      </div>
    );
  }

  const notes = [...source.notes].sort((first, second) => first.pageNumber - second.pageNumber || first.createdAt.localeCompare(second.createdAt));
  const draftPage = draftPassage?.pageNumber ?? currentPage;
  const highlights = [...quoteHighlights, ...notes.filter((note) => note.selectedText.length > 0).map((note) => ({ id: note.id, pageNumber: note.pageNumber, text: note.selectedText, kind: "note" as const }))];

  function changeZoom(direction: 1 | -1): void {
    const index = zoomSteps.indexOf(zoom);
    const next = zoomSteps[Math.min(zoomSteps.length - 1, Math.max(0, index + direction))] ?? 1;
    setZoom(next);
    writeStorage(zoomKey, String(next));
  }

  function toggleNotes(): void {
    setShowNotes((current) => {
      writeStorage(notesOpenKey, String(!current));
      return !current;
    });
  }

  function goToPage(page: number): void {
    setJumpToPage({ page, token: Date.now() });
  }

  function handleSelection(action: SelectionAction, text: string, pageNumber: number): void {
    if (action !== "note") {
      onPassage(action, text, pageNumber);
      return;
    }
    setDraftPassage({ text, pageNumber });
    if (!showNotes) toggleNotes();
    setTimeout(() => draftRef.current?.focus(), 0);
  }

  async function saveDraft(): Promise<void> {
    if (source === undefined || draft.trim().length === 0 || saving) return;
    setSaving(true);
    const response = await fetch(`/api/projects/${projectId}/sources/${source.id}/annotations`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind: "note", note: draft.trim(), selectedText: draftPassage?.text ?? "", pageNumber: draftPage })
    });
    setSaving(false);
    if (!response.ok) {
      notify("error", "Not kaydedilemedi. Lütfen tekrar deneyin.");
      return;
    }
    setDraft("");
    setDraftPassage(null);
    await onNotesChanged();
  }

  async function saveEdit(): Promise<void> {
    if (source === undefined || editing === null || editing.text.trim().length === 0) return;
    const response = await fetch(`/api/projects/${projectId}/sources/${source.id}/annotations/${editing.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ note: editing.text })
    });
    if (!response.ok) {
      notify("error", "Not kaydedilemedi. Lütfen tekrar deneyin.");
      return;
    }
    setEditing(null);
    await onNotesChanged();
  }

  async function deleteNote(note: ReadingNote): Promise<void> {
    if (source === undefined || !window.confirm("Bu not silinsin mi?")) return;
    const response = await fetch(`/api/projects/${projectId}/sources/${source.id}/annotations/${note.id}`, { method: "DELETE" });
    if (!response.ok) {
      notify("error", "Not silinemedi. Lütfen tekrar deneyin.");
      return;
    }
    await onNotesChanged();
  }

  return (
    <div className={`reading-view${showNotes ? " with-notes" : ""}`}>
      <header className="reading-bar">
        <button className="ghost-button" type="button" title="Yazma ekranına dön" onClick={onClose}>← Yazmaya dön</button>
        <select className="reading-source" aria-label="Okunan PDF" value={source.id} onChange={(event) => onSourceChange(event.target.value)}>
          {sources.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
        </select>
        <span className="spacer" />
        {info.outline.length === 0 ? null : (
          <select className="reading-outline" aria-label="İçindekiler" value="" onChange={(event) => goToPage(Number(event.target.value))}>
            <option value="">İçindekiler</option>
            {info.outline.map((entry, index) => <option key={`${index}-${entry.page}`} value={entry.page}>{"  ".repeat(entry.depth)}{entry.title} (s. {entry.page})</option>)}
          </select>
        )}
        <span className="reading-page muted">{info.numPages === 0 ? "" : `${currentPage} / ${info.numPages}`}</span>
        <span className="reading-zoom">
          <button className="ghost-button" type="button" title="Küçült" disabled={zoom === zoomSteps[0]} onClick={() => changeZoom(-1)}>−</button>
          <span className="muted">%{Math.round(zoom * 100)}</span>
          <button className="ghost-button" type="button" title="Büyüt" disabled={zoom === zoomSteps.at(-1)} onClick={() => changeZoom(1)}>+</button>
        </span>
        <button className={`ghost-button${showNotes ? " active" : ""}`} type="button" onClick={toggleNotes}>Notlar{notes.length === 0 ? "" : ` (${notes.length})`}</button>
      </header>

      <section className="reading-pdf" aria-label="PDF">
        <PdfReader
          url={source.pdfUrl}
          jumpToPage={jumpToPage}
          highlights={highlights}
          actions={["note", "paraphrase", "quote"]}
          maxPageWidth={860}
          zoom={zoom}
          hideOutline
          onSelection={handleSelection}
          onDocumentInfo={setInfo}
          onPageChange={setCurrentPage}
        />
      </section>

      {showNotes ? (
        <aside className="reading-notes" aria-label="Notlar">
          <form className="note-composer" onSubmit={(event) => { event.preventDefault(); void saveDraft(); }}>
            <p className="muted">Sayfa {draftPage} için not</p>
            {draftPassage === null ? null : (
              <blockquote className="note-passage">
                {draftPassage.text}
                <button className="delete-button" type="button" title="Seçili metni çıkar" onClick={() => setDraftPassage(null)}>×</button>
              </blockquote>
            )}
            <textarea
              ref={draftRef}
              aria-label="Yeni not"
              placeholder="Notunuzu yazın…"
              rows={3}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => { if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) void saveDraft(); }}
            />
            <div className="note-composer-actions">
              <span className="muted">Metni seçip sağ tıklayarak o kısma not ekleyebilir ya da paraphrase yapabilirsiniz.</span>
              <button type="submit" disabled={draft.trim().length === 0 || saving}>Kaydet</button>
            </div>
          </form>

          {notes.length === 0 ? <p className="muted notes-empty">Bu PDF için henüz not yok.</p> : (
            <ul className="note-list">
              {notes.map((note) => (
                <li key={note.id} className={note.pageNumber === currentPage ? "current" : ""}>
                  {editing?.id === note.id ? (
                    <form onSubmit={(event) => { event.preventDefault(); void saveEdit(); }}>
                      <textarea aria-label="Notu düzenle" rows={3} value={editing.text} autoFocus onChange={(event) => setEditing({ id: note.id, text: event.target.value })} onKeyDown={(event) => { if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) void saveEdit(); }} />
                      <div className="note-actions">
                        <button className="ghost-button" type="button" onClick={() => setEditing(null)}>Vazgeç</button>
                        <button type="submit" disabled={editing.text.trim().length === 0}>Kaydet</button>
                      </div>
                    </form>
                  ) : (
                    <>
                      <button className="note-body" type="button" title={`Sayfa ${note.pageNumber}'e git`} onClick={() => goToPage(note.pageNumber)}>
                        <span className="note-page">s. {note.pageNumber}</span>
                        {note.selectedText ? <span className="note-passage">{note.selectedText}</span> : null}
                        <span className="note-text">{note.content}</span>
                      </button>
                      <div className="note-actions">
                        <button className="ghost-button" type="button" onClick={() => setEditing({ id: note.id, text: note.content })}>Düzenle</button>
                        <button className="ghost-button danger" type="button" onClick={() => void deleteNote(note)}>Sil</button>
                      </div>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
        </aside>
      ) : null}
    </div>
  );
}
