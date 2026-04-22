export type DiagnosticSeverity = 'error' | 'warning';
export type DiagnosticCategory =
  | 'undefined-command'
  | 'missing-package'
  | 'environment'
  | 'encoding'
  | 'formatting'
  | 'general';

export interface Diagnostic {
  type: DiagnosticSeverity;
  category: DiagnosticCategory;
  message: string;
  suggestion?: string;
}

const COMMAND_SUGGESTIONS: Record<string, string> = {
  '\\includegraphics': 'Add \\usepackage{graphicx} and confirm the image path is correct.',
  '\\mathbb': 'Add \\usepackage{amssymb} or \\usepackage{amsfonts} if blackboard-bold symbols are needed.',
  '\\qty': 'Add \\usepackage{siunitx} or replace \\qty with a simpler numeric expression.',
  '\\todo': 'Add \\usepackage{todonotes} or remove the todo marker before compiling.',
  '\\uline': 'Add \\usepackage[normalem]{ulem} if you need underlined text.',
  '\\citet': 'Add a bibliography package such as natbib if citation commands are required.',
  '\\citep': 'Add a bibliography package such as natbib if citation commands are required.',
  '\\alpha': 'Use the standard math command \\alpha if you meant the Greek letter alpha.',
};

export function parseLatexLog(log: string): Diagnostic[] {
  if (!log.trim()) {
    return [];
  }

  const diagnostics: Diagnostic[] = [];
  const seen = new Set<string>();
  const lines = log
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const addDiagnostic = (diagnostic: Diagnostic) => {
    const key = `${diagnostic.type}|${diagnostic.category}|${diagnostic.message}|${diagnostic.suggestion ?? ''}`;
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    diagnostics.push(diagnostic);
  };

  for (const line of lines) {
    const undefinedCommandMatch =
      line.match(/Undefined control sequence\.?\s*(.*)/i) ??
      line.match(/Undefined control sequence.*?(\\[a-zA-Z@]+)\b/i);

    if (/Undefined control sequence/i.test(line)) {
      const command =
        line.match(/(\\[a-zA-Z@]+)\b/)?.[1] ??
        undefinedCommandMatch?.[1]?.match(/(\\[a-zA-Z@]+)\b/)?.[1];

      addDiagnostic({
        type: 'error',
        category: 'undefined-command',
        message: command
          ? `Undefined command ${command}.`
          : 'Undefined LaTeX control sequence detected.',
        suggestion: command
          ? COMMAND_SUGGESTIONS[command] ??
            `Check whether ${command} is misspelled or requires an additional package.`
          : 'Check for a misspelled command or a missing package import.',
      });
      continue;
    }

    const missingPackageMatch =
      line.match(/File [`']([^`']+)\.sty[`'] not found/i) ??
      line.match(/LaTeX Error: File [`']([^`']+)\.sty[`'] not found/i);
    if (missingPackageMatch) {
      const packageName = missingPackageMatch[1];
      addDiagnostic({
        type: 'error',
        category: 'missing-package',
        message: `Missing package: ${packageName}.sty was not found.`,
        suggestion: `Add \\usepackage{${packageName}} to the preamble if the package is available in your LaTeX environment.`,
      });
      continue;
    }

    if (
      /Environment mismatch/i.test(line) ||
      /expected \\end\{/i.test(line) ||
      /Extra \\end\{/i.test(line) ||
      /\\end\{document\}/i.test(line)
    ) {
      addDiagnostic({
        type: 'error',
        category: 'environment',
        message: line,
        suggestion: 'Check that every \\begin{...} has a matching \\end{...} and keep \\end{document} as the final command.',
      });
      continue;
    }

    if (/Overfull \\hbox/i.test(line) || /Underfull \\hbox/i.test(line)) {
      addDiagnostic({
        type: 'warning',
        category: 'formatting',
        message: line,
        suggestion: 'Adjust long lines, spacing, or line breaks if the PDF layout looks cramped.',
      });
      continue;
    }

    if (/Unicode character/i.test(line) || /inputenc Error/i.test(line) || /Invalid UTF-8/i.test(line)) {
      addDiagnostic({
        type: 'error',
        category: 'encoding',
        message: line,
        suggestion: 'Replace unsupported characters, escape special symbols, or add the required encoding package.',
      });
      continue;
    }

    if (/LaTeX Error:/i.test(line) || /^!/.test(line)) {
      addDiagnostic({
        type: 'error',
        category: 'general',
        message: line.replace(/^!\s*/, ''),
      });
    }
  }

  return diagnostics;
}
