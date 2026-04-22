interface LatexCommandToken {
  type: 'begin' | 'end';
  envName: string;
  raw: string;
  start: number;
  end: number;
  malformedDuplicateEnd: boolean;
  normalizedName?: string;
}

export interface LatexStructureValidation {
  isValid: boolean;
  errors: string[];
}

export interface LatexFixResult {
  fixedLatex: string;
  fixes: string[];
}

function isEscaped(input: string, index: number): boolean {
  let backslashes = 0;
  let cursor = index - 1;

  while (cursor >= 0 && input[cursor] === '\\') {
    backslashes++;
    cursor--;
  }

  return backslashes % 2 === 1;
}

function splitDocument(input: string) {
  const idx = input.indexOf('\\begin{document}');
  if (idx === -1) return { pre: '', body: input };
  const pivot = idx + '\\begin{document}'.length;
  return {
    pre: input.slice(0, pivot),
    body: input.slice(pivot),
  };
}

function parseBracedCommand(
  input: string,
  start: number,
  type: 'begin' | 'end',
): LatexCommandToken | null {
  const prefix = `\\${type}{`;
  if (!input.startsWith(prefix, start)) {
    return null;
  }

  let cursor = start + prefix.length;
  let depth = 1;

  while (cursor < input.length && depth > 0) {
    const char = input[cursor];
    if (!isEscaped(input, cursor)) {
      if (char === '{') depth++;
      else if (char === '}') depth--;
    }
    cursor++;
  }

  if (depth !== 0) {
    return null;
  }

  const raw = input.slice(start, cursor);
  const envName = input.slice(start + prefix.length, cursor - 1).trim();
  const duplicateEndMatch = type === 'end' ? /^end\{(.+)\}$/.exec(envName) : null;

  return {
    type,
    envName,
    raw,
    start,
    end: cursor,
    malformedDuplicateEnd: duplicateEndMatch !== null,
    normalizedName: duplicateEndMatch?.[1]?.trim(),
  };
}

function tokenizeLatexCommands(input: string): LatexCommandToken[] {
  const tokens: LatexCommandToken[] = [];
  let cursor = 0;

  while (cursor < input.length) {
    const char = input[cursor];

    if (char === '%' && !isEscaped(input, cursor)) {
      while (cursor < input.length && input[cursor] !== '\n') {
        cursor++;
      }
      continue;
    }

    if (char === '\\') {
      const beginToken = parseBracedCommand(input, cursor, 'begin');
      if (beginToken) {
        tokens.push(beginToken);
        cursor = beginToken.end;
        continue;
      }

      const endToken = parseBracedCommand(input, cursor, 'end');
      if (endToken) {
        tokens.push(endToken);
        cursor = endToken.end;
        continue;
      }
    }

    cursor++;
  }

  return tokens;
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
    if (!isEscaped(s, i)) {
      if (char === '{') depth++;
      else if (char === '}') depth--;
    }

    if (depth < 0) {
      depth = 0;
    }
  }
  return depth > 0 ? s + '}'.repeat(depth) : s;
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
  const withoutTrailing = s.replace(/\s*\\end\{document\}\s*$/g, '');
  return withoutTrailing.trimEnd() + '\n\\end{document}\n';
};

