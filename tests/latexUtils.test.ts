import { describe, expect, it } from 'vitest';
import {
  fixLatex,
  fixNewlines,
  validateLatexStructure,
} from '../lib/latexUtils';

describe('validateLatexStructure', () => {
  it('detects missing closing environments', () => {
    const latex = '\\begin{document}\n\\begin{itemize}\n\\item Hello\n\\end{document}';
    const result = validateLatexStructure(latex);

    expect(result.isValid).toBe(false);
    expect(result.errors).toContain(
      'Environment mismatch: Expected \\end{itemize} but found \\end{document}.',
    );
  });

  it('detects malformed duplicate endings', () => {
    const latex = '\\begin{document}\n\\begin{itemize}\n\\item Hello\n\\end{end{itemize}}\n\\end{document}';
    const result = validateLatexStructure(latex);

    expect(result.isValid).toBe(false);
    expect(result.errors.some((error) => error.includes('Malformed ending detected'))).toBe(true);
  });

  it('accepts properly nested environments', () => {
    const latex = [
      '\\begin{document}',
      '\\begin{itemize}',
      '\\item Hello',
      '\\begin{enumerate}',
      '\\item Nested',
      '\\end{enumerate}',
      '\\end{itemize}',
      '\\end{document}',
    ].join('\n');

    expect(validateLatexStructure(latex).isValid).toBe(true);
  });
});

describe('fixLatex', () => {
  it('adds a missing \\end{itemize}', () => {
    const latex = '\\begin{document}\n\\begin{itemize}\n\\item Hello\n\\end{document}';
    const result = fixLatex(latex);

    expect(result.fixedLatex).toContain('\\end{itemize}');
    expect(validateLatexStructure(result.fixedLatex).isValid).toBe(true);
  });

  it('removes an unmatched extra \\end{itemize}', () => {
    const latex = '\\begin{document}\nHello\n\\end{itemize}\n\\end{document}';
    const result = fixLatex(latex);

    expect(result.fixedLatex).not.toContain('\\end{itemize}\n\\end{document}');
    expect(validateLatexStructure(result.fixedLatex).isValid).toBe(true);
  });

  it('normalizes \\end{end{itemize}}', () => {
    const latex = '\\begin{document}\n\\begin{itemize}\n\\item Hello\n\\end{end{itemize}}\n\\end{document}';
    const result = fixLatex(latex);

    expect(result.fixedLatex).toContain('\\end{itemize}');
    expect(result.fixedLatex).not.toContain('\\end{end{itemize}}');
    expect(validateLatexStructure(result.fixedLatex).isValid).toBe(true);
  });

  it('moves early \\end{document} to the end', () => {
    const latex = '\\begin{document}\n\\begin{itemize}\n\\item Hello\n\\end{document}\nMore text';
    const result = fixLatex(latex);

    expect(result.fixedLatex.trim().endsWith('\\end{document}')).toBe(true);
    expect(validateLatexStructure(result.fixedLatex).isValid).toBe(true);
  });
});

describe('fixNewlines', () => {
  it('keeps valid latex commands that begin with \\n intact', () => {
    const latex = '\\newpage\n\\noindent Hello';

    expect(fixNewlines(latex)).toBe(latex);
  });

  it('still converts escaped newline artifacts into real newlines', () => {
    expect(fixNewlines('Line one\\n Line two')).toBe('Line one\n Line two');
  });
});
