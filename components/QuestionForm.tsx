import React, { useState, useRef, useEffect, useCallback } from 'react';
import gsap from 'gsap';
import { SendIcon, UploadIcon, FileIcon, TrashIcon, ShieldIcon, AlertIcon } from './icons';
import { Spinner } from './Spinner';
import type { ContextFile, CoverPageConfig } from '../types';
import { MAX_FILE_SIZE_BYTES } from '../lib/constants';

const DEFAULT_COVER: CoverPageConfig = {
  enabled: false,
  studentName: 'Yugesh T',
  rollNo: '24691A32W8',
  yearSection: 'II Year -- CSD--E',
  subjectType: 'CORE',
  subjectCode: '23CSD603',
  subjectName: 'DEVOPS',
  assignmentNo: 'I',
  questions: ['', '', ''],
};

type PromptPresetId = 'structured' | 'derivation' | 'report' | 'shortAnswer';

interface PromptPreset {
  id: PromptPresetId;
  label: string;
  helper: string;
  placeholder: string;
  sample: string;
}

const PROMPT_PRESETS: PromptPreset[] = [
  {
    id: 'structured',
    label: 'Structured answer',
    helper: 'Best for theory questions, explainers, and organized notes.',
    placeholder: "Describe the topic, the scope, and the structure you want. Example: 'Explain photosynthesis with headings, key equations, and a short conclusion.'",
    sample: 'Explain the process of photosynthesis, including the light-dependent and light-independent reactions. Also, describe the structure of a chloroplast.',
  },
  {
    id: 'derivation',
    label: 'Step-by-step derivation',
    helper: 'Best for math, physics, and algorithm walkthroughs.',
    placeholder: "Describe the problem, the final result you need, and ask for worked steps. Example: 'Derive Maxwell equations from the integral form and explain each transformation clearly.'",
    sample: 'Derive the wave equation from Maxwell equations step by step. Include assumptions, intermediate equations, and a short physical interpretation.',
  },
  {
    id: 'report',
    label: 'Lab / report format',
    helper: 'Best for sections like aim, procedure, observations, and conclusion.',
    placeholder: "Mention the experiment or topic and list the sections you need. Example: 'Write a lab record for Ohm's law with aim, apparatus, procedure, observation table, result, and precautions.'",
    sample: "Write a lab report for verifying Ohm's law with aim, apparatus required, circuit description, procedure, observations, calculations, result, and precautions.",
  },
  {
    id: 'shortAnswer',
    label: 'Short answers',
    helper: 'Best for assignment sets, exam-style answers, and concise notes.',
    placeholder: "List the questions or the topic scope and mention that you want concise answers. Example: 'Answer these 5 database questions in 4-6 lines each with definitions and examples where useful.'",
    sample: 'Answer the following operating systems questions in 5-6 lines each: process, thread, scheduling, deadlock, and semaphore.',
  },
];

const ACCEPTED_FILE_TYPES = '.pdf, .txt';

interface QuestionFormProps {
  onSubmit: (question: string, file: ContextFile | undefined, removePlagiarism: boolean, coverPage: CoverPageConfig, temperature: number) => void;
  onCancel?: () => void;
  isLoading: boolean;
  loadingMessage: string;
}

const formatFileSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

