import { cleanLatex } from './lib/latexUtils.js';

const testCases = [
  {
    name: 'Literal \\n conversion',
    input: '\\section{Test}\\nThis is a line.\\nSecond line.',
    expected: /Test\}\nThis is a line\.\nSecond line\./
  },
  {
    name: 'Truncated tail command',
    input: '\\documentclass{article}\\begin{document}\\section{Intro}\\subsectio',
    expected: /\\section\{Intro\}\s*\\end\{document\}/
  },
  {
    name: 'Unclosed math block',
    input: '\\begin{document}\\[ E=mc^2',
    expected: /mc\^2\s*\\\]\s*\\end\{document\}/
  },
  {
    name: 'Fenced JSON cleanup',
    input: '```json\n{ "latex": "\\\\section{Code}" }\n```',
    expected: /\\section\{Code\}/
  },
  {
    name: 'Missing closure',
    input: '\\begin{document}Hello world',
    expected: /Hello world\s*\\end\{document\}/
  }
];

console.log('--- STARTING LATEX HARDENING TESTS ---');
let passed = 0;

testCases.forEach((tc) => {
  try {
    const output = cleanLatex(tc.input);
    const isMatch = tc.expected.test(output);
    if (isMatch) {
      console.log(`[PASS] ${tc.name}`);
      passed++;
    } else {
      console.error(`[FAIL] ${tc.name}`);
      console.error('  Output:', JSON.stringify(output));
    }
  } catch (err) {
    console.error(`[ERROR] ${tc.name}:`, err.message);
  }
});

console.log(`\nTests complete: ${passed}/${testCases.length} passed.`);
if (passed === testCases.length) {
  process.exit(0);
} else {
  process.exit(1);
}
