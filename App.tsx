
import React, { useState, useCallback, useRef, useEffect } from 'react';
import gsap from 'gsap';
import { QuestionForm } from './components/QuestionForm';
import { ResultDisplay } from './components/ResultDisplay';
import { geminiService } from './services/geminiService';
import type { GenerationResult, ContextFile, CoverPageConfig, HistoryItem } from './types';
import { ZapIcon, HistoryIcon } from './components/icons';
import { injectCoverPage } from './utils/coverPage';
import ParticleField from './components/ParticleField';
import { useHistory } from './hooks/useHistory';
import { HistorySidebar } from './components/HistorySidebar';

// Floating decorative chip data
const FLOATING_CHIPS = [
  { label: 'LaTeX', icon: '⟨⟩', position: 'top-24 left-[8%] rotate-[-3deg]', delay: 0 },
  { label: 'AI Engine', icon: '✦', position: 'top-36 right-[6%] rotate-[2deg]', delay: 0.8 },
  { label: 'PDF Ready', icon: '◆', position: 'bottom-[22%] left-[5%] rotate-[1deg]', delay: 1.2 },
];

type GenerateRequestState = {
  userQuestion: string;
  contextFile?: ContextFile;
  removePlagiarism: boolean;
  coverPage?: CoverPageConfig;
  temperature: number;
};

// --- MAIN APP ---

