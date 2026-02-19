import { Type } from '@google/genai';

/**
 * Shared prompt-building logic used by both:
 *  - api/generate.ts      (Vercel serverless)
 *  - server/geminiProxy.ts (Vite dev middleware)
 *
 * Keeps the two environments in sync and avoids duplicated copy.
 */

export interface PromptContext {
  question: string;
  contextFile?: { name: string; mimeType: string; base64: string } | null;
  removePlagiarism: boolean;
}

/** Build the system / user prompt text for Gemini. */
export function buildPrompt({ question, contextFile, removePlagiarism }: PromptContext): string {
  let prompt = `You are an expert academic assistant specializing in LaTeX formatting. Your task is to answer the following assignment question comprehensively`;

  if (contextFile) {
    prompt += `, using the attached "${contextFile.name}" as the primary context and source material`;
  }

  prompt += `.

Your entire output **MUST** be a single, valid JSON object that adheres to the provided schema. Do not include any text or markdown formatting outside of the JSON object.

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
-   **LaTeX Content**: Create a thorough and clear answer to the user's question. Use appropriate LaTeX commands for formatting, such as \\section, \\subsection, \\itemize, \\enumerate, mathematical equations ($...$ or $$...$$), etc.
-   **Do NOT include any \\includegraphics commands or figure environments.**
-   **Anti-Plagiarism / Text Formatting**: You **MUST** include \`\\usepackage{xcolor}\` in the document preamble. Immediately after \`\\begin{document}\`, define a dark grey/off-black color (e.g., \`\\definecolor{customblack}{RGB}{30,30,30}\`) and apply it globally using \`\\color{customblack}\`. This is a mandatory step to ensure the text is not pure black #000000.
`;

  if (removePlagiarism) {
    prompt += `
-   **Plagiarism Prevention Guidelines (ENABLED)**:
    -   **Paraphrasing**: Rewrite the content completely in your own professional words rather than just changing the appearance.
    -   **Accuracy**: Preserve the original meaning and technical accuracy.
    -   **Tone**: Use a proper academic tone.
    -   **Quotation Marks**: If you must use a direct copy of a phrase or sentence, wrap it in quotes.
    -   **Proper Citation**: Use the \`thebibliography\` environment at the end of the document for citations. Ensure all references are self-contained within the .tex file (do not use external .bib files). Use \`\\cite{...}\` within the text to attribute sources correctly.
`;
  } else {
    prompt += `
-   **Content Fidelity (PLAGIARISM REMOVAL DISABLED)**:
    -   Keep the content as close to the original (if context is provided) or standard definitions as possible.
    -   Do not paraphrase unnecessarily.
    -   Only fix grammar, formatting, or LaTeX structure if required.
`;
  }

  prompt += `

Here is the user's assignment question:
"${question}"`;

  return prompt;
}

/** JSON schema passed to Gemini's structured output. */
export const GEMINI_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    latex_code: {
      type: Type.STRING,
      description:
        'The full LaTeX document as a properly formatted string with newline characters between commands. Must be human-readable, not a single compressed line.',
    },
  },
  required: ['latex_code'],
} as const;

/** Build the `contents.parts` array for the Gemini request. */
export function buildContentParts(
  promptText: string,
  contextFile?: { mimeType: string; base64: string } | null,
): any[] {
  const parts: any[] = [{ text: promptText }];
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
