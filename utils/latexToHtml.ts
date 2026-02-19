/**
 * latexToHtml.ts — Converts LaTeX source to styled HTML.
 * Math expressions are protected as placeholders so they survive DOMPurify,
 * then restored afterwards via restoreMath().
 */

export interface LatexConvertResult {
  html: string;
  mathMap: Record<string, string>;
}

const convertTabular = (content: string, captionHtml: string): string => {
  const rows = content
    .replace(/\\hline/g, '')
    .replace(/\\cline\{.*?\}/g, '')
    .replace(/\\toprule|\\midrule|\\bottomrule/g, '')
    .split('\\\\')
    .map(r => r.trim())
    .filter(r => r.length > 0);

  const tableRows = rows
    .map((row, i) => {
      const cells = row.split('&').map(c => c.trim());
      const tag = i === 0 ? 'th' : 'td';
      const style =
        i === 0
          ? 'padding:0.5rem 0.75rem;font-weight:600;color:var(--p-head);border-bottom:2px solid var(--p-border);text-align:left;font-size:0.8rem'
          : 'padding:0.5rem 0.75rem;color:var(--p-sec);border-bottom:1px solid var(--p-border);font-size:0.8rem';
      return `<tr>${cells.map(c => `<${tag} style="${style}">${c}</${tag}>`).join('')}</tr>`;
    })
    .join('');

  return `<div style="overflow-x:auto;margin:1.25rem 0"><table style="width:100%;border-collapse:collapse;border:1px solid var(--p-border);border-radius:8px;overflow:hidden">${captionHtml}<tbody>${tableRows}</tbody></table></div>`;
};

