
import React, { useState, useCallback, useRef, useEffect } from 'react';
import gsap from 'gsap';
import { QuestionForm } from './components/QuestionForm';
import { ResultDisplay } from './components/ResultDisplay';
import { geminiService } from './services/geminiService';
import type { GenerationResult, GeminiLatexResponse, ContextFile, CoverPageConfig } from './types';
import { SparklesIcon } from './components/icons';
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
  const [titleText, setTitleText] = useState("AI Assignment Assistant");

  // Online status
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  // GSAP refs
  const headerRef = useRef<HTMLElement>(null);
  const mainRef = useRef<HTMLDivElement>(null);
  const footerRef = useRef<HTMLElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);
  const logoRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLSpanElement>(null);
  const inputCardRef = useRef<HTMLDivElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);

  // Page-load GSAP entrance — cinematic staggered reveal
  useEffect(() => {
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReduced) return;

    const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });

    // Header slides down with blur
    tl.fromTo(headerRef.current,
      { opacity: 0, y: -20, filter: 'blur(8px)' },
      { opacity: 1, y: 0, filter: 'blur(0px)', duration: 0.7 }
    )
    // Logo icon pops in with rotation
    .fromTo(logoRef.current,
      { opacity: 0, scale: 0, rotate: -180 },
      { opacity: 1, scale: 1, rotate: 0, duration: 0.6, ease: 'back.out(1.7)' },
      '-=0.3'
    )
    // Title text character reveal
    .add(() => {
      if (titleRef.current) {
        const text = titleRef.current.textContent || '';
        titleRef.current.innerHTML = text.split('').map(c =>
          c === ' ' ? ' ' : `<span class="char" style="display:inline-block;opacity:0;transform:translateY(12px)">${c}</span>`
        ).join('');
        gsap.to(titleRef.current.querySelectorAll('.char'), {
          opacity: 1, y: 0, duration: 0.4, stagger: 0.02, ease: 'power2.out'
        });
      }
    }, '-=0.2')
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

  // Magnetic cursor effect on logo — skip on touch devices
  useEffect(() => {
    const logo = logoRef.current;
    if (!logo) return;
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReduced) return;
    // Skip on touch-only devices to save resources
    if (!window.matchMedia('(pointer: fine)').matches) return;

    const handleMove = (e: MouseEvent) => {
      const rect = logo.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dx = e.clientX - cx;
      const dy = e.clientY - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const maxDist = 120;

      if (dist < maxDist) {
        const pull = (maxDist - dist) / maxDist;
        gsap.to(logo, { x: dx * pull * 0.3, y: dy * pull * 0.3, duration: 0.3, ease: 'power2.out' });
      } else {
        gsap.to(logo, { x: 0, y: 0, duration: 0.5, ease: 'elastic.out(1, 0.5)' });
      }
    };

    const handleLeave = () => {
      gsap.to(logo, { x: 0, y: 0, duration: 0.5, ease: 'elastic.out(1, 0.5)' });
    };

    window.addEventListener('mousemove', handleMove, { passive: true });
    logo.addEventListener('mouseleave', handleLeave);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      logo.removeEventListener('mouseleave', handleLeave);
    };
  }, []);

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
      // Subtle pulse feedback for intermediate clicks (1-4)
      if (newCount < 5 && logoRef.current) {
        const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (!prefersReduced) {
          gsap.to(logoRef.current, { scale: 1.15, duration: 0.1, ease: 'power2.out', yoyo: true, repeat: 1 });
        }
      }
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
    setTitleText("Crafted by ARC Club");
    setTimeout(() => setTitleText("AI Assignment Assistant"), 2000);
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
        
        {/* Header — Sticky bar */}
        <header ref={headerRef} className="sticky top-0 z-30 w-full backdrop-blur-md bg-bg/85 border-b border-border opacity-0">
          <div className="max-w-[90rem] mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between">
            <div className="flex items-center gap-3 cursor-pointer" onClick={handleLogoClick}>
              <div ref={logoRef} className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center glow-accent btn-magnetic">
                <SparklesIcon className="w-4 h-4 text-white" />
              </div>
              <span
                ref={titleRef}
                onDoubleClick={handleTitleDoubleClick}
                className="text-sm font-heading font-semibold text-txt-primary select-none"
              >
                {titleText}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-[11px] text-txt-muted font-mono hidden sm:inline">ARC Club</span>
              <div className={`w-1.5 h-1.5 rounded-full animate-soft-pulse ${isOnline ? 'bg-success' : 'bg-error'}`} title={isOnline ? 'Online' : 'Offline'} />
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main ref={mainRef} className="flex-1 w-full opacity-0">
          <div className={`max-w-[90rem] mx-auto px-4 sm:px-6 lg:px-8 py-8 transition-all duration-500 ${
            hasResult
              ? 'lg:grid lg:grid-cols-[2fr_3fr] lg:gap-6 lg:items-start'
              : 'flex justify-center'
          }`}>
            
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
           <SparklesIcon className="w-3 h-3 text-accent/40" />
           <span>Powered by AI</span>
           <span className="text-txt-muted/30">·</span>
           <span>ARC Club</span>
        </footer>
      </div>
    </div>
  );
};

export default App;
