
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
import '../lib/externalTypes';

interface ResultDisplayProps {
  result: Partial<GenerationResult>;
  isLoading: boolean;
  onLatexChange?: (newLatex: string) => void;
  onPdfCompiled?: (pdfBlob: Blob) => void;
}

const LatexDisplay: React.FC<{ 
    latexCode: string | undefined; 
    validationIssues: ValidationIssue[];
    onLatexChange?: (newLatex: string) => void;
}> = ({ latexCode, validationIssues, onLatexChange }) => {
  const [isCopied, copy] = useCopyToClipboard();
  const isValid = validationIssues.length === 0;
  const latexSectionRef = useRef<HTMLDivElement>(null);
  const copyBtnRef = useRef<HTMLButtonElement>(null);

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
    return () => { ScrollTrigger.getAll().forEach(t => t.kill()); };
  }, [latexCode]);

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
            onClick={() => copy(latexCode)}
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

export const ResultDisplay: React.FC<ResultDisplayProps> = ({ result, isLoading, onLatexChange, onPdfCompiled }) => {
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [isCompiling, setIsCompiling] = useState(false);
  const [compileLog, setCompileLog] = useState<string | null>(null);
  const [compileError, setCompileError] = useState(false);
  const [compileErrorType, setCompileErrorType] = useState<'syntax' | 'service' | 'network' | null>(null);
  const [showDownloadWarning, setShowDownloadWarning] = useState(false);
  const [showCompileWarning, setShowCompileWarning] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);
  const buttonsRef = useRef<HTMLDivElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);
  const compileLogRef = useRef<HTMLDivElement>(null);
  const compileBtnRef = useRef<HTMLButtonElement>(null);

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

  // Stagger-reveal action buttons when result completes + success glow
  const isComplete = !isLoading && result.latexCode !== undefined;
  useEffect(() => {
    if (isComplete && buttonsRef.current) {
      const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (prefersReduced) return;
      const btns = buttonsRef.current.querySelectorAll('.action-btn');
      gsap.fromTo(btns,
        { opacity: 0, y: 10, scale: 0.9 },
        { opacity: 1, y: 0, scale: 1, duration: 0.35, stagger: 0.05, ease: 'back.out(1.5)', delay: 0.1 }
      );

      // Success celebration: brief glow pulse on the success icon
      const successIcon = buttonsRef.current.parentElement?.querySelector('.success-glow');
      if (successIcon) {
        gsap.fromTo(successIcon,
          { boxShadow: '0 0 0px rgba(34,197,94,0)' },
          { boxShadow: '0 0 30px rgba(34,197,94,0.4)', duration: 0.5, yoyo: true, repeat: 1, ease: 'power2.inOut' }
        );
      }
    }
  }, [isComplete]);

  // GSAP progress bar for compilation
  useEffect(() => {
    if (isCompiling && progressRef.current) {
      const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (prefersReduced) return;
      gsap.fromTo(progressRef.current,
        { width: '0%' },
        { width: '85%', duration: 8, ease: 'power1.out' }
      );
    } else if (!isCompiling && progressRef.current) {
      gsap.to(progressRef.current, { width: '100%', duration: 0.3, ease: 'power2.out',
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

    try {
      const compResult: CompilationResult = await compileToPdf(result.latexCode);
      setCompileLog(compResult.log);

      if (compResult.success && compResult.pdfBlob) {
        setCompileError(false);
        onPdfCompiled?.(compResult.pdfBlob);
        // Compile success micro-animation
        if (compileBtnRef.current) {
          const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
          if (!prefersReduced) {
            gsap.fromTo(compileBtnRef.current,
              { scale: 1, boxShadow: '0 0 0px rgba(16,185,129,0)' },
              { scale: 1.12, boxShadow: '0 0 18px rgba(16,185,129,0.35)', duration: 0.2, yoyo: true, repeat: 1, ease: 'back.out(3)' }
            );
          }
        }
      } else {
        setCompileError(true);
        setCompileErrorType(compResult.errorType ?? null);
      }
    } catch (err: any) {
      setCompileLog(err.message || 'Unknown error');
      setCompileError(true);
      setCompileErrorType('network');
    } finally {
      setIsCompiling(false);
    }
  };

  const handleDownloadPdf = () => {
    if (!result.pdfBlob) return;
    const link = document.createElement('a');
    link.href = URL.createObjectURL(result.pdfBlob);
    link.download = 'ARC_CLUB_ASSIGNMENT.pdf';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
  };

  const handleDownloadTex = () => {
    if (!result.latexCode) return;
    const blob = new Blob([result.latexCode], { type: 'text/x-tex' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'assignment.tex';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
  };

  const handleDownloadAll = () => {
    if (!result.latexCode) return;

    if (validationIssues.length > 0 && !showDownloadWarning) {
        setShowDownloadWarning(true);
        return;
    }
    setShowDownloadWarning(false);

    try {
      const zip = new JSZip();
      zip.file("assignment.tex", result.latexCode);
      if (result.pdfBlob) {
        zip.file("assignment.pdf", result.pdfBlob);
      }

      zip.generateAsync({ type: "blob" }).then((content: Blob) => {
        const link = document.createElement("a");
        link.href = URL.createObjectURL(content);
        link.download = "ARC_CLUB_ASSIGNMENT.zip";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(link.href);
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
                        </div>
                    </div>

                    {/* Action buttons */}
                    <div ref={buttonsRef} className="flex flex-wrap gap-2">
                        {/* Compile PDF */}
                        <button
                            ref={compileBtnRef}
                            onClick={handleCompilePdf}
                            disabled={isCompiling}
                            className={`action-btn btn-secondary flex items-center gap-1.5 !text-xs ${
                                isCompiling
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
                            className="action-btn btn-secondary flex items-center gap-1.5 !text-xs"
                        >
                            <EyeIcon className="w-3.5 h-3.5" />
                            {result.pdfBlob ? 'Preview' : 'Preview HTML'}
                        </button>
                        {/* Download PDF */}
                        {result.pdfBlob && (
                            <button
                                onClick={handleDownloadPdf}
                                className="action-btn btn-secondary flex items-center gap-1.5 !text-xs !border-success/25 !text-success hover:!bg-success/5"
                            >
                                <DownloadIcon className="w-3.5 h-3.5" />
                                PDF
                            </button>
                        )}
                        {/* Open in Overleaf */}
                        <button
                            onClick={handleOpenInOverleaf}
                            className="action-btn btn-secondary flex items-center gap-1.5 !text-xs !border-[#47a141]/25 !text-[#47a141] hover:!bg-[#47a141]/5"
                        >
                            <OverleafIcon className="w-3.5 h-3.5" />
                            Overleaf
                            <ExternalLinkIcon className="w-2.5 h-2.5 opacity-40" />
                        </button>
                        {/* Download TEX */}
                        <button
                            onClick={handleDownloadTex}
                            className="action-btn btn-secondary flex items-center gap-1.5 !text-xs"
                        >
                            <DownloadIcon className="w-3.5 h-3.5" />
                            .tex
                        </button>
                        {/* Download ZIP */}
                        <button
                            onClick={handleDownloadAll}
                            className={`action-btn btn-secondary flex items-center gap-1.5 !text-xs ${
                                validationIssues.length > 0 
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
        />
      </div>
      <PreviewModal isOpen={isPreviewOpen} onClose={() => setIsPreviewOpen(false)} result={result} />
    </>
  );
};
