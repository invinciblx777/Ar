'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Section, fetchSections } from '../lib/sections';

interface SectionSelectorProps {
    onSelect: (section: Section) => void;
    selected: Section | null;
}

export default function SectionSelector({
    onSelect,
    selected,
}: SectionSelectorProps) {
    const [sections, setSections] = useState<Section[]>([]);
    const [isOpen, setIsOpen] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const dropdownRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        fetchSections().then((data) => {
            setSections(data);
            setIsLoading(false);
        });
    }, []);

    useEffect(() => {
        function handleClickOutside(e: MouseEvent) {
            if (
                dropdownRef.current &&
                !dropdownRef.current.contains(e.target as Node)
            ) {
                setIsOpen(false);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    return (
        <motion.div
            ref={dropdownRef}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.5 }}
            className="relative w-full max-w-sm mx-auto"
        >
            <label className="block text-xs uppercase tracking-widest text-white/40 mb-2 text-center">
                Select Destination
            </label>

            {/* Trigger button */}
            <button
                onClick={() => !isLoading && setIsOpen(!isOpen)}
                disabled={isLoading}
                className="glass-card w-full px-5 py-4 flex items-center justify-between text-left transition-all
                   hover:border-[var(--accent)]/30 focus:outline-none focus:border-[var(--accent)]/50"
            >
                <span className={selected ? 'text-white' : 'text-white/40'}>
                    {isLoading
                        ? 'Loading sections...'
                        : selected
                            ? selected.name
                            : 'Choose a section'}
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

            {/* Dropdown */}
            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ opacity: 0, y: -8, scale: 0.96 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -8, scale: 0.96 }}
                        transition={{ duration: 0.2 }}
                        className="absolute top-full left-0 right-0 mt-2 glass-card overflow-hidden z-50 max-h-60 overflow-y-auto"
                    >
                        {sections.map((section) => (
                            <button
                                key={section.id}
                                onClick={() => {
                                    onSelect(section);
                                    setIsOpen(false);
                                }}
                                className={`w-full px-5 py-3.5 text-left transition-all flex items-center justify-between
                  hover:bg-white/5 ${selected?.id === section.id
                                        ? 'text-[var(--accent)] bg-white/5'
                                        : 'text-white/70'
                                    }`}
                            >
                                <span className="flex items-center gap-2">
                                    {section.icon && <span>{section.icon}</span>}
                                    {section.name}
                                </span>
                            </button>
                        ))}
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    );
}
