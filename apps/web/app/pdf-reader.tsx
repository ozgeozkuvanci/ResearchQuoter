"use client";

import "pdfjs-dist/web/pdf_viewer.css";

import type { PDFDocumentProxy } from "pdfjs-dist";
import { useEffect, useRef, useState } from "react";

import { pdfAssetOptions } from "./pdf-options";

export type SelectionAction = "paraphrase" | "quote" | "note";

export interface PdfHighlight {
  id: string;
  pageNumber: number;
  text: string;
  kind: "quote" | "paraphrase" | "note";
}

export interface PdfOutlineEntry {
  title: string;
  page: number;
  depth: number;
}

interface PdfReaderProps {
  url: string;
  jumpToPage: { page: number; token: number } | null;
  highlights: PdfHighlight[];
  onSelection: (action: SelectionAction, text: string, pageNumber: number) => void;
  // What right-clicking a selection offers; copying is always there.
  actions?: SelectionAction[];
  // Pages are as wide as the reader, up to maxPageWidth, then multiplied by zoom.
  maxPageWidth?: number;
  zoom?: number;
  // The reading screen shows the table of contents in its own bar instead of above the pages.
  hideOutline?: boolean;
  onDocumentInfo?: (info: { numPages: number; outline: PdfOutlineEntry[] }) => void;
  onPageChange?: (pageNumber: number) => void;
}

const actionLabels: Record<SelectionAction, string> = { paraphrase: "Paraphrase", quote: "Alıntı olarak ekle", note: "Not ekle" };

interface MenuState {
  x: number;
  y: number;
  text: string;
  pageNumber: number;
}


