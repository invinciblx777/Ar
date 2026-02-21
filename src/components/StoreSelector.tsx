'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';

interface StoreInfo {
    id: string;
    name: string;
    length_meters: number;
    width_meters: number;
}

export default function StoreSelector() {
    const [stores, setStores] = useState<StoreInfo[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedStore, setSelectedStore] = useState<StoreInfo | null>(null);
    const router = useRouter();

    useEffect(() => {
        async function loadStores() {
            try {
                const res = await fetch('/api/stores');
                const data = await res.json();
                if (data.stores && data.stores.length > 0) {
                    setStores(data.stores);
                    setSelectedStore(data.stores[0]);
                }
            } catch {
                // Fallback
                setStores([{ id: 'fallback', name: 'Demo Store', length_meters: 20, width_meters: 15 }]);
            }
            setLoading(false);
        }
        loadStores();
    }, []);

    function handleContinue() {
        if (!selectedStore) return;
        router.push(`/navigate?storeId=${selectedStore.id}`);
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center py-8">
                <div className="spinner" />
            </div>
        );
    }

    if (stores.length === 0) {
        return (
            <div className="text-center py-8 text-white/40 text-sm">
                No stores available. Contact the store administrator.
            </div>
        );
    }

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="w-full max-w-md mx-auto space-y-4"
        >
            <label className="text-xs text-white/50 uppercase tracking-wider font-medium">
                Select Your Store
            </label>

            <div className="space-y-2">
                {stores.map((store) => (
                    <button
                        key={store.id}
                        onClick={() => setSelectedStore(store)}
                        className={`w-full text-left p-4 rounded-xl border transition-all duration-200 ${
                            selectedStore?.id === store.id
                                ? 'border-[var(--accent)] bg-[var(--accent)]/10 shadow-lg shadow-[var(--accent)]/5'
                                : 'border-white/10 bg-white/5 hover:bg-white/8 hover:border-white/20'
                        }`}
                    >
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm font-semibold text-white">{store.name}</p>
                                <p className="text-xs text-white/40 mt-0.5">
                                    {store.length_meters}m x {store.width_meters}m
                                </p>
                            </div>
                            <AnimatePresence>
                                {selectedStore?.id === store.id && (
                                    <motion.div
                                        initial={{ scale: 0 }}
                                        animate={{ scale: 1 }}
                                        exit={{ scale: 0 }}
                                        className="w-5 h-5 rounded-full bg-[var(--accent)] flex items-center justify-center"
                                    >
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="3">
                                            <polyline points="20 6 9 17 4 12" />
                                        </svg>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                    </button>
                ))}
            </div>

            <button
                onClick={handleContinue}
                disabled={!selectedStore}
                className="w-full py-3 rounded-xl font-semibold text-sm transition-all duration-300 bg-[var(--accent)] text-black hover:shadow-lg hover:shadow-[var(--accent)]/25 disabled:opacity-30 disabled:cursor-not-allowed"
            >
                Continue to Navigation
            </button>
        </motion.div>
    );
}