export const QuestionForm: React.FC<QuestionFormProps> = ({ onSubmit, onCancel, isLoading, loadingMessage }) => {
  const [question, setQuestion] = useState('');
  const [selectedFile, setSelectedFile] = useState<ContextFile | null>(null);
  const [removePlagiarism, setRemovePlagiarism] = useState(false);
  const [coverPage, setCoverPage] = useState<CoverPageConfig>({ ...DEFAULT_COVER });
  const [temperature, setTemperature] = useState(0.5);
  const [fileError, setFileError] = useState<string | null>(null);
  const [selectedPreset, setSelectedPreset] = useState<PromptPresetId>('structured');
  const [selectedFileSize, setSelectedFileSize] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const actionsRef = useRef<HTMLDivElement>(null);
  const coverPanelRef = useRef<HTMLDivElement>(null);
  const submitBtnRef = useRef<HTMLButtonElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [submitTransform, setSubmitTransform] = useState({ x: 0, y: 0 });

  const activePreset = PROMPT_PRESETS.find((preset) => preset.id === selectedPreset) ?? PROMPT_PRESETS[0];
  const questionLength = question.trim().length;
  const guidanceChecks = [
    {
      label: 'Topic or concept',
      complete: /[a-zA-Z]{4,}/.test(question),
    },
    {
      label: 'Expected structure',
      complete: /(steps?|headings?|sections?|table|conclusion|summary|report|format)/i.test(question),
    },
    {
      label: 'Useful constraints',
      complete: /(include|avoid|concise|detailed|example|equation|diagram|bullet|lines?|marks?)/i.test(question),
    },
  ];
  const completedChecks = guidanceChecks.filter((check) => check.complete).length;
  const promptQuality = questionLength === 0
    ? {
      tone: 'text-txt-muted border-border bg-bg-secondary/40',
      label: 'Start with a clear task',
      description: 'Mention the topic, the answer style you want, and any constraints that matter.',
    }
    : completedChecks >= 3 && questionLength >= 80
      ? {
        tone: 'text-accent border-accent/20 bg-accent/[0.04]',
        label: 'Strong prompt',
        description: 'This has enough structure for the model to produce a cleaner first draft.',
      }
      : completedChecks >= 2 || questionLength >= 50
        ? {
          tone: 'text-amber-300 border-amber-400/20 bg-amber-400/[0.05]',
          label: 'Good start',
          description: 'Add one more detail about sections, examples, or output format for better results.',
        }
        : {
          tone: 'text-txt-secondary border-border bg-bg-secondary/40',
          label: 'Needs more detail',
          description: 'Short prompts work, but a little more context will reduce repairs and improve structure.',
        };
  const handleSubmitMouseMove = useCallback((e: React.MouseEvent) => {
    const btn = submitBtnRef.current;
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = e.clientX - cx;
    const dy = e.clientY - cy;
    const maxMove = 15;
    setSubmitTransform({
      x: Math.max(-maxMove, Math.min(maxMove, dx * 0.3)),
      y: Math.max(-maxMove, Math.min(maxMove, dy * 0.3)),
    });
  }, []);

  const handleSubmitMouseLeave = useCallback(() => {
    setSubmitTransform({ x: 0, y: 0 });
  }, []);

  useEffect(() => {
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReduced || !actionsRef.current) return;
    const buttons = actionsRef.current.querySelectorAll('.action-item');
    gsap.fromTo(
      buttons,
      { opacity: 0, y: 14, scale: 0.85, filter: 'blur(3px)' },
      { opacity: 1, y: 0, scale: 1, filter: 'blur(0px)', duration: 0.5, stagger: 0.08, ease: 'power4.out', delay: 0.3 },
    );
  }, []);

  useEffect(() => {
    if (coverPage.enabled && coverPanelRef.current) {
      const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (prefersReduced) return;
      const panel = coverPanelRef.current;
      const fields = panel.querySelectorAll('.cover-field');
      gsap.set(fields, { opacity: 0, y: 10, filter: 'blur(3px)' });

      gsap.fromTo(
        panel,
        { opacity: 0, height: 0, overflow: 'hidden' },
        {
          opacity: 1,
          height: 'auto',
          duration: 0.45,
          ease: 'power3.out',
          clearProps: 'overflow',
          onComplete: () => {
            gsap.to(fields, { opacity: 1, y: 0, filter: 'blur(0px)', duration: 0.35, stagger: 0.04, ease: 'back.out(1.7)' });
            panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          },
        },
      );
    }
  }, [coverPage.enabled]);

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
        ease: 'power2.out',
      });
    };
    const onBlur = () => {
      gsap.to(ta.parentElement, {
        boxShadow: 'none',
        borderColor: 'rgb(63,63,70)',
        duration: 0.3,
        ease: 'power2.out',
      });
    };

    ta.addEventListener('focus', onFocus);
    ta.addEventListener('blur', onBlur);
    return () => {
      ta.removeEventListener('focus', onFocus);
      ta.removeEventListener('blur', onBlur);
    };
  }, []);

  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const autoResize = () => {
      ta.style.height = 'auto';
      const newHeight = Math.max(ta.scrollHeight, 120);
      if (prefersReduced) {
        ta.style.height = `${newHeight}px`;
      } else {
        gsap.to(ta, { height: newHeight, duration: 0.2, ease: 'power2.out' });
      }
    };

    ta.addEventListener('input', autoResize);
    autoResize();
    return () => ta.removeEventListener('input', autoResize);
  }, []);

  const updateCoverField = (field: keyof CoverPageConfig, value: string) => {
    setCoverPage((prev) => ({ ...prev, [field]: value }));
  };

  const updateQuestion = (index: number, value: string) => {
    setCoverPage((prev) => {
      const questions = [...prev.questions];
      questions[index] = value;
      return { ...prev, questions };
    });
  };

  const addQuestion = () => {
    setCoverPage((prev) => ({ ...prev, questions: [...prev.questions, ''] }));
  };

  const removeQuestion = (index: number) => {
    setCoverPage((prev) => {
      if (prev.questions.length <= 1) return prev;
      return { ...prev, questions: prev.questions.filter((_, i) => i !== index) };
    });
  };

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

    gsap.fromTo(
      ripple,
      { scale: 0, opacity: 0.5 },
      { scale: 1, opacity: 0, duration: 0.6, ease: 'power2.out', onComplete: () => ripple.remove() },
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(question, selectedFile || undefined, removePlagiarism, coverPage, temperature);
  };

  const handleSampleQuestion = () => {
    setQuestion(activePreset.sample);
  };

  const handlePresetSelect = (presetId: PromptPresetId) => {
    setSelectedPreset(presetId);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setFileError(null);
      if (file.size > MAX_FILE_SIZE_BYTES) {
        setFileError(`File size exceeds the ${Math.floor(MAX_FILE_SIZE_BYTES / (1024 * 1024))} MB limit.`);
        setSelectedFileSize(null);
        return;
      }

      const reader = new FileReader();
      reader.onerror = () => {
        setFileError('Failed to read file.');
        setSelectedFileSize(null);
      };
      reader.onloadend = () => {
        const result = reader.result as string;
        const base64 = result.split(',')[1];
        setSelectedFileSize(file.size);
        setSelectedFile({
          name: file.name,
          mimeType: file.type,
          base64,
        });
      };
      reader.readAsDataURL(file);
    }
  };

  const handleRemoveFile = () => {
    setSelectedFile(null);
    setSelectedFileSize(null);
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

        <div className="space-y-3 rounded-2xl border border-border bg-bg-secondary/20 p-3 sm:p-4">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="text-sm font-medium text-txt-primary">Start with the kind of answer you want</div>
              <div className="text-xs text-txt-muted">These presets guide the prompt shape, not the final content.</div>
            </div>
            <button
              type="button"
              onClick={handleSampleQuestion}
              disabled={isLoading}
              className="action-item text-xs text-txt-muted hover:text-accent underline decoration-1 underline-offset-4 decoration-txt-muted/30 hover:decoration-accent/40 transition-all cursor-pointer whitespace-nowrap self-start sm:self-auto"
            >
              Load example for this mode
            </button>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {PROMPT_PRESETS.map((preset) => {
              const isActive = preset.id === selectedPreset;
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => handlePresetSelect(preset.id)}
                  disabled={isLoading}
                  className={`text-left rounded-xl border p-3 transition-all duration-150 ${isActive
                    ? 'border-accent/30 bg-accent/[0.05] shadow-sm'
                    : 'border-border bg-bg/70 hover:border-border-bright hover:bg-bg-secondary/50'
                    }`}
                >
                  <div className={`text-sm font-medium ${isActive ? 'text-accent' : 'text-txt-primary'}`}>{preset.label}</div>
                  <div className="mt-1 text-xs leading-relaxed text-txt-muted">{preset.helper}</div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="relative group input-focus rounded-xl transition-all">
          <textarea
            id="question"
            name="question"
            ref={textareaRef}
            aria-label="Assignment question"
            rows={5}
            className={`block w-full px-4 py-3.5 bg-bg text-txt-primary placeholder:text-txt-muted focus:outline-none transition-all duration-200 text-sm resize-none rounded-xl border ${isArcMode
              ? 'border-accent/40 shadow-sm'
              : 'border-border focus:border-accent/40'
              }`}
            placeholder={activePreset.placeholder}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            disabled={isLoading}
          />
        </div>

        <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_260px]">
          <div className={`rounded-xl border px-3.5 py-3 ${promptQuality.tone}`}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-medium">{promptQuality.label}</div>
                <div className="mt-1 text-xs leading-relaxed opacity-90">{promptQuality.description}</div>
              </div>
              <div className="shrink-0 text-[11px] font-medium opacity-75">{questionLength} chars</div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {guidanceChecks.map((check) => (
                <span
                  key={check.label}
                  className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-medium ${check.complete
                    ? 'bg-accent/10 text-accent'
                    : 'bg-bg/70 text-txt-muted'
                    }`}
                >
                  {check.complete ? 'Included' : 'Add'} {check.label}
                </span>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-border bg-bg-secondary/20 px-3.5 py-3">
            <div className="text-sm font-medium text-txt-primary">Upload guidance</div>
            <div className="mt-1 text-xs leading-relaxed text-txt-muted">
              Add a supporting PDF or TXT file when the answer should follow a class handout, notes, or source document.
            </div>
            <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-txt-secondary">
              <span className="rounded-full bg-bg/80 px-2.5 py-1">Accepted: {ACCEPTED_FILE_TYPES}</span>
              <span className="rounded-full bg-bg/80 px-2.5 py-1">Limit: {Math.floor(MAX_FILE_SIZE_BYTES / (1024 * 1024))} MB</span>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-3 pt-2">
          <div ref={actionsRef} className="flex flex-wrap items-center gap-2">
            <div className="relative action-item">
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                accept={ACCEPTED_FILE_TYPES}
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
                  <div className="flex min-w-0 flex-col">
                    <span className="max-w-[160px] truncate">{selectedFile.name}</span>
                    <span className="text-[10px] text-accent/75">
                      {selectedFileSize ? formatFileSize(selectedFileSize) : 'Context file ready'}
                    </span>
                  </div>
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

            <button
              type="button"
              aria-pressed={removePlagiarism}
              onClick={() => setRemovePlagiarism(!removePlagiarism)}
              className={`action-item cursor-pointer inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-all select-none ${removePlagiarism
                ? 'border-accent/30 text-accent bg-accent/5'
                : 'border-border text-txt-secondary hover:border-border-bright hover:text-txt-primary'
                }`}
            >
              <ShieldIcon className={`w-3.5 h-3.5 ${removePlagiarism ? 'text-accent' : ''}`} />
              <span>{removePlagiarism ? 'Anti-plagiarism on' : 'Anti-plagiarism'}</span>
            </button>

            <button
              type="button"
              aria-pressed={coverPage.enabled}
              onClick={() => setCoverPage((prev) => ({ ...prev, enabled: !prev.enabled }))}
              className={`action-item cursor-pointer inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-all select-none ${coverPage.enabled
                ? 'border-accent/30 text-accent bg-accent/5'
                : 'border-border text-txt-secondary hover:border-border-bright hover:text-txt-primary'
                }`}
            >
              <FileIcon className={`w-3.5 h-3.5 ${coverPage.enabled ? 'text-accent' : ''}`} />
              <span>{coverPage.enabled ? 'Cover page on' : 'Cover page'}</span>
            </button>

            <div className="action-item inline-flex items-center rounded-lg border border-border overflow-hidden">
              {([['Precise', 0.2], ['Balanced', 0.5], ['Creative', 0.8]] as [string, number][]).map(([label, val]) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => setTemperature(val)}
                  className={`px-2.5 py-1.5 text-[11px] font-medium transition-all select-none ${temperature === val
                    ? 'bg-accent/10 text-accent'
                    : 'text-txt-secondary hover:text-txt-primary hover:bg-bg-secondary/50'
                    }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

        </div>
      </div>

      {fileError && (
        <div className="flex items-center gap-3 p-3 rounded-lg border border-error/20 bg-error/5 text-error animate-fade-in">
          <AlertIcon className="w-3.5 h-3.5 shrink-0" />
          <span className="text-xs font-medium">{fileError}</span>
          <button type="button" onClick={() => setFileError(null)} className="ml-auto text-xs hover:text-txt-primary transition-colors">x</button>
        </div>
      )}

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
              ['subjectType', 'Subject type'],
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
          onMouseMove={handleSubmitMouseMove}
          onMouseLeave={handleSubmitMouseLeave}
          className="w-full flex items-center justify-center px-8 py-3.5 text-sm btn-primary !rounded-xl group relative overflow-hidden ripple-container btn-magnetic"
          style={{
            transform: `translate(${submitTransform.x}px, ${submitTransform.y}px)`,
            transition: 'transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)',
          }}
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
              {question.trim() ? `Generate ${activePreset.label.toLowerCase()}` : 'Generate answer'}
            </span>
          )}
        </button>
      </div>
    </form>
  );
};
