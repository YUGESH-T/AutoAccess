
import { useState, useCallback, useEffect } from 'react';
import type { HistoryItem } from '../types';

const STORAGE_KEY = 'aa_history_v1';
const MAX_HISTORY = 20;

export const useHistory = () => {
  const [history, setHistory] = useState<HistoryItem[]>([]);

  // Load history on mount
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        setHistory(JSON.parse(stored));
      } catch (err) {
        console.error('Failed to parse history:', err);
      }
    }
  }, []);

  // Save history to localStorage whenever it changes
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
    } catch (err) {
      console.error('Failed to save history to localStorage:', err);
      // Fail silently for now, as history is still in memory for the current session
    }
  }, [history]);

  const addEntry = useCallback((question: string, latexCode: string) => {
    setHistory((prev) => {
      // Prevent duplicate entries (check prompt of latest entry)
      if (prev.length > 0 && prev[0].question === question) {
        return prev;
      }

      const newItem: HistoryItem = {
        id: Date.now().toString() + Math.random().toString(36).substring(2, 9),
        timestamp: new Date().toISOString(),
        question,
        latexCode,
      };

      const nextHistory = [newItem, ...prev].slice(0, MAX_HISTORY);
      return nextHistory;
    });
  }, []);

  const deleteEntry = useCallback((id: string) => {
    setHistory((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const clearHistory = useCallback(() => {
    setHistory([]);
  }, []);

  const getLatestEntry = useCallback(() => {
    return history.length > 0 ? history[0] : null;
  }, [history]);

  return {
    history,
    addEntry,
    deleteEntry,
    clearHistory,
    getLatestEntry,
  };
};
