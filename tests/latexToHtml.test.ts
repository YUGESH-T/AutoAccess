import { describe, expect, it } from 'vitest';
import { convertLatexToHtml, restoreMath } from '../utils/latexToHtml';

describe('restoreMath', () => {
  it('escapes raw math content before HTML injection', () => {
    const restored = restoreMath('<p>__MTH_0__</p>', {
      __MTH_0__: '$a < b$',
    });

    expect(restored).toContain('$a &lt; b$');
    expect(restored).not.toContain('$a < b$');
  });
});

describe('convertLatexToHtml', () => {
  it('keeps top-level list items without splitting nested content incorrectly', () => {
    const latex = [
      '\\begin{document}',
      '\\begin{itemize}',
      '\\item Outer item',
      '\\begin{enumerate}',
      '\\item Nested item',
      '\\end{enumerate}',
      '\\item Second outer item',
      '\\end{itemize}',
      '\\end{document}',
    ].join('\n');

    const { html } = convertLatexToHtml(latex);
    expect(html).toContain('Outer item');
    expect(html).toContain('Second outer item');
    expect(html).toContain('<ol');
    expect(html).toContain('Nested item');
  });

  it('renders nested block environments inside list items', () => {
    const latex = [
      '\\begin{document}',
      '\\begin{itemize}',
      '\\item Intro',
      '\\begin{quote}',
      'Nested quote text',
      '\\end{quote}',
      '\\item Outro',
      '\\end{itemize}',
      '\\end{document}',
    ].join('\n');

    const { html } = convertLatexToHtml(latex);
    expect(html).toContain('<blockquote');
    expect(html).toContain('Nested quote text');
    expect(html).toContain('Outro');
  });

  it('renders table cells without splitting escaped separators', () => {
    const latex = [
      '\\begin{document}',
      '\\begin{tabular}{ll}',
      'Name & Value \\\\',
      'A\\&B & 42 \\\\',
      '\\end{tabular}',
      '\\end{document}',
    ].join('\n');

    const { html } = convertLatexToHtml(latex);
    expect(html).toContain('<table');
    expect(html).toContain('A&amp;B');
  });
});
