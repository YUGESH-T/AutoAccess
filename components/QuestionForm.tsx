
import React, { useState, useRef } from 'react';
import { SparklesIcon, UploadIcon, FileIcon, TrashIcon, ShieldIcon, ZapIcon } from './icons';
import type { ContextFile, CoverPageConfig } from '../types';

const DEFAULT_COVER: CoverPageConfig = {
  enabled: false,
  studentName: 'Yugesh Thimmampalli',
  rollNo: '24691A32W8',
  yearSection: 'II Year -- CSD--E',
  subject: 'CORE',
  subjectCode: '23CSD106',
  subjectName: 'DATA ENGINEERING',
  assignmentNo: 'I',
  questions: ['', '', ''],
};

interface QuestionFormProps {
  onSubmit: (question: string, file: ContextFile | undefined, removePlagiarism: boolean, coverPage: CoverPageConfig) => void;
  isLoading: boolean;
  loadingMessage: string;
}

export const QuestionForm: React.FC<QuestionFormProps> = ({ onSubmit, isLoading, loadingMessage }) => {
  const [question, setQuestion] = useState('');
  const [selectedFile, setSelectedFile] = useState<ContextFile | null>(null);
  const [removePlagiarism, setRemovePlagiarism] = useState(false);
  const [coverPage, setCoverPage] = useState<CoverPageConfig>({ ...DEFAULT_COVER });
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(question, selectedFile || undefined, removePlagiarism, coverPage);
  };
  
  const sampleQuestion = "Explain the process of photosynthesis, including the light-dependent and light-independent reactions. Also, describe the structure of a chloroplast.";
  
  const handleSampleQuestion = () => {
    setQuestion(sampleQuestion);
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
        const file = e.target.files[0];
        if (file.size > 10 * 1024 * 1024) {
            alert("ERR: FILE_SIZE_LIMIT_EXCEEDED (10MB)");
            return;
        }

        const reader = new FileReader();
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

  const isYugeshMode = question.toLowerCase().includes('yugesh');

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      <div className="space-y-2">
        <label htmlFor="question" className="block text-xs font-oswald font-bold text-accent uppercase tracking-widest mb-2">
          /// INPUT_VECTOR
        </label>
        <div className="relative group">
            <textarea
            id="question"
            name="question"
            rows={5}
            className={`block w-full px-6 py-5 bg-[#0a0a0a] text-text-main placeholder:text-gray-700 focus:outline-none transition-all duration-100 ease-linear text-sm font-mono resize-y border ${
                isYugeshMode 
                ? 'border-yellow-500 shadow-[0_0_20px_rgba(234,179,8,0.2)]' 
                : 'border-border focus:border-accent'
            }`}
            placeholder="ENTER_ASSIGNMENT_PARAMETERS..."
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            disabled={isLoading}
            />
            {/* Corner Accent */}
            <div className={`absolute bottom-0 right-0 w-0 h-0 border-b-[10px] border-r-[10px] transition-colors ${isYugeshMode ? 'border-yellow-500' : 'border-accent'}`}></div>
        </div>

        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pt-4">
            <div className="flex flex-wrap items-center gap-4">
                {/* Context File Upload */}
                <div className="relative">
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
                            className="inline-flex items-center px-4 py-2 text-xs font-mono uppercase bg-transparent text-text-muted border border-border hover:border-accent hover:text-accent transition-colors group"
                        >
                            <UploadIcon className="w-3 h-3 mr-2 group-hover:text-accent transition-colors" />
                            UPLOAD_CONTEXT [PDF/TXT]
                        </button>
                    ) : (
                        <div className="inline-flex items-center px-4 py-2 text-xs font-mono bg-accent/10 text-accent border border-accent/50 animate-fade-in">
                            <FileIcon className="w-3 h-3 mr-2" />
                            <span className="max-w-[150px] truncate uppercase">{selectedFile.name}</span>
                            <button 
                                type="button" 
                                onClick={handleRemoveFile}
                                className="ml-3 hover:text-white transition-colors"
                                title="REMOVE"
                            >
                                <TrashIcon className="w-3 h-3" />
                            </button>
                        </div>
                    )}
                </div>

                {/* Plagiarism Removal Toggle */}
                <div 
                    onClick={() => setRemovePlagiarism(!removePlagiarism)}
                    className={`cursor-pointer inline-flex items-center gap-3 px-4 py-2 text-xs font-mono uppercase border transition-all select-none ${
                        removePlagiarism 
                        ? 'border-green-500 text-green-500 bg-green-500/5' 
                        : 'border-border text-text-muted hover:border-text-muted'
                    }`}
                >
                    <ShieldIcon className={`w-3 h-3 ${removePlagiarism ? 'text-green-500' : 'text-text-muted'}`} />
                    <span>{removePlagiarism ? 'ANTI-PLAG: ON' : 'ANTI-PLAG: OFF'}</span>
                </div>

                {/* Cover Page Toggle */}
                <div 
                    onClick={() => setCoverPage(prev => ({ ...prev, enabled: !prev.enabled }))}
                    className={`cursor-pointer inline-flex items-center gap-3 px-4 py-2 text-xs font-mono uppercase border transition-all select-none ${
                        coverPage.enabled 
                        ? 'border-cyan-500 text-cyan-500 bg-cyan-500/5' 
                        : 'border-border text-text-muted hover:border-text-muted'
                    }`}
                >
                    <FileIcon className={`w-3 h-3 ${coverPage.enabled ? 'text-cyan-500' : 'text-text-muted'}`} />
                    <span>{coverPage.enabled ? 'COVER_PAGE: ON' : 'COVER_PAGE: OFF'}</span>
                </div>
            </div>

            <button 
                type="button" 
                onClick={handleSampleQuestion} 
                disabled={isLoading}
                className="text-xs font-mono text-text-muted hover:text-accent underline decoration-1 underline-offset-4 decoration-accent/50 hover:decoration-accent transition-all cursor-pointer whitespace-nowrap uppercase"
            >
                LOAD_SAMPLE_DATA
            </button>
        </div>
      </div>

      {/* Cover Page Config Panel */}
      {coverPage.enabled && (
        <div className="border border-cyan-500/30 bg-cyan-500/5 p-6 space-y-5 animate-fade-in">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-1 h-6 bg-cyan-500"></div>
            <h3 className="text-sm font-oswald font-bold text-cyan-500 uppercase tracking-wider">MITS COVER PAGE CONFIG</h3>
          </div>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {([
              ['studentName', 'STUDENT_NAME'],
              ['rollNo', 'ROLL_NO'],
              ['yearSection', 'YEAR_/_SECTION'],
              ['subject', 'SUBJECT_TYPE'],
              ['subjectCode', 'SUBJECT_CODE'],
              ['subjectName', 'SUBJECT_NAME'],
              ['assignmentNo', 'ASSIGNMENT_NO'],
            ] as [keyof CoverPageConfig, string][]).map(([field, label]) => (
              <div key={field} className="space-y-1">
                <label className="block text-[10px] font-mono text-text-muted uppercase tracking-wider">{label}</label>
                <input
                  type="text"
                  value={coverPage[field] as string}
                  onChange={(e) => updateCoverField(field, e.target.value)}
                  className="w-full px-3 py-2 bg-[#0a0a0a] text-text-main text-xs font-mono border border-border focus:border-cyan-500 focus:outline-none transition-colors"
                />
              </div>
            ))}
          </div>

          {/* Dynamic Question Rows */}
          <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between">
              <label className="text-[10px] font-mono text-text-muted uppercase tracking-wider">QUESTION_LABELS (COVER PAGE TABLE)</label>
              <button
                type="button"
                onClick={addQuestion}
                className="inline-flex items-center px-3 py-1 text-[10px] font-mono uppercase border border-border text-text-muted hover:border-cyan-500 hover:text-cyan-500 transition-colors"
              >
                + ADD_ROW
              </button>
            </div>
            {coverPage.questions.map((q, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="text-[10px] font-mono text-cyan-500 w-8 shrink-0">Q{i + 1}:</span>
                <input
                  type="text"
                  value={q}
                  onChange={(e) => updateQuestion(i, e.target.value)}
                  placeholder="Optional label..."
                  className="flex-1 px-3 py-2 bg-[#0a0a0a] text-text-main text-xs font-mono border border-border focus:border-cyan-500 focus:outline-none transition-colors placeholder:text-gray-700"
                />
                {coverPage.questions.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeQuestion(i)}
                    className="p-1 text-text-muted hover:text-red-500 transition-colors"
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

      <div className="pt-4">
        <button
          type="submit"
          disabled={isLoading || !question.trim()}
          className={`w-full flex items-center justify-center px-8 py-5 text-xl font-oswald font-bold tracking-widest uppercase focus:outline-none transition-all duration-200 border disabled:opacity-30 disabled:cursor-not-allowed group relative overflow-hidden ${
            isYugeshMode
            ? 'bg-transparent text-yellow-500 border-yellow-500 hover:bg-yellow-500 hover:text-black'
            : 'bg-transparent text-accent border-accent hover:bg-accent hover:text-black'
          }`}
        >
          {isLoading ? (
             <div className="flex items-center space-x-3">
                 <span className="font-mono text-sm animate-pulse">
                    {loadingMessage ? `[ ${loadingMessage} ]` : '[ PROCESSING ]'}
                 </span>
            </div>
          ) : (
            <>
              <span className="relative z-10 flex items-center">
                  <SparklesIcon className={`w-5 h-5 mr-3 ${isYugeshMode ? 'animate-pulse' : ''}`} />
                  {isYugeshMode ? 'INVOKE_ARCHITECT' : 'EXECUTE_GENERATION'}
              </span>
            </>
          )}
        </button>
      </div>
    </form>
  );
};
