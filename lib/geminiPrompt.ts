import { Type } from '@google/genai';

/**
 * Shared prompt-building logic — single source of truth for Gemini instructions.
 * Used by both:
 *  - handlers/generateHandler.ts  (shared business logic layer)
 *  - lib/geminiClient.ts          (pure API caller)
 *
 * Prompt version: v3.0 — added compiler-safety rules + LaTeX quality constraints
 */

export interface PromptContext {
  question: string;
  contextFile?: { name: string; mimeType: string; base64: string } | null;
  removePlagiarism: boolean;
}

/** Build the system / user prompt text for Gemini. */
export function buildPrompt({ question, contextFile, removePlagiarism }: PromptContext): string {
  let prompt = `You are an expert academic assistant and LaTeX typesetting specialist. Your task is to answer the following assignment question with a comprehensive, well-structured academic response`;

  if (contextFile) {
    prompt += `, using the attached "${contextFile.name}" as the primary context and source material`;
  }

  prompt += `.

Your entire output MUST be a single valid JSON object matching the provided schema. No text, markdown, or explanation outside the JSON object.

The JSON must have exactly one key:
1. \`latex\`: A string containing a COMPLETE, COMPILABLE LaTeX document.

━━━ ABSOLUTE RULES (violation = invalid output) ━━━

1. OUTPUT FORMAT
   - Return a complete LaTeX document: \\documentclass → preamble → \\begin{document} → content → \\end{document}
   - Use REAL line breaks in the JSON string, NEVER literal "\\\\n".
   - Your response MUST include \\end{document} at the very end.
   - Never wrap in markdown code fences (\`\`\`json or \`\`\`). Return raw JSON only.
   - Never include partial commands or truncated thoughts.

2. PREAMBLE & WRAPPING
   - Include standard packages: geometry, amsmath, amssymb, enumitem, titlesec, xcolor, parskip.
   - Do NOT include \documentclass or a front-matter title page (\maketitle) as it will be handled by a wrapper/generator. Focus on the core preamble packages and the document body.

3. COLOR (mandatory — prevents pure black text)
   After \begin{document}, always define and apply:
   \definecolor{customblack}{RGB}{30,30,30}
   \color{customblack}

4. MATH
   - Inline math: $...$ only.
   - Display math: \begin{align}...\end{align} or \[...\].
   - All math environments MUST be properly closed.

5. CONTENT QUALITY
   - Use \section{} and \subsection{} for structure.
   - Write detailed, complete academic response. Do not truncate mid-sentence.
`;

  if (removePlagiarism) {
    prompt += `
━━━ ANTI-PLAGIARISM MODE (ENABLED) ━━━
   - Paraphrase all content completely.
   - Use self-contained \begin{thebibliography} if citations are needed.
`;
  }

  prompt += `
━━━ ASSIGNMENT QUESTION ━━━
"${question}"`;

  return prompt;
}

/** JSON schema passed to Gemini's structured output API. */
export const GEMINI_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    latex: {
      type: Type.STRING,
      description:
        'A complete, formatted LaTeX string. Must use real newlines (not \\n). Must include \end{document}.',
    },
  },
  required: ['latex'],
} as const;

/** Build the `contents.parts` array for the Gemini API request. */

type Part = { text: string } | { inlineData: { mimeType: string; data: string } };

export function buildContentParts(
  promptText: string,
  contextFile?: { mimeType: string; base64: string } | null,
): Part[] {
  const parts: Part[] = [{ text: promptText }];
  if (contextFile) {
    parts.push({
      inlineData: {
        mimeType: contextFile.mimeType,
        data: contextFile.base64,
      },
    });
  }
  return parts;
}
