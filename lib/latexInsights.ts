import type { Diagnostic } from './latexDiagnostics';
import type { ValidationIssue } from '../utils/latexValidator';

export interface FixExplanation {
  summary: string;
  before?: string;
  after?: string;
}

export interface FixDiffLine {
  kind: 'removed' | 'added' | 'unchanged';
  text: string;
}

export interface FixTrustLabel {
  label: string;
  tone: 'success' | 'warning' | 'accent';
}

export interface ReadinessStatus {
  tone: 'ready' | 'repaired' | 'attention';
  label: string;
  detail: string;
}

export function explainFix(fix: string): FixExplanation {
  let match = fix.match(/^Inserted missing (\\end\{[^}]+\}) before (\\end\{[^}]+\})\.$/);
  if (match) {
    return {
      summary: `Closed an open environment before the document moved on.`,
      before: match[2],
      after: `${match[1]}\n${match[2]}`,
    };
  }

  match = fix.match(/^Inserted missing (\\end\{[^}]+\}) at the end of the document\.$/);
  if (match) {
    return {
      summary: 'Closed an environment that was left open at the end.',
      before: '(missing closing command)',
      after: match[1],
    };
  }

  match = fix.match(/^Normalized malformed ending (\\end\{end\{[^}]+\}\}) to (\\end\{[^}]+\})\.$/);
  if (match) {
    return {
      summary: 'Corrected a malformed closing command.',
      before: match[1],
      after: match[2],
    };
  }

  match = fix.match(/^Removed unmatched (\\end\{[^}]+\})\.$/);
  if (match) {
    return {
      summary: 'Removed a closing command that did not match any open environment.',
      before: match[1],
      after: '(removed)',
    };
  }

  if (fix === 'Removed duplicate \\end{document}.') {
    return {
      summary: 'Removed an extra document-ending command.',
      before: '\\end{document}\n\\end{document}',
      after: '\\end{document}',
    };
  }

  if (fix === 'Removed unmatched \\end{document}.') {
    return {
      summary: 'Removed an early document-ending command.',
      before: '\\end{document}',
      after: '(moved to the end only)',
    };
  }

  return { summary: fix };
}

export function buildFixDiff(explanation: FixExplanation): FixDiffLine[] {
  const beforeLines = (explanation.before ?? '').split('\n').filter((line) => line.length > 0);
  const afterLines = (explanation.after ?? '').split('\n').filter((line) => line.length > 0);

  if (beforeLines.length === 0 && afterLines.length === 0) {
    return [];
  }

  if (beforeLines.join('\n') === afterLines.join('\n')) {
    return beforeLines.map((line) => ({ kind: 'unchanged' as const, text: line }));
  }

  const diff: FixDiffLine[] = [];

  for (const line of beforeLines) {
    if (!afterLines.includes(line)) {
      diff.push({ kind: 'removed', text: line });
    }
  }

  for (const line of afterLines) {
    if (!beforeLines.includes(line)) {
      diff.push({ kind: 'added', text: line });
    }
  }

  if (diff.length === 0) {
    for (const line of beforeLines) {
      diff.push({ kind: 'removed', text: line });
    }
    for (const line of afterLines) {
      diff.push({ kind: 'added', text: line });
    }
  }

  return diff;
}

export function getFixTrustLabel(fix: string): FixTrustLabel {
  if (
    fix.startsWith('Inserted missing \\end{') ||
    fix.startsWith('Normalized malformed ending')
  ) {
    return {
      label: 'Structure fix',
      tone: 'accent',
    };
  }

  if (fix.startsWith('Removed unmatched \\end{document}') || fix.startsWith('Removed duplicate \\end{document}')) {
    return {
      label: 'Compile-only fix',
      tone: 'warning',
    };
  }

  return {
    label: 'Safe repair',
    tone: 'success',
  };
}

export function getReadinessStatus(input: {
  validationIssues: ValidationIssue[];
  generationFixes: string[];
  compileDiagnostics: Diagnostic[];
  compileError: boolean;
  hasPdf: boolean;
}): ReadinessStatus {
  const validationErrors = input.validationIssues.filter((issue) => issue.type === 'error').length;
  const errorDiagnostics = input.compileDiagnostics.filter((diagnostic) => diagnostic.type === 'error').length;

  if (validationErrors > 0 || input.compileError || errorDiagnostics > 0) {
    return {
      tone: 'attention',
      label: 'Needs attention',
      detail:
        validationErrors > 0
          ? 'There are structural issues in the current LaTeX that may block compilation.'
          : 'Compilation found issues that need a manual fix before the document is fully ready.',
    };
  }

  if (input.generationFixes.length > 0 || input.hasPdf) {
    return {
      tone: 'repaired',
      label: input.hasPdf ? 'Ready to share' : 'Repaired automatically',
      detail: input.hasPdf
        ? 'The document compiled successfully and the latest PDF is ready.'
        : 'The system repaired small LaTeX issues and the source now looks consistent.',
    };
  }

  return {
    tone: 'ready',
    label: 'Ready to compile',
    detail: 'The current LaTeX looks structurally healthy and is ready for the next step.',
  };
}
