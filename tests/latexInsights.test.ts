import { describe, expect, it } from 'vitest';
import { buildFixDiff, explainFix, getFixTrustLabel, getReadinessStatus } from '../lib/latexInsights';

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

describe('buildFixDiff', () => {
  it('marks removed and added lines for a repair', () => {
    const diff = buildFixDiff({
      summary: 'Closed an open environment before the document moved on.',
      before: '\\end{document}',
      after: '\\end{itemize}\n\\end{document}',
    });

    expect(diff).toEqual([
      { kind: 'added', text: '\\end{itemize}' },
    ]);
  });

  it('shows removals when a command is deleted', () => {
    const diff = buildFixDiff({
      summary: 'Removed a closing command that did not match any open environment.',
      before: '\\end{itemize}',
      after: '(removed)',
    });

    expect(diff).toEqual([
      { kind: 'removed', text: '\\end{itemize}' },
      { kind: 'added', text: '(removed)' },
    ]);
  });
});

describe('getFixTrustLabel', () => {
  it('marks inserted environment endings as structure fixes', () => {
    expect(
      getFixTrustLabel('Inserted missing \\end{itemize} before \\end{document}.'),
    ).toEqual({
      label: 'Structure fix',
      tone: 'accent',
    });
  });

  it('marks document-end cleanup as compile-only fixes', () => {
    expect(getFixTrustLabel('Removed duplicate \\end{document}.')).toEqual({
      label: 'Compile-only fix',
      tone: 'warning',
    });
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
