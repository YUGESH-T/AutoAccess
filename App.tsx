
import React, { useState, useCallback, useRef } from 'react';
import { QuestionForm } from './components/QuestionForm';
import { ResultDisplay } from './components/ResultDisplay';
import { geminiService } from './services/geminiService';
import type { GenerationResult, GeminiLatexResponse, ContextFile, CoverPageConfig } from './types';
import { CpuIcon } from './components/icons';
import { injectCoverPage } from './utils/coverPage';
import LiquidGrid from './components/LiquidGrid';

// --- MAIN APP ---

const App: React.FC = () => {
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [loadingMessage, setLoadingMessage] = useState<string>('');
  const [result, setResult] = useState<Partial<GenerationResult> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Easter Egg States
  const [eggClicks, setEggClicks] = useState(0);
  const [showSurprise, setShowSurprise] = useState(false);
  const [titleText, setTitleText] = useState("AI ASSIGNMENT PROTOCOL");

  const handleLogoClick = () => {
    setEggClicks((prev) => {
      const newCount = prev + 1;
      if (newCount === 5) {
        setShowSurprise(true);
        setTimeout(() => {
            setShowSurprise(false);
            setEggClicks(0);
        }, 3000);
        return 0;
      }
      return newCount;
    });
  };

  const handleTitleDoubleClick = () => {
    setTitleText("ARCHITECT YUGESH");
    setTimeout(() => setTitleText("AI ASSIGNMENT PROTOCOL"), 2000);
  };

  const handleGenerate = useCallback(async (userQuestion: string, contextFile?: ContextFile, removePlagiarism: boolean = false, coverPage?: CoverPageConfig) => {
    if (!userQuestion.trim()) {
      setError("ERR: INPUT_REQUIRED");
      return;
    }

    // Cancel any in-flight request
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setIsLoading(true);
    setResult({}); 
    setError(null);

    try {
      setLoadingMessage(contextFile ? "ANALYZING_PAYLOAD..." : "INITIATING_SEQUENCE...");
      const latexResponseString = await geminiService.generateLatex(userQuestion, contextFile, removePlagiarism, controller.signal);
      
      let parsedResponse: GeminiLatexResponse;
      try {
        parsedResponse = JSON.parse(latexResponseString);
      } catch (e) {
        console.error("JSON Parse Error:", e, latexResponseString);
        throw new Error("ERR: MALFORMED_RESPONSE_PACKET");
      }

      let { latex_code } = parsedResponse;

      // Inject MITS cover page if enabled
      if (coverPage?.enabled) {
        latex_code = injectCoverPage(latex_code, coverPage);
      }

      setResult({
        latexCode: latex_code,
      });

    } catch (err: any) {
      if (err.name === 'AbortError') {
        setError('GENERATION_CANCELLED');
      } else {
        console.error(err);
        setError(err.message || "ERR: UNKNOWN_EXCEPTION");
      }
      setResult(null);
    } finally {
      setIsLoading(false);
      setLoadingMessage('');
      abortRef.current = null;
    }
  }, []);

  const handleCancel = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const handleLatexUpdate = useCallback((newLatex: string) => {
    setResult((prev) => {
        if (!prev) return prev;
        // Invalidate cached PDF when LaTeX source is edited
        return { ...prev, latexCode: newLatex, pdfBlob: undefined };
    });
  }, []);

  const handlePdfCompiled = useCallback((pdfBlob: Blob) => {
    setResult((prev) => {
        if (!prev) return prev;
        return { ...prev, pdfBlob };
    });
  }, []);

  return (
    <div className="relative min-h-screen w-full bg-void text-text-main font-mono overflow-x-hidden selection:bg-accent selection:text-black">
      <LiquidGrid />

      {/* Watermark */}
      <div aria-hidden="true" className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-[15vw] font-oswald font-bold text-white opacity-[0.02] pointer-events-none whitespace-nowrap z-0 select-none">
        YUGESH LABS
      </div>

      {/* Yugesh Protocol Surprise Overlay */}
      {showSurprise && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-void/95 backdrop-blur-sm animate-fade-in text-center select-none">
            <h2 className="text-9xl font-oswald font-black text-accent tracking-tighter mb-4 scale-150 transform transition-transform duration-700 animate-glitch">
                YUGESH
            </h2>
            <p className="text-text-muted font-mono tracking-[1em] text-sm animate-pulse border-t border-b border-accent py-2">SYSTEM_OVERRIDE_ACTIVE</p>
        </div>
      )}

      <div className="relative z-10 container mx-auto p-4 sm:p-6 lg:p-8 flex flex-col items-center max-w-6xl">
        
        {/* Header */}
        <header className="w-full flex flex-col items-center justify-center relative mb-16 mt-8">
          <h1 
            onDoubleClick={handleTitleDoubleClick}
            className="text-5xl sm:text-8xl font-oswald font-bold text-white tracking-tighter mb-4 text-center select-none uppercase"
          >
            {titleText}
          </h1>
          <div className="w-24 h-1 bg-accent mb-6"></div>
          {/* Tagline removed */}
        </header>

        {/* Main Content Area */}
        <main className="w-full">
          <div className="bg-panel backdrop-blur-xl border border-border p-1 sm:p-2 relative overflow-hidden">
            {/* Decorative Corner Markers */}
            <div className="absolute top-0 left-0 w-2 h-2 border-t-2 border-l-2 border-accent"></div>
            <div className="absolute top-0 right-0 w-2 h-2 border-t-2 border-r-2 border-accent"></div>
            <div className="absolute bottom-0 left-0 w-2 h-2 border-b-2 border-l-2 border-accent"></div>
            <div className="absolute bottom-0 right-0 w-2 h-2 border-b-2 border-r-2 border-accent"></div>

            <div className="p-6 sm:p-10">
                <QuestionForm onSubmit={handleGenerate} onCancel={handleCancel} isLoading={isLoading} loadingMessage={loadingMessage} />

                {error && (
                <div role="alert" aria-live="assertive" className="mt-8 p-4 bg-red-900/10 border border-red-500 text-red-500 flex items-center gap-4">
                    <div className="font-oswald font-bold text-xl">ERR</div>
                    <div className="w-px h-8 bg-red-500/50"></div>
                    <div className="text-xs font-mono uppercase tracking-wider">{error}</div>
                </div>
                )}

                {result && (
                    <div className="mt-16 pt-10 border-t border-border relative">
                        <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-void px-4 text-xs text-text-muted tracking-widest border border-border">OUTPUT_STREAM</div>
                        <ResultDisplay 
                            result={result} 
                            isLoading={isLoading} 
                            onLatexChange={handleLatexUpdate}
                            onPdfCompiled={handlePdfCompiled}
                        />
                    </div>
                )}
            </div>
          </div>
        </main>

        <footer className="w-full text-center mt-20 mb-8 text-[10px] text-text-muted tracking-[0.2em] uppercase group flex items-center justify-center gap-4 opacity-50 hover:opacity-100 transition-opacity">
           <CpuIcon className="w-4 h-4 text-accent" />
           <span>SYSTEM ONLINE</span>
           <span className="text-accent">///</span>
           <span className="group-hover:text-white transition-colors">OBSIDIAN PROTOCOL</span>
           <span className="hidden group-hover:inline text-accent font-bold pl-2">ARCHITECT: YUGESH</span>
        </footer>
      </div>
    </div>
  );
};

export default App;
