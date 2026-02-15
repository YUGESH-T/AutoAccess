import type { CoverPageConfig } from '../types';

/**
 * Builds the MITS assignment cover page LaTeX body (everything between \begin{document} and \newpage).
 */
function buildCoverPageBody(config: CoverPageConfig): string {
  const questionRows = config.questions
    .map((q, i) => `\\textbf{Q${i + 1}:} ${q} \\\\[1.5cm] \\hline`)
    .join('\n');

  return `
\\begin{center}
\\textbf{\\Large MADANAPALLE INSTITUTE OF TECHNOLOGY \\& SCIENCE}\\\\
\\textbf{(UGC-AUTONOMOUS INSTITUTION)}\\\\
Affiliated to JNTUA, Ananthapuramu \\& Approved by AICTE, New Delhi\\\\
NAAC Accredited with A+ Grade\\\\
NBA Accredited - B.Tech. (CIVIL, CSE, ECE, EEE, MECH), MBA \\& MCA\\\\[0.4cm]

\\textbf{\\large DEPARTMENT OF COMPUTER SCIENCE \\& ENGINEERING - DATA SCIENCE}\\\\[0.5cm]

\\textbf{\\Large Assignment Submission Details}\\\\
AY-2025--26
\\end{center}

\\vspace{0.8cm}

\\renewcommand{\\arraystretch}{1.5}

\\begin{center}
\\begin{tabular}{|p{6cm}|p{8cm}|}
\\hline
\\textbf{Subject} & ${escapeLatex(config.subject)} \\\\ \\hline
\\textbf{Subject Code} & ${escapeLatex(config.subjectCode)} \\\\ \\hline
\\textbf{Subject Name} & ${escapeLatex(config.subjectName)} \\\\ \\hline
\\textbf{Name of the Student} & ${escapeLatex(config.studentName)} \\\\ \\hline
\\textbf{Roll No.} & ${escapeLatex(config.rollNo)} \\\\ \\hline
\\textbf{Year / Section} & ${escapeLatex(config.yearSection)} \\\\ \\hline
\\textbf{Assignment No.} & ${escapeLatex(config.assignmentNo)} \\\\ \\hline
\\textbf{Marks (Max 3)} & \\\\ \\hline
\\textbf{Assignment Moodle Uploaded Date} & \\\\ \\hline
\\textbf{Faculty Sign with Name \\& Date} & \\\\ \\hline
\\end{tabular}
\\end{center}

\\vspace{1cm}

\\renewcommand{\\arraystretch}{2}

\\begin{center}
\\begin{tabular}{|p{14cm}|}
\\hline
${questionRows}
\\end{tabular}
\\end{center}

\\newpage
`;
}

/**
 * Escapes special LaTeX characters in user-supplied strings.
 */
function escapeLatex(text: string): string {
  return text
    .replace(/\\/g, '\\textbackslash{}')
    .replace(/&/g, '\\&')
    .replace(/%/g, '\\%')
    .replace(/\$/g, '\\$')
    .replace(/#/g, '\\#')
    .replace(/_/g, '\\_')
    .replace(/\{/g, '\\{')
    .replace(/\}/g, '\\}')
    .replace(/~/g, '\\textasciitilde{}')
    .replace(/\^/g, '\\textasciicircum{}');
}

/**
 * Ensures required packages for the cover page table are present in the preamble.
 */
function ensurePreamblePackages(latex: string): string {
  const requiredPackages = ['array', 'geometry'];
  let result = latex;

  for (const pkg of requiredPackages) {
    // Check if package is already included (handles options like \usepackage[opts]{geometry})
    const pkgRegex = new RegExp(`\\\\usepackage(\\[[^\\]]*\\])?\\{[^}]*\\b${pkg}\\b[^}]*\\}`, 'i');
    if (!pkgRegex.test(result)) {
      // Insert before \begin{document}
      result = result.replace(
        /\\begin\{document\}/,
        `\\usepackage{${pkg}}\n\\begin{document}`
      );
    }
  }

  return result;
}

/**
 * Injects the MITS cover page into a complete LaTeX document.
 * Inserts the cover page body right after \begin{document}.
 */
export function injectCoverPage(fullLatex: string, config: CoverPageConfig): string {
  if (!config.enabled) return fullLatex;

  const coverBody = buildCoverPageBody(config);

  // Ensure needed packages
  let latex = ensurePreamblePackages(fullLatex);

  // Insert cover page body right after \begin{document}
  latex = latex.replace(
    /\\begin\{document\}/,
    `\\begin{document}\n${coverBody}`
  );

  return latex;
}
