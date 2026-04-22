import { describe, expect, it } from 'vitest';
import { parseLatexLog } from '../lib/latexDiagnostics';

describe('parseLatexLog', () => {
  it('classifies undefined commands with a suggestion', () => {
    const diagnostics = parseLatexLog('! Undefined control sequence.\\includegraphics');

    expect(diagnostics).toEqual([
      expect.objectContaining({
        type: 'error',
        category: 'undefined-command',
        message: 'Undefined command \\includegraphics.',
        suggestion: expect.stringContaining('\\usepackage{graphicx}'),
      }),
    ]);
  });

  it('classifies missing packages and environment mismatches', () => {
    const diagnostics = parseLatexLog([
      "LaTeX Error: File `graphicx.sty' not found.",
      'Environment mismatch: Expected \\end{itemize} but found \\end{document}',
    ].join('\n'));

    expect(diagnostics).toEqual([
      expect.objectContaining({
        category: 'missing-package',
        suggestion: expect.stringContaining('\\usepackage{graphicx}'),
      }),
      expect.objectContaining({
        category: 'environment',
        type: 'error',
      }),
    ]);
  });

  it('classifies formatting warnings', () => {
    const diagnostics = parseLatexLog('Overfull \\hbox (10.0pt too wide) in paragraph at lines 10--12');

    expect(diagnostics).toEqual([
      expect.objectContaining({
        type: 'warning',
        category: 'formatting',
      }),
    ]);
  });
});
