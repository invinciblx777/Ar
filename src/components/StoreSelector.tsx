'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '../lib/supabaseClient';

interface Store {
  id: string;
  name: string;
  length_meters: number;
  width_meters: number;
}

interface StoreSelectorProps {
  onSelect: (store: Store) => void;
  selected: Store | null;
}

export default function StoreSelector({ onSelect, selected }: StoreSelectorProps) {
  const [stores, setStores] = useState<Store[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    async function loadStores() {
      if (!supabase) {
        setIsLoading(false);
        return;
      }

      try {
        const { data, error } = await supabase
          .from('stores')
          .select('id, name, length_meters, width_meters')
          .order('name');

        if (!error && data) {
          setStores(data);
          if (data.length === 1) {
            onSelect(data[0]);
          }
        }
      } catch {
        console.error('[StoreSelector] Failed to load stores');
      } finally {
        setIsLoading(false);
      }
    }

    loadStores();
  }, []);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (stores.length <= 1 && !isLoading) {
    return null;
  }

  return (
    <motion.div
      ref={dropdownRef}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay: 0.3 }}
      className="relative w-full max-w-sm mx-auto mb-4"
    >
      <label className="block text-xs uppercase tracking-widest text-white/40 mb-2 text-center">
        Select Store
      </label>

      <button
        onClick={() => !isLoading && setIsOpen(!isOpen)}
        disabled={isLoading}
        className="glass-card w-full px-5 py-4 flex items-center justify-between text-left transition-all
           hover:border-[var(--accent)]/30 focus:outline-none focus:border-[var(--accent)]/50"
      >
        <span className={selected ? 'text-white' : 'text-white/40'}>
          {isLoading
            ? 'Loading stores...'
            : selected
              ? selected.name
              : 'Choose a store'}
        </span>
        <motion.svg
          animate={{ rotate: isOpen ? 180 : 0 }}
          transition={{ duration: 0.2 }}
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          className="text-white/40"
        >
          <path
            d="M4 6L8 10L12 6"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </motion.svg>
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.96 }}
            transition={{ duration: 0.2 }}
            className="absolute top-full left-0 right-0 mt-2 glass-card overflow-hidden z-50 max-h-60 overflow-y-auto"
          >
            {stores.map((store) => (
              <button
                key={store.id}
                onClick={() => {
                  onSelect(store);
                  setIsOpen(false);
                }}
                className={`w-full px-5 py-3.5 text-left transition-all flex items-center justify-between
                  hover:bg-white/5 ${selected?.id === store.id
                    ? 'text-[var(--accent)] bg-white/5'
                    : 'text-white/70'
                  }`}
              >
                <span className="flex items-center gap-3">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="opacity-50">
                    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                  </svg>
                  <span>{store.name}</span>
                </span>
                <span className="text-xs text-white/30">
                  {store.length_meters}×{store.width_meters}m
                </span>
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
