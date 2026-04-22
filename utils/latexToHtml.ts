/**
 * latexToHtml.ts - Converts LaTeX source to styled HTML.
 * Math expressions are protected as placeholders so they survive sanitization,
 * then restored afterwards via restoreMath().
 */

export interface LatexConvertResult {
  html: string;
  mathMap: Record<string, string>;
}

type BlockStore = Record<string, string>;
type MathStore = Record<string, string>;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function splitTopLevel(input: string, delimiter: string): string[] {
  const parts: string[] = [];
  let braceDepth = 0;
  let start = 0;
  let i = 0;

  while (i < input.length) {
    const char = input[i];

    if (char === '\\') {
      i += 2;
      continue;
    }

    if (char === '{') braceDepth++;
    else if (char === '}') braceDepth = Math.max(0, braceDepth - 1);

    if (braceDepth === 0 && input.startsWith(delimiter, i)) {
      parts.push(input.slice(start, i));
      i += delimiter.length;
      start = i;
      continue;
    }

    i++;
  }

  parts.push(input.slice(start));
  return parts;
}

function findMatchingEnvEnd(input: string, envName: string, beginStart: number): number {
  const beginToken = `\\begin{${envName}}`;
  const endToken = `\\end{${envName}}`;
  let depth = 0;
  let i = beginStart;

  while (i < input.length) {
    if (input.startsWith(beginToken, i)) {
      depth++;
      i += beginToken.length;
      continue;
    }

    if (input.startsWith(endToken, i)) {
      depth--;
      i += endToken.length;
      if (depth === 0) {
        return i;
      }
      continue;
    }

    i++;
  }

  return -1;
}

function extractEnvironmentContent(input: string, envName: string): string | null {
  const beginToken = `\\begin{${envName}}`;
  const endToken = `\\end{${envName}}`;
  const beginIndex = input.indexOf(beginToken);
  if (beginIndex === -1) return null;
  const endIndex = findMatchingEnvEnd(input, envName, beginIndex);
  if (endIndex === -1) return null;
  return input.slice(beginIndex + beginToken.length, endIndex - endToken.length);
}

function parseListItems(content: string): string[] {
  const items: string[] = [];
  let current = '';
  let i = 0;
  let envDepth = 0;

  while (i < content.length) {
    if (content[i] === '\\') {
      if (content.startsWith('\\begin{', i)) {
        envDepth++;
      } else if (content.startsWith('\\end{', i)) {
        envDepth = Math.max(0, envDepth - 1);
      } else if (envDepth === 0 && content.startsWith('\\item', i)) {
        if (current.trim()) {
          items.push(current.trim());
        }
        current = '';
        i += '\\item'.length;
        continue;
      }
    }

    current += content[i];
    i++;
  }

  if (current.trim()) {
    items.push(current.trim());
  }

  return items;
}

function parseDescriptionItems(content: string): Array<{ term: string; description: string }> {
  const items: Array<{ term: string; description: string }> = [];
  let i = 0;
  let envDepth = 0;
  let currentTerm: string | null = null;
  let currentDescription = '';

  while (i < content.length) {
    if (content[i] === '\\') {
      if (content.startsWith('\\begin{', i)) {
        envDepth++;
      } else if (content.startsWith('\\end{', i)) {
        envDepth = Math.max(0, envDepth - 1);
      } else if (envDepth === 0 && content.startsWith('\\item[', i)) {
        if (currentTerm !== null) {
          items.push({ term: currentTerm.trim(), description: currentDescription.trim() });
        }
        i += '\\item['.length;
        const closing = content.indexOf(']', i);
        if (closing === -1) break;
        currentTerm = content.slice(i, closing);
        currentDescription = '';
        i = closing + 1;
        continue;
      }
    }

    currentDescription += content[i];
    i++;
  }

  if (currentTerm !== null) {
    items.push({ term: currentTerm.trim(), description: currentDescription.trim() });
  }

  return items;
}