// Renders a PDF with selectable text. Right-clicking a selection offers to paraphrase or quote it,
// and reports the page the selection starts on so the citation can point back to it.
export function PdfReader({ url, jumpToPage, highlights, onSelection, actions = ["paraphrase", "quote"], maxPageWidth, zoom = 1, hideOutline = false, onDocumentInfo, onPageChange }: PdfReaderProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [aspectRatio, setAspectRatio] = useState(1.414);
  const [availableWidth, setAvailableWidth] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [outline, setOutline] = useState<PdfOutlineEntry[]>([]);
  const currentPageRef = useRef(1);
  const callbacksRef = useRef({ onDocumentInfo, onPageChange });
  callbacksRef.current = { onDocumentInfo, onPageChange };
  const width = availableWidth === 0 ? 0 : Math.round(Math.min(availableWidth, maxPageWidth ?? availableWidth) * zoom);

  useEffect(() => {
    let cancelled = false;
    let loadingTask: { destroy(): Promise<void> } | null = null;
    setPdf(null);
    setError(null);
    setOutline([]);
    void (async () => {
      try {
        const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
        pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
        const task = pdfjs.getDocument({ url, ...pdfAssetOptions });
        loadingTask = task;
        const loaded = await task.promise;
        const firstPage = await loaded.getPage(1);
        const viewport = firstPage.getViewport({ scale: 1 });
        if (cancelled) return;
        setAspectRatio(viewport.height / viewport.width);
        setPdf(loaded);
        currentPageRef.current = 1;
        callbacksRef.current.onPageChange?.(1);
        callbacksRef.current.onDocumentInfo?.({ numPages: loaded.numPages, outline: [] });
        const entries = await readOutline(loaded).catch(() => []);
        if (cancelled) return;
        setOutline(entries);
        callbacksRef.current.onDocumentInfo?.({ numPages: loaded.numPages, outline: entries });
      } catch (loadError) {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : "PDF açılamadı.");
      }
    })();
    return () => {
      cancelled = true;
      void loadingTask?.destroy();
    };
  }, [url]);

  useEffect(() => {
    const element = containerRef.current;
    if (element === null) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const measure = () => setAvailableWidth(Math.max(320, Math.floor(element.clientWidth - 32)));
    measure();
    const observer = new ResizeObserver(() => {
      clearTimeout(timer);
      timer = setTimeout(measure, 150);
    });
    observer.observe(element);
    return () => {
      clearTimeout(timer);
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    if (jumpToPage === null || pdf === null) return;
    containerRef.current?.querySelector(`[data-page="${jumpToPage.page}"]`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [jumpToPage, pdf]);

  // Zooming changes every page's height, so the page being read is brought back into view.
  useEffect(() => {
    if (width === 0) return;
    containerRef.current?.querySelector(`[data-page="${currentPageRef.current}"]`)?.scrollIntoView({ block: "start" });
  }, [width]);

  function handleScroll(): void {
    const container = containerRef.current;
    if (container === null) return;
    // The page being read is the last one whose top has passed the upper third of the reader.
    const line = container.getBoundingClientRect().top + container.clientHeight / 3;
    let page = 1;
    for (const element of container.querySelectorAll<HTMLElement>("[data-page]")) {
      if (element.getBoundingClientRect().top > line) break;
      page = Number(element.dataset.page);
    }
    if (page !== currentPageRef.current) {
      currentPageRef.current = page;
      onPageChange?.(page);
    }
  }

  useEffect(() => {
    if (menu === null) return;
    const close = () => setMenu(null);
    window.addEventListener("click", close);
    window.addEventListener("wheel", close, { passive: true });
    window.addEventListener("keydown", close);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("wheel", close);
      window.removeEventListener("keydown", close);
    };
  }, [menu]);

  function handleContextMenu(event: React.MouseEvent<HTMLDivElement>): void {
    const selection = window.getSelection();
    const text = normalizeSelection(selection?.toString() ?? "");
    const anchor = selection?.anchorNode;
    const pageElement = (anchor instanceof Element ? anchor : anchor?.parentElement)?.closest("[data-page]");
    if (text.length === 0 || pageElement === null || pageElement === undefined || !containerRef.current?.contains(pageElement)) return;
    event.preventDefault();
    setMenu({ x: event.clientX, y: event.clientY, text, pageNumber: Number(pageElement.getAttribute("data-page")) });
  }

  function choose(action: SelectionAction): void {
    if (menu === null) return;
    onSelection(action, menu.text, menu.pageNumber);
    setMenu(null);
    window.getSelection()?.removeAllRanges();
  }

  return (
    <div className="pdf-reader" ref={containerRef} onContextMenu={handleContextMenu} onScroll={handleScroll}>
      {outline.length === 0 || hideOutline ? null : (
        <div className="pdf-toolbar">
          <select aria-label="PDF içindekiler" value="" onChange={(event) => {
            containerRef.current?.querySelector(`[data-page="${event.target.value}"]`)?.scrollIntoView({ block: "start" });
          }}>
            <option value="">İçindekiler: bir başlığa git…</option>
            {outline.map((entry, index) => <option key={`${index}-${entry.page}`} value={entry.page}>{"  ".repeat(entry.depth)}{entry.title} (s. {entry.page})</option>)}
          </select>
        </div>
      )}
      {error === null ? null : <p className="error" role="alert">{error}</p>}
      {pdf === null && error === null ? <p className="pdf-loading">PDF yükleniyor…</p> : null}
      {pdf === null || width === 0 ? null : Array.from({ length: pdf.numPages }, (_, index) => (
        <PdfPage key={`${url}-${index + 1}`} pdf={pdf} pageNumber={index + 1} width={width} placeholderHeight={width * aspectRatio} highlights={highlights.filter((highlight) => highlight.pageNumber === index + 1)} />
      ))}
      {menu === null ? null : (
        <div className="context-menu" role="menu" style={{ left: menu.x, top: menu.y }} onClick={(event) => event.stopPropagation()}>
          {actions.map((action) => <button key={action} type="button" role="menuitem" onClick={() => choose(action)}>{actionLabels[action]}</button>)}
          <button type="button" role="menuitem" onClick={() => { void navigator.clipboard.writeText(menu.text); setMenu(null); }}>Kopyala</button>
        </div>
      )}
    </div>
  );
}

function PdfPage({ pdf, pageNumber, width, placeholderHeight, highlights }: { pdf: PDFDocumentProxy; pageNumber: number; width: number; placeholderHeight: number; highlights: PdfHighlight[] }) {
  const pageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [renderedRatio, setRenderedRatio] = useState<number | null>(null);
  const height = renderedRatio === null ? placeholderHeight : width * renderedRatio;
  const [scale, setScale] = useState(1);
  const [textLayerVersion, setTextLayerVersion] = useState(0);
  const [marks, setMarks] = useState<HighlightRect[]>([]);
  const highlightKey = highlights.map((highlight) => `${highlight.id}:${highlight.kind}:${highlight.text}`).join("|");

  useEffect(() => {
    const element = pageRef.current;
    if (element === null) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        setVisible(true);
        observer.disconnect();
      }
    }, { rootMargin: "800px 0px" });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    let cleanup = (): void => undefined;
    void (async () => {
      const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
      // The document is destroyed when another PDF opens; a page still loading then just stops.
      const page = await pdf.getPage(pageNumber).catch(() => null);
      if (page === null) return;
      const baseViewport = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: width / baseViewport.width });
      const canvas = canvasRef.current;
      const textContainer = textRef.current;
      if (cancelled || canvas === null || textContainer === null) return;
      setRenderedRatio(viewport.height / viewport.width);
      setScale(viewport.scale);
      const pixelRatio = window.devicePixelRatio || 1;
      canvas.width = Math.floor(viewport.width * pixelRatio);
      canvas.height = Math.floor(viewport.height * pixelRatio);
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;
      const context = canvas.getContext("2d");
      if (context === null) return;
      const renderTask = page.render({ canvas, canvasContext: context, viewport, ...(pixelRatio === 1 ? {} : { transform: [pixelRatio, 0, 0, pixelRatio, 0, 0] }) });
      textContainer.replaceChildren();
      const textLayer = new pdfjs.TextLayer({ textContentSource: page.streamTextContent(), container: textContainer, viewport });
      cleanup = () => {
        renderTask.cancel();
        textLayer.cancel();
      };
      await Promise.allSettled([renderTask.promise, textLayer.render()]);
      if (!cancelled) setTextLayerVersion((version) => version + 1);
    })();
    return () => {
      cancelled = true;
      cleanup();
    };
  }, [visible, pdf, pageNumber, width]);

  // Quoted passages are found again in the page's text layer and painted underneath it.
  useEffect(() => {
    const page = pageRef.current;
    const textContainer = textRef.current;
    if (textLayerVersion === 0 || page === null || textContainer === null) return;
    setMarks(highlights.flatMap((highlight) => locateText(textContainer, highlight.text, page).map((rect) => ({ ...rect, id: highlight.id, kind: highlight.kind }))));
    // highlightKey stands for the highlights' content, so a new array with the same quotes is no change.
  }, [textLayerVersion, highlightKey]);

  return (
    <div className="pdf-page" data-page={pageNumber} ref={pageRef} style={{ width, height, "--total-scale-factor": scale } as React.CSSProperties}>
      <canvas ref={canvasRef} />
      <div className="highlight-layer" aria-hidden="true">
        {marks.map((mark, index) => <div key={`${mark.id}-${index}`} className={`pdf-highlight ${mark.kind}`} style={{ left: mark.left, top: mark.top, width: mark.width, height: mark.height }} />)}
      </div>
      <div className="textLayer" ref={textRef} />
      <span className="pdf-page-number">{pageNumber}</span>
    </div>
  );
}