export function validateLatexStructure(latex: string): LatexStructureValidation {
  const errors: string[] = [];
  const envStack: string[] = [];
  const tokens = tokenizeLatexCommands(latex);

  for (const token of tokens) {
    if (token.type === 'begin') {
      envStack.push(token.envName);
      continue;
    }

    if (token.malformedDuplicateEnd) {
      errors.push(`Malformed ending detected: ${token.raw}.`);
    }

    const target = token.normalizedName ?? token.envName;

    if (envStack.length === 0) {
      errors.push(`Extra \\end{${target}} found.`);
      continue;
    }

    const expected = envStack[envStack.length - 1];

    if (target === 'document' && expected !== 'document') {
      errors.push(`Environment mismatch: Expected \\end{${expected}} but found \\end{document}.`);
      continue;
    }

    if (expected !== target) {
      errors.push(`Environment mismatch: Expected \\end{${expected}} but found \\end{${target}}.`);
      continue;
    }

    envStack.pop();
  }

  for (let i = envStack.length - 1; i >= 0; i--) {
    errors.push(`Unclosed environment: \\begin{${envStack[i]}}.`);
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

export function fixLatex(latex: string): LatexFixResult {
  const tokens = tokenizeLatexCommands(latex);
  const fixes: string[] = [];
  const envStack: string[] = [];
  let output = '';
  let lastIndex = 0;
  let documentWasOpened = false;
  let sawDocumentEnd = false;

  for (const token of tokens) {
    output += latex.slice(lastIndex, token.start);

    if (token.type === 'begin') {
      output += token.raw;
      envStack.push(token.envName);
      if (token.envName === 'document') {
        documentWasOpened = true;
      }
      lastIndex = token.end;
      continue;
    }

    let target = token.envName;
    let rendered = token.raw;

    if (token.malformedDuplicateEnd && token.normalizedName) {
      target = token.normalizedName;
      rendered = `\\end{${target}}`;
      fixes.push(`Normalized malformed ending ${token.raw} to \\end{${target}}.`);
    }

    if (target === 'document') {
      if (sawDocumentEnd) {
        fixes.push('Removed duplicate \\end{document}.');
        lastIndex = token.end;
        continue;
      }

      sawDocumentEnd = true;

      while (envStack.length > 0 && envStack[envStack.length - 1] !== 'document') {
        const openEnv = envStack.pop()!;
        output += `\n\\end{${openEnv}}`;
        fixes.push(`Inserted missing \\end{${openEnv}} before \\end{document}.`);
      }

      if (envStack.length > 0 && envStack[envStack.length - 1] === 'document') {
        envStack.pop();
      } else {
        fixes.push('Removed unmatched \\end{document}.');
      }

      lastIndex = token.end;
      continue;
    }

    if (envStack.length === 0) {
      fixes.push(`Removed unmatched \\end{${target}}.`);
      lastIndex = token.end;
      continue;
    }

    const expected = envStack[envStack.length - 1];
    if (expected === target) {
      envStack.pop();
      output += rendered;
      lastIndex = token.end;
      continue;
    }

    const matchingIndex = envStack.lastIndexOf(target);
    if (matchingIndex !== -1) {
      while (envStack.length > 0 && envStack[envStack.length - 1] !== target) {
        const openEnv = envStack.pop()!;
        output += `\n\\end{${openEnv}}`;
        fixes.push(`Inserted missing \\end{${openEnv}} before \\end{${target}}.`);
      }

      envStack.pop();
      output += rendered;
      lastIndex = token.end;
      continue;
    }

    fixes.push(`Removed unmatched \\end{${target}}.`);
    lastIndex = token.end;
  }

  output += latex.slice(lastIndex);

  while (envStack.length > 0) {
    const openEnv = envStack.pop()!;
    if (openEnv === 'document') {
      documentWasOpened = true;
      continue;
    }
    output += `\n\\end{${openEnv}}`;
    fixes.push(`Inserted missing \\end{${openEnv}} at the end of the document.`);
  }

  if (documentWasOpened || sawDocumentEnd || output.includes('\\begin{document}')) {
    output = ensureDocumentClosed(output);
  }

  return {
    fixedLatex: collapseBlankLines(output),
    fixes,
  };
}

export function ensureDocumentWrapper(code: string): string {
  if (/\\documentclass/i.test(code)) return code;
  if (/\\begin\{document\}/i.test(code)) {
    return [
      '\\documentclass[12pt]{article}',
      '\\usepackage[margin=1in]{geometry}',
      '\\usepackage{amsmath,amssymb,graphicx,enumitem}',
      '\\usepackage{xcolor}',
      '\\setlength{\\parskip}{0.5em}',
      '\\setlength{\\parindent}{0pt}',
      code,
    ].join('\n');
  }
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

/**
 * Full LaTeX cleanup pipeline.
 * This normalizes formatting and obvious truncation artifacts before the
 * structure validator / repair pass runs.
 */
export function cleanLatex(input: string): string {
  const sanitized = input
    .replace(/^```(?:latex|tex|plaintext)?\s*\n?/gim, '')
    .replace(/^```\s*$/gim, '')
    .trim();

  const { pre, body } = splitDocument(sanitized);

  let normalizedBody = body;
  normalizedBody = fixNewlines(normalizedBody);
  normalizedBody = normalizeLineEndings(normalizedBody);
  normalizedBody = removeIncompleteCommands(normalizedBody);
  normalizedBody = closeUnmatchedBraces(normalizedBody);
  normalizedBody = fixInlineMath(normalizedBody);
  normalizedBody = fixMathBlocks(normalizedBody);
  normalizedBody = collapseBlankLines(normalizedBody);

  return (pre ? pre + '\n' : '') + normalizedBody.trim();
}
