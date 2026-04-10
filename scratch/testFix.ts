import { cleanLatex } from '../lib/latexUtils.js';
import { validateLatex } from '../utils/latexValidator.js';

const truncatedInput = `
\\documentclass{article}
\\begin{document}
\\section{Introduction
Some \\textbf{text that never closes.
\\begin{itemize}
  \\item First item
  \\item Second item without closing environment
\\[ a = b
`;

const cleaned = cleanLatex(truncatedInput);

console.log("=== CLEANED OUTPUT ===");
console.log(cleaned);

console.log("\n=== VALIDATION ISSUES ===");
const issues = validateLatex(cleaned);
console.log(issues);
