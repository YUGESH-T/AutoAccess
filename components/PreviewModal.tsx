import React, { useEffect, useMemo, useRef, useState } from 'react';
import DOMPurify from 'dompurify';
import type { GenerationResult } from '../types';
import { XIcon } from './icons';

interface PreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  result: Partial<GenerationResult>;
}

declare global {
  interface Window {
    MathJax: any;
  }
}

const latexToHtml = (latexCode: string): string => {
    if (!latexCode) return '';
    let processedLatex = latexCode;

    // Cleanup
    processedLatex = processedLatex
      .replace(/\\documentclass(?:\[.*?\])?\{.*?\}/g, '')
      .replace(/\\usepackage(?:\[.*?\])?\{.*?\}/g, '')
      .replace(/\\begin\{document\}/, '')
      .replace(/\\end\{document\}/, '')
      .trim();

    const replacements: { [key: string]: string } = {};
    let replaceCounter = 0;
  
    const addReplacement = (html: string) => {
      const key = `__REPLACEMENT_${replaceCounter++}__`;
      replacements[key] = html;
      return `\n\n${key}\n\n`;
    };

    const mathReplacements: { [key: string]: string } = {};
    let mathCounter = 0;
    
    const storeMath = (match: string) => {
        const key = `___MATH_SEQ_${mathCounter++}___`;
        mathReplacements[key] = match;
        return key;
    };

    processedLatex = processedLatex.replace(/\$\$([\s\S]*?)\$\$/g, match => addReplacement(match));
    processedLatex = processedLatex.replace(/\\\[([\s\S]*?)\\\]/g, match => addReplacement(match));
    processedLatex = processedLatex.replace(/\\\(([\s\S]*?)\\\)/g, match => storeMath(match));
    processedLatex = processedLatex.replace(/(?<!\\)\$([^\$\n]+?)(?<!\\)\$/g, match => storeMath(match));

    const titleMatch = processedLatex.match(/\\title\{(.*?)\}/s);
    const authorMatch = processedLatex.match(/\\author\{(.*?)\}/s);
    const dateMatch = processedLatex.match(/\\date\{(.*?)\}/s);
    
    processedLatex = processedLatex.replace(/\\title\{.*?\}/s, '');
    processedLatex = processedLatex.replace(/\\author\{.*?\}/s, '');
    processedLatex = processedLatex.replace(/\\date\{.*?\}/s, '');
    processedLatex = processedLatex.replace(/\\maketitle/, '');

    let headerHtml = '';
    if (titleMatch || authorMatch || dateMatch) {
      headerHtml += '<div class="mb-12 text-center pb-8 border-b border-gray-600">';
      if (titleMatch) headerHtml += `<h1 class="text-4xl font-serif font-bold text-gray-100 mb-4 uppercase tracking-tighter">${titleMatch[1]}</h1>`;
      if (authorMatch) headerHtml += `<p class="text-sm font-mono text-accent uppercase">${authorMatch[1]}</p>`;
      if (dateMatch) headerHtml += `<p class="text-xs font-mono text-gray-500 mt-2">${dateMatch[1]}</p>`;
      headerHtml += '</div>';
    }
  
    // Formatting
    processedLatex = processedLatex.replace(/\\textbf\{(.*?)\}/g, '<strong class="text-white font-bold">$1</strong>');
    processedLatex = processedLatex.replace(/\\textit\{(.*?)\}/g, '<em class="text-gray-400">$1</em>');
    
    // Sections - Industrial Style
    processedLatex = processedLatex.replace(/\\section\{(.*?)\}/g, (_, content) => addReplacement(`<h2 class="text-2xl font-bold font-oswald mt-12 mb-6 text-white uppercase border-b border-gray-700 pb-2"><span class="text-accent mr-2">##</span>${content}</h2>`));
    processedLatex = processedLatex.replace(/\\subsection\{(.*?)\}/g, (_, content) => addReplacement(`<h3 class="text-xl font-bold font-oswald mt-8 mb-4 text-gray-200 uppercase">${content}</h3>`));
  
    // Lists
    processedLatex = processedLatex.replace(/\\begin{itemize}((?:.|\n)*?)\\end{itemize}/g, (_, content) => {
        const items = content.trim().split('\\item').slice(1).map((item: string) => `<li class="pl-2 mb-2"><span class="text-accent mr-2">>></span>${item.trim()}</li>`).join('');
        return addReplacement(`<ul class="my-6 ml-4 space-y-2 text-gray-300 font-mono text-sm">${items}</ul>`);
    });
    processedLatex = processedLatex.replace(/\\begin{enumerate}((?:.|\n)*?)\\end{enumerate}/g, (_, content) => {
        const items = content.trim().split('\\item').slice(1).map((item: string, i: number) => `<li class="pl-2 mb-2"><span class="text-accent mr-2">${i+1}.</span>${item.trim()}</li>`).join('');
        return addReplacement(`<ol class="my-6 ml-4 space-y-2 text-gray-300 font-mono text-sm">${items}</ol>`);
    });

    // Paragraphs
    let finalHtml = processedLatex
      .split(/(__REPLACEMENT_\d+__|\n\s*\n)/)
      .map(p => p.trim())
      .filter(p => p.length > 0)
      .map(p => {
          if (p.startsWith('__REPLACEMENT_')) {
              return p;
          }
          return `<p class="mb-6 leading-7 text-gray-300 text-justify font-serif">${p.replace(/\\newline|\\\\/g, '<br/>')}</p>`
      })
      .join('');
  
    finalHtml = finalHtml.replace(/__REPLACEMENT_(\d+)__/g, (match) => replacements[match] || '');
    finalHtml = finalHtml.replace(/___MATH_SEQ_\d+___/g, (match) => mathReplacements[match] || match);
  
    return headerHtml + finalHtml;
  };
  

