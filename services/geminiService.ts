
import { GoogleGenAI, Type } from "@google/genai";
import type { GenerateContentResponse } from "@google/genai";
import type { ContextFile } from "../types";

const API_KEY = process.env.API_KEY;

if (!API_KEY) {
  throw new Error("API_KEY environment variable not set");
}

const ai = new GoogleGenAI({ apiKey: API_KEY });

// Utility to strip markdown code blocks from JSON string
const cleanJsonString = (text: string): string => {
  // Remove starting ```json or ```
  let cleaned = text.replace(/^```(?:json)?\s*/, '');
  // Remove ending ```
  cleaned = cleaned.replace(/\s*```$/, '');
  return cleaned.trim();
};

const generateLatex = async (question: string, contextFile?: ContextFile, removePlagiarism: boolean = false): Promise<string> => {
  const model = "gemini-2.5-flash";
  
  let promptText = `You are an expert academic assistant specializing in LaTeX formatting. Your task is to answer the following assignment question comprehensively`;

  if (contextFile) {
    promptText += `, using the attached "${contextFile.name}" as the primary context and source material`;
  }

  promptText += `.

Your entire output **MUST** be a single, valid JSON object that adheres to the provided schema. Do not include any text or markdown formatting outside of the JSON object.

The JSON object must have one key:
1.  \`latex_code\`: A string containing the full, well-structured answer formatted in valid LaTeX. This should be a complete LaTeX document structure, including \\documentclass, \\begin{document}, title, sections, etc.

Instructions for your response:
-   **LaTeX Content**: Create a thorough and clear answer to the user's question. Use appropriate LaTeX commands for formatting, such as \\section, \\subsection, \\itemize, \\enumerate, mathematical equations ($...$ or $$...$$), etc.
-   **Do NOT include any \\includegraphics commands or figure environments.**
-   **Anti-Plagiarism / Text Formatting**: You **MUST** include \`\\usepackage{xcolor}\` in the document preamble. Immediately after \`\\begin{document}\`, define a dark grey/off-black color (e.g., \`\\definecolor{customblack}{RGB}{30,30,30}\`) and apply it globally using \`\\color{customblack}\`. This is a mandatory step to ensure the text is not pure black #000000.
`;

  if (removePlagiarism) {
    promptText += `
-   **Plagiarism Prevention Guidelines (ENABLED)**:
    -   **Paraphrasing**: Rewrite the content completely in your own professional words rather than just changing the appearance.
    -   **Accuracy**: Preserve the original meaning and technical accuracy.
    -   **Tone**: Use a proper academic tone.
    -   **Quotation Marks**: If you must use a direct copy of a phrase or sentence, wrap it in quotes.
    -   **Proper Citation**: Use the \`thebibliography\` environment at the end of the document for citations. Ensure all references are self-contained within the .tex file (do not use external .bib files). Use \`\\cite{...}\` within the text to attribute sources correctly.
`;
  } else {
    promptText += `
-   **Content Fidelity (PLAGIARISM REMOVAL DISABLED)**:
    -   Keep the content as close to the original (if context is provided) or standard definitions as possible.
    -   Do not paraphrase unnecessarily.
    -   Only fix grammar, formatting, or LaTeX structure if required.
`;
  }

  promptText += `

Here is the user's assignment question:
"${question}"`;

  const schema = {
    type: Type.OBJECT,
    properties: {
      latex_code: {
        type: Type.STRING,
        description: 'The full LaTeX document as a single string.'
      }
    },
    required: ['latex_code']
  };

  const contents: any = [{ text: promptText }];
  
  if (contextFile) {
      contents.push({
          inlineData: {
              mimeType: contextFile.mimeType,
              data: contextFile.base64
          }
      });
  }

  const response: GenerateContentResponse = await ai.models.generateContent({
    model,
    contents: {
      parts: contents,
    },
    config: {
      responseMimeType: "application/json",
      responseSchema: schema,
      temperature: 0.5,
    },
  });

  // Robustness: Clean the response text before returning
  return cleanJsonString(response.text || "{}");
};


export const geminiService = {
  generateLatex,
};