type OutlineNode = { title: string; dest: string | unknown[] | null; items: OutlineNode[] };

// The PDF's own bookmarks (chapter and section headings), two levels deep, with their page numbers.
async function readOutline(pdf: PDFDocumentProxy): Promise<PdfOutlineEntry[]> {
  const entries: PdfOutlineEntry[] = [];
  const visit = async (nodes: OutlineNode[], depth: number): Promise<void> => {
    for (const node of nodes) {
      const destination = typeof node.dest === "string" ? await pdf.getDestination(node.dest) : node.dest;
      const reference = Array.isArray(destination) ? destination[0] : null;
      const pageIndex = typeof reference === "number"
        ? reference
        : reference !== null && typeof reference === "object" ? await pdf.getPageIndex(reference as Parameters<PDFDocumentProxy["getPageIndex"]>[0]).catch(() => -1) : -1;
      if (pageIndex >= 0) entries.push({ title: node.title.trim(), page: pageIndex + 1, depth });
      if (depth < 1 && node.items.length > 0) await visit(node.items, depth + 1);
    }
  };
  await visit(((await pdf.getOutline()) ?? []) as OutlineNode[], 0);
  return entries;
}

interface HighlightRect {
  id: string;
  kind: PdfHighlight["kind"];
  left: number;
  top: number;
  width: number;
  height: number;
}

// Matches the quote against the page's text ignoring whitespace and hyphens (selections drop the
// hyphen of a word broken across lines), then measures the matching characters.
function locateText(textContainer: HTMLElement, quote: string, page: HTMLElement): Array<Omit<HighlightRect, "id" | "kind">> {
  const ignored = /[\s\-\u00ad]/u;
  const target = [...quote].filter((character) => !ignored.test(character)).join("").toLocaleLowerCase("tr");
  if (target.length === 0) return [];
  const characters: Array<{ node: Text; offset: number }> = [];
  let pageText = "";
  const walker = document.createTreeWalker(textContainer, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
    const text = node.textContent ?? "";
    for (let offset = 0; offset < text.length; offset += 1) {
      const character = text[offset] ?? "";
      if (ignored.test(character)) continue;
      characters.push({ node: node as Text, offset });
      pageText += character.toLocaleLowerCase("tr");
    }
  }
  // A quote running onto the next page is highlighted as far as this page goes.
  let length = target.length;
  let start = pageText.indexOf(target);
  while (start < 0 && length > 40) {
    length = Math.floor(length * 0.8);
    start = pageText.indexOf(target.slice(0, length));
  }
  const first = characters[start];
  const last = characters[start + length - 1];
  if (start < 0 || first === undefined || last === undefined) return [];
  const range = document.createRange();
  range.setStart(first.node, first.offset);
  range.setEnd(last.node, last.offset + 1);
  const origin = page.getBoundingClientRect();
  return [...range.getClientRects()]
    .filter((rect) => rect.width > 0.5 && rect.height > 0.5)
    .map((rect) => ({ left: rect.left - origin.left, top: rect.top - origin.top, width: rect.width, height: rect.height }));
}

function normalizeSelection(text: string): string {
  return text.replace(/-\n(?=\p{Ll})/gu, "").replace(/\s+/g, " ").trim();
}
