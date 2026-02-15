
export interface GenerationResult {
  latexCode: string;
  pdfBlob?: Blob;
}

export interface GeminiLatexResponse {
  latex_code: string;
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
  subject: string;
  subjectCode: string;
  subjectName: string;
  assignmentNo: string;
  questions: string[];
}
