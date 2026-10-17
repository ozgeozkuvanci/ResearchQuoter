"use client";

import "pdfjs-dist/web/pdf_viewer.css";

import type { PDFDocumentProxy } from "pdfjs-dist";
import { useEffect, useRef, useState } from "react";

export type SelectionAction = "paraphrase" | "quote";

interface PdfReaderProps {
  url: string;
  jumpToPage: { page: number; token: number } | null;
  onSelection: (action: SelectionAction, text: string, pageNumber: number) => void;
}

interface MenuState {
  x: number;
  y: number;
  text: string;
  pageNumber: number;
}


// Renders a PDF with selectable text. Right-clicking a selection offers to paraphrase or quote it,
// and reports the page the selection starts on so the citation can point back to it.
export function PdfReader({ url, jumpToPage, onSelection }: PdfReaderProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [aspectRatio, setAspectRatio] = useState(1.414);
  const [width, setWidth] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [menu, setMenu] = useState<MenuState | null>(null);

  useEffect(() => {
    let cancelled = false;
    let loadingTask: { destroy(): Promise<void> } | null = null;
    setPdf(null);
    setError(null);
    void (async () => {
      try {
        const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
        pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
        const task = pdfjs.getDocument({ url });
        loadingTask = task;
        const loaded = await task.promise;
        const firstPage = await loaded.getPage(1);
        const viewport = firstPage.getViewport({ scale: 1 });
        if (cancelled) return;
        setAspectRatio(viewport.height / viewport.width);
        setPdf(loaded);
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
    const measure = () => setWidth(Math.max(320, Math.floor(element.clientWidth - 32)));
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
    <div className="pdf-reader" ref={containerRef} onContextMenu={handleContextMenu}>
      {error === null ? null : <p className="error" role="alert">{error}</p>}
      {pdf === null && error === null ? <p className="pdf-loading">PDF yükleniyor…</p> : null}
      {pdf === null || width === 0 ? null : Array.from({ length: pdf.numPages }, (_, index) => (
        <PdfPage key={`${url}-${index + 1}`} pdf={pdf} pageNumber={index + 1} width={width} placeholderHeight={width * aspectRatio} />
      ))}
      {menu === null ? null : (
        <div className="context-menu" role="menu" style={{ left: menu.x, top: menu.y }} onClick={(event) => event.stopPropagation()}>
          <button type="button" role="menuitem" onClick={() => choose("paraphrase")}>Paraphrase</button>
          <button type="button" role="menuitem" onClick={() => choose("quote")}>Alıntı olarak ekle</button>
          <button type="button" role="menuitem" onClick={() => { void navigator.clipboard.writeText(menu.text); setMenu(null); }}>Kopyala</button>
        </div>
      )}
    </div>
  );
}

function PdfPage({ pdf, pageNumber, width, placeholderHeight }: { pdf: PDFDocumentProxy; pageNumber: number; width: number; placeholderHeight: number }) {
  const pageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [renderedHeight, setRenderedHeight] = useState<number | null>(null);
  const height = renderedHeight ?? placeholderHeight;
  const [scale, setScale] = useState(1);

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
      const page = await pdf.getPage(pageNumber);
      const baseViewport = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: width / baseViewport.width });
      const canvas = canvasRef.current;
      const textContainer = textRef.current;
      if (cancelled || canvas === null || textContainer === null) return;
      setRenderedHeight(viewport.height);
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
    })();
    return () => {
      cancelled = true;
      cleanup();
    };
  }, [visible, pdf, pageNumber, width]);

  return (
    <div className="pdf-page" data-page={pageNumber} ref={pageRef} style={{ width, height, "--total-scale-factor": scale } as React.CSSProperties}>
      <canvas ref={canvasRef} />
      <div className="textLayer" ref={textRef} />
      <span className="pdf-page-number">{pageNumber}</span>
    </div>
  );
}

function normalizeSelection(text: string): string {
  return text.replace(/-\n(?=\p{Ll})/gu, "").replace(/\s+/g, " ").trim();
}
