
export type AIProviderName = 'gemini' | 'cohere' | 'openrouter';

export interface AIProviderMeta {
  name: AIProviderName;
  model: string;
  latencyMs: number;
  fallbackUsed: boolean;
  attemptedProviders: AIProviderName[];
}

export interface TimelineStep {
  label: string;
  status: 'done' | 'active' | 'pending';
  meta?: string;
}

export interface GenerationResult {
  latexCode: string;
  pdfBlob?: Blob;
  fixes?: string[];
  provider?: AIProviderMeta;
  timeline?: TimelineStep[];
}

export interface GeminiLatexResponse {
  latex: string;
  fixes?: string[];
  provider?: AIProviderMeta;
  timeline?: TimelineStep[];
}

export interface ContextFile {
  name: string;
  mimeType: string;
  base64: string; // Raw base64 string without data prefix
}

export interface CoverPageConfig {
  enabled: boolean;
  studentName: string;
  rollNo: string;
  yearSection: string;
  subjectType: string;
  subjectCode: string;
  subjectName: string;
  assignmentNo: string;
  questions: string[];
}

export interface HistoryItem {
  id: string;
  timestamp: string;
  question: string;
  latexCode: string;
}

export interface ApiErrorPayload {
  message: string;
  code?: string;
}
