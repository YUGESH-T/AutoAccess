import { Type } from '@google/genai';

/**
 * Shared prompt-building logic: single source of truth for Gemini instructions.
 */

export interface PromptContext {
  question: string;
  contextFile?: { name: string; mimeType: string; base64: string } | null;
  removePlagiarism: boolean;
}

/** Build the system / user prompt text for Gemini. */
export function buildPrompt({ question, contextFile, removePlagiarism }: PromptContext): string {
  let prompt = 'You are an expert academic assistant and LaTeX typesetting specialist. ';
  prompt += 'Your task is to answer the following assignment question with a comprehensive, well-structured academic response';

  if (contextFile) {
    prompt += `, using the attached "${contextFile.name}" as the primary context and source material`;
  }

  prompt += `.

Your entire output MUST be a single valid JSON object matching the provided schema. No text, markdown, or explanation outside the JSON object.

The JSON object must have exactly one key:
1. \`latex\`: A string containing the full, well-structured answer formatted in valid LaTeX. This should be a complete LaTeX document structure, including \\documentclass, \\begin{document}, title, sections, and closing commands.

CRITICAL FORMATTING RULES:
- The \`latex\` string MUST contain proper newline characters between LaTeX commands.
- Put each \\usepackage, \\section, \\subsection, \\item, \\begin, and \\end on its own line.
- Add a blank line between paragraphs.
- Put \\end{document} on its own line.

Instructions for your response:
- LaTeX Content: Create a thorough and clear answer using appropriate LaTeX commands such as \\section, \\subsection, \\itemize, \\enumerate, and mathematical environments.
- Math Delimiters: For inline math use $...$. For display math use $$...$$ or the \\begin{equation}/\\begin{align} environments. Do NOT use \\[ ... \\] for display math.
- Environment Safety: Every \\begin{X} MUST have a matching \\end{X}. Never produce malformed endings such as \\end{end{itemize}}. Never close an environment with the wrong name.
- Document Closure: Place \\end{document} exactly once, and only as the final LaTeX command in the file. Do not emit \\end{document} before closing open environments.
- Structural Completeness: Avoid incomplete lists, tables, align blocks, theorem blocks, or any partially-open environments.
- Do NOT include any \\includegraphics commands or figure environments.
- Text Formatting: You MUST include \\usepackage{xcolor} in the document preamble. Immediately after \\begin{document}, define a dark grey/off-black color (for example \\definecolor{customblack}{RGB}{30,30,30}) and apply it globally using \\color{customblack}.
`;

  if (removePlagiarism) {
    prompt += `

ANTI-PLAGIARISM MODE (ENABLED)
- Paraphrase all content completely.
- Use a self-contained \\begin{thebibliography} section if citations are needed.
`;
  }

  prompt += `

ASSIGNMENT QUESTION
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
        'A complete, formatted LaTeX string. Must use real newlines and must include \\end{document} only at the end.',
    },
  },
  required: ['latex'],
} as const;

type Part = { text: string } | { inlineData: { mimeType: string; data: string } };

/** Build the contents.parts array for the Gemini API request. */
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
