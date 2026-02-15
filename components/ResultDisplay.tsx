
import React, { useState, useEffect, useRef } from 'react';
import type { GenerationResult } from '../types';
import { useCopyToClipboard } from '../hooks/useCopyToClipboard';
import { CopyIcon, DownloadIcon, CheckIcon, EyeIcon, AlertIcon, EditIcon, PdfIcon, OverleafIcon, ExternalLinkIcon } from './icons';
import { PreviewModal } from './PreviewModal';
import { validateLatex, type ValidationIssue } from '../utils/latexValidator';
import { compileToPdf, type CompilationResult } from '../services/latexCompiler';

declare var JSZip: any;

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

  if (latexCode === undefined) {
    return (
      <div className="mt-16">
        <h3 className="text-2xl font-oswald font-bold mb-4 text-white uppercase"><span className="text-accent mr-3">///</span> SOURCE_CODE</h3>
        <div className="bg-[#0a0a0a] border border-border p-6 h-64 flex items-center justify-center">
            <div className="text-accent font-mono text-sm animate-pulse">WAITING_FOR_DATA_STREAM...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-16">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-6 gap-4">
         <h3 className="text-2xl font-oswald font-bold text-white flex items-center uppercase gap-4">
             <span className="text-accent">///</span> LaTeX_SOURCE
             <span className={`inline-flex items-center px-2 py-1 text-[10px] font-mono uppercase border ${isValid ? 'border-green-500/50 text-green-500' : 'border-red-500/50 text-red-500'}`}>
                 {isValid ? 'STRUCTURE_VALID' : 'SYNTAX_ERRORS_DETECTED'}
             </span>
         </h3>
         <button
            onClick={() => copy(latexCode)}
            className="flex items-center px-4 py-2 text-xs font-mono font-bold uppercase border border-border text-text-muted hover:border-white hover:text-white transition-all bg-black"
          >
            {isCopied ? 'COPIED_TO_CLIPBOARD' : 'COPY_SOURCE'}
          </button>
      </div>
      
      <div className="relative border border-border bg-[#050505]">
            <div className="flex items-center justify-between px-4 py-2 bg-[#0a0a0a] border-b border-border">
                <div className="flex gap-2">
                    <div className="w-2 h-2 bg-border"></div>
                    <div className="w-2 h-2 bg-border"></div>
                    <div className="w-2 h-2 bg-border"></div>
                </div>
                <div className="flex items-center gap-2">
                     <EditIcon className="w-3 h-3 text-accent" />
                     <span className="text-[10px] text-text-muted font-mono tracking-widest uppercase">WRITE_ACCESS: ENABLED</span>
                </div>
            </div>
            
            <textarea 
                value={latexCode}
                onChange={(e) => onLatexChange?.(e.target.value)}
                spellCheck={false}
                className="w-full h-[500px] p-6 text-xs sm:text-sm font-mono text-text-main bg-[#050505] border-none focus:ring-0 focus:outline-none resize-y selection:bg-accent selection:text-black leading-relaxed"
            />
            
            {/* Validation Issues Report */}
            {!isValid && (
                <div className="border-t border-red-900/50 bg-red-900/10 p-4">
                    <h4 className="text-red-500 text-xs font-bold font-oswald uppercase tracking-wider mb-2 flex items-center">
                        <AlertIcon className="w-3 h-3 mr-2" />
                        CRITICAL_WARNINGS
                    </h4>
                    <ul className="space-y-1">
                        {validationIssues.map((issue, idx) => (
                            <li key={idx} className="text-xs text-red-400 font-mono flex items-start">
                                <span className="mr-2 text-red-600">&gt;</span>
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
  const [showDownloadWarning, setShowDownloadWarning] = useState(false);

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

  const handleCompilePdf = async () => {
    if (!result.latexCode) return;
    setIsCompiling(true);
    setCompileLog(null);
    setCompileError(false);

    try {
      const compResult: CompilationResult = await compileToPdf(result.latexCode);
      setCompileLog(compResult.log);

      if (compResult.success && compResult.pdfBlob) {
        setCompileError(false);
        onPdfCompiled?.(compResult.pdfBlob);
      } else {
        setCompileError(true);
      }
    } catch (err: any) {
      setCompileLog(err.message || 'Unknown error');
      setCompileError(true);
    } finally {
      setIsCompiling(false);
    }
  };

  const handleDownloadPdf = () => {
    if (!result.pdfBlob) return;
    const link = document.createElement('a');
    link.href = URL.createObjectURL(result.pdfBlob);
    link.download = 'YUGESH_LABS_ASSIGNMENT.pdf';
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
        link.download = "YUGESH_LABS_ASSIGNMENT.zip";
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

  const isComplete = !isLoading && result.latexCode !== undefined;

  return (
    <>
      <div className="pb-12 animate-fade-in">
          {isComplete ? (
              <div className="mb-10 border border-green-500/30 bg-green-500/5 p-6 flex flex-col gap-6 backdrop-blur-md">
                    <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
                        <div>
                            <h2 className="text-2xl font-oswald font-bold text-green-500 flex items-center gap-3 uppercase">
                                <CheckIcon className="w-5 h-5" />
                                GENERATION_COMPLETE
                            </h2>
                            <p className="text-text-muted mt-1 text-xs font-mono uppercase tracking-wider pl-8">
                                PAYLOAD READY FOR EXTRACTION.
                            </p>
                        </div>
                        <div className="flex flex-wrap gap-3">
                            {/* Compile PDF Button */}
                            <button
                                onClick={handleCompilePdf}
                                disabled={isCompiling}
                                className={`flex items-center px-6 py-3 text-sm font-oswald font-bold uppercase border transition-all ${
                                    isCompiling
                                    ? 'border-accent/50 text-accent/50 cursor-wait'
                                    : result.pdfBlob
                                    ? 'border-green-500 text-green-500 hover:bg-green-500 hover:text-black'
                                    : 'border-accent text-accent hover:bg-accent hover:text-black'
                                }`}
                            >
                                <PdfIcon className="w-4 h-4 mr-2" />
                                {isCompiling ? 'COMPILING...' : result.pdfBlob ? 'RECOMPILE_PDF' : 'COMPILE_PDF'}
                            </button>
                            {/* Preview Button */}
                            <button
                                onClick={handlePreview}
                                className="flex items-center px-6 py-3 border border-border text-white text-sm font-oswald font-bold uppercase hover:bg-white hover:text-black transition-all"
                            >
                                <EyeIcon className="w-4 h-4 mr-2" />
                                {result.pdfBlob ? 'PREVIEW_PDF' : 'PREVIEW_DOC'}
                            </button>
                            {/* Download PDF (only if compiled) */}
                            {result.pdfBlob && (
                                <button
                                    onClick={handleDownloadPdf}
                                    className="flex items-center px-6 py-3 border border-green-500 text-green-500 text-sm font-oswald font-bold uppercase hover:bg-green-500 hover:text-black transition-all"
                                >
                                    <DownloadIcon className="w-4 h-4 mr-2" />
                                    DOWNLOAD_PDF
                                </button>
                            )}
                            {/* Open in Overleaf */}
                            <button
                                onClick={handleOpenInOverleaf}
                                className="flex items-center px-6 py-3 border border-[#47a141] text-[#47a141] text-sm font-oswald font-bold uppercase hover:bg-[#47a141] hover:text-black transition-all"
                            >
                                <OverleafIcon className="w-4 h-4 mr-2" />
                                OPEN_IN_OVERLEAF
                                <ExternalLinkIcon className="w-3 h-3 ml-1.5 opacity-60" />
                            </button>
                            {/* Download TEX */}
                            <button
                                onClick={handleDownloadTex}
                                className="flex items-center px-6 py-3 border border-border text-text-muted text-sm font-oswald font-bold uppercase hover:border-white hover:text-white transition-all"
                            >
                                <DownloadIcon className="w-4 h-4 mr-2" />
                                DOWNLOAD_TEX
                            </button>
                            {/* Download ZIP */}
                            <button
                                onClick={handleDownloadAll}
                                className={`flex items-center px-6 py-3 text-sm font-oswald font-bold uppercase border transition-all ${
                                    validationIssues.length > 0 
                                    ? 'border-yellow-500 text-yellow-500 hover:bg-yellow-500 hover:text-black' 
                                    : 'border-border text-text-muted hover:border-white hover:text-white'
                                }`}
                                >
                                <DownloadIcon className="w-4 h-4 mr-2" />
                                DOWNLOAD_ZIP
                            </button>
                        </div>
                    </div>

                    {/* Download Warning Banner (replaces window.confirm) */}
                    {showDownloadWarning && (
                        <div className="border border-yellow-500/50 bg-yellow-900/10 p-4 flex items-center justify-between gap-4 animate-fade-in">
                            <div className="flex items-center gap-3">
                                <AlertIcon className="w-4 h-4 text-yellow-500 shrink-0" />
                                <span className="text-xs font-mono text-yellow-500 uppercase tracking-wider">SYNTAX_ERRORS_DETECTED — COMPILATION MAY FAIL. PROCEED?</span>
                            </div>
                            <div className="flex gap-2 shrink-0">
                                <button onClick={handleDownloadAll} className="px-4 py-1.5 text-[10px] font-mono font-bold uppercase border border-yellow-500 text-yellow-500 hover:bg-yellow-500 hover:text-black transition-all">CONFIRM</button>
                                <button onClick={() => setShowDownloadWarning(false)} className="px-4 py-1.5 text-[10px] font-mono font-bold uppercase border border-border text-text-muted hover:text-white transition-all">CANCEL</button>
                            </div>
                        </div>
                    )}

                    {/* Compilation Log */}
                    {compileLog && (
                        <div className={`border ${compileError ? 'border-red-900/50 bg-red-900/10' : 'border-green-900/50 bg-green-900/10'} p-4 max-h-48 overflow-y-auto`}>
                            <h4 className={`text-xs font-bold font-oswald uppercase tracking-wider mb-2 flex items-center ${compileError ? 'text-red-500' : 'text-green-500'}`}>
                                <AlertIcon className="w-3 h-3 mr-2" />
                                {compileError ? 'COMPILATION_FAILED' : 'COMPILATION_LOG'}
                            </h4>
                            <pre className="text-[10px] text-text-muted font-mono whitespace-pre-wrap break-all leading-relaxed">{compileLog}</pre>
                        </div>
                    )}

                    {/* Compiling Indicator */}
                    {isCompiling && (
                        <div aria-live="polite" className="flex items-center gap-4 p-4 border border-accent/30 bg-accent/5">
                            <div className="w-2 h-2 bg-accent animate-ping"></div>
                            <div>
                                <p className="font-oswald font-bold text-accent uppercase tracking-widest text-sm">COMPILING LATEX → PDF</p>
                                <p className="text-xs font-mono text-accent/70 mt-1">ENGINE: LaTeX Online (pdflatex) — Compiling on remote server...</p>
                            </div>
                        </div>
                    )}
              </div>
          ) : (
               <div className="mb-8 p-6 border border-accent/30 bg-accent/5 flex items-center justify-between">
                  <div className="flex items-center gap-4">
                     <div className="w-2 h-2 bg-accent animate-ping"></div>
                     <div>
                        <p className="font-oswald font-bold text-accent uppercase tracking-widest">NEURAL NETWORK ACTIVE</p>
                        <p className="text-xs font-mono text-accent/70 mt-1">PROCESSING_LOGIC_GATES...</p>
                     </div>
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
