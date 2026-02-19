
import React, { useState, useCallback, useRef, useEffect } from 'react';
import gsap from 'gsap';
import { QuestionForm } from './components/QuestionForm';
import { ResultDisplay } from './components/ResultDisplay';
import { geminiService } from './services/geminiService';
import type { GenerationResult, GeminiLatexResponse, ContextFile, CoverPageConfig } from './types';
import { ZapIcon } from './components/icons';
import { injectCoverPage } from './utils/coverPage';
import ParticleField from './components/ParticleField';

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

  // Page-load GSAP entrance — cinematic staggered reveal
  useEffect(() => {
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReduced) return;

    const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });

    // ARC Club badge fades in
    tl.fromTo(headerRef.current,
      { opacity: 0 },
      { opacity: 1, duration: 0.5 }
    )
    // Hero title fades up
    .fromTo(heroRef.current,
      { opacity: 0, y: 18 },
      { opacity: 1, y: 0, duration: 0.7, ease: 'power2.out' },
      '-=0.3'
    )
    // Main content rises + scales
    .fromTo(mainRef.current,
      { opacity: 0, y: 30, scale: 0.96 },
      { opacity: 1, y: 0, scale: 1, duration: 0.6, ease: 'power2.out' },
      '-=0.5'
    )
    // Footer fades gently
    .fromTo(footerRef.current,
      { opacity: 0 },
      { opacity: 1, duration: 0.4 },
      '-=0.2'
    );

    return () => { tl.kill(); };
  }, []);

  // Animate result panel on appearance — dramatic slide-in
  useEffect(() => {
    if (result && resultRef.current) {
      const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (prefersReduced) return;

      const isDesktop = window.innerWidth >= 1024;
      gsap.fromTo(resultRef.current,
        { opacity: 0, x: isDesktop ? 40 : 0, y: isDesktop ? 0 : 30, scale: 0.95, filter: 'blur(6px)' },
        { opacity: 1, x: 0, y: 0, scale: 1, filter: 'blur(0px)', duration: 0.6, ease: 'power3.out' }
      );
    }
  }, [result]);

  // Gradient border on input card during loading
  useEffect(() => {
    if (inputCardRef.current) {
      if (isLoading) {
        inputCardRef.current.classList.add('gradient-border', 'gradient-border--active');
      } else {
        inputCardRef.current.classList.remove('gradient-border--active');
        // Remove gradient-border class after transition
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

  // Online indicator — listen to online/offline events
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

  // Anti-flash: reveal #root after React mounts
  useEffect(() => {
    const root = document.getElementById('root');
    if (root) root.style.opacity = '1';
  }, []);

  // Dismiss error with exit animation
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
    setResult({}); 
    setError(null);

    try {
      setLoadingMessage(contextFile ? "Analyzing context..." : "Generating response...");
      const latexResponseString = await geminiService.generateLatex(userQuestion, contextFile, removePlagiarism, controller.signal, temperature);
      
      let parsedResponse: GeminiLatexResponse;
      try {
        parsedResponse = JSON.parse(latexResponseString);
      } catch (e) {
        console.error("JSON Parse Error:", e, latexResponseString);
        throw new Error("Failed to parse response from AI.");
      }

      let { latex_code } = parsedResponse;

      if (coverPage?.enabled) {
        latex_code = injectCoverPage(latex_code, coverPage);
      }

      setResult({
        latexCode: latex_code,
      });

    } catch (err: any) {
      if (err.name === 'AbortError') {
        setError('Generation cancelled.');
      } else {
        console.error(err);
        setError(err.message || "An unexpected error occurred.");
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
        return { ...prev, latexCode: newLatex, pdfBlob: undefined };
    });
  }, []);

  const handlePdfCompiled = useCallback((pdfBlob: Blob) => {
    setResult((prev) => {
        if (!prev) return prev;
        return { ...prev, pdfBlob };
    });
  }, []);

  const hasResult = result !== null;

  return (
    <div className="relative min-h-screen w-full text-txt-primary font-sans overflow-x-hidden selection:bg-accent selection:text-white">
      <ParticleField />

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
        
        {/* ARC Club badge — top-right corner */}
        <div ref={headerRef} className="fixed top-4 right-4 sm:right-6 lg:right-8 z-30 flex items-center gap-2 opacity-0">
          <span className="text-[11px] text-txt-muted font-mono cursor-pointer select-none" onClick={handleLogoClick}>ARC Club</span>
          <div className={`w-1.5 h-1.5 rounded-full animate-soft-pulse ${isOnline ? 'bg-success' : 'bg-error'}`} title={isOnline ? 'Online' : 'Offline'} />
        </div>

        {/* Main Content */}
        <main ref={mainRef} className="flex-1 w-full opacity-0">
          <div className={`max-w-[90rem] mx-auto px-4 sm:px-6 lg:px-8 py-8 transition-all duration-500 ${
            hasResult
              ? 'lg:grid lg:grid-cols-[2fr_3fr] lg:gap-6 lg:items-start'
              : 'flex flex-col items-center'
          }`}>
            
            {/* Hero Title */}
            {!hasResult && (
              <div ref={heroRef} className="w-full max-w-3xl text-center mb-10 opacity-0">
                <h1 className="text-4xl sm:text-5xl font-heading font-bold tracking-tight text-txt-primary">
                  Auto<span className="text-accent">Access</span>
                </h1>
                <p className="mt-3 text-sm sm:text-base text-txt-secondary font-light leading-relaxed max-w-md mx-auto">
                  AI-powered assignment generation — clean, structured, and ready to submit.
                </p>
              </div>
            )}

            {/* Input Panel */}
            <div className={`${hasResult ? 'w-full' : 'w-full max-w-3xl'}`}>
              <div ref={inputCardRef} className="card tilt-card p-6 sm:p-8 rounded-2xl shadow-soft">
                <QuestionForm onSubmit={handleGenerate} onCancel={handleCancel} isLoading={isLoading} loadingMessage={loadingMessage} />
                
                {error && (
                  <div ref={errorRef} role="alert" aria-live="assertive" className="mt-6 p-4 rounded-xl bg-error/5 border border-error/20 text-error flex items-center gap-3 animate-fade-in">
                    <div className="w-1.5 h-1.5 rounded-full bg-error shrink-0" />
                    <div className="text-sm flex-1">{error}</div>
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
                    result={result} 
                    isLoading={isLoading} 
                    onLatexChange={handleLatexUpdate}
                    onPdfCompiled={handlePdfCompiled}
                  />
                </div>
              </div>
            )}
          </div>
        </main>

        {/* Footer */}
        <footer ref={footerRef} className="w-full text-center py-6 text-xs text-txt-muted flex items-center justify-center gap-2 opacity-0">
           <ZapIcon className="w-3 h-3 text-accent/40" />
           <span>Powered by AI</span>
           <span className="text-txt-muted/30">·</span>
           <span>ARC Club</span>
        </footer>
      </div>
    </div>
  );
};

export default App;