const App: React.FC = () => {
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [loadingMessage, setLoadingMessage] = useState<string>('');
  const [result, setResult] = useState<Partial<GenerationResult> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const lastGenerateRequestRef = useRef<GenerateRequestState | null>(null);

  // Persistence & History
  const { history, addEntry, deleteEntry, clearHistory, getLatestEntry } = useHistory();
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const hasRestored = useRef(false);

  // Toast notification
  const [toast, setToast] = useState<{ message: string, type: 'success' | 'error' | 'info' } | null>(null);
  const toastRef = useRef<HTMLDivElement>(null);

  const showToast = useCallback((message: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToast({ message, type });
    setTimeout(() => {
      setToast(null);
    }, 3000);
  }, []);

  // Easter Egg States
  const [eggClicks, setEggClicks] = useState(0);
  const [showSurprise, setShowSurprise] = useState(false);

  // Online status
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  // GSAP refs
  const headerRef = useRef<HTMLDivElement>(null);
  const mainRef = useRef<HTMLDivElement>(null);
  const footerRef = useRef<HTMLElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);
  const inputCardRef = useRef<HTMLDivElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const heroRef = useRef<HTMLDivElement>(null);
  const dividerRef = useRef<HTMLDivElement>(null);
  const chipsRef = useRef<HTMLDivElement>(null);

  // Magnetic title state
  const [titleTransform, setTitleTransform] = useState({ x: 0, y: 0 });
  const heroAreaRef = useRef<HTMLDivElement>(null);

  // Magnetic title mouse handler
  const handleHeroMouseMove = useCallback((e: React.MouseEvent) => {
    if (!heroAreaRef.current) return;
    const rect = heroAreaRef.current.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = e.clientX - cx;
    const dy = e.clientY - cy;
    const maxMove = 10;
    setTitleTransform({
      x: Math.max(-maxMove, Math.min(maxMove, dx * 0.08)),
      y: Math.max(-maxMove, Math.min(maxMove, dy * 0.08)),
    });
  }, []);

  const handleHeroMouseLeave = useCallback(() => {
    setTitleTransform({ x: 0, y: 0 });
  }, []);

  // Page-load GSAP entrance — cinematic staggered reveal (ARC Club-style)
  useEffect(() => {
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReduced) return;

    const tl = gsap.timeline({ defaults: { ease: 'power4.out' } });

    tl.fromTo(headerRef.current,
      { opacity: 0, y: -10 },
      { opacity: 1, y: 0, duration: 0.6 }
    )
      // Hero title fades up with letter-spacing animation
      .fromTo(heroRef.current,
        { opacity: 0, y: 40 },
        { opacity: 1, y: 0, duration: 1.2 },
        '-=0.3'
      )
      // Accent divider draws in from center
      .fromTo(dividerRef.current,
        { scaleX: 0, opacity: 0 },
        { scaleX: 1, opacity: 1, duration: 0.6 },
        '-=0.6'
      )
      // Main content rises + scales with blur clear
      .fromTo(mainRef.current,
        { opacity: 0, y: 30, scale: 0.96, filter: 'blur(4px)' },
        { opacity: 1, y: 0, scale: 1, filter: 'blur(0px)', duration: 0.8 },
        '-=0.4'
      )
      // Footer fades gently
      .fromTo(footerRef.current,
        { opacity: 0, y: 10 },
        { opacity: 1, y: 0, duration: 0.5 },
        '-=0.3'
      );

    // Floating chips entrance + infinite yoyo float
    if (chipsRef.current) {
      const chips = chipsRef.current.querySelectorAll('.floating-chip');
      gsap.fromTo(chips,
        { y: 20, opacity: 0, scale: 0.9 },
        { y: 0, opacity: 1, scale: 1, duration: 1.2, stagger: 0.15, delay: 1.0, ease: 'power4.out' }
      );
      gsap.to(chips, {
        y: '+=8',
        duration: 3.5,
        repeat: -1,
        yoyo: true,
        ease: 'sine.inOut',
        stagger: { each: 0.4, from: 'random' },
        delay: 2.2,
      });
    }

    // Ambient pulse on the accent divider
    gsap.to(dividerRef.current, {
      opacity: 0.4,
      duration: 2,
      repeat: -1,
      yoyo: true,
      ease: 'sine.inOut',
      delay: 2.5,
    });

    return () => { tl.kill(); };
  }, []);

  // Restore Last Session on mount
  useEffect(() => {
    if (hasRestored.current) return;
    const last = getLatestEntry();
    if (last) {
      setResult({ latexCode: last.latexCode });
      hasRestored.current = true;
    }
  }, [getLatestEntry]);

  // Handle history item selection
  const handleSelectHistory = useCallback((item: HistoryItem) => {
    setResult({ latexCode: item.latexCode });
    // Scroll to result after selection
    setTimeout(() => {
      resultRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  }, []);

  // Animate result panel on appearance — dramatic slide-in with 3D perspective
  useEffect(() => {
    if (result && resultRef.current) {
      const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (prefersReduced) {
        resultRef.current.scrollIntoView({ behavior: 'smooth' });
        return;
      }

      const isDesktop = window.innerWidth >= 1024;
      gsap.fromTo(resultRef.current,
        { opacity: 0, x: isDesktop ? 50 : 0, y: isDesktop ? 0 : 40, scale: 0.92, filter: 'blur(8px)', rotateY: isDesktop ? -5 : 0 },
        { opacity: 1, x: 0, y: 0, scale: 1, filter: 'blur(0px)', rotateY: 0, duration: 0.8, ease: 'power4.out' }
      );

      // Auto-scroll to result
      resultRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [result && result.latexCode]);

  // Gradient border on input card during loading
  useEffect(() => {
    if (inputCardRef.current) {
      if (isLoading) {
        inputCardRef.current.classList.add('gradient-border', 'gradient-border--active');
      } else {
        inputCardRef.current.classList.remove('gradient-border--active');
        setTimeout(() => {
          inputCardRef.current?.classList.remove('gradient-border');
        }, 400);
      }
    }
  }, [isLoading]);

  // Error banner shake animation
  useEffect(() => {
    if (error && errorRef.current) {
      const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (prefersReduced) return;
      gsap.to(errorRef.current, {
        keyframes: [
          { x: -4, duration: 0.08 },
          { x: 4, duration: 0.08 },
          { x: -3, duration: 0.08 },
          { x: 3, duration: 0.08 },
          { x: 0, duration: 0.08 },
        ],
        ease: 'power2.out'
      });
    }
  }, [error]);

  // Online indicator
  useEffect(() => {
    const goOnline = () => setIsOnline(true);
    const goOffline = () => setIsOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  // Anti-flash
  useEffect(() => {
    const root = document.getElementById('root');
    if (root) root.style.opacity = '1';
  }, []);

  // Dismiss error
  const dismissError = useCallback(() => {
    const el = errorRef.current;
    if (!el) { setError(null); return; }
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReduced) { setError(null); return; }
    gsap.to(el, {
      opacity: 0, y: -10, height: 0, marginTop: 0, padding: 0,
      duration: 0.3, ease: 'power2.in',
      onComplete: () => setError(null),
    });
  }, []);

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

  const handleGenerate = useCallback(async (userQuestion: string, contextFile?: ContextFile, removePlagiarism: boolean = false, coverPage?: CoverPageConfig, temperature: number = 0.5) => {
    if (!userQuestion.trim()) {
      setError("Please enter an assignment question.");
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setIsLoading(true);
    setResult({ latexCode: '' });
    setError(null);
    lastGenerateRequestRef.current = {
      userQuestion,
      contextFile,
      removePlagiarism,
      coverPage,
      temperature,
    };

    try {
      setLoadingMessage(contextFile ? "Analyzing context..." : "Generating response...");
      const parsedResponse = await geminiService.generateLatex(
        userQuestion,
        contextFile,
        removePlagiarism,
        controller.signal,
        temperature,
      );

      let latex = parsedResponse.latex;

      if (coverPage?.enabled) {
        try {
          latex = injectCoverPage(latex, coverPage);
        } catch (coverErr) {
          console.error("Cover page injection failed:", coverErr);
          // Fallback to original latex_code so we don't return a blank screen
        }
      }

      setResult({
        latexCode: latex,
      });

      // Add to history
      addEntry(userQuestion, latex);
      showToast('Assignment saved to history', 'success');

    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') {
        setError('Generation cancelled.');
      } else {
        console.error(err);
        setError(err instanceof Error ? err.message : "An unexpected error occurred.");
      }
      setResult(null);
    } finally {
      setIsLoading(false);
      setLoadingMessage('');
      abortRef.current = null;
    }
  }, [addEntry, showToast]);

  const handleCancel = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const handleRetry = useCallback(() => {
    const last = lastGenerateRequestRef.current;
    if (!last || isLoading) return;
    void handleGenerate(
      last.userQuestion,
      last.contextFile,
      last.removePlagiarism,
      last.coverPage,
      last.temperature,
    );
  }, [handleGenerate, isLoading]);

  const handleLatexUpdate = useCallback((newLatex: string) => {
    setResult((prev) => {
      if (!prev) return prev;
      return { ...prev, latexCode: newLatex, pdfBlob: undefined };
    });
  }, []);

  const handlePdfCompiled = useCallback((pdfBlob: Blob) => {
    setResult((prev) => {
      if (!prev) return prev;
      return { ...prev, pdfBlob };
    });
  }, []);

  const hasResult = (result !== null && result.latexCode !== undefined) || isLoading;

  return (
    <div className="relative min-h-screen w-full text-txt-primary font-sans overflow-x-hidden selection:bg-accent selection:text-white">
      <ParticleField />

      <HistorySidebar
        isOpen={isHistoryOpen}
        onClose={() => setIsHistoryOpen(false)}
        history={history}
        onSelectItem={handleSelectHistory}
        onClearHistory={clearHistory}
        onDeleteEntry={deleteEntry}
      />

      {/* Floating Decorative Chips — ARC Club-style */}
      {!hasResult && (
        <div ref={chipsRef} className="fixed inset-0 z-[5] pointer-events-none hidden lg:block">
          {FLOATING_CHIPS.map((chip, i) => (
            <div
              key={i}
              className={`floating-chip absolute ${chip.position} opacity-0`}
            >
              <div className="bg-surface/80 backdrop-blur-sm border border-border rounded-lg px-3 py-2 flex items-center gap-2 shadow-soft">
                <span className="text-accent text-xs">{chip.icon}</span>
                <span className="text-[10px] text-txt-muted font-mono">{chip.label}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Surprise Overlay (Easter egg) */}
      {showSurprise && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-bg/95 backdrop-blur-xl animate-fade-in text-center select-none">
          <h2 className="text-7xl sm:text-8xl font-heading font-bold text-txt-heading tracking-tight mb-4">
            ARC CLUB
          </h2>
          <p className="text-txt-muted text-sm tracking-[0.3em] border-t border-border pt-4">Innovation Hub</p>
        </div>
      )}

      <div className="relative z-10 min-h-screen flex flex-col">

  {/* Header Controls */ }
  <div ref={headerRef} className="fixed top-4 right-4 sm:right-6 lg:right-8 z-30 flex items-center gap-3 sm:gap-4 opacity-0">
    <button
      onClick={() => setIsHistoryOpen(true)}
      className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-surface/40 hover:bg-surface/60 border border-border/40 hover:border-accent/30 transition-all text-[11px] text-txt-muted hover:text-txt-primary"
    >
      <HistoryIcon className="w-3.5 h-3.5" />
      <span className="hidden xs:inline">History</span>
    </button>

    <div className="flex items-center gap-2">
      <span className="text-[11px] text-txt-muted font-mono cursor-pointer select-none" onClick={handleLogoClick}>ARC Club</span>
      <div className={`w-1.5 h-1.5 rounded-full animate-soft-pulse ${isOnline ? 'bg-success' : 'bg-error'}`} title={isOnline ? 'Online' : 'Offline'} />
    </div>
  </div>

        {/* Main Content */}
        <main ref={mainRef} className="flex-1 w-full opacity-0">
          <div className={`max-w-[90rem] mx-auto px-4 sm:px-6 lg:px-8 py-8 transition-all duration-500 ${hasResult
            ? 'lg:grid lg:grid-cols-[2fr_3fr] lg:gap-6 lg:items-start'
            : 'flex flex-col items-center'
            }`}>

            {/* Hero Title — with magnetic effect and accent divider */}
            <div
              ref={heroAreaRef}
              onMouseMove={handleHeroMouseMove}
              onMouseLeave={handleHeroMouseLeave}
              className={`w-full text-center ${hasResult ? 'lg:col-span-2 mb-4' : 'max-w-3xl mb-10'}`}
            >
              <div ref={heroRef} className="opacity-0">
                <h1
                  className={`font-heading font-bold tracking-tight text-txt-primary ${hasResult ? 'text-2xl sm:text-3xl' : 'text-4xl sm:text-5xl'}`}
                  style={{
                    transform: `translate(${titleTransform.x}px, ${titleTransform.y}px)`,
                    transition: 'transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)',
                  }}
                >
                  Auto<span className="text-accent animate-glow-pulse">Access</span>
                </h1>
                {!hasResult && (
                  <>
                    {/* Accent divider — ARC-style draw-in */}
                    <div ref={dividerRef} className="mx-auto mt-4 mb-3 w-16 h-[2px] bg-gradient-to-r from-transparent via-accent to-transparent" style={{ transformOrigin: 'center' }} />
                    <p className="text-sm sm:text-base text-txt-secondary font-light leading-relaxed max-w-md mx-auto">
                      AI-powered assignment generation — clean, structured, and ready to submit.
                    </p>
                  </>
                )}
              </div>
            </div>

            {/* Input Panel */}
            <div className={`${hasResult ? 'w-full' : 'w-full max-w-3xl'}`}>
              <div ref={inputCardRef} className="card tilt-card p-6 sm:p-8 rounded-2xl shadow-soft">
                <QuestionForm onSubmit={handleGenerate} onCancel={handleCancel} isLoading={isLoading} loadingMessage={loadingMessage} />

                {error && (
                  <div ref={errorRef} role="alert" aria-live="assertive" className="mt-6 p-4 rounded-xl bg-error/5 border border-error/20 text-error flex items-center gap-3 animate-fade-in">
                    <div className="w-1.5 h-1.5 rounded-full bg-error shrink-0" />
                    <div className="text-sm flex-1">{error}</div>
                    {lastGenerateRequestRef.current && !isLoading && (
                      <button onClick={handleRetry} className="text-xs px-2.5 py-1 rounded-md border border-error/20 hover:border-error/40 hover:bg-error/5 transition-colors shrink-0" aria-label="Retry generation">Retry</button>
                    )}
                    <button onClick={dismissError} className="text-error/60 hover:text-error transition-colors text-xs ml-auto shrink-0" aria-label="Dismiss error">✕</button>
                  </div>
                )}
              </div>
            </div>

            {/* Output Panel */}
            {hasResult && (
              <div ref={resultRef} className="w-full mt-6 lg:mt-0">
                <div className="card p-6 sm:p-8 rounded-2xl shadow-soft">
                  <ResultDisplay
                    result={result || {}}
                    isLoading={isLoading}
                    onLatexChange={handleLatexUpdate}
                    onPdfCompiled={handlePdfCompiled}
                    showToast={showToast}
                  />
                </div>
              </div>
            )}
          </div>
        </main>

        {/* Global Toast */}
        {toast && (
          <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[100] animate-fade-in">
            <div className={`px-4 py-2.5 rounded-xl border shadow-xl flex items-center gap-2.5 backdrop-blur-md ${
              toast.type === 'success' 
              ? 'bg-success/10 border-success/20 text-success' 
              : toast.type === 'error'
              ? 'bg-error/10 border-error/20 text-error'
              : 'bg-surface/80 border-border text-txt-primary'
            }`}>
              {toast.type === 'success' && <div className="w-1.5 h-1.5 rounded-full bg-success"></div>}
              <span className="text-xs font-medium">{toast.message}</span>
            </div>
          </div>
        )}

        {/* Footer */}
        <footer ref={footerRef} className="w-full text-center py-6 text-xs text-txt-muted flex items-center justify-center gap-2 opacity-0">
          <ZapIcon className="w-3 h-3 text-accent/40" />
          <span>ARC Club</span>
        </footer>
      </div>
    </div>
  );
};

export default App;
