
import React, { useState, useEffect, useRef } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import type { GenerationResult } from '../types';

gsap.registerPlugin(ScrollTrigger);
import { useCopyToClipboard } from '../hooks/useCopyToClipboard';
import { CopyIcon, DownloadIcon, CheckIcon, EyeIcon, AlertIcon, EditIcon, PdfIcon, OverleafIcon, ExternalLinkIcon } from './icons';
import { Spinner } from './Spinner';
import { PreviewModal } from './PreviewModal';
import { validateLatex, type ValidationIssue } from '../utils/latexValidator';
import { compileToPdf, type CompilationResult } from '../services/latexCompiler';
import type { Diagnostic } from '../lib/latexDiagnostics';
import { buildFixDiff, explainFix, getFixTrustLabel, getReadinessStatus } from '../lib/latexInsights';
import type { AIProviderMeta, TimelineStep } from '../types';
import '../lib/externalTypes';

interface ResultDisplayProps {
  result: Partial<GenerationResult>;
  isLoading: boolean;
  onLatexChange?: (newLatex: string) => void;
  onPdfCompiled?: (pdfBlob: Blob) => void;
  showToast?: (message: string, type?: 'success' | 'error' | 'info') => void;
}

const GenerationTimeline: React.FC<{ steps: TimelineStep[] }> = ({ steps }) => {
  if (steps.length === 0) return null;

  return (
    <div className="hidden sm:block rounded-lg border border-border bg-bg-secondary/20 p-3 max-w-2xl">
      <h4 className="text-[11px] font-medium text-txt-secondary mb-2">Generation timeline</h4>
      <div className="flex flex-wrap gap-2 text-xs text-txt-muted">
        {steps.map((step, index) => (
          <div key={`${step.label}-${index}`} className="flex items-center gap-2 rounded-md border border-border/60 bg-bg/50 px-2.5 py-1.5">
            <span
              className={`w-2 h-2 rounded-full ${
                step.status === 'done'
                  ? 'bg-success'
                  : step.status === 'active'
                    ? 'bg-accent'
                    : 'bg-txt-muted/40'
              }`}
            />
            <div>
              <p className="text-xs text-txt-secondary">{step.label}</p>
              {step.meta && <p className="text-[10px] text-txt-muted/80 mt-0.5">{step.meta}</p>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

const MetaBadge: React.FC<{
  label: string;
  tone?: 'neutral' | 'success' | 'warning' | 'error' | 'accent';
}> = ({ label, tone = 'neutral' }) => {
  const toneClass =
    tone === 'success'
      ? 'border-green-200 bg-green-50 text-green-700'
      : tone === 'warning'
        ? 'border-amber-200 bg-amber-50 text-amber-700'
        : tone === 'error'
          ? 'border-red-200 bg-red-50 text-red-700'
          : tone === 'accent'
            ? 'border-blue-200 bg-blue-50 text-blue-700'
            : 'border-gray-200 bg-gray-100 text-gray-700';

  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-md border text-[11px] transition duration-150 hover:opacity-90 ${toneClass}`}>
      {label}
    </span>
  );
};

const BadgeStrip: React.FC<{
  provider?: AIProviderMeta;
  fixesCount: number;
  diagnosticsCount: number;
}> = ({ provider, fixesCount, diagnosticsCount }) => (
  <div className="hidden sm:flex flex-wrap gap-1.5 text-xs opacity-80 max-w-2xl">
    {provider && (
      <>
        <MetaBadge
          tone="accent"
          label={`Provider: ${
            provider.name === 'openrouter'
              ? 'OpenRouter'
              : provider.name === 'cohere'
                ? 'Cohere'
                : 'Gemini'
          }`}
        />
        <MetaBadge label={`${provider.latencyMs} ms`} />
        {provider.fallbackUsed && <MetaBadge tone="warning" label="Fallback used" />}
      </>
    )}
    <MetaBadge tone={fixesCount > 0 ? 'accent' : 'success'} label={`${fixesCount} fix${fixesCount === 1 ? '' : 'es'}`} />
    <MetaBadge
      tone={diagnosticsCount > 0 ? 'warning' : 'success'}
      label={`${diagnosticsCount} issue${diagnosticsCount === 1 ? '' : 's'}`}
    />
  </div>
);

const MobileTrustSummary: React.FC<{
  provider?: AIProviderMeta;
  fixesCount: number;
  diagnosticsCount: number;
}> = ({ provider, fixesCount, diagnosticsCount }) => {
  const providerLabel = provider
    ? provider.name === 'openrouter'
      ? 'OpenRouter'
      : provider.name === 'cohere'
        ? 'Cohere'
        : 'Gemini'
    : 'AI';

  const summary = [
    providerLabel,
    provider?.fallbackUsed ? 'fallback used' : null,
    `${fixesCount} fix${fixesCount === 1 ? '' : 'es'}`,
    `${diagnosticsCount} issue${diagnosticsCount === 1 ? '' : 's'}`,
  ].filter(Boolean).join(' · ');

  return (
    <div className="sm:hidden max-w-2xl rounded-lg border border-border bg-bg-secondary/20 px-3 py-2.5">
      <p className="text-[11px] uppercase tracking-wide text-txt-muted">Quick summary</p>
      <p className="mt-1 text-sm text-txt-primary leading-relaxed">{summary}</p>
    </div>
  );
};

const DiagnosticsDrawer: React.FC<{
  diagnostics: Diagnostic[];
  log: string | null;
  provider?: AIProviderMeta;
}> = ({ diagnostics, log, provider }) => {
  const [isOpen, setIsOpen] = useState(false);
  const totalCount = diagnostics.length + (log ? 1 : 0);

  if (totalCount === 0 && !provider?.attemptedProviders?.length) {
    return null;
  }

  return (
    <div className="rounded-lg border border-border bg-bg-secondary/20 max-w-2xl">
      <button
        onClick={() => setIsOpen((value) => !value)}
        className="w-full px-4 py-3 flex items-center justify-between text-left text-sm text-txt-secondary"
      >
        <span className="text-sm text-txt-primary font-medium">
          {isOpen ? '▼' : '▶'} Diagnostics {diagnostics.length > 0 ? `(${diagnostics.length})` : ''}
        </span>
        <span className="text-[11px] text-txt-muted">
          {provider?.attemptedProviders?.length ? `${provider.attemptedProviders.length} provider attempt${provider.attemptedProviders.length === 1 ? '' : 's'}` : 'Details'}
        </span>
      </button>

      {isOpen && (
        <div className="px-4 pb-4 space-y-3 text-sm leading-relaxed">
          {diagnostics.length > 0 && (
            <div className="space-y-2">
              {diagnostics.map((diagnostic, index) => (
                <div key={`${diagnostic.category}-${index}`} className="rounded-md border border-border/70 bg-bg/50 p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <MetaBadge
                      tone={diagnostic.type === 'error' ? 'error' : 'warning'}
                      label={diagnostic.type === 'error' ? 'Error' : 'Warning'}
                    />
                    <span className="text-xs font-medium text-txt-primary">{diagnostic.category}</span>
                  </div>
                  <p className="text-sm text-txt-secondary">{diagnostic.message}</p>
                  {diagnostic.suggestion && (
                    <p className="text-[11px] text-txt-muted mt-1.5">Suggestion: {diagnostic.suggestion}</p>
                  )}
                </div>
              ))}
            </div>
          )}

          {provider?.attemptedProviders?.length ? (
            <details className="rounded-md border border-border/70 bg-bg/50 p-3">
              <summary className="text-xs font-medium text-txt-primary cursor-pointer">Provider attempts</summary>
              <div className="mt-3 space-y-2">
                {provider.attemptedProviders.map((name, index) => {
                  const isWinner = index === provider.attemptedProviders.length - 1;
                  const label =
                    name === 'openrouter' ? 'OpenRouter' : name === 'cohere' ? 'Cohere' : 'Gemini';

                  return (
                    <div key={`${name}-${index}`} className="flex items-center gap-3">
                      <span className={`w-2.5 h-2.5 rounded-full ${isWinner ? 'bg-success' : 'bg-warning'}`} />
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs text-txt-primary">{label}</span>
                        <MetaBadge
                          tone={isWinner ? 'success' : 'warning'}
                          label={isWinner ? 'Answered' : 'Skipped / failed'}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </details>
          ) : null}

          {log ? (
            <details className="rounded-md border border-border/70 bg-bg/50 p-3">
              <summary className="text-xs font-medium text-txt-primary cursor-pointer">Raw log</summary>
              <pre className="mt-2 text-[10px] text-txt-muted font-mono whitespace-pre-wrap break-all leading-relaxed">{log}</pre>
            </details>
          ) : null}
        </div>
      )}
    </div>
  );
};

const FixDiffCard: React.FC<{
  fix: string;
  tone: 'success' | 'accent';
}> = ({ fix, tone }) => {
  const explanation = explainFix(fix);
  const diff = buildFixDiff(explanation);
  const borderTone = tone === 'success' ? 'border-success/10' : 'border-accent/10';
  const trust = getFixTrustLabel(fix);
  const trustToneClass =
    trust.tone === 'warning'
      ? 'border-warning/20 bg-warning/[0.03] text-warning'
      : trust.tone === 'accent'
        ? 'border-accent/20 bg-accent/[0.03] text-accent'
        : 'border-success/20 bg-success/[0.03] text-success';

  return (
    <div className={`fix-diff-card rounded-md border ${borderTone} bg-bg/40 p-3`}>
      <div className="flex items-center gap-2 mb-2">
        <span className={`inline-flex items-center px-2 py-0.5 rounded-md border text-[10px] ${trustToneClass}`}>
          {trust.label}
        </span>
      </div>
      <p className="text-xs text-txt-primary">{explanation.summary}</p>
      {diff.length > 0 && (
        <div className="mt-2 rounded-md border border-border/60 overflow-hidden">
          {diff.map((line, index) => (
            <div
              key={`${line.kind}-${line.text}-${index}`}
              className={`flex items-start gap-2 px-3 py-2 font-mono text-[10px] whitespace-pre-wrap break-all ${
                line.kind === 'added'
                  ? 'bg-success/[0.06] text-success'
                  : line.kind === 'removed'
                    ? 'bg-error/[0.06] text-error'
                    : 'bg-bg/30 text-txt-secondary'
              }`}
            >
              <span className="w-3 shrink-0 text-center font-semibold">
                {line.kind === 'added' ? '+' : line.kind === 'removed' ? '-' : '·'}
              </span>
              <span>{line.text}</span>
            </div>
          ))}
        </div>
      )}
      <p className="text-[11px] text-txt-muted mt-2">{fix}</p>
    </div>
  );
};

const LatexDisplay: React.FC<{
  latexCode: string | undefined;
  validationIssues: ValidationIssue[];
  onLatexChange?: (newLatex: string) => void;
  showToast?: (message: string, type?: 'success' | 'error' | 'info') => void;
}> = ({ latexCode, validationIssues, onLatexChange, showToast }) => {
  const [isCopied, copy] = useCopyToClipboard();
  const isValid = validationIssues.length === 0;
  const latexSectionRef = useRef<HTMLDivElement>(null);
  const copyBtnRef = useRef<HTMLButtonElement>(null);

  const handleCopy = () => {
    if (latexCode) {
      copy(latexCode);
      showToast?.('Source code copied to clipboard', 'success');
    }
  };

  // Copy button success bounce
  useEffect(() => {
    if (isCopied && copyBtnRef.current) {
      const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (prefersReduced) return;
      gsap.fromTo(copyBtnRef.current,
        { scale: 1 },
        { scale: 1.15, duration: 0.15, ease: 'back.out(3)', yoyo: true, repeat: 1 }
      );
    }
  }, [isCopied]);

  // Scroll-triggered reveal for LaTeX editor section
  useEffect(() => {
    if (latexCode === undefined || !latexSectionRef.current) return;
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReduced) return;
    gsap.fromTo(latexSectionRef.current,
      { opacity: 0, y: 20 },
      {
        opacity: 1, y: 0, duration: 0.6, ease: 'power2.out',
        scrollTrigger: {
          trigger: latexSectionRef.current,
          start: 'top 90%',
          toggleActions: 'play none none none',
        }
      }
    );
    return () => {
      if (latexSectionRef.current) {
        ScrollTrigger.getAll().filter(t => t.trigger === latexSectionRef.current).forEach(t => t.kill());
      }
    };
  }, [latexCode !== undefined]);

  if (latexCode === undefined) {
    return (
      <div className="mt-8">
        <h3 className="text-sm font-medium text-txt-secondary mb-3">Source code</h3>
        <div className="bg-bg rounded-xl border border-border p-6 h-64 flex items-center justify-center">
          <div className="flex items-center gap-3">
            <Spinner />
            <span className="text-txt-secondary text-sm">Waiting for output...</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div ref={latexSectionRef} className="mt-8">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-3 gap-3">
        <h3 className="text-sm font-medium text-txt-secondary flex items-center gap-2.5">
          LaTeX source
          <span className={`inline-flex items-center px-2 py-0.5 text-[10px] font-medium rounded-md border ${isValid ? 'border-success/25 text-success bg-success/5' : 'border-error/25 text-error bg-error/5'}`}>
            {isValid ? 'Valid' : 'Errors found'}
          </span>
        </h3>
        <button
          ref={copyBtnRef}
          onClick={handleCopy}
          className="btn-secondary flex items-center gap-1.5 !text-xs !px-2.5 !py-1"
        >
          <CopyIcon className="w-3 h-3" />
          {isCopied ? 'Copied!' : 'Copy'}
        </button>
      </div>

      <div className="relative rounded-xl border border-border bg-bg overflow-hidden">
        {/* Editor title bar */}
        <div className="flex items-center justify-between px-4 py-2 bg-bg-secondary/50 border-b border-border">
          <div className="flex gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-txt-muted/30"></div>
            <div className="w-2.5 h-2.5 rounded-full bg-txt-muted/30"></div>
            <div className="w-2.5 h-2.5 rounded-full bg-txt-muted/30"></div>
          </div>
          <div className="flex items-center gap-1.5">
            <EditIcon className="w-3 h-3 text-txt-muted" />
            <span className="text-[10px] text-txt-muted">Editable</span>
          </div>
        </div>

        <textarea
          value={latexCode}
          onChange={(e) => onLatexChange?.(e.target.value)}
          spellCheck={false}
          className="w-full h-[500px] p-5 text-xs sm:text-sm font-mono text-txt-primary bg-bg border-none focus:ring-0 focus:outline-none resize-y selection:bg-accent selection:text-white leading-relaxed"
        />

        {/* Validation Issues */}
        {!isValid && (
          <div className="border-t border-error/15 bg-error/[0.03] p-4 rounded-b-xl">
            <h4 className="text-error text-xs font-medium mb-2 flex items-center gap-1.5">
              <AlertIcon className="w-3 h-3" />
              Warnings
            </h4>
            <ul className="space-y-1">
              {validationIssues.map((issue, idx) => (
                <li key={idx} className="text-xs text-error/70 font-mono flex items-start gap-2">
                  <span className="text-error/30 mt-0.5">•</span>
                  {issue.message}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
};

export const ResultDisplay: React.FC<ResultDisplayProps> = ({ result, isLoading, onLatexChange, onPdfCompiled, showToast }) => {
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [isCompiling, setIsCompiling] = useState(false);
  const [compileLog, setCompileLog] = useState<string | null>(null);
  const [compileError, setCompileError] = useState(false);
  const [compileErrorType, setCompileErrorType] = useState<'syntax' | 'service' | 'network' | 'validation' | null>(null);
  const [compileFixes, setCompileFixes] = useState<string[]>([]);
  const [compileDiagnostics, setCompileDiagnostics] = useState<Diagnostic[]>([]);
  const [showDownloadWarning, setShowDownloadWarning] = useState(false);
  const [showCompileWarning, setShowCompileWarning] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [localPdfBlob, setLocalPdfBlob] = useState<Blob | null>(null);
  const buttonsRef = useRef<HTMLDivElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);
  const compileLogRef = useRef<HTMLDivElement>(null);
  const compileBtnRef = useRef<HTMLButtonElement>(null);
  const downloadingRef = useRef(false);
  const statusCardRef = useRef<HTMLDivElement>(null);
  const badgeStripRef = useRef<HTMLDivElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const generationFixesRef = useRef<HTMLDivElement>(null);
  const compileFixesRef = useRef<HTMLDivElement>(null);
  const diagnosticsDrawerRef = useRef<HTMLDivElement>(null);
  const generationFixes = result.fixes ?? [];
  const provider = result.provider;
  const timeline = result.timeline ?? [];

  // Elapsed timer for generation
  useEffect(() => {
    if (!isLoading) { setElapsedSec(0); return; }
    const t = setInterval(() => setElapsedSec(s => s + 1), 1000);
    return () => clearInterval(t);
  }, [isLoading]);

  // Debounced validation (300ms)
  const [validationIssues, setValidationIssues] = useState<ValidationIssue[]>([]);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setValidationIssues(result.latexCode ? validateLatex(result.latexCode) : []);
    }, 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [result.latexCode]);

  const readiness = getReadinessStatus({
    validationIssues,
    generationFixes,
    compileDiagnostics,
    compileError,
    hasPdf: Boolean(localPdfBlob || result.pdfBlob),
  });
  const statusActionLabel =
    readiness.tone === 'attention'
      ? 'Review issues first'
      : compileDiagnostics.length > 0
        ? 'Review diagnostics'
        : 'Compile now';

  // Stagger-reveal action buttons when result completes + success glow + burst
  const isComplete = !isLoading && result.latexCode !== undefined;
  useEffect(() => {
    if (isComplete && buttonsRef.current) {
      const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (prefersReduced) return;
      const btns = buttonsRef.current.querySelectorAll('.action-btn');
      // 3D cascade entrance with blur
      gsap.fromTo(btns,
        { opacity: 0, y: 12, scale: 0.85, filter: 'blur(3px)', rotateX: -10 },
        { opacity: 1, y: 0, scale: 1, filter: 'blur(0px)', rotateX: 0, duration: 0.4, stagger: 0.06, ease: 'power4.out', delay: 0.1 }
      );

      // Success celebration: glow pulse + radial burst particles
      const successIcon = buttonsRef.current.parentElement?.querySelector('.success-glow');
      if (successIcon) {
        gsap.fromTo(successIcon,
          { boxShadow: '0 0 0px rgba(34,197,94,0)' },
          { boxShadow: '0 0 35px rgba(34,197,94,0.5)', duration: 0.6, yoyo: true, repeat: 1, ease: 'power2.inOut' }
        );
        // Spawn 6 burst particles
        const parent = successIcon as HTMLElement;
        const rect = parent.getBoundingClientRect();
        const angles = [0, 60, 120, 180, 240, 300];
        const burstNames = ['burst-up', 'burst-ur', 'burst-dr', 'burst-down', 'burst-dl', 'burst-ul'];
        angles.forEach((_, i) => {
          const dot = document.createElement('div');
          dot.style.cssText = `position:fixed;left:${rect.left + rect.width / 2 - 3}px;top:${rect.top + rect.height / 2 - 3}px;width:6px;height:6px;border-radius:50%;background:rgb(16,185,129);z-index:50;pointer-events:none;animation:${burstNames[i]} 0.6s ease-out forwards;`;
          document.body.appendChild(dot);
          setTimeout(() => dot.remove(), 700);
        });
      }
    }
  }, [isComplete]);

  useEffect(() => {
    if (!isComplete) return;
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReduced) return;

    const refs = [
      statusCardRef.current,
      badgeStripRef.current,
      timelineRef.current,
      generationFixesRef.current,
      compileFixesRef.current,
      diagnosticsDrawerRef.current,
    ].filter((element): element is HTMLDivElement => element !== null);

    if (refs.length === 0) return;

    gsap.fromTo(
      refs,
      { opacity: 0, y: 10 },
      {
        opacity: 1,
        y: 0,
        duration: 0.35,
        stagger: 0.06,
        ease: 'power2.out',
        clearProps: 'opacity,transform',
      },
    );
  }, [
    isComplete,
    generationFixes.length,
    compileFixes.length,
    compileDiagnostics.length,
    timeline.length,
    provider?.name,
  ]);

  useEffect(() => {
    if (!isComplete || !statusCardRef.current) return;
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReduced) return;

    gsap.fromTo(
      statusCardRef.current,
      { boxShadow: '0 0 0px rgba(16,185,129,0)' },
      {
        boxShadow: '0 0 24px rgba(16,185,129,0.12)',
        duration: 0.28,
        yoyo: true,
        repeat: 1,
        ease: 'power1.inOut',
      },
    );
  }, [isComplete, result.latexCode]);

  useEffect(() => {
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReduced) return;

    const cards = [
      ...(generationFixesRef.current?.querySelectorAll('.fix-diff-card') ?? []),
      ...(compileFixesRef.current?.querySelectorAll('.fix-diff-card') ?? []),
    ];

    if (cards.length === 0) return;

    gsap.fromTo(
      cards,
      { opacity: 0, y: 6, scale: 0.99 },
      {
        opacity: 1,
        y: 0,
        scale: 1,
        duration: 0.22,
        stagger: 0.05,
        ease: 'power2.out',
        clearProps: 'opacity,transform',
      },
    );
  }, [generationFixes.length, compileFixes.length]);

  // GSAP progress bar for compilation with glow pulse
  useEffect(() => {
    if (isCompiling && progressRef.current) {
      const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (prefersReduced) return;
      progressRef.current.classList.add('progress-glow');
      gsap.fromTo(progressRef.current,
        { width: '0%' },
        { width: '85%', duration: 8, ease: 'power1.out' }
      );
    } else if (!isCompiling && progressRef.current) {
      progressRef.current.classList.remove('progress-glow');
      gsap.to(progressRef.current, {
        width: '100%', duration: 0.3, ease: 'power2.out',
        onComplete: () => {
          if (progressRef.current) gsap.set(progressRef.current, { width: '0%' });
        }
      });
    }
  }, [isCompiling]);

  // GSAP slide-in for compile log / error panel
  useEffect(() => {
    if (compileLog && compileLogRef.current) {
      const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (prefersReduced) return;
      gsap.fromTo(compileLogRef.current,
        { opacity: 0, height: 0, overflow: 'hidden' },
        { opacity: 1, height: 'auto', duration: 0.4, ease: 'power3.out', clearProps: 'overflow' }
      );
    }
  }, [compileLog, compileError]);

  useEffect(() => {
    setCompileLog(null);
    setCompileError(false);
    setCompileErrorType(null);
    setCompileFixes([]);
    setCompileDiagnostics([]);
    setLocalPdfBlob(null);
    setShowCompileWarning(false);
    setShowDownloadWarning(false);
  }, [result.latexCode]);

  const downloadBlob = (blob: Blob, defaultFilename: string) => {
    if (downloadingRef.current) return;
    downloadingRef.current = true;

    console.log("DOWNLOAD CHECK:", blob.type, blob.size);
    if (blob.size < 50) {
      console.error("Blob size too small:", blob.size);
      downloadingRef.current = false;
      return;
    }

    try {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = defaultFilename;
      a.style.display = 'none';
      document.body.appendChild(a);

      // ✅ Click immediately to stay in user-activation cycle
      a.click();

      // ✅ Delay cleanup to allow stream to start
      setTimeout(() => {
        URL.revokeObjectURL(url);
        if (document.body.contains(a)) {
          document.body.removeChild(a);
        }
        downloadingRef.current = false;
      }, 3000);
    } catch (err) {
      console.error("Download failed:", err);
      downloadingRef.current = false;
    }
  };

  const handleCompilePdf = async () => {
    if (!result.latexCode) return;

    // Gate: warn if validation errors exist
    const errors = validationIssues.filter(i => i.type === 'error');
    if (errors.length > 0 && !showCompileWarning) {
      setShowCompileWarning(true);
      return;
    }
    setShowCompileWarning(false);

    setIsCompiling(true);
    setCompileLog(null);
    setCompileError(false);
    setCompileErrorType(null);
    setCompileFixes([]);
    setCompileDiagnostics([]);

    try {
      const compResult: CompilationResult = await compileToPdf(result.latexCode);
      setCompileLog(compResult.log);
      setCompileFixes(compResult.fixes);
      setCompileDiagnostics(compResult.diagnostics);

      if (compResult.success && compResult.pdfBlob) {
        setCompileError(false);
        setLocalPdfBlob(compResult.pdfBlob); // ✅ Local truth for immediate download
        onPdfCompiled?.(compResult.pdfBlob);
        // Compile success micro-animation
        if (compileBtnRef.current) {
          const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
          if (!prefersReduced) {
            gsap.fromTo(compileBtnRef.current,
              { scale: 1, boxShadow: '0 0 0px rgba(16,185,129,0)' },
              { scale: 1.15, boxShadow: '0 0 24px rgba(16,185,129,0.45)', duration: 0.25, yoyo: true, repeat: 1, ease: 'back.out(4)' }
            );
          }
        }
      } else {
        setCompileError(true);
        setCompileErrorType(compResult.errorType ?? null);
      }
    } catch (err: unknown) {
      setCompileLog(err instanceof Error ? err.message : 'Unknown error');
      setCompileError(true);
      setCompileErrorType(err instanceof Error && 'status' in err ? 'validation' : 'network');
      setCompileFixes([]);
      setCompileDiagnostics([]);
    } finally {
      setIsCompiling(false);
    }
  };

  const getDiagnosticTone = (diagnostic: Diagnostic) =>
    diagnostic.type === 'error'
      ? 'border-error/15 bg-error/[0.03]'
      : 'border-warning/15 bg-warning/[0.03]';

  const getDiagnosticLabel = (diagnostic: Diagnostic) => {
    switch (diagnostic.category) {
      case 'undefined-command':
        return 'Undefined command';
      case 'missing-package':
        return 'Missing package';
      case 'environment':
        return 'Environment mismatch';
      case 'encoding':
        return 'Encoding issue';
      case 'formatting':
        return 'Formatting warning';
      default:
        return diagnostic.type === 'error' ? 'Compile error' : 'Compile warning';
    }
  };

  const getReadinessTone = () => {
    switch (readiness.tone) {
      case 'ready':
        return 'border-emerald-500/25 bg-emerald-500/[0.10] text-emerald-100 shadow-[0_0_0_1px_rgba(16,185,129,0.04)]';
      case 'repaired':
        return 'border-amber-400/25 bg-amber-400/[0.10] text-amber-100 shadow-[0_0_0_1px_rgba(251,191,36,0.04)]';
      default:
        return 'border-red-400/25 bg-red-400/[0.10] text-red-100 shadow-[0_0_0_1px_rgba(248,113,113,0.04)]';
    }
  };

  const getStatusButtonTone = () => {
    if (readiness.tone === 'attention') {
      return 'border-red-300/30 bg-red-950/30 text-red-100 hover:bg-red-950/50';
    }

    if (compileDiagnostics.length > 0) {
      return 'border-amber-300/30 bg-amber-950/30 text-amber-100 hover:bg-amber-950/50';
    }

    return 'border-white/15 bg-white/10 text-white hover:bg-white/15';
  };

  const handleStatusAction = () => {
    if (readiness.tone === 'attention') {
      document
        .querySelector('textarea')
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

    if (compileDiagnostics.length > 0 || compileLog) {
      compileLogRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

    void handleCompilePdf();
  };

  const handleDownloadPdf = () => {
    const blobToDownload = localPdfBlob || result.pdfBlob;
    if (!blobToDownload) return;

    console.log("DOWNLOADING SAME BLOB:", localPdfBlob === result.pdfBlob);
    downloadBlob(blobToDownload, `ARC_CLUB_ASSIGNMENT_${Date.now()}.pdf`);
  };

  const handleDownloadTex = () => {
    if (!result.latexCode) return;
    const blob = new Blob([result.latexCode], { type: 'text/x-tex' });
    downloadBlob(blob, `assignment_${Date.now()}.tex`);
  };

  const handleDownloadAll = async () => {
    if (!result.latexCode) return;

    if (validationIssues.length > 0 && !showDownloadWarning) {
      setShowDownloadWarning(true);
      return;
    }
    setShowDownloadWarning(false);

    try {
      // Load JSZip on-demand — not in the initial bundle
      const { default: JSZip } = await import('jszip');
      const zip = new JSZip();
      zip.file("assignment.tex", result.latexCode || "");
      const blobForZip = localPdfBlob || result.pdfBlob;
      if (blobForZip) {
        zip.file("assignment.pdf", blobForZip);
      }

      zip.generateAsync({ type: "blob" }).then((content: Blob) => {
        downloadBlob(content, `ARC_CLUB_ASSIGNMENT_${Date.now()}.zip`);
      }).catch((err: Error) => {
        console.error('ZIP generation failed:', err);
      });
    } catch (err) {
      console.error('JSZip error:', err);
    }
  };

  const handlePreview = () => {
    setIsPreviewOpen(true);
  };

  const handleOpenInOverleaf = () => {
    if (!result.latexCode) return;
    const form = document.createElement('form');
    form.method = 'POST';
    form.action = 'https://www.overleaf.com/docs';
    form.target = '_blank';
    const input = document.createElement('input');
    input.type = 'hidden';
    input.name = 'encoded_snip';
    input.value = result.latexCode;
    form.appendChild(input);
    document.body.appendChild(form);
    form.submit();
    document.body.removeChild(form);
  };

  return (
    <>
      <div className="pb-6">
        {isComplete ? (
          <div className="mb-6 space-y-4">
            {/* Success header */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-base font-heading font-semibold text-txt-primary flex items-center gap-2">
                  <div className="w-5 h-5 rounded-full bg-success/10 flex items-center justify-center success-glow">
                    <CheckIcon className="w-3 h-3 text-success" />
                  </div>
                  Generation complete
                </h2>
                <p className="text-txt-muted mt-0.5 text-xs pl-7">
                  Your assignment is ready for download.
                </p>
                {provider && (
                  <div className="pl-7 mt-2 flex flex-wrap items-center gap-2 text-[11px]">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-md border border-accent/20 bg-accent/[0.03] text-accent font-medium">
                      {provider.name === 'openrouter'
                        ? 'OpenRouter'
                        : provider.name === 'cohere'
                          ? 'Cohere'
                          : 'Gemini'}
                    </span>
                    <span className="hidden sm:inline text-txt-muted">
                      {provider.model}
                    </span>
                    <span className="hidden sm:inline text-txt-muted">
                      {provider.latencyMs} ms
                    </span>
                  </div>
                )}
              </div>
            </div>

            <div ref={statusCardRef} className={`rounded-xl border p-4 mb-4 max-w-2xl transition-shadow duration-200 hover:shadow-sm ${getReadinessTone()}`}>
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 mb-1.5">
                    {readiness.tone === 'attention' ? (
                      <AlertIcon className="w-4 h-4" />
                    ) : (
                      <CheckIcon className="w-4 h-4" />
                    )}
                    <h3 className="text-base font-semibold">{readiness.label}</h3>
                  </div>
                  <p className="text-sm mt-1 text-current/80">{readiness.detail}</p>
                </div>
                <button
                  onClick={handleStatusAction}
                  className={`self-start sm:self-center rounded-lg border px-3 py-2 text-xs font-medium transition duration-150 active:scale-[0.98] ${getStatusButtonTone()}`}
                >
                  {statusActionLabel}
                </button>
              </div>
            </div>

            <div ref={badgeStripRef}>
              <BadgeStrip
                provider={provider}
                fixesCount={generationFixes.length + compileFixes.length}
                diagnosticsCount={compileDiagnostics.length}
              />
            </div>

            <MobileTrustSummary
              provider={provider}
              fixesCount={generationFixes.length + compileFixes.length}
              diagnosticsCount={compileDiagnostics.length}
            />

            <div ref={timelineRef}>
              <GenerationTimeline steps={timeline} />
            </div>

            <div className="hidden sm:block max-w-2xl">
              <p className="text-[11px] uppercase tracking-wide text-txt-muted mb-2">Pipeline Summary</p>
              <hr className="border-gray-200 my-4" />
            </div>

            {/* Action buttons */}
            <div ref={buttonsRef} className="flex flex-wrap gap-2">
              {/* Compile PDF */}
              <button
                ref={compileBtnRef}
                onClick={handleCompilePdf}
                disabled={isCompiling}
                className={`action-btn btn-secondary flex items-center gap-1.5 !text-xs transition duration-150 active:scale-[0.98] ${isCompiling
                    ? '!text-txt-muted cursor-wait'
                    : result.pdfBlob
                      ? '!border-success/25 !text-success hover:!bg-success/5'
                      : ''
                  }`}
              >
                <PdfIcon className="w-3.5 h-3.5" />
                {isCompiling ? 'Compiling...' : result.pdfBlob ? 'Recompile' : 'Compile PDF'}
              </button>
              {/* Preview */}
              <button
                onClick={handlePreview}
                className="action-btn btn-secondary flex items-center gap-1.5 !text-xs transition duration-150 hover:!border-white/15 hover:!bg-white/10 hover:!text-white active:scale-[0.98]"
              >
                <EyeIcon className="w-3.5 h-3.5" />
                {result.pdfBlob ? 'Preview' : 'Preview HTML'}
              </button>
              {/* Download PDF */}
              {result.pdfBlob && (
                <button
                  onClick={handleDownloadPdf}
                  className="action-btn btn-secondary flex items-center gap-1.5 !text-xs !border-success/25 !text-success hover:!bg-success/5 transition duration-150 active:scale-[0.98]"
                >
                  <DownloadIcon className="w-3.5 h-3.5" />
                  PDF
                </button>
              )}
              {/* Open in Overleaf */}
              <button
                onClick={handleOpenInOverleaf}
                className="action-btn btn-secondary flex items-center gap-1.5 !text-xs !border-[#47a141]/25 !text-[#47a141] hover:!bg-[#47a141]/5 transition duration-150 active:scale-[0.98]"
              >
                <OverleafIcon className="w-3.5 h-3.5" />
                Overleaf
                <ExternalLinkIcon className="w-2.5 h-2.5 opacity-40" />
              </button>
              {/* Download TEX */}
              <button
                onClick={handleDownloadTex}
                className="action-btn btn-secondary flex items-center gap-1.5 !text-xs transition duration-150 hover:!border-white/15 hover:!bg-white/10 hover:!text-white active:scale-[0.98]"
              >
                <DownloadIcon className="w-3.5 h-3.5" />
                .tex
              </button>
              {/* Download ZIP */}
              <button
                onClick={handleDownloadAll}
                className={`action-btn btn-secondary flex items-center gap-1.5 !text-xs transition duration-150 active:scale-[0.98] ${validationIssues.length > 0
                    ? '!border-warning/25 !text-warning hover:!bg-warning/5'
                    : ''
                  }`}
              >
                <DownloadIcon className="w-3.5 h-3.5" />
                .zip
              </button>
            </div>

            {/* Compile progress bar */}
            {isCompiling && (
              <div className="w-full h-1 bg-bg-secondary rounded-full overflow-hidden">
                <div ref={progressRef} className="h-full bg-accent rounded-full" style={{ width: 0 }} />
              </div>
            )}

            {/* Compile Warning Banner */}
            {showCompileWarning && (
              <div className="rounded-lg border border-warning/20 bg-warning/5 p-3.5 flex items-center justify-between gap-3 animate-fade-in">
                <div className="flex items-center gap-2.5">
                  <AlertIcon className="w-3.5 h-3.5 text-warning shrink-0" />
                  <span className="text-xs text-warning">Validation errors detected — compilation may fail. Compile anyway?</span>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button onClick={handleCompilePdf} className="px-3 py-1 text-xs font-medium rounded-md border border-warning/30 text-warning hover:bg-warning/10 transition-all">Compile</button>
                  <button onClick={() => setShowCompileWarning(false)} className="px-3 py-1 text-xs font-medium rounded-md border border-border text-txt-secondary hover:text-txt-primary transition-all">Cancel</button>
                </div>
              </div>
            )}

            {/* Download Warning Banner */}
            {showDownloadWarning && (
              <div className="rounded-lg border border-warning/20 bg-warning/5 p-3.5 flex items-center justify-between gap-3 animate-fade-in">
                <div className="flex items-center gap-2.5">
                  <AlertIcon className="w-3.5 h-3.5 text-warning shrink-0" />
                  <span className="text-xs text-warning">Syntax errors detected — compilation may fail. Proceed?</span>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button onClick={handleDownloadAll} className="px-3 py-1 text-xs font-medium rounded-md border border-warning/30 text-warning hover:bg-warning/10 transition-all">Confirm</button>
                  <button onClick={() => setShowDownloadWarning(false)} className="px-3 py-1 text-xs font-medium rounded-md border border-border text-txt-secondary hover:text-txt-primary transition-all">Cancel</button>
                </div>
              </div>
            )}
            {generationFixes.length > 0 && (
              <div ref={generationFixesRef} className="rounded-lg border border-success/20 bg-success/[0.03] p-3.5 max-w-2xl">
                <h4 className="text-sm font-medium mb-2 flex items-center gap-1.5 text-success">
                  <CheckIcon className="w-3 h-3" />
                  Auto-fix report
                </h4>
                <p className="text-[11px] text-txt-muted mb-2">
                  The AI output needed a few structural LaTeX fixes before it was shown.
                </p>
                <div className="space-y-2">
                  {generationFixes.map((fix, idx) => (
                    <FixDiffCard key={`${fix}-${idx}`} fix={fix} tone="success" />
                  ))}
                </div>
              </div>
            )}
            {compileFixes.length > 0 && (
              <div ref={compileFixesRef} className="rounded-lg border border-accent/20 bg-accent/[0.03] p-3.5 max-w-2xl">
                <h4 className="text-sm font-medium mb-2 flex items-center gap-1.5 text-accent">
                  <CheckIcon className="w-3 h-3" />
                  Compile fixes applied
                </h4>
                <div className="space-y-2">
                  {compileFixes.map((fix, idx) => (
                    <FixDiffCard key={`${fix}-${idx}`} fix={fix} tone="accent" />
                  ))}
                </div>
              </div>
            )}
            <div ref={diagnosticsDrawerRef}>
              <DiagnosticsDrawer
                diagnostics={compileDiagnostics}
                log={compileLog}
                provider={provider}
              />
            </div>

            {/* Compilation Log */}
            {compileLog && (
              <div ref={compileLogRef} className={`rounded-lg border ${compileError ? 'border-error/20 bg-error/[0.03]' : 'border-success/20 bg-success/[0.03]'} p-3.5 max-h-48 overflow-y-auto`}>
                <h4 className={`text-xs font-medium mb-2 flex items-center gap-1.5 ${compileError ? 'text-error' : 'text-success'}`}>
                  <AlertIcon className="w-3 h-3" />
                  {compileError
                    ? compileErrorType === 'syntax'
                      ? 'Syntax error — fix LaTeX source and recompile'
                      : compileErrorType === 'service'
                        ? 'Compilation service unavailable — try again later'
                        : compileErrorType === 'network'
                          ? 'Network error — check your connection'
                          : 'Compilation failed'
                    : 'Compilation log'}
                </h4>
                <pre className="text-[10px] text-txt-muted font-mono whitespace-pre-wrap break-all leading-relaxed">{compileLog}</pre>
              </div>
            )}

            {/* Compiling Indicator */}
            {isCompiling && (
              <div aria-live="polite" className="flex items-center gap-3 p-3.5 rounded-lg border border-accent/15 bg-accent/[0.03]">
                <Spinner className="w-3.5 h-3.5 text-accent" />
                <div>
                  <p className="font-medium text-accent text-sm typing-cursor">Compiling LaTeX to PDF</p>
                  <p className="text-xs text-txt-muted mt-0.5">Using pdflatex on remote server...</p>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="mb-6 space-y-3">
            {/* Loading shimmer skeleton */}
            <div className="p-4 rounded-xl border border-accent/15 bg-accent/[0.03] flex items-center gap-3">
              <Spinner />
              <div>
                <p className="font-medium text-accent text-sm typing-cursor">Generating with AI</p>
                <p className="text-xs text-txt-muted mt-0.5">Processing your assignment question · {Math.floor(elapsedSec / 60)}:{(elapsedSec % 60).toString().padStart(2, '0')}</p>
              </div>
            </div>
            {/* Shimmer lines */}
            <div className="space-y-2.5">
              <div className="h-3 rounded shimmer w-full" />
              <div className="h-3 rounded shimmer w-4/5" />
              <div className="h-3 rounded shimmer w-3/5" />
            </div>
          </div>
        )}

        <LatexDisplay
          latexCode={result.latexCode}
          validationIssues={validationIssues}
          onLatexChange={onLatexChange}
          showToast={showToast}
        />
      </div>
      <PreviewModal
        isOpen={isPreviewOpen}
        onClose={() => setIsPreviewOpen(false)}
        result={{ ...result, pdfBlob: (localPdfBlob || result.pdfBlob) as Blob }}
      />
    </>
  );
};