export const convertLatexToHtml = (latexCode: string): LatexConvertResult => {
  if (!latexCode) return { html: '', mathMap: {} };
  let tex = latexCode;

  const blocks: Record<string, string> = {};
  let blockN = 0;
  const mathMap: Record<string, string> = {};
  let mathN = 0;

  const addBlock = (html: string) => {
    const k = `__BLK_${blockN++}__`;
    blocks[k] = html;
    return `\n\n${k}\n\n`;
  };
  const storeMath = (m: string) => {
    const k = `__MTH_${mathN++}__`;
    mathMap[k] = m;
    return k;
  };

  // Strip preamble / document env
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

  /* 1. Protect math */
  tex = tex.replace(/\$\$([\s\S]*?)\$\$/g, m => addBlock(storeMath(m)));
  tex = tex.replace(/\\\[([\s\S]*?)\\\]/g, m => addBlock(storeMath(m)));
  tex = tex.replace(
    /\\begin\{(align\*?|equation\*?|gather\*?|multline\*?)\}([\s\S]*?)\\end\{\1\}/g,
    m => addBlock(storeMath(m)),
  );
  tex = tex.replace(/\\\(([\s\S]*?)\\\)/g, m => storeMath(m));
  tex = tex.replace(/(?<!\\)\$([^\$\n]+?)(?<!\\)\$/g, m => storeMath(m));

  /* 2. Title / author / date */
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
    if (titleM)
      header += `<h1 style="font-size:1.875rem;font-weight:600;color:var(--p-head);margin-bottom:0.75rem;letter-spacing:-0.025em;font-family:'Space Grotesk',sans-serif">${titleM[1]}</h1>`;
    if (authorM)
      header += `<p style="font-size:0.875rem;color:var(--p-accent)">${authorM[1]}</p>`;
    if (dateM)
      header += `<p style="font-size:0.75rem;color:var(--p-muted);margin-top:0.375rem">${dateM[1]}</p>`;
    header += '</div>';
  }

  /* 3. Inline formatting */
  tex = tex.replace(
    /\\textbf\{(.*?)\}/g,
    '<strong style="font-weight:600;color:var(--p-text)">$1</strong>',
  );
  tex = tex.replace(/\\textit\{(.*?)\}/g, '<em style="color:var(--p-sec)">$1</em>');
  tex = tex.replace(/\\emph\{(.*?)\}/g, '<em style="color:var(--p-sec)">$1</em>');
  tex = tex.replace(
    /\\texttt\{(.*?)\}/g,
    '<code style="font-family:\'JetBrains Mono\',monospace;font-size:0.85em;padding:0.15em 0.3em;background:var(--p-code);border-radius:4px;color:var(--p-accent)">$1</code>',
  );
  tex = tex.replace(
    /\\underline\{(.*?)\}/g,
    '<u style="text-decoration-color:var(--p-muted)">$1</u>',
  );
  tex = tex.replace(
    /\\href\{(.*?)\}\{(.*?)\}/g,
    '<a href="$1" target="_blank" rel="noopener" style="color:var(--p-accent);text-decoration:underline;text-underline-offset:2px">$2</a>',
  );
  tex = tex.replace(
    /\\url\{(.*?)\}/g,
    '<a href="$1" target="_blank" rel="noopener" style="color:var(--p-accent);font-family:\'JetBrains Mono\',monospace;font-size:0.85em">$1</a>',
  );

  let fnN = 0;
  tex = tex.replace(/\\footnote\{(.*?)\}/g, (_, c) => {
    fnN++;
    return `<sup style="color:var(--p-accent);cursor:help;font-size:0.75em" title="${c.replace(/"/g, '&quot;')}">[${fnN}]</sup>`;
  });

  /* 4. Sections */
  tex = tex.replace(/\\section\*?\{(.*?)\}/g, (_, c) =>
    addBlock(
      `<h2 style="font-size:1.25rem;font-weight:600;margin-top:2.5rem;margin-bottom:1.25rem;color:var(--p-head);border-bottom:1px solid var(--p-border);padding-bottom:0.5rem;font-family:'Space Grotesk',sans-serif">${c}</h2>`,
    ),
  );
  tex = tex.replace(/\\subsection\*?\{(.*?)\}/g, (_, c) =>
    addBlock(
      `<h3 style="font-size:1.125rem;font-weight:600;margin-top:1.75rem;margin-bottom:0.75rem;color:var(--p-text);font-family:'Space Grotesk',sans-serif">${c}</h3>`,
    ),
  );
  tex = tex.replace(/\\subsubsection\*?\{(.*?)\}/g, (_, c) =>
    addBlock(
      `<h4 style="font-size:1rem;font-weight:600;margin-top:1.5rem;margin-bottom:0.5rem;color:var(--p-text);font-family:'Space Grotesk',sans-serif">${c}</h4>`,
    ),
  );

  /* 5. Verbatim / lstlisting */
  tex = tex.replace(/\\begin\{verbatim\}([\s\S]*?)\\end\{verbatim\}/g, (_, c) =>
    addBlock(
      `<pre style="background:var(--p-code);border:1px solid var(--p-border);border-radius:8px;padding:1rem;overflow-x:auto;margin:1.25rem 0"><code style="font-family:'JetBrains Mono',monospace;font-size:0.8rem;color:var(--p-text);line-height:1.6">${c
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')}</code></pre>`,
    ),
  );
  tex = tex.replace(
    /\\begin\{lstlisting\}(?:\[[\s\S]*?\])?([\s\S]*?)\\end\{lstlisting\}/g,
    (_, c) =>
      addBlock(
        `<pre style="background:var(--p-code);border:1px solid var(--p-border);border-radius:8px;padding:1rem;overflow-x:auto;margin:1.25rem 0"><code style="font-family:'JetBrains Mono',monospace;font-size:0.8rem;color:var(--p-text);line-height:1.6">${c
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')}</code></pre>`,
      ),
  );

  /* 6. Blockquote */
  tex = tex.replace(
    /\\begin\{(?:quote|quotation)\}([\s\S]*?)\\end\{(?:quote|quotation)\}/g,
    (_, c) =>
      addBlock(
        `<blockquote style="border-left:3px solid var(--p-accent);margin:1.25rem 0;padding:0.75rem 1.25rem;color:var(--p-sec);font-style:italic;background:var(--p-code);border-radius:0 8px 8px 0">${c.trim()}</blockquote>`,
      ),
  );

  /* 7. Tables */
  tex = tex.replace(
    /\\begin\{table\}(?:\[.*?\])?([\s\S]*?)\\end\{table\}/g,
    (_, content) => {
      const capM = content.match(/\\caption\{(.*?)\}/);
      const capHtml = capM
        ? `<caption style="caption-side:bottom;padding:0.5rem;font-size:0.75rem;color:var(--p-muted);font-style:italic">${capM[1]}</caption>`
        : '';
      const tabM = content.match(
        /\\begin\{tabular\}\{.*?\}([\s\S]*?)\\end\{tabular\}/,
      );
      if (!tabM)
        return addBlock(`<div style="margin:1.25rem 0">${content}</div>`);
      return addBlock(convertTabular(tabM[1], capHtml));
    },
  );
  tex = tex.replace(
    /\\begin\{tabular\}\{.*?\}([\s\S]*?)\\end\{tabular\}/g,
    (_, c) => addBlock(convertTabular(c, '')),
  );

  /* 8. Lists */
  tex = tex.replace(
    /\\begin\{itemize\}([\s\S]*?)\\end\{itemize\}/g,
    (_, c) => {
      const items = c
        .trim()
        .split('\\item')
        .slice(1)
        .map(
          (i: string) =>
            `<li style="padding-left:0.375rem;margin-bottom:0.375rem;color:var(--p-sec)">${i.trim()}</li>`,
        )
        .join('');
      return addBlock(
        `<ul style="margin:1.25rem 0 1.25rem 1.25rem;list-style:disc;font-size:0.875rem">${items}</ul>`,
      );
    },
  );
  tex = tex.replace(
    /\\begin\{enumerate\}([\s\S]*?)\\end\{enumerate\}/g,
    (_, c) => {
      const items = c
        .trim()
        .split('\\item')
        .slice(1)
        .map(
          (i: string) =>
            `<li style="padding-left:0.375rem;margin-bottom:0.375rem;color:var(--p-sec)">${i.trim()}</li>`,
        )
        .join('');
      return addBlock(
        `<ol style="margin:1.25rem 0 1.25rem 1.25rem;list-style:decimal;font-size:0.875rem">${items}</ol>`,
      );
    },
  );
  tex = tex.replace(
    /\\begin\{description\}([\s\S]*?)\\end\{description\}/g,
    (_, c) => {
      const items = c
        .trim()
        .split(/\\item\[/)
        .slice(1)
        .map((i: string) => {
          const cb = i.indexOf(']');
          const term = i.substring(0, cb);
          const desc = i.substring(cb + 1).trim();
          return `<dt style="font-weight:600;color:var(--p-text)">${term}</dt><dd style="margin-left:1.25rem;margin-bottom:0.5rem;color:var(--p-sec)">${desc}</dd>`;
        })
        .join('');
      return addBlock(
        `<dl style="margin:1.25rem 0;font-size:0.875rem">${items}</dl>`,
      );
    },
  );

  /* 9. Paragraphs */
  let body = tex
    .split(/(__BLK_\d+__|\n\s*\n)/)
    .map(p => p.trim())
    .filter(p => p.length > 0)
    .map(p => {
      if (p.startsWith('__BLK_')) return p;
      return `<p style="margin-bottom:1.25rem;line-height:1.75;color:var(--p-sec);text-align:justify;font-size:0.875rem">${p.replace(/\\newline|\\\\/g, '<br/>')}</p>`;
    })
    .join('');

  body = body.replace(/__BLK_\d+__/g, m => blocks[m] || '');

  return { html: header + body, mathMap };
};

export const restoreMath = (html: string, mathMap: Record<string, string>): string =>
  html.replace(/__MTH_\d+__/g, m => mathMap[m] || m);

/** Count words in LaTeX source (strips commands, environments, math). */
export function countWords(latex: string): number {
  const stripped = latex
    .replace(/\\begin\{.*?\}|\\end\{.*?\}/g, '')
    .replace(/\\[a-zA-Z]+\*?(\{[^}]*\})+/g, (m, g) => g.replace(/[{}]/g, ''))
    .replace(/\\[a-zA-Z]+/g, '')
    .replace(/[\\{}$%&_^~#\[\]]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return stripped.length === 0 ? 0 : stripped.split(/\s+/).length;
}
