'use client';

import { useState, useMemo } from 'react';
import type { Section } from '@/lib/sections';

interface DestinationSelectionUIProps {
    sections: Section[];
    onSelect: (section: Section) => void;
    onCancel?: () => void; // Optional if we are changing mid-session
}

export default function DestinationSelectionUI({
    sections,
    onSelect,
    onCancel,
}: DestinationSelectionUIProps) {
    const [searchQuery, setSearchQuery] = useState('');

    const filteredSections = useMemo(() => {
        const q = searchQuery.toLowerCase();
        return sections.filter((s) => {
            return (
                s.name.toLowerCase().includes(q) ||
                (s.category && s.category.toLowerCase().includes(q)) ||
                (s.description && s.description.toLowerCase().includes(q))
            );
        });
    }, [sections, searchQuery]);

    return (
        <div className="fixed inset-0 z-[100] bg-[#0d0d18]/95 backdrop-blur-xl flex flex-col pt-12">
            {/* Header */}
            <div className="px-6 pb-4 shrink-0 flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-semibold text-white tracking-tight">
                        Where to?
                    </h1>
                    <p className="text-sm text-white/50 mt-1">
                        Select a destination to start navigating
                    </p>
                </div>
                {onCancel && (
                    <button
                        onClick={onCancel}
                        className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10 transition-colors"
                    >
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M18 6L6 18M6 6l12 12" />
                        </svg>
                    </button>
                )}
            </div>

            {/* Search */}
            <div className="px-6 pb-6 shrink-0 border-b border-white/10">
                <div className="relative">
                    <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search stores, departments..."
                        className="w-full h-12 pl-12 pr-4 bg-white/5 border border-white/10 rounded-2xl text-white placeholder-white/40 focus:outline-none focus:border-accent/50 focus:bg-white/10 transition-all shadow-inner"
                        autoFocus
                    />
                </div>
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-2">
                {filteredSections.length === 0 ? (
                    <div className="text-center mt-12">
                        <p className="text-white/40">No results found for "{searchQuery}"</p>
                    </div>
                ) : (
                    filteredSections.map((section) => (
                        <button
                            key={section.id}
                            onClick={() => onSelect(section)}
                            className="w-full text-left p-4 rounded-2xl bg-white/5 hover:bg-white/10 border border-transparent hover:border-white/10 transition-all flex items-center gap-4 group"
                        >
                            <div className="w-12 h-12 shrink-0 rounded-full bg-accent/20 text-accent flex items-center justify-center text-xl shadow-inner group-hover:scale-110 transition-transform">
                                {section.icon || '📍'}
                            </div>
                            <div className="flex-1 min-w-0">
                                <h3 className="text-white font-medium truncate text-base">
                                    {section.name}
                                </h3>
                                {section.category && (
                                    <p className="text-white/40 text-sm truncate mt-0.5">
                                        {section.category}
                                    </p>
                                )}
                            </div>
                            <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center text-white/30 group-hover:text-white group-hover:bg-accent/20 transition-all shrink-0">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M5 12h14M12 5l7 7-7 7" />
                                </svg>
                            </div>
                        </button>
                    ))
                )}
            </div>
        </div>
    );
}
