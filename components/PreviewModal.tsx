import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import gsap from 'gsap';
import DOMPurify from 'dompurify';
import type { GenerationResult } from '../types';
import { convertLatexToHtml, restoreMath, countWords } from '../utils/latexToHtml';
import '../lib/externalTypes';
import {
  XIcon, CopyIcon, CheckIcon,
  ZoomInIcon, ZoomOutIcon, PrinterIcon,
  SunIcon, MoonIcon, ColumnsIcon,
  ChevronUpIcon, ChevronLeftIcon, ChevronRightIcon,
  MaximizeIcon, MinimizeIcon,
  SearchIcon, HelpCircleIcon, MoreHorizontalIcon,
  GripVerticalIcon, TypeIcon,
} from './icons';
import { Spinner } from './Spinner';

/* ═══════════════════════════════════════════
   PreviewModal — fully decomposed
   Sub-components: PreviewToolbar, PdfViewer, HtmlPaper, SplitView
   ═══════════════════════════════════════════ */

interface PreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  result: Partial<GenerationResult>;
}

type PreviewMode = 'pdf' | 'html' | 'split';
type PaperTheme = 'dark' | 'light';

/* ── Paper theme CSS vars ── */
const getPaperStyle = (paperTheme: PaperTheme): React.CSSProperties =>
  paperTheme === 'light'
    ? ({
        '--p-bg': '#ffffff',
        '--p-text': '#1a1a2e',
        '--p-sec': '#374151',
        '--p-head': '#111827',
        '--p-muted': '#6b7280',
        '--p-accent': '#059669',
        '--p-border': '#e5e7eb',
        '--p-code': '#f3f4f6',
        background: '#ffffff',
        color: '#374151',
      } as React.CSSProperties)
    : ({
        '--p-bg': 'rgb(var(--color-surface))',
        '--p-text': 'rgb(var(--color-text-primary))',
        '--p-sec': 'rgb(var(--color-text-secondary))',
        '--p-head': 'rgb(var(--color-text-heading))',
        '--p-muted': 'rgb(var(--color-text-muted))',
        '--p-accent': 'rgb(var(--color-accent))',
        '--p-border': 'rgb(var(--color-border))',
        '--p-code': 'rgba(var(--color-bg),0.5)',
        background: 'rgb(var(--color-surface))',
        color: 'rgb(var(--color-text-secondary))',
      } as React.CSSProperties);

/* ────────────────────────────────────────────
   HtmlPaper — renders the styled HTML content
   ──────────────────────────────────────────── */
const HtmlPaper: React.FC<{
  contentHtml: string;
  paperTheme: PaperTheme;
  zoom: number;
  isMathLoading: boolean;
  compact?: boolean;
}> = ({ contentHtml, paperTheme, zoom, isMathLoading, compact }) => (
  <div
    className={`w-full max-w-4xl min-h-[80vh] border border-border rounded-xl shadow-elevated relative ${compact ? 'p-6 sm:p-10' : 'p-10 sm:p-16'}`}
    style={{
      ...getPaperStyle(paperTheme),
      transform: `scale(${zoom})`,
      transformOrigin: 'top center',
    }}
  >
    {isMathLoading && (
      <div className="absolute inset-0 bg-bg/60 flex items-center justify-center rounded-xl z-10">
        <Spinner className="w-5 h-5 text-accent" />
      </div>
    )}
    <div
      className="prose prose-invert prose-sm max-w-none"
      dangerouslySetInnerHTML={{ __html: contentHtml }}
    />
  </div>
);

/* ────────────────────────────────────────────
   PdfViewer — pdf.js canvas rendering
   ──────────────────────────────────────────── */
const PdfViewer: React.FC<{
  pdfBlob: Blob | undefined;
  isOpen: boolean;
  zoom: number;
  previewMode: PreviewMode;
  pdfContainerRef: React.RefObject<HTMLDivElement | null>;
  onPdfLoaded: (totalPages: number) => void;
  onPdfPage: (page: number) => void;
  onPdfError: () => void;
  pdfUrl: string | null;
}> = ({ pdfBlob, isOpen, zoom, previewMode, pdfContainerRef, onPdfLoaded, onPdfPage, onPdfError, pdfUrl }) => {
  const pdfDocRef = useRef<any>(null);
  const [pdfState, setPdfState] = useState<'idle' | 'loading' | 'loaded' | 'error'>('idle');

  // Load document
  useEffect(() => {
    if (!pdfBlob || !isOpen) { setPdfState('idle'); return; }
    if (!window.pdfjsLib) { setPdfState('error'); onPdfError(); return; }
    setPdfState('loading');

    let cancelled = false;
    const pdfjsLib = window.pdfjsLib!;
    const load = async () => {
      try {
        const buf = await pdfBlob.arrayBuffer();
        const doc = await pdfjsLib.getDocument({ data: buf }).promise;
        if (cancelled) return;
        pdfDocRef.current = doc;
        onPdfLoaded(doc.numPages);
        setPdfState('loaded');
      } catch {
        if (!cancelled) { setPdfState('error'); onPdfError(); }
      }
    };
    load();
    return () => { cancelled = true; pdfDocRef.current = null; };
  }, [pdfBlob, isOpen, onPdfLoaded, onPdfError]);

  // Render pages to canvas
  useEffect(() => {
    const doc = pdfDocRef.current;
    const container = pdfContainerRef.current;
    if (pdfState !== 'loaded' || !doc || !container || previewMode === 'html') return;

    let cancelled = false;
    container.innerHTML = '';

    const render = async () => {
      const dpr = window.devicePixelRatio || 1;
      for (let i = 1; i <= doc.numPages; i++) {
        if (cancelled) return;
        const page = await doc.getPage(i);
        const vp = page.getViewport({ scale: zoom * dpr * 1.2 });
        const canvas = document.createElement('canvas');
        canvas.width = vp.width;
        canvas.height = vp.height;
        canvas.style.width = `${vp.width / dpr}px`;
        canvas.style.height = `${vp.height / dpr}px`;
        canvas.style.display = 'block';
        canvas.style.margin = '0 auto 16px';
        canvas.style.borderRadius = '6px';
        canvas.style.boxShadow = '0 2px 12px rgba(0,0,0,0.35)';
        canvas.setAttribute('data-page', String(i));
        const ctx = canvas.getContext('2d')!;
        await page.render({ canvasContext: ctx, viewport: vp }).promise;
        if (!cancelled) container.appendChild(canvas);
      }
    };
    render();
    return () => { cancelled = true; };
  }, [pdfState, zoom, previewMode, pdfContainerRef]);

  // Scroll tracking → visible page
  const handlePdfScroll = useCallback(() => {
    const c = pdfContainerRef.current;
    if (!c) return;
    const mid = c.scrollTop + c.clientHeight / 2;
    const canvases = c.querySelectorAll<HTMLCanvasElement>('canvas[data-page]');
    for (const cv of canvases) {
      const top = cv.offsetTop;
      if (mid >= top && mid < top + cv.offsetHeight) {
        onPdfPage(parseInt(cv.getAttribute('data-page') || '1'));
        break;
      }
    }
  }, [pdfContainerRef, onPdfPage]);

  if (pdfState === 'loaded') {
    return (
      <div
        ref={pdfContainerRef}
        className="w-full h-full overflow-auto custom-scrollbar p-4 sm:p-8"
        onScroll={handlePdfScroll}
      />
    );
  }
  if (pdfState === 'loading') {
    return (
      <div className="w-full h-full flex items-center justify-center">
        <Spinner className="w-5 h-5 text-accent" />
      </div>
    );
  }
  // iframe fallback
  if (pdfUrl) {
    return <iframe src={pdfUrl} title="PDF Preview" className="w-full h-full border-none" />;
  }
  return null;
};

