# AI Assignment Protocol — YUGESH LABS

An AI-powered assignment assistant that generates complete, well-structured LaTeX documents from natural language questions using **Google Gemini 2.5 Flash**. Features live editing, in-browser PDF compilation, Overleaf integration, and a configurable MITS institutional cover page.

> **Obsidian Protocol UI** — brutalist dark theme with reactive liquid grid background, `#ff5500` accent, Oswald + JetBrains Mono typography.

---

## Features

| Feature | Description |
|---|---|
| **AI LaTeX Generation** | Enter a question → get a complete `.tex` document via Gemini 2.5 Flash with structured JSON output |
| **Context File Upload** | Attach a PDF or TXT (≤ 10 MB) as source material — sent as base64 inline data to Gemini |
| **Anti-Plagiarism Mode** | Toggle that instructs Gemini to paraphrase, cite sources, use `thebibliography`, and apply a near-black text color |
| **MITS Cover Page** | Configurable institutional cover page — student name, roll number, subject, dynamic question rows — injected into LaTeX at generation time |
| **Live LaTeX Editor** | Editable textarea with real-time structural validation (brace matching, environment nesting, document structure) |
| **In-Browser PDF Compile** | Sends LaTeX to `latexonline.cc` for pdflatex compilation; displays log on success or failure |
| **PDF & HTML Preview** | Full-screen modal with PDF iframe or LaTeX→HTML preview with MathJax rendering |
| **Open in Overleaf** | One-click POST to Overleaf for cloud editing |
| **Download Options** | Download `.tex`, `.pdf`, or `.zip` (both) via JSZip |
| **Copy to Clipboard** | One-click LaTeX source copy with visual feedback |
| **Request Cancellation** | AbortController-based cancel button — abort mid-generation at any time |
| **Sample Question** | Pre-filled photosynthesis question for quick testing |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19 · TypeScript 5.8 · Vite 6 |
| Styling | Tailwind CSS (CDN) · Oswald + JetBrains Mono (Google Fonts) |
| AI Model | Google Gemini 2.5 Flash (`@google/genai` SDK, structured JSON schema) |
| Math Rendering | MathJax 3 (CDN) |
| HTML Sanitization | DOMPurify 3 |
| ZIP Creation | JSZip 3 (CDN) |
| PDF Compilation | latexonline.cc (remote pdflatex) |
| Deployment | Vercel (serverless function) |

---

## Architecture

The API key **never** reaches the browser. Both local dev and production use the same client code — only the backend differs:

```
┌─────────┐     POST /api/generate     ┌──────────────────┐     SDK     ┌────────────┐
│ Browser  │ ──────────────────────────▶│  Server Proxy    │ ──────────▶│ Gemini API │
│ (React)  │◀────────────── JSON ──────│  (Vite / Vercel) │◀───────────│            │
└─────────┘                            └──────────────────┘            └────────────┘
```

- **Local dev** (`npm run dev`): Vite plugin at `server/geminiProxy.ts` intercepts `/api/generate`
- **Production** (Vercel): Serverless function at `api/generate.ts` handles `/api/generate`

---

## Getting Started

### Prerequisites

- Node.js 18+
- A [Google AI Studio](https://aistudio.google.com/) API key

### Local Development

```bash
# 1. Clone the repo
git clone <your-repo-url>
cd aa-3

# 2. Install dependencies
npm install

# 3. Create .env in the project root
echo GEMINI_API_KEY=your_key_here > .env

# 4. Start the dev server
npm run dev
```

The app opens at **http://localhost:3000**.

### Build for Production

```bash
npm run build     # outputs static files to dist/
npm run preview   # preview the build locally (API calls won't work — use Vercel)
```

---

## Deploy to Vercel

1. Push the repo to GitHub
2. Go to [vercel.com](https://vercel.com) → **Import** your repository
3. **Framework Preset**: Vite
4. **Environment Variables**: Add `GEMINI_API_KEY` = your API key
5. **Deploy** ✅

The `vercel.json` SPA rewrites and `api/generate.ts` serverless function are auto-detected — zero additional config.

### Vercel Free Tier Limits

| Limit | Value |
|---|---|
| Function duration | 60 seconds max (`maxDuration: 60` is set) |
| Request body | 4.5 MB (affects large PDF uploads) |
| Bandwidth | 100 GB/month |
| Function invocations | 100,000/month |

---

## Project Structure

```
├── api/
│   └── generate.ts          # Vercel serverless function (production)
├── components/
│   ├── icons.tsx             # SVG icon library
│   ├── LiquidGrid.tsx        # Animated canvas background
│   ├── PreviewModal.tsx      # PDF/HTML preview modal
│   ├── QuestionForm.tsx      # Input form + cover page config
│   └── ResultDisplay.tsx     # LaTeX editor + actions + downloads
├── hooks/
│   └── useCopyToClipboard.ts # Clipboard hook with auto-reset
├── server/
│   └── geminiProxy.ts        # Vite dev-server proxy plugin
├── services/
│   ├── geminiService.ts      # Client-side fetch to /api/generate
│   └── latexCompiler.ts      # latexonline.cc PDF compilation
├── utils/
│   ├── coverPage.ts          # Cover page LaTeX injection
│   └── latexValidator.ts     # Structural LaTeX validation
├── App.tsx                   # Root component
├── index.html                # Entry HTML + CDN deps
├── index.tsx                 # React entry point
├── types.ts                  # TypeScript interfaces
├── vite.config.ts            # Vite config + dev proxy plugin
├── vercel.json               # Vercel SPA rewrites
├── tsconfig.json             # TypeScript (strict mode)
└── .env                      # GEMINI_API_KEY (git-ignored)
```

---

## Environment Variables

| Variable | Where | Description |
|---|---|---|
| `GEMINI_API_KEY` | `.env` (local) / Vercel dashboard (prod) | Google AI Studio API key — **never** exposed to the client bundle |

---

## Security & Quality

- **No client-side API key** — proxied server-side in both dev and production
- **XSS prevention** — DOMPurify sanitizes all HTML before `dangerouslySetInnerHTML`
- **Accessible** — ARIA roles, `aria-pressed` toggles, `aria-live` regions, focus trap in modal
- **Strict TypeScript** — `strict: true` enabled, zero errors
- **Error handling** — inline error banners (no `alert()`/`confirm()`), `.catch()` on all promises
- **Memory-safe animation** — `requestAnimationFrame` tracked via `useRef`, properly cancelled on unmount
- **Cancellable requests** — `AbortController` with 2-minute timeout

---

## License

MIT