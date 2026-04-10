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

The JSON object must have one key:
1.  \`latex_code\`: A string containing the full, well-structured answer formatted in valid LaTeX. This should be a complete LaTeX document structure, including \\documentclass, \\begin{document}, title, sections, etc.

**CRITICAL FORMATTING RULE**: The \`latex_code\` string MUST contain proper newline characters (\\n) between LaTeX commands. Each \\documentclass, \\usepackage, \\begin, \\end, \\section, \\subsection, \\item, equation environments, and paragraph breaks must be on separate lines. The output must be human-readable LaTeX source code, NOT a single compressed line. For example:
- Put each \\usepackage on its own line
- Put \\begin{document} on its own line
- Put each \\section and \\subsection on its own line
- Add a blank line between paragraphs
- Put each \\item on its own line
- Put \\end{document} on its own line

Instructions for your response:
-   **LaTeX Content**: Create a thorough and clear answer to the user's question. Use appropriate LaTeX commands for formatting, such as \\section, \\subsection, \\itemize, \\enumerate, mathematical equations, etc.
-   **Math Delimiters**: For inline math use $...$ . For display math use $$...$$ or the \\begin{equation}/\\begin{align} environments. Do NOT use \\[ ... \\] for display math — always use $$...$$ instead. Ensure every opening math delimiter has a matching closing delimiter.
-   **Do NOT include any \\includegraphics commands or figure environments.**
-   **Anti-Plagiarism / Text Formatting**: You **MUST** include \`\\usepackage{xcolor}\` in the document preamble. Immediately after \`\\begin{document}\`, define a dark grey/off-black color (e.g., \`\\definecolor{customblack}{RGB}{30,30,30}\`) and apply it globally using \`\\color{customblack}\`. This is a mandatory step to ensure the text is not pure black #000000.
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