function renderInlineFormatting(tex: string): string {
  const escapedSpecials: Array<[RegExp, string, string]> = [
    [/\\&/g, '__LATEX_ESC_AMP__', '&amp;'],
    [/\\%/g, '__LATEX_ESC_PERCENT__', '%'],
    [/\\#/g, '__LATEX_ESC_HASH__', '#'],
    [/\\_/g, '__LATEX_ESC_UNDERSCORE__', '_'],
    [/\\\{/g, '__LATEX_ESC_LBRACE__', '{'],
    [/\\\}/g, '__LATEX_ESC_RBRACE__', '}'],
  ];

  let output = tex;
  for (const [pattern, placeholder] of escapedSpecials) {
    output = output.replace(pattern, placeholder);
  }

  output = escapeHtml(output);

  for (const [, placeholder, replacement] of escapedSpecials) {
    output = output.replace(new RegExp(placeholder, 'g'), replacement);
  }

  output = output.replace(
    /\\textbf\{(.*?)\}/g,
    '<strong style="font-weight:600;color:var(--p-text)">$1</strong>',
  );
  output = output.replace(/\\textit\{(.*?)\}/g, '<em style="color:var(--p-sec)">$1</em>');
  output = output.replace(/\\emph\{(.*?)\}/g, '<em style="color:var(--p-sec)">$1</em>');
  output = output.replace(
    /\\texttt\{(.*?)\}/g,
    '<code style="font-family:\'JetBrains Mono\',monospace;font-size:0.85em;padding:0.15em 0.3em;background:var(--p-code);border-radius:4px;color:var(--p-accent)">$1</code>',
  );
  output = output.replace(
    /\\underline\{(.*?)\}/g,
    '<u style="text-decoration-color:var(--p-muted)">$1</u>',
  );
  output = output.replace(
    /\\href\{(.*?)\}\{(.*?)\}/g,
    '<a href="$1" target="_blank" rel="noopener" style="color:var(--p-accent);text-decoration:underline;text-underline-offset:2px">$2</a>',
  );
  output = output.replace(
    /\\url\{(.*?)\}/g,
    '<a href="$1" target="_blank" rel="noopener" style="color:var(--p-accent);font-family:\'JetBrains Mono\',monospace;font-size:0.85em">$1</a>',
  );

  let footnoteNumber = 0;
  output = output.replace(/\\footnote\{(.*?)\}/g, (_, content) => {
    footnoteNumber++;
    return `<sup style="color:var(--p-accent);cursor:help;font-size:0.75em" title="${String(content).replace(/"/g, '&quot;')}">[${footnoteNumber}]</sup>`;
  });

  return output;
}

function convertTabular(
  content: string,
  captionHtml: string,
  renderInner: (value: string) => string,
): string {
  const normalizedContent = content.replace(/^\s*\{[^}]*\}\s*/, '');
  const rows = splitTopLevel(
    normalizedContent
      .replace(/\\hline/g, '')
      .replace(/\\cline\{.*?\}/g, '')
      .replace(/\\toprule|\\midrule|\\bottomrule/g, ''),
    '\\\\',
  )
    .map((row) => row.trim())
    .filter((row) => row.length > 0);

  const tableRows = rows
    .map((row, rowIndex) => {
      const cells = splitTopLevel(row, '&').map((cell) => cell.trim());
      const tag = rowIndex === 0 ? 'th' : 'td';
      const style =
        rowIndex === 0
          ? 'padding:0.5rem 0.75rem;font-weight:600;color:var(--p-head);border-bottom:2px solid var(--p-border);text-align:left;font-size:0.8rem'
          : 'padding:0.5rem 0.75rem;color:var(--p-sec);border-bottom:1px solid var(--p-border);font-size:0.8rem';
      return `<tr>${cells
        .map((cell) => `<${tag} style="${style}">${renderInner(cell)}</${tag}>`)
        .join('')}</tr>`;
    })
    .join('');

  return `<div style="overflow-x:auto;margin:1.25rem 0"><table style="width:100%;border-collapse:collapse;border:1px solid var(--p-border);border-radius:8px;overflow:hidden">${captionHtml}<tbody>${tableRows}</tbody></table></div>`;
}

