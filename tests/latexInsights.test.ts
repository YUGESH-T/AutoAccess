import { describe, expect, it } from 'vitest';
import { explainFix, getReadinessStatus } from '../lib/latexInsights';

describe('explainFix', () => {
  it('builds before and after examples for inserted endings', () => {
    const explanation = explainFix('Inserted missing \\end{itemize} before \\end{document}.');

    expect(explanation.summary).toContain('Closed an open environment');
    expect(explanation.before).toBe('\\end{document}');
    expect(explanation.after).toBe('\\end{itemize}\n\\end{document}');
  });

  it('builds before and after examples for malformed endings', () => {
    const explanation = explainFix('Normalized malformed ending \\end{end{itemize}} to \\end{itemize}.');

    expect(explanation.before).toBe('\\end{end{itemize}}');
    expect(explanation.after).toBe('\\end{itemize}');
  });
});

describe('getReadinessStatus', () => {
  it('marks documents with validation issues as needing attention', () => {
    const readiness = getReadinessStatus({
      validationIssues: [{ type: 'error', message: 'Environment mismatch' }],
      generationFixes: [],
      compileDiagnostics: [],
      compileError: false,
      hasPdf: false,
    });

    expect(readiness.tone).toBe('attention');
    expect(readiness.label).toBe('Needs attention');
  });

  it('marks repaired documents as ready to share once compiled', () => {
    const readiness = getReadinessStatus({
      validationIssues: [],
      generationFixes: ['Inserted missing \\end{itemize} before \\end{document}.'],
      compileDiagnostics: [],
      compileError: false,
      hasPdf: true,
    });

    expect(readiness.tone).toBe('repaired');
    expect(readiness.label).toBe('Ready to share');
  });
});
