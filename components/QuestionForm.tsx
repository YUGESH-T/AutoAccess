
import React, { useState, useRef, useEffect } from 'react';
import gsap from 'gsap';
import { SendIcon, UploadIcon, FileIcon, TrashIcon, ShieldIcon, AlertIcon } from './icons';
import { Spinner } from './Spinner';
import type { ContextFile, CoverPageConfig } from '../types';

const DEFAULT_COVER: CoverPageConfig = {
  enabled: false,
  studentName: '',
  rollNo: '24691A32W8',
  yearSection: 'II Year -- CSD--E',
  subject: 'CORE',
  subjectCode: '23CSD106',
  subjectName: 'DATA ENGINEERING',
  assignmentNo: 'I',
  questions: ['', '', ''],
};

interface QuestionFormProps {
  onSubmit: (question: string, file: ContextFile | undefined, removePlagiarism: boolean, coverPage: CoverPageConfig, temperature: number) => void;
  onCancel?: () => void;
  isLoading: boolean;
  loadingMessage: string;
}

export const QuestionForm: React.FC<QuestionFormProps> = ({ onSubmit, onCancel, isLoading, loadingMessage }) => {
  const [question, setQuestion] = useState('');
  const [selectedFile, setSelectedFile] = useState<ContextFile | null>(null);
  const [removePlagiarism, setRemovePlagiarism] = useState(false);
  const [coverPage, setCoverPage] = useState<CoverPageConfig>({ ...DEFAULT_COVER });
  const [temperature, setTemperature] = useState(0.5);
  const [fileError, setFileError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const actionsRef = useRef<HTMLDivElement>(null);
  const coverPanelRef = useRef<HTMLDivElement>(null);
  const submitBtnRef = useRef<HTMLButtonElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Stagger-reveal action buttons on mount with scale
  useEffect(() => {
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReduced || !actionsRef.current) return;
    const buttons = actionsRef.current.querySelectorAll('.action-item');
    gsap.fromTo(buttons,
      { opacity: 0, y: 10, scale: 0.9 },
      { opacity: 1, y: 0, scale: 1, duration: 0.4, stagger: 0.06, ease: 'back.out(1.5)', delay: 0.3 }
    );
  }, []);

  // Animate cover page panel expand + stagger children
  useEffect(() => {
    if (coverPage.enabled && coverPanelRef.current) {
      const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (prefersReduced) return;
      const panel = coverPanelRef.current;
      // Set children invisible before panel opens
      const fields = panel.querySelectorAll('.cover-field');
      gsap.set(fields, { opacity: 0, y: 8 });

      gsap.fromTo(panel,
        { opacity: 0, height: 0, overflow: 'hidden' },
        { opacity: 1, height: 'auto', duration: 0.4, ease: 'power3.out', clearProps: 'overflow',
          onComplete: () => {
            gsap.to(fields, { opacity: 1, y: 0, duration: 0.3, stagger: 0.03, ease: 'power2.out' });
            panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          }
        }
      );
    }
  }, [coverPage.enabled]);

  // Textarea focus glow animation
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReduced) return;

    const onFocus = () => {
      gsap.to(ta.parentElement, {
        boxShadow: '0 0 0 3px rgba(16,185,129,0.08), 0 0 30px rgba(16,185,129,0.06)',
        borderColor: 'rgba(16,185,129,0.4)',
        duration: 0.3,
        ease: 'power2.out'
      });
    };
    const onBlur = () => {
      gsap.to(ta.parentElement, {
        boxShadow: 'none',
        borderColor: 'rgb(63,63,70)',
        duration: 0.3,
        ease: 'power2.out'
      });
    };

    ta.addEventListener('focus', onFocus);
    ta.addEventListener('blur', onBlur);
    return () => {
      ta.removeEventListener('focus', onFocus);
      ta.removeEventListener('blur', onBlur);
    };
  }, []);

  // Textarea auto-resize with GSAP smooth height transition
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const autoResize = () => {
      // Reset to auto to measure scrollHeight
      ta.style.height = 'auto';
      const newHeight = Math.max(ta.scrollHeight, 120); // minimum 5 rows (~120px)
      if (prefersReduced) {
        ta.style.height = `${newHeight}px`;
      } else {
        gsap.to(ta, { height: newHeight, duration: 0.2, ease: 'power2.out' });
      }
    };

    ta.addEventListener('input', autoResize);
    // Initial resize in case there's pre-filled text
    autoResize();
    return () => ta.removeEventListener('input', autoResize);
  }, []);

  const updateCoverField = (field: keyof CoverPageConfig, value: string) => {
    setCoverPage(prev => ({ ...prev, [field]: value }));
  };

  const updateQuestion = (index: number, value: string) => {
    setCoverPage(prev => {
      const questions = [...prev.questions];
      questions[index] = value;
      return { ...prev, questions };
    });
  };

  const addQuestion = () => {
    setCoverPage(prev => ({ ...prev, questions: [...prev.questions, ''] }));
  };

  const removeQuestion = (index: number) => {
    setCoverPage(prev => {
      if (prev.questions.length <= 1) return prev;
      return { ...prev, questions: prev.questions.filter((_, i) => i !== index) };
    });
  };

  // Ripple effect on submit button
  const createRipple = (e: React.MouseEvent) => {
    const btn = submitBtnRef.current;
    if (!btn) return;
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReduced) return;

    const rect = btn.getBoundingClientRect();
    const ripple = document.createElement('span');
    ripple.className = 'ripple';
    const size = Math.max(rect.width, rect.height) * 2;
    ripple.style.width = ripple.style.height = `${size}px`;
    ripple.style.left = `${e.clientX - rect.left - size / 2}px`;
    ripple.style.top = `${e.clientY - rect.top - size / 2}px`;
    btn.appendChild(ripple);

    gsap.fromTo(ripple,
      { scale: 0, opacity: 0.5 },
      { scale: 1, opacity: 0, duration: 0.6, ease: 'power2.out', onComplete: () => ripple.remove() }
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(question, selectedFile || undefined, removePlagiarism, coverPage, temperature);
  };
  
  const sampleQuestion = "Explain the process of photosynthesis, including the light-dependent and light-independent reactions. Also, describe the structure of a chloroplast.";
  
  const handleSampleQuestion = () => {
    setQuestion(sampleQuestion);
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
        const file = e.target.files[0];
        setFileError(null);
        if (file.size > 4 * 1024 * 1024) {
            setFileError("File size exceeds 4 MB limit.");
            return;
        }

        const reader = new FileReader();
        reader.onerror = () => {
            setFileError("Failed to read file.");
        };
        reader.onloadend = () => {
            const result = reader.result as string;
            const base64 = result.split(',')[1];
            setSelectedFile({
                name: file.name,
                mimeType: file.type,
                base64: base64
            });
        };
        reader.readAsDataURL(file);
    }
  };

  const handleRemoveFile = () => {
      setSelectedFile(null);
      if (fileInputRef.current) {
          fileInputRef.current.value = '';
      }
  };

  const handleUploadClick = () => {
      fileInputRef.current?.click();
  };

  const isArcMode = question.toLowerCase().includes('arc club');

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="space-y-5">
      <div className="space-y-2">
        <label htmlFor="question" className="block text-sm font-medium text-txt-secondary">
          Your assignment question
        </label>
        <div className="relative group input-focus rounded-xl transition-all">
            <textarea
            id="question"
            name="question"
            ref={textareaRef}
            aria-label="Assignment question"
            rows={5}
            className={`block w-full px-4 py-3.5 bg-bg text-txt-primary placeholder:text-txt-muted focus:outline-none transition-all duration-200 text-sm resize-none rounded-xl border ${
                isArcMode 
                ? 'border-accent/40 shadow-sm' 
                : 'border-border focus:border-accent/40'
            }`}
            placeholder="Enter your assignment question here..."
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            disabled={isLoading}
            />
        </div>

        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 pt-2">
            <div ref={actionsRef} className="flex flex-wrap items-center gap-2">
                {/* Context File Upload */}
                <div className="relative action-item">
                    <input 
                        type="file" 
                        ref={fileInputRef} 
                        onChange={handleFileChange} 
                        accept=".pdf,.txt" 
                        className="hidden" 
                    />
                    
                    {!selectedFile ? (
                        <button
                            type="button"
                            onClick={handleUploadClick}
                            disabled={isLoading}
                            className="btn-secondary inline-flex items-center text-xs gap-1.5"
                        >
                            <UploadIcon className="w-3.5 h-3.5" />
                            Upload context
                        </button>
                    ) : (
                        <div className="inline-flex items-center px-3 py-1.5 text-xs font-medium bg-accent/5 text-accent border border-accent/20 rounded-lg animate-fade-in gap-2">
                            <FileIcon className="w-3.5 h-3.5" />
                            <span className="max-w-[120px] truncate">{selectedFile.name}</span>
                            <button 
                                type="button" 
                                onClick={handleRemoveFile}
                                className="ml-1 hover:text-error transition-colors"
                                title="Remove file"
                            >
                                <TrashIcon className="w-3 h-3" />
                            </button>
                        </div>
                    )}
                </div>

                {/* Anti-Plagiarism Toggle */}
                <button 
                    type="button"
                    aria-pressed={removePlagiarism}
                    onClick={() => setRemovePlagiarism(!removePlagiarism)}
                    className={`action-item cursor-pointer inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-all select-none ${
                        removePlagiarism 
                        ? 'border-accent/30 text-accent bg-accent/5' 
                        : 'border-border text-txt-secondary hover:border-border-bright hover:text-txt-primary'
                    }`}
                >
                    <ShieldIcon className={`w-3.5 h-3.5 ${removePlagiarism ? 'text-accent' : ''}`} />
                    <span>{removePlagiarism ? 'Anti-plagiarism on' : 'Anti-plagiarism'}</span>
                </button>

                {/* Cover Page Toggle */}
                <button 
                    type="button"
                    aria-pressed={coverPage.enabled}
                    onClick={() => setCoverPage(prev => ({ ...prev, enabled: !prev.enabled }))}
                    className={`action-item cursor-pointer inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-all select-none ${
                        coverPage.enabled 
                        ? 'border-accent/30 text-accent bg-accent/5' 
                        : 'border-border text-txt-secondary hover:border-border-bright hover:text-txt-primary'
                    }`}
                >
                    <FileIcon className={`w-3.5 h-3.5 ${coverPage.enabled ? 'text-accent' : ''}`} />
                    <span>{coverPage.enabled ? 'Cover page on' : 'Cover page'}</span>
                </button>

                {/* Temperature Selector */}
                <div className="action-item inline-flex items-center rounded-lg border border-border overflow-hidden">
                  {([['Precise', 0.2], ['Balanced', 0.5], ['Creative', 0.8]] as [string, number][]).map(([label, val]) => (
                    <button
                      key={label}
                      type="button"
                      onClick={() => setTemperature(val)}
                      className={`px-2.5 py-1.5 text-[11px] font-medium transition-all select-none ${
                        temperature === val
                          ? 'bg-accent/10 text-accent'
                          : 'text-txt-secondary hover:text-txt-primary hover:bg-bg-secondary/50'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
            </div>

            <button 
                type="button" 
                onClick={handleSampleQuestion} 
                disabled={isLoading}
                className="action-item text-xs text-txt-muted hover:text-accent underline decoration-1 underline-offset-4 decoration-txt-muted/30 hover:decoration-accent/40 transition-all cursor-pointer whitespace-nowrap"
            >
                Load sample question
            </button>
        </div>
      </div>

      {/* Inline file error banner */}
      {fileError && (
        <div className="flex items-center gap-3 p-3 rounded-lg border border-error/20 bg-error/5 text-error animate-fade-in">
          <AlertIcon className="w-3.5 h-3.5 shrink-0" />
          <span className="text-xs font-medium">{fileError}</span>
          <button type="button" onClick={() => setFileError(null)} className="ml-auto text-xs hover:text-txt-primary transition-colors">✕</button>
        </div>
      )}

      {/* Cover Page Config Panel */}
      {coverPage.enabled && (
        <div ref={coverPanelRef} className="rounded-xl border border-accent/15 bg-accent/[0.02] p-5 space-y-4">
          <div className="flex items-center gap-2.5 mb-1">
            <div className="w-0.5 h-4 bg-accent rounded-full"></div>
            <h3 className="text-sm font-medium text-txt-primary">MITS cover page</h3>
          </div>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {([
              ['studentName', 'Student name'],
              ['rollNo', 'Roll number'],
              ['yearSection', 'Year / Section'],
              ['subject', 'Subject type'],
              ['subjectCode', 'Subject code'],
              ['subjectName', 'Subject name'],
              ['assignmentNo', 'Assignment no.'],
            ] as [keyof CoverPageConfig, string][]).map(([field, label]) => (
              <div key={field} className="space-y-1 cover-field">
                <label className="block text-[11px] font-medium text-txt-muted">{label}</label>
                <input
                  type="text"
                  value={coverPage[field] as string}
                  onChange={(e) => updateCoverField(field, e.target.value)}
                  className="w-full px-3 py-2 bg-bg text-txt-primary text-xs font-mono border border-border rounded-lg focus:border-accent/40 focus:outline-none transition-colors"
                />
              </div>
            ))}
          </div>

          {/* Dynamic Question Rows */}
          <div className="space-y-2.5 pt-1 cover-field">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-medium text-txt-muted">Question labels (cover page)</label>
              <button
                type="button"
                onClick={addQuestion}
                className="inline-flex items-center px-2.5 py-1 text-[11px] font-medium rounded-md border border-border text-txt-secondary hover:border-accent/30 hover:text-accent transition-colors"
              >
                + Add row
              </button>
            </div>
            {coverPage.questions.map((q, i) => (
              <div key={i} className="flex items-center gap-2 cover-field">
                <span className="text-[11px] font-mono text-txt-muted w-7 shrink-0">Q{i + 1}</span>
                <input
                  type="text"
                  value={q}
                  onChange={(e) => updateQuestion(i, e.target.value)}
                  placeholder="Optional label..."
                  className="flex-1 px-3 py-2 bg-bg text-txt-primary text-xs font-mono border border-border rounded-lg focus:border-accent/40 focus:outline-none transition-colors placeholder:text-txt-muted"
                />
                {coverPage.questions.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeQuestion(i)}
                    className="p-1.5 text-txt-muted hover:text-error transition-colors rounded-md hover:bg-error/5"
                    title="Remove"
                  >
                    <TrashIcon className="w-3 h-3" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="pt-1 flex gap-3">
        {isLoading && onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="flex items-center justify-center px-5 py-3.5 text-sm font-medium rounded-xl focus:outline-none transition-all duration-200 border border-error/30 text-error hover:bg-error/5 hover:border-error/50"
          >
            Cancel
          </button>
        )}
        <button
          ref={submitBtnRef}
          type="submit"
          disabled={isLoading || !question.trim()}
          onClick={createRipple}
          className="w-full flex items-center justify-center px-8 py-3.5 text-sm btn-primary !rounded-xl group relative overflow-hidden ripple-container"
        >
          {isLoading ? (
             <div className="flex items-center space-x-2.5">
                 <Spinner className="w-4 h-4 text-white" />
                 <span className="typing-cursor">
                    {loadingMessage || 'Processing...'}
                 </span>
            </div>
          ) : (
            <span className="relative z-10 flex items-center gap-2">
                <SendIcon className="w-4 h-4" />
                Generate answer
            </span>
          )}
        </button>
      </div>
    </form>
  );
};