export const PreviewModal: React.FC<PreviewModalProps> = ({ isOpen, onClose, result }) => {
    const { latexCode = '', pdfBlob } = result;
    const [previewMode, setPreviewMode] = useState<'pdf' | 'html'>(pdfBlob ? 'pdf' : 'html');
    const closeRef = useRef<HTMLButtonElement>(null);

    // Update mode when pdfBlob becomes available
    useEffect(() => {
      if (pdfBlob) {
        setPreviewMode('pdf');
      }
    }, [pdfBlob]);

    const contentHtml = useMemo(() => DOMPurify.sanitize(latexToHtml(latexCode)), [latexCode]);
    const pdfUrl = useMemo(() => {
      if (pdfBlob) {
        return URL.createObjectURL(pdfBlob);
      }
      return null;
    }, [pdfBlob]);

    // Cleanup PDF URL
    useEffect(() => {
      return () => {
        if (pdfUrl) {
          URL.revokeObjectURL(pdfUrl);
        }
      };
    }, [pdfUrl]);

    useEffect(() => {
        if (isOpen && previewMode === 'html' && window.MathJax) {
          setTimeout(() => {
            if (window.MathJax.typesetPromise) {
                window.MathJax.typesetPromise();
            } else if (window.MathJax.Hub) {
                window.MathJax.Hub.Queue(["Typeset", window.MathJax.Hub]);
            }
          }, 100);
        }
      }, [isOpen, contentHtml, previewMode]);
    
    useEffect(() => {
        const handleEsc = (event: KeyboardEvent) => {
           if (event.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', handleEsc);
        return () => window.removeEventListener('keydown', handleEsc);
    }, [onClose]);

    // Focus trap: auto-focus close button on open
    useEffect(() => {
      if (isOpen) {
        closeRef.current?.focus();
      }
    }, [isOpen]);

    if (!isOpen) return null;

    return (
        <div 
          role="dialog"
          aria-modal="true"
          aria-label="Document Preview"
          className="fixed inset-0 bg-black/95 z-50 flex items-center justify-center p-0 sm:p-4 backdrop-blur-md"
          onClick={onClose}
        >
            <div 
              className="bg-[#0f0f0f] border border-gray-800 w-full max-w-6xl h-full sm:h-[95vh] flex flex-col shadow-2xl relative"
              onClick={(e) => e.stopPropagation()}
            >
                <header className="flex items-center justify-between px-6 py-4 bg-black border-b border-gray-800">
                    <div className="flex items-center gap-4">
                        <div className="w-3 h-3 bg-accent animate-pulse"></div>
                        <h2 className="font-oswald font-bold text-white uppercase tracking-widest text-lg">
                          {previewMode === 'pdf' ? 'PDF_PREVIEW' : 'DOCUMENT_PREVIEW'}
                        </h2>
                    </div>
                    <div className="flex items-center gap-4">
                        {/* Mode toggle if PDF is available */}
                        {pdfBlob && (
                          <div className="flex border border-gray-700">
                            <button
                              onClick={() => setPreviewMode('pdf')}
                              className={`px-3 py-1.5 text-[10px] font-mono uppercase tracking-wider transition-all ${
                                previewMode === 'pdf' ? 'bg-accent text-black' : 'text-text-muted hover:text-white'
                              }`}
                            >
                              PDF
                            </button>
                            <button
                              onClick={() => setPreviewMode('html')}
                              className={`px-3 py-1.5 text-[10px] font-mono uppercase tracking-wider transition-all border-l border-gray-700 ${
                                previewMode === 'html' ? 'bg-accent text-black' : 'text-text-muted hover:text-white'
                              }`}
                            >
                              HTML
                            </button>
                          </div>
                        )}
                        <button 
                            ref={closeRef}
                            onClick={onClose} 
                            aria-label="Close preview"
                            className="text-gray-500 hover:text-accent transition-colors"
                        >
                            <XIcon className="w-6 h-6" />
                        </button>
                    </div>
                </header>
                
                <div className="flex-1 overflow-hidden bg-[#0a0a0a] flex justify-center">
                    {previewMode === 'pdf' && pdfUrl ? (
                      <iframe
                        src={pdfUrl}
                        title="PDF Preview"
                        className="w-full h-full border-none"
                      />
                    ) : (
                      <div className="w-full h-full overflow-y-auto p-4 sm:p-10 flex justify-center custom-scrollbar">
                        {/* The "Paper" */}
                        <div className="w-full max-w-4xl bg-[#111] min-h-[80vh] border border-gray-800 p-12 sm:p-20 shadow-2xl text-gray-300">
                             <div 
                                className="prose prose-invert prose-lg max-w-none"
                                dangerouslySetInnerHTML={{ __html: contentHtml }} 
                             />
                        </div>
                      </div>
                    )}
                </div>
            </div>
        </div>
    );
};