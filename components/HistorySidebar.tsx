
import React, { useEffect, useRef } from 'react';
import gsap from 'gsap';
import { TrashIcon, ClockIcon, ReplyIcon } from './icons';
import type { HistoryItem } from '../types';

interface HistorySidebarProps {
  isOpen: boolean;
  onClose: () => void;
  history: HistoryItem[];
  onSelectItem: (item: HistoryItem) => void;
  onClearHistory: () => void;
  onDeleteEntry: (id: string) => void;
}

export const HistorySidebar: React.FC<HistorySidebarProps> = ({ 
  isOpen, 
  onClose, 
  history, 
  onSelectItem, 
  onClearHistory,
  onDeleteEntry
}) => {
  const sidebarRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const sidebar = sidebarRef.current;
    const overlay = overlayRef.current;
    if (!sidebar || !overlay) return;

    if (isOpen) {
      document.body.style.overflow = 'hidden';
      gsap.to(overlay, { opacity: 1, duration: 0.3, pointerEvents: 'auto' });
      gsap.fromTo(sidebar,
        { x: '100%' },
        { x: '0%', duration: 0.4, ease: 'power3.out' }
      );
    } else {
      document.body.style.overflow = '';
      gsap.to(overlay, { opacity: 0, duration: 0.3, pointerEvents: 'none' });
      gsap.to(sidebar, { x: '100%', duration: 0.4, ease: 'power3.in' });
    }
  }, [isOpen]);

  const formatTimestamp = (timestamp: string) => {
    const now = new Date();
    const then = new Date(timestamp);
    const diffMs = now.getTime() - then.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    const diffHrs = Math.floor(diffMin / 60);

    if (diffMin < 1) return 'Just now';
    if (diffMin < 60) return `${diffMin} min ago`;
    if (diffHrs < 24) return `${diffHrs} hr ago`;
    return then.toLocaleDateString();
  };

  const truncatePrompt = (text: string) => {
    return text.length > 65 ? text.substring(0, 62) + '...' : text;
  };

  const handleClearAll = () => {
    if (window.confirm('Clear all assignment history? This cannot be undone.')) {
      onClearHistory();
    }
  };

  return (
    <>
      {/* Overlay */}
      <div 
        ref={overlayRef}
        onClick={onClose}
        className="fixed inset-0 z-[60] bg-black/40 backdrop-blur-sm opacity-0 pointer-events-none transition-opacity"
      />

      {/* Sidebar Panel */}
      <div 
        ref={sidebarRef}
        className="fixed top-0 right-0 z-[70] h-full w-full sm:w-[320px] bg-surface border-l border-border shadow-2xl translate-x-full flex flex-col"
      >
        {/* Header */}
        <div className="p-6 border-b border-border flex items-center justify-between">
          <h2 className="text-lg font-heading font-semibold text-txt-primary">Recent Assignments</h2>
          <button 
            onClick={onClose}
            className="p-2 text-txt-muted hover:text-txt-primary transition-colors hover:bg-bg-secondary rounded-lg"
            aria-label="Close history"
          >
            ✕
          </button>
        </div>

        {/* List Content */}
        <div ref={contentRef} className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-2">
          {history.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-8">
              <div className="w-12 h-12 rounded-full bg-bg-secondary flex items-center justify-center mb-4 text-txt-muted/30">
                <ClockIcon className="w-6 h-6" />
              </div>
              <p className="text-sm text-txt-muted">No history yet.</p>
              <p className="text-[11px] text-txt-muted/60 mt-1">Generated assignments will appear here.</p>
            </div>
          ) : (
            history.map((item) => (
              <div 
                key={item.id}
                className="group relative bg-bg-secondary/40 border border-border/50 hover:border-accent/30 hover:bg-accent/[0.02] p-4 rounded-xl transition-all cursor-pointer"
                onClick={() => {
                  onSelectItem(item);
                  onClose();
                }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <p className="text-xs text-txt-primary font-medium leading-relaxed">
                      {truncatePrompt(item.question)}
                    </p>
                    <div className="flex items-center gap-2 mt-2">
                       <time className="text-[10px] text-txt-muted font-mono">{formatTimestamp(item.timestamp)}</time>
                    </div>
                  </div>
                </div>

                {/* Quick actions on hover */}
                <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button 
                        onClick={(e) => {
                            e.stopPropagation();
                            onDeleteEntry(item.id);
                        }}
                        className="p-1.5 text-txt-muted/40 hover:text-error hover:bg-error/5 rounded-md transition-all"
                        title="Delete entry"
                    >
                        <TrashIcon className="w-3.5 h-3.5" />
                    </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        {history.length > 0 && (
          <div className="p-4 border-t border-border bg-bg-secondary/20">
            <button 
              onClick={handleClearAll}
              className="w-full flex items-center justify-center gap-2 py-2.5 text-xs font-medium text-error hover:bg-error/5 border border-transparent hover:border-error/10 rounded-lg transition-all"
            >
              <TrashIcon className="w-3.5 h-3.5" />
              Clear assignment history
            </button>
          </div>
        )}
      </div>
    </>
  );
};
