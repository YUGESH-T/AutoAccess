
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
    // Check for escaped characters
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
  // Match all \begin{...} and \end{...} tags
  const envRegex = /\\(begin|end)\s*\{([^}]+)\}/g;
  let match;

  while ((match = envRegex.exec(latex)) !== null) {
    const type = match[1]; // 'begin' or 'end'
    const name = match[2]; // environment name
    
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
          // Put the expected one back to avoid cascading errors in simple cases
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

  return issues;
};
