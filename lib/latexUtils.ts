/**
 * Scopes the cleanup to the document body to avoid breaking the preamble.
 */
function splitDocument(input: string) {
  const idx = input.indexOf('\\begin{document}');
  if (idx === -1) return { pre: '', body: input };
  const pivot = idx + '\\begin{document}'.length;
  return {
    pre: input.slice(0, pivot),
    body: input.slice(pivot),
  };
}

/** Only replaces literal backslash-n, not real newlines. */
export const fixNewlines = (s: string) => s.replace(/\\n/g, '\n');

/** Standardizes all line endings to LF. */
export const normalizeLineEndings = (s: string) =>
  s.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

/** Trims ONLY leading partial commands at the very end of the string. */
export const removeIncompleteCommands = (s: string) =>
  s.replace(/\\[a-zA-Z]*$/, '');

/** Closes unmatched { braces. */
export const closeUnmatchedBraces = (s: string) => {
  let depth = 0;
  for (let i = 0; i < s.length; i++) {
    const char = s[i];
    const isEscaped = i > 0 && s[i - 1] === '\\' && (i === 1 || s[i - 2] !== '\\');
    if (!isEscaped) {
      if (char === '{') depth++;
      else if (char === '}') depth--;
    }
  }
  return depth > 0 ? s + '}'.repeat(depth) : s;
};

/** Closes unclosed LaTeX environments (e.g., \begin{itemize}) using a safe whitelist. */
export const closeUnclosedEnvironments = (s: string) => {
  const envStack: string[] = [];
  const envRegex = /\\(begin|end)\s*\{([^}]+)\}/g;
  const SAFE_ENVIRONMENTS = new Set(['itemize', 'enumerate', 'align', 'equation', 'description']);
  let match;
  
  while ((match = envRegex.exec(s)) !== null) {
    const type = match[1];
    const name = match[2];
    if (type === 'begin') {
      envStack.push(name);
    } else {
      if (envStack.length > 0 && envStack[envStack.length - 1] === name) {
        envStack.pop();
      }
    }
  }
  
  let result = s;
  // Pop backwards and close them only if they are safe
  while (envStack.length > 0) {
    const name = envStack.pop()!;
    if (SAFE_ENVIRONMENTS.has(name)) {
      result += `\n\\end{${name}}`;
    }
  }
  return result;
};

/** Closes unmatched \[ display math environments using robust backslash counting. */
export const fixMathBlocks = (s: string) => {
  const openMatch = s.match(/(^|[^\\])(\\\\)*\\\[/g);
  const closeMatch = s.match(/(^|[^\\])(\\\\)*\\\]/g);
  const open = openMatch ? openMatch.length : 0;
  const close = closeMatch ? closeMatch.length : 0;
  
  if (open > close) {
    const missing = open - close;
    return s + '\n\\]'.repeat(missing);
  }
  return s;
};

/** Balances inline $ math environments. */
export const fixInlineMath = (s: string) => {
  const count = (s.match(/(?<!\\)\$/g) || []).length;
  if (count % 2 !== 0) {
    return s + '$';
  }
  return s;
};

/** Prevents runaway whitespace/blank lines. */
export const collapseBlankLines = (s: string) =>
  s.replace(/\n{3,}/g, '\n\n');

/** Ensures exactly one \end{document} at the end of the file. */
export const ensureDocumentClosed = (s: string) => {
  const withoutDup = s.replace(/\\end\{document\}\s*$/g, '');
  return withoutDup.trimEnd() + '\n\\end{document}\n';
};

// ── Document wrapper (safety net for minimal snippets) ─────────────────────────
export function ensureDocumentWrapper(code: string): string {
  if (/\\documentclass/i.test(code)) return code;
  return [
    '\\documentclass[12pt]{article}',
    '\\usepackage[margin=1in]{geometry}',
    '\\usepackage{amsmath,amssymb,graphicx,enumitem}',
    '\\usepackage{xcolor}',
    '\\setlength{\\parskip}{0.5em}',
    '\\setlength{\\parindent}{0pt}',
    '\\begin{document}',
    code,
    '\\end{document}',
  ].join('\n');
}

// ── Combined pipeline ─────────────────────────────────────────────────────────
/**
 * Full LaTeX cleanup pipeline.
 * deterministic, ordered, and idempotent.
 */
export function cleanLatex(input: string): string {
  // 1. Initial cleanup (fences, etc.)
  const sanitized = input
    .replace(/^```(?:latex|tex|plaintext)?\s*\n?/gim, '')
    .replace(/^```\s*$/gim, '')
    .trim();

  // 2. Split to protect preamble
  const { pre, body } = splitDocument(sanitized);

  // 3. Process body
  let b = body;
  b = fixNewlines(b);
  b = normalizeLineEndings(b);
  b = removeIncompleteCommands(b);
  b = closeUnmatchedBraces(b);
  b = closeUnclosedEnvironments(b);
  b = fixInlineMath(b);
  b = fixMathBlocks(b);
  b = collapseBlankLines(b);

  // 4. Merge and final closure
  const merged = (pre ? pre + '\n' : '') + b;
  return ensureDocumentClosed(merged);
}
