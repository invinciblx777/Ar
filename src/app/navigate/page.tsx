'use client';

import { useState, useEffect, useMemo, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';

interface SectionInfo {
    id: string;
    name: string;
    node_id: string;
    icon: string | null;
    description?: string;
    category?: string;
}

interface StoreInfo {
    id: string;
    name: string;
    length_meters: number;
    width_meters: number;
}

const CATEGORY_ICONS: Record<string, string> = {
    general: '📍',
    billing: '💳',
    electronics: '📱',
    groceries: '🛒',
    clothing: '👕',
    services: '🔧',
    food: '🍕',
    health: '💊',
};

function NavigatePageContent() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const storeId = searchParams.get('storeId');

    const [store, setStore] = useState<StoreInfo | null>(null);
    const [sections, setSections] = useState<SectionInfo[]>([]);
    const [versionId, setVersionId] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

    useEffect(() => {
        if (!storeId) {
            router.push('/');
            return;
        }

        async function loadStore() {
            try {
                const res = await fetch(`/api/stores?id=${storeId}`);
                const data = await res.json();
                if (data.store) {
                    setStore(data.store);
                    setSections(data.sections || []);
                    setVersionId(data.versionId || null);
                }
            } catch {
                console.error('Failed to load store');
            }
            setLoading(false);
        }

        loadStore();
    }, [storeId, router]);

    // Get unique categories
    const categories = useMemo(() => {
        const cats = new Set(sections.map((s) => s.category || 'general'));
        return Array.from(cats).sort();
    }, [sections]);

    // Filter sections
    const filteredSections = useMemo(() => {
        let filtered = sections;
        if (selectedCategory) {
            filtered = filtered.filter(
                (s) => (s.category || 'general') === selectedCategory
            );
        }
        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase();
            filtered = filtered.filter(
                (s) =>
                    s.name.toLowerCase().includes(q) ||
                    (s.description || '').toLowerCase().includes(q) ||
                    (s.category || '').toLowerCase().includes(q)
            );
        }
        return filtered;
    }, [sections, searchQuery, selectedCategory]);

    function handleSelectSection(section: SectionInfo) {
        // Navigate to AR view with store and section context
        const params = new URLSearchParams({
            section: section.id,
            storeId: storeId!,
        });
        router.push(`/ar?${params.toString()}`);
    }

    function handleScanQR() {
        // Go directly to AR with QR scan mode
        const params = new URLSearchParams({
            storeId: storeId!,
            scanFirst: 'true',
        });
        router.push(`/ar?${params.toString()}`);
    }

    if (loading) {
        return (
            <main className="min-h-screen gradient-mesh flex items-center justify-center">
                <div className="flex flex-col items-center gap-4">
                    <div className="spinner" />
                    <p className="text-white/40 text-sm">Loading store...</p>
                </div>
            </main>
        );
    }

    if (!store) {
        return (
            <main className="min-h-screen gradient-mesh flex items-center justify-center">
                <div className="text-center">
                    <p className="text-white/60 mb-4">Store not found</p>
                    <button
                        onClick={() => router.push('/')}
                        className="px-6 py-2 rounded-lg bg-white/10 text-white text-sm"
                    >
                        Go Back
                    </button>
                </div>
            </main>
        );
    }

    return (
        <main className="min-h-screen gradient-mesh">
            {/* Header */}
            <header className="sticky top-0 z-20 bg-black/50 backdrop-blur-xl border-b border-white/10">
                <div className="px-4 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => router.push('/')}
                            className="text-white/40 hover:text-white transition-colors"
                        >
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <polyline points="15 18 9 12 15 6" />
                            </svg>
                        </button>
                        <div>
                            <h1 className="text-sm font-semibold text-white">{store.name}</h1>
                            <p className="text-[10px] text-white/30">Select your destination</p>
                        </div>
                    </div>
                    <button
                        onClick={handleScanQR}
                        className="px-3 py-1.5 rounded-lg bg-[var(--accent)]/15 border border-[var(--accent)]/30 text-[var(--accent)] text-xs font-medium"
                    >
                        📷 Scan QR
                    </button>
                </div>

                {/* Search */}
                <div className="px-4 pb-3">
                    <div className="relative">
                        <svg
                            className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30"
                            width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                        >
                            <circle cx="11" cy="11" r="8" />
                            <line x1="21" y1="21" x2="16.65" y2="16.65" />
                        </svg>
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Search sections..."
                            className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-sm text-white placeholder-white/25 outline-none focus:border-[var(--accent)]/40 transition-colors"
                        />
                    </div>
                </div>

                {/* Category filters */}
                {categories.length > 1 && (
                    <div className="px-4 pb-3 flex gap-2 overflow-x-auto scrollbar-hide">
                        <button
                            onClick={() => setSelectedCategory(null)}
                            className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-all ${
                                selectedCategory === null
                                    ? 'bg-[var(--accent)]/20 text-[var(--accent)] border border-[var(--accent)]/40'
                                    : 'bg-white/5 text-white/50 border border-white/10 hover:bg-white/10'
                            }`}
                        >
                            All
                        </button>
                        {categories.map((cat) => (
                            <button
                                key={cat}
                                onClick={() => setSelectedCategory(cat === selectedCategory ? null : cat)}
                                className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-all capitalize ${
                                    selectedCategory === cat
                                        ? 'bg-[var(--accent)]/20 text-[var(--accent)] border border-[var(--accent)]/40'
                                        : 'bg-white/5 text-white/50 border border-white/10 hover:bg-white/10'
                                }`}
                            >
                                {CATEGORY_ICONS[cat] || '📍'} {cat}
                            </button>
                        ))}
                    </div>
                )}
            </header>

            {/* Section List */}
            <div className="px-4 py-4 space-y-2">
                {/* Start at Entrance option */}
                <motion.button
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    onClick={() => {
                        const params = new URLSearchParams({
                            storeId: storeId!,
                            startAtEntrance: 'true',
                        });
                        router.push(`/ar?${params.toString()}`);
                    }}
                    className="w-full p-4 rounded-xl bg-green-500/10 border border-green-500/20 hover:bg-green-500/15 transition-all text-left"
                >
                    <div className="flex items-center gap-3">
                        <span className="text-2xl">🚪</span>
                        <div>
                            <p className="text-sm font-semibold text-green-400">Start at Entrance</p>
                            <p className="text-xs text-white/40 mt-0.5">
                                Begin navigation without scanning QR
                            </p>
                        </div>
                    </div>
                </motion.button>

                <AnimatePresence mode="popLayout">
                    {filteredSections.map((section, index) => (
                        <motion.button
                            key={section.id}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            transition={{ delay: index * 0.03 }}
                            onClick={() => handleSelectSection(section)}
                            className="w-full p-4 rounded-xl bg-white/5 border border-white/10 hover:bg-white/8 hover:border-white/20 transition-all text-left group"
                        >
                            <div className="flex items-center gap-3">
                                <span className="text-2xl group-hover:scale-110 transition-transform">
                                    {section.icon || CATEGORY_ICONS[section.category || 'general'] || '📍'}
                                </span>
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-semibold text-white">{section.name}</p>
                                    {section.description && (
                                        <p className="text-xs text-white/40 mt-0.5 truncate">
                                            {section.description}
                                        </p>
                                    )}
                                    {section.category && section.category !== 'general' && (
                                        <span className="inline-block mt-1 px-2 py-0.5 rounded-full bg-white/5 text-[10px] text-white/30 capitalize">
                                            {section.category}
                                        </span>
                                    )}
                                </div>
                                <svg
                                    className="text-white/20 group-hover:text-[var(--accent)] transition-colors shrink-0"
                                    width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                                >
                                    <polyline points="9 18 15 12 9 6" />
                                </svg>
                            </div>
                        </motion.button>
                    ))}
                </AnimatePresence>

                {filteredSections.length === 0 && searchQuery && (
                    <div className="text-center py-12 text-white/30 text-sm">
                        No sections match &quot;{searchQuery}&quot;
                    </div>
                )}

                {sections.length === 0 && (
                    <div className="text-center py-12 text-white/30 text-sm">
                        No sections available for this store yet.
                    </div>
                )}
            </div>
        </main>
    );
}

export default function NavigatePage() {
    return (
        <Suspense fallback={<div className="min-h-screen gradient-mesh" />}>
            <NavigatePageContent />
        </Suspense>
    );
}
