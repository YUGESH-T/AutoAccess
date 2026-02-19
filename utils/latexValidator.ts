
export interface ValidationIssue {
  type: 'error' | 'warning';
  message: string;
}

export const validateLatex = (latex: string): ValidationIssue[] => {
  const issues: ValidationIssue[] = [];

  if (!latex) return issues;

  // 1. Basic Document Structure Checks
  if (!latex.includes('\\documentclass')) {
    issues.push({ type: 'error', message: 'Missing \\documentclass declaration.' });
  }
  if (!latex.includes('\\begin{document}')) {
    issues.push({ type: 'error', message: 'Missing \\begin{document}.' });
  }
  if (!latex.includes('\\end{document}')) {
    issues.push({ type: 'error', message: 'Missing \\end{document}.' });
  }

  // 2. Balanced Braces Check
  let braceDepth = 0;
  for (let i = 0; i < latex.length; i++) {
    const char = latex[i];
    const isEscaped = i > 0 && latex[i - 1] === '\\' && (i === 1 || latex[i - 2] !== '\\');
    
    if (!isEscaped) {
      if (char === '{') braceDepth++;
      else if (char === '}') braceDepth--;
    }

    if (braceDepth < 0) {
      issues.push({ type: 'error', message: 'Found closing brace "}" without matching opening brace.' });
      break; 
    }
  }
  if (braceDepth > 0) {
    issues.push({ type: 'error', message: `Found ${braceDepth} unclosed brace(s) "{".` });
  }

  // 3. Environment Nesting Check
  const envStack: { name: string; index: number }[] = [];
  const envRegex = /\\(begin|end)\s*\{([^}]+)\}/g;
  let match;

  while ((match = envRegex.exec(latex)) !== null) {
    const type = match[1];
    const name = match[2];
    
    if (type === 'begin') {
      envStack.push({ name, index: match.index });
    } else {
      if (envStack.length === 0) {
        issues.push({ type: 'error', message: `Extra \\end{${name}} found.` });
      } else {
        const lastEnv = envStack.pop();
        if (lastEnv && lastEnv.name !== name) {
          issues.push({ 
            type: 'error', 
            message: `Environment mismatch: Expected \\end{${lastEnv.name}} but found \\end{${name}}.` 
          });
          envStack.push(lastEnv); 
        }
      }
    }
  }

  if (envStack.length > 0) {
    envStack.forEach(env => {
      issues.push({ type: 'error', message: `Unclosed environment: \\begin{${env.name}}.` });
    });
  }

  // 4. Forbidden \includegraphics command
  if (/\\includegraphics/i.test(latex)) {
    issues.push({ type: 'error', message: 'Forbidden \\includegraphics command — images are not supported.' });
  }

  // 5. Unclosed math delimiters
  // Strip math environments to avoid false positives with display math
  const stripped = latex
    .replace(/\$\$[\s\S]*?\$\$/g, '')   // remove $$...$$
    .replace(/\\\[[\s\S]*?\\\]/g, '')    // remove \[...\]
    .replace(/\\\([\s\S]*?\\\)/g, '');   // remove \(...\)

  // Count unescaped single $ signs (not $$)
  const singleDollarMatches = stripped.match(/(?<!\$)(?<!\\)\$(?!\$)/g);
  const singleDollarCount = singleDollarMatches ? singleDollarMatches.length : 0;
  if (singleDollarCount % 2 !== 0) {
    issues.push({ type: 'warning', message: `Odd number of inline math delimiters ($) — possible unclosed math expression.` });
  }

  // Check paired display math: \[ vs \]  and  \( vs \)
  const openBracketCount = (latex.match(/\\\[/g) || []).length;
  const closeBracketCount = (latex.match(/\\\]/g) || []).length;
  if (openBracketCount !== closeBracketCount) {
    issues.push({ type: 'warning', message: `Mismatched display math delimiters: ${openBracketCount} \\[ vs ${closeBracketCount} \\].` });
  }

  const openParenCount = (latex.match(/\\\(/g) || []).length;
  const closeParenCount = (latex.match(/\\\)/g) || []).length;
  if (openParenCount !== closeParenCount) {
    issues.push({ type: 'warning', message: `Mismatched inline math delimiters: ${openParenCount} \\( vs ${closeParenCount} \\).` });
  }

  // 6. Common math commands used outside math mode
  // Build a "non-math" version by stripping all math contexts
  const nonMath = latex
    .replace(/\$\$[\s\S]*?\$\$/g, ' ')
    .replace(/(?<!\\)\$[^$\n]+?(?<!\\)\$/g, ' ')
    .replace(/\\\[[\s\S]*?\\\]/g, ' ')
    .replace(/\\\([\s\S]*?\\\)/g, ' ')
    .replace(/\\begin\{(equation|align|gather|math|displaymath|multline)\*?\}[\s\S]*?\\end\{\1\*?\}/g, ' ');

  const mathCommands = ['\\frac', '\\sum', '\\int', '\\prod', '\\lim', '\\sqrt', '\\alpha', '\\beta', '\\gamma', '\\delta', '\\epsilon', '\\theta', '\\lambda', '\\mu', '\\sigma', '\\omega', '\\pi', '\\infty', '\\partial', '\\nabla', '\\rightarrow', '\\leftarrow', '\\Rightarrow', '\\Leftarrow', '\\leq', '\\geq', '\\neq', '\\approx', '\\cdot', '\\times', '\\div'];
  const foundOutside: string[] = [];
  for (const cmd of mathCommands) {
    const escaped = cmd.replace(/\\/g, '\\\\');
    if (new RegExp(escaped + '(?![a-zA-Z])').test(nonMath)) {
      foundOutside.push(cmd);
    }
  }
  if (foundOutside.length > 0) {
    const list = foundOutside.slice(0, 5).join(', ') + (foundOutside.length > 5 ? '...' : '');
    issues.push({ type: 'warning', message: `Math commands used outside math mode: ${list}. Wrap in $...$ or \\[...\\].` });
  }

  return issues;
};