function renderParagraphsAndBlocks(
  tex: string,
  blocks: BlockStore,
  renderInner: (value: string) => string,
): string {
  return tex
    .split(/(__BLK_\d+__|\n\s*\n)/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .map((part) => {
      if (part.startsWith('__BLK_')) {
        return blocks[part] || '';
      }

      const inner = renderInlineFormatting(part).replace(/\\newline|\\\\/g, '<br/>');
      return `<p style="margin-bottom:1.25rem;line-height:1.75;color:var(--p-sec);text-align:justify;font-size:0.875rem">${inner}</p>`;
    })
    .join('');
}

function renderEnvironmentBlocks(tex: string, addBlock: (html: string) => string, renderInner: (value: string) => string): string {
  const environmentRenderers: Array<{
    env: string;
    render: (content: string, fullMatch: string) => string;
  }> = [
    {
      env: 'verbatim',
      render: (content) =>
        addBlock(
          `<pre style="background:var(--p-code);border:1px solid var(--p-border);border-radius:8px;padding:1rem;overflow-x:auto;margin:1.25rem 0"><code style="font-family:'JetBrains Mono',monospace;font-size:0.8rem;color:var(--p-text);line-height:1.6">${escapeHtml(content)}</code></pre>`,
        ),
    },
    {
      env: 'lstlisting',
      render: (content) =>
        addBlock(
          `<pre style="background:var(--p-code);border:1px solid var(--p-border);border-radius:8px;padding:1rem;overflow-x:auto;margin:1.25rem 0"><code style="font-family:'JetBrains Mono',monospace;font-size:0.8rem;color:var(--p-text);line-height:1.6">${escapeHtml(content)}</code></pre>`,
        ),
    },
    {
      env: 'quote',
      render: (content) =>
        addBlock(
          `<blockquote style="border-left:3px solid var(--p-accent);margin:1.25rem 0;padding:0.75rem 1.25rem;color:var(--p-sec);font-style:italic;background:var(--p-code);border-radius:0 8px 8px 0">${renderInner(content.trim())}</blockquote>`,
        ),
    },
    {
      env: 'quotation',
      render: (content) =>
        addBlock(
          `<blockquote style="border-left:3px solid var(--p-accent);margin:1.25rem 0;padding:0.75rem 1.25rem;color:var(--p-sec);font-style:italic;background:var(--p-code);border-radius:0 8px 8px 0">${renderInner(content.trim())}</blockquote>`,
        ),
    },
    {
      env: 'itemize',
      render: (content) => {
        const items = parseListItems(content)
          .map(
            (item) =>
              `<li style="padding-left:0.375rem;margin-bottom:0.375rem;color:var(--p-sec)">${renderInner(item)}</li>`,
          )
          .join('');
        return addBlock(
          `<ul style="margin:1.25rem 0 1.25rem 1.25rem;list-style:disc;font-size:0.875rem">${items}</ul>`,
        );
      },
    },
    {
      env: 'enumerate',
      render: (content) => {
        const items = parseListItems(content)
          .map(
            (item) =>
              `<li style="padding-left:0.375rem;margin-bottom:0.375rem;color:var(--p-sec)">${renderInner(item)}</li>`,
          )
          .join('');
        return addBlock(
          `<ol style="margin:1.25rem 0 1.25rem 1.25rem;list-style:decimal;font-size:0.875rem">${items}</ol>`,
        );
      },
    },
    {
      env: 'description',
      render: (content) => {
        const items = parseDescriptionItems(content)
          .map(
            ({ term, description }) =>
              `<dt style="font-weight:600;color:var(--p-text)">${renderInlineFormatting(term)}</dt><dd style="margin-left:1.25rem;margin-bottom:0.5rem;color:var(--p-sec)">${renderInner(description)}</dd>`,
          )
          .join('');
        return addBlock(`<dl style="margin:1.25rem 0;font-size:0.875rem">${items}</dl>`);
      },
    },
    {
      env: 'table',
      render: (content) => {
        const captionMatch = content.match(/\\caption\{([\s\S]*?)\}/);
        const captionHtml = captionMatch
          ? `<caption style="caption-side:bottom;padding:0.5rem;font-size:0.75rem;color:var(--p-muted);font-style:italic">${renderInlineFormatting(captionMatch[1])}</caption>`
          : '';

        const tabularContent = extractEnvironmentContent(content, 'tabular');
        if (!tabularContent) {
          return addBlock(`<div style="margin:1.25rem 0">${renderInner(content)}</div>`);
        }

        return addBlock(convertTabular(tabularContent, captionHtml, renderInner));
      },
    },
    {
      env: 'tabular',
      render: (content) => addBlock(convertTabular(content, '', renderInner)),
    },
  ];

  let output = tex;

  for (const { env, render } of environmentRenderers) {
    const beginToken = `\\begin{${env}}`;
    let searchIndex = output.indexOf(beginToken);

    while (searchIndex !== -1) {
      const endIndex = findMatchingEnvEnd(output, env, searchIndex);
      if (endIndex === -1) {
        break;
      }

      const fullMatch = output.slice(searchIndex, endIndex);
      const content = output.slice(searchIndex + beginToken.length, endIndex - `\\end{${env}}`.length);
      const replacement = render(content, fullMatch);
      output = output.slice(0, searchIndex) + replacement + output.slice(endIndex);
      searchIndex = output.indexOf(beginToken);
    }
  }

  return output;
}

function buildRenderer(blocks: BlockStore) {
  const addBlock = (html: string) => {
    const key = `__BLK_${Object.keys(blocks).length}__`;
    blocks[key] = html;
    return `\n\n${key}\n\n`;
  };

  const renderInner = (value: string): string => {
    const nested = renderEnvironmentBlocks(value, addBlock, renderInner);
    return renderParagraphsAndBlocks(nested, blocks, renderInner);
  };

  return { addBlock, renderInner };
}

export const convertLatexToHtml = (latexCode: string): LatexConvertResult => {
  if (!latexCode) return { html: '', mathMap: {} };
  let tex = latexCode;

  const blocks: BlockStore = {};
  const mathMap: MathStore = {};
  let mathN = 0;

  const { addBlock, renderInner } = buildRenderer(blocks);

  const storeMath = (m: string) => {
    const key = `__MTH_${mathN++}__`;
    mathMap[key] = m;
    return key;
  };

  tex = tex
    .replace(/\\documentclass(?:\[.*?\])?\{.*?\}/g, '')
    .replace(/\\usepackage(?:\[.*?\])?\{.*?\}/g, '')
    .replace(/\\begin\{document\}/, '')
    .replace(/\\end\{document\}/, '')
    .replace(/\\definecolor\{.*?\}\{.*?\}\{.*?\}/g, '')
    .replace(/\\color\{.*?\}/g, '')
    .replace(/\\setlength\{.*?\}\{.*?\}/g, '')
    .replace(/\\pagestyle\{.*?\}/g, '')
    .replace(/\\thispagestyle\{.*?\}/g, '')
    .replace(/\\newcommand\{.*?\}(?:\[\d+\])?\{[\s\S]*?\}/g, '')
    .replace(/\\renewcommand\{.*?\}(?:\[\d+\])?\{[\s\S]*?\}/g, '')
    .replace(/\\label\{.*?\}/g, '')
    .replace(/\\centering/g, '')
    .trim();

  tex = tex.replace(/\$\$([\s\S]*?)\$\$/g, (m) => addBlock(storeMath(m)));
  tex = tex.replace(/\\\[([\s\S]*?)\\\]/g, (m) => addBlock(storeMath(m)));
  tex = tex.replace(
    /\\begin\{(align\*?|equation\*?|gather\*?|multline\*?)\}([\s\S]*?)\\end\{\1\}/g,
    (m) => addBlock(storeMath(m)),
  );
  tex = tex.replace(/\\\(([\s\S]*?)\\\)/g, (m) => storeMath(m));
  tex = tex.replace(/(?<!\\)\$([^\$\n]+?)(?<!\\)\$/g, (m) => storeMath(m));

  const titleM = tex.match(/\\title\{([\s\S]*?)\}/);
  const authorM = tex.match(/\\author\{([\s\S]*?)\}/);
  const dateM = tex.match(/\\date\{([\s\S]*?)\}/);
  tex = tex
    .replace(/\\title\{[\s\S]*?\}/, '')
    .replace(/\\author\{[\s\S]*?\}/, '')
    .replace(/\\date\{[\s\S]*?\}/, '')
    .replace(/\\maketitle/, '');

  let header = '';
  if (titleM || authorM || dateM) {
    header +=
      '<div style="margin-bottom:2.5rem;text-align:center;padding-bottom:1.5rem;border-bottom:1px solid var(--p-border)">';
    if (titleM) {
      header += `<h1 style="font-size:1.875rem;font-weight:600;color:var(--p-head);margin-bottom:0.75rem;letter-spacing:-0.025em;font-family:'Space Grotesk',sans-serif">${renderInlineFormatting(titleM[1])}</h1>`;
    }
    if (authorM) {
      header += `<p style="font-size:0.875rem;color:var(--p-accent)">${renderInlineFormatting(authorM[1])}</p>`;
    }
    if (dateM) {
      header += `<p style="font-size:0.75rem;color:var(--p-muted);margin-top:0.375rem">${renderInlineFormatting(dateM[1])}</p>`;
    }
    header += '</div>';
  }

  tex = tex.replace(/\\section\*?\{(.*?)\}/g, (_, content) =>
    addBlock(
      `<h2 style="font-size:1.25rem;font-weight:600;margin-top:2.5rem;margin-bottom:1.25rem;color:var(--p-head);border-bottom:1px solid var(--p-border);padding-bottom:0.5rem;font-family:'Space Grotesk',sans-serif">${renderInlineFormatting(content)}</h2>`,
    ),
  );
  tex = tex.replace(/\\subsection\*?\{(.*?)\}/g, (_, content) =>
    addBlock(
      `<h3 style="font-size:1.125rem;font-weight:600;margin-top:1.75rem;margin-bottom:0.75rem;color:var(--p-text);font-family:'Space Grotesk',sans-serif">${renderInlineFormatting(content)}</h3>`,
    ),
  );
  tex = tex.replace(/\\subsubsection\*?\{(.*?)\}/g, (_, content) =>
    addBlock(
      `<h4 style="font-size:1rem;font-weight:600;margin-top:1.5rem;margin-bottom:0.5rem;color:var(--p-text);font-family:'Space Grotesk',sans-serif">${renderInlineFormatting(content)}</h4>`,
    ),
  );

  tex = renderEnvironmentBlocks(tex, addBlock, renderInner);
  const body = renderParagraphsAndBlocks(tex, blocks, renderInner);

  return { html: header + body, mathMap };
};

export const restoreMath = (html: string, mathMap: Record<string, string>): string =>
  html.replace(/__MTH_\d+__/g, (m) => escapeHtml(mathMap[m] || m));

/** Count words in LaTeX source (strips commands, environments, math). */
export function countWords(latex: string): number {
  const stripped = latex
    .replace(/\\begin\{.*?\}|\\end\{.*?\}/g, ' ')
    .replace(/\\[a-zA-Z]+\*?(\{[^}]*\})+/g, (_, group) => String(group).replace(/[{}]/g, ''))
    .replace(/\\[a-zA-Z]+/g, ' ')
    .replace(/[\\{}$%&_^~#\[\]]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return stripped.length === 0 ? 0 : stripped.split(/\s+/).length;
}