/* ────────────────────────────────────────────
   SplitView — side-by-side or tabbed on mobile
   with drag-to-resize divider
   ──────────────────────────────────────────── */
const SplitView: React.FC<{
  latexCode: string;
  htmlPaperElement: React.ReactNode;
  isMobile: boolean;
}> = ({ latexCode, htmlPaperElement, isMobile }) => {
  const [splitRatio, setSplitRatio] = useState(50);
  const [activeTab, setActiveTab] = useState<'source' | 'preview'>('preview');
  const isDragging = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDragging.current = true;
    const container = containerRef.current;
    if (!container) return;

    const handleMouseMove = (ev: MouseEvent) => {
      if (!isDragging.current || !container) return;
      const rect = container.getBoundingClientRect();
      const pct = ((ev.clientX - rect.left) / rect.width) * 100;
      setSplitRatio(Math.min(80, Math.max(20, pct)));
    };
    const handleMouseUp = () => {
      isDragging.current = false;
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  }, []);

  if (isMobile) {
    return (
      <div className="flex flex-col w-full h-full">
        {/* Tab bar */}
        <div className="flex border-b border-border bg-bg/60 shrink-0">
          {(['source', 'preview'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 px-4 py-2 text-[11px] font-medium transition-all ${
                activeTab === tab
                  ? 'text-accent border-b-2 border-accent'
                  : 'text-txt-secondary hover:text-txt-primary'
              }`}
            >
              {tab === 'source' ? 'LaTeX Source' : 'HTML Preview'}
            </button>
          ))}
        </div>
        {activeTab === 'source' ? (
          <div className="flex-1 overflow-auto custom-scrollbar bg-bg p-4">
            <div className="flex items-center gap-2 mb-3 pb-2 border-b border-border">
              <div className="flex gap-1.5">
                <div className="w-2 h-2 rounded-full bg-txt-muted/30" />
                <div className="w-2 h-2 rounded-full bg-txt-muted/30" />
                <div className="w-2 h-2 rounded-full bg-txt-muted/30" />
              </div>
              <span className="text-[10px] text-txt-muted font-mono">source.tex</span>
            </div>
            <pre className="text-[11px] font-mono text-txt-secondary leading-relaxed whitespace-pre-wrap break-all">
              {latexCode}
            </pre>
          </div>
        ) : (
          <div className="flex-1 overflow-auto custom-scrollbar p-4 flex justify-center">
            {htmlPaperElement}
          </div>
        )}
      </div>
    );
  }

  return (
    <div ref={containerRef} className="flex w-full h-full">
      {/* Left: LaTeX source */}
      <div className="h-full border-r border-border overflow-auto custom-scrollbar bg-bg p-4" style={{ width: `${splitRatio}%` }}>
        <div className="flex items-center gap-2 mb-3 pb-2 border-b border-border">
          <div className="flex gap-1.5">
            <div className="w-2 h-2 rounded-full bg-txt-muted/30" />
            <div className="w-2 h-2 rounded-full bg-txt-muted/30" />
            <div className="w-2 h-2 rounded-full bg-txt-muted/30" />
          </div>
          <span className="text-[10px] text-txt-muted font-mono">source.tex</span>
        </div>
        <pre className="text-[11px] font-mono text-txt-secondary leading-relaxed whitespace-pre-wrap break-all">
          {latexCode}
        </pre>
      </div>
      {/* Drag handle */}
      <div
        className="w-2 shrink-0 bg-border/50 hover:bg-accent/30 cursor-col-resize flex items-center justify-center transition-colors"
        onMouseDown={handleMouseDown}
      >
        <GripVerticalIcon className="w-3 h-3 text-txt-muted/50" />
      </div>
      {/* Right: HTML preview */}
      <div className="h-full overflow-auto custom-scrollbar p-4 sm:p-6 flex justify-center" style={{ width: `${100 - splitRatio}%` }}>
        {htmlPaperElement}
      </div>
    </div>
  );
};

/* ────────────────────────────────────────────
   KeyboardShortcutPanel
   ──────────────────────────────────────────── */
const KeyboardShortcutPanel: React.FC<{ onClose: () => void }> = ({ onClose }) => (
  <div className="absolute top-12 right-4 z-30 bg-surface border border-border rounded-xl shadow-elevated p-4 w-64 animate-fade-in" onClick={e => e.stopPropagation()}>
    <div className="flex items-center justify-between mb-3">
      <h3 className="text-xs font-heading font-semibold text-txt-primary">Keyboard shortcuts</h3>
      <button onClick={onClose} className="text-txt-muted hover:text-txt-primary transition-colors"><XIcon className="w-3.5 h-3.5" /></button>
    </div>
    <div className="space-y-1.5">
      {[
        ['Esc', 'Close preview'],
        ['Ctrl + P', 'Print'],
        ['Ctrl + /', 'Cycle mode'],
        ['Ctrl + +', 'Zoom in'],
        ['Ctrl + -', 'Zoom out'],
        ['Ctrl + 0', 'Reset zoom'],
        ['Ctrl + F', 'Search in document'],
        ['?', 'Toggle this panel'],
      ].map(([key, desc]) => (
        <div key={key} className="flex items-center justify-between text-[11px]">
          <span className="text-txt-muted">{desc}</span>
          <kbd className="px-1.5 py-0.5 bg-bg rounded border border-border font-mono text-[10px] text-txt-secondary">{key}</kbd>
        </div>
      ))}
    </div>
  </div>
);

/* ────────────────────────────────────────────
   SearchBar — in-document search for HTML mode
   ──────────────────────────────────────────── */
const SearchBar: React.FC<{
  contentRef: React.RefObject<HTMLDivElement | null>;
  onClose: () => void;
}> = ({ contentRef, onClose }) => {
  const [query, setQuery] = useState('');
  const [matchCount, setMatchCount] = useState(0);
  const [currentMatch, setCurrentMatch] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const clearHighlights = useCallback(() => {
    const el = contentRef.current;
    if (!el) return;
    el.querySelectorAll('mark[data-search]').forEach(mark => {
      const parent = mark.parentNode;
      if (parent) {
        parent.replaceChild(document.createTextNode(mark.textContent || ''), mark);
        parent.normalize();
      }
    });
  }, [contentRef]);

  const doSearch = useCallback((q: string) => {
    clearHighlights();
    if (!q.trim() || !contentRef.current) { setMatchCount(0); setCurrentMatch(0); return; }

    const walker = document.createTreeWalker(contentRef.current, NodeFilter.SHOW_TEXT);
    const nodes: Text[] = [];
    while (walker.nextNode()) nodes.push(walker.currentNode as Text);

    const lowerQ = q.toLowerCase();
    let count = 0;
    for (const node of nodes) {
      const text = node.textContent || '';
      const lowerText = text.toLowerCase();
      if (!lowerText.includes(lowerQ)) continue;

      const frag = document.createDocumentFragment();
      let lastIdx = 0;
      let idx = lowerText.indexOf(lowerQ, lastIdx);
      while (idx !== -1) {
        frag.appendChild(document.createTextNode(text.slice(lastIdx, idx)));
        const mark = document.createElement('mark');
        mark.setAttribute('data-search', String(count));
        mark.style.background = 'rgba(16,185,129,0.3)';
        mark.style.color = 'inherit';
        mark.style.borderRadius = '2px';
        mark.style.padding = '0 1px';
        mark.textContent = text.slice(idx, idx + q.length);
        frag.appendChild(mark);
        count++;
        lastIdx = idx + q.length;
        idx = lowerText.indexOf(lowerQ, lastIdx);
      }
      frag.appendChild(document.createTextNode(text.slice(lastIdx)));
      node.parentNode?.replaceChild(frag, node);
    }

    setMatchCount(count);
    setCurrentMatch(count > 0 ? 1 : 0);
    // Scroll to first match
    if (count > 0) {
      const first = contentRef.current?.querySelector('mark[data-search="0"]');
      first?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [clearHighlights, contentRef]);

  const navigateMatch = useCallback((dir: 1 | -1) => {
    if (matchCount === 0) return;
    const next = ((currentMatch - 1 + dir + matchCount) % matchCount) + 1;
    setCurrentMatch(next);
    const mark = contentRef.current?.querySelector(`mark[data-search="${next - 1}"]`);
    mark?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    // Highlight current
    contentRef.current?.querySelectorAll('mark[data-search]').forEach(m => {
      (m as HTMLElement).style.background = 'rgba(16,185,129,0.3)';
    });
    if (mark) (mark as HTMLElement).style.background = 'rgba(16,185,129,0.6)';
  }, [matchCount, currentMatch, contentRef]);

  useEffect(() => {
    const timer = setTimeout(() => doSearch(query), 200);
    return () => clearTimeout(timer);
  }, [query, doSearch]);

  useEffect(() => {
    return () => clearHighlights();
  }, [clearHighlights]);

  return (
    <div className="absolute top-0 left-0 right-0 z-20 bg-surface border-b border-border px-3 py-2 flex items-center gap-2 animate-fade-in" onClick={e => e.stopPropagation()}>
      <SearchIcon className="w-3.5 h-3.5 text-txt-muted shrink-0" />
      <input
        ref={inputRef}
        value={query}
        onChange={e => setQuery(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Escape') { onClose(); return; }
          if (e.key === 'Enter') { navigateMatch(e.shiftKey ? -1 : 1); e.preventDefault(); }
        }}
        placeholder="Search in document..."
        className="flex-1 bg-transparent text-xs text-txt-primary placeholder:text-txt-muted outline-none"
      />
      {matchCount > 0 && (
        <span className="text-[10px] text-txt-muted font-mono tabular-nums shrink-0">
          {currentMatch}/{matchCount}
        </span>
      )}
      <button onClick={() => navigateMatch(-1)} className="p-0.5 text-txt-muted hover:text-txt-primary transition-colors"><ChevronUpIcon className="w-3 h-3" /></button>
      <button onClick={() => navigateMatch(1)} className="p-0.5 text-txt-muted hover:text-txt-primary transition-colors"><ChevronUpIcon className="w-3 h-3 rotate-180" /></button>
      <button onClick={onClose} className="p-0.5 text-txt-muted hover:text-txt-primary transition-colors"><XIcon className="w-3 h-3" /></button>
    </div>
  );
};

/* ────────────────────────────────────────────
   ScrollToTop — appears after 300px scroll
   ──────────────────────────────────────────── */
const ScrollToTopButton: React.FC<{
  containerRef: React.RefObject<HTMLDivElement | null>;
}> = ({ containerRef }) => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onScroll = () => setVisible(el.scrollTop > 300);
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [containerRef]);

  if (!visible) return null;

  return (
    <button
      onClick={() => containerRef.current?.scrollTo({ top: 0, behavior: 'smooth' })}
      className="absolute bottom-4 right-4 z-20 w-8 h-8 rounded-full bg-accent/90 text-white flex items-center justify-center shadow-lg hover:bg-accent transition-all animate-fade-in"
      title="Scroll to top"
    >
      <ChevronUpIcon className="w-4 h-4" />
    </button>
  );
};

/* ────────────────────────────────────────────
   PreviewToolbar — single responsive toolbar
   ──────────────────────────────────────────── */
const PreviewToolbar: React.FC<{
  previewMode: PreviewMode;
  setPreviewMode: (m: PreviewMode) => void;
  pdfBlob: Blob | undefined;
  pdfPage: number;
  pdfTotalPages: number;
  zoom: number;
  zoomIn: () => void;
  zoomOut: () => void;
  zoomReset: () => void;
  paperTheme: PaperTheme;
  setPaperTheme: (t: PaperTheme) => void;
  isCopiedHtml: boolean;
  onCopyHtml: () => void;
  isCopiedText: boolean;
  onCopyText: () => void;
  onPrint: () => void;
  onClose: () => void;
  closeRef: React.RefObject<HTMLButtonElement | null>;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
  wordCount: number;
  onGotoPage: (page: number) => void;
  onPrevPage: () => void;
  onNextPage: () => void;
  onToggleShortcuts: () => void;
  onToggleSearch: () => void;
}> = (props) => {
  const [showMore, setShowMore] = useState(false);
  const [showPageInput, setShowPageInput] = useState(false);
  const [pageInputVal, setPageInputVal] = useState('');
  const moreRef = useRef<HTMLDivElement>(null);

  // Close dropdown on click outside
  useEffect(() => {
    if (!showMore) return;
    const handler = (e: MouseEvent) => {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) setShowMore(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showMore]);

  const ToolbarButton: React.FC<{
    onClick: () => void;
    title: string;
    children: React.ReactNode;
    className?: string;
  }> = ({ onClick, title, children, className = '' }) => (
    <button
      onClick={onClick}
      title={title}
      className={`w-7 h-7 rounded-lg flex items-center justify-center text-txt-muted hover:text-txt-primary hover:bg-surface-elevated transition-all ${className}`}
    >
      {children}
    </button>
  );

  return (
    <header className="flex items-center justify-between px-4 py-2.5 bg-bg/60 border-b border-border backdrop-blur-sm gap-2 flex-wrap sm:flex-nowrap shrink-0">
      {/* Left side */}
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-2 h-2 rounded-full bg-accent animate-soft-pulse shrink-0" />
        <h2 className="font-heading font-semibold text-txt-primary text-sm tracking-tight truncate">
          {props.previewMode === 'pdf' ? 'PDF preview' : props.previewMode === 'split' ? 'Split view' : 'Document preview'}
        </h2>
        {/* Page indicator for PDF */}
        {props.previewMode === 'pdf' && props.pdfTotalPages > 0 && (
          <div className="flex items-center gap-1 shrink-0">
            <button onClick={props.onPrevPage} disabled={props.pdfPage <= 1} className="p-0.5 text-txt-muted hover:text-txt-primary disabled:opacity-30 transition-colors">
              <ChevronLeftIcon className="w-3 h-3" />
            </button>
            {showPageInput ? (
              <input
                autoFocus
                type="number"
                min={1}
                max={props.pdfTotalPages}
                value={pageInputVal}
                onChange={e => setPageInputVal(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    const n = parseInt(pageInputVal);
                    if (n >= 1 && n <= props.pdfTotalPages) props.onGotoPage(n);
                    setShowPageInput(false);
                  }
                  if (e.key === 'Escape') setShowPageInput(false);
                }}
                onBlur={() => setShowPageInput(false)}
                className="w-8 text-center text-[10px] font-mono bg-bg border border-border rounded px-0.5 py-0 text-txt-primary outline-none"
              />
            ) : (
              <button
                onClick={() => { setPageInputVal(String(props.pdfPage)); setShowPageInput(true); }}
                className="text-[10px] text-txt-muted font-mono tabular-nums hover:text-txt-primary transition-colors"
                title="Click to jump to page"
              >
                {props.pdfPage} / {props.pdfTotalPages}
              </button>
            )}
            <button onClick={props.onNextPage} disabled={props.pdfPage >= props.pdfTotalPages} className="p-0.5 text-txt-muted hover:text-txt-primary disabled:opacity-30 transition-colors">
              <ChevronRightIcon className="w-3 h-3" />
            </button>
          </div>
        )}
        {/* Word count */}
        {(props.previewMode === 'html' || props.previewMode === 'split') && props.wordCount > 0 && (
          <span className="text-[10px] text-txt-muted font-mono tabular-nums shrink-0 hidden sm:inline">
            ~{props.wordCount} words
          </span>
        )}
      </div>

      {/* Right side */}
      <div className="flex items-center gap-1.5 flex-wrap sm:flex-nowrap">
        {/* Zoom controls — always visible */}
        <div className="flex items-center rounded-lg border border-border overflow-hidden">
          <button onClick={props.zoomOut} title="Zoom out (Ctrl+−)" className="px-1.5 py-1 text-txt-muted hover:text-txt-primary hover:bg-surface-elevated transition-all">
            <ZoomOutIcon className="w-3.5 h-3.5" />
          </button>
          <button onClick={props.zoomReset} title="Reset zoom (Ctrl+0)" className="px-2 py-1 text-[10px] font-mono text-txt-secondary hover:text-txt-primary hover:bg-surface-elevated transition-all tabular-nums min-w-[3rem] text-center">
            {Math.round(props.zoom * 100)}%
          </button>
          <button onClick={props.zoomIn} title="Zoom in (Ctrl++)" className="px-1.5 py-1 text-txt-muted hover:text-txt-primary hover:bg-surface-elevated transition-all">
            <ZoomInIcon className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Secondary tools — hidden on mobile, shown in dropdown */}
        <div className="hidden sm:flex items-center gap-1">
          <ToolbarButton onClick={() => props.setPaperTheme(props.paperTheme === 'dark' ? 'light' : 'dark')} title={props.paperTheme === 'dark' ? 'Light paper' : 'Dark paper'}>
            {props.paperTheme === 'dark' ? <SunIcon className="w-3.5 h-3.5" /> : <MoonIcon className="w-3.5 h-3.5" />}
          </ToolbarButton>
          <ToolbarButton onClick={props.onCopyHtml} title="Copy HTML">
            {props.isCopiedHtml ? <CheckIcon className="w-3.5 h-3.5 text-success" /> : <CopyIcon className="w-3.5 h-3.5" />}
          </ToolbarButton>
          <ToolbarButton onClick={props.onCopyText} title="Copy plain text">
            {props.isCopiedText ? <CheckIcon className="w-3.5 h-3.5 text-success" /> : <TypeIcon className="w-3.5 h-3.5" />}
          </ToolbarButton>
          <ToolbarButton onClick={props.onPrint} title="Print (Ctrl+P)">
            <PrinterIcon className="w-3.5 h-3.5" />
          </ToolbarButton>
          <ToolbarButton onClick={props.onToggleSearch} title="Search (Ctrl+F)">
            <SearchIcon className="w-3.5 h-3.5" />
          </ToolbarButton>
          <ToolbarButton onClick={props.onToggleFullscreen} title="Fullscreen">
            {props.isFullscreen ? <MinimizeIcon className="w-3.5 h-3.5" /> : <MaximizeIcon className="w-3.5 h-3.5" />}
          </ToolbarButton>
          <ToolbarButton onClick={props.onToggleShortcuts} title="Keyboard shortcuts (?)">
            <HelpCircleIcon className="w-3.5 h-3.5" />
          </ToolbarButton>
        </div>

        {/* Mobile: more dropdown */}
        <div className="relative sm:hidden" ref={moreRef}>
          <ToolbarButton onClick={() => setShowMore(v => !v)} title="More tools">
            <MoreHorizontalIcon className="w-3.5 h-3.5" />
          </ToolbarButton>
          {showMore && (
            <div className="absolute right-0 top-full mt-1 bg-surface border border-border rounded-lg shadow-elevated py-1 w-44 z-30 animate-fade-in">
              {[
                { icon: props.paperTheme === 'dark' ? <SunIcon className="w-3.5 h-3.5" /> : <MoonIcon className="w-3.5 h-3.5" />, label: props.paperTheme === 'dark' ? 'Light paper' : 'Dark paper', action: () => props.setPaperTheme(props.paperTheme === 'dark' ? 'light' : 'dark') },
                { icon: <CopyIcon className="w-3.5 h-3.5" />, label: 'Copy HTML', action: props.onCopyHtml },
                { icon: <TypeIcon className="w-3.5 h-3.5" />, label: 'Copy plain text', action: props.onCopyText },
                { icon: <PrinterIcon className="w-3.5 h-3.5" />, label: 'Print', action: props.onPrint },
                { icon: <SearchIcon className="w-3.5 h-3.5" />, label: 'Search', action: props.onToggleSearch },
                { icon: props.isFullscreen ? <MinimizeIcon className="w-3.5 h-3.5" /> : <MaximizeIcon className="w-3.5 h-3.5" />, label: 'Fullscreen', action: props.onToggleFullscreen },
                { icon: <HelpCircleIcon className="w-3.5 h-3.5" />, label: 'Shortcuts', action: props.onToggleShortcuts },
              ].map(item => (
                <button
                  key={item.label}
                  onClick={() => { item.action(); setShowMore(false); }}
                  className="w-full flex items-center gap-2.5 px-3 py-1.5 text-[11px] text-txt-secondary hover:text-txt-primary hover:bg-surface-elevated transition-all"
                >
                  {item.icon}
                  {item.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Mode toggle (PDF / HTML / Split) */}
        {props.pdfBlob && (
          <div className="flex rounded-lg border border-border overflow-hidden ml-1">
            {(['pdf', 'html', 'split'] as const).map(m => (
              <button
                key={m}
                onClick={() => props.setPreviewMode(m)}
                title={m === 'split' ? 'Split view (Ctrl+/)' : `${m.toUpperCase()} view`}
                className={`px-2.5 py-1 text-[10px] font-medium tracking-wide transition-all ${
                  m !== 'pdf' ? 'border-l border-border' : ''
                } ${
                  props.previewMode === m
                    ? 'bg-accent text-white'
                    : 'text-txt-secondary hover:text-txt-primary hover:bg-surface-elevated'
                }`}
              >
                {m === 'split' ? <ColumnsIcon className="w-3 h-3 inline-block" /> : m.toUpperCase()}
              </button>
            ))}
          </div>
        )}

        {/* Close */}
        <button
          ref={props.closeRef}
          onClick={props.onClose}
          aria-label="Close preview"
          className="w-7 h-7 rounded-lg flex items-center justify-center text-txt-muted hover:text-txt-primary hover:bg-surface-elevated transition-all ml-0.5"
        >
          <XIcon className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
};

/* ═══════════════════════════════════════════
   PreviewModal — main orchestrator
   All 14 original + 9 preview UX + 3 mobile UX
   ═══════════════════════════════════════════ */
export const PreviewModal: React.FC<PreviewModalProps> = ({
  isOpen,
  onClose,
  result,
}) => {
  const { latexCode = '', pdfBlob } = result;

  /* ── Mode (persisted in sessionStorage) ── */
  const [previewMode, setPreviewModeRaw] = useState<PreviewMode>(() => {
    const saved = sessionStorage.getItem('preview_mode') as PreviewMode | null;
    if (pdfBlob && saved && ['pdf', 'html', 'split'].includes(saved)) return saved;
    return pdfBlob ? 'pdf' : 'html';
  });
  const setPreviewMode = useCallback((m: PreviewMode) => {
    setPreviewModeRaw(m);
    sessionStorage.setItem('preview_mode', m);
  }, []);

  const [shouldRender, setShouldRender] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [paperTheme, setPaperTheme] = useState<PaperTheme>('dark');
  const [isMathLoading, setIsMathLoading] = useState(false);
  const [isCopiedHtml, setIsCopiedHtml] = useState(false);
  const [isCopiedText, setIsCopiedText] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showSearch, setShowSearch] = useState(false);

  /* PDF state */
  const [pdfPage, setPdfPage] = useState(1);
  const [pdfTotalPages, setPdfTotalPages] = useState(0);
  const pdfContainerRef = useRef<HTMLDivElement>(null);

  /* Scroll position memory per mode */
  const scrollPositions = useRef<Record<string, number>>({});
  const htmlScrollRef = useRef<HTMLDivElement>(null);

  /* Animation refs */
  const closeRef = useRef<HTMLButtonElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  /* Pinch-to-zoom refs */
  const touchDistRef = useRef(0);
  const touchZoomRef = useRef(1);

  /* Swipe-to-close refs */
  const swipeStartY = useRef(0);
  const swipeStartX = useRef(0);
  const swiping = useRef(false);

  /* Mobile detection */
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 640);
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 640);
    window.addEventListener('resize', handler, { passive: true });
    return () => window.removeEventListener('resize', handler);
  }, []);

  /* Auto-switch split to tabs on mobile */
  useEffect(() => {
    if (isMobile && previewMode === 'split') {
      // Keep mode as split but SplitView renders tabs internally
    }
  }, [isMobile, previewMode]);

  /* Auto-switch to PDF when blob arrives */
  useEffect(() => {
    if (pdfBlob) setPreviewMode('pdf');
  }, [pdfBlob, setPreviewMode]);

  /* Converted HTML */
  const contentHtml = useMemo(() => {
    const { html, mathMap } = convertLatexToHtml(latexCode);
    return restoreMath(DOMPurify.sanitize(html), mathMap);
  }, [latexCode]);

  /* Word count */
  const wordCount = useMemo(() => countWords(latexCode), [latexCode]);

  /* PDF URL */
  const pdfUrl = useMemo(() => (pdfBlob ? URL.createObjectURL(pdfBlob) : null), [pdfBlob]);
  useEffect(() => {
    return () => { if (pdfUrl) URL.revokeObjectURL(pdfUrl); };
  }, [pdfUrl]);

  /* Mount / unmount */
  useEffect(() => {
    if (isOpen) setShouldRender(true);
  }, [isOpen]);

  /* GSAP enter animation */
  useEffect(() => {
    if (isOpen && shouldRender && overlayRef.current && panelRef.current) {
      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (reduced) return;
      gsap.fromTo(overlayRef.current, { opacity: 0, backdropFilter: 'blur(0px)' }, { opacity: 1, backdropFilter: 'blur(16px)', duration: 0.35, ease: 'power2.out' });
      gsap.fromTo(panelRef.current, { opacity: 0, y: 30, scale: 0.95, filter: 'blur(4px)' }, { opacity: 1, y: 0, scale: 1, filter: 'blur(0px)', duration: 0.4, ease: 'power3.out', delay: 0.05 });
    }
  }, [isOpen, shouldRender]);

  /* Cross-fade on mode switch + save/restore scroll */
  const prevMode = useRef(previewMode);
  useEffect(() => {
    // Save scroll of previous mode
    if (prevMode.current === 'html' && htmlScrollRef.current) {
      scrollPositions.current['html'] = htmlScrollRef.current.scrollTop;
    } else if (prevMode.current === 'pdf' && pdfContainerRef.current) {
      scrollPositions.current['pdf'] = pdfContainerRef.current.scrollTop;
    }
    prevMode.current = previewMode;

    if (!isOpen || !contentRef.current) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) return;
    gsap.fromTo(contentRef.current, { opacity: 0, scale: 0.98 }, { opacity: 1, scale: 1, duration: 0.3, ease: 'power2.out' });

    // Restore scroll after animation
    setTimeout(() => {
      if (previewMode === 'html' && htmlScrollRef.current) {
        htmlScrollRef.current.scrollTop = scrollPositions.current['html'] || 0;
      } else if (previewMode === 'pdf' && pdfContainerRef.current) {
        pdfContainerRef.current.scrollTop = scrollPositions.current['pdf'] || 0;
      }
    }, 50);
  }, [previewMode, isOpen]);

  /* Close with animation */
  const handleClose = useCallback(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced || !overlayRef.current || !panelRef.current) {
      setShouldRender(false);
      onClose();
      return;
    }
    gsap.to(panelRef.current, { opacity: 0, y: 20, scale: 0.97, filter: 'blur(4px)', duration: 0.25, ease: 'power2.in' });
    gsap.to(overlayRef.current, {
      opacity: 0, duration: 0.3, ease: 'power2.in',
      onComplete: () => { setShouldRender(false); onClose(); },
    });
  }, [onClose]);

  /* MathJax typeset */
  useEffect(() => {
    if (!isOpen || (previewMode !== 'html' && previewMode !== 'split') || !window.MathJax) return;
    setIsMathLoading(true);
    const timer = setTimeout(async () => {
      try {
        if (window.MathJax?.typesetPromise) await window.MathJax.typesetPromise();
        else if (window.MathJax?.Hub) window.MathJax.Hub.Queue(['Typeset', window.MathJax.Hub]);
      } catch { /* ignore */ }
      setIsMathLoading(false);
    }, 100);
    return () => clearTimeout(timer);
  }, [isOpen, contentHtml, previewMode]);

  /* Print */
  const handlePrint = useCallback(() => {
    if (previewMode === 'pdf' && pdfUrl) {
      window.open(pdfUrl, '_blank');
    } else {
      const w = window.open('', '_blank');
      if (!w) return;
      w.document.write(
        `<!DOCTYPE html><html><head><title>Assignment</title><link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Space+Grotesk:wght@400;500;600;700&family=JetBrains+Mono:wght@300;400;500&display=swap" rel="stylesheet"><style>body{font-family:Inter,system-ui,sans-serif;padding:2rem;color:#1a1a2e;max-width:800px;margin:0 auto;font-size:14px;line-height:1.7}h1,h2,h3,h4{font-family:'Space Grotesk',sans-serif}pre,code{font-family:'JetBrains Mono',monospace}a{color:#059669}table{border-collapse:collapse}td,th{padding:0.5rem 0.75rem;border:1px solid #e5e7eb}</style></head><body>${contentHtml}</body></html>`,
      );
      w.document.close();
      setTimeout(() => w.print(), 300);
    }
  }, [previewMode, pdfUrl, contentHtml]);

  /* Copy HTML */
  const handleCopyHtml = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(contentHtml);
      setIsCopiedHtml(true);
      setTimeout(() => setIsCopiedHtml(false), 2000);
    } catch { /* ignore */ }
  }, [contentHtml]);

  /* Copy plain text */
  const handleCopyText = useCallback(async () => {
    try {
      const doc = new DOMParser().parseFromString(contentHtml, 'text/html');
      const text = doc.body.textContent || '';
      await navigator.clipboard.writeText(text);
      setIsCopiedText(true);
      setTimeout(() => setIsCopiedText(false), 2000);
    } catch { /* ignore */ }
  }, [contentHtml]);

  /* Zoom helpers */
  const zoomIn = useCallback(() => setZoom(z => Math.min(3, Math.round((z + 0.25) * 100) / 100)), []);
  const zoomOut = useCallback(() => setZoom(z => Math.max(0.25, Math.round((z - 0.25) * 100) / 100)), []);
  const zoomReset = useCallback(() => setZoom(1), []);

  /* Fullscreen toggle */
  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      panelRef.current?.requestFullscreen?.().catch(() => {});
    } else {
      document.exitFullscreen?.().catch(() => {});
    }
  }, []);

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  /* PDF page navigation */
  const goToPage = useCallback((page: number) => {
    const c = pdfContainerRef.current;
    if (!c) return;
    const canvas = c.querySelector<HTMLCanvasElement>(`canvas[data-page="${page}"]`);
    if (canvas) {
      canvas.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setPdfPage(page);
    }
  }, []);

  const prevPage = useCallback(() => {
    if (pdfPage > 1) goToPage(pdfPage - 1);
  }, [pdfPage, goToPage]);

  const nextPage = useCallback(() => {
    if (pdfPage < pdfTotalPages) goToPage(pdfPage + 1);
  }, [pdfPage, pdfTotalPages, goToPage]);

  /* Keyboard shortcuts */
  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      const target = e.target as HTMLElement;
      const inInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA';

      if (e.key === 'Escape') {
        if (showSearch) { setShowSearch(false); return; }
        if (showShortcuts) { setShowShortcuts(false); return; }
        handleClose();
        return;
      }
      if (e.key === '?' && !inInput) {
        setShowShortcuts(v => !v);
        return;
      }
      if (mod && e.key === 'f') {
        e.preventDefault();
        setShowSearch(v => !v);
        return;
      }
      if (mod && e.key === 'p') { e.preventDefault(); handlePrint(); return; }
      if (mod && e.key === '/') {
        e.preventDefault();
        setPreviewMode(previewMode === 'pdf' ? 'html' : previewMode === 'html' ? (pdfBlob ? 'split' : 'html') : 'pdf');
        return;
      }
      if (mod && (e.key === '=' || e.key === '+')) { e.preventDefault(); zoomIn(); return; }
      if (mod && e.key === '-') { e.preventDefault(); zoomOut(); return; }
      if (mod && e.key === '0') { e.preventDefault(); zoomReset(); return; }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, handleClose, handlePrint, previewMode, pdfBlob, setPreviewMode, zoomIn, zoomOut, zoomReset, showSearch, showShortcuts]);

  /* Focus close button on open */
  useEffect(() => {
    if (isOpen) closeRef.current?.focus();
  }, [isOpen]);

  /* Pinch-to-zoom */
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      touchDistRef.current = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY,
      );
      touchZoomRef.current = zoom;
    } else if (e.touches.length === 1) {
      // Swipe-to-close: track start position
      swipeStartY.current = e.touches[0].clientY;
      swipeStartX.current = e.touches[0].clientX;
      swiping.current = false;
    }
  }, [zoom]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2 && touchDistRef.current > 0) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY,
      );
      const s = dist / touchDistRef.current;
      setZoom(Math.min(3, Math.max(0.25, Math.round(touchZoomRef.current * s * 20) / 20)));
    } else if (e.touches.length === 1 && panelRef.current) {
      const deltaY = e.touches[0].clientY - swipeStartY.current;
      const deltaX = Math.abs(e.touches[0].clientX - swipeStartX.current);
      // Only vertical swipes, downward, mostly vertical
      if (deltaY > 20 && deltaY > deltaX * 2) {
        swiping.current = true;
        const clamped = Math.min(deltaY, 200);
        gsap.set(panelRef.current, { y: clamped, opacity: 1 - clamped / 400 });
      }
    }
  }, []);

  const handleTouchEnd = useCallback(() => {
    touchDistRef.current = 0;
    if (swiping.current && panelRef.current) {
      const currentY = gsap.getProperty(panelRef.current, 'y') as number;
      if (currentY > 100) {
        handleClose();
      } else {
        gsap.to(panelRef.current, { y: 0, opacity: 1, duration: 0.3, ease: 'power2.out' });
      }
      swiping.current = false;
    }
  }, [handleClose]);

  /* PDF callbacks */
  const handlePdfLoaded = useCallback((total: number) => {
    setPdfTotalPages(total);
    setPdfPage(1);
  }, []);

  const handlePdfError = useCallback(() => {}, []);

  if (!shouldRender) return null;

  const htmlPaperElement = (compact?: boolean) => (
    <HtmlPaper
      contentHtml={contentHtml}
      paperTheme={paperTheme}
      zoom={zoom}
      isMathLoading={isMathLoading}
      compact={compact}
    />
  );

  return (
    <div
      ref={overlayRef}
      role="dialog"
      aria-modal="true"
      aria-label="Document preview"
      className="fixed inset-0 bg-bg/80 z-50 flex items-center justify-center p-0 sm:p-5 backdrop-blur-lg"
      onClick={handleClose}
    >
      <div
        ref={panelRef}
        className="bg-surface border border-border rounded-none sm:rounded-2xl w-full max-w-7xl h-full sm:h-[92vh] flex flex-col shadow-elevated relative overflow-hidden"
        onClick={e => e.stopPropagation()}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* Toolbar */}
        <PreviewToolbar
          previewMode={previewMode}
          setPreviewMode={setPreviewMode}
          pdfBlob={pdfBlob}
          pdfPage={pdfPage}
          pdfTotalPages={pdfTotalPages}
          zoom={zoom}
          zoomIn={zoomIn}
          zoomOut={zoomOut}
          zoomReset={zoomReset}
          paperTheme={paperTheme}
          setPaperTheme={setPaperTheme}
          isCopiedHtml={isCopiedHtml}
          onCopyHtml={handleCopyHtml}
          isCopiedText={isCopiedText}
          onCopyText={handleCopyText}
          onPrint={handlePrint}
          onClose={handleClose}
          closeRef={closeRef}
          isFullscreen={isFullscreen}
          onToggleFullscreen={toggleFullscreen}
          wordCount={wordCount}
          onGotoPage={goToPage}
          onPrevPage={prevPage}
          onNextPage={nextPage}
          onToggleShortcuts={() => setShowShortcuts(v => !v)}
          onToggleSearch={() => setShowSearch(v => !v)}
        />

        {/* Shortcut help panel */}
        {showShortcuts && <KeyboardShortcutPanel onClose={() => setShowShortcuts(false)} />}

        {/* Content area */}
        <div ref={contentRef} className="flex-1 overflow-hidden bg-bg flex relative">
          {/* Search bar */}
          {showSearch && (previewMode === 'html' || previewMode === 'split') && (
            <SearchBar contentRef={htmlScrollRef} onClose={() => setShowSearch(false)} />
          )}

          {previewMode === 'split' ? (
            <SplitView
              latexCode={latexCode}
              htmlPaperElement={htmlPaperElement(true)}
              isMobile={isMobile}
            />
          ) : previewMode === 'pdf' ? (
            <div className="w-full h-full relative">
              <PdfViewer
                pdfBlob={pdfBlob}
                isOpen={isOpen}
                zoom={zoom}
                previewMode={previewMode}
                pdfContainerRef={pdfContainerRef}
                onPdfLoaded={handlePdfLoaded}
                onPdfPage={setPdfPage}
                onPdfError={handlePdfError}
                pdfUrl={pdfUrl}
              />
              <ScrollToTopButton containerRef={pdfContainerRef} />
            </div>
          ) : (
            <div ref={htmlScrollRef} className="w-full h-full overflow-y-auto p-4 sm:p-8 flex justify-center custom-scrollbar relative">
              {htmlPaperElement()}
              <ScrollToTopButton containerRef={htmlScrollRef} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
